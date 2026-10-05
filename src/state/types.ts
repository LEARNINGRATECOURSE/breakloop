export interface Break {
  id: string;
  name: string;
  startTime: string; // "HH:mm" format
  duration: number; // minutes
  type: 'short' | 'stretch' | 'water' | 'walk' | 'eye-rest' | 'meal' | 'custom';
  color: string; // hex color
  completed?: boolean;
  snoozedUntil?: number; // timestamp
}

export interface BreakSchedule {
  id: string;
  dayOfWeek: number; // 0-6, Sunday to Saturday
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  lunchStart?: string;
  lunchEnd?: string;
  breaks: Break[];
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  category: string;
  duration?: number; // minutes
  dueDate?: string; // ISO format
  createdAt: number; // timestamp
}

export interface Settings {
  workingHoursStart: string; // "HH:mm"
  workingHoursEnd: string; // "HH:mm"
  breakFrequencyMinutes: number;
  breakDurationMinutes: number;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  darkMode: boolean;
  onboarded: boolean;
}

export interface AppState {
  settings: Settings;
  schedules: BreakSchedule[];
  tasks: Task[];
  todayBreaks: Break[];
  nextBreak: Break | null;
  currentTime: number; // timestamp
  isWorkingHours: boolean;
}
