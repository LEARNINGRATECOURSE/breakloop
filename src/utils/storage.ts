import Dexie, { type Table } from 'dexie';
import { BreakSchedule, Task, Settings, BreakLogEntry, FocusLogEntry } from '../state/types';

// Settings are stored as a single row with a fixed primary key
const SETTINGS_KEY = 1;
type SettingsRow = Settings & { id: number };

export class BreakLoopDB extends Dexie {
  schedules!: Table<BreakSchedule, string>;
  tasks!: Table<Task, string>;
  settings!: Table<SettingsRow, number>;
  breakLog!: Table<BreakLogEntry, string>;
  focusLog!: Table<FocusLogEntry, string>;

  constructor() {
    super('BreakLoopDB');
    this.version(1).stores({
      schedules: 'id, dayOfWeek',
      tasks: 'id, dueDate, priority',
      settings: 'id',
    });
    this.version(2).stores({
      breakLog: 'id, date',
    });
    this.version(3).stores({
      focusLog: 'id, date',
    });
  }
}

export const db = new BreakLoopDB();

// Default settings
export const DEFAULT_SETTINGS: Settings = {
  workingHoursStart: '10:00',
  workingHoursEnd: '19:00',
  breakFrequencyMinutes: 50,
  breakDurationMinutes: 5,
  notificationsEnabled: true,
  soundEnabled: true,
  backgroundReminders: false,
  soundType: 'chime',
  soundVolume: 70,
  theme: 'dark',
  accent: 'red',
  timeFormat: '24h',
  timeZone: 'auto',
  reminderLeadMinutes: 1,
  snoozeMinutes: 5,
  onboarded: true,
};

export async function initializeStorage() {
  const existing = await db.settings.get(SETTINGS_KEY);
  if (!existing) {
    await db.settings.put({ ...DEFAULT_SETTINGS, id: SETTINGS_KEY });
  }
}

export async function getSettings(): Promise<Settings> {
  const row = await db.settings.get(SETTINGS_KEY);
  if (!row) {
    return { ...DEFAULT_SETTINGS };
  }
  const { id: _id, ...stored } = row;
  const { darkMode, ...settings } = stored as Partial<Settings> & { darkMode?: boolean };
  // Older versions only had a dark mode switch
  if (settings.theme === undefined && darkMode !== undefined) {
    settings.theme = darkMode ? 'dark' : 'light';
  }
  return { ...DEFAULT_SETTINGS, ...settings };
}

export async function updateSettings(updates: Partial<Settings>) {
  const current = await getSettings();
  await db.settings.put({ ...current, ...updates, id: SETTINGS_KEY });
}

export async function getSchedules(): Promise<BreakSchedule[]> {
  return db.schedules.toArray();
}

export async function getScheduleForDay(dayOfWeek: number): Promise<BreakSchedule | undefined> {
  return db.schedules.where('dayOfWeek').equals(dayOfWeek).first();
}

export async function saveSchedule(schedule: BreakSchedule) {
  await db.schedules.put(schedule);
}

export async function getTasks(): Promise<Task[]> {
  return db.tasks.toArray();
}

export async function saveTask(task: Task) {
  await db.tasks.put(task);
}

export async function deleteTask(id: string) {
  await db.tasks.delete(id);
}

export async function updateTask(id: string, updates: Partial<Task>) {
  await db.tasks.update(id, updates);
}

export async function getBreakLogForDate(date: string): Promise<BreakLogEntry[]> {
  return db.breakLog.where('date').equals(date).toArray();
}

export async function saveBreakLogEntry(entry: BreakLogEntry) {
  await db.breakLog.put(entry);
}

export async function deleteBreakLogEntry(id: string) {
  await db.breakLog.delete(id);
}

/** Everything BreakLoop stores, as a plain object (for the "Export my data" button). */
export async function exportAllData() {
  return {
    app: 'BreakLoop',
    exportedAt: new Date().toISOString(),
    settings: await getSettings(),
    schedules: await db.schedules.toArray(),
    tasks: await db.tasks.toArray(),
    breakLog: await db.breakLog.toArray(),
    focusLog: await db.focusLog.toArray(),
  };
}

export async function resetAllData() {
  await Promise.all([db.schedules.clear(), db.tasks.clear(), db.settings.clear(), db.breakLog.clear(), db.focusLog.clear()]);
}

export async function getFocusLogForDate(date: string): Promise<FocusLogEntry[]> {
  return db.focusLog.where('date').equals(date).toArray();
}

export async function saveFocusLogEntry(entry: FocusLogEntry) {
  await db.focusLog.put(entry);
}
