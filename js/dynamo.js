/* ============================================
   DynamoDB Service — State Persistence Layer
   ============================================
   Configure CONFIG.enabled = true and set your
   API Gateway endpoint to activate DynamoDB sync.

   Expected API:
   POST {endpoint}/schedules/fetch
     Body: { "keys": ["App_Env", ...] }
     Response: { "items": { "App_Env": { "hostname": [...entries], ... }, ... } }

   POST {endpoint}/schedules/save
     Body: { "key": "App_Env", "data": {...}, "user": "id", "timestamp": "ISO" }
     Response: { "success": true }
   ============================================ */
const DynamoService = (() => {
    const CONFIG = {
        enabled: false,
        endpoint: 'https://YOUR_API_GATEWAY.execute-api.eu-west-1.amazonaws.com/prod'
    };

    let initialSnapshot = {};

    function appEnvKey(app, env) { return `${app}_${env}`; }

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
        // dynamoData = { hostname: [entries], ... }
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

    // Fetch schedules for multiple app_env keys
    async function fetchAll(keys) {
        if (!CONFIG.enabled) return null;
        try {
            const response = await fetch(`${CONFIG.endpoint}/schedules/fetch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keys })
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            return data.items || {};
        } catch (err) {
            console.error('DynamoDB fetch failed:', err);
            throw err;
        }
    }

    // Save schedules for one app_env
    async function saveOne(key, data, userId) {
        if (!CONFIG.enabled) return true;
        const response = await fetch(`${CONFIG.endpoint}/schedules/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                key,
                data,
                user: userId,
                timestamp: new Date().toISOString()
            })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return true;
    }

    // Save multiple app_envs sequentially
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

    // Take a deep snapshot of current schedules state
    function takeSnapshot(schedules) {
        initialSnapshot = JSON.parse(JSON.stringify(schedules));
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
                // Count changes
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
        takeSnapshot, getSnapshot, getModifiedAppEnvs
    };
})();
