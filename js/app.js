/* ============================================
   FinOps Platform — Main Application
   ============================================ */
const App = (() => {
    let currentApp = null;
    let currentEnv = null;
    let modalTarget = null;
    let editingEntryId = null;
    let calendarDate = new Date();
    let selectedDates = new Set();
    let currentScheduleType = 'window';
    let currentRecurring = 'none';
    let currentView = 'home';
    let gcDate = new Date();
    let gcActiveFilters = new Set();
    let gcActiveEnvFilters = new Set();
    let gcEnvFiltersInitialized = false;
    let isUnauthorized = false;
    let ssoAuthenticated = false;
    let unsavedReminderTimer = null;
    let unsavedPopupShown = false;

    const $ = s => document.querySelector(s);
    const $$ = s => document.querySelectorAll(s);

    const monthNames = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

    const serverIcons = {
        'Web Server': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
        'Application Server': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>',
        'Database Server': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>'
    };

    const envClassMap = { 'Development':'dev','Integration':'int','Pre-Produzione':'preprod','Training':'training','Bugfixing':'bugfix','Produzione':'prod','Pre-Production':'preprod','Production':'prod' };
    const appColors = ['#c2410c','#7c3aed','#2563eb','#0891b2','#059669','#dc2626','#db2777','#4f46e5','#ca8a04'];
    const recurringLabels = { 'none':'Giorni specifici','daily':'Ogni giorno','weekdays':'Lun-Ven','weekends':'Sab-Dom','custom':'Personalizzato' };
    const envColors = { 'Development':'#2563eb','Integration':'#7c3aed','Bugfixing':'#dc2626','Training':'#0891b2','Pre-Produzione':'#d97706','Produzione':'#059669','Pre-Production':'#d97706','Production':'#059669' };

    const SVG = {
        check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
        x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
        trash: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
        upload: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
        alert: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
        copy: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
        note: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
        refresh: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
        edit: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
        lock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    };

    // ============================================
    // Utility Functions
    // ============================================

    // Debounce helper per ottimizzare performance input filtri
    const debounce = (fn, delay) => {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => fn(...args), delay);
        };
    };

    // Debug logging (set DEBUG = true solo in sviluppo)
    const DEBUG = true;
    const LOG_LEVELS = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };
    const LOG_LEVEL = LOG_LEVELS.INFO;
    const _log = (level, module, message, data = null) => {
        if (LOG_LEVELS[level] > LOG_LEVEL) return;
        const timestamp = new Date().toISOString().substr(11, 12);
        const prefix = `[${timestamp}][${level}][${module}]`;
        const style = level === 'ERROR' ? 'color:#ef4444;font-weight:bold'
                    : level === 'WARN' ? 'color:#f59e0b;font-weight:bold'
                    : level === 'INFO' ? 'color:#3b82f6'
                    : 'color:#6b7280';
        if (data) {
            console.log(`%c${prefix} ${message}`, style, data);
        } else {
            console.log(`%c${prefix} ${message}`, style);
        }
    };
    const log = (...args) => _log('DEBUG', 'App', args.join(' '));

    // ============================================
    // SSO Configuration (GitHub Enterprise OAuth)
    // ============================================
    const SSO_CONFIG = {
        enabled: true,
        gheBaseUrl: 'https://github.AZIENDA.com',              // <-- Dominio GitHub Enterprise
        oauthClientId: 'YOUR_OAUTH_CLIENT_ID',                 // <-- Client ID dell'OAuth App
        oauthLambdaUrl: 'https://YOUR_LAMBDA_URL'              // <-- URL della Lambda (root)
    };

    const SSO_STORAGE_KEY = 'shutdownScheduler_gheLogin';
    const SSO_TOKEN_KEY = 'shutdownScheduler_gheToken';

    function startOAuthFlow() {
        const params = new URLSearchParams({
            client_id: SSO_CONFIG.oauthClientId,
            scope: 'read:user'
        });
        window.location.href = `${SSO_CONFIG.gheBaseUrl}/login/oauth/authorize?${params}`;
    }

    async function verifyToken(token) {
        try {
            const resp = await fetch(SSO_CONFIG.oauthLambdaUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            });
            if (!resp.ok) return null;
            return await resp.json();
        } catch (err) {
            _log('ERROR', 'Auth', 'Token verify failed', { error: err.message });
            console.error('[SSO] Token verify failed:', err.message);
            return null;
        }
    }

    function clearSSOSession() {
        localStorage.removeItem(SSO_STORAGE_KEY);
        localStorage.removeItem(SSO_TOKEN_KEY);
    }

    function hidePreloader() {
        const el = document.getElementById('preloader');
        if (el) { el.classList.add('hidden'); setTimeout(() => el.remove(), 400); }
    }

    function updateDynamoStatus(state) {
        // state: 'online', 'connecting', 'offline', 'disabled'
        const el = document.getElementById('dynamoStatus');
        if (!el) return;
        el.dataset.status = state;
        const labels = { online: 'Online', connecting: 'Connessione...', offline: 'Offline', disabled: 'Locale' };
        el.querySelector('.dynamo-label').textContent = labels[state] || state;
    }

    function showGitHubLinkScreen() {
        const overlay = document.createElement('div');
        overlay.className = 'unauthorized-overlay';
        overlay.innerHTML = `
            <div class="unauthorized-card github-link-card">
                <div class="github-link-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                </div>
                <h2>Accedi con GitHub Enterprise</h2>
                <p>Per utilizzare l'applicazione, collega il tuo account GitHub Enterprise aziendale.</p>
                <div class="unauthorized-actions">
                    <button class="btn-primary github-link-btn" id="githubLinkBtn">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                        Collega GitHub Enterprise
                    </button>
                </div>
                <p class="unauthorized-sub">Verrai reindirizzato a <strong>${SSO_CONFIG.gheBaseUrl.replace('https://', '')}</strong> per autorizzare l'accesso.</p>
            </div>`;
        document.body.appendChild(overlay);
        document.getElementById('githubLinkBtn').addEventListener('click', startOAuthFlow);
    }

    // ============================================
    // Confirm Dialog (Promise-based)
    // ============================================
    function confirmDialog({ title, message, confirmLabel = 'Elimina', iconType = 'danger', confirmClass = 'btn-danger', wide = false, onMount = null }) {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.className = 'confirm-overlay';
            overlay.innerHTML = `
                <div class="confirm-dialog${wide ? ' confirm-dialog-wide' : ''}">
                    <div class="confirm-dialog-icon">
                        <div class="icon-circle ${iconType}">${SVG.alert}</div>
                    </div>
                    <div class="confirm-dialog-body">
                        <h4>${title}</h4>
                        <p>${message}</p>
                    </div>
                    <div class="confirm-dialog-actions">
                        <button class="btn-secondary confirm-cancel">Annulla</button>
                        <button class="${confirmClass} confirm-ok">${confirmLabel}</button>
                    </div>
                </div>`;
            document.body.appendChild(overlay);
            const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
            if (fsEl) fsEl.appendChild(overlay);

            const close = (result) => { overlay.remove(); resolve(result); };
            overlay.querySelector('.confirm-cancel').addEventListener('click', () => close(false));
            overlay.querySelector('.confirm-ok').addEventListener('click', () => close(true));
            overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
            overlay.querySelector('.confirm-cancel').focus();
            if (onMount) onMount(overlay);
        });
    }

    // ============================================
    // Format dates for display
    // ============================================
    function formatDatesDetail(dates) {
        if (!dates || dates.length === 0) return '';
        const sorted = [...dates].sort();
        const groups = {};
        sorted.forEach(d => {
            const [y, m, day] = d.split('-').map(Number);
            const key = `${y}-${String(m).padStart(2,'0')}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(day);
        });
        const parts = [];
        for (const [ym, days] of Object.entries(groups)) {
            const [y, m] = ym.split('-').map(Number);
            const mName = monthNames[m - 1];
            days.sort((a, b) => a - b);
            const ranges = [];
            let start = days[0], end = days[0];
            for (let i = 1; i < days.length; i++) {
                if (days[i] === end + 1) { end = days[i]; }
                else { ranges.push([start, end]); start = days[i]; end = days[i]; }
            }
            ranges.push([start, end]);
            if (ranges.length === 1 && ranges[0][0] === ranges[0][1]) {
                parts.push(`${ranges[0][0]} ${mName}`);
            } else {
                const rangeStrs = ranges.map(([s, e]) => s === e ? `${s}` : `dal ${s} al ${e}`);
                parts.push(`${rangeStrs.join(', ')} ${mName}`);
            }
        }
        return parts;
    }

    // ============================================
    // Theme
    // ============================================
    function initTheme() {
        const saved = localStorage.getItem('shutdownScheduler_theme');
        // Default: dark mode (if nothing saved)
        if (saved === 'light') {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
        }
    }

    function toggleTheme() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) { document.documentElement.removeAttribute('data-theme'); localStorage.setItem('shutdownScheduler_theme', 'light'); }
        else { document.documentElement.setAttribute('data-theme', 'dark'); localStorage.setItem('shutdownScheduler_theme', 'dark'); }
    }

    // ============================================
    // Custom Time Picker — Scroll Columns
    // ============================================
    function initTimePickers() {
        $$('.time-picker').forEach(picker => {
            const hoursContainer = picker.querySelector('.tp-hours');
            const minsContainer = picker.querySelector('.tp-minutes');
            const btn = picker.querySelector('.time-picker-btn');

            for (let h = 0; h < 24; h++) {
                const opt = document.createElement('button');
                opt.type = 'button';
                opt.className = 'tp-scroll-item';
                opt.textContent = String(h).padStart(2, '0');
                opt.dataset.value = String(h).padStart(2, '0');
                opt.addEventListener('click', (e) => {
                    e.stopPropagation();
                    picker.dataset.hour = opt.dataset.value;
                    updateTimePickerDisplay(picker);
                    hoursContainer.querySelectorAll('.tp-scroll-item').forEach(o => o.classList.remove('active'));
                    opt.classList.add('active');
                });
                hoursContainer.appendChild(opt);
            }

            for (let m = 0; m < 60; m += 5) {
                const opt = document.createElement('button');
                opt.type = 'button';
                opt.className = 'tp-scroll-item';
                opt.textContent = String(m).padStart(2, '0');
                opt.dataset.value = String(m).padStart(2, '0');
                opt.addEventListener('click', (e) => {
                    e.stopPropagation();
                    picker.dataset.min = opt.dataset.value;
                    updateTimePickerDisplay(picker);
                    minsContainer.querySelectorAll('.tp-scroll-item').forEach(o => o.classList.remove('active'));
                    opt.classList.add('active');
                    picker.classList.remove('open');
                });
                minsContainer.appendChild(opt);
            }

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                $$('.time-picker.open').forEach(p => { if (p !== picker) p.classList.remove('open'); });
                picker.classList.toggle('open');
                if (picker.classList.contains('open')) {
                    highlightCurrentTime(picker);
                    scrollToActive(picker);
                }
            });
        });

        document.addEventListener('click', () => {
            $$('.time-picker.open').forEach(p => p.classList.remove('open'));
        });
    }

    function highlightCurrentTime(picker) {
        const h = picker.dataset.hour;
        const m = picker.dataset.min;
        picker.querySelectorAll('.tp-hours .tp-scroll-item').forEach(o => o.classList.toggle('active', o.dataset.value === h));
        picker.querySelectorAll('.tp-minutes .tp-scroll-item').forEach(o => o.classList.toggle('active', o.dataset.value === m));
    }

    function scrollToActive(picker) {
        const activeHour = picker.querySelector('.tp-hours .tp-scroll-item.active');
        const activeMin = picker.querySelector('.tp-minutes .tp-scroll-item.active');
        if (activeHour) activeHour.scrollIntoView({ block: 'center', behavior: 'instant' });
        if (activeMin) activeMin.scrollIntoView({ block: 'center', behavior: 'instant' });
    }

    function updateTimePickerDisplay(picker) {
        picker.querySelector('.time-picker-value').textContent = `${picker.dataset.hour}:${picker.dataset.min}`;
        // Re-render calendar to update conflict highlighting when times change
        if (currentRecurring === 'none' && document.getElementById('calendarGrid')) {
            renderCalendar();
        }
    }

    function getTimePickerValue(id) {
        const picker = $(`#${id}`);
        return `${picker.dataset.hour}:${picker.dataset.min}`;
    }

    function setTimePickerValue(id, time) {
        const picker = $(`#${id}`);
        const parts = (time || '00:00').split(':');
        let h = Math.max(0, Math.min(23, parseInt(parts[0]) || 0));
        let m = Math.max(0, Math.min(59, parseInt(parts[1]) || 0));
        picker.dataset.hour = String(h).padStart(2, '0');
        const rounded = Math.min(55, Math.round(m / 5) * 5);
        picker.dataset.min = String(rounded).padStart(2, '0');
        updateTimePickerDisplay(picker);
    }

    // ============================================
    // Init
    // ============================================
    async function init() {
        _log('INFO', 'Init', 'Avvio applicazione...');
        initTheme();

        // ============================================
        // STEP 1: OAuth — assicura che il session token sia in localStorage
        // PRIMA di qualsiasi chiamata a DynamoDB (loadUsers, loadFromDynamo, ecc.)
        // ============================================
        let ghUsername = null;
        if (SSO_CONFIG.enabled) {
            const urlParams = new URLSearchParams(window.location.search);
            const transitToken = urlParams.get('ghtoken');
            const oauthError = urlParams.get('ghuser_error');

            // Clean URL immediately (remove token from address bar)
            if (transitToken || oauthError) {
                window.history.replaceState({}, document.title, window.location.pathname);
            }

            if (oauthError) {
                console.error('[SSO] OAuth error:', decodeURIComponent(oauthError));
            }

            // 1. Transit token from OAuth redirect → verify + exchange for session
            if (transitToken) {
                const result = await verifyToken(transitToken);
                if (result && result.login && result.session_token) {
                    ghUsername = result.login;
                    localStorage.setItem(SSO_TOKEN_KEY, result.session_token);
                    localStorage.setItem(SSO_STORAGE_KEY, ghUsername);
                    log('[SSO] OAuth login verified:', ghUsername);
                } else {
                    console.error('[SSO] Transit token verification failed');
                }
            }

            // 2. Stored session token → verify server-side
            if (!ghUsername) {
                const storedToken = localStorage.getItem(SSO_TOKEN_KEY);
                if (storedToken) {
                    const result = await verifyToken(storedToken);
                    if (result && result.login) {
                        ghUsername = result.login;
                        localStorage.setItem(SSO_STORAGE_KEY, ghUsername);
                        log('[SSO] Session restored:', ghUsername);
                    } else {
                        clearSSOSession();
                        log('[SSO] Session expired, re-authentication needed');
                    }
                }
            }

            // 3. No valid session → show "Collega GitHub Enterprise" screen
            if (!ghUsername) {
                showGitHubLinkScreen();
                hidePreloader();
                return;
            }
        }

        // ============================================
        // STEP 2: Carica utenti (ora il token è già in localStorage per DynamoDB)
        // ============================================
        await DataManager.loadUsers();
        const users = DataManager.getUsers();

        // ============================================
        // STEP 3: Matching utente e autorizzazione
        // ============================================
        if (SSO_CONFIG.enabled) {
            const ssoUser = DataManager.findUserByGitHub(ghUsername);
            if (ssoUser) {
                ssoAuthenticated = true;
                DataManager.setCurrentUser(ssoUser.id);
                localStorage.setItem('shutdownScheduler_userId', ssoUser.id);
                log('[SSO] User matched:', ssoUser.name, '(' + ssoUser.role + ')');
                _log('INFO', 'Auth', 'Login SSO completato', { user: ghUsername });
            } else {
                clearSSOSession();
                showUnauthorizedScreen(ghUsername);
                hidePreloader();
                return;
            }
        } else {
            // SSO disabled → local development mode with manual user selector
            const savedUserId = localStorage.getItem('shutdownScheduler_userId');
            const matchedUser = users.find(u => u.id === savedUserId);

            if (savedUserId && !matchedUser) {
                showUnauthorizedScreen(savedUserId);
                hidePreloader();
                return;
            }

            const defaultUser = matchedUser || users[0];
            if (defaultUser) DataManager.setCurrentUser(defaultUser.id);
        }

        renderUserSelector();
        applyRoleMode();

        // Load data AFTER authentication (never fetch before login)
        await DataManager.loadMessages();
        await DataManager.loadFromPath('data/machines.csv');
        await DataManager.loadEBSVolumes();

        // DynamoDB sync
        if (DynamoService.CONFIG.enabled) {
            updateDynamoStatus('connecting');
            try {
                await DataManager.loadFromDynamo();
                updateDynamoStatus('online');
            } catch (err) {
                _log('ERROR', 'Init', 'DynamoDB connection failed', { error: err.message });
                updateDynamoStatus('offline');
                showConnectionError();
                return;
            }
        } else {
            // Restore saved snapshot from localStorage so unsaved changes survive reload
            if (!DynamoService.restoreSnapshot()) {
                DynamoService.takeSnapshot(DataManager.getSchedulesRef());
            }
            updateDynamoStatus('disabled');
        }

        renderAppList();
        renderVMListButton();
        renderEBSListButton();
        renderCalculatorButton();
        renderUserMgmtButton();
        renderHomeDashboard();
        initTimePickers();
        bindEvents();
        updateChangesBadge();
        hidePreloader();
    }

    // ============================================
    // Unauthorized Screen
    // ============================================
    function showUnauthorizedScreen(userId) {
        isUnauthorized = true;
        const overlay = document.createElement('div');
        overlay.className = 'unauthorized-overlay';

        let title, message, sub, actions;
        if (userId && SSO_CONFIG.enabled) {
            // OAuth worked but user not in platform users
            title = 'Accesso non autorizzato';
            message = `L'utenza GitHub Enterprise <strong>${userId}</strong> non \u00e8 associata a nessun profilo in questa applicazione.`;
            sub = 'Richiedere a un amministratore di aggiungere il proprio profilo tramite il pannello di gestione utenti.';
            actions = `<button class="btn-primary" onclick="localStorage.removeItem('${SSO_STORAGE_KEY}');localStorage.removeItem('${SSO_TOKEN_KEY}');location.reload();">Riprova con altro account</button>`;
        } else {
            // Local mode — unknown user ID
            title = 'Accesso non autorizzato';
            message = `L'utenza <strong>${userId || 'sconosciuta'}</strong> non \u00e8 abilitata all'utilizzo di questa applicazione.`;
            sub = 'Contattare un amministratore per richiedere l\'accesso al sistema.';
            actions = '<button class="btn-primary" onclick="localStorage.removeItem(\'shutdownScheduler_userId\');location.reload();">Cambia Utente</button>';
        }

        overlay.innerHTML = `
            <div class="unauthorized-card">
                <div class="unauthorized-icon">
                    ${SVG.lock}
                </div>
                <h2>${title}</h2>
                <p>${message}</p>
                <p class="unauthorized-sub">${sub}</p>
                <div class="unauthorized-actions">${actions}</div>
                <div class="unauthorized-contact">
                    <span>Contattare il FinOps Team per assistenza</span>
                </div>
            </div>`;
        document.body.appendChild(overlay);
    }

    function showConnectionError() {
        const overlay = document.createElement('div');
        overlay.className = 'connection-error-overlay';
        overlay.innerHTML = `
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <h2>Impossibile collegarsi alla base dati</h2>
            <p>Non \u00e8 stato possibile recuperare lo stato attuale da DynamoDB dopo ${DynamoService.CONFIG.retryAttempts + 1} tentativi.<br>Verificare la connessione di rete e l'endpoint API Gateway.</p>
            <button class="btn-primary" onclick="location.reload()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                Ricarica Pagina
            </button>`;
        document.body.appendChild(overlay);
    }

    function bindEvents() {
        $('#themeToggle').addEventListener('click', toggleTheme);
        $('#homeBtn').addEventListener('click', goHome);
        $('#generalCalendarBtn').addEventListener('click', showGeneralCalendar);
        $('#importCsvBtn').addEventListener('click', () => $('#csvFileInput').click());
        $('#csvFileInput').addEventListener('change', handleCSVImport);
        $('#exportBtn').addEventListener('click', handleExport);
        $('#auditLogBtn').addEventListener('click', showAuditPanel);
        $('#saveConfigBtn').addEventListener('click', handleSaveConfig);
        $('#refreshBtn').addEventListener('click', handleRefresh);
        $('#applyAllBtn').addEventListener('click', () => openModal('environment'));
        $('#modalClose').addEventListener('click', closeModal);
        $('#modalCancel').addEventListener('click', closeModal);
        $('#modalSave').addEventListener('click', saveSchedule);
        $('#scheduleModal').addEventListener('click', e => { if (e.target === $('#scheduleModal')) closeModal(); });

        $$('.schedule-type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.schedule-type-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentScheduleType = btn.dataset.type;
                $('#timeWindowConfig').style.display = currentScheduleType === 'window' && currentRecurring !== 'custom' ? 'block' : 'none';
                _updateCustomDayVisibility();
            });
        });

        $$('input[name="recurring"]').forEach(radio => {
            radio.addEventListener('change', () => {
                currentRecurring = radio.value;
                updateCalendarVisibility();
                _updateCustomDayVisibility();
            });
        });

        $('#prevMonth').addEventListener('click', () => navigateMonth(-1));
        $('#nextMonth').addEventListener('click', () => navigateMonth(1));
        const selWkBtn = document.getElementById('selectWeekdays');
        if (selWkBtn) selWkBtn.addEventListener('click', selectWeekdays);
        $('#clearSelection').addEventListener('click', () => { selectedDates.clear(); renderCalendar(); });
        $('#gcPrevMonth').addEventListener('click', () => navigateGeneralCalendar(-1));
        $('#gcNextMonth').addEventListener('click', () => navigateGeneralCalendar(1));
        $('#gcExportPdfBtn').addEventListener('click', exportGCToPdf);
        $('#gcCopyTableBtn').addEventListener('click', copyGCTable);
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') { closeModal(); closeEnvPopover(); }
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                handleSaveConfig();
            }
        });
        window.addEventListener('beforeunload', (e) => {
            // Don't warn during SSO login flow or unauthorized screens
            if (isUnauthorized || !DataManager.getCurrentUser()) return;
            const changes = DynamoService.getModifiedAppEnvs(DataManager.getSchedulesRef());
            if (changes.length > 0) {
                e.preventDefault();
                e.returnValue = 'Hai modifiche non salvate. Sei sicuro di voler uscire?';
                return e.returnValue;
            }
        });
        document.addEventListener('mouseleave', (e) => {
            if (isUnauthorized || !DataManager.getCurrentUser()) return;
            if (e.clientY <= 0) {
                const changes = DynamoService.getModifiedAppEnvs(DataManager.getSchedulesRef());
                if (changes.length > 0 && !unsavedPopupShown) {
                    unsavedPopupShown = true;
                    showUnsavedPopup();
                }
            }
        });
        document.addEventListener('click', e => {
            const popover = $('#envPopover');
            if (popover.style.display !== 'none' && !popover.contains(e.target) && !e.target.closest('#appList .nav-item')) {
                closeEnvPopover();
            }
        });
    }

    // ============================================
    // User Selector & Roles
    // ============================================
    function renderUserSelector() {
        const users = DataManager.getUsers();
        const current = DataManager.getCurrentUser();
        const panel = $('#userSelectorPanel');

        const roleMap = { 'Admin': 'admin', 'Application_owner': 'appowner', 'Read-Only': 'readonly' };
        const roleLabels = { 'Admin': 'Amministratore', 'Application_owner': 'Application Owner', 'Read-Only': 'Sola Lettura' };
        const roleIcons = {
            'Admin': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
            'Application_owner': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
            'Read-Only': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
        };

        const roleCls = current ? roleMap[current.role] || '' : '';
        const roleLabel = current ? roleLabels[current.role] || current.role : '';
        const roleIcon = current ? roleIcons[current.role] || '' : '';

        if (ssoAuthenticated) {
            // SSO mode: show fixed user identity, no dropdown
            panel.innerHTML = `
                <div class="sidebar-label">Autenticato via SSO</div>
                <div class="sso-user-display">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    <span class="sso-user-name">${current ? current.name : 'Sconosciuto'}</span>
                </div>
                <div class="user-role-badge-container">
                    <div class="user-role-badge ${roleCls}" id="userRoleBadge">
                        ${roleIcon}
                        <span>${roleLabel}</span>
                    </div>
                </div>
                <button class="btn-logout" id="logoutBtn">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    Logout
                </button>`;
            $('#logoutBtn').addEventListener('click', async () => {
                const confirmed = await confirmDialog({
                    title: 'Conferma Logout',
                    message: 'Vuoi disconnetterti dalla piattaforma? Le note e i dati locali verranno mantenuti.',
                    confirmLabel: 'Logout',
                    iconType: 'warning',
                    confirmClass: 'btn-primary'
                });
                if (!confirmed) return;
                // Clear SSO session but keep notes, schedules, etc
                clearSSOSession();
                localStorage.removeItem('shutdownScheduler_userId');
                // Reload to show login screen (no auto-login)
                location.reload();
            });
        } else {
            // Local dev mode: show dropdown selector
            let optionsHtml = users.map(u => `<option value="${u.id}" ${current && current.id === u.id ? 'selected' : ''}>${u.name}</option>`).join('');

            panel.innerHTML = `
                <div class="sidebar-label">Utente Attivo</div>
                <select class="user-select" id="userSelect">${optionsHtml}</select>
                <div class="user-role-badge-container">
                    <div class="user-role-badge ${roleCls}" id="userRoleBadge">
                        ${roleIcon}
                        <span>${roleLabel}</span>
                    </div>
                </div>`;

            $('#userSelect').addEventListener('change', e => {
                const user = DataManager.setCurrentUser(e.target.value);
                localStorage.setItem('shutdownScheduler_userId', e.target.value);
                AuditLog.log('Cambio utente', `Selezionato: ${user.name} (${user.role})`);
                applyRoleMode();
                renderAppList();
                renderVMListButton();
                renderHomeDashboard();
                goHome();
                gcActiveFilters.clear();
                gcActiveEnvFilters.clear();
                renderUserSelector();
                updateChangesBadge();
            });
        }
    }

    function applyRoleMode() {
        const current = DataManager.getCurrentUser();
        const readOnly = DataManager.isReadOnly();
        const isAdmin = current && current.role === 'Admin';

        document.body.classList.toggle('read-only', readOnly);
        document.body.classList.toggle('is-admin', isAdmin);

        const existing = document.querySelector('.ro-banner');
        if (existing) existing.remove();

        if (readOnly) {
            const banner = document.createElement('div');
            banner.className = 'ro-banner';
            banner.textContent = 'Modalit\u00e0 sola lettura \u2014 Non puoi modificare le pianificazioni';
            $('main.main-content').prepend(banner);
        }
    }

    // ============================================
    // Navigation
    // ============================================
    function goHome() {
        currentApp = null;
        currentEnv = null;
        currentView = 'home';
        $$('#appList .nav-item').forEach(i => i.classList.remove('active'));
        closeEnvPopover();
        showView('home');
        updateBreadcrumb();
        renderHomeDashboard();
        $$('.sidebar-action-btn').forEach(b => b.classList.remove('active'));
        $('#homeBtn').classList.add('active');
    }

    function showView(view) {
        currentView = view;
        $('#welcomeScreen').style.display = view === 'home' ? 'block' : 'none';
        $('#machinesView').style.display = view === 'machines' ? 'block' : 'none';
        $('#generalCalendarView').style.display = view === 'general-calendar' ? 'block' : 'none';
        const vmView = document.getElementById('vmListView');
        if (vmView) vmView.style.display = view === 'vm-list' ? 'block' : 'none';
        const ebsView = document.getElementById('ebsListView');
        if (ebsView) ebsView.style.display = view === 'ebs-list' ? 'block' : 'none';
        const userMgmtView = document.getElementById('userMgmtView');
        if (userMgmtView) userMgmtView.style.display = view === 'user-mgmt' ? 'block' : 'none';
        const calcView = document.getElementById('calculatorView');
        if (calcView) calcView.style.display = view === 'calculator' ? 'block' : 'none';
        $('#exportBtn').style.display = (view === 'machines' || view === 'general-calendar') ? 'inline-flex' : 'none';
        // Update sidebar active states
        $('#homeBtn').classList.toggle('active', view === 'home');
        $('#generalCalendarBtn').classList.toggle('active', view === 'general-calendar');
        const vmBtn = document.getElementById('vmListBtn');
        if (vmBtn) vmBtn.classList.toggle('active', view === 'vm-list');
        const ebsBtn = document.getElementById('ebsListBtn');
        if (ebsBtn) ebsBtn.classList.toggle('active', view === 'ebs-list');
        const userMgmtBtn = document.getElementById('userMgmtBtn');
        if (userMgmtBtn) userMgmtBtn.classList.toggle('active', view === 'user-mgmt');
        const calcBtn = document.getElementById('calculatorBtn');
        if (calcBtn) calcBtn.classList.toggle('active', view === 'calculator');
    }

    function updateCalendarVisibility() {
        const right = $('#modalBodyRight');
        if (currentRecurring === 'none') {
            right.innerHTML = '';
            const section = createCalendarSection();
            right.appendChild(section);
            renderCalendar();
        } else if (currentRecurring === 'custom') {
            right.innerHTML = `<div class="calendar-hint">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <div class="hint-text">Schedulazione Personalizzata</div>
                <div class="hint-sub">Configura orari diversi per ogni giorno della settimana nel pannello a sinistra</div>
            </div>`;
        } else {
            const label = recurringLabels[currentRecurring];
            right.innerHTML = `<div class="calendar-hint">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                <div class="hint-text">${label}</div>
                <div class="hint-sub">La pianificazione si ripete automaticamente</div>
            </div>`;
        }
    }

    function createCalendarSection() {
        const section = document.createElement('div');
        section.className = 'calendar-section';
        section.id = 'calendarSection';
        section.innerHTML = `
            <div class="calendar-header">
                <button class="btn-icon" id="prevMonth"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
                <h4 id="calendarMonthYear"></h4>
                <button class="btn-icon" id="nextMonth"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>
            </div>
            <div class="calendar-weekdays"><span>Lun</span><span>Mar</span><span>Mer</span><span>Gio</span><span>Ven</span><span>Sab</span><span>Dom</span></div>
            <div class="calendar-grid" id="calendarGrid"></div>
            <div class="calendar-actions">
                <button class="btn-clear-selection" id="clearSelection" title="Deseleziona tutto">${SVG.x}</button>
            </div>`;
        section.querySelector('#prevMonth').addEventListener('click', () => navigateMonth(-1));
        section.querySelector('#nextMonth').addEventListener('click', () => navigateMonth(1));
        section.querySelector('#clearSelection').addEventListener('click', () => { selectedDates.clear(); renderCalendar(); });
        return section;
    }

    // ============================================
    // Sidebar: Apps
    // ============================================
    function renderAppList() {
        const apps = DataManager.getApplications();
        const container = $('#appList');
        container.innerHTML = '';
        apps.forEach((app, i) => {
            const color = appColors[i % appColors.length];
            const perm = DataManager.getAppPermission(app.name);
            const isRo = perm === 'ro';
            const item = document.createElement('div');
            item.className = 'nav-item';
            item.dataset.app = app.name;
            item.innerHTML = `
                <div class="nav-icon" style="color:${color};background:${color}12;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                </div>
                <span class="nav-label">${app.name}</span>
                ${isRo ? '<span class="nav-ro-tag">RO</span>' : ''}
                <span class="nav-badge">${app.machineCount}</span>`;
            item.addEventListener('click', e => {
                e.stopPropagation();
                selectApp(app.name, item);
            });
            container.appendChild(item);
        });
    }

    function renderVMListButton() {
        // Remove old button if present
        const old = document.getElementById('vmListBtn');
        if (old) old.remove();
        if (!DataManager.canViewVMList()) return;
        const navActions = document.querySelector('.sidebar-nav-actions');
        const btn = document.createElement('button');
        btn.className = 'sidebar-action-btn';
        btn.id = 'vmListBtn';
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg> Elenco VM`;
        btn.addEventListener('click', showVMList);
        navActions.appendChild(btn);
    }

    function renderEBSListButton() {
        const old = document.getElementById('ebsListBtn');
        if (old) old.remove();
        if (!DataManager.canViewEBSList()) return;
        const navActions = document.querySelector('.sidebar-nav-actions');
        const btn = document.createElement('button');
        btn.className = 'sidebar-action-btn';
        btn.id = 'ebsListBtn';
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg> Elenco Dischi AWS`;
        btn.addEventListener('click', showEBSList);
        navActions.appendChild(btn);
    }

    function renderCalculatorButton() {
        const old = document.getElementById('calculatorBtn');
        if (old) old.remove();
        if (!DataManager.canViewCalculator()) return;
        const navActions = document.querySelector('.sidebar-nav-actions');
        const btn = document.createElement('button');
        btn.className = 'sidebar-action-btn';
        btn.id = 'calculatorBtn';
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="10" y2="10"/><line x1="12" y1="10" x2="14" y2="10"/><line x1="16" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="10" y2="14"/><line x1="12" y1="14" x2="14" y2="14"/><line x1="16" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="10" y2="18"/><line x1="12" y1="18" x2="16" y2="18"/></svg> Calcolatore`;
        btn.addEventListener('click', showCalculator);
        navActions.appendChild(btn);
    }

    function renderUserMgmtButton() {
        const old = document.getElementById('userMgmtBtn');
        if (old) old.remove();
        const current = DataManager.getCurrentUser();
        if (!current || current.role !== 'Admin') return;
        const navActions = document.querySelector('.sidebar-nav-actions');
        const btn = document.createElement('button');
        btn.className = 'sidebar-action-btn';
        btn.id = 'userMgmtBtn';
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> Gestisci Utenti`;
        btn.addEventListener('click', showUserManagement);
        navActions.appendChild(btn);
    }

    function selectApp(appName, itemEl) {
        _log('INFO', 'Nav', 'Selezione applicazione', { app: appName });
        currentApp = appName;
        currentEnv = null;
        $$('#appList .nav-item').forEach(i => i.classList.toggle('active', i.dataset.app === appName));
        $$('.sidebar-action-btn').forEach(b => b.classList.remove('active'));
        updateBreadcrumb(appName);
        showEnvPopover(itemEl, appName);
    }

    // ============================================
    // Environment Popover
    // ============================================
    function showEnvPopover(anchorEl, appName) {
        const popover = $('#envPopover');
        const list = $('#envPopoverList');
        const envs = DataManager.getEnvironments(appName);

        list.innerHTML = '';
        envs.forEach(env => {
            const cssClass = envClassMap[env.name] || 'dev';
            const hasSchedules = DataManager.envHasSchedules(appName, env.name);
            const item = document.createElement('div');
            item.className = 'env-popover-item' + (currentEnv === env.name ? ' active' : '');
            item.innerHTML = `<span class="env-dot ${cssClass}"></span><span>${env.name}</span><span class="env-popover-badge">${env.machineCount}${hasSchedules ? ' \u2713' : ''}</span>`;
            item.addEventListener('click', () => {
                selectEnv(env.name);
                list.querySelectorAll('.env-popover-item').forEach(el => el.classList.remove('active'));
                item.classList.add('active');
            });
            list.appendChild(item);
        });

        const rect = anchorEl.getBoundingClientRect();
        const sidebarWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width'));
        popover.style.left = (sidebarWidth + 8) + 'px';
        popover.style.top = Math.min(rect.top, window.innerHeight - 300) + 'px';
        popover.style.display = 'block';
    }

    function closeEnvPopover() { $('#envPopover').style.display = 'none'; }

    function selectEnv(envName) {
        _log('INFO', 'Nav', 'Selezione ambiente', { app: currentApp, env: envName });
        currentEnv = envName;
        closeEnvPopover();
        updateBreadcrumb(currentApp, envName);
        renderMachines(currentApp, envName);
        showView('machines');
    }

    // ============================================
    // Breadcrumb
    // ============================================
    function updateBreadcrumb(app, env) {
        const bc = $('#breadcrumb');
        if (!app) bc.innerHTML = '<span class="breadcrumb-item active">Dashboard</span>';
        else if (!env) bc.innerHTML = `<span class="breadcrumb-item">${app}</span><span class="breadcrumb-separator">/</span><span class="breadcrumb-item active">Seleziona un ambiente</span>`;
        else {
            const isRo = DataManager.isAppReadOnly(app) || DataManager.isReadOnly();
            bc.innerHTML = `<span class="breadcrumb-item">${app}</span><span class="breadcrumb-separator">/</span><span class="breadcrumb-item active">${env}</span>${isRo ? '<span class="breadcrumb-ro">Sola Lettura</span>' : ''}`;
        }
    }

    // ============================================
    // Home Dashboard (Rich)
    // ============================================
    function renderHomeDashboard() {
        const screen = $('#welcomeScreen');
        const messages = DataManager.getMessages();
        const recentLogs = AuditLog.getLogs().slice(0, 5);
        const apps = DataManager.getApplications();
        const user = DataManager.getCurrentUser();
        const firstName = user ? user.name.split(' ')[0] : 'Utente';
        const hour = new Date().getHours();
        const greeting = hour < 12 ? 'Buongiorno' : hour < 18 ? 'Buon pomeriggio' : 'Buonasera';

        let html = `
            <div class="home-header">
                <div class="home-title">
                    <div>
                        <div class="home-greeting">${greeting},</div>
                        <h1 class="home-user-name">${firstName}!</h1>
                        <p class="home-tool-desc">Pianifica e coordina i periodi di shutdown e accensione degli ambienti applicativi, incrociando i dati con gli altri Application Owner per evitare conflitti e gestire le dipendenze tra applicazioni.</p>
                    </div>
                </div>
            </div>`;

        // System Messages
        if (messages.length > 0) {
            html += '<div class="home-messages">';
            messages.forEach(m => {
                const typeIcon = m.type === 'warning' ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
                    : m.type === 'success' ? SVG.check
                    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
                html += `<div class="home-message ${m.type}">
                    <div class="home-message-icon">${typeIcon}</div>
                    <div class="home-message-content">
                        <div class="home-message-title">${m.title}</div>
                        <div class="home-message-text">${m.text}</div>
                        <div class="home-message-date">${m.date}</div>
                    </div>
                </div>`;
            });
            html += '</div>';
        }

        // Two-column layout: Apps (left) + Activity (right)
        html += '<div class="home-columns">';

        // Left column — Operational Overview
        html += '<div class="home-col-left">';

        // Stats
        const stats = DataManager.getStats();
        const upcoming = DataManager.getUpcomingSchedules(7);
        const recurringCount = upcoming.filter(u => u.recurring).length;
        const oneTimeCount = upcoming.filter(u => !u.recurring).length;

        html += '<div class="home-section-title">Panoramica Operativa</div>';
        html += '<div class="home-stats-grid">';
        html += `<div class="home-stat-card"><div class="home-stat-value">${stats.scheduledMachines}</div><div class="home-stat-label">VM Pianificate</div></div>`;
        html += `<div class="home-stat-card"><div class="home-stat-value">${stats.totalSchedules}</div><div class="home-stat-label">Schedulazioni Attive</div></div>`;
        html += `<div class="home-stat-card"><div class="home-stat-value">${recurringCount}</div><div class="home-stat-label">Ricorrenti</div></div>`;
        html += `<div class="home-stat-card"><div class="home-stat-value">${oneTimeCount}</div><div class="home-stat-label">Una Tantum (7gg)</div></div>`;
        html += '</div>';

        // Upcoming actions
        html += '<div class="home-section-title" style="margin-top:20px;">Prossime Azioni (7 giorni)</div>';
        if (upcoming.length === 0) {
            html += '<div class="home-empty">Nessuna schedulazione attiva nei prossimi 7 giorni</div>';
        } else {
            html += '<div class="home-upcoming-list">';
            const upcomingDisplay = upcoming.slice(0, 8);
            upcomingDisplay.forEach(u => {
                const isRecurring = u.recurring;
                const schedLabel = u.entry.type === 'shutdown' ? 'Shutdown' : `${u.entry.startTime || '?'} — ${u.entry.stopTime || '?'}`;
                const recLabel = isRecurring ? (recurringLabels[u.entry.recurring] || u.entry.recurring) : (u.dates ? u.dates.slice(0, 2).join(', ') : '');
                const envCls = envClassMap[u.env] || 'dev';
                html += `<div class="home-upcoming-item">
                    <div class="home-upcoming-indicator ${u.entry.type === 'shutdown' ? 'shutdown' : 'window'}"></div>
                    <div class="home-upcoming-info">
                        <div class="home-upcoming-main">${u.app} <span class="home-upcoming-sep">/</span> ${u.env}</div>
                        <div class="home-upcoming-detail"><code>${u.hostname}</code> — ${schedLabel}</div>
                    </div>
                    <div class="home-upcoming-badge">${recLabel}</div>
                </div>`;
            });
            if (upcoming.length > 8) {
                html += `<div class="home-upcoming-more">+ ${upcoming.length - 8} altre schedulazioni</div>`;
            }
            html += '</div>';
        }

        // Coverage by environment
        const envCoverage = {};
        DataManager.getAllSchedulesFlat().forEach(s => {
            const key = `${s.app}|${s.env}`;
            if (!envCoverage[key]) envCoverage[key] = { app: s.app, env: s.env, count: 0 };
            envCoverage[key].count++;
        });
        const coverageList = Object.values(envCoverage).sort((a, b) => b.count - a.count).slice(0, 6);
        if (coverageList.length > 0) {
            html += '<div class="home-section-title" style="margin-top:20px;">Copertura Ambienti</div>';
            html += '<div class="home-coverage-list">';
            coverageList.forEach(c => {
                const envColor = envColors[c.env] || '#7a7a96';
                html += `<div class="home-coverage-item">
                    <span class="home-coverage-dot" style="background:${envColor}"></span>
                    <span class="home-coverage-name">${c.app} / ${c.env}</span>
                    <span class="home-coverage-count">${c.count} sched.</span>
                </div>`;
            });
            html += '</div>';
        }

        html += '</div>';

        // Right column — Recent Activity
        html += '<div class="home-col-right">';
        html += '<div class="home-section-title">Attivit\u00e0 Recente</div>';
        if (recentLogs.length === 0) {
            html += '<div class="home-empty">Nessuna attivit\u00e0 registrata</div>';
        } else {
            html += '<div class="home-activity">';
            recentLogs.forEach(l => {
                html += `<div class="home-activity-item">
                    <div class="home-activity-time">${AuditLog.formatTimestamp(l.timestamp)}</div>
                    <div class="home-activity-text"><strong>${l.action}</strong> &mdash; ${l.details}</div>
                </div>`;
            });
            html += '</div>';
        }
        html += '</div>';

        html += '</div>'; // close home-columns

        screen.innerHTML = html;
    }

    // ============================================
    // Machine Grid
    // ============================================
    function renderMachines(appName, envName) {
        const machines = DataManager.getMachines(appName, envName);
        const grid = $('#machineGrid');
        const readOnly = DataManager.isReadOnly() || DataManager.isAppReadOnly(appName) || DataManager.isEnvReadOnly(appName, envName);
        const stats = DataManager.getEnvScheduleStats(appName, envName);
        const hasSchedules = stats.scheduled > 0;

        grid.innerHTML = '';
        $('#envTitle').innerHTML = `<span class="env-title-app">${appName}</span><span class="env-title-sep">/</span>${envName}`;
        $('#machineCount').innerHTML = `${machines.length} server <span class="env-stats-badge ${hasSchedules ? 'has-schedules' : ''}">${stats.scheduled}/${stats.total} pianificati</span>`;

        // Search + Pianifica Ambiente row
        let controlsRow = document.querySelector('.machine-controls-row');
        if (!controlsRow) {
            controlsRow = document.createElement('div');
            controlsRow.className = 'machine-controls-row';
            grid.parentNode.insertBefore(controlsRow, grid);
        }
        controlsRow.innerHTML = `
            <div class="machine-search-bar">
                <input type="text" class="machine-search-input" placeholder="Cerca server per nome o hostname..." id="machineSearch">
            </div>
            ${!readOnly ? `<button class="btn-accent-highlight" id="planEnvBtn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Pianifica Ambiente
            </button>` : ''}
            <button class="btn-secondary btn-blackout" id="blackoutBtn" title="Gestisci periodi di blackout">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="9" y1="16" x2="15" y2="16"/></svg>
                Blackout
            </button>`;

        // Remove old search bar if exists
        const oldSearchBar = document.querySelector('.machine-search-bar:not(.machine-controls-row .machine-search-bar)');
        if (oldSearchBar) oldSearchBar.remove();

        const searchInput = controlsRow.querySelector('#machineSearch');
        searchInput.value = '';
        searchInput.oninput = () => filterMachines(searchInput.value);

        const planBtn = controlsRow.querySelector('#planEnvBtn');
        if (planBtn) planBtn.addEventListener('click', () => openModal('environment'));

        const blackoutBtn = controlsRow.querySelector('#blackoutBtn');
        if (blackoutBtn) blackoutBtn.addEventListener('click', () => openBlackoutPanel(appName, envName));

        // Hide the original applyAllBtn
        const origBtn = $('#applyAllBtn');
        if (origBtn) origBtn.style.display = 'none';

        // Env Groups Section
        const envGroups = DataManager.getEnvGroups(appName, envName);
        let envGroupsContainer = document.querySelector('.env-groups-section');
        if (envGroupsContainer) envGroupsContainer.remove();
        if (envGroups.length > 0) {
            envGroupsContainer = document.createElement('div');
            envGroupsContainer.className = 'env-groups-section';
            envGroupsContainer.innerHTML = `<div class="env-groups-title">Schedulazioni Ambiente</div>` +
                envGroups.map(g => {
                    const e = g.entry;
                    let typeLabel;
                    if (e.type === 'shutdown') typeLabel = 'Shutdown Completo';
                    else if (e.recurring === 'custom' && e.daySchedules) typeLabel = `Personalizzato (${Object.keys(e.daySchedules).length} gg)`;
                    else typeLabel = `${e.startTime} \u2014 ${e.stopTime}`;
                    const recLabel = e.recurring && e.recurring !== 'none' ? (recurringLabels[e.recurring] || e.recurring) : e.dates && e.dates.length > 0 ? `${e.dates.length} giorni specifici` : '';
                    const excluded = g.totalMachines - g.hostnames.length;
                    return `<div class="env-group-card" data-group-id="${g.groupId}">
                        <div class="env-group-info">
                            <div class="env-group-type">${typeLabel}</div>
                            <div class="env-group-detail">${recLabel} &middot; ${g.hostnames.length}/${g.totalMachines} server${excluded > 0 ? ` (${excluded} esclusi)` : ''}</div>
                        </div>
                        ${!readOnly ? `<div class="env-group-actions">
                            ${excluded > 0 ? `<button class="btn-secondary env-group-reinclude-btn" data-group-id="${g.groupId}" style="padding:6px 12px;font-size:0.78rem;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg> Re-includi (${excluded})</button>` : ''}
                            <button class="btn-secondary env-group-edit-btn" data-group-id="${g.groupId}" style="padding:6px 12px;font-size:0.78rem;">${SVG.edit} Modifica</button>
                            <button class="btn-entry-action delete-entry-btn env-group-delete-btn" data-group-id="${g.groupId}" title="Elimina schedulazione ambiente">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                        </div>` : ''}
                    </div>`;
                }).join('');
            grid.parentNode.insertBefore(envGroupsContainer, grid);

            // Re-include excluded VMs — selection dialog
            envGroupsContainer.querySelectorAll('.env-group-reinclude-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const gid = btn.dataset.groupId;
                    const group = envGroups.find(g => g.groupId === gid);
                    if (!group) return;

                    // Find excluded machines
                    const allMachines = DataManager.getMachines(appName, envName);
                    const includedSet = new Set(group.hostnames);
                    const excludedMachines = allMachines.filter(m => !includedSet.has(m.hostname));
                    if (excludedMachines.length === 0) return;

                    // Build checkbox list
                    const checkboxesHtml = excludedMachines.map(m =>
                        `<label class="reinclude-item">
                            <input type="checkbox" value="${m.hostname}" checked>
                            <span class="reinclude-name">${m.machine_name}</span>
                            <code class="reinclude-host">${m.hostname}</code>
                            <span class="reinclude-type">${m.server_type.replace(' Server','')}</span>
                        </label>`
                    ).join('');

                    const result = await new Promise(resolve => {
                        const overlay = document.createElement('div');
                        overlay.className = 'confirm-overlay';
                        overlay.innerHTML = `
                            <div class="confirm-dialog confirm-dialog-wide">
                                <div class="confirm-dialog-icon"><div class="icon-circle accent">${SVG.alert}</div></div>
                                <div class="confirm-dialog-body">
                                    <h4>Re-includi server nella schedulazione</h4>
                                    <p>Seleziona i server da re-includere nella schedulazione ambiente:</p>
                                    <div class="reinclude-list">${checkboxesHtml}</div>
                                    <label class="reinclude-select-all"><input type="checkbox" id="reincludeSelectAll" checked> <strong>Seleziona/Deseleziona tutti</strong></label>
                                </div>
                                <div class="confirm-dialog-actions">
                                    <button class="btn-secondary confirm-cancel">Annulla</button>
                                    <button class="btn-primary confirm-ok">Re-includi selezionati</button>
                                </div>
                            </div>`;
                        document.body.appendChild(overlay);

                        // Select all toggle
                        const selectAllCb = overlay.querySelector('#reincludeSelectAll');
                        selectAllCb.addEventListener('change', () => {
                            overlay.querySelectorAll('.reinclude-item input').forEach(cb => { cb.checked = selectAllCb.checked; });
                        });

                        const close = (val) => { overlay.remove(); resolve(val); };
                        overlay.querySelector('.confirm-cancel').addEventListener('click', () => close(null));
                        overlay.querySelector('.confirm-ok').addEventListener('click', () => {
                            const selected = [...overlay.querySelectorAll('.reinclude-item input:checked')].map(cb => cb.value);
                            close(selected);
                        });
                        overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
                    });

                    if (!result || result.length === 0) return;

                    DataManager.reincludeSpecificInEnvGroup(appName, envName, gid, result);
                    AuditLog.log('Re-inclusi server', `${result.length} server in ${appName} / ${envName}`);
                    renderMachines(currentApp, currentEnv);
                    updateChangesBadge();
                    showToast(`${result.length} server re-inclusi`, 'success');
                });
            });

            // Env group event handlers
            envGroupsContainer.querySelectorAll('.env-group-edit-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const gid = btn.dataset.groupId;
                    const group = envGroups.find(g => g.groupId === gid);
                    if (!group) return;
                    openModal('environment-edit', null, null, group);
                });
            });
            envGroupsContainer.querySelectorAll('.env-group-delete-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const confirmed = await confirmDialog({
                        title: 'Eliminare schedulazione ambiente?',
                        message: 'Questa azione rimuover\u00e0 la schedulazione da tutti i server dell\'ambiente.',
                        confirmLabel: 'Elimina',
                        iconType: 'danger'
                    });
                    if (!confirmed) return;
                    DataManager.removeEnvGroup(appName, envName, btn.dataset.groupId);
                    AuditLog.log('Eliminazione schedulazione ambiente', `${appName} / ${envName}`);
                    renderMachines(currentApp, currentEnv);
                    renderHomeDashboard();
                    updateChangesBadge();
                    showToast('Schedulazione ambiente rimossa', 'info');
                });
            });
        }

        // Group machines by server type
        const typeOrder = ['Web Server', 'Application Server', 'Database Server'];
        const groupedMachines = {};
        machines.forEach(m => {
            const t = m.server_type || 'Application Server';
            if (!groupedMachines[t]) groupedMachines[t] = [];
            groupedMachines[t].push(m);
        });
        const typeLabels = { 'Web Server': 'Web Server', 'Application Server': 'Application Server', 'Database Server': 'Database Server' };
        const typeIcons = { 'Web Server': 'web', 'Application Server': 'app', 'Database Server': 'db' };

        const sortedTypes = typeOrder.filter(t => groupedMachines[t]);
        // Add any types not in the predefined order
        Object.keys(groupedMachines).forEach(t => { if (!sortedTypes.includes(t)) sortedTypes.push(t); });

        sortedTypes.forEach(serverType => {
            const groupMachines = groupedMachines[serverType];
            const groupHeader = document.createElement('div');
            groupHeader.className = 'machine-group-header';
            const tIcon = typeIcons[serverType] || 'app';
            groupHeader.innerHTML = `<span class="machine-group-icon ${tIcon}">${serverIcons[serverType] || serverIcons['Application Server']}</span><span class="machine-group-label">${typeLabels[serverType] || serverType}</span><span class="machine-group-count">${groupMachines.length}</span>`;
            grid.appendChild(groupHeader);

            groupMachines.forEach(m => {
                renderMachineCard(m, appName, envName, readOnly, grid);
            });
        });
    }

    function renderMachineCard(m, appName, envName, readOnly, grid) {
            const entries = DataManager.getScheduleEntries(appName, envName, m.hostname);
            const notesArr = DataManager.getNotes(m.hostname);
            const typeClass = m.server_type.includes('Web') ? 'web' : m.server_type.includes('Application') ? 'app' : 'db';
            const icon = serverIcons[m.server_type] || serverIcons['Application Server'];
            const desc = m.description || '';

            const card = document.createElement('div');
            card.className = 'machine-card';
            card.dataset.search = `${m.machine_name} ${m.hostname} ${m.server_type}`.toLowerCase();
            card.innerHTML = `
                <div class="machine-card-header">
                    <div class="machine-type-icon ${typeClass}">${icon}</div>
                    <div class="machine-card-title">
                        <h4>${m.machine_name}</h4>
                        <div class="hostname-row">
                            <span class="hostname" data-hostname="${m.hostname}" title="Clicca per copiare">${m.hostname}</span>
                            <button class="copy-btn" data-hostname="${m.hostname}" title="Copia hostname">${SVG.copy}</button>
                        </div>
                    </div>
                    <button class="btn-vm-refresh" data-hostname="${m.hostname}" title="Aggiorna stato VM">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                    </button>
                </div>
                <div class="machine-card-body" data-server-type="${m.server_type}" data-description="${desc}">
                    <div class="entries-list">${renderEntriesList(entries, m.hostname, readOnly)}</div>
                    ${renderNotesSection(m.hostname, notesArr, readOnly)}
                </div>
                ${!readOnly ? `<div class="machine-card-footer">
                    <button class="btn-primary add-entry-btn" data-hostname="${m.hostname}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Aggiungi Pianificazione
                    </button>
                    <button class="btn-secondary add-note-btn" data-hostname="${m.hostname}">
                        ${SVG.note}
                        Nota
                    </button>
                </div>` : ''}`;

            // Copy hostname (both click on hostname text and copy button)
            const copyAction = async (hn) => {
                try {
                    await navigator.clipboard.writeText(hn);
                    showToast('Copiato negli appunti: ' + hn, 'success');
                } catch { /* ignore */ }
            };
            card.querySelector('.hostname').addEventListener('click', (e) => copyAction(e.currentTarget.dataset.hostname));
            card.querySelector('.copy-btn').addEventListener('click', (e) => copyAction(e.currentTarget.dataset.hostname));

            if (!readOnly) {
                const addBtn = card.querySelector('.add-entry-btn');
                if (addBtn) addBtn.addEventListener('click', () => openModal('machine', m.hostname));

                const noteBtn = card.querySelector('.add-note-btn');
                if (noteBtn) noteBtn.addEventListener('click', () => promptAddNote(m.hostname));
            }

            card.querySelectorAll('.edit-entry-btn').forEach(btn => btn.addEventListener('click', () => openModal('machine', m.hostname, btn.dataset.entryId)));

            card.querySelectorAll('.exclude-env-btn').forEach(btn => btn.addEventListener('click', async () => {
                const confirmed = await confirmDialog({
                    title: 'Escludi da schedulazione ambiente?',
                    message: `Vuoi escludere <strong>${m.machine_name}</strong> dalla schedulazione ambiente? Gli altri server non saranno modificati.`,
                    confirmLabel: 'Escludi',
                    iconType: 'warning',
                    confirmClass: 'btn-primary'
                });
                if (!confirmed) return;
                DataManager.excludeFromEnvGroup(appName, envName, m.hostname, btn.dataset.groupId);
                AuditLog.log('Server escluso da schedulazione ambiente', `${m.hostname} (${appName} / ${envName})`);
                renderMachines(currentApp, currentEnv);
                updateChangesBadge();
                showToast(`${m.machine_name} escluso dalla schedulazione ambiente`, 'info');
            }));

            card.querySelectorAll('.delete-entry-btn').forEach(btn => btn.addEventListener('click', async () => {
                const confirmed = await confirmDialog({
                    title: 'Conferma Eliminazione',
                    message: `Vuoi eliminare questa pianificazione per <strong>${m.machine_name}</strong>?`,
                    confirmLabel: 'Elimina',
                    iconType: 'danger'
                });
                if (!confirmed) return;
                AuditLog.log('Eliminazione entry', `${appName} / ${envName} / ${m.hostname}`);
                DataManager.removeScheduleEntry(appName, envName, m.hostname, btn.dataset.entryId);
                renderMachines(currentApp, currentEnv);
                renderHomeDashboard();
                updateChangesBadge();
                showToast('Entry rimossa', 'info');
            }));

            // Note actions
            card.querySelectorAll('.edit-note-btn').forEach(btn => btn.addEventListener('click', () => {
                promptEditNote(m.hostname, btn.dataset.noteId);
            }));
            card.querySelectorAll('.delete-note-btn').forEach(btn => btn.addEventListener('click', async () => {
                const confirmed = await confirmDialog({
                    title: 'Eliminare nota?',
                    message: 'Questa azione non pu\u00f2 essere annullata.',
                    confirmLabel: 'Elimina',
                    iconType: 'danger'
                });
                if (!confirmed) return;
                DataManager.deleteNote(m.hostname, btn.dataset.noteId);
                AuditLog.log('Nota eliminata', m.hostname);
                renderMachines(currentApp, currentEnv);
                showToast('Nota eliminata', 'info');
            }));

            const vmRefreshBtn = card.querySelector('.btn-vm-refresh');
            if (vmRefreshBtn) {
                vmRefreshBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const btn = e.currentTarget;
                    if (btn.classList.contains('vm-refresh-cooldown')) return;
                    btn.classList.add('spinning');
                    try {
                        // Fetch fresh data from DynamoDB for this app/env (same logic as global refresh)
                        if (DynamoService.CONFIG.enabled) {
                            const key = DynamoService.appEnvKey(appName, envName);
                            const items = await DynamoService.fetchAll([key]);
                            if (items && items[key]) {
                                // Authoritative: clear local schedules for this app/env, then merge DynamoDB data
                                const prefix = `${appName}|${envName}|`;
                                const schedulesRef = DataManager.getSchedulesRef();
                                Object.keys(schedulesRef).forEach(k => { if (k.startsWith(prefix)) delete schedulesRef[k]; });
                                DynamoService.mergeIntoSchedules(schedulesRef, appName, envName, items[key]);
                                DataManager.saveSchedulesToStoragePublic();
                            }
                        }
                        // Re-render only this card in-place
                        const parent = card.parentNode;
                        if (parent) {
                            const fakeGrid = { appendChild: (c) => parent.replaceChild(c, card) };
                            renderMachineCard(m, appName, envName, readOnly, fakeGrid);
                        }
                        updateChangesBadge();
                        showToast(`${m.machine_name} aggiornato`, 'success');
                    } catch (err) {
                        _log('ERROR', 'VMRefresh', 'Errore aggiornamento VM', { hostname: m.hostname, error: err.message });
                        showToast('Errore durante l\'aggiornamento', 'error');
                    } finally {
                        btn.classList.remove('spinning');
                        btn.classList.add('vm-refresh-cooldown');
                        setTimeout(() => btn.classList.remove('vm-refresh-cooldown'), 5000);
                    }
                });
            }

            grid.appendChild(card);
    }

    function filterMachines(query) {
        const q = query.toLowerCase();
        $$('.machine-card').forEach(card => {
            card.classList.toggle('hidden', q && !card.dataset.search.includes(q));
        });
    }

    function renderEntriesList(entries, hostname, readOnly) {
        if (entries.length === 0) {
            return `<div class="machine-schedule-summary"><div class="schedule-badge none">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                Nessuna pianificazione</div></div>`;
        }
        return entries.map(entry => {
            let typeLabel;
            if (entry.type === 'shutdown') {
                typeLabel = 'Shutdown Completo';
            } else if (entry.recurring === 'custom' && entry.daySchedules) {
                const days = Object.keys(entry.daySchedules);
                typeLabel = `Personalizzato (${days.length} giorni)`;
            } else {
                typeLabel = `${entry.startTime} \u2014 ${entry.stopTime}`;
            }
            const recurring = entry.recurring && entry.recurring !== 'none';
            let detailHtml = '';
            if (entry.recurring === 'custom' && entry.daySchedules) {
                const dayLines = Object.entries(entry.daySchedules).map(([d, ds]) => {
                    const dayName = ['','Lun','Mar','Mer','Gio','Ven','Sab','Dom'][Number(d)] || d;
                    return `<span class="custom-day-badge">${dayName} ${ds.startTime}-${ds.stopTime}</span>`;
                }).join(' ');
                detailHtml = `<div class="schedule-info">${dayLines}</div>`;
            } else if (recurring) {
                detailHtml = `<div class="schedule-info">Ricorrente: <strong>${recurringLabels[entry.recurring]}</strong></div>`;
            } else if (entry.dates && entry.dates.length > 0) {
                const parts = formatDatesDetail(entry.dates);
                if (parts.length === 1) detailHtml = `<div class="schedule-info">${parts[0]}</div>`;
                else detailHtml = `<div class="schedule-dates-detail"><ul>${parts.map(p => `<li>${p}</li>`).join('')}</ul></div>`;
            }

            const envTag = entry.envGroupId ? '<span class="entry-env-tag">Ambiente</span>' : '';
            const excludeBtn = (!readOnly && entry.envGroupId) ? `<button class="btn-entry-action exclude-env-btn" data-group-id="${entry.envGroupId}" data-hostname="${hostname}" title="Rimuovi dalla schedulazione ambiente"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg></button>` : '';
            const actionsHtml = readOnly ? '' : `
                <div class="schedule-entry-actions">
                    ${excludeBtn}
                    <button class="btn-entry-action edit-entry-btn" data-entry-id="${entry.id}" title="Modifica">${SVG.edit}</button>
                    <button class="btn-entry-action delete-entry-btn" data-entry-id="${entry.id}" title="Elimina">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>`;

            return `<div class="schedule-entry-item">
                <div class="schedule-entry-info">
                    <div class="schedule-badge active">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        ${typeLabel}
                    </div>
                    ${envTag}
                    ${detailHtml}
                </div>
                ${actionsHtml}
            </div>`;
        }).join('');
    }

    // ============================================
    // Notes Section
    // ============================================
    function renderNotesSection(hostname, notesArr, readOnly) {
        if (notesArr.length === 0) return '';
        let html = '<div class="notes-section">';
        html += `<div class="notes-header">${SVG.note} <span>Note (${notesArr.length})</span><span class="notes-private-hint">privata &middot; solo locale</span></div>`;
        notesArr.forEach(n => {
            const date = new Date(n.timestamp);
            const timeStr = `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
            html += `<div class="note-item">
                <div class="note-content">${n.text}</div>
                <div class="note-meta">
                    <span>${n.user} &middot; ${timeStr}</span>
                    ${!readOnly ? `<div class="note-actions">
                        <button class="btn-entry-action edit-note-btn" data-note-id="${n.id}" title="Modifica">${SVG.edit}</button>
                        <button class="btn-entry-action delete-note-btn" data-note-id="${n.id}" title="Elimina">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>` : ''}
                </div>
            </div>`;
        });
        html += '</div>';
        return html;
    }

    function promptAddNote(hostname) {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.innerHTML = `
            <div class="confirm-dialog" style="max-width:480px;">
                <div class="confirm-dialog-body" style="padding:24px 24px 8px;text-align:left;">
                    <h4>Aggiungi Nota</h4>
                    <p style="margin-bottom:8px;">Inserisci una nota per <strong>${hostname}</strong></p>
                    <div class="note-privacy-box"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Le note sono private e salvate solo localmente nel tuo browser.</div>
                    <textarea class="note-textarea" id="noteInput" rows="3" placeholder="Scrivi qui la nota..."></textarea>
                </div>
                <div class="confirm-dialog-actions">
                    <button class="btn-secondary confirm-cancel">Annulla</button>
                    <button class="btn-primary confirm-ok">Salva Nota</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        const input = overlay.querySelector('#noteInput');
        input.focus();

        overlay.querySelector('.confirm-cancel').addEventListener('click', close);
        overlay.querySelector('.confirm-ok').addEventListener('click', () => {
            const text = input.value.trim();
            if (!text) return;
            DataManager.addNote(hostname, text);
            AuditLog.log('Nota aggiunta', hostname);
            close();
            renderMachines(currentApp, currentEnv);
            showToast('Nota aggiunta', 'success');
        });
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    }

    function promptEditNote(hostname, noteId) {
        const notesArr = DataManager.getNotes(hostname);
        const note = notesArr.find(n => n.id === noteId);
        if (!note) return;

        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.innerHTML = `
            <div class="confirm-dialog" style="max-width:480px;">
                <div class="confirm-dialog-body" style="padding:24px 24px 8px;text-align:left;">
                    <h4>Modifica Nota</h4>
                    <textarea class="note-textarea" id="noteInput" rows="3">${note.text}</textarea>
                </div>
                <div class="confirm-dialog-actions">
                    <button class="btn-secondary confirm-cancel">Annulla</button>
                    <button class="btn-primary confirm-ok">Salva</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        const input = overlay.querySelector('#noteInput');
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);

        overlay.querySelector('.confirm-cancel').addEventListener('click', close);
        overlay.querySelector('.confirm-ok').addEventListener('click', () => {
            const text = input.value.trim();
            if (!text) return;
            DataManager.updateNote(hostname, noteId, text);
            AuditLog.log('Nota modificata', hostname);
            close();
            renderMachines(currentApp, currentEnv);
            showToast('Nota aggiornata', 'success');
        });
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    }

    // ============================================
    // Modal
    // ============================================
    function openModal(type, hostname, entryId, envGroup) {
        if (DataManager.isReadOnly()) return;
        if (currentApp && DataManager.isAppReadOnly(currentApp)) return;
        if (currentApp && currentEnv && DataManager.isEnvReadOnly(currentApp, currentEnv)) return;
        _log('INFO', 'Modal', 'Apertura modale', { type, hostname });
        modalTarget = { type, app: currentApp, env: currentEnv, hostname: hostname || null };
        editingEntryId = entryId || null;

        if (type === 'machine') {
            const machine = DataManager.getMachines(currentApp, currentEnv).find(m => m.hostname === hostname);
            $('#modalTitle').textContent = entryId ? 'Modifica Pianificazione' : 'Nuova Pianificazione';
            $('#modalTarget').innerHTML = `<strong>${machine.machine_name}</strong> \u2014 ${machine.hostname} (${machine.server_type})`;
            if (entryId) {
                const entry = DataManager.getScheduleEntries(currentApp, currentEnv, hostname).find(e => e.id === entryId);
                loadEntryIntoModal(entry);
            } else {
                loadEntryIntoModal(null);
            }
        } else if (type === 'environment-edit' && envGroup) {
            modalTarget.type = 'environment-edit';
            modalTarget.envGroupId = envGroup.groupId;
            $('#modalTitle').textContent = 'Modifica Schedulazione Ambiente';
            $('#modalTarget').innerHTML = `<strong>${currentApp}</strong> \u2014 ${currentEnv} (${envGroup.hostnames.length}/${envGroup.totalMachines} server inclusi)`;
            loadEntryIntoModal(envGroup.entry);
        } else {
            $('#modalTitle').textContent = 'Pianifica Intero Ambiente';
            $('#modalTarget').innerHTML = `<strong>${currentApp}</strong> \u2014 ${currentEnv} (tutti i server)`;
            loadEntryIntoModal(null);
        }

        calendarDate = new Date();
        updateCalendarVisibility();
        $('#scheduleModal').style.display = 'flex';
        // Fullscreen fix: ensure modal is a child of the fullscreen element
        const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
        if (fsEl && !fsEl.contains($('#scheduleModal'))) {
            fsEl.appendChild($('#scheduleModal'));
        }
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        $('#scheduleModal').style.display = 'none';
        document.body.style.overflow = '';
        modalTarget = null;
        editingEntryId = null;
        selectedDates.clear();
    }

    // ============================================
    // Blackout Periods Panel
    // ============================================
    function openBlackoutPanel(appName, envName) {
        _log('INFO', 'Blackout', 'Apertura pannello blackout', { app: appName, env: envName });
        const existing = document.querySelector('.blackout-overlay');
        if (existing) existing.remove();

        const periods = DataManager.getBlackoutPeriods({ app: appName, env: envName });
        const scope = { app: appName, env: envName };

        const overlay = document.createElement('div');
        overlay.className = 'blackout-overlay';
        overlay.innerHTML = `
            <div class="blackout-panel">
                <div class="blackout-header">
                    <h3>Periodi di Blackout</h3>
                    <span class="blackout-subtitle">${appName} / ${envName}</span>
                    <button class="btn-icon blackout-close">&times;</button>
                </div>
                <div class="blackout-info">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <span>Durante i periodi di blackout, tutte le schedulazioni dell'ambiente vengono sospese. Utile per manutenzioni, release freeze o festivit\u00e0.</span>
                </div>
                <div class="blackout-add-form">
                    <div class="blackout-form-row">
                        <div class="blackout-form-field">
                            <label>Data inizio</label>
                            <input type="date" id="blkStartDate" value="${new Date().toISOString().split('T')[0]}">
                        </div>
                        <div class="blackout-form-field">
                            <label>Data fine</label>
                            <input type="date" id="blkEndDate" value="${new Date().toISOString().split('T')[0]}">
                        </div>
                        <div class="blackout-form-field" style="flex:2">
                            <label>Motivo</label>
                            <input type="text" id="blkReason" placeholder="es. Release freeze, manutenzione..." maxlength="200">
                        </div>
                        <button class="btn-primary blackout-add-btn" id="blkAddBtn">Aggiungi</button>
                    </div>
                </div>
                <div class="blackout-list" id="blkList"></div>
            </div>`;
        document.body.appendChild(overlay);

        const renderList = () => {
            const list = overlay.querySelector('#blkList');
            const currentPeriods = DataManager.getBlackoutPeriods(scope);
            if (currentPeriods.length === 0) {
                list.innerHTML = '<div class="blackout-empty">Nessun periodo di blackout attivo</div>';
                return;
            }
            list.innerHTML = currentPeriods.map(p => {
                const isActive = new Date().toISOString().split('T')[0] >= p.startDate && new Date().toISOString().split('T')[0] <= p.endDate;
                return `<div class="blackout-item ${isActive ? 'active' : ''}">
                    <div class="blackout-item-dates">
                        <strong>${p.startDate}</strong> \u2014 <strong>${p.endDate}</strong>
                        ${isActive ? '<span class="blackout-active-badge">ATTIVO</span>' : ''}
                    </div>
                    <div class="blackout-item-reason">${p.reason || 'Nessun motivo specificato'}</div>
                    <button class="blackout-remove-btn" data-id="${p.id}" title="Rimuovi">&times;</button>
                </div>`;
            }).join('');
            list.querySelectorAll('.blackout-remove-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    DataManager.removeBlackoutPeriod(scope, btn.dataset.id);
                    AuditLog.log('Rimosso blackout', `${appName}/${envName} - ID: ${btn.dataset.id}`);
                    showToast('Periodo di blackout rimosso', 'success');
                    renderList();
                });
            });
        };

        renderList();

        overlay.querySelector('#blkAddBtn').addEventListener('click', () => {
            const start = overlay.querySelector('#blkStartDate').value;
            const end = overlay.querySelector('#blkEndDate').value;
            const reason = overlay.querySelector('#blkReason').value.trim();
            if (!start || !end) { showToast('Inserisci date valide', 'error'); return; }
            if (start > end) { showToast('La data di inizio deve essere prima della data di fine', 'error'); return; }
            DataManager.addBlackoutPeriod(scope, start, end, reason);
            AuditLog.log('Aggiunto blackout', `${appName}/${envName}: ${start} - ${end} (${reason})`);
            showToast('Periodo di blackout aggiunto', 'success');
            overlay.querySelector('#blkReason').value = '';
            renderList();
        });

        overlay.querySelector('.blackout-close').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    }

    // Custom per-day schedule state
    let customDaySchedules = {}; // { "1": { startTime, stopTime, enabled }, ... }

    function loadEntryIntoModal(entry) {
        if (entry) {
            currentScheduleType = entry.type;
            currentRecurring = entry.recurring || 'none';
            $$('.schedule-type-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.type === entry.type));
            $('#timeWindowConfig').style.display = entry.type === 'window' && entry.recurring !== 'custom' ? 'block' : 'none';
            if (entry.startTime) setTimePickerValue('startTimePicker', entry.startTime);
            if (entry.stopTime) setTimePickerValue('stopTimePicker', entry.stopTime);
            $$('input[name="recurring"]').forEach(r => { r.checked = r.value === currentRecurring; });
            selectedDates.clear();
            if (entry.dates) entry.dates.forEach(d => selectedDates.add(d));
            // Load custom day schedules
            if (entry.recurring === 'custom' && entry.daySchedules) {
                customDaySchedules = {};
                for (const [day, ds] of Object.entries(entry.daySchedules)) {
                    customDaySchedules[day] = { ...ds, enabled: true };
                }
            } else {
                _initCustomDayDefaults();
            }
        } else {
            currentScheduleType = 'window';
            currentRecurring = 'none';
            $$('.schedule-type-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.type === 'window'));
            $('#timeWindowConfig').style.display = 'block';
            setTimePickerValue('startTimePicker', '08:00');
            setTimePickerValue('stopTimePicker', '20:00');
            $$('input[name="recurring"]').forEach(r => { r.checked = r.value === 'none'; });
            selectedDates.clear();
            _initCustomDayDefaults();
        }
        _renderCustomDayEditor();
        _updateCustomDayVisibility();
    }

    const _dayNames = ['', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
    const _dayNamesShort = ['', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

    function _initCustomDayDefaults() {
        customDaySchedules = {};
        for (let d = 1; d <= 7; d++) {
            customDaySchedules[d] = { startTime: '08:00', stopTime: '20:00', enabled: d <= 5 };
        }
    }

    function _updateCustomDayVisibility() {
        const editor = document.getElementById('customDayEditor');
        const timeConfig = document.getElementById('timeWindowConfig');
        if (!editor) return;
        if (currentRecurring === 'custom') {
            editor.style.display = 'block';
            if (timeConfig) timeConfig.style.display = 'none';
        } else {
            editor.style.display = 'none';
            if (timeConfig && currentScheduleType === 'window') timeConfig.style.display = 'block';
        }
    }

    function _renderCustomDayEditor() {
        const list = document.getElementById('customDayList');
        if (!list) return;
        list.innerHTML = '';
        for (let d = 1; d <= 7; d++) {
            const ds = customDaySchedules[d] || { startTime: '08:00', stopTime: '20:00', enabled: false };
            const row = document.createElement('div');
            row.className = 'custom-day-row' + (ds.enabled ? ' active' : '');
            row.innerHTML = `
                <label class="custom-day-toggle">
                    <input type="checkbox" ${ds.enabled ? 'checked' : ''} data-day="${d}">
                    <span class="custom-day-name">${_dayNamesShort[d]}</span>
                </label>
                <div class="custom-day-times ${ds.enabled ? '' : 'disabled'}">
                    <input type="time" class="custom-day-start" value="${ds.startTime}" data-day="${d}" ${ds.enabled ? '' : 'disabled'}>
                    <span class="custom-day-sep">—</span>
                    <input type="time" class="custom-day-stop" value="${ds.stopTime}" data-day="${d}" ${ds.enabled ? '' : 'disabled'}>
                </div>`;
            list.appendChild(row);

            // Toggle day
            row.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
                const day = e.target.dataset.day;
                customDaySchedules[day].enabled = e.target.checked;
                _renderCustomDayEditor();
            });
            // Time changes
            row.querySelector('.custom-day-start').addEventListener('change', (e) => {
                customDaySchedules[e.target.dataset.day].startTime = e.target.value;
            });
            row.querySelector('.custom-day-stop').addEventListener('change', (e) => {
                customDaySchedules[e.target.dataset.day].stopTime = e.target.value;
            });
        }
    }

    function _renderTemplateChips() {
        const container = document.getElementById('templateChips');
        if (!container) return;
        const templates = DataManager.getScheduleTemplates();
        container.innerHTML = templates.map(t => {
            return `<button class="template-chip" data-tmpl="${t.id}" title="${t.description}">
                <span class="template-chip-name">${t.name}</span>
            </button>`;
        }).join('');
        container.querySelectorAll('.template-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                const tmpl = DataManager.applyTemplate(btn.dataset.tmpl);
                if (!tmpl) return;
                _log('INFO', 'Template', 'Applicazione template', { template: tmpl.name });
                currentScheduleType = tmpl.type;
                currentRecurring = tmpl.recurring || 'none';
                $$('.schedule-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === tmpl.type));
                $$('input[name="recurring"]').forEach(r => { r.checked = r.value === currentRecurring; });
                if (tmpl.startTime) setTimePickerValue('startTimePicker', tmpl.startTime);
                if (tmpl.stopTime) setTimePickerValue('stopTimePicker', tmpl.stopTime);
                $('#timeWindowConfig').style.display = tmpl.type === 'window' && tmpl.recurring !== 'custom' ? 'block' : 'none';
                updateCalendarVisibility();
                _updateCustomDayVisibility();
                showToast(`Template "${tmpl.name}" applicato`, 'info');
            });
        });
    }

    function saveSchedule() {
        _log('INFO', 'Schedule', 'Salvataggio pianificazione', { type: currentScheduleType, target: modalTarget });
        if (currentRecurring === 'none' && selectedDates.size === 0) {
            showToast('Seleziona almeno un giorno o una ricorrenza', 'error');
            return;
        }

        // Custom per-day validation
        if (currentRecurring === 'custom') {
            const enabledDays = Object.entries(customDaySchedules).filter(([, ds]) => ds.enabled);
            if (enabledDays.length === 0) {
                showToast('Seleziona almeno un giorno nella schedulazione personalizzata', 'error');
                return;
            }
            if (currentScheduleType === 'window') {
                for (const [dayNum, ds] of enabledDays) {
                    const [sh, sm] = ds.startTime.split(':').map(Number);
                    const [eh, em] = ds.stopTime.split(':').map(Number);
                    if (sh * 60 + sm >= eh * 60 + em) {
                        showToast(`${_dayNames[dayNum]}: l'orario di avvio deve essere prima dello spegnimento`, 'error');
                        return;
                    }
                }
            }
        }

        const startTime = currentScheduleType === 'window' && currentRecurring !== 'custom' ? getTimePickerValue('startTimePicker') : null;
        const stopTime = currentScheduleType === 'window' && currentRecurring !== 'custom' ? getTimePickerValue('stopTimePicker') : null;

        // Validazione: startTime deve essere prima di stopTime (non custom)
        if (currentScheduleType === 'window' && currentRecurring !== 'custom') {
            const [sh, sm] = startTime.split(':').map(Number);
            const [eh, em] = stopTime.split(':').map(Number);
            if (sh * 60 + sm >= eh * 60 + em) {
                showToast('L\'orario di avvio deve essere prima dell\'orario di spegnimento', 'error');
                return;
            }
        }

        // Build day schedules for custom recurring
        let daySchedules = undefined;
        if (currentRecurring === 'custom') {
            daySchedules = {};
            for (const [dayNum, ds] of Object.entries(customDaySchedules)) {
                if (ds.enabled) {
                    daySchedules[dayNum] = { startTime: ds.startTime, stopTime: ds.stopTime };
                }
            }
        }

        const entry = {
            type: currentScheduleType,
            startTime,
            stopTime,
            recurring: currentRecurring,
            dates: currentRecurring === 'none' ? Array.from(selectedDates).sort() : [],
            ...(daySchedules ? { daySchedules } : {})
        };

        // Validazione sovrapposizione per macchina singola
        if (modalTarget.type === 'machine' && currentScheduleType === 'window') {
            const check = DataManager.validateScheduleOverlap(
                modalTarget.app, modalTarget.env, modalTarget.hostname,
                entry, editingEntryId || undefined
            );
            if (!check.valid) {
                showToast(check.reason, 'error');
                return;
            }
        }

        // Validazione sovrapposizione per ambiente intero
        if ((modalTarget.type === 'environment' || modalTarget.type === 'environment-edit') && currentScheduleType === 'window') {
            const machines = DataManager.getMachines(modalTarget.app, modalTarget.env);
            const conflicts = [];
            for (const m of machines) {
                const excludeId = modalTarget.type === 'environment-edit' ? undefined : undefined;
                const check = DataManager.validateScheduleOverlap(
                    modalTarget.app, modalTarget.env, m.hostname,
                    entry, excludeId
                );
                if (!check.valid) {
                    conflicts.push(m.hostname);
                }
            }
            if (conflicts.length > 0) {
                const preview = conflicts.slice(0, 3).join(', ');
                const more = conflicts.length > 3 ? ` e altri ${conflicts.length - 3}` : '';
                showToast(`Sovrapposizione orari su: ${preview}${more}`, 'error');
                return;
            }
        }

        if (modalTarget.type === 'machine') {
            if (editingEntryId) {
                DataManager.updateScheduleEntry(modalTarget.app, modalTarget.env, modalTarget.hostname, editingEntryId, entry);
                AuditLog.log('Modifica entry', `${modalTarget.app} / ${modalTarget.env} / ${modalTarget.hostname}`);
                showToast('Pianificazione aggiornata', 'success');
            } else {
                DataManager.addScheduleEntry(modalTarget.app, modalTarget.env, modalTarget.hostname, entry);
                AuditLog.log('Aggiunta entry', `${modalTarget.app} / ${modalTarget.env} / ${modalTarget.hostname}`);
                showToast('Pianificazione aggiunta', 'success');
            }
        } else if (modalTarget.type === 'environment-edit' && modalTarget.envGroupId) {
            DataManager.updateEnvGroup(modalTarget.app, modalTarget.env, modalTarget.envGroupId, entry);
            AuditLog.log('Modifica schedulazione ambiente', `${modalTarget.app} / ${modalTarget.env}`);
            showToast('Schedulazione ambiente aggiornata', 'success');
        } else {
            DataManager.addEntryForEnv(modalTarget.app, modalTarget.env, entry);
            AuditLog.log('Pianificazione ambiente', `${modalTarget.app} / ${modalTarget.env} (tutti i server)`);
            showToast('Pianificazione applicata a tutto l\'ambiente', 'success');
        }

        closeModal();
        renderMachines(currentApp, currentEnv);
        renderHomeDashboard();
        updateChangesBadge();
    }

    // ============================================
    // Calendar (Modal)
    // ============================================
    function _isDateConflicting(dateStr) {
        // Only check for window type and single-machine targets
        if (currentScheduleType !== 'window') return false;
        if (!modalTarget || !modalTarget.hostname) return false;

        const startTime = getTimePickerValue('startTimePicker');
        const stopTime = getTimePickerValue('stopTimePicker');
        const [sh, sm] = startTime.split(':').map(Number);
        const [eh, em] = stopTime.split(':').map(Number);
        const newStart = sh * 60 + sm;
        const newStop = eh * 60 + em;
        if (newStart >= newStop) return false;

        const windows = DataManager.getOccupiedWindows(
            modalTarget.app, modalTarget.env, modalTarget.hostname, dateStr
        );
        for (const w of windows) {
            // Skip the entry being edited
            if (editingEntryId) {
                const entries = DataManager.getScheduleEntries(modalTarget.app, modalTarget.env, modalTarget.hostname);
                const editEntry = entries.find(e => e.id === editingEntryId);
                if (editEntry && w.label === `${editEntry.startTime}-${editEntry.stopTime}`) continue;
            }
            if (newStart < w.stopMin && newStop > w.startMin) return true;
        }
        return false;
    }

    function renderCalendar() {
        const grid = $('#calendarGrid');
        if (!grid) return;
        const year = calendarDate.getFullYear();
        const month = calendarDate.getMonth();
        $('#calendarMonthYear').textContent = `${monthNames[month]} ${year}`;

        let startDow = new Date(year, month, 1).getDay();
        startDow = startDow === 0 ? 6 : startDow - 1;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = new Date(); today.setHours(0,0,0,0);

        const fragment = document.createDocumentFragment();
        for (let i = 0; i < startDow; i++) {
            const cell = document.createElement('div');
            cell.className = 'calendar-day empty';
            fragment.appendChild(cell);
        }
        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(year, month, d);
            const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const dow = date.getDay();
            const isPast = date < today;
            const isToday = date.getTime() === today.getTime();
            const isWeekend = dow === 0 || dow === 6;
            const isSelected = selectedDates.has(dateStr);
            const isConflicting = !isPast && _isDateConflicting(dateStr);

            const cell = document.createElement('div');
            let cls = 'calendar-day';
            if (isPast) cls += ' past';
            if (isToday) cls += ' today';
            if (isWeekend) cls += ' weekend';
            if (isSelected) cls += ' selected';
            if (isConflicting && !isSelected) cls += ' occupied';
            cell.className = cls;
            cell.textContent = d;
            cell.dataset.date = dateStr;
            if (isConflicting && !isSelected) {
                cell.title = 'Esiste già una schedulazione in questo orario';
            }
            if (!isPast && !isConflicting) cell.addEventListener('click', toggleDate);
            else if (isConflicting && !isPast) cell.addEventListener('click', () => {
                showToast('Esiste già una schedulazione per questo orario in questa data', 'error');
            });
            fragment.appendChild(cell);
        }
        grid.innerHTML = '';
        grid.appendChild(fragment);
    }

    function toggleDate(e) {
        const dateStr = e.currentTarget.dataset.date;
        const cell = e.currentTarget;
        if (selectedDates.has(dateStr)) { selectedDates.delete(dateStr); cell.classList.remove('selected'); }
        else { selectedDates.add(dateStr); cell.classList.add('selected'); }
    }

    function navigateMonth(delta) { calendarDate.setMonth(calendarDate.getMonth() + delta); renderCalendar(); }

    function selectWeekdays() {
        const year = calendarDate.getFullYear(), month = calendarDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = new Date(); today.setHours(0,0,0,0);
        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(year, month, d);
            if (date < today) continue;
            const dow = date.getDay();
            const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            if (dow >= 1 && dow <= 5 && !_isDateConflicting(dateStr)) {
                selectedDates.add(dateStr);
            }
        }
        renderCalendar();
    }

    // ============================================
    // General Calendar
    // ============================================
    function showGeneralCalendar() {
        currentView = 'general-calendar';
        showView('general-calendar');
        closeEnvPopover();
        $$('#appList .nav-item').forEach(i => i.classList.remove('active'));
        $$('.sidebar-action-btn').forEach(b => b.classList.remove('active'));
        $('#generalCalendarBtn').classList.add('active');
        $('#breadcrumb').innerHTML = '<span class="breadcrumb-item active">Calendario Generale</span>';
        renderGCFilters();
        renderGeneralCalendar();
    }

    function navigateGeneralCalendar(delta) { gcDate.setMonth(gcDate.getMonth() + delta); renderGeneralCalendar(); }

    function renderGCFilters() {
        const apps = DataManager.getApplications();
        const allEnvNames = new Set();
        apps.forEach(a => DataManager.getEnvironments(a.name).forEach(e => allEnvNames.add(e.name)));
        const envList = [...allEnvNames].sort();

        // Initialize env filters on first open
        if (!gcEnvFiltersInitialized) {
            envList.forEach(e => gcActiveEnvFilters.add(e));
            gcEnvFiltersInitialized = true;
        }

        const container = $('#gcFilters');
        container.innerHTML = '';

        // App filters row with search
        const appRow = document.createElement('div');
        appRow.className = 'gc-filter-row gc-filter-row-searchable';
        appRow.innerHTML = '<span class="gc-filters-label">Applicazioni</span>';

        const allAppActive = gcActiveFilters.size === apps.length;
        const toggleAll = document.createElement('button');
        toggleAll.className = 'gc-filter-toggle-all' + (allAppActive ? ' all-active' : '');
        toggleAll.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${allAppActive ? '<polyline points="20 6 9 17 4 12"/>' : '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>'}</svg>${allAppActive ? 'Deseleziona' : 'Seleziona'} Tutti`;
        toggleAll.addEventListener('click', () => {
            if (gcActiveFilters.size === apps.length) gcActiveFilters.clear();
            else apps.forEach(a => gcActiveFilters.add(a.name));
            renderGCFilters();
            renderGeneralCalendar();
        });
        appRow.appendChild(toggleAll);

        // Search input for apps
        if (apps.length > 8) {
            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.className = 'gc-filter-search-inline';
            searchInput.placeholder = 'Cerca app...';
            searchInput.addEventListener('input', () => {
                const q = searchInput.value.toLowerCase();
                appRow.querySelectorAll('.gc-filter-chip').forEach(chip => {
                    chip.style.display = !q || chip.textContent.toLowerCase().includes(q) ? '' : 'none';
                });
            });
            appRow.appendChild(searchInput);
        }

        apps.forEach((app, i) => {
            const color = appColors[i % appColors.length];
            const chip = document.createElement('button');
            chip.className = 'gc-filter-chip' + (gcActiveFilters.has(app.name) ? ' active' : '');
            chip.innerHTML = `<span class="gc-filter-dot" style="background:${color}"></span>${app.name}`;
            chip.addEventListener('click', () => {
                if (gcActiveFilters.has(app.name)) gcActiveFilters.delete(app.name);
                else gcActiveFilters.add(app.name);
                renderGCFilters();
                renderGeneralCalendar();
            });
            appRow.appendChild(chip);
        });
        container.appendChild(appRow);

        // Env filters row
        const envRow = document.createElement('div');
        envRow.className = 'gc-filter-row';
        envRow.innerHTML = '<span class="gc-filters-label">Ambienti</span>';

        const allEnvActive = gcActiveEnvFilters.size === envList.length;
        const toggleAllEnv = document.createElement('button');
        toggleAllEnv.className = 'gc-filter-toggle-all' + (allEnvActive ? ' all-active' : '');
        toggleAllEnv.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${allEnvActive ? '<polyline points="20 6 9 17 4 12"/>' : '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>'}</svg>${allEnvActive ? 'Deseleziona' : 'Seleziona'} Tutti`;
        toggleAllEnv.addEventListener('click', () => {
            if (gcActiveEnvFilters.size === envList.length) gcActiveEnvFilters.clear();
            else envList.forEach(e => gcActiveEnvFilters.add(e));
            renderGCFilters();
            renderGeneralCalendar();
        });
        envRow.appendChild(toggleAllEnv);

        envList.forEach(env => {
            const color = envColors[env] || '#7a7a96';
            const chip = document.createElement('button');
            chip.className = 'gc-filter-chip' + (gcActiveEnvFilters.has(env) ? ' active' : '');
            chip.innerHTML = `<span class="gc-filter-dot" style="background:${color}"></span>${env}`;
            chip.addEventListener('click', () => {
                if (gcActiveEnvFilters.has(env)) gcActiveEnvFilters.delete(env);
                else gcActiveEnvFilters.add(env);
                renderGCFilters();
                renderGeneralCalendar();
            });
            envRow.appendChild(chip);
        });
        container.appendChild(envRow);
    }

    function renderGeneralCalendar() {
        const year = gcDate.getFullYear(), month = gcDate.getMonth();
        $('#gcMonthYear').textContent = `${monthNames[month]} ${year}`;

        const allSchedules = DataManager.getAllSchedulesFlat().filter(s => gcActiveFilters.has(s.app) && gcActiveEnvFilters.has(s.env));
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        let startDow = new Date(year, month, 1).getDay();
        startDow = startDow === 0 ? 6 : startDow - 1;
        const today = new Date(); today.setHours(0,0,0,0);

        const dateMap = {};
        for (let d = 1; d <= daysInMonth; d++) {
            dateMap[`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`] = new Map();
        }

        const dowForDate = ds => new Date(ds + 'T00:00:00').getDay();

        allSchedules.forEach(({ app, env, entry }) => {
            const key = `${app} - ${env}`;
            const addToDate = ds => { if (dateMap[ds]) dateMap[ds].set(key, (dateMap[ds].get(key)||0) + 1); };
            if (entry.recurring === 'daily') {
                for (let d = 1; d <= daysInMonth; d++) addToDate(`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
            } else if (entry.recurring === 'weekdays') {
                for (let d = 1; d <= daysInMonth; d++) { const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; const dw = dowForDate(ds); if (dw >= 1 && dw <= 5) addToDate(ds); }
            } else if (entry.recurring === 'weekends') {
                for (let d = 1; d <= daysInMonth; d++) { const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; const dw = dowForDate(ds); if (dw === 0 || dw === 6) addToDate(ds); }
            } else if (entry.dates) {
                entry.dates.forEach(ds => addToDate(ds));
            }
        });

        // Build color map: app color + env color for dual-indicator
        const apps = DataManager.getApplications();
        const appColorMap = {};
        apps.forEach((a, i) => { appColorMap[a.name] = appColors[i % appColors.length]; });
        const aeColorPairs = {};
        const allAppEnvs = new Set();
        Object.values(dateMap).forEach(map => map.forEach((_, k) => allAppEnvs.add(k)));
        allAppEnvs.forEach(k => {
            const parts = k.split(' - ');
            const appName = parts[0];
            const envName = parts.length > 1 ? parts.slice(1).join(' - ') : '';
            aeColorPairs[k] = {
                app: appColorMap[appName] || '#7a7a96',
                env: envColors[envName] || '#7a7a96'
            };
        });

        const grid = $('#gcGrid');
        const fragment = document.createDocumentFragment();

        for (let i = 0; i < startDow; i++) {
            const cell = document.createElement('div');
            cell.className = 'gc-day gc-empty';
            fragment.appendChild(cell);
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const date = new Date(year, month, d);
            const isToday = date.getTime() === today.getTime();
            const isPast = date < today;
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            const appEnvMap = dateMap[dateStr];

            const cell = document.createElement('div');
            cell.className = 'gc-day';
            if (isToday) cell.classList.add('gc-today');
            if (isPast) cell.classList.add('gc-past');
            if (isWeekend) cell.classList.add('gc-weekend');
            if (appEnvMap.size > 0) cell.classList.add('gc-has-entries');

            let tagsHtml = '';
            appEnvMap.forEach((count, k) => {
                const cp = aeColorPairs[k] || { app: '#7a7a96', env: '#7a7a96' };
                tagsHtml += `<span class="gc-tag" style="background:${cp.app}14;color:${cp.app};border-color:${cp.app}30" title="${k}: ${count} server"><span class="gc-tag-env" style="background:${cp.env}"></span>${k}</span>`;
            });

            cell.innerHTML = `<div class="gc-day-number">${d}</div><div class="gc-tags">${tagsHtml}</div>`;
            fragment.appendChild(cell);
        }

        grid.innerHTML = '';
        grid.appendChild(fragment);

        // Make tags clickable — show VM detail popup
        grid.querySelectorAll('.gc-tag').forEach(tag => {
            tag.style.cursor = 'pointer';
            tag.addEventListener('click', (e) => {
                e.stopPropagation();
                const cell = tag.closest('.gc-day');
                const dateStr = null; // we need to get the date
                const key = tag.getAttribute('title')?.split(':')[0] || tag.textContent.trim();
                const parts = key.split(' - ');
                const appName = parts[0]?.trim();
                const envName = parts.length > 1 ? parts.slice(1).join(' - ').trim() : '';

                // Get the day number from the cell
                const dayNum = cell.querySelector('.gc-day-number')?.textContent;
                const dateString = `${year}-${String(month+1).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`;

                if (!appName || !envName) return;

                // Get all machines for this app/env
                const machines = DataManager.getMachines(appName, envName);
                const schedules = DataManager.getAllSchedulesFlat().filter(s =>
                    s.app === appName && s.env === envName
                );

                // Build detail popup
                let detailHtml = '<div class="gc-detail-list">';
                machines.forEach(m => {
                    const entries = DataManager.getScheduleEntries(appName, envName, m.hostname);
                    // Filter entries that apply to this date
                    const dow = new Date(dateString + 'T00:00:00').getDay();
                    const applicableEntries = entries.filter(entry => {
                        const rec = entry.recurring || 'none';
                        if (rec === 'daily') return true;
                        if (rec === 'weekdays' && dow >= 1 && dow <= 5) return true;
                        if (rec === 'weekends' && (dow === 0 || dow === 6)) return true;
                        if (rec === 'custom' && entry.daySchedules && entry.daySchedules[String(dow === 0 ? 7 : dow)]) return true;
                        if (rec === 'none' && entry.dates && entry.dates.includes(dateString)) return true;
                        return false;
                    });
                    if (applicableEntries.length === 0) return;

                    const entryDetails = applicableEntries.map(e => {
                        if (e.type === 'shutdown') return 'Shutdown';
                        if (e.recurring === 'custom' && e.daySchedules) {
                            const dayKey = String(dow === 0 ? 7 : dow);
                            const ds = e.daySchedules[dayKey];
                            return ds ? `${ds.startTime} — ${ds.stopTime}` : `${e.startTime || '?'} — ${e.stopTime || '?'}`;
                        }
                        return `${e.startTime || '?'} — ${e.stopTime || '?'}`;
                    }).join(', ');

                    detailHtml += `<div class="gc-detail-row">
                        <code class="gc-detail-host">${m.hostname}</code>
                        <span class="gc-detail-name">${m.machine_name}</span>
                        <span class="gc-detail-schedule">${entryDetails}</span>
                    </div>`;
                });
                detailHtml += '</div>';

                // Show as popup
                const existing = document.querySelector('.gc-detail-popup');
                if (existing) existing.remove();

                const popup = document.createElement('div');
                popup.className = 'gc-detail-popup';
                popup.innerHTML = `
                    <div class="gc-detail-header">
                        <div>
                            <strong>${appName} / ${envName}</strong>
                            <span class="gc-detail-date">${dayNum} ${monthNames[month]} ${year}</span>
                        </div>
                        <button class="gc-detail-close">&times;</button>
                    </div>
                    ${detailHtml}`;
                document.body.appendChild(popup);

                // Position near click
                const rect = tag.getBoundingClientRect();
                popup.style.top = Math.min(rect.bottom + 8, window.innerHeight - popup.offsetHeight - 20) + 'px';
                popup.style.left = Math.min(rect.left, window.innerWidth - popup.offsetWidth - 20) + 'px';

                popup.querySelector('.gc-detail-close').addEventListener('click', () => popup.remove());
                document.addEventListener('click', function handler(ev) {
                    if (!popup.contains(ev.target) && ev.target !== tag) {
                        popup.remove();
                        document.removeEventListener('click', handler);
                    }
                });
            });
        });
    }

    // ============================================
    // PDF Export — General Calendar
    // ============================================
    function buildGCDateMap() {
        const year = gcDate.getFullYear(), month = gcDate.getMonth();
        const allSchedules = DataManager.getAllSchedulesFlat().filter(s => gcActiveFilters.has(s.app) && gcActiveEnvFilters.has(s.env));
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const dateMap = {};
        for (let d = 1; d <= daysInMonth; d++) {
            dateMap[`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`] = new Map();
        }
        const dowForDate = ds => new Date(ds + 'T00:00:00').getDay();
        allSchedules.forEach(({ app, env, entry }) => {
            const key = `${app} - ${env}`;
            const addToDate = ds => { if (dateMap[ds]) dateMap[ds].set(key, (dateMap[ds].get(key)||0) + 1); };
            if (entry.recurring === 'daily') {
                for (let d = 1; d <= daysInMonth; d++) addToDate(`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
            } else if (entry.recurring === 'weekdays') {
                for (let d = 1; d <= daysInMonth; d++) { const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; const dw = dowForDate(ds); if (dw >= 1 && dw <= 5) addToDate(ds); }
            } else if (entry.recurring === 'weekends') {
                for (let d = 1; d <= daysInMonth; d++) { const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; const dw = dowForDate(ds); if (dw === 0 || dw === 6) addToDate(ds); }
            } else if (entry.dates) {
                entry.dates.forEach(ds => addToDate(ds));
            }
        });
        return dateMap;
    }

    function exportGCToPdf() {
        const year = gcDate.getFullYear(), month = gcDate.getMonth();
        const monthName = monthNames[month];
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const dateMap = buildGCDateMap();
        const dayNames = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

        // Build HTML for direct download
        let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>FinOps Platform - ${monthName} ${year}</title>
        <style>
            @page { size: A4 landscape; margin: 10mm; }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, Helvetica, sans-serif; font-size: 9px; color: #333; width: 100%; }
            .header { text-align: center; margin-bottom: 10px; border-bottom: 2px solid #c2410c; padding-bottom: 6px; }
            .header h1 { font-size: 16px; margin: 0; color: #c2410c; }
            .header p { font-size: 10px; color: #666; margin: 3px 0 0; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            th { background: #f2f2f2; padding: 5px 3px; border: 1px solid #bbb; font-size: 8px; text-transform: uppercase; text-align: center; }
            td { padding: 3px; border: 1px solid #ddd; vertical-align: top; height: 55px; overflow: hidden; word-wrap: break-word; }
            .day-num { font-weight: bold; font-size: 10px; margin-bottom: 2px; }
            .day-weekend { background: #f7f7f7; }
            .tag { display: block; font-size: 6.5px; padding: 1px 2px; border-radius: 1px; margin: 1px 0; background: #e8f0fe; color: #1a56db; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .footer { text-align: center; font-size: 7px; color: #999; margin-top: 6px; }
            .empty { background: #f9f9f9; }
        </style></head><body>
        <div class="header">
            <h1>FinOps Platform &mdash; Calendario Generale</h1>
            <p>${monthName} ${year} &bull; Generato il ${new Date().toLocaleDateString('it-IT')}</p>
        </div>
        <table>
            <thead><tr><th>Lun</th><th>Mar</th><th>Mer</th><th>Gio</th><th>Ven</th><th>Sab</th><th>Dom</th></tr></thead>
            <tbody>`;

        let startDow = new Date(year, month, 1).getDay();
        startDow = startDow === 0 ? 6 : startDow - 1;
        let dayCounter = 1;
        const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;

        for (let i = 0; i < totalCells; i++) {
            if (i % 7 === 0) html += '<tr>';
            if (i < startDow || dayCounter > daysInMonth) {
                html += '<td class="empty"></td>';
            } else {
                const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(dayCounter).padStart(2,'0')}`;
                const date = new Date(year, month, dayCounter);
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                const entries = dateMap[ds] || new Map();
                let tagsHtml = '';
                entries.forEach((count, key) => { tagsHtml += `<div class="tag">${key} (${count})</div>`; });
                html += `<td class="${isWeekend ? 'day-weekend' : ''}"><div class="day-num">${dayCounter} ${dayNames[date.getDay()]}</div>${tagsHtml}</td>`;
                dayCounter++;
            }
            if (i % 7 === 6) html += '</tr>';
        }

        html += '</tbody></table>';
        html += `<div class="footer">FinOps Platform &bull; ${monthName} ${year}</div></body></html>`;

        // Download as HTML file (user can open/print/save as PDF)
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `FinOps-Calendario-${monthName}-${year}.html`;
        a.click();
        URL.revokeObjectURL(url);
        AuditLog.log('Esportazione Calendario', `${monthName} ${year}`);
        showToast('Calendario scaricato', 'success');
    }

    function copyGCTable() {
        const year = gcDate.getFullYear(), month = gcDate.getMonth();
        const monthName = monthNames[month];
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const dateMap = buildGCDateMap();
        const dayNames = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

        // Build a clean day-by-day list, easy to read in email
        let lines = [];
        lines.push(`CALENDARIO SHUTDOWN — ${monthName} ${year}`);
        lines.push('');

        let htmlTable = `<table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:11px;">`;
        htmlTable += `<tr style="background:#c2410c;color:white;"><th colspan="4" style="padding:8px;font-size:13px;text-align:center;border:1px solid #999;">Calendario Shutdown &mdash; ${monthName} ${year}</th></tr>`;
        htmlTable += `<tr style="background:#f2f2f2;"><th style="padding:6px 10px;border:1px solid #ccc;text-align:left;width:100px;">Giorno</th><th style="padding:6px 10px;border:1px solid #ccc;text-align:left;width:160px;">Ambiente</th><th style="padding:6px 10px;border:1px solid #ccc;text-align:left;">Server e orari</th><th style="padding:6px 10px;border:1px solid #ccc;text-align:center;width:40px;">N.</th></tr>`;

        for (let d = 1; d <= daysInMonth; d++) {
            const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const date = new Date(year, month, d);
            const entries = dateMap[ds] || new Map();
            if (entries.size === 0) continue;

            const dayLabel = `${dayNames[date.getDay()]} ${d} ${monthName}`;
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            const bgStyle = isWeekend ? 'background:#f9f9f9;' : '';
            const dow = date.getDay();
            const isFirstRow = { value: true };

            lines.push(`${dayLabel}:`);
            entries.forEach((count, key) => {
                const parts = key.split(' - ');
                const appName = parts[0];
                const envName = parts.length > 1 ? parts.slice(1).join(' - ') : '';
                const machines = DataManager.getMachines(appName, envName);

                // Collect applicable VMs with their schedules
                const vmLines = [];
                const vmHtmlLines = [];
                machines.forEach(m => {
                    const mEntries = DataManager.getScheduleEntries(appName, envName, m.hostname);
                    const applicable = mEntries.filter(e => {
                        const rec = e.recurring || 'none';
                        if (rec === 'daily') return true;
                        if (rec === 'weekdays' && dow >= 1 && dow <= 5) return true;
                        if (rec === 'weekends' && (dow === 0 || dow === 6)) return true;
                        if (rec === 'custom' && e.daySchedules) {
                            const isoDay = dow === 0 ? 7 : dow;
                            return !!e.daySchedules[String(isoDay)];
                        }
                        if (rec === 'none' && e.dates && e.dates.includes(ds)) return true;
                        return false;
                    });
                    if (applicable.length > 0) {
                        const sched = applicable.map(e => {
                            if (e.type === 'shutdown') return 'Shutdown';
                            if (e.recurring === 'custom' && e.daySchedules) {
                                const isoDay = dow === 0 ? 7 : dow;
                                const ds2 = e.daySchedules[String(isoDay)];
                                return ds2 ? `${ds2.startTime}-${ds2.stopTime}` : 'Custom';
                            }
                            return `${e.startTime}-${e.stopTime}`;
                        }).join(', ');
                        vmLines.push(`  → ${m.hostname} (${m.machine_name}): ${sched}`);
                        vmHtmlLines.push(`<div style="font-size:10px;margin:1px 0;"><code style="font-size:9px;background:#f0f0f0;padding:0 3px;">${m.hostname}</code> ${m.machine_name}: <strong>${sched}</strong></div>`);
                    }
                });

                lines.push(`  ${key} (${vmLines.length} server):`);
                vmLines.forEach(l => lines.push(l));

                const dayCell = isFirstRow.value
                    ? `<td style="padding:4px 10px;border:1px solid #ddd;font-weight:600;${bgStyle}vertical-align:top;" rowspan="${entries.size}">${dayLabel}</td>`
                    : '';
                isFirstRow.value = false;
                htmlTable += `<tr style="${bgStyle}">${dayCell}<td style="padding:4px 10px;border:1px solid #ddd;vertical-align:top;font-size:10px;">${key}</td><td style="padding:4px 10px;border:1px solid #ddd;vertical-align:top;">${vmHtmlLines.join('')}</td><td style="padding:4px 10px;border:1px solid #ddd;text-align:center;font-weight:600;">${vmLines.length}</td></tr>`;
            });
            lines.push('');
        }
        htmlTable += '</table>';

        const text = lines.join('\n');
        try {
            navigator.clipboard.write([
                new ClipboardItem({
                    'text/html': new Blob([htmlTable], { type: 'text/html' }),
                    'text/plain': new Blob([text], { type: 'text/plain' })
                })
            ]);
            showToast('Tabella calendario copiata', 'success');
        } catch {
            navigator.clipboard.writeText(text).then(() => showToast('Tabella copiata (testo)', 'success')).catch(() => showToast('Errore nella copia', 'error'));
        }
    }

    // ============================================
    // VM List View
    // ============================================
    function showVMList() {
        currentApp = null;
        currentEnv = null;
        $$('#appList .nav-item').forEach(i => i.classList.remove('active'));
        $$('.sidebar-action-btn').forEach(b => b.classList.remove('active'));
        const vmBtn = document.getElementById('vmListBtn');
        if (vmBtn) vmBtn.classList.add('active');
        closeEnvPopover();
        updateBreadcrumb(null);
        renderVMList();
        showView('vm-list');
    }

    function renderVMList() {
        const vmView = document.getElementById('vmListView');
        if (!vmView) return;
        const allMachines = DataManager.getVMListMachines();
        const apps = [...new Set(allMachines.map(m => m.application))].sort();
        const envs = [...new Set(allMachines.map(m => m.environment))].sort();
        let lastFiltered = allMachines;
        const selectedRows = new Set();
        const activeApps = new Set();
        const activeEnvs = new Set();
        let sortCol = null, sortAsc = true;

        vmView.innerHTML = `
            <div class="vm-list-header">
                <div class="vm-list-title-row">
                    <div>
                        <h2>Elenco VM</h2>
                        <div class="vm-list-subtitle">${allMachines.length} server totali</div>
                    </div>
                    <div class="vm-list-actions">
                        <button class="btn-secondary vm-copy-btn" id="vmCopySelected" style="display:none">
                            ${SVG.copy} Copia selezionati (<span id="vmSelectedCount">0</span>)
                        </button>
                        <button class="btn-secondary vm-copy-btn" id="vmCopyAll">
                            ${SVG.copy} Copia elenco visibile
                        </button>
                    </div>
                </div>
            </div>
            <div class="vm-list-filters">
                <div class="vm-filter-row">
                    <span class="vm-filter-label">Applicazione</span>
                    <div class="vm-filter-chips" id="vmAppChips"></div>
                </div>
                <div class="vm-filter-row">
                    <span class="vm-filter-label">Ambiente</span>
                    <div class="vm-filter-chips" id="vmEnvChips"></div>
                </div>
                <div class="vm-filter-row">
                    <div class="vm-filter-search-group">
                        <input type="text" class="vm-filter-search" id="vmFilterSearch" placeholder="Cerca per nome, hostname, instance type...">
                    </div>
                    <span class="vm-filter-count" id="vmFilterCount">${allMachines.length} risultati</span>
                </div>
            </div>
            <div class="vm-list-table-wrapper">
                <table class="vm-list-table">
                    <thead>
                        <tr>
                            <th class="vm-th-check"><input type="checkbox" id="vmSelectAll" title="Seleziona tutti"></th>
                            <th class="vm-th-sortable" data-col="machine_name">Nome Server <span class="vm-sort-icon"></span></th>
                            <th class="vm-th-sortable" data-col="hostname">Hostname <span class="vm-sort-icon"></span></th>
                            <th class="vm-th-sortable vm-th-app" data-col="application">Applicazione <span class="vm-sort-icon"></span></th>
                            <th class="vm-th-sortable vm-th-env" data-col="environment">Ambiente <span class="vm-sort-icon"></span></th>
                            <th class="vm-th-sortable" data-col="instance_type">Instance Type <span class="vm-sort-icon"></span></th>
                            <th class="vm-th-sortable" data-col="server_type">Tipo <span class="vm-sort-icon"></span></th>
                        </tr>
                    </thead>
                    <tbody id="vmListBody"></tbody>
                </table>
            </div>`;

        // Render filter chips
        const renderFilterChips = () => {
            const appContainer = vmView.querySelector('#vmAppChips');
            const envContainer = vmView.querySelector('#vmEnvChips');
            appContainer.innerHTML = '';
            envContainer.innerHTML = '';

            // Search input for apps if many
            if (apps.length > 8) {
                const searchInput = document.createElement('input');
                searchInput.type = 'text';
                searchInput.className = 'gc-filter-search-inline';
                searchInput.placeholder = 'Cerca app...';
                searchInput.addEventListener('input', () => {
                    const q = searchInput.value.toLowerCase();
                    appContainer.querySelectorAll('.gc-filter-chip').forEach(chip => {
                        chip.style.display = !q || chip.textContent.toLowerCase().includes(q) ? '' : 'none';
                    });
                });
                appContainer.appendChild(searchInput);
            }

            apps.forEach((a, i) => {
                const color = appColors[i % appColors.length];
                const chip = document.createElement('button');
                chip.className = 'gc-filter-chip' + (activeApps.has(a) ? ' active' : '');
                chip.innerHTML = `<span class="gc-filter-dot" style="background:${color}"></span>${a}`;
                chip.addEventListener('click', () => {
                    if (activeApps.has(a)) activeApps.delete(a); else activeApps.add(a);
                    chip.classList.toggle('active');
                    renderRows();
                });
                appContainer.appendChild(chip);
            });

            envs.forEach(e => {
                const color = envColors[e] || '#7a7a96';
                const chip = document.createElement('button');
                chip.className = 'gc-filter-chip' + (activeEnvs.has(e) ? ' active' : '');
                chip.innerHTML = `<span class="gc-filter-dot" style="background:${color}"></span>${e}`;
                chip.addEventListener('click', () => {
                    if (activeEnvs.has(e)) activeEnvs.delete(e); else activeEnvs.add(e);
                    chip.classList.toggle('active');
                    renderRows();
                });
                envContainer.appendChild(chip);
            });
        };

        const updateSelectedUI = () => {
            const btn = vmView.querySelector('#vmCopySelected');
            const count = vmView.querySelector('#vmSelectedCount');
            if (selectedRows.size > 0) {
                btn.style.display = 'inline-flex';
                count.textContent = selectedRows.size;
            } else {
                btn.style.display = 'none';
            }
            const selectAll = vmView.querySelector('#vmSelectAll');
            if (selectAll) selectAll.checked = lastFiltered.length > 0 && lastFiltered.every(m => selectedRows.has(m.hostname));
        };

        const renderRows = () => {
            const filterSearch = vmView.querySelector('#vmFilterSearch').value.toLowerCase();
            const tbody = vmView.querySelector('#vmListBody');

            let filtered = allMachines.filter(m => {
                if (activeApps.size > 0 && !activeApps.has(m.application)) return false;
                if (activeEnvs.size > 0 && !activeEnvs.has(m.environment)) return false;
                if (filterSearch && !`${m.machine_name} ${m.hostname} ${m.server_type} ${m.application} ${m.environment} ${m.instance_type || ''}`.toLowerCase().includes(filterSearch)) return false;
                return true;
            });

            // Sort
            if (sortCol) {
                filtered.sort((a, b) => {
                    const va = (a[sortCol] || '').toLowerCase();
                    const vb = (b[sortCol] || '').toLowerCase();
                    return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
                });
            }
            lastFiltered = filtered;

            vmView.querySelector('#vmFilterCount').textContent = filtered.length + ' risultati';

            // Update sort icons
            vmView.querySelectorAll('.vm-th-sortable').forEach(th => {
                const icon = th.querySelector('.vm-sort-icon');
                if (th.dataset.col === sortCol) {
                    icon.textContent = sortAsc ? '\u25B2' : '\u25BC';
                    th.classList.add('vm-th-sorted');
                } else {
                    icon.textContent = '\u2195';
                    th.classList.remove('vm-th-sorted');
                }
            });

            tbody.innerHTML = filtered.map(m => {
                const eColor = envColors[m.environment] || '#7a7a96';
                const checked = selectedRows.has(m.hostname) ? 'checked' : '';
                return `<tr class="${checked ? 'vm-row-selected' : ''}" data-hostname="${m.hostname}">
                    <td class="vm-td-check"><input type="checkbox" class="vm-row-check" data-hostname="${m.hostname}" ${checked}></td>
                    <td class="vm-cell-name vm-cell-copyable" data-copy="${m.machine_name}" title="Clicca per copiare">${m.machine_name} <span class="vm-copy-hint">${SVG.copy}</span></td>
                    <td class="vm-cell-hostname vm-cell-copyable" data-copy="${m.hostname}" title="Clicca per copiare"><code>${m.hostname}</code> <span class="vm-copy-hint">${SVG.copy}</span></td>
                    <td class="vm-cell-app">${m.application}</td>
                    <td class="vm-cell-env"><span class="vm-env-badge" style="background:${eColor}14;color:${eColor};border-color:${eColor}30">${m.environment}</span></td>
                    <td class="vm-cell-instance"><code class="vm-instance-code">${m.instance_type || '-'}</code></td>
                    <td><span class="vm-type-badge-muted">${m.server_type.replace(' Server', '')}</span></td>
                </tr>`;
            }).join('');

            // Copyable cells
            tbody.querySelectorAll('.vm-cell-copyable').forEach(cell => {
                cell.addEventListener('click', async () => {
                    try {
                        await navigator.clipboard.writeText(cell.dataset.copy);
                        showToast('Copiato: ' + cell.dataset.copy, 'success');
                    } catch { /* ignore */ }
                });
            });

            // Row checkboxes
            tbody.querySelectorAll('.vm-row-check').forEach(cb => {
                cb.addEventListener('change', () => {
                    if (cb.checked) selectedRows.add(cb.dataset.hostname);
                    else selectedRows.delete(cb.dataset.hostname);
                    cb.closest('tr').classList.toggle('vm-row-selected', cb.checked);
                    updateSelectedUI();
                });
            });

            updateSelectedUI();
        };

        const formatMachinesHtmlTable = (machines) => {
            const cols = [
                { key: 'machine_name', label: 'Nome Server' },
                { key: 'hostname', label: 'Hostname' },
                { key: 'application', label: 'Applicazione' },
                { key: 'environment', label: 'Ambiente' },
                { key: 'instance_type', label: 'Instance Type' },
                { key: 'server_type', label: 'Tipo' }
            ];
            let html = '<table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px;">';
            html += '<thead><tr>' + cols.map(c => `<th style="background:#f2f2f2;padding:6px 10px;text-align:left;font-weight:bold;border:1px solid #ccc;">${c.label}</th>`).join('') + '</tr></thead>';
            html += '<tbody>';
            machines.forEach(m => {
                html += '<tr>' + cols.map(c => `<td style="padding:4px 10px;border:1px solid #ddd;">${m[c.key] || '-'}</td>`).join('') + '</tr>';
            });
            html += '</tbody></table>';
            // Also create plain text fallback
            const pad = (s, n) => (s || '').padEnd(n);
            const widths = cols.map(c => Math.max(c.label.length, ...machines.map(m => (m[c.key] || '-').length)) + 2);
            const header = cols.map((c, i) => pad(c.label, widths[i])).join(' | ');
            const sep = widths.map(w => '-'.repeat(w)).join('-+-');
            const rows = machines.map(m => cols.map((c, i) => pad(m[c.key] || '-', widths[i])).join(' | '));
            const text = [header, sep, ...rows].join('\n');
            return { html, text };
        };

        const copyMachinesAsTable = async (machines, label) => {
            if (machines.length === 0) { showToast('Nessun server da copiare', 'info'); return; }
            try {
                const { html, text } = formatMachinesHtmlTable(machines);
                await navigator.clipboard.write([
                    new ClipboardItem({
                        'text/html': new Blob([html], { type: 'text/html' }),
                        'text/plain': new Blob([text], { type: 'text/plain' })
                    })
                ]);
                showToast(`${machines.length} server copiati come tabella`, 'success');
            } catch {
                // Fallback to plain text
                try {
                    const { text } = formatMachinesHtmlTable(machines);
                    await navigator.clipboard.writeText(text);
                    showToast(`${machines.length} server copiati negli appunti`, 'success');
                } catch { showToast('Errore nella copia', 'error'); }
            }
        };

        // Copy all visible
        vmView.querySelector('#vmCopyAll').addEventListener('click', () => copyMachinesAsTable(lastFiltered, 'visibili'));

        // Copy selected
        vmView.querySelector('#vmCopySelected').addEventListener('click', () => {
            const selected = lastFiltered.filter(m => selectedRows.has(m.hostname));
            copyMachinesAsTable(selected, 'selezionati');
        });

        // Select all checkbox
        vmView.querySelector('#vmSelectAll').addEventListener('change', (e) => {
            if (e.target.checked) {
                lastFiltered.forEach(m => selectedRows.add(m.hostname));
            } else {
                lastFiltered.forEach(m => selectedRows.delete(m.hostname));
            }
            renderRows();
        });

        // Sortable columns
        vmView.querySelectorAll('.vm-th-sortable').forEach(th => {
            th.addEventListener('click', () => {
                const col = th.dataset.col;
                if (sortCol === col) { sortAsc = !sortAsc; }
                else { sortCol = col; sortAsc = true; }
                renderRows();
            });
        });

        renderFilterChips();
        renderRows();
        vmView.querySelector('#vmFilterSearch').addEventListener('input', debounce(renderRows, 300));
    }

    // ============================================
    // EBS Disk List View
    // ============================================
    function showEBSList() {
        currentApp = null;
        currentEnv = null;
        $$('#appList .nav-item').forEach(i => i.classList.remove('active'));
        $$('.sidebar-action-btn').forEach(b => b.classList.remove('active'));
        const ebsBtn = document.getElementById('ebsListBtn');
        if (ebsBtn) ebsBtn.classList.add('active');
        closeEnvPopover();
        updateBreadcrumb(null);
        $('#breadcrumb').innerHTML = '<span class="breadcrumb-item active">Elenco Dischi AWS</span>';
        renderEBSList();
        showView('ebs-list');
    }

    function renderEBSList() {
        const ebsView = document.getElementById('ebsListView');
        if (!ebsView) return;

        const allDisks = DataManager.getEBSVolumes();
        const apps = [...new Set(allDisks.map(d => d.application).filter(Boolean))].sort();
        const envs = [...new Set(allDisks.map(d => d.environment).filter(Boolean))].sort();
        const selectedRows = new Set();
        const activeApps = new Set();
        const activeEnvs = new Set();
        let sortCol = null, sortAsc = true;
        let lastFiltered = allDisks;

        // Type breakdown
        const calcTypeCounts = (disks) => {
            const types = {};
            disks.forEach(d => { const t = d.volume_type || 'unknown'; types[t] = (types[t] || 0) + 1; });
            return types;
        };
        const calcTotalSize = (disks) => disks.reduce((s, d) => s + (parseFloat(d.size_gb) || 0), 0);

        ebsView.innerHTML = `
            <div class="vm-list-header">
                <div class="vm-list-title-row">
                    <div>
                        <h2>Elenco Dischi AWS (EBS)</h2>
                        <div class="vm-list-subtitle">${allDisks.length} volumi totali</div>
                    </div>
                    <div class="vm-list-actions">
                        <button class="btn-secondary vm-copy-btn" id="ebsCopySelected" style="display:none">
                            ${SVG.copy} Copia selezionati (<span id="ebsSelectedCount">0</span>)
                        </button>
                        <button class="btn-secondary vm-copy-btn" id="ebsCopyAll">
                            ${SVG.copy} Copia elenco visibile
                        </button>
                    </div>
                </div>
            </div>
            <div class="ebs-totals" id="ebsTotals"></div>
            <div class="vm-list-filters">
                <div class="vm-filter-row">
                    <span class="vm-filter-label">Applicazione</span>
                    <div class="vm-filter-chips" id="ebsAppChips"></div>
                </div>
                <div class="vm-filter-row">
                    <span class="vm-filter-label">Ambiente</span>
                    <div class="vm-filter-chips" id="ebsEnvChips"></div>
                </div>
                <div class="vm-filter-row">
                    <div class="vm-filter-search-group">
                        <input type="text" class="vm-filter-search" id="ebsFilterSearch" placeholder="Cerca per Volume ID, tipo, applicazione...">
                    </div>
                    <span class="vm-filter-count" id="ebsFilterCount">${allDisks.length} risultati</span>
                </div>
            </div>
            <div class="vm-list-table-wrapper">
                <table class="vm-list-table">
                    <thead>
                        <tr>
                            <th class="vm-th-check"><input type="checkbox" id="ebsSelectAll" title="Seleziona tutti"></th>
                            <th class="vm-th-sortable" data-col="volume_id">Volume ID <span class="vm-sort-icon"></span></th>
                            <th class="vm-th-sortable" data-col="size_gb">Dimensione (GB) <span class="vm-sort-icon"></span></th>
                            <th class="vm-th-sortable" data-col="iops">IOPS <span class="vm-sort-icon"></span></th>
                            <th class="vm-th-sortable" data-col="throughput">Throughput <span class="vm-sort-icon"></span></th>
                            <th class="vm-th-sortable" data-col="volume_type">Tipo <span class="vm-sort-icon"></span></th>
                            <th class="vm-th-sortable vm-th-app" data-col="application">Applicazione <span class="vm-sort-icon"></span></th>
                            <th class="vm-th-sortable vm-th-env" data-col="environment">Ambiente <span class="vm-sort-icon"></span></th>
                        </tr>
                    </thead>
                    <tbody id="ebsListBody"></tbody>
                </table>
            </div>`;

        if (allDisks.length === 0) {
            ebsView.querySelector('#ebsListBody').innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-tertiary);">Nessun volume EBS trovato. Aggiungere i dati nel file <code>data/ebs_volumes.csv</code>.</td></tr>`;
        }

        const renderTotals = (disks) => {
            const fmt = n => n.toLocaleString('it-IT');
            const totalSize = calcTotalSize(disks);
            const types = calcTypeCounts(disks);
            const typeStr = Object.entries(types).sort((a,b) => b[1] - a[1]).map(([t, c]) => `<span class="ebs-type-item">${c} <strong>${t}</strong></span>`).join('');
            ebsView.querySelector('#ebsTotals').innerHTML = `
                <div class="ebs-total-card"><div class="ebs-total-value">${fmt(disks.length)}</div><div class="ebs-total-label">Volumi</div></div>
                <div class="ebs-total-card"><div class="ebs-total-value">${fmt(Math.round(totalSize))}</div><div class="ebs-total-label">GB Totali</div></div>
                <div class="ebs-total-card ebs-total-card-wide"><div class="ebs-total-label" style="margin-bottom:4px;">Tipi di disco</div><div class="ebs-type-list">${typeStr || '<span style="color:var(--text-tertiary);">—</span>'}</div></div>`;
        };

        const updateSelectedUI = () => {
            const btn = ebsView.querySelector('#ebsCopySelected');
            const count = ebsView.querySelector('#ebsSelectedCount');
            if (selectedRows.size > 0) {
                btn.style.display = 'inline-flex';
                count.textContent = selectedRows.size;
            } else {
                btn.style.display = 'none';
            }
            const selectAll = ebsView.querySelector('#ebsSelectAll');
            if (selectAll) selectAll.checked = lastFiltered.length > 0 && lastFiltered.every(d => selectedRows.has(d.volume_id));
        };

        const renderFilterChips = () => {
            const appContainer = ebsView.querySelector('#ebsAppChips');
            const envContainer = ebsView.querySelector('#ebsEnvChips');
            appContainer.innerHTML = '';
            envContainer.innerHTML = '';
            apps.forEach((a, i) => {
                const color = appColors[i % appColors.length];
                const chip = document.createElement('button');
                chip.className = 'gc-filter-chip' + (activeApps.has(a) ? ' active' : '');
                chip.innerHTML = `<span class="gc-filter-dot" style="background:${color}"></span>${a}`;
                chip.addEventListener('click', () => {
                    if (activeApps.has(a)) activeApps.delete(a); else activeApps.add(a);
                    chip.classList.toggle('active');
                    renderRows();
                });
                appContainer.appendChild(chip);
            });
            envs.forEach(e => {
                const color = envColors[e] || '#7a7a96';
                const chip = document.createElement('button');
                chip.className = 'gc-filter-chip' + (activeEnvs.has(e) ? ' active' : '');
                chip.innerHTML = `<span class="gc-filter-dot" style="background:${color}"></span>${e}`;
                chip.addEventListener('click', () => {
                    if (activeEnvs.has(e)) activeEnvs.delete(e); else activeEnvs.add(e);
                    chip.classList.toggle('active');
                    renderRows();
                });
                envContainer.appendChild(chip);
            });
        };

        const renderRows = () => {
            const search = ebsView.querySelector('#ebsFilterSearch').value.toLowerCase();
            const tbody = ebsView.querySelector('#ebsListBody');
            let filtered = allDisks.filter(d => {
                if (activeApps.size > 0 && !activeApps.has(d.application)) return false;
                if (activeEnvs.size > 0 && !activeEnvs.has(d.environment)) return false;
                if (search && !`${d.volume_id} ${d.volume_type} ${d.application} ${d.environment} ${d.size_gb}`.toLowerCase().includes(search)) return false;
                return true;
            });
            if (sortCol) {
                filtered.sort((a, b) => {
                    let va = a[sortCol] || '', vb = b[sortCol] || '';
                    if (['size_gb', 'iops', 'throughput'].includes(sortCol)) {
                        va = parseFloat(va) || 0; vb = parseFloat(vb) || 0;
                        return sortAsc ? va - vb : vb - va;
                    }
                    va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
                    return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
                });
            }
            lastFiltered = filtered;
            ebsView.querySelector('#ebsFilterCount').textContent = filtered.length + ' risultati';
            renderTotals(filtered);

            ebsView.querySelectorAll('.vm-th-sortable').forEach(th => {
                const icon = th.querySelector('.vm-sort-icon');
                if (th.dataset.col === sortCol) {
                    icon.textContent = sortAsc ? '\u25B2' : '\u25BC';
                    th.classList.add('vm-th-sorted');
                } else {
                    icon.textContent = '\u2195';
                    th.classList.remove('vm-th-sorted');
                }
            });

            const fmt = n => Number(n).toLocaleString('it-IT');
            tbody.innerHTML = filtered.map(d => {
                const eColor = envColors[d.environment] || '#7a7a96';
                const checked = selectedRows.has(d.volume_id) ? 'checked' : '';
                return `<tr class="${checked ? 'vm-row-selected' : ''}" data-volume-id="${d.volume_id}">
                    <td class="vm-td-check"><input type="checkbox" class="ebs-row-check" data-volume-id="${d.volume_id}" ${checked}></td>
                    <td class="vm-cell-hostname vm-cell-copyable" data-copy="${d.volume_id}" title="Clicca per copiare"><code>${d.volume_id}</code> <span class="vm-copy-hint">${SVG.copy}</span></td>
                    <td style="font-weight:600;">${fmt(d.size_gb || 0)}</td>
                    <td>${fmt(d.iops || 0)}</td>
                    <td>${fmt(d.throughput || 0)}</td>
                    <td><code class="vm-instance-code">${d.volume_type || '-'}</code></td>
                    <td class="vm-cell-app">${d.application || '-'}</td>
                    <td class="vm-cell-env"><span class="vm-env-badge" style="background:${eColor}14;color:${eColor};border-color:${eColor}30">${d.environment || '-'}</span></td>
                </tr>`;
            }).join('');

            tbody.querySelectorAll('.vm-cell-copyable').forEach(cell => {
                cell.addEventListener('click', async () => {
                    try { await navigator.clipboard.writeText(cell.dataset.copy); showToast('Copiato: ' + cell.dataset.copy, 'success'); } catch {}
                });
            });

            // Row checkboxes
            tbody.querySelectorAll('.ebs-row-check').forEach(cb => {
                cb.addEventListener('change', () => {
                    if (cb.checked) selectedRows.add(cb.dataset.volumeId);
                    else selectedRows.delete(cb.dataset.volumeId);
                    cb.closest('tr').classList.toggle('vm-row-selected', cb.checked);
                    updateSelectedUI();
                });
            });

            updateSelectedUI();
        };

        const copyDisksAsTable = async (disks, label) => {
            if (disks.length === 0) { showToast('Nessun disco da copiare', 'info'); return; }
            const cols = [
                { key: 'volume_id', label: 'Volume ID' }, { key: 'size_gb', label: 'Size (GB)' },
                { key: 'iops', label: 'IOPS' }, { key: 'throughput', label: 'Throughput' },
                { key: 'volume_type', label: 'Tipo' }, { key: 'application', label: 'Applicazione' },
                { key: 'environment', label: 'Ambiente' }
            ];
            let html = '<table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px;">';
            html += '<thead><tr>' + cols.map(c => `<th style="background:#f2f2f2;padding:6px 10px;text-align:left;font-weight:bold;border:1px solid #ccc;">${c.label}</th>`).join('') + '</tr></thead><tbody>';
            disks.forEach(d => { html += '<tr>' + cols.map(c => `<td style="padding:4px 10px;border:1px solid #ddd;">${d[c.key] || '-'}</td>`).join('') + '</tr>'; });
            html += '</tbody></table>';
            try {
                await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([disks.map(d => cols.map(c => d[c.key] || '-').join('\t')).join('\n')], { type: 'text/plain' }) })]);
                showToast(`${disks.length} volumi copiati come tabella`, 'success');
            } catch {
                // Fallback to plain text
                try {
                    const text = disks.map(d => cols.map(c => d[c.key] || '-').join('\t')).join('\n');
                    await navigator.clipboard.writeText(text);
                    showToast(`${disks.length} volumi copiati negli appunti`, 'success');
                } catch { showToast('Errore nella copia', 'error'); }
            }
        };

        // Copy all visible
        ebsView.querySelector('#ebsCopyAll').addEventListener('click', () => copyDisksAsTable(lastFiltered, 'visibili'));

        // Copy selected
        ebsView.querySelector('#ebsCopySelected').addEventListener('click', () => {
            const selected = lastFiltered.filter(d => selectedRows.has(d.volume_id));
            copyDisksAsTable(selected, 'selezionati');
        });

        // Select all checkbox
        ebsView.querySelector('#ebsSelectAll').addEventListener('change', (e) => {
            if (e.target.checked) {
                lastFiltered.forEach(d => selectedRows.add(d.volume_id));
            } else {
                lastFiltered.forEach(d => selectedRows.delete(d.volume_id));
            }
            renderRows();
        });

        // Sort
        ebsView.querySelectorAll('.vm-th-sortable').forEach(th => {
            th.addEventListener('click', () => {
                const col = th.dataset.col;
                if (sortCol === col) sortAsc = !sortAsc;
                else { sortCol = col; sortAsc = true; }
                renderRows();
            });
        });

        renderFilterChips();
        renderRows();
        ebsView.querySelector('#ebsFilterSearch').addEventListener('input', debounce(renderRows, 300));
    }

    // ============================================
    // Calculator View
    // ============================================
    function showCalculator() {
        currentApp = null;
        currentEnv = null;
        $$('#appList .nav-item').forEach(i => i.classList.remove('active'));
        $$('.sidebar-action-btn').forEach(b => b.classList.remove('active'));
        const calcBtn = document.getElementById('calculatorBtn');
        if (calcBtn) calcBtn.classList.add('active');
        closeEnvPopover();
        updateBreadcrumb(null);
        $('#breadcrumb').innerHTML = '<span class="breadcrumb-item active">Calcolatore</span>';
        renderCalculator();
        showView('calculator');
    }

    function renderCalculator() {
        const calcView = document.getElementById('calculatorView');
        if (!calcView) return;
        calcView.innerHTML = `
            <div class="calculator-empty">
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="10" y2="10"/><line x1="12" y1="10" x2="14" y2="10"/><line x1="16" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="10" y2="14"/><line x1="12" y1="14" x2="14" y2="14"/><line x1="16" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="10" y2="18"/><line x1="12" y1="18" x2="16" y2="18"/></svg>
                <h3>Calcolatore FinOps</h3>
                <p>Questa sezione ospiter\u00e0 i calcolatori per le fee aziendali interne e altri strumenti di analisi costi.</p>
            </div>`;
    }

    // ============================================
    // User Management (Admin only)
    // ============================================
    function showUserManagement() {
        const current = DataManager.getCurrentUser();
        if (!current || current.role !== 'Admin') {
            showToast('Accesso riservato agli amministratori', 'error');
            return;
        }
        currentApp = null;
        currentEnv = null;
        $$('#appList .nav-item').forEach(i => i.classList.remove('active'));
        $$('.sidebar-action-btn').forEach(b => b.classList.remove('active'));
        const mgmtBtn = document.getElementById('userMgmtBtn');
        if (mgmtBtn) mgmtBtn.classList.add('active');
        closeEnvPopover();
        updateBreadcrumb(null);
        $('#breadcrumb').innerHTML = '<span class="breadcrumb-item active">Gestisci Utenti</span>';
        renderUserManagement();
        showView('user-mgmt');
    }

    async function renderUserManagement() {
        const mgmtView = document.getElementById('userMgmtView');
        if (!mgmtView) return;

        mgmtView.innerHTML = `
            <div class="user-mgmt-header">
                <div>
                    <h2>Gestione Utenti</h2>
                    <div class="user-mgmt-subtitle">Gestisci utenti, ruoli e permessi applicativi</div>
                </div>
                <div class="user-mgmt-actions">
                    <button class="btn-secondary" id="umRefreshBtn">
                        ${SVG.refresh} Aggiorna
                    </button>
                    <button class="btn-primary" id="umAddUserBtn">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Nuovo Utente
                    </button>
                </div>
            </div>
            <div class="user-mgmt-search-bar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" id="umSearchInput" placeholder="Cerca per nome, user ID, GitHub, ruolo...">
                <span class="user-mgmt-search-count" id="umUserCount"></span>
            </div>
            <div class="user-mgmt-table-wrapper">
                <table class="user-mgmt-table">
                    <thead>
                        <tr>
                            <th>Utente</th>
                            <th>GitHub</th>
                            <th>Ruolo</th>
                            <th>Permessi Applicazioni</th>
                            <th>Permessi Speciali</th>
                            <th>Ultimo Accesso</th>
                            <th style="width:80px;">Azioni</th>
                        </tr>
                    </thead>
                    <tbody id="umTableBody">
                        <tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-tertiary);">Caricamento...</td></tr>
                    </tbody>
                </table>
            </div>`;

        // Load users from DynamoDB if possible, otherwise from local
        let usersList = [];
        if (DynamoService.CONFIG.enabled) {
            try {
                usersList = await DynamoService.fetchUsers();
                if (!usersList) usersList = DataManager.getUsers();
            } catch {
                usersList = DataManager.getUsers();
            }
        } else {
            usersList = DataManager.getUsers();
        }

        const renderTable = (searchFilter = '') => {
            const tbody = mgmtView.querySelector('#umTableBody');
            if (!usersList || usersList.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-tertiary);">Nessun utente trovato</td></tr>';
                mgmtView.querySelector('#umUserCount').textContent = '0 utenti';
                return;
            }

            const q = searchFilter.toLowerCase();
            const filtered = q ? usersList.filter(u => {
                const uid = u.user_id || u.id || '';
                const searchStr = `${uid} ${u.name || ''} ${u.github_user || ''} ${u.role || ''}`.toLowerCase();
                return searchStr.includes(q);
            }) : usersList;

            mgmtView.querySelector('#umUserCount').textContent = `${filtered.length} utent${filtered.length === 1 ? 'e' : 'i'}`;

            if (filtered.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-tertiary);">Nessun risultato per "${searchFilter}"</td></tr>`;
                return;
            }

            const currentUserId = (() => { const c = DataManager.getCurrentUser(); return c ? (c.user_id || c.id) : null; })();

            tbody.innerHTML = filtered.map(u => {
                const userId = u.user_id || u.id;
                const isSelf = userId === currentUserId;
                const roleClass = u.role === 'Admin' ? 'admin' : u.role === 'Application_owner' ? 'owner' : 'readonly';
                const roleLabel = u.role === 'Admin' ? 'Admin' : u.role === 'Application_owner' ? 'App Owner' : 'Read-Only';

                // Build app tags
                let appTags = '';
                const apps = u.applications;
                if (Array.isArray(apps) && apps.includes('*')) {
                    appTags = '<span class="user-app-tag rw">Tutte le applicazioni</span>';
                } else if (typeof apps === 'object' && !Array.isArray(apps)) {
                    const appEntries = Object.entries(apps).filter(([k]) => !['lista_server', 'lista_ebs', 'calcolatore'].includes(k));
                    appTags = appEntries.slice(0, 5).map(([app, perm]) =>
                        `<span class="user-app-tag ${perm}">${app} <small>${perm.toUpperCase()}</small></span>`
                    ).join('');
                    if (appEntries.length > 5) appTags += `<span class="user-app-tag">+${appEntries.length - 5}</span>`;
                    if (appEntries.length === 0) appTags = '<span style="color:var(--text-tertiary);font-size:0.75rem;">\u2014</span>';
                } else if (Array.isArray(apps)) {
                    appTags = apps.map(a => `<span class="user-app-tag rw">${a}</span>`).join('');
                } else {
                    appTags = '<span style="color:var(--text-tertiary);font-size:0.75rem;">\u2014</span>';
                }

                // Special permissions
                const specials = [];
                if (typeof apps === 'object' && !Array.isArray(apps)) {
                    if (apps['lista_server']) specials.push('<span class="user-app-tag special">Elenco VM</span>');
                    if (apps['lista_ebs']) specials.push('<span class="user-app-tag special">Elenco EBS</span>');
                    if (apps['calcolatore']) specials.push('<span class="user-app-tag special">Calcolatore</span>');
                }
                if (u.role === 'Admin' || (Array.isArray(apps) && apps.includes('*'))) {
                    specials.length = 0;
                    specials.push('<span class="user-app-tag special">Tutti</span>');
                }
                const specialsHtml = specials.length > 0 ? specials.join('') : '<span style="color:var(--text-tertiary);font-size:0.75rem;">\u2014</span>';

                const lastAccess = u.last_login || u.updated_at || '\u2014';
                const lastAccessStr = lastAccess !== '\u2014' ? new Date(lastAccess).toLocaleString('it-IT', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '\u2014';

                return `<tr data-user-id="${userId}">
                    <td class="user-name-cell">${u.name || userId}<small>${userId}</small></td>
                    <td><code style="font-size:0.8rem;">${u.github_user || '\u2014'}</code></td>
                    <td><span class="user-role-badge ${roleClass}">${roleLabel}</span></td>
                    <td><div class="user-apps-list">${appTags}</div></td>
                    <td><div class="user-apps-list">${specialsHtml}</div></td>
                    <td class="user-last-access">${lastAccessStr}</td>
                    <td>
                        <div class="user-actions-cell">
                            <button class="user-action-btn um-edit-btn" data-user-id="${userId}" title="Modifica">
                                ${SVG.edit}
                            </button>
                            ${!isSelf ? `<button class="user-action-btn danger um-delete-btn" data-user-id="${userId}" title="Elimina">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>` : '<span style="font-size:0.7rem;color:var(--text-tertiary);" title="Non puoi eliminare te stesso">Tu</span>'}
                        </div>
                    </td>
                </tr>`;
            }).join('');

            // Bind edit buttons
            tbody.querySelectorAll('.um-edit-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const uid = btn.dataset.userId;
                    const u = usersList.find(x => (x.user_id || x.id) === uid);
                    if (u) openUserEditPanel(u, false, () => renderUserManagement());
                });
            });

            // Bind delete buttons
            tbody.querySelectorAll('.um-delete-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const uid = btn.dataset.userId;
                    const current = DataManager.getCurrentUser();
                    if (uid === (current.user_id || current.id)) {
                        showToast('Non puoi eliminare il tuo stesso account', 'error');
                        return;
                    }
                    if (!confirm(`Sei sicuro di voler eliminare l'utente "${uid}"?`)) return;
                    try {
                        if (DynamoService.CONFIG.enabled) {
                            await DynamoService.deleteUser(uid);
                        }
                        showToast(`Utente "${uid}" eliminato`, 'success');
                        renderUserManagement();
                    } catch (e) {
                        showToast('Errore eliminazione: ' + e.message, 'error');
                    }
                });
            });
        };

        renderTable();

        // Search filter
        mgmtView.querySelector('#umSearchInput').addEventListener('input', debounce(() => {
            renderTable(mgmtView.querySelector('#umSearchInput').value.trim());
        }, 250));

        // Add user button
        mgmtView.querySelector('#umAddUserBtn').addEventListener('click', () => {
            openUserEditPanel(null, true, () => renderUserManagement());
        });

        // Refresh button
        mgmtView.querySelector('#umRefreshBtn').addEventListener('click', () => renderUserManagement());
    }

    function openUserEditPanel(existingUser, isNew, onSaved) {
        const allApps = DataManager.getApplications(true).map(a => a.name);
        const currentLoggedIn = DataManager.getCurrentUser();
        const isSelf = !isNew && existingUser && (existingUser.user_id || existingUser.id) === (currentLoggedIn.user_id || currentLoggedIn.id);

        // Build current permissions map from user
        const currentPerms = {};
        if (existingUser) {
            const apps = existingUser.applications;
            if (typeof apps === 'object' && !Array.isArray(apps)) {
                Object.entries(apps).forEach(([k, v]) => { currentPerms[k] = v; });
            } else if (Array.isArray(apps) && apps.includes('*')) {
                // Admin with all — mark all as rw
                allApps.forEach(a => { currentPerms[a] = 'rw'; });
            }
        }

        const overlay = document.createElement('div');
        overlay.className = 'user-edit-overlay';
        overlay.innerHTML = `
            <div class="user-edit-panel">
                <div class="user-edit-header">
                    <h3>${isNew ? 'Nuovo Utente' : 'Modifica Utente'}</h3>
                    <button class="btn-icon modal-close" id="ueCloseBtn">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
                <div class="user-edit-body">
                    <div class="user-edit-row">
                        <div class="user-edit-field">
                            <label>User ID</label>
                            <input type="text" id="ueUserId" value="${existingUser ? (existingUser.user_id || existingUser.id || '') : ''}" ${!isNew ? 'readonly style="opacity:0.6;cursor:not-allowed;"' : ''} placeholder="es. nome.cognome">
                        </div>
                        <div class="user-edit-field">
                            <label>Nome completo</label>
                            <input type="text" id="ueName" value="${existingUser ? (existingUser.name || '') : ''}" placeholder="es. Mario Rossi">
                        </div>
                    </div>
                    <div class="user-edit-row">
                        <div class="user-edit-field">
                            <label>GitHub Username</label>
                            <input type="text" id="ueGithub" value="${existingUser ? (existingUser.github_user || '') : ''}" placeholder="es. mario-rossi" ${!isNew && existingUser && existingUser.role === 'Admin' ? 'readonly style="opacity:0.6;cursor:not-allowed;"' : ''}>
                            ${!isNew && existingUser && existingUser.role === 'Admin' ? '<small style="color:var(--text-tertiary);font-size:0.72rem;">Il GitHub username degli admin non \u00e8 modificabile</small>' : ''}
                        </div>
                        <div class="user-edit-field">
                            <label>Ruolo</label>
                            <select id="ueRole" ${isSelf ? 'disabled style="opacity:0.6;cursor:not-allowed;"' : ''}>
                                <option value="Admin" ${existingUser && existingUser.role === 'Admin' ? 'selected' : ''}>Admin</option>
                                <option value="Application_owner" ${existingUser && existingUser.role === 'Application_owner' ? 'selected' : ''}>Application Owner</option>
                                <option value="Read-Only" ${existingUser && existingUser.role === 'Read-Only' ? 'selected' : ''}>Read-Only</option>
                            </select>
                            ${isSelf ? '<small style="color:var(--text-tertiary);font-size:0.72rem;">Non puoi modificare il tuo ruolo</small>' : ''}
                        </div>
                    </div>

                    <div class="user-edit-field">
                        <label>Permessi Speciali</label>
                        <div class="user-special-perms">
                            <label class="user-special-perm-item">
                                <input type="checkbox" id="uePermVMList" ${currentPerms['lista_server'] ? 'checked' : ''}>
                                Elenco VM
                            </label>
                            <label class="user-special-perm-item">
                                <input type="checkbox" id="uePermEBSList" ${currentPerms['lista_ebs'] ? 'checked' : ''}>
                                Elenco Dischi EBS
                            </label>
                            <label class="user-special-perm-item">
                                <input type="checkbox" id="uePermCalc" ${currentPerms['calcolatore'] ? 'checked' : ''}>
                                Calcolatore
                            </label>
                        </div>
                    </div>

                    <div class="user-perm-section" id="ueAppPermsSection">
                        <div class="user-perm-section-header">
                            <span>Permessi Applicazioni</span>
                            <input type="text" class="user-perm-search" id="ueAppSearch" placeholder="Cerca applicazione...">
                        </div>
                        <div class="user-perm-list" id="ueAppPermList"></div>
                    </div>
                </div>
                <div class="user-edit-footer">
                    <button class="btn-secondary" id="ueCancelBtn">Annulla</button>
                    <button class="btn-primary" id="ueSaveBtn">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                        Salva
                    </button>
                </div>
            </div>`;

        document.body.appendChild(overlay);

        // Local perms state — supports string or object per app
        // String: "rw" / "ro" (same for all envs)
        // Object: { "_default": "rw", "Produzione": "ro" } (per-env overrides)
        const perms = {};
        Object.entries(currentPerms).forEach(([k, v]) => {
            perms[k] = v; // Can be string or object
        });
        const expandedApps = new Set();
        const PRODUCTION_ENVS = new Set(['Production', 'Produzione']);

        const _getAppDefault = (appName) => {
            const val = perms[appName];
            if (!val) return 'none';
            if (typeof val === 'object') return val._default || 'rw';
            return val;
        };

        const _getEnvPerm = (appName, envName) => {
            const val = perms[appName];
            if (!val) return null;
            if (typeof val === 'object' && val[envName]) return val[envName];
            // Production defaults to RO when app is RW
            if (PRODUCTION_ENVS.has(envName) && _getAppDefault(appName) === 'rw') return 'ro';
            return _getAppDefault(appName);
        };

        const renderAppPerms = (filter = '') => {
            const list = overlay.querySelector('#ueAppPermList');
            const q = filter.toLowerCase();
            list.innerHTML = allApps
                .filter(a => !q || a.toLowerCase().includes(q))
                .map(appName => {
                    const p = _getAppDefault(appName);
                    const envs = DataManager.getEnvironments(appName);
                    const hasEnvOverrides = typeof perms[appName] === 'object';
                    const isExpanded = expandedApps.has(appName);

                    let envHtml = '';
                    if (isExpanded && envs.length > 0 && p !== 'none') {
                        envHtml = '<div class="user-env-perms">';
                        envs.forEach(env => {
                            const ep = _getEnvPerm(appName, env.name);
                            const isProd = PRODUCTION_ENVS.has(env.name);
                            envHtml += `<div class="user-env-perm-row" data-app="${appName}" data-env="${env.name}">
                                <span class="user-env-perm-name">${env.name}${isProd ? ' <small style="color:var(--accent);">(RO default)</small>' : ''}</span>
                                <div class="user-perm-toggle-group user-perm-toggle-group-sm">
                                    <button class="user-perm-toggle ${ep === 'rw' ? 'active-rw' : ''}" data-perm="rw" data-env="${env.name}">RW</button>
                                    <button class="user-perm-toggle ${ep === 'ro' ? 'active-ro' : ''}" data-perm="ro" data-env="${env.name}">RO</button>
                                </div>
                            </div>`;
                        });
                        envHtml += '</div>';
                    }

                    return `<div class="user-perm-item" data-app="${appName}">
                        <div class="user-perm-item-header">
                            <span class="user-perm-item-name">${appName}</span>
                            <div style="display:flex;align-items:center;gap:6px;">
                                <div class="user-perm-toggle-group">
                                    <button class="user-perm-toggle ${p === 'rw' ? 'active-rw' : ''}" data-perm="rw">RW</button>
                                    <button class="user-perm-toggle ${p === 'ro' ? 'active-ro' : ''}" data-perm="ro">RO</button>
                                    <button class="user-perm-toggle ${p === 'none' ? 'active-none' : ''}" data-perm="none">\u2014</button>
                                </div>
                                ${envs.length > 0 && p !== 'none' ? `<button class="user-perm-expand-btn ${isExpanded ? 'expanded' : ''}" data-app="${appName}" title="Permessi per ambiente">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                                </button>` : ''}
                            </div>
                        </div>
                        ${envHtml}
                    </div>`;
                }).join('');

            // Bind app-level toggles
            list.querySelectorAll('.user-perm-item-header > div > .user-perm-toggle-group > .user-perm-toggle').forEach(btn => {
                btn.addEventListener('click', () => {
                    const item = btn.closest('.user-perm-item');
                    const app = item.dataset.app;
                    const perm = btn.dataset.perm;
                    if (perm === 'none') {
                        delete perms[app];
                    } else {
                        // Preserve env overrides if they exist
                        if (typeof perms[app] === 'object') {
                            perms[app]._default = perm;
                        } else {
                            perms[app] = perm;
                        }
                    }
                    renderAppPerms(overlay.querySelector('#ueAppSearch').value || '');
                });
            });

            // Bind expand buttons
            list.querySelectorAll('.user-perm-expand-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const app = btn.dataset.app;
                    if (expandedApps.has(app)) expandedApps.delete(app);
                    else expandedApps.add(app);
                    renderAppPerms(overlay.querySelector('#ueAppSearch').value || '');
                });
            });

            // Bind env-level toggles
            list.querySelectorAll('.user-env-perm-row .user-perm-toggle').forEach(btn => {
                btn.addEventListener('click', () => {
                    const row = btn.closest('.user-env-perm-row');
                    const app = row.dataset.app;
                    const env = row.dataset.env;
                    const perm = btn.dataset.perm;
                    // Convert to object format if needed
                    if (typeof perms[app] !== 'object') {
                        perms[app] = { _default: perms[app] || 'rw' };
                    }
                    // Check if the env perm matches the default — if so, remove override
                    const dflt = perms[app]._default || 'rw';
                    const effectiveDefault = PRODUCTION_ENVS.has(env) && dflt === 'rw' ? 'ro' : dflt;
                    if (perm === effectiveDefault) {
                        delete perms[app][env];
                    } else {
                        perms[app][env] = perm;
                    }
                    // If only _default remains, simplify back to string
                    const keys = Object.keys(perms[app]).filter(k => k !== '_default');
                    if (keys.length === 0) {
                        perms[app] = perms[app]._default;
                    }
                    renderAppPerms(overlay.querySelector('#ueAppSearch').value || '');
                });
            });
        };

        renderAppPerms();

        // Role change: if Admin or Read-Only, hide app perms (both get all apps)
        const roleSelect = overlay.querySelector('#ueRole');
        const appPermsSection = overlay.querySelector('#ueAppPermsSection');
        const specialPermsSection = overlay.querySelector('#uePermVMList')?.closest('.user-edit-field');
        const updateRoleUI = () => {
            const role = roleSelect.value;
            const hideApps = role === 'Admin' || role === 'Read-Only';
            appPermsSection.style.display = hideApps ? 'none' : '';
            if (specialPermsSection) specialPermsSection.style.display = hideApps ? 'none' : '';
        };
        updateRoleUI();
        roleSelect.addEventListener('change', updateRoleUI);

        // Search filter
        overlay.querySelector('#ueAppSearch').addEventListener('input', (e) => {
            renderAppPerms(e.target.value);
        });

        // Close
        const close = () => overlay.remove();
        overlay.querySelector('#ueCloseBtn').addEventListener('click', close);
        overlay.querySelector('#ueCancelBtn').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        // Save
        overlay.querySelector('#ueSaveBtn').addEventListener('click', async () => {
            const userId = overlay.querySelector('#ueUserId').value.trim();
            const name = overlay.querySelector('#ueName').value.trim();
            // If editing an admin, force original github_user (prevent identity change)
            const isTargetAdmin = !isNew && existingUser && existingUser.role === 'Admin';
            const github = isTargetAdmin ? existingUser.github_user : overlay.querySelector('#ueGithub').value.trim();
            // If editing self, force original role (prevent lockout)
            const role = isSelf && existingUser ? existingUser.role : overlay.querySelector('#ueRole').value;

            if (!userId || !name || !github) {
                showToast('Compila tutti i campi obbligatori (User ID, Nome, GitHub)', 'error');
                return;
            }

            // Build applications object
            let applications;
            if (role === 'Admin') {
                applications = ['*'];
            } else if (role === 'Read-Only') {
                // Read-Only gets automatic RO access to ALL apps via ["*"]
                applications = ['*'];
            } else {
                applications = {};
                // App perms
                Object.entries(perms).forEach(([k, v]) => {
                    if (!['lista_server', 'lista_ebs', 'calcolatore'].includes(k) && v) {
                        applications[k] = v;
                    }
                });
                // Special perms
                if (overlay.querySelector('#uePermVMList').checked) applications['lista_server'] = 'ro';
                if (overlay.querySelector('#uePermEBSList').checked) applications['lista_ebs'] = 'ro';
                if (overlay.querySelector('#uePermCalc').checked) applications['calcolatore'] = 'ro';
            }

            const userData = {
                user_id: userId,
                name: name,
                github_user: github,
                role: role,
                applications: applications
            };

            try {
                if (DynamoService.CONFIG.enabled) {
                    await DynamoService.upsertUser(userData);
                }
                showToast(`Utente "${name}" ${isNew ? 'creato' : 'aggiornato'} con successo`, 'success');
                close();
                if (onSaved) onSaved();
            } catch (e) {
                showToast('Errore salvataggio: ' + e.message, 'error');
            }
        });
    }

    // ============================================
    // CSV Import / Export
    // ============================================
    async function handleCSVImport(e) {
        const file = e.target.files[0];
        if (!file) return;
        try {
            await DataManager.loadFromFile(file);
            AuditLog.log('Import CSV', `File: ${file.name}, ${DataManager.machines.length} server`);
            renderAppList();
            renderHomeDashboard();
            goHome();
            gcActiveFilters.clear();
            gcActiveEnvFilters.clear();
            DynamoService.takeSnapshot(DataManager.getSchedulesRef());
            showToast(`CSV importato: ${DataManager.machines.length} server caricati`, 'success');
        } catch { showToast('Errore nell\'importazione del CSV', 'error'); }
        e.target.value = '';
    }

    function handleExport() {
        const data = DataManager.exportSchedules();
        if (data.length === 0) { showToast('Nessuna pianificazione da esportare', 'info'); return; }
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `finops-schedule-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        AuditLog.log('Export JSON', `${data.length} entries esportate`);
        showToast('Pianificazione esportata', 'success');
    }

    // ============================================
    // Refresh Confirmation Tooltip
    // ============================================
    function showRefreshConfirm() {
        return new Promise(resolve => {
            // Remove any existing tooltip
            const existing = document.querySelector('.refresh-confirm-tooltip');
            if (existing) { existing.remove(); }
            const existingBackdrop = document.querySelector('.refresh-confirm-backdrop');
            if (existingBackdrop) { existingBackdrop.remove(); }
            if (existing) { resolve(false); return; }

            const refreshBtn = $('#refreshBtn');
            const rect = refreshBtn.getBoundingClientRect();

            // Semi-transparent backdrop
            const backdrop = document.createElement('div');
            backdrop.className = 'refresh-confirm-backdrop';
            document.body.appendChild(backdrop);

            const tooltip = document.createElement('div');
            tooltip.className = 'refresh-confirm-tooltip';
            tooltip.innerHTML = `
                <div class="refresh-confirm-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                </div>
                <div class="refresh-confirm-text">
                    Hai modifiche non salvate.<br>
                    <strong>Andranno perse.</strong> Continuare?
                </div>
                <div class="refresh-confirm-actions">
                    <button class="refresh-confirm-cancel">Annulla</button>
                    <button class="refresh-confirm-ok">Aggiorna</button>
                </div>`;
            document.body.appendChild(tooltip);

            // Position below the refresh button
            tooltip.style.top = (rect.bottom + 8) + 'px';
            tooltip.style.right = (window.innerWidth - rect.right) + 'px';

            requestAnimationFrame(() => {
                backdrop.classList.add('show');
                tooltip.classList.add('show');
            });

            const cleanup = (result) => {
                tooltip.classList.remove('show');
                backdrop.classList.remove('show');
                setTimeout(() => { tooltip.remove(); backdrop.remove(); }, 150);
                resolve(result);
            };

            tooltip.querySelector('.refresh-confirm-cancel').addEventListener('click', (e) => {
                e.stopPropagation();
                cleanup(false);
            });
            tooltip.querySelector('.refresh-confirm-ok').addEventListener('click', (e) => {
                e.stopPropagation();
                cleanup(true);
            });

            backdrop.addEventListener('click', () => cleanup(false));
        });
    }

    // ============================================
    // Refresh / Fetch State
    // ============================================
    let isRefreshing = false;
    let refreshCooldownTimer = null;

    function startRefreshCooldown(seconds) {
        const refreshBtn = $('#refreshBtn');
        refreshBtn.classList.add('cooldown');
        refreshBtn.title = '';

        // Add SVG ring + countdown text + hover hint
        const circumference = 2 * Math.PI * 13; // radius=13
        const ring = document.createElement('div');
        ring.className = 'refresh-cooldown-ring';
        ring.innerHTML = `<svg viewBox="0 0 30 30"><circle cx="15" cy="15" r="13"/></svg>`;
        const text = document.createElement('div');
        text.className = 'refresh-cooldown-text';
        const hint = document.createElement('div');
        hint.className = 'refresh-cooldown-hint';
        hint.textContent = 'Attendi la fine del cooldown per poter aggiornare nuovamente lo stato';

        refreshBtn.style.position = 'relative';
        refreshBtn.appendChild(ring);
        refreshBtn.appendChild(text);
        refreshBtn.appendChild(hint);

        const circle = ring.querySelector('circle');
        let remaining = seconds;

        const tick = () => {
            text.textContent = remaining;
            // Animate ring: full → empty
            const progress = remaining / seconds;
            circle.style.strokeDashoffset = ((1 - progress) * circumference).toFixed(2);

            if (remaining <= 0) {
                clearInterval(refreshCooldownTimer);
                refreshCooldownTimer = null;
                refreshBtn.classList.remove('cooldown');
                refreshBtn.title = 'Aggiorna stato';
                ring.remove();
                text.remove();
                hint.remove();
                return;
            }
            remaining--;
        };

        tick(); // show immediately
        refreshCooldownTimer = setInterval(tick, 1000);
    }

    async function handleRefresh() {
        if (isRefreshing || refreshCooldownTimer) return;
        _log('INFO', 'Refresh', 'Aggiornamento stato avviato');

        // Check for unsaved changes — show confirmation tooltip
        const pendingChanges = DynamoService.getModifiedAppEnvs(DataManager.getSchedulesRef());
        if (pendingChanges.length > 0) {
            const proceed = await showRefreshConfirm();
            if (!proceed) return;
        }

        isRefreshing = true;
        const refreshBtn = $('#refreshBtn');
        refreshBtn.classList.add('spinning');
        showToast('Aggiornamento in corso...', 'info');
        try {
            await DataManager.loadFromPath('data/machines.csv');
            await DataManager.loadMessages();
            await DataManager.loadEBSVolumes();
            if (DynamoService.CONFIG.enabled) {
                updateDynamoStatus('connecting');
                // DynamoDB is authoritative: discard local changes, load fresh from DynamoDB
                await DataManager.loadFromDynamo();
                updateDynamoStatus('online');
            }
            // Snapshot is taken inside loadFromDynamo, re-take for safety
            DynamoService.takeSnapshot(DataManager.getSchedulesRef());
            // Re-render everything to reflect the new authoritative state
            renderAppList();
            renderVMListButton();
            renderEBSListButton();
            renderHomeDashboard();
            if (currentView === 'machines' && currentApp && currentEnv) {
                renderMachines(currentApp, currentEnv);
            } else if (currentView === 'general-calendar') {
                renderGCFilters();
                renderGeneralCalendar();
            } else if (currentView === 'vm-list') {
                renderVMList();
            } else if (currentView === 'ebs-list') {
                renderEBSList();
            } else if (currentView === 'user-mgmt') {
                renderUserManagement();
            } else if (currentView === 'home') {
                renderHomeDashboard();
            }
            updateChangesBadge();
            AuditLog.log('Aggiornamento stato', 'Dati ricaricati');
            showToast('Stato aggiornato', 'success');
        } catch (err) {
            _log('ERROR', 'Refresh', 'Aggiornamento fallito', { error: err.message });
            console.error('[Refresh] Error:', err);
            if (DynamoService.CONFIG.enabled) updateDynamoStatus('offline');
            showToast('Errore durante l\'aggiornamento: ' + (err.message || 'Riprova'), 'error');
        } finally {
            isRefreshing = false;
            refreshBtn.classList.remove('spinning');
            // 15-second cooldown to prevent spam
            startRefreshCooldown(15);
        }
    }

    // ============================================
    // Save Configuration (DynamoDB push)
    // ============================================
    function updateChangesBadge() {
        const changes = DynamoService.getModifiedAppEnvs(DataManager.getSchedulesRef());
        const badge = $('#changesBadge');
        const saveBtn = $('#saveConfigBtn');
        const reminder = document.getElementById('saveReminder');
        if (changes.length > 0) {
            badge.textContent = changes.length;
            badge.style.display = 'flex';
            saveBtn.classList.add('has-changes');
            saveBtn.classList.remove('no-changes');
            saveBtn.disabled = false;
            if (reminder) reminder.style.display = 'block';
            startUnsavedReminder();
        } else {
            badge.style.display = 'none';
            saveBtn.classList.remove('has-changes');
            saveBtn.classList.add('no-changes');
            saveBtn.disabled = true;
            if (reminder) reminder.style.display = 'none';
            clearUnsavedReminder();
        }
    }

    function startUnsavedReminder() {
        if (unsavedReminderTimer) clearTimeout(unsavedReminderTimer);
        unsavedPopupShown = false;
        unsavedReminderTimer = setTimeout(() => {
            const changes = DynamoService.getModifiedAppEnvs(DataManager.getSchedulesRef());
            if (changes.length > 0 && !unsavedPopupShown) {
                unsavedPopupShown = true;
                showUnsavedPopup();
            }
        }, 10000);
    }

    function clearUnsavedReminder() {
        if (unsavedReminderTimer) { clearTimeout(unsavedReminderTimer); unsavedReminderTimer = null; }
        unsavedPopupShown = false;
        const existing = document.querySelector('.unsaved-popup');
        if (existing) existing.remove();
    }

    function showUnsavedPopup() {
        const existing = document.querySelector('.unsaved-popup');
        if (existing) existing.remove();

        const popup = document.createElement('div');
        popup.className = 'unsaved-popup';
        popup.innerHTML = `
            <div class="unsaved-popup-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            </div>
            <div class="unsaved-popup-text">
                <strong>Modifiche non salvate</strong>
                <span>Premi Ctrl+S o clicca Salva per salvare</span>
            </div>
            <button class="unsaved-popup-save">Salva ora</button>
            <button class="unsaved-popup-close">${SVG.x}</button>`;
        document.body.appendChild(popup);

        requestAnimationFrame(() => popup.classList.add('show'));

        popup.querySelector('.unsaved-popup-save').addEventListener('click', () => {
            popup.remove();
            handleSaveConfig();
        });
        popup.querySelector('.unsaved-popup-close').addEventListener('click', () => {
            popup.classList.remove('show');
            setTimeout(() => popup.remove(), 300);
        });

        // Auto-dismiss after 15 seconds
        setTimeout(() => {
            if (popup.parentNode) {
                popup.classList.remove('show');
                setTimeout(() => popup.remove(), 300);
            }
        }, 15000);
    }

    let isSaving = false;

    async function handleSaveConfig() {
        if (isSaving) return; // Prevent double-save
        const changes = DynamoService.getModifiedAppEnvs(DataManager.getSchedulesRef());
        _log('INFO', 'Save', 'Salvataggio configurazione avviato', { changes: changes.length });
        if (changes.length === 0) {
            showToast('Nessuna modifica da salvare', 'info');
            return;
        }

        // Build detailed changes summary
        const snapshot = DynamoService.getSnapshot();
        let changesHtml = '<div class="save-changes-list">';
        changes.forEach(c => {
            let detailHtml = '';
            // Compare each hostname
            const allHostnames = new Set([...Object.keys(c.data), ...Object.keys(DynamoService.extractAppEnvData(snapshot, c.app, c.env))]);
            allHostnames.forEach(hostname => {
                const curr = c.data[hostname] || [];
                const prev = (DynamoService.extractAppEnvData(snapshot, c.app, c.env))[hostname] || [];
                if (JSON.stringify(curr) === JSON.stringify(prev)) return;

                let changeType = '';
                if (prev.length === 0 && curr.length > 0) changeType = '<span class="save-detail-badge added">Aggiunto</span>';
                else if (curr.length === 0 && prev.length > 0) changeType = '<span class="save-detail-badge removed">Rimosso</span>';
                else changeType = '<span class="save-detail-badge modified">Modificato</span>';

                let entryDetail = '';
                curr.forEach(e => {
                    let typeLabel;
                    if (e.type === 'shutdown') typeLabel = 'Shutdown';
                    else if (e.recurring === 'custom' && e.daySchedules) typeLabel = `Personalizzato (${Object.keys(e.daySchedules).length} giorni)`;
                    else typeLabel = `${e.startTime || '?'}-${e.stopTime || '?'}`;
                    const recLabel = e.recurring && e.recurring !== 'none' ? ` (${recurringLabels[e.recurring] || e.recurring})` : e.dates ? ` (${e.dates.length} gg)` : '';
                    entryDetail += `<div class="save-entry-detail">
                        <span class="save-entry-text">${typeLabel}${recLabel}</span>
                        <button class="save-delete-entry-btn" data-entry-id="${e.id}" data-hostname="${hostname}" data-app="${c.app}" data-env="${c.env}" title="Elimina questa entry">&times;</button>
                    </div>`;
                });

                detailHtml += `<div class="save-hostname-row" data-save-hostname="${hostname}" data-save-app="${c.app}" data-save-env="${c.env}">
                    <span class="save-hostname-name">${hostname}</span>
                    ${changeType}
                    ${entryDetail}
                </div>`;
            });

            let statsHtml = '';
            if (c.added > 0) statsHtml += `<span class="save-changes-stat added">+${c.added} aggiunti</span>`;
            if (c.changed > 0) statsHtml += `<span class="save-changes-stat modified">${c.changed} modificati</span>`;
            if (c.removed > 0) statsHtml += `<span class="save-changes-stat removed">-${c.removed} rimossi</span>`;

            changesHtml += `<div class="save-changes-group">
                <div class="save-changes-group-title">${c.app} / ${c.env}</div>
                <div class="save-changes-group-detail">${statsHtml || 'Modifiche rilevate'}</div>
                <div class="save-changes-hostnames">${detailHtml}</div>
            </div>`;
        });
        changesHtml += '</div>';

        const confirmed = await confirmDialog({
            title: 'Salva Configurazione',
            message: `Vuoi salvare le modifiche per <strong>${changes.length}</strong> ambienti?${changesHtml}`,
            confirmLabel: 'Salva Modifiche',
            iconType: 'accent',
            confirmClass: 'btn-primary',
            wide: true,
            onMount: (overlay) => {
                // Entry-level deletion con conferma
                overlay.querySelectorAll('.save-delete-entry-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const entryId = btn.dataset.entryId;
                        const hostname = btn.dataset.hostname;
                        const app = btn.dataset.app;
                        const env = btn.dataset.env;

                        if (!confirm(`Vuoi eliminare questa entry per ${hostname}?`)) return;

                        // Rimuovi entry dai dati
                        DataManager.removeScheduleEntry(app, env, hostname, entryId);
                        AuditLog.log('Eliminazione entry da save modal', `${app}/${env}/${hostname} - Entry ${entryId}`);

                        // Rimuovi visivamente l'entry dal popup
                        const entryDiv = btn.closest('.save-entry-detail');
                        if (entryDiv) entryDiv.remove();

                        // Se non ci sono più entry per questo hostname, rimuovi l'intera riga
                        const hostnameRow = overlay.querySelector(`[data-save-hostname="${hostname}"][data-save-app="${app}"][data-save-env="${env}"]`);
                        if (hostnameRow && hostnameRow.querySelectorAll('.save-entry-detail').length === 0) {
                            hostnameRow.remove();
                        }

                        // Se un intero gruppo app/env è vuoto, rimuovilo
                        overlay.querySelectorAll('.save-changes-group').forEach(group => {
                            if (group.querySelectorAll('.save-hostname-row').length === 0) {
                                group.remove();
                            }
                        });

                        // Aggiorna la vista dietro il popup
                        if (currentApp && currentEnv) {
                            renderMachines(currentApp, currentEnv);
                        }

                        // Aggiorna stato bottone salva (badge, colore, disabled)
                        updateChangesBadge();

                        // Ricalcola e chiudi modal se non ci sono più modifiche
                        const remaining = DynamoService.getModifiedAppEnvs(DataManager.getSchedulesRef());
                        if (remaining.length === 0) {
                            overlay.remove();
                            showToast('Nessuna modifica rimasta da salvare', 'info');
                            return;
                        }

                        showToast('Entry rimossa', 'info');
                    });
                });
            }
        });
        if (!confirmed) return;

        // Re-compute changes AFTER dialog (user may have deleted entries inside the dialog)
        const finalChanges = DynamoService.getModifiedAppEnvs(DataManager.getSchedulesRef());
        if (finalChanges.length === 0) {
            showToast('Nessuna modifica rimasta da salvare', 'info');
            return;
        }

        // Show loading state
        const saveBtn = $('#saveConfigBtn');
        isSaving = true;
        saveBtn.disabled = true;
        saveBtn.classList.add('saving');
        clearUnsavedReminder();

        try {
            if (DynamoService.CONFIG.enabled) {
                const user = DataManager.getCurrentUser();
                // Enrich each hostname's entries with cronjob translation (per server)
                const pushData = finalChanges.map(c => {
                    const enriched = {};
                    for (const [hostname, entries] of Object.entries(c.data)) {
                        enriched[hostname] = entries.map(e => ({
                            ...e,
                            cronjobs: DataManager.generateCronjobs([e])[0]?.crons || []
                        }));
                    }
                    return { key: c.key, data: enriched };
                });
                const results = await DynamoService.saveMultiple(pushData, user ? user.id : 'unknown');
                const failed = results.filter(r => !r.success);
                if (failed.length > 0) {
                    showToast(`Errore nel salvataggio di ${failed.length}/${finalChanges.length} ambienti. Riprova.`, 'error');
                } else {
                    showToast(`Configurazione salvata${DynamoService.CONFIG.enabled ? ' su DynamoDB' : ''} \u2014 ${finalChanges.length} ambienti`, 'success');
                }
            } else {
                showToast('Modifiche salvate in locale (DynamoDB non configurato)', 'success');
            }

            AuditLog.log('Salvataggio configurazione', `${finalChanges.length} ambienti aggiornati`);
            DynamoService.takeSnapshot(DataManager.getSchedulesRef());
            updateChangesBadge();
            // Refresh current view to reflect saved state
            if (currentView === 'machines' && currentApp && currentEnv) {
                renderMachines(currentApp, currentEnv);
            }
            renderHomeDashboard();
        } catch (err) {
            _log('ERROR', 'Save', 'Salvataggio fallito', { error: err.message });
            console.error('[Save] Error:', err);
            showToast('Errore nel salvataggio: ' + (err.message || 'Errore sconosciuto'), 'error');
        } finally {
            isSaving = false;
            saveBtn.classList.remove('saving');
            // Re-evaluate button state
            const remaining = DynamoService.getModifiedAppEnvs(DataManager.getSchedulesRef());
            saveBtn.disabled = remaining.length === 0;
        }
    }

    // ============================================
    // Audit Log Panel
    // ============================================
    function showAuditPanel() {
        const existing = document.querySelector('.audit-panel-overlay');
        if (existing) { existing.remove(); document.querySelector('.audit-panel')?.remove(); return; }

        const overlay = document.createElement('div');
        overlay.className = 'audit-panel-overlay';

        const panel = document.createElement('div');
        panel.className = 'audit-panel';

        const logs = AuditLog.getLogs();
        let logsHtml = '';
        if (logs.length === 0) {
            logsHtml = '<div class="audit-empty">Nessuna azione registrata</div>';
        } else {
            logsHtml = logs.map(l => `
                <div class="audit-item">
                    <div class="audit-item-header">
                        <span class="audit-item-action">${l.action}</span>
                        <span class="audit-item-time">${AuditLog.formatTimestamp(l.timestamp)}</span>
                    </div>
                    <div class="audit-item-user">${l.user}</div>
                    <div class="audit-item-detail">${l.details}</div>
                </div>`).join('');
        }

        panel.innerHTML = `
            <div class="audit-panel-header">
                <h3>Registro Attivit\u00e0</h3>
                <button class="btn-icon audit-panel-close">${SVG.x}</button>
            </div>
            <div class="audit-panel-body">${logsHtml}</div>`;

        document.body.appendChild(overlay);
        document.body.appendChild(panel);

        const closePanel = () => { overlay.remove(); panel.remove(); };
        overlay.addEventListener('click', closePanel);
        panel.querySelector('.audit-panel-close').addEventListener('click', closePanel);
    }

    // ============================================
    // Toast
    // ============================================
    function showToast(message, type = 'info') {
        const container = $('#toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icons = {
            success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
            error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
            info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
        };
        toast.innerHTML = `${icons[type]||icons.info}<span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => { toast.classList.add('removing'); setTimeout(() => toast.remove(), 300); }, 3000);
    }

    // ============================================
    // JS Security — Integrity Monitor
    // ============================================
    (function securityInit() {
        // Disable right-click context menu on production
        // Re-fetch CSV on focus to detect external changes
        let lastFocusTime = 0;
        window.addEventListener('focus', async () => {
            const now = Date.now();
            if (now - lastFocusTime < 30000) return; // Skip if re-focused within 30s
            lastFocusTime = now;
            // Silently verify CSV data integrity on window focus
            try {
                const resp = await fetch('data/machines.csv?_=' + now);
                if (resp.ok) {
                    const text = await resp.text();
                    const freshCount = text.trim().split('\n').length - 1;
                    const currentCount = DataManager.machines.length;
                    if (freshCount !== currentCount && currentCount > 0) {
                        console.warn('[Security] CSV data changed externally:', freshCount, 'vs', currentCount);
                    }
                }
            } catch {}
        });

        // Protect against localStorage tampering — verify schedules format
        const rawSchedules = localStorage.getItem('shutdownScheduler_schedules');
        if (rawSchedules) {
            try {
                const parsed = JSON.parse(rawSchedules);
                if (typeof parsed !== 'object' || Array.isArray(parsed)) {
                    console.warn('[Security] Invalid schedules format in localStorage, clearing');
                    localStorage.removeItem('shutdownScheduler_schedules');
                }
            } catch {
                console.warn('[Security] Corrupted schedules in localStorage, clearing');
                localStorage.removeItem('shutdownScheduler_schedules');
            }
        }
    })();

    // Scripts are loaded dynamically after DOMContentLoaded already fired,
    // so we must check readyState and call init() directly if DOM is ready.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    return { init };
})();
