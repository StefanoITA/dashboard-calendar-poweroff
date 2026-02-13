/* ============================================
   Data Layer — CSV Parsing, State & Roles
   ============================================ */
const DataManager = (() => {
    let machines = [];
    let schedules = {};
    let users = [];
    let currentUser = null;

    function parseCSV(text) {
        const lines = text.trim().split('\n');
        if (lines.length < 2) return [];
        const headers = lines[0].split(',').map(h => h.trim());
        const result = [];
        for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i]);
            if (values.length !== headers.length) continue;
            const obj = {};
            headers.forEach((h, idx) => { obj[h] = values[idx].trim(); });
            result.push(obj);
        }
        return result;
    }

    function parseCSVLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') { inQuotes = !inQuotes; }
            else if (ch === ',' && !inQuotes) { values.push(current); current = ''; }
            else { current += ch; }
        }
        values.push(current);
        return values;
    }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }

    // ============================================
    // User & Roles
    // ============================================
    async function loadUsers() {
        try {
            const response = await fetch('data/users.json');
            const data = await response.json();
            users = data.users || [];
        } catch (e) {
            console.warn('Could not load users.json, using defaults', e);
            users = [{ id: 'admin', name: 'Admin', role: 'Admin', applications: ['*'] }];
        }
        return users;
    }

    function getUsers() { return users; }

    function setCurrentUser(userId) {
        currentUser = users.find(u => u.id === userId) || null;
        if (currentUser) AuditLog.setUser(currentUser);
        return currentUser;
    }

    function getCurrentUser() { return currentUser; }

    function isReadOnly() {
        return currentUser && currentUser.role === 'Read-Only';
    }

    function canAccessApp(appName) {
        if (!currentUser) return false;
        if (currentUser.applications.includes('*')) return true;
        return currentUser.applications.includes(appName);
    }

    function getAccessibleAppEnvPairs() {
        const pairs = [];
        const apps = getApplications(true); // unfiltered
        apps.forEach(app => {
            if (!canAccessApp(app.name)) return;
            getEnvironments(app.name).forEach(env => {
                pairs.push({ app: app.name, env: env.name });
            });
        });
        return pairs;
    }

    // ============================================
    // Data Loading
    // ============================================
    async function loadFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                machines = parseCSV(e.target.result);
                loadSchedulesFromStorage();
                resolve(machines);
            };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    async function loadFromPath(path) {
        try {
            const response = await fetch(path);
            const text = await response.text();
            machines = parseCSV(text);
            loadSchedulesFromStorage();
            return machines;
        } catch (err) {
            console.error('Failed to load CSV:', err);
            return [];
        }
    }

    // ============================================
    // DynamoDB Integration
    // ============================================
    async function loadFromDynamo() {
        if (!DynamoService.CONFIG.enabled) return false;
        const pairs = getAccessibleAppEnvPairs();
        const keys = pairs.map(p => DynamoService.appEnvKey(p.app, p.env));
        if (keys.length === 0) return true;

        const items = await DynamoService.fetchAll(keys);
        if (!items) return false;

        // Check if DynamoDB has data
        let hasAnyData = false;
        for (const key of keys) {
            if (items[key] && Object.keys(items[key]).length > 0) {
                hasAnyData = true;
                break;
            }
        }

        if (hasAnyData) {
            // Load from DynamoDB into local schedules
            for (const pair of pairs) {
                const dynKey = DynamoService.appEnvKey(pair.app, pair.env);
                if (items[dynKey]) {
                    DynamoService.mergeIntoSchedules(schedules, pair.app, pair.env, items[dynKey]);
                }
            }
            saveSchedulesToStorage();
        } else {
            // DynamoDB is empty — push local state
            for (const pair of pairs) {
                const data = DynamoService.extractAppEnvData(schedules, pair.app, pair.env);
                if (Object.keys(data).length > 0) {
                    try {
                        await DynamoService.saveOne(
                            DynamoService.appEnvKey(pair.app, pair.env),
                            data,
                            currentUser ? currentUser.id : 'system'
                        );
                    } catch (e) { console.warn('Failed to push initial state:', e); }
                }
            }
        }

        DynamoService.takeSnapshot(schedules);
        return true;
    }

    // ============================================
    // Queries
    // ============================================
    function getApplications(unfiltered) {
        const apps = new Map();
        machines.forEach(m => {
            const app = m.application;
            if (!apps.has(app)) {
                apps.set(app, { name: app, envCount: 0, machineCount: 0, envs: new Set() });
            }
            const a = apps.get(app);
            a.envs.add(m.environment);
            a.envCount = a.envs.size;
            a.machineCount++;
        });
        let result = Array.from(apps.values());
        if (!unfiltered && currentUser) {
            result = result.filter(a => canAccessApp(a.name));
        }
        return result;
    }

    function getEnvironments(appName) {
        const envs = new Map();
        machines.filter(m => m.application === appName).forEach(m => {
            const env = m.environment;
            if (!envs.has(env)) envs.set(env, { name: env, machineCount: 0 });
            envs.get(env).machineCount++;
        });
        const order = ['Development', 'Integration', 'Bugfixing', 'Training', 'Pre-Produzione', 'Produzione'];
        return Array.from(envs.values()).sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
    }

    function getMachines(appName, envName) {
        return machines.filter(m => m.application === appName && m.environment === envName);
    }

    function scheduleKey(appName, envName, hostname) {
        return `${appName}|${envName}|${hostname}`;
    }

    function getScheduleEntries(appName, envName, hostname) {
        const key = scheduleKey(appName, envName, hostname);
        return schedules[key] || [];
    }

    function addScheduleEntry(appName, envName, hostname, entry) {
        const key = scheduleKey(appName, envName, hostname);
        if (!schedules[key]) schedules[key] = [];
        entry.id = generateId();
        schedules[key].push(entry);
        saveSchedulesToStorage();
        return entry.id;
    }

    function updateScheduleEntry(appName, envName, hostname, entryId, entry) {
        const key = scheduleKey(appName, envName, hostname);
        if (!schedules[key]) return;
        const idx = schedules[key].findIndex(e => e.id === entryId);
        if (idx !== -1) {
            entry.id = entryId;
            schedules[key][idx] = entry;
            saveSchedulesToStorage();
        }
    }

    function removeScheduleEntry(appName, envName, hostname, entryId) {
        const key = scheduleKey(appName, envName, hostname);
        if (!schedules[key]) return;
        schedules[key] = schedules[key].filter(e => e.id !== entryId);
        if (schedules[key].length === 0) delete schedules[key];
        saveSchedulesToStorage();
    }

    function removeAllSchedules(appName, envName, hostname) {
        delete schedules[scheduleKey(appName, envName, hostname)];
        saveSchedulesToStorage();
    }

    function addEntryForEnv(appName, envName, entry) {
        getMachines(appName, envName).forEach(m => {
            addScheduleEntry(appName, envName, m.hostname, { ...entry });
        });
    }

    function saveSchedulesToStorage() {
        try { localStorage.setItem('shutdownScheduler_schedules', JSON.stringify(schedules)); }
        catch (e) { console.warn('Could not save to localStorage', e); }
    }

    function loadSchedulesFromStorage() {
        try {
            const saved = localStorage.getItem('shutdownScheduler_schedules');
            if (saved) {
                const parsed = JSON.parse(saved);
                for (const key of Object.keys(parsed)) {
                    if (parsed[key] && !Array.isArray(parsed[key])) {
                        const old = parsed[key];
                        old.id = old.id || generateId();
                        parsed[key] = [old];
                    }
                }
                schedules = parsed;
            }
        } catch (e) { console.warn('Could not load from localStorage', e); }
    }

    function getSchedulesRef() { return schedules; }

    function exportSchedules() {
        const result = [];
        for (const [key, entries] of Object.entries(schedules)) {
            const [app, env, hostname] = key.split('|');
            const machine = machines.find(m => m.application === app && m.environment === env && m.hostname === hostname);
            entries.forEach(entry => {
                result.push({
                    application: app, environment: env,
                    machine_name: machine ? machine.machine_name : '',
                    hostname,
                    server_type: machine ? machine.server_type : '',
                    description: machine ? (machine.description || '') : '',
                    entry_id: entry.id,
                    schedule_type: entry.type,
                    recurring: entry.recurring || 'none',
                    start_time: entry.startTime || '',
                    stop_time: entry.stopTime || '',
                    dates: entry.dates || []
                });
            });
        }
        return result;
    }

    function getAllSchedulesFlat() {
        const result = [];
        for (const [key, entries] of Object.entries(schedules)) {
            const [app, env, hostname] = key.split('|');
            const machine = machines.find(m => m.application === app && m.environment === env && m.hostname === hostname);
            entries.forEach(entry => {
                result.push({ app, env, hostname, machine, entry });
            });
        }
        return result;
    }

    function getStats() {
        const apps = getApplications();
        return {
            applications: apps.length,
            environments: apps.reduce((sum, a) => sum + a.envCount, 0),
            totalMachines: machines.length,
            scheduledMachines: Object.keys(schedules).length
        };
    }

    function envHasSchedules(appName, envName) {
        return getMachines(appName, envName).some(m => {
            const entries = schedules[scheduleKey(appName, envName, m.hostname)];
            return entries && entries.length > 0;
        });
    }

    function getEnvScheduleStats(appName, envName) {
        const ms = getMachines(appName, envName);
        let scheduled = 0;
        ms.forEach(m => {
            const entries = schedules[scheduleKey(appName, envName, m.hostname)];
            if (entries && entries.length > 0) scheduled++;
        });
        return { total: ms.length, scheduled };
    }

    return {
        loadFromFile, loadFromPath, loadUsers, loadFromDynamo,
        getUsers, setCurrentUser, getCurrentUser, isReadOnly, canAccessApp, getAccessibleAppEnvPairs,
        getApplications, getEnvironments, getMachines,
        getScheduleEntries, addScheduleEntry, updateScheduleEntry, removeScheduleEntry,
        removeAllSchedules, addEntryForEnv,
        exportSchedules, getAllSchedulesFlat, getStats, envHasSchedules, getEnvScheduleStats,
        getSchedulesRef,
        get machines() { return machines; }
    };
})();
