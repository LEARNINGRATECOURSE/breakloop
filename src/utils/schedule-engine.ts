import { Break, BreakRule, BreakSchedule, Settings } from '../state/types';
import {
  timeStringToMinutes,
  minutesToTimeString,
  getSecondsSinceMidnight,
  formatDuration,
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

export const RULE_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA15E', '#C9ADA7'];

/** The rule a day follows when it has not been customised: the global settings. */
export function legacyRules(settings: Settings): BreakRule[] {
  return [
    {
      id: 'default',
      kind: 'repeated',
      name: '',
      duration: settings.breakDurationMinutes,
      countAsWork: true,
      color: BREAK_COLORS['short'],
      everyMinutes: settings.breakFrequencyMinutes,
    },
  ];
}

export function getEffectiveRules(schedule: BreakSchedule, settings: Settings): BreakRule[] {
  return schedule.rules ?? legacyRules(settings);
}

/** Start times (minutes since midnight) a rule wants, before fit/overlap filtering. */
function ruleStartTimes(rule: BreakRule, start: number, end: number): number[] {
  switch (rule.kind) {
    case 'exact': {
      const t = rule.time ? timeStringToMinutes(rule.time) : NaN;
      return Number.isFinite(t) ? [t] : [];
    }
    case 'count': {
      const n = Math.floor(rule.count ?? 0);
      if (n < 1) return [];
      // n breaks split the day into n + 1 work blocks
      return Array.from({ length: n }, (_, i) =>
        Math.round(start + ((i + 1) * (end - start)) / (n + 1))
      );
    }
    case 'repeated': {
      const every = rule.everyMinutes ?? 0;
      if (!(every > 0)) return [];
      const times: number[] = [];
      for (let t = start + every; t < end; t += every) times.push(t);
      return times;
    }
  }
}

/**
 * Generate the breaks for a day from its rules. Breaks that fall outside the
 * workday, overlap lunch, or overlap an earlier break are dropped.
 */
export function generateBreaksForDay(
  schedule: BreakSchedule | undefined,
  settings: Settings
): Break[] {
  if (!schedule || schedule.isWorkday === false) {
    return [];
  }

  const start = timeStringToMinutes(schedule.startTime);
  const end = timeStringToMinutes(schedule.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return [];
  }

  const lunchStart = schedule.lunchStart ? timeStringToMinutes(schedule.lunchStart) : null;
  const lunchEnd = schedule.lunchEnd ? timeStringToMinutes(schedule.lunchEnd) : null;

  const candidates: Break[] = [];
  for (const rule of getEffectiveRules(schedule, settings)) {
    if (!(rule.duration > 0)) continue;
    for (const t of ruleStartTimes(rule, start, end)) {
      if (t < start || t + rule.duration > end) continue;
      if (lunchStart !== null && lunchEnd !== null && t < lunchEnd && t + rule.duration > lunchStart) {
        continue;
      }
      const startTime = minutesToTimeString(t);
      candidates.push({
        // Stable id so per-break state (completed/skipped) survives re-generation
        id: `break-${rule.id}-${startTime}`,
        name: rule.name.trim() || 'Break',
        startTime,
        duration: rule.duration,
        type: 'short',
        color: rule.color,
        countAsWork: rule.countAsWork,
      });
    }
  }

  candidates.sort((a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime));

  const breaks: Break[] = [];
  let lastEnd = -Infinity;
  for (const b of candidates) {
    const t = timeStringToMinutes(b.startTime);
    if (t < lastEnd) continue;
    breaks.push(b);
    lastEnd = t + b.duration;
  }
  return breaks;
}

/** One-line description of a rule, e.g. "Every 50m · 5m". */
export function describeRule(rule: BreakRule): string {
  const dur = formatDuration(rule.duration);
  switch (rule.kind) {
    case 'exact':
      return `At ${rule.time ?? '--:--'} · ${dur}`;
    case 'count':
      return `${rule.count ?? 0} per day · ${dur} each`;
    case 'repeated':
      return `Every ${formatDuration(rule.everyMinutes ?? 0)} · ${dur}`;
  }
}

/** Minutes of the workday that count as work (breaks flagged otherwise are subtracted). */
export function netWorkMinutes(startTime: string, endTime: string, breaks: Break[]): number {
  const total = timeStringToMinutes(endTime) - timeStringToMinutes(startTime);
  const unpaid = breaks
    .filter((b) => b.countAsWork === false)
    .reduce((sum, b) => sum + b.duration, 0);
  return Math.max(0, total - unpaid);
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
