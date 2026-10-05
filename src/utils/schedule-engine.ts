import { Break, BreakSchedule, Settings } from '../state/types';
import {
  timeStringToMinutes,
  minutesToTimeString,
  getSecondsSinceMidnight,
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

/**
 * Generate breaks for a working day. A break starts every `breakFrequencyMinutes`
 * after the start of the workday (the first one after the first work block, not
 * at the very start). Breaks that overlap lunch or run past the end are dropped.
 */
export function generateBreaksForDay(
  schedule: BreakSchedule | undefined,
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

  if (
    !Number.isFinite(startMinutes) ||
    !Number.isFinite(endMinutes) ||
    endMinutes <= startMinutes ||
    !(breakFreq > 0) ||
    !(breakDuration > 0)
  ) {
    return [];
  }

  const lunchStart = schedule.lunchStart ? timeStringToMinutes(schedule.lunchStart) : null;
  const lunchEnd = schedule.lunchEnd ? timeStringToMinutes(schedule.lunchEnd) : null;

  for (
    let breakStart = startMinutes + breakFreq;
    breakStart + breakDuration <= endMinutes;
    breakStart += breakFreq
  ) {
    const breakEnd = breakStart + breakDuration;

    // Skip breaks that overlap lunch
    if (lunchStart !== null && lunchEnd !== null) {
      if (breakStart < lunchEnd && breakEnd > lunchStart) {
        continue;
      }
    }

    const startTime = minutesToTimeString(breakStart);
    breaks.push({
      // Stable id so per-break state (completed/skipped) survives re-generation
      id: `break-${startTime}`,
      name: 'Break',
      startTime,
      duration: breakDuration,
      type: 'short',
      color: BREAK_COLORS['short'],
    });
  }

  return breaks;
}

function nowInMinutes(): number {
  return getSecondsSinceMidnight() / 60;
}

export function findNextBreak(breaks: Break[]): Break | null {
  const now = nowInMinutes();
  return breaks.find(b => timeStringToMinutes(b.startTime) > now) || null;
}

export function getCurrentBreak(breaks: Break[]): Break | null {
  const now = nowInMinutes();
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
