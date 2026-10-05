export type FocusMode = 'pomodoro' | 'deep' | 'flow';

interface FocusSession {
  mode: FocusMode;
  duration: number; // minutes
  startTime: number; // timestamp
  isRunning: boolean;
  isPaused: boolean;
  pausedAt?: number;
}

export class FocusTimer {
  private container: HTMLElement;
  private session: FocusSession | null = null;
  private animationId: number | null = null;
  private modes: Record<FocusMode, number> = {
    pomodoro: 25,
    deep: 50,
    flow: 90,
  };

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public render() {
    if (!this.session || !this.session.isRunning) {
      this.renderStartScreen();
    } else {
      this.renderActiveSession();
    }
  }

  private renderStartScreen() {
    this.container.innerHTML = `
      <div class="focus-timer">
        <h2>Focus Session</h2>
        <p class="focus-subtitle">Choose a focus mode</p>

        <div class="focus-modes">
          <button class="focus-mode-btn" data-mode="pomodoro">
            <span class="mode-icon">🍅</span>
            <span class="mode-name">Pomodoro</span>
            <span class="mode-duration">25m</span>
          </button>

          <button class="focus-mode-btn" data-mode="deep">
            <span class="mode-icon">🧠</span>
            <span class="mode-name">Deep Work</span>
            <span class="mode-duration">50m</span>
          </button>

          <button class="focus-mode-btn" data-mode="flow">
            <span class="mode-icon">⚡</span>
            <span class="mode-name">Flow State</span>
            <span class="mode-duration">90m</span>
          </button>
        </div>

        <p class="focus-note">Disable notifications during focus session</p>
      </div>
    `;

    this.attachModeButtons();
  }

  private renderActiveSession() {
    if (!this.session) return;

    const elapsed = Date.now() - this.session.startTime;
    const remaining = Math.max(0, this.session.duration * 60 * 1000 - elapsed);
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    const progress = Math.min(100, (elapsed / (this.session.duration * 60 * 1000)) * 100);

    this.container.innerHTML = `
      <div class="focus-timer active">
        <div class="focus-mode-badge">${this.session.mode.toUpperCase()}</div>

        <div class="focus-display">
          <div class="focus-circle" style="--progress: ${progress}%">
            <div class="focus-time">
              ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}
            </div>
          </div>
        </div>

        <div class="focus-controls">
          <button id="pause-btn" class="btn btn-secondary">
            ${this.session.isPaused ? 'Resume' : 'Pause'}
          </button>
          <button id="stop-btn" class="btn btn-danger">Stop</button>
        </div>

        <div class="focus-tips">
          <p>💡 Tip: Take a break after your session</p>
        </div>
      </div>
    `;

    this.attachControlButtons();
    this.animationId = requestAnimationFrame(() => this.render());
  }

  private attachModeButtons() {
    const modeButtons = this.container.querySelectorAll('.focus-mode-btn');
    modeButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const mode = (e.currentTarget as HTMLElement).dataset.mode as FocusMode;
        this.startSession(mode);
      });
    });
  }

  private attachControlButtons() {
    const pauseBtn = this.container.getElementById('pause-btn');
    const stopBtn = this.container.getElementById('stop-btn');

    pauseBtn?.addEventListener('click', () => this.togglePause());
    stopBtn?.addEventListener('click', () => this.stopSession());
  }

  private startSession(mode: FocusMode) {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }

    this.session = {
      mode,
      duration: this.modes[mode],
      startTime: Date.now(),
      isRunning: true,
      isPaused: false,
    };

    this.render();
  }

  private togglePause() {
    if (!this.session) return;

    if (this.session.isPaused && this.session.pausedAt) {
      // Resume
      const pausedDuration = Date.now() - this.session.pausedAt;
      this.session.startTime += pausedDuration;
      this.session.isPaused = false;
    } else {
      // Pause
      this.session.pausedAt = Date.now();
      this.session.isPaused = true;
    }

    this.render();
  }

  private stopSession() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }

    if (this.session) {
      const totalTime = this.session.duration;
      const elapsed = Date.now() - this.session.startTime;
      const focusedMinutes = Math.floor(elapsed / 60000);
      alert(`Great work! You focused for ${focusedMinutes} minutes.`);
    }

    this.session = null;
    this.render();
  }

  public destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }
}
