import { AnalogBreakClock, ClockFocus, ClockTask } from './analog-break-clock';
import { renderSettingsFields } from './settings-form';
import { netWorkMinutes } from '../utils/schedule-engine';
import { Break, BreakLogEntry, Settings, Task } from '../state/types';
import {
  timeStringToMinutes,
  minutesToTimestamp,
  minutesToTimeString,
  formatDuration,
  formatTimeOfDay,
} from '../utils/time-calculations';

export interface DashboardData {
  breaks: Break[];
  settings: Settings;
  workStart: string; // today's hours (may differ from the global settings)
  workEnd: string;
  isWorkday: boolean;
  tasks: Task[]; // tasks scheduled for today
  focus: ClockFocus[]; // today's focus sessions
  log: Record<string, BreakLogEntry>;
}

function isDone(entry: BreakLogEntry | undefined): boolean {
  return entry?.status === 'completed' || entry?.status === 'skipped';
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Only touch the DOM when markup actually changed, so buttons aren't replaced mid-click. */
function setHtml(el: Element | null, html: string) {
  if (el && el.innerHTML !== html) {
    el.innerHTML = html;
  }
}

export class Dashboard {
  private container: HTMLElement;
  private clock: AnalogBreakClock | null = null;
  private data: DashboardData | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  /** Full render. Call when breaks, settings or the break log change. */
  public render(data: DashboardData) {
    this.data = data;

    if (!data.settings.onboarded) {
      this.renderOnboarding(data.settings);
      return;
    }

    if (!this.container.querySelector('.dashboard')) {
      this.renderShell();
    }

    const clockContainer = this.container.querySelector<HTMLElement>('#clock-container');
    if (clockContainer) {
      this.clock?.destroy();
      this.clock = new AnalogBreakClock(
        clockContainer,
        data.breaks,
        data.workStart,
        data.workEnd,
        data.log
      );
    }

    const hours = this.container.querySelector('#working-hours');
    if (hours) {
      hours.textContent = !data.isWorkday
        ? 'Day off'
        : `${formatTimeOfDay(data.workStart)} – ${formatTimeOfDay(data.workEnd)} · ${formatDuration(
        netWorkMinutes(data.workStart, data.workEnd, data.breaks)
      )} of work time`;
    }

    this.clock?.setOverlays(data.focus, this.clockTasks(data.tasks));
    this.update();
  }

  /** Cheap per-second update of the time-dependent parts. */
  public update() {
    if (!this.data || !this.data.settings.onboarded) return;
    this.updateNextBreak();
    this.updateTasksToday();
    setHtml(this.container.querySelector('#breaks-list'), this.renderBreaksList());
  }

  /** Push the latest focus sessions (including a running one) to the clock. */
  public setFocusSessions(focus: ClockFocus[]) {
    if (!this.data) return;
    this.data = { ...this.data, focus };
    this.clock?.setOverlays(focus, this.clockTasks(this.data.tasks));
  }

  private clockTasks(tasks: Task[]): ClockTask[] {
    return tasks
      .filter((t) => t.scheduledTime)
      .map((t) => ({ title: t.title, time: t.scheduledTime!, done: t.completed }));
  }

  public setFocusLabel(label: string | null) {
    const btn = this.container.querySelector<HTMLButtonElement>('[data-action="open-focus"]');
    if (btn) {
      const text = label ? `Focus · ${label}` : 'Start Focus Session';
      if (btn.textContent !== text) btn.textContent = text;
    }
  }

  private renderShell() {
    this.container.innerHTML = `
      <div class="dashboard">
        <header class="app-header">
          <img class="app-logo" src="/logo.png" alt="" width="64" height="36">
          <h1>BreakLoop</h1>
          <p class="subtitle">Work smarter, rest better</p>
        </header>

        <main class="dashboard-main">
          <section class="clock-section" aria-labelledby="clock-heading">
            <h2 id="clock-heading">Your Break Schedule</h2>
            <p class="working-hours" id="working-hours"></p>
            <div id="clock-container" class="clock-container"></div>
            <p class="clock-legend" aria-hidden="true">
              <span><i class="lg-break"></i>Break</span>
              <span><i class="lg-focus"></i>Focus ✓</span>
              <span><i class="lg-task"></i>Task</span>
            </p>
          </section>

          <section class="next-break-section" aria-live="polite">
            <div class="next-break-card">
              <h3 id="next-break-title" class="sr-only">Next Break</h3>
              <p class="break-time sr-only" id="next-break-countdown"></p>
              <div id="next-break-body"></div>
            </div>
          </section>

          <section class="quick-actions">
            <button class="btn btn-primary" data-action="open-focus">Start Focus Session</button>
            <button class="btn btn-secondary" data-action="open-tasks">View Tasks</button>
          </section>

          <section class="tasks-today" id="tasks-today" hidden>
            <h3>Today's Tasks</h3>
            <ul class="tasks-today-items" id="tasks-today-items"></ul>
          </section>

          <section class="breaks-list">
            <h3>Today's Breaks</h3>
            <div id="breaks-list"></div>
          </section>
        </main>

        <footer class="app-footer">
          <button class="footer-btn" data-action="open-schedule">Schedule</button>
          <button class="footer-btn" data-action="open-settings">Settings</button>
          <button class="footer-btn" data-action="open-help">Help</button>
        </footer>
      </div>
    `;
  }

  private updateTasksToday() {
    if (!this.data) return;
    const scheduled = this.data.tasks
      .filter((t) => t.scheduledTime)
      .sort((a, b) => timeStringToMinutes(a.scheduledTime!) - timeStringToMinutes(b.scheduledTime!));
    const section = this.container.querySelector<HTMLElement>('#tasks-today');
    if (section) section.hidden = scheduled.length === 0;
    const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    setHtml(
      this.container.querySelector('#tasks-today-items'),
      scheduled
        .map(
          (t) => `<li class="${t.completed ? 'done' : ''}">
            <span class="task-time">${formatTimeOfDay(t.scheduledTime!)}</span>
            <span class="task-name">${esc(t.title)}</span>
            ${t.duration ? `<span class="task-dur">${t.duration}m</span>` : ''}
          </li>`
        )
        .join('')
    );
  }

  private updateNextBreak() {
    if (!this.data) return;
    const { breaks, log } = this.data;
    const now = Date.now();

    const title = this.container.querySelector('#next-break-title');
    const countdown = this.container.querySelector('#next-break-countdown');
    const body = this.container.querySelector('#next-break-body');
    if (!title || !countdown || !body) return;

    const pending = breaks.filter((b) => !isDone(log[b.id]));
    const startOf = (b: Break) => minutesToTimestamp(timeStringToMinutes(b.startTime));
    const endOf = (b: Break) => startOf(b) + b.duration * 60 * 1000;

    const current = pending.find((b) => now >= startOf(b) && now < endOf(b));
    const next = pending.find((b) => startOf(b) > now);

    let titleText: string;
    let countdownText: string;
    let detailText: string;
    let bodyHtml: string;

    const detailFor = (b: Break) =>
      `Break ${breaks.indexOf(b) + 1} · ${formatTimeOfDay(b.startTime)} · ${b.duration}m`;

    if (current) {
      const entry = log[current.id];
      const snoozed = entry?.status === 'snoozed' && entry.snoozedUntil && entry.snoozedUntil > now;
      titleText = snoozed ? 'Break Snoozed' : 'Break Time';
      countdownText = snoozed
        ? `resumes in ${formatCountdown(entry!.snoozedUntil! - now)}`
        : `ends in ${formatCountdown(endOf(current) - now)}`;
      detailText = detailFor(current);
      bodyHtml = `
        <div class="break-card-actions">
          <button class="btn btn-primary btn-small" data-action="complete-break" data-break-id="${current.id}">Complete</button>
          <button class="btn btn-secondary btn-small" data-action="snooze-break" data-break-id="${current.id}">Snooze ${this.data.settings.snoozeMinutes}m</button>
          <button class="btn btn-secondary btn-small" data-action="skip-break" data-break-id="${current.id}">Skip</button>
        </div>
      `;
    } else if (next) {
      titleText = 'Next Break';
      countdownText = `in ${formatCountdown(startOf(next) - now)}`;
      detailText = detailFor(next);
      bodyHtml = ''; // each break in the list has its own Skip
    } else if (breaks.length === 0) {
      const dayOff = !this.data.isWorkday;
      titleText = dayOff ? 'Day off' : 'No breaks';
      countdownText = '';
      detailText = dayOff ? 'Enjoy your day off' : 'Nothing scheduled today';
      bodyHtml = dayOff
        ? `<p class="no-breaks">Working today anyway?</p>
           <div class="break-card-actions">
             <button class="btn btn-primary btn-small" data-action="work-today">Turn on breaks for today</button>
           </div>`
        : '';
    } else {
      titleText = 'All Done';
      countdownText = '';
      detailText = 'No more breaks today. Nice work!';
      bodyHtml = '';
    }

    this.clock?.setCenter({
      eyebrow: countdownText ? titleText.toUpperCase() : '',
      headline: countdownText || titleText,
      detail: detailText,
    });
    this.container.querySelector('.next-break-card')?.classList.toggle('empty', bodyHtml === '');

    if (title.textContent !== titleText) title.textContent = titleText;
    if (countdown.textContent !== countdownText) countdown.textContent = countdownText;
    setHtml(body, bodyHtml);
  }

  private renderBreaksList(): string {
    if (!this.data) return '';
    const { breaks, log } = this.data;

    if (breaks.length === 0) {
      return '<p class="no-breaks">No breaks scheduled</p>';
    }

    const nowMinutes = (Date.now() - minutesToTimestamp(0)) / 60000;

    return `
      <ul class="breaks-list-items">
        ${breaks
          .map((b, i) => {
            const entry = log[b.id];
            const start = timeStringToMinutes(b.startTime);
            const isNow = nowMinutes >= start && nowMinutes < start + b.duration;
            const isPast = nowMinutes >= start + b.duration;

            let statusLabel = '';
            if (entry?.status === 'completed') statusLabel = 'Done';
            else if (entry?.status === 'skipped') statusLabel = 'Skipped';
            else if (isNow) statusLabel = 'Now';
            else if (isPast) statusLabel = 'Missed';

            const stateClass = entry?.status === 'completed' || entry?.status === 'skipped'
              ? entry.status
              : isNow ? 'current' : isPast ? 'past' : '';

            const actions = isDone(entry)
              ? `<button class="break-action" data-action="undo-break" data-break-id="${b.id}">Undo</button>`
              : `<button class="break-action" data-action="complete-break" data-break-id="${b.id}">Complete</button>
                 <button class="break-action break-action-secondary" data-action="skip-break" data-break-id="${b.id}">Skip</button>`;

            return `
          <li class="break-item ${stateClass}">
            <span class="break-number">${i + 1}</span>
            <span class="break-info">
              <strong>${formatTimeOfDay(b.startTime)} – ${formatTimeOfDay(minutesToTimeString(start + b.duration))}</strong>
              ${b.name} • ${b.duration}m${statusLabel ? ` <span class="break-status">${statusLabel}</span>` : ''}
            </span>
            ${actions}
          </li>`;
          })
          .join('')}
      </ul>
    `;
  }

  private renderOnboarding(settings: Settings): void {
    this.clock?.destroy();
    this.clock = null;

    // Don't wipe the form (and whatever the user typed) on re-render
    if (this.container.querySelector('.onboarding')) return;

    this.container.innerHTML = `
      <div class="onboarding">
        <header class="onboarding-header">
          <img class="app-logo" src="/logo.png" alt="" width="96" height="54">
          <h1>Welcome to BreakLoop</h1>
          <p>Let's set up your workday</p>
        </header>

        <form class="onboarding-form" id="onboarding-form" novalidate>
          ${renderSettingsFields(settings)}

          <button type="submit" class="btn btn-primary btn-large">
            Get Started
          </button>
        </form>
      </div>
    `;
  }

  public destroy() {
    this.clock?.destroy();
    this.clock = null;
  }
}
