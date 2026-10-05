export function timeStringToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

export function minutesToTimeString(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function getCurrentTimeInMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export function isWithinWorkingHours(
  currentMinutes: number,
  startMinutes: number,
  endMinutes: number
): boolean {
  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

export function getMinutesSinceMidnight(date: Date = new Date()): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function getSecondsSinceMidnight(date: Date = new Date()): number {
  return (
    date.getHours() * 3600 +
    date.getMinutes() * 60 +
    date.getSeconds()
  );
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
  return new Date().getDay();
}

export function formatDuration(minutes: number): string {
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
