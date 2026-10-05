export type TimeFormat = '12h' | '24h';

interface TimeConfig {
  timeZone: string | undefined; // IANA name; undefined = device time zone
  format: TimeFormat;
}

const config: TimeConfig = { timeZone: undefined, format: '24h' };

export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function getDeviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** Apply the user's time zone ('auto' = device) and 12/24 hour preference. */
export function setTimeConfig(timeZone: string, format: TimeFormat) {
  config.timeZone = timeZone !== 'auto' && isValidTimeZone(timeZone) ? timeZone : undefined;
  config.format = format;
}

export function getTimeFormat(): TimeFormat {
  return config.format;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const formatterCache = new Map<string, Intl.DateTimeFormat>();

/** Wall-clock parts of `date` in the active time zone. */
function zonedParts(date: Date): ZonedParts {
  const key = config.timeZone ?? '';
  let fmt = formatterCache.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: config.timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      weekday: 'short',
    });
    formatterCache.set(key, fmt);
  }
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) p[part.type] = part.value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: WEEKDAYS.indexOf(p.weekday),
  };
}

/** "HH:mm" (24h storage format) -> "10:00" or "10:00 AM" per the user's preference. */
export function formatTimeOfDay(time: string): string {
  const total = timeStringToMinutes(time);
  if (!Number.isFinite(total)) return time;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  if (config.format === '24h') {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Hour number for clock-face labels: 0-23, or 1-12 in 12 hour mode. */
export function formatHourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  return config.format === '24h' ? String(h) : String(h % 12 === 0 ? 12 : h % 12);
}

/** Current time in the active zone, formatted for display, e.g. "3:42 PM". */
export function formatNow(date: Date = new Date()): string {
  const p = zonedParts(date);
  return formatTimeOfDay(`${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`);
}

export function timeStringToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

export function minutesToTimeString(minutes: number): string {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function getCurrentTimeInMinutes(): number {
  const p = zonedParts(new Date());
  return p.hour * 60 + p.minute;
}

export function isWithinWorkingHours(
  currentMinutes: number,
  startMinutes: number,
  endMinutes: number
): boolean {
  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

export function getMinutesSinceMidnight(date: Date = new Date()): number {
  const p = zonedParts(date);
  return p.hour * 60 + p.minute;
}

export function getSecondsSinceMidnight(date: Date = new Date()): number {
  const p = zonedParts(date);
  return p.hour * 3600 + p.minute * 60 + p.second;
}

export function getMinutesUntil(targetMinutes: number): number {
  const now = getCurrentTimeInMinutes();
  if (targetMinutes > now) {
    return targetMinutes - now;
  }
  // If target is earlier today, it must be tomorrow
  return 24 * 60 - now + targetMinutes;
}

export function getSecondsSinceStart(startMinutes: number): number {
  const now = getSecondsSinceMidnight();
  const startSeconds = startMinutes * 60;
  if (now >= startSeconds) {
    return now - startSeconds;
  }
  return 0;
}

export function getCurrentDayOfWeek(): number {
  return zonedParts(new Date()).weekday;
}

/** Day of week (0 = Sunday) of `date` in the active time zone. */
export function getDayOfWeek(date: Date): number {
  return zonedParts(date).weekday;
}

// Calendar date in the active time zone as "YYYY-MM-DD"
export function getLocalDateKey(date: Date = new Date()): string {
  const p = zonedParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

// Timestamp for a "minutes since midnight" value on the same day (in the active zone) as `date`
export function minutesToTimestamp(minutes: number, date: Date = new Date()): number {
  const p = zonedParts(date);
  const midnight = date.getTime() - (p.hour * 3600 + p.minute * 60 + p.second) * 1000 - date.getMilliseconds();
  return midnight + minutes * 60 * 1000;
}

export function isValidTimeString(timeStr: string | undefined | null): timeStr is string {
  return typeof timeStr === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(timeStr);
}

export function formatDuration(minutes: number): string {
  minutes = Math.max(0, Math.round(minutes));
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
}

export function formatTime(minutes: number): string {
  return minutesToTimeString(minutes);
}

export function angleTo(minutes: number, startMinutes: number, endMinutes: number): number {
  const totalMinutes = endMinutes - startMinutes;
  const relativeMinutes = minutes - startMinutes;
  return (relativeMinutes / totalMinutes) * 360;
}

export function arcAngle(durationMinutes: number, totalMinutes: number): number {
  return (durationMinutes / totalMinutes) * 360;
}
