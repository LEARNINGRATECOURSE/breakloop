import { Break, Settings } from '../state/types';
import { playNotificationSound } from './service-worker';

export class NotificationManager {
  private settings: Settings;
  private scheduledNotifications: Map<string, number> = new Map();

  constructor(settings: Settings) {
    this.settings = settings;
  }

  public updateSettings(settings: Settings) {
    this.settings = settings;
  }

  public scheduleBreakNotification(breakItem: Break) {
    if (!this.settings.notificationsEnabled) {
      return;
    }

    // Parse break time
    const [hours, minutes] = breakItem.startTime.split(':').map(Number);
    const breakTimeMs =
      (hours * 60 + minutes) * 60 * 1000 - Date.now() % (24 * 60 * 60 * 1000);

    if (breakTimeMs > 0) {
      const timeoutId = window.setTimeout(() => {
        this.showBreakNotification(breakItem);
      }, breakTimeMs - 60000); // 1 minute before

      this.scheduledNotifications.set(breakItem.id, timeoutId);
    }
  }

  public showBreakNotification(breakItem: Break) {
    if (!this.settings.notificationsEnabled) {
      return;
    }

    // Play sound
    if (this.settings.soundEnabled) {
      playNotificationSound();
    }

    // Show notification
    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification(`Time for ${breakItem.name}!`, {
        body: `${breakItem.duration} minute break at ${breakItem.startTime}`,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: `break-${breakItem.id}`,
        requireInteraction: true,
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    }
  }

  public cancelNotification(breakId: string) {
    const timeoutId = this.scheduledNotifications.get(breakId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.scheduledNotifications.delete(breakId);
    }
  }

  public cancelAll() {
    this.scheduledNotifications.forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    this.scheduledNotifications.clear();
  }

  public static async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.log('Notifications not supported');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  }
}
