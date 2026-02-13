/* ============================================
   Shutdown Scheduler — Main Application
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
    let currentView = 'home'; // 'home' | 'machines' | 'general-calendar'

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const serverIcons = {
        'Web Server': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
        'Application Server': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>',
        'Database Server': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>'
    };

    const envClassMap = {
        'Development': 'dev', 'Integration': 'int', 'Pre-Produzione': 'preprod',
        'Training': 'training', 'Bugfixing': 'bugfix', 'Produzione': 'prod'
    };

    const appColors = ['#6366f1', '#8b5cf6', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

    const recurringLabels = {
        'none': 'Giorni specifici',
        'daily': 'Ogni giorno',
        'weekdays': 'Lun-Ven',
        'weekends': 'Sab-Dom'
    };

    // ============================================
    // Theme
    // ============================================
    function initTheme() {
        const saved = localStorage.getItem('shutdownScheduler_theme');
        if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    }

    function toggleTheme() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('shutdownScheduler_theme', 'light');
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('shutdownScheduler_theme', 'dark');
        }
    }

    // ============================================
    // Init
    // ============================================
    async function init() {
        initTheme();
        await DataManager.loadFromPath('data/machines.csv');
        renderAppList();
        renderWelcomeStats();
        bindEvents();
    }

    function bindEvents() {
        $('#themeToggle').addEventListener('click', toggleTheme);
        $('#homeBtn').addEventListener('click', goHome);
        $('#generalCalendarBtn').addEventListener('click', showGeneralCalendar);
        $('#importCsvBtn').addEventListener('click', () => $('#csvFileInput').click());
        $('#csvFileInput').addEventListener('change', handleCSVImport);
        $('#exportBtn').addEventListener('click', handleExport);
        $('#applyAllBtn').addEventListener('click', () => openModal('environment'));

        $('#modalClose').addEventListener('click', closeModal);
        $('#modalCancel').addEventListener('click', closeModal);
        $('#modalSave').addEventListener('click', saveSchedule);
        $('#scheduleModal').addEventListener('click', (e) => {
            if (e.target === $('#scheduleModal')) closeModal();
        });

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

        // General calendar navigation
        $('#gcPrevMonth').addEventListener('click', () => navigateGeneralCalendar(-1));
        $('#gcNextMonth').addEventListener('click', () => navigateGeneralCalendar(1));

        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
    }

    function updateCalendarVisibility() {
        const cal = $('#calendarSection');
        if (currentRecurring === 'none') {
            cal.classList.remove('hidden');
        } else {
            cal.classList.add('hidden');
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
        $$('#envList .nav-item').forEach(i => i.classList.remove('active'));
        $('#envSection').style.display = 'none';
        $('#welcomeScreen').style.display = 'flex';
        $('#machinesView').style.display = 'none';
        $('#generalCalendarView').style.display = 'none';
        $('#exportBtn').style.display = 'none';
        updateBreadcrumb();
        renderWelcomeStats();
    }

    function showView(view) {
        currentView = view;
        $('#welcomeScreen').style.display = view === 'home' ? 'flex' : 'none';
        $('#machinesView').style.display = view === 'machines' ? 'block' : 'none';
        $('#generalCalendarView').style.display = view === 'general-calendar' ? 'block' : 'none';
        $('#exportBtn').style.display = (view === 'machines' || view === 'general-calendar') ? 'inline-flex' : 'none';
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
            const item = document.createElement('div');
            item.className = 'nav-item';
            item.dataset.app = app.name;
            item.innerHTML = `
                <div class="nav-icon" style="color: ${color}; background: ${color}15;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                        <line x1="8" y1="21" x2="16" y2="21"></line>
                        <line x1="12" y1="17" x2="12" y2="21"></line>
                    </svg>
                </div>
                <span class="nav-label">${app.name}</span>
                <span class="nav-badge">${app.machineCount}</span>`;
            item.addEventListener('click', () => selectApp(app.name));
            container.appendChild(item);
        });
    }

    function selectApp(appName) {
        currentApp = appName;
        currentEnv = null;
        $$('#appList .nav-item').forEach(item => item.classList.toggle('active', item.dataset.app === appName));
        renderEnvList(appName);
        $('#envSection').style.display = 'block';
        updateBreadcrumb(appName);
        showView('home');
    }

    // ============================================
    // Sidebar: Environments
    // ============================================
    function renderEnvList(appName) {
        const envs = DataManager.getEnvironments(appName);
        const container = $('#envList');
        container.innerHTML = '';
        envs.forEach(env => {
            const cssClass = envClassMap[env.name] || 'dev';
            const hasSchedules = DataManager.envHasSchedules(appName, env.name);
            const item = document.createElement('div');
            item.className = 'nav-item';
            item.dataset.env = env.name;
            item.innerHTML = `
                <span class="env-dot ${cssClass}"></span>
                <span class="nav-label">${env.name}</span>
                <span class="nav-badge">${env.machineCount}${hasSchedules ? ' &#10003;' : ''}</span>`;
            item.addEventListener('click', () => selectEnv(env.name));
            container.appendChild(item);
        });
    }

    function selectEnv(envName) {
        currentEnv = envName;
        $$('#envList .nav-item').forEach(item => item.classList.toggle('active', item.dataset.env === envName));
        updateBreadcrumb(currentApp, envName);
        renderMachines(currentApp, envName);
        showView('machines');
    }

    // ============================================
    // Breadcrumb
    // ============================================
    function updateBreadcrumb(app, env) {
        const bc = $('#breadcrumb');
        if (!app) {
            bc.innerHTML = '<span class="breadcrumb-item active">Seleziona un\'applicazione</span>';
        } else if (!env) {
            bc.innerHTML = `<span class="breadcrumb-item">${app}</span><span class="breadcrumb-separator">/</span><span class="breadcrumb-item active">Seleziona un ambiente</span>`;
        } else {
            bc.innerHTML = `<span class="breadcrumb-item">${app}</span><span class="breadcrumb-separator">/</span><span class="breadcrumb-item active">${env}</span>`;
        }
    }

    // ============================================
    // Welcome Stats
    // ============================================
    function renderWelcomeStats() {
        const stats = DataManager.getStats();
        $('#welcomeStats').innerHTML = `
            <div class="stat-card"><div class="stat-value">${stats.applications}</div><div class="stat-label">Applicazioni</div></div>
            <div class="stat-card"><div class="stat-value">${stats.environments}</div><div class="stat-label">Ambienti</div></div>
            <div class="stat-card"><div class="stat-value">${stats.totalMachines}</div><div class="stat-label">Server</div></div>
            <div class="stat-card"><div class="stat-value">${stats.scheduledMachines}</div><div class="stat-label">Pianificati</div></div>`;
    }

    // ============================================
    // Machine Grid — multi-entry
    // ============================================
    function renderMachines(appName, envName) {
        const machines = DataManager.getMachines(appName, envName);
        const grid = $('#machineGrid');
        grid.innerHTML = '';
        $('#envTitle').textContent = envName;
        $('#machineCount').textContent = `${machines.length} server`;

        machines.forEach(m => {
            const entries = DataManager.getScheduleEntries(appName, envName, m.hostname);
            const typeClass = m.server_type.includes('Web') ? 'web' : m.server_type.includes('Application') ? 'app' : 'db';
            const icon = serverIcons[m.server_type] || serverIcons['Application Server'];
            const desc = m.description || '';

            const card = document.createElement('div');
            card.className = 'machine-card';
            card.innerHTML = `
                <div class="machine-card-header">
                    <div class="machine-type-icon ${typeClass}">${icon}</div>
                    <div class="machine-card-title">
                        <h4>${m.machine_name}</h4>
                        <div class="hostname">${m.hostname}</div>
                    </div>
                </div>
                <div class="machine-card-body">
                    <div class="machine-detail">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
                        ${m.server_type}
                    </div>
                    ${desc ? `<div class="machine-description">${desc}</div>` : ''}
                    <div class="entries-list" data-hostname="${m.hostname}">
                        ${renderEntriesList(entries, m.hostname)}
                    </div>
                </div>
                <div class="machine-card-footer">
                    <button class="btn-primary add-entry-btn" data-hostname="${m.hostname}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Aggiungi Pianificazione
                    </button>
                </div>`;

            // Bind add entry button
            card.querySelector('.add-entry-btn').addEventListener('click', () => openModal('machine', m.hostname));

            // Bind edit/delete buttons for each entry
            card.querySelectorAll('.edit-entry-btn').forEach(btn => {
                btn.addEventListener('click', () => openModal('machine', m.hostname, btn.dataset.entryId));
            });
            card.querySelectorAll('.delete-entry-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    DataManager.removeScheduleEntry(appName, envName, m.hostname, btn.dataset.entryId);
                    renderMachines(currentApp, currentEnv);
                    renderEnvList(currentApp);
                    renderWelcomeStats();
                    showToast('Entry rimossa', 'info');
                });
            });

            grid.appendChild(card);
        });
    }

    function renderEntriesList(entries, hostname) {
        if (entries.length === 0) {
            return `<div class="machine-schedule-summary">
                <div class="schedule-badge none">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                    Nessuna pianificazione
                </div>
            </div>`;
        }

        return entries.map(entry => {
            const typeLabel = entry.type === 'shutdown' ? 'Shutdown Completo' : `${entry.startTime} — ${entry.stopTime}`;
            const recurring = entry.recurring && entry.recurring !== 'none';
            const recLabel = recurring ? recurringLabels[entry.recurring] : '';
            const dateCount = entry.dates ? entry.dates.length : 0;
            const detailLine = recurring
                ? `Ricorrente: <strong>${recLabel}</strong>`
                : `${dateCount} giorn${dateCount === 1 ? 'o' : 'i'} selezionat${dateCount === 1 ? 'o' : 'i'}`;

            return `<div class="schedule-entry-item">
                <div class="schedule-entry-info">
                    <div class="schedule-badge active">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        ${typeLabel}
                    </div>
                    <div class="schedule-info">${detailLine}</div>
                </div>
                <div class="schedule-entry-actions">
                    <button class="btn-entry-action edit-entry-btn" data-entry-id="${entry.id}" data-hostname="${hostname}" title="Modifica">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="btn-entry-action delete-entry-btn" data-entry-id="${entry.id}" data-hostname="${hostname}" title="Elimina">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            </div>`;
        }).join('');
    }

    // ============================================
    // Modal
    // ============================================
    function openModal(type, hostname, entryId) {
        modalTarget = { type, app: currentApp, env: currentEnv, hostname: hostname || null };
        editingEntryId = entryId || null;

        if (type === 'machine') {
            const machine = DataManager.getMachines(currentApp, currentEnv).find(m => m.hostname === hostname);
            $('#modalTitle').textContent = entryId ? 'Modifica Pianificazione' : 'Nuova Pianificazione';
            $('#modalTarget').innerHTML = `<strong>${machine.machine_name}</strong> — ${machine.hostname} (${machine.server_type})`;

            if (entryId) {
                const entries = DataManager.getScheduleEntries(currentApp, currentEnv, hostname);
                const entry = entries.find(e => e.id === entryId);
                loadEntryIntoModal(entry);
            } else {
                loadEntryIntoModal(null);
            }
        } else {
            $('#modalTitle').textContent = 'Pianifica Intero Ambiente';
            $('#modalTarget').innerHTML = `<strong>${currentApp}</strong> — ${currentEnv} (tutti i server)`;
            loadEntryIntoModal(null);
        }

        calendarDate = new Date();
        renderCalendar();
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
            if (entry.startTime) $('#startTime').value = entry.startTime;
            if (entry.stopTime) $('#stopTime').value = entry.stopTime;
            $$('input[name="recurring"]').forEach(r => { r.checked = r.value === currentRecurring; });
            selectedDates.clear();
            if (entry.dates) entry.dates.forEach(d => selectedDates.add(d));
        } else {
            currentScheduleType = 'window';
            currentRecurring = 'none';
            $$('.schedule-type-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.type === 'window'));
            $('#timeWindowConfig').style.display = 'block';
            $('#startTime').value = '08:00';
            $('#stopTime').value = '20:00';
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
            startTime: currentScheduleType === 'window' ? $('#startTime').value : null,
            stopTime: currentScheduleType === 'window' ? $('#stopTime').value : null,
            recurring: currentRecurring,
            dates: currentRecurring === 'none' ? Array.from(selectedDates).sort() : []
        };

        if (modalTarget.type === 'machine') {
            if (editingEntryId) {
                DataManager.updateScheduleEntry(modalTarget.app, modalTarget.env, modalTarget.hostname, editingEntryId, entry);
                showToast('Pianificazione aggiornata', 'success');
            } else {
                DataManager.addScheduleEntry(modalTarget.app, modalTarget.env, modalTarget.hostname, entry);
                showToast('Pianificazione aggiunta', 'success');
            }
        } else {
            DataManager.addEntryForEnv(modalTarget.app, modalTarget.env, entry);
            showToast('Pianificazione applicata a tutto l\'ambiente', 'success');
        }

        closeModal();
        renderMachines(currentApp, currentEnv);
        renderEnvList(currentApp);
        renderWelcomeStats();
    }

    // ============================================
    // Calendar (Modal) — optimized, no lag
    // ============================================
    function renderCalendar() {
        const year = calendarDate.getFullYear();
        const month = calendarDate.getMonth();
        const monthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
                            'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
        $('#calendarMonthYear').textContent = `${monthNames[month]} ${year}`;

        const grid = $('#calendarGrid');
        let startDow = new Date(year, month, 1).getDay();
        startDow = startDow === 0 ? 6 : startDow - 1;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = new Date(); today.setHours(0, 0, 0, 0);

        // Build entire grid as a document fragment for performance
        const fragment = document.createDocumentFragment();

        for (let i = 0; i < startDow; i++) {
            const cell = document.createElement('div');
            cell.className = 'calendar-day empty';
            fragment.appendChild(cell);
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(year, month, d);
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
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

            if (!isPast) {
                cell.addEventListener('click', toggleDate);
            }
            fragment.appendChild(cell);
        }

        grid.innerHTML = '';
        grid.appendChild(fragment);
    }

    function toggleDate(e) {
        const dateStr = e.currentTarget.dataset.date;
        const cell = e.currentTarget;
        if (selectedDates.has(dateStr)) {
            selectedDates.delete(dateStr);
            cell.classList.remove('selected');
        } else {
            selectedDates.add(dateStr);
            cell.classList.add('selected');
        }
    }

    function navigateMonth(delta) {
        calendarDate.setMonth(calendarDate.getMonth() + delta);
        renderCalendar();
    }

    function selectWeekdays() {
        const year = calendarDate.getFullYear();
        const month = calendarDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = new Date(); today.setHours(0, 0, 0, 0);
        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(year, month, d);
            if (date < today) continue;
            const dow = date.getDay();
            if (dow >= 1 && dow <= 5) {
                selectedDates.add(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
            }
        }
        renderCalendar();
    }

    // ============================================
    // General Calendar View
    // ============================================
    let gcDate = new Date();

    function showGeneralCalendar() {
        currentView = 'general-calendar';
        showView('general-calendar');
        updateBreadcrumb();
        $('#breadcrumb').innerHTML = '<span class="breadcrumb-item active">Calendario Generale</span>';
        renderGeneralCalendar();
    }

    function navigateGeneralCalendar(delta) {
        gcDate.setMonth(gcDate.getMonth() + delta);
        renderGeneralCalendar();
    }

    function renderGeneralCalendar() {
        const year = gcDate.getFullYear();
        const month = gcDate.getMonth();
        const monthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
                            'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
        $('#gcMonthYear').textContent = `${monthNames[month]} ${year}`;

        const allSchedules = DataManager.getAllSchedulesFlat();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        let startDow = new Date(year, month, 1).getDay();
        startDow = startDow === 0 ? 6 : startDow - 1;
        const today = new Date(); today.setHours(0, 0, 0, 0);

        // Build a map: dateStr -> Set of "App - Env"
        const dateMap = {};
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            dateMap[dateStr] = new Map(); // appEnv -> count
        }

        const dayOfWeekForDate = (dateStr) => {
            const d = new Date(dateStr + 'T00:00:00');
            return d.getDay();
        };

        allSchedules.forEach(({ app, env, entry }) => {
            const key = `${app} - ${env}`;
            if (entry.recurring === 'daily') {
                for (let d = 1; d <= daysInMonth; d++) {
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    if (!dateMap[dateStr]) continue;
                    dateMap[dateStr].set(key, (dateMap[dateStr].get(key) || 0) + 1);
                }
            } else if (entry.recurring === 'weekdays') {
                for (let d = 1; d <= daysInMonth; d++) {
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    const dow = dayOfWeekForDate(dateStr);
                    if (dow >= 1 && dow <= 5) {
                        if (!dateMap[dateStr]) continue;
                        dateMap[dateStr].set(key, (dateMap[dateStr].get(key) || 0) + 1);
                    }
                }
            } else if (entry.recurring === 'weekends') {
                for (let d = 1; d <= daysInMonth; d++) {
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    const dow = dayOfWeekForDate(dateStr);
                    if (dow === 0 || dow === 6) {
                        if (!dateMap[dateStr]) continue;
                        dateMap[dateStr].set(key, (dateMap[dateStr].get(key) || 0) + 1);
                    }
                }
            } else if (entry.dates) {
                entry.dates.forEach(dateStr => {
                    if (dateMap[dateStr]) {
                        dateMap[dateStr].set(key, (dateMap[dateStr].get(key) || 0) + 1);
                    }
                });
            }
        });

        // Assign colors to app-env combinations
        const allAppEnvs = new Set();
        Object.values(dateMap).forEach(map => map.forEach((_, key) => allAppEnvs.add(key)));
        const appEnvColors = {};
        let ci = 0;
        allAppEnvs.forEach(key => {
            appEnvColors[key] = appColors[ci % appColors.length];
            ci++;
        });

        const grid = $('#gcGrid');
        const fragment = document.createDocumentFragment();

        // Empty cells for padding
        for (let i = 0; i < startDow; i++) {
            const cell = document.createElement('div');
            cell.className = 'gc-day gc-empty';
            fragment.appendChild(cell);
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
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
            appEnvMap.forEach((count, key) => {
                const color = appEnvColors[key];
                tagsHtml += `<span class="gc-tag" style="background:${color}20;color:${color};border-color:${color}40" title="${key}: ${count} server">${key} <small>(${count})</small></span>`;
            });

            cell.innerHTML = `<div class="gc-day-number">${d}</div><div class="gc-tags">${tagsHtml}</div>`;
            fragment.appendChild(cell);
        }

        grid.innerHTML = '';
        grid.appendChild(fragment);
    }

    // ============================================
    // CSV Import
    // ============================================
    async function handleCSVImport(e) {
        const file = e.target.files[0];
        if (!file) return;
        try {
            await DataManager.loadFromFile(file);
            renderAppList();
            renderWelcomeStats();
            goHome();
            showToast(`CSV importato: ${DataManager.machines.length} server caricati`, 'success');
        } catch (err) {
            showToast('Errore nell\'importazione del CSV', 'error');
        }
        e.target.value = '';
    }

    // ============================================
    // Export
    // ============================================
    function handleExport() {
        const data = DataManager.exportSchedules();
        if (data.length === 0) { showToast('Nessuna pianificazione da esportare', 'info'); return; }
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `shutdown-schedule-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Pianificazione esportata', 'success');
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
        toast.innerHTML = `${icons[type] || icons.info}<span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => { toast.classList.add('removing'); setTimeout(() => toast.remove(), 300); }, 3000);
    }

    document.addEventListener('DOMContentLoaded', init);
    return { init };
})();
