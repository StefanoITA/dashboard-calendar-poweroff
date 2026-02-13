/* ============================================
   Audit Log — Track all user actions
   ============================================ */
const AuditLog = (() => {
    let logs = [];
    let currentUser = null;

    function setUser(user) { currentUser = user; }

    function log(action, details) {
        logs.push({
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
            timestamp: new Date().toISOString(),
            user: currentUser ? currentUser.name : 'Sistema',
            userId: currentUser ? currentUser.id : 'system',
            action,
            details: typeof details === 'object' ? JSON.stringify(details) : String(details)
        });
    }

    function getLogs() { return [...logs].reverse(); }
    function getCount() { return logs.length; }
    function clear() { logs = []; }

    function formatTimestamp(iso) {
        const d = new Date(iso);
        const pad = n => String(n).padStart(2, '0');
        return `${pad(d.getDate())}/${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    return { setUser, log, getLogs, getCount, clear, formatTimestamp };
})();
