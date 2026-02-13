/* ============================================
   Data Layer — CSV Parsing & State Management
   ============================================ */

const DataManager = (() => {
    // State
    let machines = [];
    let schedules = {}; // key: "app|env|hostname" -> { type, startTime, stopTime, dates[] }

    // Parse CSV text into array of objects
    function parseCSV(text) {
        const lines = text.trim().split('\n');
        if (lines.length < 2) return [];

        const headers = lines[0].split(',').map(h => h.trim());
        const result = [];

        for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i]);
            if (values.length !== headers.length) continue;

            const obj = {};
            headers.forEach((h, idx) => {
                obj[h] = values[idx].trim();
            });
            result.push(obj);
        }
        return result;
    }

    // Handle CSV values with possible commas inside quotes
    function parseCSVLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                inQuotes = !inQuotes;
            } else if (ch === ',' && !inQuotes) {
                values.push(current);
                current = '';
            } else {
                current += ch;
            }
        }
        values.push(current);
        return values;
    }

    // Load CSV from file content or fetch from path
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

    // Get unique applications
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

    // Get environments for an application
    function getEnvironments(appName) {
        const envs = new Map();
        machines.filter(m => m.application === appName).forEach(m => {
            const env = m.environment;
            if (!envs.has(env)) {
                envs.set(env, { name: env, machineCount: 0 });
            }
            envs.get(env).machineCount++;
        });

        // Sort environments in logical order
        const order = ['Development', 'Integration', 'Bugfixing', 'Training', 'Pre-Produzione', 'Produzione'];
        return Array.from(envs.values()).sort((a, b) => {
            return order.indexOf(a.name) - order.indexOf(b.name);
        });
    }

    // Get machines for app + env
    function getMachines(appName, envName) {
        return machines.filter(m => m.application === appName && m.environment === envName);
    }

    // Schedule key helper
    function scheduleKey(appName, envName, hostname) {
        return `${appName}|${envName}|${hostname}`;
    }

    // Get schedule for a machine
    function getSchedule(appName, envName, hostname) {
        return schedules[scheduleKey(appName, envName, hostname)] || null;
    }

    // Set schedule for a machine
    function setSchedule(appName, envName, hostname, schedule) {
        schedules[scheduleKey(appName, envName, hostname)] = schedule;
        saveSchedulesToStorage();
    }

    // Set schedule for all machines in an environment
    function setScheduleForEnv(appName, envName, schedule) {
        const envMachines = getMachines(appName, envName);
        envMachines.forEach(m => {
            schedules[scheduleKey(appName, envName, m.hostname)] = { ...schedule };
        });
        saveSchedulesToStorage();
    }

    // Remove schedule
    function removeSchedule(appName, envName, hostname) {
        delete schedules[scheduleKey(appName, envName, hostname)];
        saveSchedulesToStorage();
    }

    // Persistence via localStorage
    function saveSchedulesToStorage() {
        try {
            localStorage.setItem('powerSchedule_schedules', JSON.stringify(schedules));
        } catch (e) {
            console.warn('Could not save to localStorage', e);
        }
    }

    function loadSchedulesFromStorage() {
        try {
            const saved = localStorage.getItem('powerSchedule_schedules');
            if (saved) {
                schedules = JSON.parse(saved);
            }
        } catch (e) {
            console.warn('Could not load from localStorage', e);
        }
    }

    // Export all schedules as JSON
    function exportSchedules() {
        const result = [];
        for (const [key, schedule] of Object.entries(schedules)) {
            const [app, env, hostname] = key.split('|');
            const machine = machines.find(m => m.application === app && m.environment === env && m.hostname === hostname);
            result.push({
                application: app,
                environment: env,
                machine_name: machine ? machine.machine_name : '',
                hostname: hostname,
                server_type: machine ? machine.server_type : '',
                schedule_type: schedule.type,
                start_time: schedule.startTime || '',
                stop_time: schedule.stopTime || '',
                dates: schedule.dates || []
            });
        }
        return result;
    }

    // Get summary stats
    function getStats() {
        const apps = getApplications();
        const totalMachines = machines.length;
        const scheduledCount = Object.keys(schedules).length;
        const envCount = apps.reduce((sum, a) => sum + a.envCount, 0);

        return {
            applications: apps.length,
            environments: envCount,
            totalMachines,
            scheduledMachines: scheduledCount
        };
    }

    // Check if environment has any schedules
    function envHasSchedules(appName, envName) {
        const envMachines = getMachines(appName, envName);
        return envMachines.some(m => schedules[scheduleKey(appName, envName, m.hostname)]);
    }

    return {
        loadFromFile,
        loadFromPath,
        getApplications,
        getEnvironments,
        getMachines,
        getSchedule,
        setSchedule,
        setScheduleForEnv,
        removeSchedule,
        exportSchedules,
        getStats,
        envHasSchedules,
        get machines() { return machines; }
    };
})();
