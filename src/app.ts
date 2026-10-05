import { Dashboard } from './components/dashboard';
import { TaskManager } from './components/task-manager';
import { FocusTimer, ConflictResolution } from './components/focus-timer';
import type { ClockFocus } from './components/analog-break-clock';
import { WeeklySchedule } from './components/weekly-schedule';
import { ToastManager } from './components/toast-manager';
import {
  previewTime,
  renderSettingsSections,
  readSettingsFields,
  showFormError,
} from './components/settings-form';
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
  exportAllData,
  getTasks,
  updateTask,
  getFocusLogForDate,
  getSchedules,
  saveFocusLogEntry,
  resetAllData,
} from './utils/storage';
import { generateBreaksForDay, legacyRules } from './utils/schedule-engine';
import {
  formatTimeOfDay,
  getCurrentDayOfWeek,
  getDayOfWeek,
  getLocalDateKey,
  getSecondsSinceMidnight,
  minutesToTimeString,
  minutesToTimestamp,
  setTimeConfig,
  timeStringToMinutes,
} from './utils/time-calculations';
import { NotificationManager, describeReminder } from './utils/notification-manager';
import {
  enableAudioOnFirstTouch,
  playNotificationSound,
  sendNotification,
  SoundType,
} from './utils/service-worker';
import { disablePush, enablePush, PushReminder, syncReminders } from './utils/push';
import { AppState, Break, BreakLogEntry, FocusModeId, BreakSchedule, BreakStatus, Settings } from './state/types';

type ModalView = 'tasks' | 'focus' | 'schedule' | 'settings' | 'help';

export class App {
  private appContainer: HTMLElement | null = null;
  private dashboard: Dashboard | null = null;
  private notifications: NotificationManager | null = null;
  private focusTimer = new FocusTimer();
  private weeklySchedule: WeeklySchedule | null = null;
  private firedTasks = new Set<string>();
  private toasts = new ToastManager((id, action) => this.handleToastAction(id, action));
  private todayHours = { start: DEFAULT_SETTINGS.workingHoursStart, end: DEFAULT_SETTINGS.workingHoursEnd, isWorkday: true };
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
    focusLog: [],
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
    this.applyTimeConfig();
    enableAudioOnFirstTouch();

    this.notifications = new NotificationManager(this.state.settings);
    this.notifications.setOnReminder((b, snoozed) => this.showBreakToast(b, snoozed));
    this.focusTimer.setOnComplete(() => this.handleFocusComplete());
    this.focusTimer.setConflictProvider((minutes) =>
      this.findFocusConflicts(minutes).map(
        ({ b, index }) =>
          `Break ${index + 1} · ${formatTimeOfDay(b.startTime)} · ${b.duration}m`
      )
    );
    this.focusTimer.setOnStart(({ duration, resolution }) => void this.applyFocusResolution(duration, resolution));
    this.focusTimer.setOnEnd((info) => void this.recordFocusSession(info));

    this.dashboard = new Dashboard(this.appContainer);
    this.createModal();
    this.setupEventListeners();

