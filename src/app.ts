import { Dashboard } from './components/dashboard';
import {
  initializeStorage,
  getSettings,
  updateSettings,
  getScheduleForDay,
  saveSchedule,
} from './utils/storage';
import { generateBreaksForDay } from './utils/schedule-engine';
import { getCurrentDayOfWeek } from './utils/time-calculations';
import { AppState, BreakSchedule } from './state/types';

export class App {
  private appContainer: HTMLElement | null = null;
  private dashboard: Dashboard | null = null;
  private state: AppState = {
    settings: {
      workingHoursStart: '10:00',
      workingHoursEnd: '19:00',
      breakFrequencyMinutes: 50,
      breakDurationMinutes: 5,
      notificationsEnabled: true,
      soundEnabled: true,
      darkMode: true,
      onboarded: false,
    },
    schedules: [],
    tasks: [],
    todayBreaks: [],
    nextBreak: null,
    currentTime: Date.now(),
    isWorkingHours: false,
  };

  async init() {
    this.appContainer = document.getElementById('app');
    if (!this.appContainer) {
      console.error('App container not found');
      return;
    }

    // Initialize storage
    await initializeStorage();

    // Load settings
    this.state.settings = await getSettings();

    // Create default schedule if needed
    await this.ensureDefaultSchedule();

    // Initialize dashboard
    this.dashboard = new Dashboard(this.appContainer);

    // Setup event listeners
    this.setupEventListeners();

    // Render initial state
    await this.updateState();

    // Apply theme
    this.applyTheme();

    // Start update loop
    this.startUpdateLoop();
  }

  private async ensureDefaultSchedule() {
    const dayOfWeek = getCurrentDayOfWeek();
    let schedule = await getScheduleForDay(dayOfWeek);

    if (!schedule) {
      // Create default schedule for this day
      schedule = {
        id: `schedule-${dayOfWeek}`,
        dayOfWeek,
        startTime: this.state.settings.workingHoursStart,
        endTime: this.state.settings.workingHoursEnd,
        breaks: [],
      };
      await saveSchedule(schedule);
    }

    // Generate breaks for today
    const breaks = generateBreaksForDay(schedule, this.state.settings);
    this.state.todayBreaks = breaks;
  }

  private async updateState() {
    const dayOfWeek = getCurrentDayOfWeek();
    const schedule = await getScheduleForDay(dayOfWeek);

    if (schedule) {
      const breaks = generateBreaksForDay(schedule, this.state.settings);
      this.state.todayBreaks = breaks;
    }

    this.state.currentTime = Date.now();

    // Render dashboard
    if (this.dashboard) {
      this.dashboard.render(
        this.state.todayBreaks,
        this.state.settings,
        this.state.settings.onboarded
      );
    }
  }

  private setupEventListeners() {
    if (!this.appContainer) return;

    // Onboarding form
    this.appContainer.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;

      if (target.id === 'complete-onboarding') {
        await this.handleOnboardingComplete();
      }

      if (target.id === 'settings-btn') {
        this.handleSettingsClick();
      }

      if (target.id === 'view-tasks') {
        this.handleViewTasks();
      }

      if (target.id === 'start-focus') {
        this.handleStartFocus();
      }
    });
  }

  private async handleOnboardingComplete() {
    const workStart = (document.getElementById('work-start') as HTMLInputElement)?.value;
    const workEnd = (document.getElementById('work-end') as HTMLInputElement)?.value;
    const breakFreq = parseInt(
      (document.getElementById('break-frequency') as HTMLInputElement)?.value || '50'
    );
    const breakDuration = parseInt(
      (document.getElementById('break-duration') as HTMLInputElement)?.value || '5'
    );
    const notificationsEnabled = (
      document.getElementById('notifications') as HTMLInputElement
    )?.checked;
    const soundEnabled = (document.getElementById('sound') as HTMLInputElement)?.checked;

    // Update settings
    await updateSettings({
      workingHoursStart: workStart,
      workingHoursEnd: workEnd,
      breakFrequencyMinutes: breakFreq,
      breakDurationMinutes: breakDuration,
      notificationsEnabled,
      soundEnabled,
      onboarded: true,
    });

    this.state.settings = await getSettings();

    // Create schedules for all days of week
    for (let day = 0; day < 7; day++) {
      const schedule: BreakSchedule = {
        id: `schedule-${day}`,
        dayOfWeek: day,
        startTime: workStart,
        endTime: workEnd,
        breaks: [],
      };
      await saveSchedule(schedule);
    }

    // Reload
    await this.updateState();
  }

  private handleSettingsClick() {
    console.log('Settings clicked');
    // TODO: Show settings modal
  }

  private handleViewTasks() {
    console.log('View tasks clicked');
    // TODO: Show tasks modal
  }

  private handleStartFocus() {
    console.log('Start focus clicked');
    // TODO: Start focus session
  }

  private applyTheme() {
    const root = document.documentElement;
    if (this.state.settings.darkMode) {
      root.style.setProperty('--bg-primary', '#070908');
      root.style.setProperty('--bg-secondary', '#0d1110');
      root.style.setProperty('--text-primary', '#e9ede6');
      root.style.setProperty('--text-secondary', '#a9b5b2');
      root.style.setProperty('--accent', '#e44b3c');
      root.style.setProperty('--border', 'rgba(233, 237, 230, 0.08)');
    } else {
      root.style.setProperty('--bg-primary', '#ffffff');
      root.style.setProperty('--bg-secondary', '#f5f5f5');
      root.style.setProperty('--text-primary', '#000000');
      root.style.setProperty('--text-secondary', '#666666');
      root.style.setProperty('--accent', '#e44b3c');
      root.style.setProperty('--border', 'rgba(0, 0, 0, 0.08)');
    }
  }

  private startUpdateLoop() {
    // Update every second
    setInterval(() => {
      this.updateState();
    }, 1000);
  }
}
