/* ============================================
   Data Layer — CSV Parsing & State Management
   ============================================ */

const DataManager = (() => {
    let machines = [];
    let schedules = {};

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

    function getApplications() {
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
        return Array.from(apps.values());
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

    function getSchedule(appName, envName, hostname) {
        return schedules[scheduleKey(appName, envName, hostname)] || null;
    }

    function setSchedule(appName, envName, hostname, schedule) {
        schedules[scheduleKey(appName, envName, hostname)] = schedule;
        saveSchedulesToStorage();
    }

    function setScheduleForEnv(appName, envName, schedule) {
        getMachines(appName, envName).forEach(m => {
            schedules[scheduleKey(appName, envName, m.hostname)] = { ...schedule };
        });
        saveSchedulesToStorage();
    }

    function removeSchedule(appName, envName, hostname) {
        delete schedules[scheduleKey(appName, envName, hostname)];
        saveSchedulesToStorage();
    }

    function saveSchedulesToStorage() {
        try { localStorage.setItem('shutdownScheduler_schedules', JSON.stringify(schedules)); }
        catch (e) { console.warn('Could not save to localStorage', e); }
    }

    function loadSchedulesFromStorage() {
        try {
            const saved = localStorage.getItem('shutdownScheduler_schedules');
            if (saved) schedules = JSON.parse(saved);
        } catch (e) { console.warn('Could not load from localStorage', e); }
    }

    function exportSchedules() {
        const result = [];
        for (const [key, schedule] of Object.entries(schedules)) {
            const [app, env, hostname] = key.split('|');
            const machine = machines.find(m => m.application === app && m.environment === env && m.hostname === hostname);
            result.push({
                application: app,
                environment: env,
                machine_name: machine ? machine.machine_name : '',
                hostname,
                server_type: machine ? machine.server_type : '',
                description: machine ? (machine.description || '') : '',
                schedule_type: schedule.type,
                recurring: schedule.recurring || 'none',
                start_time: schedule.startTime || '',
                stop_time: schedule.stopTime || '',
                dates: schedule.dates || []
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
        return getMachines(appName, envName).some(m => schedules[scheduleKey(appName, envName, m.hostname)]);
    }

    return {
        loadFromFile, loadFromPath, getApplications, getEnvironments, getMachines,
        getSchedule, setSchedule, setScheduleForEnv, removeSchedule,
        exportSchedules, getStats, envHasSchedules,
        get machines() { return machines; }
    };
})();
