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
    let currentView = 'home';
    let gcDate = new Date();
    let gcActiveFilters = new Set();

    const $ = s => document.querySelector(s);
    const $$ = s => document.querySelectorAll(s);

    const monthNames = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

    const serverIcons = {
        'Web Server': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
        'Application Server': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>',
        'Database Server': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>'
    };

    const envClassMap = { 'Development':'dev','Integration':'int','Pre-Produzione':'preprod','Training':'training','Bugfixing':'bugfix','Produzione':'prod' };
    const appColors = ['#d97706','#8b5cf6','#3b82f6','#06b6d4','#10b981','#ef4444','#ec4899','#6366f1'];
    const recurringLabels = { 'none':'Giorni specifici','daily':'Ogni giorno','weekdays':'Lun-Ven','weekends':'Sab-Dom' };

    // ============================================
    // Format dates for display
    // ============================================
    function formatDatesDetail(dates) {
        if (!dates || dates.length === 0) return '';
        const sorted = [...dates].sort();
        // Group by year-month
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
            // Find consecutive ranges
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
        document.documentElement.toggleAttribute('data-theme');
        if (isDark) { document.documentElement.removeAttribute('data-theme'); localStorage.setItem('shutdownScheduler_theme', 'light'); }
        else { document.documentElement.setAttribute('data-theme', 'dark'); localStorage.setItem('shutdownScheduler_theme', 'dark'); }
    }

    // ============================================
    // Custom Time Picker
    // ============================================
    function initTimePickers() {
        $$('.time-picker').forEach(picker => {
            const hoursContainer = picker.querySelector('.tp-hours');
            const minsContainer = picker.querySelector('.tp-minutes');
            const btn = picker.querySelector('.time-picker-btn');

            // Generate hours 00-23
            for (let h = 0; h < 24; h++) {
                const opt = document.createElement('button');
                opt.type = 'button';
                opt.className = 'time-picker-opt';
                opt.textContent = String(h).padStart(2, '0');
                opt.dataset.value = String(h).padStart(2, '0');
                opt.addEventListener('click', (e) => {
                    e.stopPropagation();
                    picker.dataset.hour = opt.dataset.value;
                    updateTimePickerDisplay(picker);
                    hoursContainer.querySelectorAll('.time-picker-opt').forEach(o => o.classList.remove('active'));
                    opt.classList.add('active');
                });
                hoursContainer.appendChild(opt);
            }

            // Generate minutes 00, 05, 10...55
            for (let m = 0; m < 60; m += 5) {
                const opt = document.createElement('button');
                opt.type = 'button';
                opt.className = 'time-picker-opt';
                opt.textContent = String(m).padStart(2, '0');
                opt.dataset.value = String(m).padStart(2, '0');
                opt.addEventListener('click', (e) => {
                    e.stopPropagation();
                    picker.dataset.min = opt.dataset.value;
                    updateTimePickerDisplay(picker);
                    minsContainer.querySelectorAll('.time-picker-opt').forEach(o => o.classList.remove('active'));
                    opt.classList.add('active');
                    // Close after selecting minute
                    picker.classList.remove('open');
                });
                minsContainer.appendChild(opt);
            }

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Close other pickers first
                $$('.time-picker.open').forEach(p => { if (p !== picker) p.classList.remove('open'); });
                picker.classList.toggle('open');
                if (picker.classList.contains('open')) {
                    highlightCurrentTime(picker);
                    scrollToActive(picker);
                }
            });
        });

        // Close picker on outside click
        document.addEventListener('click', () => {
            $$('.time-picker.open').forEach(p => p.classList.remove('open'));
        });
    }

    function highlightCurrentTime(picker) {
        const h = picker.dataset.hour;
        const m = picker.dataset.min;
        picker.querySelectorAll('.tp-hours .time-picker-opt').forEach(o => o.classList.toggle('active', o.dataset.value === h));
        picker.querySelectorAll('.tp-minutes .time-picker-opt').forEach(o => o.classList.toggle('active', o.dataset.value === m));
    }

    function scrollToActive(picker) {
        const activeHour = picker.querySelector('.tp-hours .time-picker-opt.active');
        const activeMin = picker.querySelector('.tp-minutes .time-picker-opt.active');
        if (activeHour) activeHour.scrollIntoView({ block: 'center', behavior: 'smooth' });
        if (activeMin) activeMin.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    function updateTimePickerDisplay(picker) {
        const h = picker.dataset.hour;
        const m = picker.dataset.min;
        picker.querySelector('.time-picker-value').textContent = `${h}:${m}`;
    }

    function getTimePickerValue(id) {
        const picker = $(`#${id}`);
        return `${picker.dataset.hour}:${picker.dataset.min}`;
    }

    function setTimePickerValue(id, time) {
        const picker = $(`#${id}`);
        const [h, m] = time.split(':');
        picker.dataset.hour = h.padStart(2, '0');
        // Round to nearest 5
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
        await DataManager.loadFromPath('data/machines.csv');
        renderAppList();
        renderWelcomeStats();
        initTimePickers();
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
        document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeEnvPopover(); } });
        document.addEventListener('click', e => {
            const popover = $('#envPopover');
            if (popover.style.display !== 'none' && !popover.contains(e.target) && !e.target.closest('#appList .nav-item')) {
                closeEnvPopover();
            }
        });
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
        // Re-bind calendarSection to the modal
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
                <button class="btn-clear-selection" id="clearSelection" title="Deseleziona tutto"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>`;
        // Re-bind events
        section.querySelector('#prevMonth').addEventListener('click', () => navigateMonth(-1));
        section.querySelector('#nextMonth').addEventListener('click', () => navigateMonth(1));
        section.querySelector('#selectWeekdays').addEventListener('click', selectWeekdays);
        section.querySelector('#clearSelection').addEventListener('click', () => { selectedDates.clear(); renderCalendar(); });
        return section;
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
        renderWelcomeStats();
        $$('.sidebar-action-btn').forEach(b => b.classList.remove('active'));
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
                <div class="nav-icon" style="color:${color};background:${color}15;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                </div>
                <span class="nav-label">${app.name}</span>
                <span class="nav-badge">${app.machineCount}</span>`;
            item.addEventListener('click', e => {
                e.stopPropagation();
                selectApp(app.name, item);
            });
            container.appendChild(item);
        });
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

        // Position popover
        const rect = anchorEl.getBoundingClientRect();
        const sidebarWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width'));
        popover.style.left = (sidebarWidth + 8) + 'px';
        popover.style.top = Math.min(rect.top, window.innerHeight - 300) + 'px';
        popover.style.display = 'block';
    }

    function closeEnvPopover() {
        $('#envPopover').style.display = 'none';
    }

    function selectEnv(envName) {
        currentEnv = envName;
        updateBreadcrumb(currentApp, envName);
        renderMachines(currentApp, envName);
        showView('machines');
    }

    // ============================================
    // Breadcrumb
    // ============================================
    function updateBreadcrumb(app, env) {
        const bc = $('#breadcrumb');
        if (!app) bc.innerHTML = '<span class="breadcrumb-item active">Seleziona un\'applicazione</span>';
        else if (!env) bc.innerHTML = `<span class="breadcrumb-item">${app}</span><span class="breadcrumb-separator">/</span><span class="breadcrumb-item active">Seleziona un ambiente</span>`;
        else bc.innerHTML = `<span class="breadcrumb-item">${app}</span><span class="breadcrumb-separator">/</span><span class="breadcrumb-item active">${env}</span>`;
    }

    // ============================================
    // Welcome Stats
    // ============================================
    function renderWelcomeStats() {
        const s = DataManager.getStats();
        $('#welcomeStats').innerHTML = `
            <div class="stat-card"><div class="stat-value">${s.applications}</div><div class="stat-label">Applicazioni</div></div>
            <div class="stat-card"><div class="stat-value">${s.environments}</div><div class="stat-label">Ambienti</div></div>
            <div class="stat-card"><div class="stat-value">${s.totalMachines}</div><div class="stat-label">Server</div></div>
            <div class="stat-card"><div class="stat-value">${s.scheduledMachines}</div><div class="stat-label">Pianificati</div></div>`;
    }

    // ============================================
    // Machine Grid
    // ============================================
    function renderMachines(appName, envName) {
        const machines = DataManager.getMachines(appName, envName);
        const grid = $('#machineGrid');
        grid.innerHTML = '';
        $('#envTitle').innerHTML = `<span class="env-title-app">${appName}</span><span class="env-title-sep">/</span>${envName}`;
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
                    <div class="entries-list">${renderEntriesList(entries, m.hostname)}</div>
                </div>
                <div class="machine-card-footer">
                    <button class="btn-primary add-entry-btn" data-hostname="${m.hostname}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Aggiungi Pianificazione
                    </button>
                </div>`;

            card.querySelector('.add-entry-btn').addEventListener('click', () => openModal('machine', m.hostname));
            card.querySelectorAll('.edit-entry-btn').forEach(btn => btn.addEventListener('click', () => openModal('machine', m.hostname, btn.dataset.entryId)));
            card.querySelectorAll('.delete-entry-btn').forEach(btn => btn.addEventListener('click', () => {
                DataManager.removeScheduleEntry(appName, envName, m.hostname, btn.dataset.entryId);
                renderMachines(currentApp, currentEnv);
                renderWelcomeStats();
                showToast('Entry rimossa', 'info');
            }));
            grid.appendChild(card);
        });
    }

    function renderEntriesList(entries, hostname) {
        if (entries.length === 0) {
            return `<div class="machine-schedule-summary"><div class="schedule-badge none">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                Nessuna pianificazione</div></div>`;
        }
        return entries.map(entry => {
            const typeLabel = entry.type === 'shutdown' ? 'Shutdown Completo' : `${entry.startTime} — ${entry.stopTime}`;
            const recurring = entry.recurring && entry.recurring !== 'none';
            let detailHtml = '';

            if (recurring) {
                detailHtml = `<div class="schedule-info">Ricorrente: <strong>${recurringLabels[entry.recurring]}</strong></div>`;
            } else if (entry.dates && entry.dates.length > 0) {
                const parts = formatDatesDetail(entry.dates);
                if (parts.length === 1) {
                    detailHtml = `<div class="schedule-info">${parts[0]}</div>`;
                } else {
                    detailHtml = `<div class="schedule-dates-detail"><ul>${parts.map(p => `<li>${p}</li>`).join('')}</ul></div>`;
                }
            }

            return `<div class="schedule-entry-item">
                <div class="schedule-entry-info">
                    <div class="schedule-badge active">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        ${typeLabel}
                    </div>
                    ${detailHtml}
                </div>
                <div class="schedule-entry-actions">
                    <button class="btn-entry-action edit-entry-btn" data-entry-id="${entry.id}" title="Modifica">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="btn-entry-action delete-entry-btn" data-entry-id="${entry.id}" title="Elimina">
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
                const entry = DataManager.getScheduleEntries(currentApp, currentEnv, hostname).find(e => e.id === entryId);
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
        renderWelcomeStats();
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
        const container = $('#gcFilters');
        container.innerHTML = '<span class="gc-filters-label">Filtri</span>';
        if (gcActiveFilters.size === 0) apps.forEach(a => gcActiveFilters.add(a.name));

        apps.forEach((app, i) => {
            const color = appColors[i % appColors.length];
            const chip = document.createElement('button');
            chip.className = 'gc-filter-chip' + (gcActiveFilters.has(app.name) ? ' active' : '');
            chip.innerHTML = `<span class="gc-filter-dot" style="background:${color}"></span>${app.name}`;
            chip.addEventListener('click', () => {
                if (gcActiveFilters.has(app.name)) gcActiveFilters.delete(app.name);
                else gcActiveFilters.add(app.name);
                chip.classList.toggle('active');
                renderGeneralCalendar();
            });
            container.appendChild(chip);
        });
    }

    function renderGeneralCalendar() {
        const year = gcDate.getFullYear(), month = gcDate.getMonth();
        $('#gcMonthYear').textContent = `${monthNames[month]} ${year}`;

        const allSchedules = DataManager.getAllSchedulesFlat().filter(s => gcActiveFilters.has(s.app));
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

        // Assign colors
        const allAppEnvs = new Set();
        Object.values(dateMap).forEach(map => map.forEach((_, k) => allAppEnvs.add(k)));
        const aeColors = {};
        let ci = 0;
        allAppEnvs.forEach(k => { aeColors[k] = appColors[ci % appColors.length]; ci++; });

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
                const color = aeColors[k];
                tagsHtml += `<span class="gc-tag" style="background:${color}18;color:${color};border-color:${color}35" title="${k}: ${count} server">${k} <span class="gc-tag-count">(${count})</span></span>`;
            });

            cell.innerHTML = `<div class="gc-day-number">${d}</div><div class="gc-tags">${tagsHtml}</div>`;
            fragment.appendChild(cell);
        }

        grid.innerHTML = '';
        grid.appendChild(fragment);
    }

    // ============================================
    // CSV Import / Export
    // ============================================
    async function handleCSVImport(e) {
        const file = e.target.files[0];
        if (!file) return;
        try {
            await DataManager.loadFromFile(file);
            renderAppList();
            renderWelcomeStats();
            goHome();
            gcActiveFilters.clear();
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
        toast.innerHTML = `${icons[type]||icons.info}<span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => { toast.classList.add('removing'); setTimeout(() => toast.remove(), 300); }, 3000);
    }

    document.addEventListener('DOMContentLoaded', init);
    return { init };
})();
