export type FocusMode = 'pomodoro' | 'deep' | 'flow';

interface FocusSession {
  mode: FocusMode;
  duration: number; // minutes
  startTime: number; // timestamp (shifted forward by time spent paused)
  isPaused: boolean;
  pausedAt?: number;
}

interface SessionSummary {
  mode: FocusMode;
  focusedMinutes: number;
  completed: boolean;
}

const MODE_LABELS: Record<FocusMode, string> = {
  pomodoro: 'Pomodoro',
  deep: 'Deep Work',
  flow: 'Flow State',
};

export class FocusTimer {
  private container: HTMLElement | null = null;
  private session: FocusSession | null = null;
  private summary: SessionSummary | null = null;
  private timerId: number | null = null;
  private onComplete: ((mode: FocusMode) => void) | null = null;
  private modes: Record<FocusMode, number> = {
    pomodoro: 25,
    deep: 50,
    flow: 90,
  };

  constructor(container?: HTMLElement) {
    if (container) {
      this.mount(container);
    }
  }

  /** Attach to a container. The session keeps running when the view is closed. */
  public mount(container: HTMLElement) {
    this.container = container;
    container.addEventListener('click', this.handleClick);
    this.render();
  }

  public unmount() {
    this.container?.removeEventListener('click', this.handleClick);
    this.container = null;
  }

  public setOnComplete(callback: (mode: FocusMode) => void) {
    this.onComplete = callback;
  }

  public isRunning(): boolean {
    return this.session !== null;
  }

  /** "MM:SS" remaining, or null when no session is active. */
  public getRemainingLabel(): string | null {
    if (!this.session) return null;
    const label = this.formatRemaining(this.getRemainingMs());
    return this.session.isPaused ? `${label} (paused)` : label;
  }

  public render() {
    if (!this.container) return;
    if (this.session) {
      this.renderActiveSession();
    } else if (this.summary) {
      this.renderSummary();
    } else {
      this.renderStartScreen();
    }
  }

  private handleClick = (e: Event) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-focus-action]');
    if (!target) return;

    switch (target.dataset.focusAction) {
      case 'start':
        this.startSession(target.dataset.mode as FocusMode);
        break;
      case 'pause':
        this.togglePause();
        break;
      case 'stop':
        this.stopSession(false);
        break;
      case 'new':
        this.summary = null;
        this.render();
        break;
    }
  };

  private renderStartScreen() {
    this.container!.innerHTML = `
      <div class="focus-timer">
        <h2>Focus Session</h2>
        <p class="focus-subtitle">Choose a focus mode</p>

        <div class="focus-modes">
          <button class="focus-mode-btn" data-focus-action="start" data-mode="pomodoro">
            <span class="mode-icon" aria-hidden="true">🍅</span>
            <span class="mode-name">Pomodoro</span>
            <span class="mode-duration">25m</span>
          </button>

          <button class="focus-mode-btn" data-focus-action="start" data-mode="deep">
            <span class="mode-icon" aria-hidden="true">🧠</span>
            <span class="mode-name">Deep Work</span>
            <span class="mode-duration">50m</span>
          </button>

          <button class="focus-mode-btn" data-focus-action="start" data-mode="flow">
            <span class="mode-icon" aria-hidden="true">⚡</span>
            <span class="mode-name">Flow State</span>
            <span class="mode-duration">90m</span>
          </button>
        </div>

        <p class="focus-note">You'll get a reminder when the session ends.</p>
      </div>
    `;
  }

  private renderActiveSession() {
    if (!this.session) return;

    // Build the structure once; updateDisplay() only patches text and progress,
    // so the Pause/Stop buttons stay the same elements and remain clickable.
    this.container!.innerHTML = `
      <div class="focus-timer active">
        <div class="focus-mode-badge">${MODE_LABELS[this.session.mode]}</div>

        <div class="focus-display">
          <div class="focus-circle">
            <div class="focus-time" role="timer" aria-live="off"></div>
          </div>
        </div>

        <div class="focus-controls">
          <button class="btn btn-secondary" data-focus-action="pause">
            ${this.session.isPaused ? 'Resume' : 'Pause'}
          </button>
          <button class="btn btn-danger" data-focus-action="stop">Stop</button>
        </div>

        <div class="focus-tips">
          <p>💡 Tip: Take a break after your session</p>
        </div>
      </div>
    `;

    this.updateDisplay();
  }

  private renderSummary() {
    if (!this.summary) return;
    const { mode, focusedMinutes, completed } = this.summary;

    this.container!.innerHTML = `
      <div class="focus-timer">
        <h2>${completed ? 'Session complete!' : 'Session stopped'}</h2>
        <p class="focus-subtitle">
          Great work! You focused for ${focusedMinutes} minute${focusedMinutes === 1 ? '' : 's'}
          in ${MODE_LABELS[mode]} mode.
        </p>
        <p class="focus-note">Time to stretch, drink some water and rest your eyes.</p>
        <div class="focus-controls">
          <button class="btn btn-primary" data-focus-action="new">New Session</button>
        </div>
      </div>
    `;
  }

  private getElapsedMs(): number {
    if (!this.session) return 0;
    const now = this.session.isPaused && this.session.pausedAt ? this.session.pausedAt : Date.now();
    return Math.max(0, now - this.session.startTime);
  }

  private getRemainingMs(): number {
    if (!this.session) return 0;
    return Math.max(0, this.session.duration * 60 * 1000 - this.getElapsedMs());
  }

  private formatRemaining(ms: number): string {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  private updateDisplay() {
    if (!this.session) return;

    const totalMs = this.session.duration * 60 * 1000;
    const progress = Math.min(100, (this.getElapsedMs() / totalMs) * 100);

    if (this.container) {
      const circle = this.container.querySelector<HTMLElement>('.focus-circle');
      const time = this.container.querySelector<HTMLElement>('.focus-time');
      // Unitless so the CSS can do calc(var(--progress) * 3.6deg)
      circle?.style.setProperty('--progress', progress.toFixed(2));
      if (time) time.textContent = this.formatRemaining(this.getRemainingMs());
    }

    if (this.getRemainingMs() <= 0) {
      this.stopSession(true);
    }
  }

  private startTicking() {
    this.stopTicking();
    this.timerId = window.setInterval(() => this.updateDisplay(), 250);
  }

  private stopTicking() {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private startSession(mode: FocusMode) {
    if (!(mode in this.modes)) return;

    this.summary = null;
    this.session = {
      mode,
      duration: this.modes[mode],
      startTime: Date.now(),
      isPaused: false,
    };

    this.startTicking();
    this.render();
  }

  private togglePause() {
    if (!this.session) return;

    if (this.session.isPaused && this.session.pausedAt) {
      // Resume: shift the start forward by the paused duration
      const pausedDuration = Date.now() - this.session.pausedAt;
      this.session.startTime += pausedDuration;
      this.session.isPaused = false;
      this.session.pausedAt = undefined;
    } else {
      this.session.pausedAt = Date.now();
      this.session.isPaused = true;
    }

    this.render();
  }

  private stopSession(completed: boolean) {
    this.stopTicking();

    if (this.session) {
      const mode = this.session.mode;
      this.summary = {
        mode,
        focusedMinutes: Math.floor(this.getElapsedMs() / 60000),
        completed,
      };
      this.session = null;
      if (completed) {
        this.onComplete?.(mode);
      }
    }

    this.render();
  }

  public destroy() {
    this.stopTicking();
    this.unmount();
  }
}
