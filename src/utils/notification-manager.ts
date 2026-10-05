import { Break, BreakLogEntry, Settings } from '../state/types';
import { minutesToTimestamp, timeStringToMinutes } from './time-calculations';
import {
  playNotificationSound,
  requestNotificationPermission,
  sendNotification,
} from './service-worker';

const LEAD_TIME_MS = 60 * 1000; // notify 1 minute before a break
const GRACE_MS = 5 * 60 * 1000; // don't fire stale reminders (e.g. after the laptop wakes)

/**
 * Fires break reminders. Instead of long setTimeouts (which drift, get throttled
 * in background tabs and break across sleep), `check()` is called from the app's
 * one-second tick and fires any reminder whose time has arrived.
 */
export class NotificationManager {
  private settings: Settings;
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
        dueAt = minutesToTimestamp(timeStringToMinutes(breakItem.startTime)) - LEAD_TIME_MS;
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

  public showBreakNotification(breakItem: Break, snoozed = false) {
    if (!this.settings.notificationsEnabled) {
      return;
    }

    if (this.settings.soundEnabled) {
      playNotificationSound();
    }

    const body = snoozed
      ? `Snooze is over — time for your ${breakItem.duration} minute break.`
      : `${breakItem.duration} minute break at ${breakItem.startTime}`;

    void sendNotification(snoozed ? 'Break time!' : `Time for ${breakItem.name.toLowerCase()} soon!`, {
      body,
      icon: '/icon.svg',
      badge: '/icon.svg',
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
