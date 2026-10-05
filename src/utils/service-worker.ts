export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.log('Service Workers not supported');
    return;
  }

  // The service worker is only built for production. In dev it would 404 and,
  // if a stale one were active, it would serve cached modules over Vite's.
  if (!import.meta.env.PROD) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/service-worker.js', {
      scope: '/',
    });
    console.log('Service Worker registered:', registration.scope);
  } catch (error) {
    console.error('Service Worker registration failed:', error);
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
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

/**
 * Show a notification, preferring the service worker (required on Android,
 * where `new Notification()` throws) and falling back to the page API.
 */
export async function sendNotification(title: string, options?: NotificationOptions) {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      await registration.showNotification(title, options);
      return;
    }
  }

  try {
    const notification = new Notification(title, options);
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch (error) {
    console.error('Failed to show notification:', error);
  }
}

export type SoundType = 'chime' | 'beep' | 'marimba';

export const SOUND_OPTIONS: { value: SoundType; label: string; hint: string }[] = [
  { value: 'chime', label: 'Chime', hint: 'Soft two-note bell' },
  { value: 'beep', label: 'Beep', hint: 'Short classic beep' },
  { value: 'marimba', label: 'Marimba', hint: 'Warm rising notes' },
];

let audioContext: AudioContext | null = null;

interface Note {
  freq: number;
  at: number; // seconds from now
  length: number;
  wave: OscillatorType;
  gain: number;
}

const SOUNDS: Record<SoundType, Note[]> = {
  chime: [
    { freq: 880, at: 0, length: 0.9, wave: 'sine', gain: 0.3 },
    { freq: 1318.5, at: 0.18, length: 1.1, wave: 'sine', gain: 0.22 },
  ],
  beep: [
    { freq: 800, at: 0, length: 0.5, wave: 'sine', gain: 0.3 },
  ],
  marimba: [
    { freq: 523.25, at: 0, length: 0.45, wave: 'triangle', gain: 0.35 },
    { freq: 659.25, at: 0.15, length: 0.45, wave: 'triangle', gain: 0.35 },
    { freq: 783.99, at: 0.3, length: 0.7, wave: 'triangle', gain: 0.35 },
  ],
};

/** Play one of the built-in notification sounds. `volume` is 0-100. */
export function playNotificationSound(type: SoundType = 'chime', volume = 70) {
  // Reuse one AudioContext: browsers cap how many can be open at once.
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;

  try {
    audioContext ??= new AudioCtx();
    const ctx = audioContext;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const master = Math.max(0, Math.min(100, volume)) / 100;
    for (const note of SOUNDS[type] ?? SOUNDS.chime) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = note.wave;
      osc.frequency.value = note.freq;

      const t0 = ctx.currentTime + note.at;
      const peak = Math.max(0.0002, note.gain * master);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + note.length);
      osc.start(t0);
      osc.stop(t0 + note.length + 0.05);
    }
  } catch (error) {
    console.error('Failed to play sound:', error);
  }
}
