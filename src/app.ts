import { Dashboard } from './components/dashboard';
import { TaskManager } from './components/task-manager';
import { FocusTimer } from './components/focus-timer';
import { renderSettingsFields, readSettingsFields, showFormError } from './components/settings-form';
import {
  initializeStorage,
  getSettings,
  updateSettings,
  getScheduleForDay,
  saveSchedule,
  getBreakLogForDate,
  saveBreakLogEntry,
  deleteBreakLogEntry,
  DEFAULT_SETTINGS,
} from './utils/storage';
import { generateBreaksForDay } from './utils/schedule-engine';
import { getCurrentDayOfWeek, getLocalDateKey } from './utils/time-calculations';
import { NotificationManager } from './utils/notification-manager';
import { playNotificationSound, sendNotification } from './utils/service-worker';
import { AppState, BreakLogEntry, BreakSchedule, BreakStatus, Settings } from './state/types';

const SNOOZE_MINUTES = 5;

type ModalView = 'tasks' | 'focus' | 'settings' | 'help';

export class App {
  private appContainer: HTMLElement | null = null;
  private dashboard: Dashboard | null = null;
  private notifications: NotificationManager | null = null;
  private focusTimer = new FocusTimer();
  private modal: HTMLElement | null = null;
  private modalView: ModalView | null = null;
  private lastFocused: HTMLElement | null = null;
  private tickId: number | null = null;
  private state: AppState = {
    settings: { ...DEFAULT_SETTINGS },
    schedules: [],
    tasks: [],
    todayBreaks: [],
    breakLog: {},
    today: getLocalDateKey(),
  };

  async init() {
    this.appContainer = document.getElementById('app');
    if (!this.appContainer) {
      console.error('App container not found');
      return;
    }

    try {
      await initializeStorage();
      this.state.settings = await getSettings();
    } catch (error) {
      // IndexedDB can be unavailable (e.g. some private browsing modes).
      // Keep working with in-memory defaults rather than showing a blank page.
      console.error('Storage unavailable, using defaults:', error);
    }

    this.applyTheme();

    this.notifications = new NotificationManager(this.state.settings);
    this.focusTimer.setOnComplete(() => this.handleFocusComplete());

    this.dashboard = new Dashboard(this.appContainer);
    this.createModal();
    this.setupEventListeners();

    await this.loadToday();
    this.render();

    this.startUpdateLoop();
  }

  /** Load (or create) today's schedule, regenerate breaks and today's break log. */
  private async loadToday() {
    const dayOfWeek = getCurrentDayOfWeek();
    this.state.today = getLocalDateKey();

    let schedule: BreakSchedule | undefined;
    try {
      schedule = await getScheduleForDay(dayOfWeek);
      if (!schedule) {
        schedule = this.defaultSchedule(dayOfWeek);
        await saveSchedule(schedule);
      }

      const entries = await getBreakLogForDate(this.state.today);
      this.state.breakLog = Object.fromEntries(entries.map((e) => [e.breakId, e]));
    } catch (error) {
      console.error('Failed to load schedule:', error);
      schedule ??= this.defaultSchedule(dayOfWeek);
      this.state.breakLog = {};
    }

    this.state.todayBreaks = generateBreaksForDay(schedule, this.state.settings);
  }

  private defaultSchedule(dayOfWeek: number): BreakSchedule {
    return {
      id: `schedule-${dayOfWeek}`,
      dayOfWeek,
      startTime: this.state.settings.workingHoursStart,
      endTime: this.state.settings.workingHoursEnd,
      breaks: [],
    };
  }

  private render() {
    this.dashboard?.render({
      breaks: this.state.todayBreaks,
      settings: this.state.settings,
      log: this.state.breakLog,
    });
  }

