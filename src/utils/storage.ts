import Dexie, { Table } from 'dexie';
import { BreakSchedule, Task, Settings } from '../state/types';

export class BreakLoopDB extends Dexie {
  schedules!: Table<BreakSchedule>;
  tasks!: Table<Task>;
  settings!: Table<Settings>;

  constructor() {
    super('BreakLoopDB');
    this.version(1).stores({
      schedules: 'id, dayOfWeek',
      tasks: 'id, dueDate, priority',
      settings: 'id',
    });
  }
}

export const db = new BreakLoopDB();

// Default settings
const DEFAULT_SETTINGS: Settings = {
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
  // Check if settings exist
  const existing = await db.settings.toArray();
  if (existing.length === 0) {
    await db.settings.add(DEFAULT_SETTINGS);
  }
}

export async function getSettings(): Promise<Settings> {
  const settings = await db.settings.toArray();
  return settings[0] || DEFAULT_SETTINGS;
}

export async function updateSettings(updates: Partial<Settings>) {
  const current = await getSettings();
  await db.settings.update(1, { ...current, ...updates });
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
  const task = await db.tasks.get(id);
  if (task) {
    await db.tasks.update(id, updates);
  }
}
