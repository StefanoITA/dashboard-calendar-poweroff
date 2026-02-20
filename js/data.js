/* ============================================
   FinOps Platform — Data Layer
   CSV Parsing, State & Roles, Per-app RW/RO
   ============================================ */
const DataManager = (() => {
    let machines = [];
    let schedules = {};
    let users = [];
    let currentUser = null;
    let notes = {};
    let systemMessages = [];
    let scheduleExceptions = {}; // { entryId: [{ date, action: 'skip'|'override', startTime?, stopTime?, reason? }] }
    const MAINTENANCE_KEY = '__maintenance__'; // Special hostname key for maintenance windows
    const SCHEDULE_TEMPLATES = [
        { id: 'standard_dev', name: 'Orario Standard Dev', type: 'window', startTime: '08:00', stopTime: '20:00', recurring: 'weekdays', description: 'Lun-Ven 08:00-20:00' },
        { id: 'extended_dev', name: 'Orario Esteso Dev', type: 'window', startTime: '06:00', stopTime: '23:00', recurring: 'weekdays', description: 'Lun-Ven 06:00-23:00' },
        { id: 'h24_weekdays', name: 'H24 Feriali', type: 'window', startTime: '00:00', stopTime: '23:59', recurring: 'weekdays', description: 'Lun-Ven H24' },
        { id: 'minimal', name: 'Orario Minimo', type: 'window', startTime: '09:00', stopTime: '18:00', recurring: 'weekdays', description: 'Lun-Ven 09:00-18:00' },
        { id: 'weekend_maintenance', name: 'Manutenzione Weekend', type: 'window', startTime: '06:00', stopTime: '22:00', recurring: 'weekends', description: 'Sab-Dom 06:00-22:00' },
        { id: 'shutdown_weekend', name: 'Shutdown Weekend', type: 'shutdown', recurring: 'weekends', description: 'Spegni Sab-Dom' },
        { id: 'batch_night', name: 'Batch Notturno', type: 'window', startTime: '22:00', stopTime: '23:59', recurring: 'weekdays', description: 'Lun-Ven 22:00-23:59 (batch)' },
    ];

    function parseCSV(text) {
        const lines = text.trim().split('\n');
        if (lines.length < 2) return [];
        const headers = lines[0].split(',').map(h => sanitizeInput(h.trim(), 100));
        const result = [];
        for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i]);
            if (values.length !== headers.length) continue;
            const obj = {};
            headers.forEach((h, idx) => { obj[h] = sanitizeInput(values[idx].trim()); });
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

    // Input sanitization per prevenire XSS
    function sanitizeInput(str, maxLength = 500) {
        if (typeof str !== 'string') return '';
        return str
            .replace(/[<>'"]/g, '')  // Rimuovi caratteri HTML pericolosi
            .trim()
            .slice(0, maxLength);  // Limita lunghezza
    }

    // ============================================
    // User & Roles (per-app RW/RO)
    // ============================================
    function cacheBust(url) { return url + (url.includes('?') ? '&' : '?') + '_=' + Date.now(); }

    // Users source: 'json' (local file) or 'dynamodb' (via API Lambda)
    const USERS_CONFIG = {
        source: 'json', // Cambiare a 'dynamodb' quando le tabelle sono pronte
        endpoint: '' // Non più usato: gli utenti vengono caricati via DynamoService
    };

    async function loadUsers() {
        try {
            let data;
            if (USERS_CONFIG.source === 'dynamodb' && DynamoService.CONFIG.enabled) {
                // Prova a caricare da DynamoDB via Lambda autenticata
                const dynamoUsers = await DynamoService.fetchUsers();
                if (dynamoUsers) {
                    // DynamoDB users hanno user_id, frontend usa id
                    users = dynamoUsers.map(u => ({
                        ...u,
                        id: u.user_id || u.id
                    }));
                    return users;
                }
                // Se fetchUsers ritorna null (non admin), carica solo il proprio profilo
                const me = await DynamoService.fetchCurrentUser();
                if (me) {
                    users = [{ ...me, id: me.user_id || me.id }];
                    return users;
                }
                // Fallback a JSON se DynamoDB non disponibile
                console.warn('[Users] DynamoDB non disponibile, fallback a JSON');
            }
            // Source JSON (default) o fallback
            const response = await fetch(cacheBust('data/users.json'));
            data = await response.json();
            users = data.users || [];
        } catch (e) {
            console.warn('Could not load users, using defaults', e);
            users = [{ id: 'admin', name: 'Admin', role: 'Admin', applications: ['*'] }];
        }
        return users;
    }

    function getUsers() { return users; }

    function findUserByGitHub(githubUsername) {
        if (!githubUsername) return null;
        return users.find(u => u.github_user && u.github_user.toLowerCase() === githubUsername.toLowerCase()) || null;
    }

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

    // Production/Produzione environments are RO by default for non-Admin
    const _PRODUCTION_ENVS = new Set(['Production', 'Produzione']);

    // Per-app permission: 'rw', 'ro', or null (no access)
    // Supports per-env overrides: { "App1": { "_default": "rw", "Produzione": "ro" } }
    function getAppPermission(appName) {
        if (!currentUser) return null;
        if (currentUser.role === 'Admin') return 'rw';
        if (currentUser.role === 'Read-Only') {
            const apps = currentUser.applications;
            if (Array.isArray(apps) && apps.includes('*')) return 'ro';
            if (typeof apps === 'object' && !Array.isArray(apps)) {
                const val = apps[appName];
                if (!val) return null;
                if (typeof val === 'object') return val._default || 'ro';
                return 'ro';
            }
            return 'ro';
        }

        const apps = currentUser.applications;
        // Array format (legacy): ["*"] or ["App1", "App2"]
        if (Array.isArray(apps)) {
            if (apps.includes('*')) return currentUser.role === 'Read-Only' ? 'ro' : 'rw';
            return apps.includes(appName) ? 'rw' : null;
        }
        // Object format: { "App1": "rw", "App2": "ro", "App3": { "_default": "rw", "Produzione": "ro" } }
        if (typeof apps === 'object' && apps !== null) {
            const val = apps[appName];
            if (!val) return null;
            if (typeof val === 'object') return val._default || 'rw';
            return val;
        }
        return null;
    }

    // Per-environment permission: checks env-level override, then app-level, then production default
    function getEnvPermission(appName, envName) {
        if (!currentUser) return null;
        if (currentUser.role === 'Admin') return 'rw';

        const appPerm = getAppPermission(appName);
        if (!appPerm) return null;

        // Check per-env override in applications object
        const apps = currentUser.applications;
        if (typeof apps === 'object' && !Array.isArray(apps)) {
            const val = apps[appName];
            if (typeof val === 'object' && val !== null) {
                if (val[envName]) return val[envName];
            }
        }

        // Production environments are RO by default for non-Admin
        if (_PRODUCTION_ENVS.has(envName) && currentUser.role !== 'Admin') {
            return 'ro';
        }

        return appPerm;
    }

    function isEnvReadOnly(appName, envName) {
        const perm = getEnvPermission(appName, envName);
        return perm === 'ro';
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

    function canViewEBSList() {
        if (!currentUser) return false;
        if (currentUser.role === 'Admin') return true;
        if (isGlobalReadOnly()) return true;
        const apps = currentUser.applications;
        if (typeof apps === 'object' && !Array.isArray(apps) && apps['lista_ebs']) return true;
        return false;
    }

    function canViewCalculator() {
        if (!currentUser) return false;
        if (currentUser.role === 'Admin') return true;
        if (isGlobalReadOnly()) return true;
        const apps = currentUser.applications;
        if (typeof apps === 'object' && !Array.isArray(apps) && apps['calcolatore']) return true;
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
            const response = await fetch(cacheBust(path));
            const text = await response.text();
            machines = parseCSV(text);
            // Only load schedules from localStorage if DynamoDB is NOT enabled.
            // When DynamoDB is enabled, loadFromDynamo() will authoritatively
            // set the schedules — loading from localStorage here would restore
            // stale/dirty draft data that the user hasn't saved.
            if (!DynamoService.CONFIG.enabled) {
                loadSchedulesFromStorage();
            }
            loadNotesFromStorage();
            return machines;
        } catch (err) {
            console.error('Failed to load CSV:', err);
            return [];
        }
    }

    // ============================================
    // EBS Volumes
    // ============================================
    let ebsVolumes = [];

    async function loadEBSVolumes() {
        try {
            const response = await fetch(cacheBust('data/ebs_volumes.csv'));
            const text = await response.text();
            ebsVolumes = parseCSV(text);
        } catch (e) {
            console.warn('Could not load ebs_volumes.csv', e);
            ebsVolumes = [];
        }
        return ebsVolumes;
    }

    function getEBSVolumes() { return ebsVolumes; }

    // ============================================
    // System Messages
    // ============================================
    async function loadMessages() {
        try {
            const response = await fetch(cacheBust('data/messages.json'));
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

        // DynamoDB is ALWAYS authoritative — clear local schedules for all
        // accessible app/envs, then replace with DynamoDB data.
        // This ensures deleted entries stay deleted, and unsaved local
        // drafts are discarded on refresh. No auto-seed, no merge.
        for (const pair of pairs) {
            const prefix = `${pair.app}|${pair.env}|`;
            Object.keys(schedules).forEach(k => { if (k.startsWith(prefix)) delete schedules[k]; });
        }
        for (const pair of pairs) {
            const dynKey = DynamoService.appEnvKey(pair.app, pair.env);
            if (items[dynKey]) {
                DynamoService.mergeIntoSchedules(schedules, pair.app, pair.env, items[dynKey]);
            }
        }
        saveSchedulesToStorage();
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
        // Ordinamento alfabetico A-Z
        result.sort((a, b) => a.name.localeCompare(b.name));
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

    // ============================================
    // Validazione Schedule
    // ============================================

    function _timeToMinutes(timeStr) {
        if (!timeStr || !timeStr.includes(':')) return -1;
        const [h, m] = timeStr.split(':').map(Number);
        if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return -1;
        return h * 60 + m;
    }

    /**
     * Controlla se una nuova entry ha sovrapposizione di orari con entry esistenti
     * sulla stessa macchina e stesso pattern ricorrente/date.
     *
     * Ritorna: { valid: true } oppure { valid: false, reason: '...' }
     */
    function validateScheduleOverlap(appName, envName, hostname, newEntry, excludeEntryId) {
        if (newEntry.type !== 'window') return { valid: true };

        // Custom entries: validate per-day
        if (newEntry.recurring === 'custom' && newEntry.daySchedules) {
            // For custom, validate each active day against existing schedules
            const existing = getScheduleEntries(appName, envName, hostname);
            const _dayLabels = { mon:'Lunedì', tue:'Martedì', wed:'Mercoledì', thu:'Giovedì', fri:'Venerdì', sat:'Sabato', sun:'Domenica' };
            for (const [dayKey, ds] of Object.entries(newEntry.daySchedules)) {
                const newStart = _timeToMinutes(ds.startTime);
                const newStop = _timeToMinutes(ds.stopTime);
                if (newStart < 0 || newStop < 0) return { valid: false, reason: `${_dayLabels[dayKey] || dayKey}: orario non valido` };
                if (newStart >= newStop) return { valid: false, reason: `${_dayLabels[dayKey] || dayKey}: orario di avvio dopo lo spegnimento` };
            }
            return { valid: true }; // Detailed per-day overlap check skipped for custom (too complex)
        }

        const newStart = _timeToMinutes(newEntry.startTime);
        const newStop = _timeToMinutes(newEntry.stopTime);
        if (newStart < 0 || newStop < 0) return { valid: false, reason: 'Orario non valido' };
        if (newStart >= newStop) return { valid: false, reason: 'L\'orario di avvio deve essere prima dell\'orario di spegnimento' };

        const existing = getScheduleEntries(appName, envName, hostname);
        for (const entry of existing) {
            if (excludeEntryId && entry.id === excludeEntryId) continue;
            if (entry.type !== 'window') continue;

            // Skip overlap check between custom and non-custom (handled at custom entry creation)
            if (entry.recurring === 'custom') continue;

            const exStart = _timeToMinutes(entry.startTime);
            const exStop = _timeToMinutes(entry.stopTime);
            if (exStart < 0 || exStop < 0) continue;

            // Controlla se i pattern ricorrenti si intersecano
            if (!_recurringOverlaps(newEntry, entry)) continue;

            // Controlla sovrapposizione orari: [newStart, newStop) ∩ [exStart, exStop)
            if (newStart < exStop && newStop > exStart) {
                return {
                    valid: false,
                    reason: `Sovrapposizione con schedulazione esistente (${entry.startTime}-${entry.stopTime})`
                };
            }
        }
        return { valid: true };
    }

    /**
     * Controlla se due entry hanno pattern ricorrenti che si intersecano.
     * daily si interseca con tutto. weekdays e weekends non si intersecano tra loro.
     * custom si interseca se condividono almeno un giorno della settimana.
     * one-time si intersecano solo se hanno almeno una data in comune.
     */
    function _recurringOverlaps(a, b) {
        const ra = a.recurring || 'none';
        const rb = b.recurring || 'none';

        // daily si interseca con tutto
        if (ra === 'daily' || rb === 'daily') return true;

        // custom: check day overlap
        if (ra === 'custom' || rb === 'custom') {
            const daysA = _getActiveDays(a);
            const daysB = _getActiveDays(b);
            return daysA.some(d => daysB.includes(d));
        }

        // weekdays vs weekends non si intersecano
        if ((ra === 'weekdays' && rb === 'weekends') || (ra === 'weekends' && rb === 'weekdays')) return false;

        // stessa ricorrenza → si intersecano
        if (ra === rb && ra !== 'none') return true;

        // weekdays/weekends vs one-time: dipende dai giorni selezionati
        if ((ra === 'weekdays' || ra === 'weekends') && rb === 'none') {
            return _datesOverlapRecurring(b.dates || [], ra);
        }
        if ((rb === 'weekdays' || rb === 'weekends') && ra === 'none') {
            return _datesOverlapRecurring(a.dates || [], rb);
        }

        // one-time vs one-time: almeno una data in comune
        if (ra === 'none' && rb === 'none') {
            const setA = new Set(a.dates || []);
            return (b.dates || []).some(d => setA.has(d));
        }

        return false;
    }

    // Get active day keys for an entry — returns string keys (mon,tue,...,sun)
    const _ALL_DAY_KEYS = ['mon','tue','wed','thu','fri','sat','sun'];
    const _WEEKDAY_KEYS = ['mon','tue','wed','thu','fri'];
    const _WEEKEND_KEYS = ['sat','sun'];
    function _getActiveDays(entry) {
        const rec = entry.recurring || 'none';
        if (rec === 'daily') return [..._ALL_DAY_KEYS];
        if (rec === 'weekdays') return [..._WEEKDAY_KEYS];
        if (rec === 'weekends') return [..._WEEKEND_KEYS];
        if (rec === 'custom' && entry.daySchedules) return Object.keys(entry.daySchedules);
        return [];
    }

    function _datesOverlapRecurring(dates, recurringType) {
        for (const d of dates) {
            try {
                const dow = new Date(d).getDay(); // 0=Sun, 6=Sat
                if (recurringType === 'weekdays' && dow >= 1 && dow <= 5) return true;
                if (recurringType === 'weekends' && (dow === 0 || dow === 6)) return true;
            } catch (_) { /* skip */ }
        }
        return false;
    }

    /**
     * Per una data specifica, restituisce le finestre occupate sulla macchina,
     * considerando sia le ricorrenze sia le date one-time.
     * Ritorna array di { startMin, stopMin, label } per ogni finestra che copre quel giorno.
     */
    function getOccupiedWindows(appName, envName, hostname, dateStr) {
        const existing = getScheduleEntries(appName, envName, hostname);
        const windows = [];
        let dow;
        try {
            dow = new Date(dateStr).getDay();
        } catch (_) {
            return windows;
        }

        for (const entry of existing) {
            if (entry.type !== 'window') continue;

            const rec = entry.recurring || 'none';
            let applies = false;
            let startTime = entry.startTime;
            let stopTime = entry.stopTime;

            if (rec === 'daily') applies = true;
            else if (rec === 'weekdays' && dow >= 1 && dow <= 5) applies = true;
            else if (rec === 'weekends' && (dow === 0 || dow === 6)) applies = true;
            else if (rec === 'custom' && entry.daySchedules) {
                // JS dow: 0=Sun,1=Mon..6=Sat → string key: sun,mon,..,sat
                const _jsDowToKey = ['sun','mon','tue','wed','thu','fri','sat'];
                const dayKey = _jsDowToKey[dow];
                const ds = entry.daySchedules[dayKey];
                if (ds) {
                    applies = true;
                    startTime = ds.startTime;
                    stopTime = ds.stopTime;
                }
            }
            else if (rec === 'none' && (entry.dates || []).includes(dateStr)) applies = true;

            if (!applies) continue;

            // Check maintenance windows
            if (isDateInMaintenance(appName, envName, dateStr)) continue;

            // Check exceptions
            const exception = _getException(entry, dateStr);
            if (exception) {
                if (exception.action === 'skip') continue;
                if (exception.action === 'override') {
                    startTime = exception.startTime;
                    stopTime = exception.stopTime;
                }
            }

            const s = _timeToMinutes(startTime);
            const e = _timeToMinutes(stopTime);
            if (s < 0 || e < 0 || s >= e) continue;

            windows.push({ startMin: s, stopMin: e, label: `${startTime}-${stopTime}` });
        }
        return windows;
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
        const ms = getMachines(appName, envName);
        // Batch: add to all machines THEN save once (not per-machine)
        ms.forEach(m => {
            const key = scheduleKey(appName, envName, m.hostname);
            if (!schedules[key]) schedules[key] = [];
            const clone = { ...entry, id: generateId(), envGroupId: groupId };
            schedules[key].push(clone);
        });
        saveSchedulesToStorage();
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

    function reincludeInEnvGroup(appName, envName, groupId) {
        reincludeSpecificInEnvGroup(appName, envName, groupId, null);
    }

    function reincludeSpecificInEnvGroup(appName, envName, groupId, hostnames) {
        const ms = getMachines(appName, envName);
        // Find an existing entry from this group to clone
        let templateEntry = null;
        for (const m of ms) {
            const key = scheduleKey(appName, envName, m.hostname);
            const entries = schedules[key] || [];
            const match = entries.find(e => e.envGroupId === groupId);
            if (match) { templateEntry = match; break; }
        }
        if (!templateEntry) return;
        // Add entry to specified machines (or all if hostnames is null)
        const targetSet = hostnames ? new Set(hostnames) : null;
        ms.forEach(m => {
            if (targetSet && !targetSet.has(m.hostname)) return;
            const key = scheduleKey(appName, envName, m.hostname);
            const entries = schedules[key] || [];
            if (!entries.find(e => e.envGroupId === groupId)) {
                if (!schedules[key]) schedules[key] = [];
                schedules[key].push({ ...templateEntry, id: generateId() });
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

    // ============================================
    // Maintenance Windows (stored inside schedules, synced via DynamoDB)
    // Uses special hostname key "__maintenance__" so they travel
    // with the save/load/snapshot flow automatically.
    // ============================================
    function _maintenanceKey(appName, envName) {
        return scheduleKey(appName, envName, MAINTENANCE_KEY);
    }

    function getMaintenanceWindows(appName, envName) {
        return schedules[_maintenanceKey(appName, envName)] || [];
    }

    function addMaintenanceWindow(appName, envName, startDate, endDate, reason) {
        const key = _maintenanceKey(appName, envName);
        if (!schedules[key]) schedules[key] = [];
        const win = { id: generateId(), type: 'maintenance', startDate, endDate, reason: reason || '' };
        schedules[key].push(win);
        saveSchedulesToStorage();
        return win.id;
    }

    function removeMaintenanceWindow(appName, envName, windowId) {
        const key = _maintenanceKey(appName, envName);
        if (!schedules[key]) return;
        schedules[key] = schedules[key].filter(w => w.id !== windowId);
        if (schedules[key].length === 0) delete schedules[key];
        saveSchedulesToStorage();
    }

    function isDateInMaintenance(appName, envName, dateStr) {
        const windows = getMaintenanceWindows(appName, envName);
        return windows.some(w => dateStr >= w.startDate && dateStr <= w.endDate);
    }

    function isEnvInMaintenanceNow(appName, envName) {
        const today = new Date().toISOString().split('T')[0];
        return isDateInMaintenance(appName, envName, today);
    }

    // ============================================
    // Schedule Exceptions (per-entry overrides for specific dates)
    // ============================================
    function _getException(entry, dateStr) {
        const excs = scheduleExceptions[entry.id];
        if (!excs) return null;
        return excs.find(ex => ex.date === dateStr) || null;
    }

    function addScheduleException(entryId, date, action, overrideData) {
        // action: 'skip' (skip this date) or 'override' (different hours)
        if (!scheduleExceptions[entryId]) scheduleExceptions[entryId] = [];
        // Remove existing exception for same date
        scheduleExceptions[entryId] = scheduleExceptions[entryId].filter(e => e.date !== date);
        const exc = { date, action, ...(overrideData || {}) };
        scheduleExceptions[entryId].push(exc);
        _saveExceptionsToStorage();
    }

    function removeScheduleException(entryId, date) {
        if (!scheduleExceptions[entryId]) return;
        scheduleExceptions[entryId] = scheduleExceptions[entryId].filter(e => e.date !== date);
        if (scheduleExceptions[entryId].length === 0) delete scheduleExceptions[entryId];
        _saveExceptionsToStorage();
    }

    function getScheduleExceptions(entryId) {
        return scheduleExceptions[entryId] || [];
    }

    function getAllExceptions() { return scheduleExceptions; }

    function _saveExceptionsToStorage() {
        try { localStorage.setItem('shutdownScheduler_exceptions', JSON.stringify(scheduleExceptions)); }
        catch (e) { console.warn('Could not save exceptions', e); }
    }

    function _loadExceptionsFromStorage() {
        try {
            const saved = localStorage.getItem('shutdownScheduler_exceptions');
            if (saved) scheduleExceptions = JSON.parse(saved);
        } catch (e) { scheduleExceptions = {}; }
    }

    // ============================================
    // Schedule Templates
    // ============================================
    function getScheduleTemplates() { return SCHEDULE_TEMPLATES; }

    function applyTemplate(templateId) {
        const tmpl = SCHEDULE_TEMPLATES.find(t => t.id === templateId);
        if (!tmpl) return null;
        return { ...tmpl, id: undefined };
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
        _loadExceptionsFromStorage();
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
            text: sanitizeInput(text, 1000),  // Sanitizza input note
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
            note.text = sanitizeInput(text, 1000);  // Sanitizza input note
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
            if (hostname === MAINTENANCE_KEY) continue;
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
            if (hostname === MAINTENANCE_KEY) continue;
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
            scheduledMachines: Object.keys(schedules).filter(k => !k.endsWith('|' + MAINTENANCE_KEY)).length,
            totalSchedules: Object.entries(schedules).filter(([k]) => !k.endsWith('|' + MAINTENANCE_KEY)).reduce((sum, [, arr]) => sum + arr.length, 0),
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
            if (hostname === MAINTENANCE_KEY) continue;
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
    // Day key → cron day mapping: mon=1, tue=2, ..., sat=6, sun=0
    const _keyToCron = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };

    function generateCronjobs(entries) {
        if (!entries || entries.length === 0) return [];
        return entries.map(entry => {
            const cj = { entryId: entry.id, type: entry.type, crons: [] };
            const [startH, startM] = entry.startTime ? entry.startTime.split(':').map(Number) : [0, 0];
            const [stopH, stopM] = entry.stopTime ? entry.stopTime.split(':').map(Number) : [0, 0];

            if (entry.recurring === 'daily') {
                if (entry.type === 'window') {
                    cj.crons.push({ action: 'start', expression: `${startM} ${startH} * * *` });
                    cj.crons.push({ action: 'stop', expression: `${stopM} ${stopH} * * *` });
                } else {
                    cj.crons.push({ action: 'stop', expression: '0 0 * * *' });
                }
            } else if (entry.recurring === 'weekdays') {
                if (entry.type === 'window') {
                    cj.crons.push({ action: 'start', expression: `${startM} ${startH} * * 1-5` });
                    cj.crons.push({ action: 'stop', expression: `${stopM} ${stopH} * * 1-5` });
                } else {
                    cj.crons.push({ action: 'stop', expression: '0 0 * * 1-5' });
                }
            } else if (entry.recurring === 'weekends') {
                if (entry.type === 'window') {
                    cj.crons.push({ action: 'start', expression: `${startM} ${startH} * * 0,6` });
                    cj.crons.push({ action: 'stop', expression: `${stopM} ${stopH} * * 0,6` });
                } else {
                    cj.crons.push({ action: 'stop', expression: '0 0 * * 0,6' });
                }
            } else if (entry.recurring === 'custom' && entry.daySchedules) {
                // Custom per-day scheduling: group days with identical times for compact cron
                const timeGroups = {};
                for (const [dayKey, ds] of Object.entries(entry.daySchedules)) {
                    if (!ds || !ds.startTime || !ds.stopTime) continue;
                    const timeKey = `${ds.startTime}|${ds.stopTime}`;
                    if (!timeGroups[timeKey]) timeGroups[timeKey] = { startTime: ds.startTime, stopTime: ds.stopTime, days: [] };
                    const cronDay = _keyToCron[dayKey];
                    if (cronDay !== undefined) timeGroups[timeKey].days.push(cronDay);
                }
                for (const group of Object.values(timeGroups)) {
                    const [sH, sM] = group.startTime.split(':').map(Number);
                    const [eH, eM] = group.stopTime.split(':').map(Number);
                    const dayStr = group.days.sort((a, b) => a - b).join(',');
                    if (entry.type === 'window') {
                        cj.crons.push({ action: 'start', expression: `${sM} ${sH} * * ${dayStr}` });
                        cj.crons.push({ action: 'stop', expression: `${eM} ${eH} * * ${dayStr}` });
                    } else {
                        cj.crons.push({ action: 'stop', expression: `0 0 * * ${dayStr}` });
                    }
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
                        cj.crons.push({ action: 'start', expression: `${startM} ${startH} ${days} ${group.month} *` });
                        cj.crons.push({ action: 'stop', expression: `${stopM} ${stopH} ${days} ${group.month} *` });
                    } else {
                        cj.crons.push({ action: 'stop', expression: `0 0 ${days} ${group.month} *` });
                    }
                }
            }
            return cj;
        });
    }

    return {
        loadFromFile, loadFromPath, loadUsers, loadFromDynamo, loadMessages,
        getUsers, findUserByGitHub, setCurrentUser, getCurrentUser, isReadOnly, isAppReadOnly, getAppPermission,
        getEnvPermission, isEnvReadOnly,
        canAccessApp, getAccessibleAppEnvPairs,
        getApplications, getEnvironments, getMachines,
        getScheduleEntries, addScheduleEntry, updateScheduleEntry, removeScheduleEntry,
        removeAllSchedules, addEntryForEnv, validateScheduleOverlap, getOccupiedWindows,
        exportSchedules, getAllSchedulesFlat, getStats, envHasSchedules, getEnvScheduleStats,
        getSchedulesRef, getMessages, getUpcomingSchedules,
        getNotes, addNote, updateNote, deleteNote, getAllNotesCount,
        getEnvGroups, updateEnvGroup, removeEnvGroup, excludeFromEnvGroup,
        reincludeInEnvGroup, reincludeSpecificInEnvGroup,
        isGlobalReadOnly, canViewVMList, canViewEBSList, canViewCalculator,
        getVMListMachines, generateCronjobs,
        loadEBSVolumes, getEBSVolumes,
        // Maintenance windows
        addMaintenanceWindow, removeMaintenanceWindow, getMaintenanceWindows,
        isDateInMaintenance, isEnvInMaintenanceNow, MAINTENANCE_KEY,
        // Exceptions
        addScheduleException, removeScheduleException, getScheduleExceptions, getAllExceptions,
        // Templates
        getScheduleTemplates, applyTemplate,
        // Exposed for VM-level refresh
        saveSchedulesToStoragePublic: saveSchedulesToStorage,
        get machines() { return machines; }
    };
})();