    await this.loadToday();
    this.render();
    this.schedulePushSync();

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
      this.state.focusLog = await getFocusLogForDate(this.state.today);
      this.state.tasks = (await getTasks()).filter((t) => t.scheduledDate === this.state.today);
    } catch (error) {
      console.error('Failed to load schedule:', error);
      schedule ??= this.defaultSchedule(dayOfWeek);
      this.state.breakLog = {};
    }

    // A day off you're working anyway: use the default hours and breaks for today only
    if (schedule.isWorkday === false && this.isWorkingToday()) {
      schedule = this.defaultSchedule(dayOfWeek);
    }
    this.todayHours = {
      start: schedule.startTime,
      end: schedule.endTime,
      isWorkday: schedule.isWorkday !== false,
    };
    this.state.todayBreaks = this.applyAdjustments(
      generateBreaksForDay(schedule, this.state.settings),
      schedule.endTime
    );
  }

  // ---- Focus sessions vs breaks ----

  private readAdjustments(): { moved: Record<string, string>; removed: string[] } {
    try {
      const raw = JSON.parse(localStorage.getItem('breakloop.adjust') ?? 'null');
      if (raw?.date === this.state.today) return { moved: raw.moved ?? {}, removed: raw.removed ?? [] };
    } catch {
      /* ignore */
    }
    return { moved: {}, removed: [] };
  }

  private writeAdjustments(adj: { moved: Record<string, string>; removed: string[] }) {
    try {
      localStorage.setItem('breakloop.adjust', JSON.stringify({ date: this.state.today, ...adj }));
    } catch {
      /* private mode: adjustments last until reload */
    }
  }

  /** Apply today's focus-session changes (moved/removed breaks) on top of the generated breaks. */
  private applyAdjustments(breaks: Break[], workEnd: string): Break[] {
    const adj = this.readAdjustments();
    const kept = breaks.filter((b) => !adj.removed.includes(b.id));
    const fixed = kept.filter((b) => !(b.id in adj.moved));
    const result = [...fixed];
    const end = timeStringToMinutes(workEnd);
    for (const b of kept.filter((x) => x.id in adj.moved)) {
      const start = timeStringToMinutes(adj.moved[b.id]);
      const overlaps = result.some((o) => {
        const os = timeStringToMinutes(o.startTime);
        return start < os + o.duration && start + b.duration > os;
      });
      if (start + b.duration <= end && !overlaps) {
        result.push({ ...b, startTime: adj.moved[b.id] });
      }
    }
    return result.sort((a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime));
  }

  /** Pending breaks that would overlap a focus session starting now. */
  private findFocusConflicts(durationMinutes: number): { b: Break; index: number }[] {
    const from = getSecondsSinceMidnight() / 60;
    const to = from + durationMinutes;
    return this.state.todayBreaks
      .map((b, index) => ({ b, index }))
      .filter(({ b }) => {
        const status = this.state.breakLog[b.id]?.status;
        if (status === 'completed' || status === 'skipped') return false;
        const s = timeStringToMinutes(b.startTime);
        return s < to && s + b.duration > from;
      });
  }

  private async applyFocusResolution(durationMinutes: number, resolution: ConflictResolution) {
    if (resolution === 'keep') return;
    const conflicts = this.findFocusConflicts(durationMinutes);
    if (conflicts.length === 0) return;

    const adj = this.readAdjustments();
    const sessionEnd = Math.ceil(getSecondsSinceMidnight() / 60 + durationMinutes);
    conflicts.forEach(({ b }, i) => {
      if (resolution === 'move' && i === 0) {
        adj.moved[b.id] = minutesToTimeString(sessionEnd);
      } else if (!adj.removed.includes(b.id)) {
        adj.removed.push(b.id);
      }
    });
    this.writeAdjustments(adj);

    await this.loadToday();
    this.render();
    this.schedulePushSync();

    const movedId = conflicts[0].b.id;
    const moved = this.state.todayBreaks.find((b) => b.id === movedId);
    if (resolution === 'move') {
      this.toasts.show({
        id: 'focus-adjust',
        title: moved ? 'Break moved' : 'Break removed',
        body: moved
          ? `Your break now starts at ${formatTimeOfDay(moved.startTime)}, after the focus session.`
          : 'There was no room for it after the session, so it was removed.',
        durationMs: 7000,
      });
    }
  }

  private async recordFocusSession(info: { mode: FocusModeId; startedAt: number; endedAt: number; completed: boolean }) {
    if (info.endedAt - info.startedAt < 60000) return; // too short to mark
    const entry = {
      id: `${info.startedAt}`,
      date: getLocalDateKey(new Date(info.startedAt)),
      ...info,
    };
    if (entry.date === this.state.today) this.state.focusLog = [...this.state.focusLog, entry];
    try {
      await saveFocusLogEntry(entry);
    } catch (error) {
      console.error('Failed to save focus session:', error);
    }
    this.dashboard?.setFocusSessions(this.focusSessions());
  }

  /** Finished sessions plus the one in progress, for the clock. */
  private focusSessions(): ClockFocus[] {
    const sessions: ClockFocus[] = this.state.focusLog.map((f) => ({
      startedAt: f.startedAt,
      endedAt: f.endedAt,
      completed: f.completed,
    }));
    const active = this.focusTimer.getActiveWindow();
    if (active) sessions.push({ startedAt: active.startedAt, endedAt: null, completed: false });
    return sessions;
  }

  /** Pop-up when a scheduled task's start time arrives. */
  private checkTaskReminders() {
    const now = Date.now();
    for (const task of this.state.tasks) {
      if (task.completed || !task.scheduledTime) continue;
      const due = minutesToTimestamp(timeStringToMinutes(task.scheduledTime));
      const key = `${this.state.today}|${task.id}`;
      if (now < due || this.firedTasks.has(key)) continue;
      this.firedTasks.add(key);
      if (now - due > 5 * 60 * 1000 || !this.state.settings.notificationsEnabled) continue;

      if (this.state.settings.soundEnabled) {
        playNotificationSound(this.state.settings.soundType, this.state.settings.soundVolume);
      }
      const body = `${formatTimeOfDay(task.scheduledTime)}${task.duration ? ` · ${task.duration} min` : ''}`;
      if (document.hidden) {
        void sendNotification(task.title, { body, icon: '/icon-192.png', tag: `task-${task.id}` });
      } else {
        this.toasts.show({
          id: `task:${task.id}`,
          title: task.title,
          body: `Time to start · ${body}`,
          actions: [
            { label: 'Done', action: 'done', primary: true },
            { label: 'Later', action: 'dismiss' },
          ],
          durationMs: 30000,
        });
      }
    }
  }

  // ---- Background reminders (Web Push) ----

  private pushSyncTimer: number | null = null;

  /** Re-send the upcoming reminders to the push service shortly after anything changes. */
  private schedulePushSync() {
    if (!this.state.settings.backgroundReminders) return;
    if (this.pushSyncTimer !== null) clearTimeout(this.pushSyncTimer);
    this.pushSyncTimer = window.setTimeout(() => {
      this.pushSyncTimer = null;
      void this.syncPush();
    }, 2000);
  }

  private async syncPush() {
    try {
      await syncReminders(await this.buildReminders());
    } catch (error) {
      console.error('Failed to sync reminders:', error);
    }
  }

  /** Break and task reminders for the next 7 days. */
  private async buildReminders(): Promise<PushReminder[]> {
    const { settings } = this.state;
    const schedules = await getSchedules();
    const tasks = (await getTasks()).filter((t) => !t.completed && t.scheduledDate && t.scheduledTime);
    const now = Date.now();
    const reminders: PushReminder[] = [];

    for (let offset = 0; offset < 7; offset++) {
      const date = new Date(now + offset * 86400000);
      const dateKey = getLocalDateKey(date);
      const dow = getDayOfWeek(date);

      let breaks: Break[];
      if (offset === 0) {
        // Today already has focus-session adjustments and done/skipped breaks applied
        breaks = this.state.todayBreaks.filter((b) => {
          const status = this.state.breakLog[b.id]?.status;
          return status !== 'completed' && status !== 'skipped';
        });
      } else {
        const schedule = schedules.find((s) => s.dayOfWeek === dow) ?? this.defaultSchedule(dow);
        breaks = generateBreaksForDay(schedule, settings);
      }

      for (const b of breaks) {
        const at = minutesToTimestamp(timeStringToMinutes(b.startTime), date) - settings.reminderLeadMinutes * 60000;
        if (at < now - 60000) continue;
        reminders.push({
          at,
          title: 'Time for a break',
          body: describeReminder(b, false, settings.reminderLeadMinutes),
          tag: `break-${b.id}`,
        });
      }

      for (const t of tasks.filter((x) => x.scheduledDate === dateKey)) {
        const at = minutesToTimestamp(timeStringToMinutes(t.scheduledTime!), date);
        if (at < now - 60000) continue;
        reminders.push({
          at,
          title: t.title,
          body: `Time to start · ${formatTimeOfDay(t.scheduledTime!)}${t.duration ? ` · ${t.duration} min` : ''}`,
          tag: `task-${t.id}`,
        });
      }
    }
    return reminders.sort((a, b) => a.at - b.at);
  }

  private isWorkingToday(): boolean {
    try {
      return localStorage.getItem('breakloop.workingToday') === this.state.today;
    } catch {
      return false;
    }
  }

  private setWorkingToday(on: boolean) {
    try {
      if (on) localStorage.setItem('breakloop.workingToday', this.state.today);
      else localStorage.removeItem('breakloop.workingToday');
    } catch {
      /* private mode: the override just won't persist across reloads */
    }
    void this.loadToday().then(() => this.render());
  }

  private showBreakToast(b: Break, snoozed: boolean) {
    const { reminderLeadMinutes, snoozeMinutes } = this.state.settings;
    this.toasts.show({
      id: `break:${b.id}`,
      title: snoozed ? 'Break time!' : `Time for a break`,
      body: describeReminder(b, snoozed, reminderLeadMinutes),
      actions: [
        { label: 'Complete', action: 'complete', primary: true },
        { label: `Snooze ${snoozeMinutes}m`, action: 'snooze' },
        { label: 'Skip', action: 'skip' },
      ],
    });
  }

  private handleToastAction(toastId: string, action: string) {
    if (toastId.startsWith('task:') && action === 'done') {
      const id = toastId.slice('task:'.length);
      void updateTask(id, { completed: true })
        .then(() => this.loadToday())
        .then(() => this.render());
      return;
    }
    if (!toastId.startsWith('break:')) return;
    const breakId = toastId.slice('break:'.length);
    const status = { complete: 'completed', snooze: 'snoozed', skip: 'skipped' }[action] as
      | BreakStatus
      | undefined;
    if (status) void this.setBreakStatus(breakId, status);
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
      workStart: this.todayHours.start,
      workEnd: this.todayHours.end,
      isWorkday: this.todayHours.isWorkday,
      tasks: this.state.tasks,
      focus: this.focusSessions(),
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
        case 'work-today':
          this.setWorkingToday(true);
          break;
        case 'open-focus':
          this.openModal('focus');
          break;
        case 'open-tasks':
          this.openModal('tasks');
          break;
        case 'open-schedule':
          this.openModal('schedule');
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

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (this.state.settings.theme === 'system') this.applyTheme();
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
    const previousZone = this.state.settings.timeZone;
    this.state.settings = { ...this.state.settings, ...values };

    try {
      await updateSettings(this.state.settings);
      this.state.settings = await getSettings();

      for (let day = 0; day < 7; day++) {
        const existing = await getScheduleForDay(day);
        if (existing?.customized) continue; // edited in the weekly schedule
        await saveSchedule({
          ...(existing ?? this.defaultSchedule(day)),
          startTime: this.state.settings.workingHoursStart,
          endTime: this.state.settings.workingHoursEnd,
        });
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
    }

    const zoneChanged = previousZone !== this.state.settings.timeZone;
    this.schedulePushSync();
    this.notifications?.updateSettings(this.state.settings);
    if (zoneChanged) this.notifications?.reset();
    this.applyTheme();
    this.applyTimeConfig();
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
        entry.snoozedUntil = Date.now() + this.state.settings.snoozeMinutes * 60 * 1000;
      }
      log[breakId] = entry;
    }

    this.state.breakLog = log;
    this.render();
    this.schedulePushSync();

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

    modal.addEventListener('click', (e) => {
      const action = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
      if (action === 'test-sound' || action === 'test-popup') {
        const form = (e.target as HTMLElement).closest('#settings-form');
        const volume = Number(form?.querySelector<HTMLInputElement>('#sound-volume')?.value ?? 70);
        const chosen = form?.querySelector<HTMLInputElement>('input[name="sound-type"]:checked')?.value;
        const sound = ((e.target as HTMLElement).closest<HTMLElement>('[data-sound]')?.dataset.sound ??
          chosen ??
          'chime') as SoundType;
        playNotificationSound(sound, volume);
        if (action === 'test-popup') {
          this.toasts.show({
            id: 'test',
            title: 'Time for a break',
            body: 'This is what break reminders look like.',
            actions: [{ label: 'Got it', action: 'dismiss', primary: true }],
            durationMs: 8000,
          });
        }
      }
      if (action === 'export-data') void this.exportData();
      if (action === 'reset-data') void this.resetData();
    });

    // Live "current time" preview under the time zone picker
    modal.addEventListener('change', (e) => {
      const form = (e.target as HTMLElement).closest<HTMLFormElement>('#settings-form');
      const preview = form?.querySelector('#time-zone-preview');
      if (!form || !preview) return;
      const zone = form.querySelector<HTMLSelectElement>('#time-zone')?.value ?? 'auto';
      const format =
        form.querySelector<HTMLInputElement>('input[name="time-format"]:checked')?.value === '12h'
          ? '12h'
          : '24h';
      preview.textContent = previewTime(zone, format);
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
        taskManager.setOnTasksChanged(
          () => void this.loadToday().then(() => {
            this.render();
            this.schedulePushSync();
          })
        );
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
      case 'schedule':
        title.textContent = 'Weekly Schedule';
        this.loadWeeklySchedule(body, title);
        break;
      case 'settings':
        title.textContent = 'Settings';
        body.innerHTML = `
          <form id="settings-form" class="settings-form" novalidate>
            ${renderSettingsSections(this.state.settings)}
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
            or snooze a break for ${this.state.settings.snoozeMinutes} minutes.</p>
            <p><strong>Schedule</strong> lets you set hours, workdays and breaks per day: at an exact time,
            a number of evenly spaced breaks, or a break that repeats. Copy a day to others in one step.</p>
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

  private async loadWeeklySchedule(body: HTMLElement, title: Element) {
    const schedules: BreakSchedule[] = [];
    for (let day = 0; day < 7; day++) {
      let schedule: BreakSchedule | undefined;
      try {
        schedule = await getScheduleForDay(day);
      } catch (error) {
        console.error('Failed to load schedule:', error);
      }
      schedule ??= this.defaultSchedule(day);
      // Days that follow the global settings are shown (and saved) as an explicit rule
      schedule.rules ??= legacyRules(this.state.settings);
      schedules.push(schedule);
    }
    if (this.modalView !== 'schedule') return; // closed while loading

    this.weeklySchedule = new WeeklySchedule(body, schedules, {
      onTitle: (text) => (title.textContent = text),
      onClose: () => this.closeModal(),
      onSave: async (updated) => {
        try {
          for (const schedule of updated) {
            await saveSchedule(schedule);
          }
        } catch (error) {
          console.error('Failed to save schedule:', error);
        }
        await this.loadToday();
        this.render();
        this.schedulePushSync();
        this.closeModal();
      },
    });
    this.weeklySchedule.render();
  }

  private closeModal() {
    if (!this.modal || !this.modalView) return;

    if (this.modalView === 'focus') {
      this.focusTimer.unmount();
    }
    this.weeklySchedule?.destroy();
    this.weeklySchedule = null;

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
    const wantsBackground = result.values.backgroundReminders === true;
    const background =
      result.values.backgroundReminders === undefined
        ? null
        : wantsBackground
          ? enablePush()
          : disablePush().then(() => ({ ok: true as const }));
    const permission =
      result.values.notificationsEnabled && !wantsBackground
        ? NotificationManager.requestPermission()
        : Promise.resolve(false);

    const pushResult = await background;
    if (pushResult && !pushResult.ok) {
      // Keep the panel open so the reason is visible, and save everything else
      result.values.backgroundReminders = false;
      await this.saveSettings(result.values);
      showFormError(form, `Saved, but background reminders are off: ${pushResult.reason}`);
      const box = form.querySelector<HTMLInputElement>('#background-reminders');
      if (box) box.checked = false;
      return;
    }

    await this.saveSettings(result.values);
    this.closeModal();
    await permission;
  }

  private handleFocusComplete() {
    if (this.state.settings.soundEnabled) {
      playNotificationSound(this.state.settings.soundType, this.state.settings.soundVolume);
    }
    if (this.state.settings.notificationsEnabled) {
      if (!document.hidden) {
        this.toasts.show({
          id: 'focus-complete',
          title: 'Focus session complete',
          body: 'Nice work! Time to take a break.',
          actions: [{ label: 'Got it', action: 'dismiss', primary: true }],
        });
        return;
      }
      void sendNotification('Focus session complete', {
        body: 'Nice work! Time to take a break.',
        icon: '/icon-192.png',
        tag: 'focus-complete',
      });
    }
  }

  // ---- Theme & update loop ----

  private applyTheme() {
    const { theme, accent } = this.state.settings;
    const dark =
      theme === 'system' ? window.matchMedia('(prefers-color-scheme: dark)').matches : theme === 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.accent = accent;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', dark ? '#070908' : '#ffffff');
  }

  private applyTimeConfig() {
    setTimeConfig(this.state.settings.timeZone, this.state.settings.timeFormat);
  }

  private async exportData() {
    try {
      const data = await exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `breakloop-${this.state.today}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export data:', error);
    }
  }

  private async resetData() {
    if (!window.confirm('Delete all schedules, tasks, history and settings? This cannot be undone.')) {
      return;
    }
    try {
      await resetAllData();
    } catch (error) {
      console.error('Failed to reset data:', error);
    }
    window.location.reload();
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
    this.checkTaskReminders();
    this.dashboard?.setFocusSessions(this.focusSessions());
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
