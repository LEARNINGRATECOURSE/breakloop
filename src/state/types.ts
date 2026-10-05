export interface Break {
  id: string;
  name: string;
  startTime: string; // "HH:mm" format
  duration: number; // minutes
  type: 'short' | 'stretch' | 'water' | 'walk' | 'eye-rest' | 'meal' | 'custom';
  color: string; // hex color
  countAsWork?: boolean; // true (default): break time still counts towards work time
  completed?: boolean;
  snoozedUntil?: number; // timestamp
}

/**
 * How a break rule produces breaks for a day:
 * - exact: one break at `time`
 * - count: `count` breaks spread evenly across the workday
 * - repeated: a break every `everyMinutes` after the start of the workday
 */
export type BreakRuleKind = 'exact' | 'count' | 'repeated';

export interface BreakRule {
  id: string;
  kind: BreakRuleKind;
  name: string; // may be empty
  duration: number; // minutes
  countAsWork: boolean;
  color: string; // hex color
  time?: string; // "HH:mm", kind === 'exact'
  count?: number; // kind === 'count'
  everyMinutes?: number; // kind === 'repeated'
}

export interface BreakSchedule {
  id: string;
  dayOfWeek: number; // 0-6, Sunday to Saturday
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  lunchStart?: string;
  lunchEnd?: string;
  breaks: Break[];
  isWorkday?: boolean; // default true
  /**
   * Break rules for this day. When undefined the day follows the global
   * settings (one repeated rule from breakFrequencyMinutes/breakDurationMinutes).
   */
  rules?: BreakRule[];
  /** Set once the day was edited in the weekly schedule; global hours no longer overwrite it. */
  customized?: boolean;
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
  scheduledDate?: string; // "YYYY-MM-DD" the task is planned for
  scheduledTime?: string; // "HH:mm" start time on that day
  createdAt: number; // timestamp
}

export type ThemeMode = 'system' | 'light' | 'dark';
export type AccentColor = 'red' | 'orange' | 'green' | 'teal' | 'blue' | 'purple';

export interface Settings {
  workingHoursStart: string; // "HH:mm"
  workingHoursEnd: string; // "HH:mm"
  breakFrequencyMinutes: number;
  breakDurationMinutes: number;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  soundType: 'chime' | 'beep' | 'marimba';
  soundVolume: number; // 0-100
  theme: ThemeMode;
  accent: AccentColor;
  timeFormat: '12h' | '24h';
  timeZone: string; // 'auto' (device) or an IANA name like "Europe/Paris"
  reminderLeadMinutes: number; // notify this long before a break (0 = at start)
  snoozeMinutes: number;
  onboarded: boolean;
}

export type BreakStatus = 'completed' | 'skipped' | 'snoozed';

export interface BreakLogEntry {
  id: string; // `${date}|${breakId}`
  date: string; // "YYYY-MM-DD" (local)
  breakId: string;
  status: BreakStatus;
  snoozedUntil?: number; // timestamp, when status is 'snoozed'
}

export type FocusModeId = 'pomodoro' | 'deep' | 'flow';

export interface FocusLogEntry {
  id: string;
  date: string; // "YYYY-MM-DD" (local) the session started on
  mode: FocusModeId;
  startedAt: number; // timestamp
  endedAt: number; // timestamp
  completed: boolean; // false when stopped early
}

export interface AppState {
  settings: Settings;
  schedules: BreakSchedule[];
  tasks: Task[];
  todayBreaks: Break[];
  breakLog: Record<string, BreakLogEntry>; // keyed by breakId, today only
  focusLog: FocusLogEntry[]; // today's focus sessions
  today: string; // "YYYY-MM-DD" (local)
}
