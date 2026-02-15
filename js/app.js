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
    const recurringLabels = { 'none':'Giorni specifici','daily':'Ogni giorno','weekdays':'Lun-Ven','weekends':'Sab-Dom' };
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
        if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
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
    }

    function getTimePickerValue(id) {
        const picker = $(`#${id}`);
        return `${picker.dataset.hour}:${picker.dataset.min}`;
    }

    function setTimePickerValue(id, time) {
        const picker = $(`#${id}`);
        const [h, m] = time.split(':');
        picker.dataset.hour = h.padStart(2, '0');
        const mNum = parseInt(m);
        const rounded = String(Math.round(mNum / 5) * 5).padStart(2, '0');
        picker.dataset.min = rounded === '60' ? '55' : rounded;
        updateTimePickerDisplay(picker);
    }

    // ============================================
    // Init
    // ============================================
    async function init() {
        initTheme();
        await DataManager.loadUsers();
        await DataManager.loadMessages();
        await DataManager.loadFromPath('data/machines.csv');

        // Load EBS volumes from CSV
        await DataManager.loadEBSVolumes();


        const users = DataManager.getUsers();

        // SSO Authentication via OAuth + Token HMAC
        if (SSO_CONFIG.enabled) {
            let ghUsername = null;

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
                    console.log('[SSO] OAuth login verified:', ghUsername);
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
                        console.log('[SSO] Session restored:', ghUsername);
                    } else {
                        clearSSOSession();
                        console.log('[SSO] Session expired, re-authentication needed');
                    }
                }
            }

            // 3. No valid session → show "Collega GitHub Enterprise" screen
            if (!ghUsername) {
                showGitHubLinkScreen();
                hidePreloader();
                return;
            }

            // Match against users.json
            const ssoUser = DataManager.findUserByGitHub(ghUsername);
            if (ssoUser) {
                ssoAuthenticated = true;
                DataManager.setCurrentUser(ssoUser.id);
                localStorage.setItem('shutdownScheduler_userId', ssoUser.id);
                console.log('[SSO] User matched:', ssoUser.name, '(' + ssoUser.role + ')');
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

        // DynamoDB sync
        if (DynamoService.CONFIG.enabled) {
            updateDynamoStatus('connecting');
            try {
                await DataManager.loadFromDynamo();
                updateDynamoStatus('online');
            } catch (err) {
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
            // OAuth worked but user not in users.json
            title = 'Accesso non autorizzato';
            message = `L'utenza GitHub Enterprise <strong>${userId}</strong> non \u00e8 associata a nessun profilo in questa applicazione.`;
            sub = 'Richiedere a un amministratore di aggiungere il proprio <code>github_user</code> nel file <code>users.json</code>.';
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
                $('#timeWindowConfig').style.display = currentScheduleType === 'window' ? 'block' : 'none';
            });
        });

        $$('input[name="recurring"]').forEach(radio => {
            radio.addEventListener('change', () => {
                currentRecurring = radio.value;
                updateCalendarVisibility();
            });
        });

        $('#prevMonth').addEventListener('click', () => navigateMonth(-1));
        $('#nextMonth').addEventListener('click', () => navigateMonth(1));
        $('#selectWeekdays').addEventListener('click', selectWeekdays);
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
                // Force OAuth re-login by redirecting to the OAuth authorize URL
                // This ensures a new cookie/session is created (no auto-login)
                if (SSO_CONFIG.enabled) {
                    const authUrl = `${SSO_CONFIG.gheBaseUrl}/login/oauth/authorize?client_id=${SSO_CONFIG.oauthClientId}&scope=read:user`;
                    window.location.href = authUrl;
                } else {
                    location.reload();
                }
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
        $('#exportBtn').style.display = (view === 'machines' || view === 'general-calendar') ? 'inline-flex' : 'none';
        // Update sidebar active states
        $('#homeBtn').classList.toggle('active', view === 'home');
        $('#generalCalendarBtn').classList.toggle('active', view === 'general-calendar');
        const vmBtn = document.getElementById('vmListBtn');
        if (vmBtn) vmBtn.classList.toggle('active', view === 'vm-list');
        const ebsBtn = document.getElementById('ebsListBtn');
        if (ebsBtn) ebsBtn.classList.toggle('active', view === 'ebs-list');
    }

    function updateCalendarVisibility() {
        const right = $('#modalBodyRight');
        if (currentRecurring === 'none') {
            right.innerHTML = '';
            const section = createCalendarSection();
            right.appendChild(section);
            renderCalendar();
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
                <button class="btn-text" id="selectWeekdays">Lun-Ven</button>
                <button class="btn-clear-selection" id="clearSelection" title="Deseleziona tutto">${SVG.x}</button>
            </div>`;
        section.querySelector('#prevMonth').addEventListener('click', () => navigateMonth(-1));
        section.querySelector('#nextMonth').addEventListener('click', () => navigateMonth(1));
        section.querySelector('#selectWeekdays').addEventListener('click', selectWeekdays);
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
        if (!DataManager.canViewVMList()) return;
        const navActions = document.querySelector('.sidebar-nav-actions');
        const btn = document.createElement('button');
        btn.className = 'sidebar-action-btn';
        btn.id = 'ebsListBtn';
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg> Elenco Dischi AWS`;
        btn.addEventListener('click', showEBSList);
        navActions.appendChild(btn);
    }

    function selectApp(appName, itemEl) {
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

        // Left column — Applications
        html += '<div class="home-col-left">';
        html += '<div class="home-section-title">Applicazioni</div>';
        html += '<div class="home-app-list">';
        apps.forEach((app, i) => {
            const color = appColors[i % appColors.length];
            const perm = DataManager.getAppPermission(app.name);
            const permLabel = user && user.role === 'Admin' ? 'Admin' : perm === 'rw' ? 'Application Owner' : 'Sola Lettura';
            const permCls = perm === 'rw' ? 'perm-rw' : 'perm-ro';

            html += `<div class="home-app-row" data-app="${app.name}">
                <div class="home-app-row-dot" style="background:${color}"></div>
                <span class="home-app-row-name">${app.name}</span>
                <span class="home-app-row-count">${app.machineCount} server</span>
                <span class="home-app-row-perm ${permCls}">${permLabel}</span>
                <svg class="home-app-row-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </div>`;
        });
        html += '</div>';
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

        // Bind app rows — click sidebar item to show env popover
        screen.querySelectorAll('.home-app-row').forEach(row => {
            row.addEventListener('click', () => {
                const appName = row.dataset.app;
                const item = document.querySelector(`#appList .nav-item[data-app="${appName}"]`);
                if (item) {
                    item.click();
                    item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                }
            });
        });
    }

    // ============================================
    // Machine Grid
    // ============================================
    function renderMachines(appName, envName) {
        const machines = DataManager.getMachines(appName, envName);
        const grid = $('#machineGrid');
        const readOnly = DataManager.isReadOnly() || DataManager.isAppReadOnly(appName);
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
            </button>` : ''}`;

        // Remove old search bar if exists
        const oldSearchBar = document.querySelector('.machine-search-bar:not(.machine-controls-row .machine-search-bar)');
        if (oldSearchBar) oldSearchBar.remove();

        const searchInput = controlsRow.querySelector('#machineSearch');
        searchInput.value = '';
        searchInput.oninput = () => filterMachines(searchInput.value);

        const planBtn = controlsRow.querySelector('#planEnvBtn');
        if (planBtn) planBtn.addEventListener('click', () => openModal('environment'));

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
                    const typeLabel = e.type === 'shutdown' ? 'Shutdown Completo' : `${e.startTime} \u2014 ${e.stopTime}`;
                    const recLabel = e.recurring && e.recurring !== 'none' ? recurringLabels[e.recurring] : e.dates && e.dates.length > 0 ? `${e.dates.length} giorni specifici` : '';
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
                </div>
                <div class="machine-card-body">
                    <div class="machine-detail">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
                        ${m.server_type}
                    </div>
                    ${desc ? `<div class="machine-description">${desc}</div>` : ''}
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
            const typeLabel = entry.type === 'shutdown' ? 'Shutdown Completo' : `${entry.startTime} \u2014 ${entry.stopTime}`;
            const recurring = entry.recurring && entry.recurring !== 'none';
            let detailHtml = '';
            if (recurring) {
                detailHtml = `<div class="schedule-info">Ricorrente: <strong>${recurringLabels[entry.recurring]}</strong></div>`;
            } else if (entry.dates && entry.dates.length > 0) {
                const parts = formatDatesDetail(entry.dates);
                if (parts.length === 1) detailHtml = `<div class="schedule-info">${parts[0]}</div>`;
                else detailHtml = `<div class="schedule-dates-detail"><ul>${parts.map(p => `<li>${p}</li>`).join('')}</ul></div>`;
            }

            const envTag = entry.envGroupId ? '<span class="entry-env-tag">Ambiente</span>' : '';
            const excludeBtn = (!readOnly && entry.envGroupId) ? `<button class="btn-entry-action exclude-env-btn" data-group-id="${entry.envGroupId}" data-hostname="${hostname}" title="Escludi da schedulazione ambiente"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg></button>` : '';
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
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        $('#scheduleModal').style.display = 'none';
        document.body.style.overflow = '';
        modalTarget = null;
        editingEntryId = null;
        selectedDates.clear();
    }

    function loadEntryIntoModal(entry) {
        if (entry) {
            currentScheduleType = entry.type;
            currentRecurring = entry.recurring || 'none';
            $$('.schedule-type-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.type === entry.type));
            $('#timeWindowConfig').style.display = entry.type === 'window' ? 'block' : 'none';
            if (entry.startTime) setTimePickerValue('startTimePicker', entry.startTime);
            if (entry.stopTime) setTimePickerValue('stopTimePicker', entry.stopTime);
            $$('input[name="recurring"]').forEach(r => { r.checked = r.value === currentRecurring; });
            selectedDates.clear();
            if (entry.dates) entry.dates.forEach(d => selectedDates.add(d));
        } else {
            currentScheduleType = 'window';
            currentRecurring = 'none';
            $$('.schedule-type-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.type === 'window'));
            $('#timeWindowConfig').style.display = 'block';
            setTimePickerValue('startTimePicker', '08:00');
            setTimePickerValue('stopTimePicker', '20:00');
            $$('input[name="recurring"]').forEach(r => { r.checked = r.value === 'none'; });
            selectedDates.clear();
        }
    }

    function saveSchedule() {
        if (currentRecurring === 'none' && selectedDates.size === 0) {
            showToast('Seleziona almeno un giorno o una ricorrenza', 'error');
            return;
        }
        const entry = {
            type: currentScheduleType,
            startTime: currentScheduleType === 'window' ? getTimePickerValue('startTimePicker') : null,
            stopTime: currentScheduleType === 'window' ? getTimePickerValue('stopTimePicker') : null,
            recurring: currentRecurring,
            dates: currentRecurring === 'none' ? Array.from(selectedDates).sort() : []
        };

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

            const cell = document.createElement('div');
            let cls = 'calendar-day';
            if (isPast) cls += ' past';
            if (isToday) cls += ' today';
            if (isWeekend) cls += ' weekend';
            if (isSelected) cls += ' selected';
            cell.className = cls;
            cell.textContent = d;
            cell.dataset.date = dateStr;
            if (!isPast) cell.addEventListener('click', toggleDate);
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
            if (dow >= 1 && dow <= 5) selectedDates.add(`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
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
        htmlTable += `<tr style="background:#c2410c;color:white;"><th colspan="3" style="padding:8px;font-size:13px;text-align:center;border:1px solid #999;">Calendario Shutdown &mdash; ${monthName} ${year}</th></tr>`;
        htmlTable += `<tr style="background:#f2f2f2;"><th style="padding:6px 10px;border:1px solid #ccc;text-align:left;width:120px;">Giorno</th><th style="padding:6px 10px;border:1px solid #ccc;text-align:left;">Schedulazioni attive</th><th style="padding:6px 10px;border:1px solid #ccc;text-align:center;width:60px;">Server</th></tr>`;

        for (let d = 1; d <= daysInMonth; d++) {
            const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const date = new Date(year, month, d);
            const entries = dateMap[ds] || new Map();
            if (entries.size === 0) continue;

            const dayLabel = `${dayNames[date.getDay()]} ${d} ${monthName}`;
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            let totalServers = 0;
            let entryParts = [];
            entries.forEach((count, key) => { entryParts.push(`${key} (${count})`); totalServers += count; });

            lines.push(`${dayLabel}: ${entryParts.join(', ')} — ${totalServers} server`);
            const bgStyle = isWeekend ? 'background:#f9f9f9;' : '';
            htmlTable += `<tr style="${bgStyle}"><td style="padding:4px 10px;border:1px solid #ddd;font-weight:600;">${dayLabel}</td><td style="padding:4px 10px;border:1px solid #ddd;">${entryParts.join('<br>')}</td><td style="padding:4px 10px;border:1px solid #ddd;text-align:center;font-weight:600;">${totalServers}</td></tr>`;
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
                    renderFilterChips();
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
                    renderFilterChips();
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
        vmView.querySelector('#vmFilterSearch').addEventListener('input', renderRows);
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
            ebsView.querySelector('#ebsListBody').innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-tertiary);">Nessun volume EBS trovato. Aggiungere i dati nel file <code>data/ebs_volumes.csv</code>.</td></tr>`;
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
                    renderFilterChips(); renderRows();
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
                    renderFilterChips(); renderRows();
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
                return `<tr>
                    <td class="vm-cell-hostname vm-cell-copyable" data-copy="${d.volume_id}" title="Clicca per copiare"><code>${d.volume_id}</code> <span class="vm-copy-hint">${SVG.copy}</span></td>
                    <td style="text-align:right;font-weight:600;">${fmt(d.size_gb || 0)}</td>
                    <td style="text-align:right;">${fmt(d.iops || 0)}</td>
                    <td style="text-align:right;">${fmt(d.throughput || 0)}</td>
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
        };

        // Copy
        ebsView.querySelector('#ebsCopyAll').addEventListener('click', async () => {
            if (lastFiltered.length === 0) { showToast('Nessun dato da copiare', 'info'); return; }
            const cols = [
                { key: 'volume_id', label: 'Volume ID' }, { key: 'size_gb', label: 'Size (GB)' },
                { key: 'iops', label: 'IOPS' }, { key: 'throughput', label: 'Throughput' },
                { key: 'volume_type', label: 'Tipo' }, { key: 'application', label: 'Applicazione' },
                { key: 'environment', label: 'Ambiente' }
            ];
            let html = '<table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px;">';
            html += '<thead><tr>' + cols.map(c => `<th style="background:#f2f2f2;padding:6px 10px;text-align:left;font-weight:bold;border:1px solid #ccc;">${c.label}</th>`).join('') + '</tr></thead><tbody>';
            lastFiltered.forEach(d => { html += '<tr>' + cols.map(c => `<td style="padding:4px 10px;border:1px solid #ddd;">${d[c.key] || '-'}</td>`).join('') + '</tr>'; });
            html += '</tbody></table>';
            try {
                await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([lastFiltered.map(d => cols.map(c => d[c.key] || '-').join('\t')).join('\n')], { type: 'text/plain' }) })]);
                showToast(`${lastFiltered.length} volumi copiati come tabella`, 'success');
            } catch { showToast('Errore nella copia', 'error'); }
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
        ebsView.querySelector('#ebsFilterSearch').addEventListener('input', renderRows);
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
    // Refresh / Fetch State
    // ============================================
    let isRefreshing = false;

    async function handleRefresh() {
        if (isRefreshing) return;
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
            // Always re-snapshot after refresh (DynamoDB state or local state becomes the new baseline)
            DynamoService.takeSnapshot(DataManager.getSchedulesRef());
            renderAppList();
            renderVMListButton();
            renderHomeDashboard();
            if (currentView === 'machines' && currentApp && currentEnv) {
                renderMachines(currentApp, currentEnv);
            }
            if (currentView === 'general-calendar') {
                renderGCFilters();
                renderGeneralCalendar();
            }
            if (currentView === 'vm-list') {
                renderVMList();
            }
            if (currentView === 'ebs-list') {
                renderEBSList();
            }
            updateChangesBadge();
            AuditLog.log('Aggiornamento stato', 'Dati ricaricati');
            showToast('Stato aggiornato', 'success');
        } catch (err) {
            console.error('[Refresh] Error:', err);
            if (DynamoService.CONFIG.enabled) updateDynamoStatus('offline');
            showToast('Errore durante l\'aggiornamento: ' + (err.message || 'Riprova'), 'error');
        } finally {
            isRefreshing = false;
            refreshBtn.classList.remove('spinning');
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
                    const typeLabel = e.type === 'shutdown' ? 'Shutdown' : `${e.startTime}-${e.stopTime}`;
                    const recLabel = e.recurring && e.recurring !== 'none' ? ` (${recurringLabels[e.recurring]})` : e.dates ? ` (${e.dates.length} gg)` : '';
                    entryDetail += `<div class="save-entry-detail">${typeLabel}${recLabel}</div>`;
                });

                detailHtml += `<div class="save-hostname-row" data-save-hostname="${hostname}" data-save-app="${c.app}" data-save-env="${c.env}">
                    <span class="save-hostname-name">${hostname}</span>
                    ${changeType}
                    ${entryDetail}
                    <button class="save-delete-btn" data-hostname="${hostname}" data-app="${c.app}" data-env="${c.env}" title="Rimuovi da questo salvataggio">&times;</button>
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
                overlay.querySelectorAll('.save-delete-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const h = btn.dataset.hostname;
                        const app = btn.dataset.app;
                        const env = btn.dataset.env;
                        DataManager.removeAllSchedules(app, env, h);
                        AuditLog.log('Eliminazione entry da salvataggio', `${app} / ${env} / ${h}`);
                        btn.closest('.save-hostname-row').remove();
                        showToast(`Rimosso: ${h}`, 'info');
                    });
                });
            }
        });
        if (!confirmed) return;

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
                const pushData = changes.map(c => {
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
                    showToast(`Errore nel salvataggio di ${failed.length}/${changes.length} ambienti. Riprova.`, 'error');
                } else {
                    showToast(`Configurazione salvata${DynamoService.CONFIG.enabled ? ' su DynamoDB' : ''} \u2014 ${changes.length} ambienti`, 'success');
                }
            } else {
                showToast('Modifiche salvate in locale (DynamoDB non configurato)', 'success');
            }

            AuditLog.log('Salvataggio configurazione', `${changes.length} ambienti aggiornati`);
            DynamoService.takeSnapshot(DataManager.getSchedulesRef());
            updateChangesBadge();
        } catch (err) {
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

    // Prevent data loss on page reload
    window.addEventListener('beforeunload', (e) => {
        const changes = DynamoService.getModifiedAppEnvs(DataManager.getSchedulesRef());
        if (changes.length > 0) {
            e.preventDefault();
            e.returnValue = 'Hai modifiche non salvate. Vuoi davvero uscire?';
        }
    });

    // Scripts are loaded dynamically after DOMContentLoaded already fired,
    // so we must check readyState and call init() directly if DOM is ready.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    return { init };
})();
