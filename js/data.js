/* ============================================
   Data Layer — CSV Parsing, State & Roles
   Per-app RW/RO, Notes, Messages
   ============================================ */
const DataManager = (() => {
    let machines = [];
    let schedules = {};
    let users = [];
    let currentUser = null;
    let notes = {};
    let systemMessages = [];

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
    // User & Roles (per-app RW/RO)
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

    // Check if user is globally read-only (role = Read-Only)
    function isReadOnly() {
        return currentUser && currentUser.role === 'Read-Only';
    }

    // Per-app permission: 'rw', 'ro', or null (no access)
    function getAppPermission(appName) {
        if (!currentUser) return null;
        if (currentUser.role === 'Admin') return 'rw';
        if (currentUser.role === 'Read-Only') {
            const apps = currentUser.applications;
            if (Array.isArray(apps) && apps.includes('*')) return 'ro';
            if (typeof apps === 'object' && !Array.isArray(apps)) {
                return apps[appName] ? 'ro' : null;
            }
            return 'ro';
        }

        const apps = currentUser.applications;
        // Array format (legacy): ["*"] or ["App1", "App2"]
        if (Array.isArray(apps)) {
            if (apps.includes('*')) return currentUser.role === 'Read-Only' ? 'ro' : 'rw';
            return apps.includes(appName) ? 'rw' : null;
        }
        // Object format: { "App1": "rw", "App2": "ro" }
        if (typeof apps === 'object' && apps !== null) {
            return apps[appName] || null;
        }
        return null;
    }

    function canAccessApp(appName) {
        return getAppPermission(appName) !== null;
    }

    function isAppReadOnly(appName) {
        const perm = getAppPermission(appName);
        return perm === 'ro';
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

    function isGlobalReadOnly() {
        if (!currentUser || currentUser.role !== 'Read-Only') return false;
        const apps = currentUser.applications;
        return Array.isArray(apps) && apps.includes('*');
    }

    function canViewVMList() {
        if (!currentUser) return false;
        if (currentUser.role === 'Admin') return true;
        if (isGlobalReadOnly()) return true;
        const apps = currentUser.applications;
        if (typeof apps === 'object' && !Array.isArray(apps) && apps['lista_server']) return true;
        return false;
    }

    function getVMListMachines() {
        if (!currentUser) return [];
        if (currentUser.role === 'Admin' || isGlobalReadOnly()) return [...machines];
        return machines.filter(m => canAccessApp(m.application));
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
                loadNotesFromStorage();
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
            loadNotesFromStorage();
            return machines;
        } catch (err) {
            console.error('Failed to load CSV:', err);
            return [];
        }
    }

    // ============================================
    // System Messages
    // ============================================
    async function loadMessages() {
        try {
            const response = await fetch('data/messages.json');
            const data = await response.json();
            systemMessages = data.messages || [];
        } catch (e) {
            console.warn('Could not load messages.json', e);
            systemMessages = [];
        }
        return systemMessages;
    }

    function getMessages() {
        const now = new Date();
        const userId = currentUser ? currentUser.id : null;
        return systemMessages.filter(m => {
            // Check expiry
            if (m.expires && new Date(m.expires) < now) return false;
            // Check target
            if (m.target === '*') return true;
            if (Array.isArray(m.target)) return m.target.includes(userId);
            return false;
        });
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
            for (const pair of pairs) {
                const dynKey = DynamoService.appEnvKey(pair.app, pair.env);
                if (items[dynKey]) {
                    DynamoService.mergeIntoSchedules(schedules, pair.app, pair.env, items[dynKey]);
                }
            }
            saveSchedulesToStorage();
        } else {
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
        const groupId = generateId();
        getMachines(appName, envName).forEach(m => {
            addScheduleEntry(appName, envName, m.hostname, { ...entry, envGroupId: groupId });
        });
        return groupId;
    }

    function getEnvGroups(appName, envName) {
        const ms = getMachines(appName, envName);
        const groups = {};
        ms.forEach(m => {
            const entries = getScheduleEntries(appName, envName, m.hostname);
            entries.forEach(e => {
                if (e.envGroupId) {
                    if (!groups[e.envGroupId]) {
                        groups[e.envGroupId] = { groupId: e.envGroupId, entry: { ...e }, hostnames: [], totalMachines: ms.length };
                    }
                    groups[e.envGroupId].hostnames.push(m.hostname);
                }
            });
        });
        return Object.values(groups);
    }

    function updateEnvGroup(appName, envName, groupId, newEntryData) {
        const ms = getMachines(appName, envName);
        ms.forEach(m => {
            const key = scheduleKey(appName, envName, m.hostname);
            const entries = schedules[key] || [];
            const idx = entries.findIndex(e => e.envGroupId === groupId);
            if (idx !== -1) {
                entries[idx] = { ...newEntryData, id: entries[idx].id, envGroupId: groupId };
            }
        });
        saveSchedulesToStorage();
    }

    function removeEnvGroup(appName, envName, groupId) {
        const ms = getMachines(appName, envName);
        ms.forEach(m => {
            const key = scheduleKey(appName, envName, m.hostname);
            if (schedules[key]) {
                schedules[key] = schedules[key].filter(e => e.envGroupId !== groupId);
                if (schedules[key].length === 0) delete schedules[key];
            }
        });
        saveSchedulesToStorage();
    }

    function excludeFromEnvGroup(appName, envName, hostname, groupId) {
        const key = scheduleKey(appName, envName, hostname);
        if (schedules[key]) {
            schedules[key] = schedules[key].filter(e => e.envGroupId !== groupId);
            if (schedules[key].length === 0) delete schedules[key];
        }
        saveSchedulesToStorage();
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

    // ============================================
    // Notes (per server)
    // ============================================
    function loadNotesFromStorage() {
        try {
            const saved = localStorage.getItem('shutdownScheduler_notes');
            if (saved) notes = JSON.parse(saved);
        } catch (e) { notes = {}; }
    }

    function saveNotesToStorage() {
        try { localStorage.setItem('shutdownScheduler_notes', JSON.stringify(notes)); }
        catch (e) { console.warn('Could not save notes', e); }
    }

    function getNotes(hostname) {
        return notes[hostname] || [];
    }

    function addNote(hostname, text) {
        if (!notes[hostname]) notes[hostname] = [];
        const note = {
            id: generateId(),
            text,
            timestamp: new Date().toISOString(),
            user: currentUser ? currentUser.name : 'Sistema'
        };
        notes[hostname].push(note);
        saveNotesToStorage();
        return note;
    }

    function updateNote(hostname, noteId, text) {
        if (!notes[hostname]) return;
        const note = notes[hostname].find(n => n.id === noteId);
        if (note) {
            note.text = text;
            note.editedAt = new Date().toISOString();
            saveNotesToStorage();
        }
    }

    function deleteNote(hostname, noteId) {
        if (!notes[hostname]) return;
        notes[hostname] = notes[hostname].filter(n => n.id !== noteId);
        if (notes[hostname].length === 0) delete notes[hostname];
        saveNotesToStorage();
    }

    function getAllNotesCount() {
        return Object.values(notes).reduce((sum, arr) => sum + arr.length, 0);
    }

    // ============================================
    // Export & Stats
    // ============================================
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
        const allApps = getApplications(true);
        return {
            applications: apps.length,
            allApplications: allApps.length,
            environments: apps.reduce((sum, a) => sum + a.envCount, 0),
            totalMachines: machines.length,
            accessibleMachines: apps.reduce((sum, a) => sum + a.machineCount, 0),
            scheduledMachines: Object.keys(schedules).length,
            totalSchedules: Object.values(schedules).reduce((sum, arr) => sum + arr.length, 0),
            notesCount: getAllNotesCount()
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

    // Upcoming schedules (this week)
    function getUpcomingSchedules(daysAhead = 7) {
        const upcoming = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endDate = new Date(today);
        endDate.setDate(endDate.getDate() + daysAhead);

        for (const [key, entries] of Object.entries(schedules)) {
            const [app, env, hostname] = key.split('|');
            entries.forEach(entry => {
                if (entry.recurring && entry.recurring !== 'none') {
                    upcoming.push({ app, env, hostname, entry, recurring: true });
                } else if (entry.dates) {
                    const futureDates = entry.dates.filter(d => {
                        const date = new Date(d + 'T00:00:00');
                        return date >= today && date <= endDate;
                    });
                    if (futureDates.length > 0) {
                        upcoming.push({ app, env, hostname, entry, dates: futureDates });
                    }
                }
            });
        }
        return upcoming;
    }

    // ============================================
    // Cronjob Generation (per entry, per server)
    // ============================================
    function generateCronjobs(entries) {
        if (!entries || entries.length === 0) return [];
        return entries.map(entry => {
            const cj = { entryId: entry.id, type: entry.type, crons: [] };
            const [startH, startM] = entry.startTime ? entry.startTime.split(':').map(Number) : [0, 0];
            const [stopH, stopM] = entry.stopTime ? entry.stopTime.split(':').map(Number) : [0, 0];

            if (entry.recurring === 'daily') {
                if (entry.type === 'window') {
                    cj.crons.push({ action: 'startup', expression: `${startM} ${startH} * * *` });
                    cj.crons.push({ action: 'shutdown', expression: `${stopM} ${stopH} * * *` });
                } else {
                    cj.crons.push({ action: 'shutdown', expression: '0 0 * * *' });
                }
            } else if (entry.recurring === 'weekdays') {
                if (entry.type === 'window') {
                    cj.crons.push({ action: 'startup', expression: `${startM} ${startH} * * 1-5` });
                    cj.crons.push({ action: 'shutdown', expression: `${stopM} ${stopH} * * 1-5` });
                } else {
                    cj.crons.push({ action: 'shutdown', expression: '0 0 * * 1-5' });
                }
            } else if (entry.recurring === 'weekends') {
                if (entry.type === 'window') {
                    cj.crons.push({ action: 'startup', expression: `${startM} ${startH} * * 0,6` });
                    cj.crons.push({ action: 'shutdown', expression: `${stopM} ${stopH} * * 0,6` });
                } else {
                    cj.crons.push({ action: 'shutdown', expression: '0 0 * * 0,6' });
                }
            } else if (entry.dates && entry.dates.length > 0) {
                // Group dates by month for compact cron
                const byMonth = {};
                entry.dates.forEach(d => {
                    const parts = d.split('-').map(Number);
                    const key = `${parts[0]}-${parts[1]}`;
                    if (!byMonth[key]) byMonth[key] = { month: parts[1], days: [] };
                    byMonth[key].days.push(parts[2]);
                });
                for (const group of Object.values(byMonth)) {
                    const days = group.days.sort((a, b) => a - b).join(',');
                    if (entry.type === 'window') {
                        cj.crons.push({ action: 'startup', expression: `${startM} ${startH} ${days} ${group.month} *` });
                        cj.crons.push({ action: 'shutdown', expression: `${stopM} ${stopH} ${days} ${group.month} *` });
                    } else {
                        cj.crons.push({ action: 'shutdown', expression: `0 0 ${days} ${group.month} *` });
                    }
                }
            }
            return cj;
        });
    }

    return {
        loadFromFile, loadFromPath, loadUsers, loadFromDynamo, loadMessages,
        getUsers, setCurrentUser, getCurrentUser, isReadOnly, isAppReadOnly, getAppPermission,
        canAccessApp, getAccessibleAppEnvPairs,
        getApplications, getEnvironments, getMachines,
        getScheduleEntries, addScheduleEntry, updateScheduleEntry, removeScheduleEntry,
        removeAllSchedules, addEntryForEnv,
        exportSchedules, getAllSchedulesFlat, getStats, envHasSchedules, getEnvScheduleStats,
        getSchedulesRef, getMessages, getUpcomingSchedules,
        getNotes, addNote, updateNote, deleteNote, getAllNotesCount,
        getEnvGroups, updateEnvGroup, removeEnvGroup, excludeFromEnvGroup,
        isGlobalReadOnly, canViewVMList, getVMListMachines, generateCronjobs,
        get machines() { return machines; }
    };
})();
