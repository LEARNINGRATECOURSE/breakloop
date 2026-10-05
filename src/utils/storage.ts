import Dexie, { type Table } from 'dexie';
import { BreakSchedule, Task, Settings, BreakLogEntry } from '../state/types';

// Settings are stored as a single row with a fixed primary key
const SETTINGS_KEY = 1;
type SettingsRow = Settings & { id: number };

export class BreakLoopDB extends Dexie {
  schedules!: Table<BreakSchedule, string>;
  tasks!: Table<Task, string>;
  settings!: Table<SettingsRow, number>;
  breakLog!: Table<BreakLogEntry, string>;

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
  darkMode: true,
  onboarded: false,
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
  const { id: _id, ...settings } = row;
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
