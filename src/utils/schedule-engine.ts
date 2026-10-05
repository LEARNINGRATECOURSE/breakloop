import { Break, BreakSchedule, Settings } from '../state/types';
import {
  timeStringToMinutes,
  getCurrentTimeInMinutes,
  getCurrentDayOfWeek,
} from './time-calculations';

const BREAK_COLORS: Record<Break['type'], string> = {
  'short': '#FF6B6B',
  'stretch': '#4ECDC4',
  'water': '#45B7D1',
  'walk': '#96CEB4',
  'eye-rest': '#FFEAA7',
  'meal': '#DDA15E',
  'custom': '#C9ADA7',
};

export function generateBreaksForDay(
  schedule: BreakSchedule,
  settings: Settings
): Break[] {
  if (!schedule) {
    return [];
  }

  const breaks: Break[] = [];
  const startMinutes = timeStringToMinutes(schedule.startTime);
  const endMinutes = timeStringToMinutes(schedule.endTime);
  const breakFreq = settings.breakFrequencyMinutes;
  const breakDuration = settings.breakDurationMinutes;

  let currentTime = startMinutes;

  // Skip lunch break if defined
  const lunchStart = schedule.lunchStart
    ? timeStringToMinutes(schedule.lunchStart)
    : null;
  const lunchEnd = schedule.lunchEnd
    ? timeStringToMinutes(schedule.lunchEnd)
    : null;

  while (currentTime + breakDuration <= endMinutes) {
    // Skip if this break falls during lunch
    if (lunchStart && lunchEnd) {
      if (currentTime >= lunchStart && currentTime < lunchEnd) {
        currentTime += breakFreq;
        continue;
      }
    }

    const breakStartMinutes = currentTime;
    const breakEndMinutes = currentTime + breakDuration;

    // Make sure break doesn't extend past end time
    if (breakEndMinutes <= endMinutes) {
      const breakObj: Break = {
        id: `break-${Date.now()}-${Math.random()}`,
        name: `Break`,
        startTime: minutesToTimeString(breakStartMinutes),
        duration: breakDuration,
        type: 'short',
        color: BREAK_COLORS['short'],
      };
      breaks.push(breakObj);
    }

    currentTime += breakFreq;
  }

  return breaks;
}

export function findNextBreak(breaks: Break[]): Break | null {
  const now = getCurrentTimeInMinutes();
  return breaks.find(b => timeStringToMinutes(b.startTime) > now) || null;
}

export function getCurrentBreak(breaks: Break[]): Break | null {
  const now = getCurrentTimeInMinutes();
  return breaks.find(b => {
    const startMin = timeStringToMinutes(b.startTime);
    const endMin = startMin + b.duration;
    return now >= startMin && now < endMin;
  }) || null;
}

export function getBreakAtIndex(breaks: Break[], index: number): Break | null {
  return breaks[index] || null;
}

export function getBreakNumber(breaks: Break[], breakId: string): number {
  return breaks.findIndex(b => b.id === breakId) + 1;
}

function minutesToTimeString(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}