  private setupEventListeners() {
    if (!this.appContainer) return;

    this.appContainer.addEventListener('submit', (e) => {
      const form = e.target as HTMLFormElement;
      if (form.id === 'onboarding-form') {
        e.preventDefault();
        void this.handleOnboardingComplete(form);
      }
    });

    this.appContainer.addEventListener('click', (e) => {
      // closest() so clicks on a button's child elements still count
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!target) return;
      const breakId = target.dataset.breakId;

      switch (target.dataset.action) {
        case 'open-focus':
          this.openModal('focus');
          break;
        case 'open-tasks':
          this.openModal('tasks');
          break;
        case 'open-settings':
          this.openModal('settings');
          break;
        case 'open-help':
          this.openModal('help');
          break;
        case 'complete-break':
          if (breakId) void this.setBreakStatus(breakId, 'completed');
          break;
        case 'skip-break':
          if (breakId) void this.setBreakStatus(breakId, 'skipped');
          break;
        case 'snooze-break':
          if (breakId) void this.setBreakStatus(breakId, 'snoozed');
          break;
        case 'undo-break':
          if (breakId) void this.setBreakStatus(breakId, null);
          break;
      }
    });

    // Re-sync when the tab becomes visible again (timers are throttled in background)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void this.tick();
      }
    });
  }

  private async handleOnboardingComplete(form: HTMLFormElement) {
    const result = readSettingsFields(form);
    if (!result.ok) {
      showFormError(form, result.error);
      return;
    }
    showFormError(form, null);

    // Ask before any other await so it still counts as part of the user gesture
    const permission = result.values.notificationsEnabled
      ? NotificationManager.requestPermission()
      : Promise.resolve(false);

    await this.saveSettings({ ...result.values, onboarded: true });
    await permission;
  }

  /** Persist settings, rewrite all day schedules to match, and refresh the UI. */
  private async saveSettings(values: Partial<Settings>) {
    this.state.settings = { ...this.state.settings, ...values };

    try {
      await updateSettings(this.state.settings);
      this.state.settings = await getSettings();

      for (let day = 0; day < 7; day++) {
        const existing = await getScheduleForDay(day);
        await saveSchedule({
          ...(existing ?? this.defaultSchedule(day)),
          startTime: this.state.settings.workingHoursStart,
          endTime: this.state.settings.workingHoursEnd,
        });
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
    }

    this.notifications?.updateSettings(this.state.settings);
    this.applyTheme();
    await this.loadToday();
    this.render();
  }

  private async setBreakStatus(breakId: string, status: BreakStatus | null) {
    const id = `${this.state.today}|${breakId}`;
    const log = { ...this.state.breakLog };

    if (status === null) {
      delete log[breakId];
    } else {
      const entry: BreakLogEntry = { id, date: this.state.today, breakId, status };
      if (status === 'snoozed') {
        entry.snoozedUntil = Date.now() + SNOOZE_MINUTES * 60 * 1000;
      }
      log[breakId] = entry;
    }

    this.state.breakLog = log;
    this.render();

    try {
      if (status === null) {
        await deleteBreakLogEntry(id);
      } else {
        await saveBreakLogEntry(log[breakId]);
      }
    } catch (error) {
      console.error('Failed to save break status:', error);
    }
  }

  // ---- Modal (tasks, focus timer, settings, help) ----

  private createModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-header">
          <h2 id="modal-title"></h2>
          <button class="modal-close" data-modal-close aria-label="Close">×</button>
        </div>
        <div class="modal-body"></div>
      </div>
    `;
    document.body.appendChild(modal);
    this.modal = modal;

    modal.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target === modal || target.closest('[data-modal-close]')) {
        this.closeModal();
      }
    });

    modal.addEventListener('submit', (e) => {
      const form = e.target as HTMLFormElement;
      if (form.id === 'settings-form') {
        e.preventDefault();
        void this.handleSettingsSubmit(form);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modalView) {
        this.closeModal();
      }
    });
  }

  private openModal(view: ModalView) {
    if (!this.modal) return;
    this.closeModal();

    const title = this.modal.querySelector('#modal-title')!;
    const body = this.modal.querySelector<HTMLElement>('.modal-body')!;
    body.innerHTML = '';
    this.modalView = view;
    this.lastFocused = document.activeElement as HTMLElement | null;

    switch (view) {
      case 'tasks': {
        title.textContent = 'Tasks';
        const taskManager = new TaskManager(body);
        taskManager
          .load()
          .then(() => {
            if (this.modalView === 'tasks') taskManager.render();
          })
          .catch((error) => {
            console.error('Failed to load tasks:', error);
            taskManager.render();
          });
        break;
      }
      case 'focus':
        title.textContent = 'Focus';
        this.focusTimer.mount(body);
        break;
      case 'settings':
        title.textContent = 'Settings';
        body.innerHTML = `
          <form id="settings-form" class="settings-form" novalidate>
            ${renderSettingsFields(this.state.settings, true)}
            <button type="submit" class="btn btn-primary btn-large">Save</button>
          </form>
        `;
        break;
      case 'help':
        title.textContent = 'Help';
        body.innerHTML = `
          <div class="help-content">
            <p><strong>The clock</strong> shows your working day as one full circle, starting at the top.
            Coloured arcs are your breaks, numbered in order. The red hand is the current time.</p>
            <p><strong>Breaks</strong> are scheduled every N minutes from the start of your day.
            You'll get a reminder one minute before each break. Mark breaks as complete, skip them,
            or snooze a break for ${SNOOZE_MINUTES} minutes.</p>
            <p><strong>Focus sessions</strong> keep running when you close the panel; the button on the
            dashboard shows the time left.</p>
            <p><strong>Privacy:</strong> everything is stored locally in your browser. Nothing is sent anywhere.</p>
          </div>
        `;
        break;
    }

    this.modal.hidden = false;
    document.body.classList.add('modal-open');
    this.modal.querySelector<HTMLElement>('.modal-close')?.focus();
  }

  private closeModal() {
    if (!this.modal || !this.modalView) return;

    if (this.modalView === 'focus') {
      this.focusTimer.unmount();
    }

    this.modalView = null;
    this.modal.hidden = true;
    this.modal.querySelector<HTMLElement>('.modal-body')!.innerHTML = '';
    document.body.classList.remove('modal-open');
    this.lastFocused?.focus?.();
  }

  private async handleSettingsSubmit(form: HTMLFormElement) {
    const result = readSettingsFields(form);
    if (!result.ok) {
      showFormError(form, result.error);
      return;
    }

    // Ask before any other await so it still counts as part of the user gesture
    const permission = result.values.notificationsEnabled
      ? NotificationManager.requestPermission()
      : Promise.resolve(false);

    await this.saveSettings(result.values);
    await permission;

    this.closeModal();
  }

  private handleFocusComplete() {
    if (this.state.settings.soundEnabled) {
      playNotificationSound();
    }
    if (this.state.settings.notificationsEnabled) {
      void sendNotification('Focus session complete', {
        body: 'Nice work! Time to take a break.',
        icon: '/icon.svg',
        tag: 'focus-complete',
      });
    }
  }

  // ---- Theme & update loop ----

  private applyTheme() {
    const dark = this.state.settings.darkMode;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', dark ? '#070908' : '#ffffff');
  }

  private async tick() {
    // New day (e.g. app left open overnight): reload schedule and break log
    if (getLocalDateKey() !== this.state.today) {
      this.notifications?.reset();
      await this.loadToday();
      this.render();
      return;
    }

    this.notifications?.check(this.state.todayBreaks, this.state.breakLog, this.state.today);
    this.dashboard?.update();
    this.dashboard?.setFocusLabel(this.focusTimer.getRemainingLabel());
  }

  private startUpdateLoop() {
    if (this.tickId !== null) return;
    // Update every second
    this.tickId = window.setInterval(() => {
      void this.tick();
    }, 1000);
  }
}
