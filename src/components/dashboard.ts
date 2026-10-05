import { AnalogBreakClock } from './analog-break-clock';
import { renderSettingsFields } from './settings-form';
import { netWorkMinutes } from '../utils/schedule-engine';
import { Break, BreakLogEntry, Settings } from '../state/types';
import {
  timeStringToMinutes,
  minutesToTimestamp,
  minutesToTimeString,
  formatDuration,
} from '../utils/time-calculations';

export interface DashboardData {
  breaks: Break[];
  settings: Settings;
  workStart: string; // today's hours (may differ from the global settings)
  workEnd: string;
  isWorkday: boolean;
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
        : `${data.workStart} – ${data.workEnd} · ${formatDuration(
        netWorkMinutes(data.workStart, data.workEnd, data.breaks)
      )} of work time`;
    }

    this.update();
  }

  /** Cheap per-second update of the time-dependent parts. */
  public update() {
    if (!this.data || !this.data.settings.onboarded) return;
    this.updateNextBreak();
    setHtml(this.container.querySelector('#breaks-list'), this.renderBreaksList());
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
          <h1>BreakLoop</h1>
          <p class="subtitle">Work smarter, rest better</p>
        </header>

        <main class="dashboard-main">
          <section class="clock-section" aria-labelledby="clock-heading">
            <h2 id="clock-heading">Your Break Schedule</h2>
            <p class="working-hours" id="working-hours"></p>
            <div id="clock-container" class="clock-container"></div>
          </section>

          <section class="next-break-section" aria-live="polite">
            <div class="next-break-card">
              <h3 id="next-break-title">Next Break</h3>
              <p class="break-time" id="next-break-countdown"></p>
              <div id="next-break-body"></div>
            </div>
          </section>

          <section class="quick-actions">
            <button class="btn btn-primary" data-action="open-focus">Start Focus Session</button>
            <button class="btn btn-secondary" data-action="open-tasks">View Tasks</button>
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
    let bodyHtml: string;

    if (current) {
      const entry = log[current.id];
      const snoozed = entry?.status === 'snoozed' && entry.snoozedUntil && entry.snoozedUntil > now;
      titleText = snoozed ? 'Break Snoozed' : 'Break Time';
      countdownText = snoozed
        ? `resumes in ${formatCountdown(entry!.snoozedUntil! - now)}`
        : `ends in ${formatCountdown(endOf(current) - now)}`;
      bodyHtml = `
        <p class="break-type">Break ${breaks.indexOf(current) + 1} • ${current.startTime} • ${current.duration}m</p>
        <div class="break-card-actions">
          <button class="btn btn-primary btn-small" data-action="complete-break" data-break-id="${current.id}">Complete</button>
          <button class="btn btn-secondary btn-small" data-action="snooze-break" data-break-id="${current.id}">Snooze 5m</button>
          <button class="btn btn-secondary btn-small" data-action="skip-break" data-break-id="${current.id}">Skip</button>
        </div>
      `;
    } else if (next) {
      titleText = 'Next Break';
      countdownText = `in ${formatCountdown(startOf(next) - now)}`;
      bodyHtml = `
        <p class="break-type">Break ${breaks.indexOf(next) + 1} at ${next.startTime} • ${next.duration}m</p>
        <div class="break-card-actions">
          <button class="btn btn-secondary btn-small" data-action="skip-break" data-break-id="${next.id}">Skip</button>
        </div>
      `;
    } else if (breaks.length === 0) {
      titleText = 'Next Break';
      countdownText = '';
      bodyHtml = `<p class="no-breaks">${
        this.data.isWorkday ? 'No breaks scheduled for today' : 'Today is not a workday'
      }</p>`;
    } else {
      titleText = 'All Done';
      countdownText = '';
      bodyHtml = '<p class="no-breaks">No more breaks today. Nice work!</p>';
    }

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
            <span class="break-number" style="background-color: ${b.color}">${i + 1}</span>
            <span class="break-info">
              <strong>${b.startTime} – ${minutesToTimeString(start + b.duration)}</strong>
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
