import { Break, BreakLogEntry, Settings } from '../state/types';
import { formatTimeOfDay, minutesToTimestamp, timeStringToMinutes } from './time-calculations';
import {
  playNotificationSound,
  requestNotificationPermission,
  sendNotification,
} from './service-worker';

const GRACE_MS = 5 * 60 * 1000; // don't fire stale reminders (e.g. after the laptop wakes)

/**
 * Fires break reminders. Instead of long setTimeouts (which drift, get throttled
 * in background tabs and break across sleep), `check()` is called from the app's
 * one-second tick and fires any reminder whose time has arrived.
 */
export class NotificationManager {
  private settings: Settings;
  private onReminder: ((breakItem: Break, snoozed: boolean) => void) | null = null;
  // Keys of reminders already fired, e.g. "2026-10-05|break-10:50|0"
  private fired: Set<string> = new Set();

  constructor(settings: Settings) {
    this.settings = settings;
  }

  public updateSettings(settings: Settings) {
    this.settings = settings;
  }

  public check(
    breaks: Break[],
    log: Record<string, BreakLogEntry>,
    today: string,
    now: number = Date.now()
  ) {
    for (const breakItem of breaks) {
      const entry = log[breakItem.id];
      if (entry && entry.status !== 'snoozed') {
        continue; // completed or skipped
      }

      let dueAt: number;
      let key: string;
      if (entry?.status === 'snoozed' && entry.snoozedUntil) {
        dueAt = entry.snoozedUntil;
        key = `${today}|${breakItem.id}|${entry.snoozedUntil}`;
      } else {
        dueAt = minutesToTimestamp(timeStringToMinutes(breakItem.startTime)) -
          this.settings.reminderLeadMinutes * 60 * 1000;
        key = `${today}|${breakItem.id}|0`;
      }

      if (now >= dueAt && !this.fired.has(key)) {
        this.fired.add(key);
        if (now - dueAt <= GRACE_MS) {
          this.showBreakNotification(breakItem, entry?.status === 'snoozed');
        }
      }
    }
  }

  /** Called for each reminder so the app can show an in-page pop-up. */
  public setOnReminder(callback: (breakItem: Break, snoozed: boolean) => void) {
    this.onReminder = callback;
  }

  public showBreakNotification(breakItem: Break, snoozed = false) {
    if (!this.settings.notificationsEnabled) {
      return;
    }

    if (this.settings.soundEnabled) {
      playNotificationSound(this.settings.soundType, this.settings.soundVolume);
    }

    // Visible page: in-app pop-up. Hidden page: system notification.
    if (!document.hidden) {
      this.onReminder?.(breakItem, snoozed);
      return;
    }

    void sendNotification(snoozed ? 'Break time!' : `Time for ${breakItem.name.toLowerCase()} soon!`, {
      body: describeReminder(breakItem, snoozed, this.settings.reminderLeadMinutes),
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: `break-${breakItem.id}`,
      requireInteraction: true,
    });
  }

  public reset() {
    this.fired.clear();
  }

  public static requestPermission(): Promise<boolean> {
    return requestNotificationPermission();
  }
}

/** Body text shared by the pop-up and the system notification. */
export function describeReminder(breakItem: Break, snoozed: boolean, leadMinutes: number): string {
  if (snoozed) return `Snooze is over — time for your ${breakItem.duration} minute break.`;
  const when =
    leadMinutes > 0
      ? `starts in ${leadMinutes} minute${leadMinutes === 1 ? '' : 's'}`
      : `starts at ${formatTimeOfDay(breakItem.startTime)}`;
  return `${breakItem.name} ${when} · ${breakItem.duration} min`;
}
