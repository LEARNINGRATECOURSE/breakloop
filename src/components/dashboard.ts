import { AnalogBreakClock } from './analog-break-clock';
import { Break, Settings } from '../state/types';

export class Dashboard {
  private container: HTMLElement;
  private clock: AnalogBreakClock | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public render(
    breaks: Break[],
    settings: Settings,
    onboarded: boolean
  ) {
    if (!onboarded) {
      this.renderOnboarding();
      return;
    }

    this.container.innerHTML = `
      <div class="dashboard">
        <header class="app-header">
          <h1>BreakLoop</h1>
          <p class="subtitle">Work smarter, rest better</p>
        </header>

        <main class="dashboard-main">
          <section class="clock-section">
            <h2>Your Break Schedule</h2>
            <div id="clock-container" class="clock-container"></div>
          </section>

          <section class="next-break-section">
            ${this.renderNextBreak(breaks)}
          </section>

          <section class="quick-actions">
            <button class="btn btn-primary" id="start-focus">Start Focus Session</button>
            <button class="btn btn-secondary" id="view-tasks">View Tasks</button>
          </section>

          <section class="breaks-list">
            <h3>Today's Breaks</h3>
            ${this.renderBreaksList(breaks)}
          </section>
        </main>

        <footer class="app-footer">
          <button class="footer-btn" id="settings-btn">Settings</button>
          <button class="footer-btn" id="help-btn">Help</button>
        </footer>
      </div>
    `;

    // Initialize analog clock
    const clockContainer = document.getElementById('clock-container');
    if (clockContainer) {
      if (this.clock) {
        this.clock.destroy();
      }
      this.clock = new AnalogBreakClock(
        clockContainer,
        breaks,
        settings.workingHoursStart,
        settings.workingHoursEnd
      );
    }
  }

  private renderNextBreak(breaks: Break[]): string {
    if (breaks.length === 0) {
      return '<p class="no-breaks">No breaks scheduled for today</p>';
    }

    // Find next break (simple implementation)
    return `
      <div class="next-break-card">
        <h3>Next Break</h3>
        <p class="break-time">in ${breaks[0]?.startTime}</p>
        <p class="break-type">${breaks[0]?.name} • ${breaks[0]?.duration}m</p>
      </div>
    `;
  }

  private renderBreaksList(breaks: Break[]): string {
    if (breaks.length === 0) {
      return '<p>No breaks scheduled</p>';
    }

    return `
      <ul class="breaks-list-items">
        ${breaks
          .map(
            (b, i) => `
          <li class="break-item">
            <span class="break-number">${i + 1}</span>
            <span class="break-info">
              <strong>${b.startTime}</strong>
              ${b.name} • ${b.duration}m
            </span>
            <button class="break-action" data-break-id="${b.id}">Complete</button>
          </li>
        `
          )
          .join('')}
      </ul>
    `;
  }

  private renderOnboarding(): void {
    this.container.innerHTML = `
      <div class="onboarding">
        <header class="onboarding-header">
          <h1>Welcome to BreakLoop</h1>
          <p>Let's set up your workday</p>
        </header>

        <div class="onboarding-form">
          <div class="form-group">
            <label for="work-start">Work Start Time</label>
            <input type="time" id="work-start" value="10:00">
          </div>

          <div class="form-group">
            <label for="work-end">Work End Time</label>
            <input type="time" id="work-end" value="19:00">
          </div>

          <div class="form-group">
            <label for="break-frequency">Break Frequency (minutes)</label>
            <input type="number" id="break-frequency" value="50" min="10" max="180">
          </div>

          <div class="form-group">
            <label for="break-duration">Break Duration (minutes)</label>
            <input type="number" id="break-duration" value="5" min="1" max="60">
          </div>

          <div class="form-group checkbox">
            <input type="checkbox" id="notifications" checked>
            <label for="notifications">Enable notifications</label>
          </div>

          <div class="form-group checkbox">
            <input type="checkbox" id="sound" checked>
            <label for="sound">Enable sound</label>
          </div>

          <button class="btn btn-primary btn-large" id="complete-onboarding">
            Get Started
          </button>
        </div>
      </div>
    `;
  }

  public destroy() {
    if (this.clock) {
      this.clock.destroy();
    }
  }
}
