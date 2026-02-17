/* ============================================
   DynamoDB Service — State Persistence Layer (Secure)
   ============================================
   Tutte le richieste passano per la Lambda finops-api
   che verifica il token e i permessi prima di accedere a DynamoDB.

   Flusso:
   Frontend → API Gateway → Lambda (verifica token + permessi) → DynamoDB

   Expected API (autenticato):
   POST {endpoint}/schedules/fetch
     Headers: Authorization: Bearer <session_token>
     Body: { "keys": ["App_Env", ...] }
     Response: { "items": { "App_Env": { "hostname": [...entries], ... }, ... } }

   POST {endpoint}/schedules/save
     Headers: Authorization: Bearer <session_token>
     Body: { "key": "App_Env", "data": {...} }
     Response: { "success": true }

   GET  {endpoint}/users/me     → Profilo utente corrente
   GET  {endpoint}/users        → Lista utenti (solo Admin)
   POST {endpoint}/users        → Crea/aggiorna utente (solo Admin)
   DELETE {endpoint}/users/{id} → Elimina utente (solo Admin)
   ============================================ */
const DynamoService = (() => {
    const CONFIG = {
        enabled: false,
        endpoint: 'https://YOUR_API_GATEWAY.execute-api.eu-west-1.amazonaws.com/prod',
        retryAttempts: 4,
        retryBaseDelay: 2000 // ms — exponential backoff: 2s, 4s, 8s, 16s
    };

    let initialSnapshot = {};

    // ============================================
    // Key sanitization: spazi → _, separatore → #
    // "Applicazione Prova" + "Development" → "Applicazione_Prova#Development"
    // ============================================
    function appEnvKey(app, env) {
        const safeApp = app.trim().replace(/ /g, '_');
        const safeEnv = env.trim().replace(/ /g, '_');
        return `${safeApp}#${safeEnv}`;
    }

    // ============================================
    // Auth: token dalla sessione corrente
    // ============================================
    function _getToken() {
        const token = localStorage.getItem('shutdownScheduler_gheToken') || '';
        console.debug('[DynamoDB] _getToken:', token ? `found (${token.length} chars)` : 'EMPTY — token non presente in localStorage');
        return token;
    }

    function _getAuthHeaders() {
        const token = _getToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        console.debug('[DynamoDB] _getAuthHeaders:', token ? 'Authorization header aggiunto' : 'NESSUN Authorization header — token vuoto');
        return headers;
    }

    // Inietta _token nel body come fallback (API GW potrebbe strippare l'header Authorization)
    function _withToken(bodyObj) {
        const token = _getToken();
        if (token) {
            bodyObj['_token'] = token;
            console.debug('[DynamoDB] _withToken: _token aggiunto al body');
        } else {
            console.warn('[DynamoDB] _withToken: NESSUN token disponibile — body senza _token');
        }
        return bodyObj;
    }

    // ============================================
    // Retry Helper — exponential backoff
    // ============================================
    async function withRetry(fn, label = 'operation') {
        let lastError;
        for (let attempt = 0; attempt <= CONFIG.retryAttempts; attempt++) {
            try {
                return await fn();
            } catch (err) {
                lastError = err;
                if (attempt < CONFIG.retryAttempts) {
                    const delay = CONFIG.retryBaseDelay * Math.pow(2, attempt);
                    console.warn(`[DynamoDB] ${label} failed (attempt ${attempt + 1}/${CONFIG.retryAttempts + 1}), retrying in ${delay}ms...`, err.message);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    console.error(`[DynamoDB] ${label} failed after ${CONFIG.retryAttempts + 1} attempts`, err);
                }
            }
        }
        throw lastError;
    }

    // Extract all schedules for one app+env from the global schedules object
    function extractAppEnvData(schedules, app, env) {
        const result = {};
        const prefix = `${app}|${env}|`;
        for (const [key, entries] of Object.entries(schedules)) {
            if (key.startsWith(prefix)) {
                const hostname = key.substring(prefix.length);
                result[hostname] = entries;
            }
        }
        return result;
    }

    // Merge DynamoDB data back into the global schedules format
    function mergeIntoSchedules(schedules, app, env, dynamoData) {
        if (!dynamoData) return;
        for (const [hostname, entries] of Object.entries(dynamoData)) {
            const key = `${app}|${env}|${hostname}`;
            if (entries && entries.length > 0) {
                schedules[key] = entries;
            } else {
                delete schedules[key];
            }
        }
    }

    // ============================================
    // API: Schedules
    // ============================================

    // Fetch schedules for multiple app_env keys (authenticated + retry)
    async function fetchAll(keys) {
        if (!CONFIG.enabled) { console.debug('[DynamoDB] fetchAll: CONFIG.enabled=false, skip'); return null; }
        console.debug('[DynamoDB] fetchAll: invocato con', keys.length, 'chiavi, endpoint:', CONFIG.endpoint);
        return withRetry(async () => {
            const headers = _getAuthHeaders();
            const body = _withToken({ keys });
            console.debug('[DynamoDB] fetchAll: headers keys=', Object.keys(headers), ', body keys=', Object.keys(body), ', has _token=', '_token' in body);
            const response = await fetch(`${CONFIG.endpoint}/schedules/fetch`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body)
            });
            if (response.status === 401 || response.status === 403) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `Accesso negato (${response.status})`);
            }
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            return data.items || {};
        }, 'fetchAll');
    }

    // Save schedules for one app_env (authenticated + retry)
    async function saveOne(key, data, userId) {
        if (!CONFIG.enabled) return true;
        return withRetry(async () => {
            const response = await fetch(`${CONFIG.endpoint}/schedules/save`, {
                method: 'POST',
                headers: _getAuthHeaders(),
                body: JSON.stringify(_withToken({ key, data }))
            });
            if (response.status === 401 || response.status === 403) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `Permesso negato (${response.status})`);
            }
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return true;
        }, `saveOne(${key})`);
    }

    // Save multiple app_envs sequentially (each with retry)
    async function saveMultiple(changes, userId) {
        const results = [];
        for (const { key, data } of changes) {
            try {
                await saveOne(key, data, userId);
                results.push({ key, success: true });
            } catch (err) {
                results.push({ key, success: false, error: err.message });
            }
        }
        return results;
    }

    // ============================================
    // API: Users (DynamoDB)
    // ============================================

    // Fetch utenti da DynamoDB (per loadUsers con source 'dynamodb')
    async function fetchUsers() {
        if (!CONFIG.enabled) return null;
        const token = _getToken();
        const url = token ? `${CONFIG.endpoint}/users?token=${encodeURIComponent(token)}` : `${CONFIG.endpoint}/users`;
        const response = await fetch(url, {
            method: 'GET',
            headers: _getAuthHeaders()
        });
        if (!response.ok) {
            // Fallback: se non admin, prova /users/me
            if (response.status === 403) return null;
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        return data.users || [];
    }

    // Fetch profilo utente corrente
    async function fetchCurrentUser() {
        if (!CONFIG.enabled) return null;
        const token = _getToken();
        const url = token ? `${CONFIG.endpoint}/users/me?token=${encodeURIComponent(token)}` : `${CONFIG.endpoint}/users/me`;
        const response = await fetch(url, {
            method: 'GET',
            headers: _getAuthHeaders()
        });
        if (!response.ok) return null;
        const data = await response.json();
        return data.user || null;
    }

    // Crea o aggiorna utente (solo Admin)
    async function upsertUser(userData) {
        const response = await fetch(`${CONFIG.endpoint}/users`, {
            method: 'POST',
            headers: _getAuthHeaders(),
            body: JSON.stringify(_withToken({ user: userData }))
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${response.status}`);
        }
        return await response.json();
    }

    // Elimina utente (solo Admin)
    async function deleteUser(userId) {
        const token = _getToken();
        const url = token
            ? `${CONFIG.endpoint}/users/${encodeURIComponent(userId)}?token=${encodeURIComponent(token)}`
            : `${CONFIG.endpoint}/users/${encodeURIComponent(userId)}`;
        const response = await fetch(url, {
            method: 'DELETE',
            headers: _getAuthHeaders()
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${response.status}`);
        }
        return await response.json();
    }

    // ============================================
    // Snapshot mechanism (invariato)
    // ============================================

    // Take a deep snapshot of current schedules state
    function takeSnapshot(schedules) {
        initialSnapshot = JSON.parse(JSON.stringify(schedules));
        try { localStorage.setItem('finops_lastSavedSnapshot', JSON.stringify(initialSnapshot)); } catch {}
    }

    // Restore snapshot from localStorage (for page reload resilience)
    function restoreSnapshot() {
        try {
            const saved = localStorage.getItem('finops_lastSavedSnapshot');
            if (saved) { initialSnapshot = JSON.parse(saved); return true; }
        } catch {}
        return false;
    }

    function getSnapshot() { return initialSnapshot; }

    // Compute which app_envs have been modified since snapshot
    function getModifiedAppEnvs(currentSchedules) {
        const modified = [];
        const allAppEnvs = new Set();

        const extractAE = (obj) => {
            Object.keys(obj).forEach(k => {
                const parts = k.split('|');
                if (parts.length >= 2) allAppEnvs.add(`${parts[0]}|${parts[1]}`);
            });
        };
        extractAE(currentSchedules);
        extractAE(initialSnapshot);

        allAppEnvs.forEach(ae => {
            const [app, env] = ae.split('|');
            const currData = extractAppEnvData(currentSchedules, app, env);
            const initData = extractAppEnvData(initialSnapshot, app, env);
            if (JSON.stringify(currData) !== JSON.stringify(initData)) {
                const allHostnames = new Set([...Object.keys(currData), ...Object.keys(initData)]);
                let added = 0, removed = 0, changed = 0;
                allHostnames.forEach(h => {
                    const c = JSON.stringify(currData[h] || []);
                    const i = JSON.stringify(initData[h] || []);
                    if (c !== i) {
                        if (!initData[h] || initData[h].length === 0) added++;
                        else if (!currData[h] || currData[h].length === 0) removed++;
                        else changed++;
                    }
                });
                modified.push({
                    app, env,
                    key: appEnvKey(app, env),
                    data: currData,
                    added, removed, changed
                });
            }
        });
        return modified;
    }

    return {
        CONFIG, appEnvKey, extractAppEnvData, mergeIntoSchedules,
        fetchAll, saveOne, saveMultiple,
        fetchUsers, fetchCurrentUser, upsertUser, deleteUser,
        takeSnapshot, restoreSnapshot, getSnapshot, getModifiedAppEnvs
    };
})();
