/* ============================================
   Shutdown Scheduler — Main Application
   ============================================ */

const App = (() => {
    let currentApp = null;
    let currentEnv = null;
    let modalTarget = null;
    let calendarDate = new Date();
    let selectedDates = new Set();
    let currentScheduleType = 'window';
    let currentRecurring = 'none';

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

        // Recurring radio buttons
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
        $('#welcomeScreen').style.display = 'flex';
        $('#machinesView').style.display = 'none';
        $('#exportBtn').style.display = 'none';
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
        $('#welcomeScreen').style.display = 'none';
        $('#machinesView').style.display = 'block';
        $('#exportBtn').style.display = 'inline-flex';
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
    // Machine Grid
    // ============================================
    function renderMachines(appName, envName) {
        const machines = DataManager.getMachines(appName, envName);
        const grid = $('#machineGrid');
        grid.innerHTML = '';
        $('#envTitle').textContent = envName;
        $('#machineCount').textContent = `${machines.length} server`;

        machines.forEach(m => {
            const schedule = DataManager.getSchedule(appName, envName, m.hostname);
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
                    ${renderScheduleSummary(schedule)}
                </div>
                <div class="machine-card-footer">
                    <button class="btn-primary schedule-btn" data-hostname="${m.hostname}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        ${schedule ? 'Modifica' : 'Pianifica'}
                    </button>
                    ${schedule ? `<button class="btn-secondary remove-schedule-btn" data-hostname="${m.hostname}" title="Rimuovi pianificazione">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>` : ''}
                </div>`;

            card.querySelector('.schedule-btn').addEventListener('click', () => openModal('machine', m.hostname));
            const removeBtn = card.querySelector('.remove-schedule-btn');
            if (removeBtn) {
                removeBtn.addEventListener('click', () => {
                    DataManager.removeSchedule(appName, envName, m.hostname);
                    renderMachines(currentApp, currentEnv);
                    renderEnvList(currentApp);
                    renderWelcomeStats();
                    showToast('Pianificazione rimossa', 'info');
                });
            }
            grid.appendChild(card);
        });
    }

    function renderScheduleSummary(schedule) {
        if (!schedule) {
            return `<div class="machine-schedule-summary">
                <div class="schedule-badge none">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                    Nessuna pianificazione
                </div>
            </div>`;
        }

        const typeLabel = schedule.type === 'shutdown' ? 'Shutdown Completo' : `${schedule.startTime} — ${schedule.stopTime}`;
        const recurring = schedule.recurring && schedule.recurring !== 'none';
        const recLabel = recurring ? recurringLabels[schedule.recurring] : '';
        const dateCount = schedule.dates ? schedule.dates.length : 0;
        const detailLine = recurring
            ? `Ricorrente: <strong>${recLabel}</strong>`
            : `${dateCount} giorn${dateCount === 1 ? 'o' : 'i'} selezionat${dateCount === 1 ? 'o' : 'i'}`;

        return `<div class="machine-schedule-summary">
            <div class="schedule-badge active">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                Pianificato
            </div>
            <div class="schedule-info"><strong>${typeLabel}</strong><br>${detailLine}</div>
        </div>`;
    }

    // ============================================
    // Modal
    // ============================================
    function openModal(type, hostname) {
        modalTarget = { type, app: currentApp, env: currentEnv, hostname: hostname || null };

        if (type === 'machine') {
            const machine = DataManager.getMachines(currentApp, currentEnv).find(m => m.hostname === hostname);
            $('#modalTitle').textContent = 'Pianifica Spegnimento';
            $('#modalTarget').innerHTML = `<strong>${machine.machine_name}</strong> — ${machine.hostname} (${machine.server_type})`;
            loadScheduleIntoModal(DataManager.getSchedule(currentApp, currentEnv, hostname));
        } else {
            $('#modalTitle').textContent = 'Pianifica Intero Ambiente';
            $('#modalTarget').innerHTML = `<strong>${currentApp}</strong> — ${currentEnv} (tutti i server)`;
            loadScheduleIntoModal(null);
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
        selectedDates.clear();
    }

    function loadScheduleIntoModal(schedule) {
        if (schedule) {
            currentScheduleType = schedule.type;
            currentRecurring = schedule.recurring || 'none';
            $$('.schedule-type-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.type === schedule.type));
            $('#timeWindowConfig').style.display = schedule.type === 'window' ? 'block' : 'none';
            if (schedule.startTime) $('#startTime').value = schedule.startTime;
            if (schedule.stopTime) $('#stopTime').value = schedule.stopTime;
            $$('input[name="recurring"]').forEach(r => { r.checked = r.value === currentRecurring; });
            selectedDates.clear();
            if (schedule.dates) schedule.dates.forEach(d => selectedDates.add(d));
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

        const schedule = {
            type: currentScheduleType,
            startTime: currentScheduleType === 'window' ? $('#startTime').value : null,
            stopTime: currentScheduleType === 'window' ? $('#stopTime').value : null,
            recurring: currentRecurring,
            dates: currentRecurring === 'none' ? Array.from(selectedDates).sort() : []
        };

        if (modalTarget.type === 'machine') {
            DataManager.setSchedule(modalTarget.app, modalTarget.env, modalTarget.hostname, schedule);
            showToast('Pianificazione salvata', 'success');
        } else {
            DataManager.setScheduleForEnv(modalTarget.app, modalTarget.env, schedule);
            showToast('Pianificazione applicata a tutto l\'ambiente', 'success');
        }

        closeModal();
        renderMachines(currentApp, currentEnv);
        renderEnvList(currentApp);
        renderWelcomeStats();
    }

    // ============================================
    // Calendar
    // ============================================
    function renderCalendar() {
        const year = calendarDate.getFullYear();
        const month = calendarDate.getMonth();
        const monthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
                            'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
        $('#calendarMonthYear').textContent = `${monthNames[month]} ${year}`;

        const grid = $('#calendarGrid');
        grid.innerHTML = '';
        let startDow = new Date(year, month, 1).getDay();
        startDow = startDow === 0 ? 6 : startDow - 1;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = new Date(); today.setHours(0, 0, 0, 0);

        for (let i = 0; i < startDow; i++) {
            const cell = document.createElement('div');
            cell.className = 'calendar-day empty';
            grid.appendChild(cell);
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(year, month, d);
            const dateStr = formatDate(date);
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

            if (!isPast) {
                cell.addEventListener('click', () => {
                    if (selectedDates.has(dateStr)) selectedDates.delete(dateStr);
                    else selectedDates.add(dateStr);
                    renderCalendar();
                });
            }
            grid.appendChild(cell);
        }
    }

    function navigateMonth(delta) {
        calendarDate.setMonth(calendarDate.getMonth() + delta);
        renderCalendar();
    }

    function formatDate(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
            if (dow >= 1 && dow <= 5) selectedDates.add(formatDate(date));
        }
        renderCalendar();
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
            currentApp = null;
            currentEnv = null;
            $('#envSection').style.display = 'none';
            $('#welcomeScreen').style.display = 'flex';
            $('#machinesView').style.display = 'none';
            updateBreadcrumb();
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
