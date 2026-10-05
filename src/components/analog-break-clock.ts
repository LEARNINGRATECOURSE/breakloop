import { Break, BreakLogEntry } from '../state/types';
import {
  timeStringToMinutes,
  minutesToTimeString,
  getSecondsSinceMidnight,
  angleTo,
  formatNow,
  formatTimeOfDay,
  formatHourLabel,
  getTimeFormat,
  getMinutesSinceMidnight,
} from '../utils/time-calculations';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SIZE = 360; // viewBox size; leaves room for break labels outside the rim
const CX = SIZE / 2;
const CY = SIZE / 2;
const NOON = 12 * 60;

const RIM = 150; // outer hairline ring + hour ticks
const TRACK = 136; // ring the breaks are drawn on
const LABELS = 116; // hour numbers
const HAND_INNER = 74; // the hand stops short of the centre so the text stays readable

/** Text shown in the middle of the clock (next break, countdown, ...). */
export interface ClockCenter {
  eyebrow: string; // small caps line, e.g. "NEXT BREAK"
  headline: string; // large line, e.g. "in 9h 38m"
  detail: string; // small line, e.g. "Break 1 · 10:40 AM · 5m"
}

/** A focus session to draw on the dial. `endedAt` is null while it is still running. */
export interface ClockFocus {
  startedAt: number;
  endedAt: number | null;
  completed: boolean;
}

/** A task planned for a time of day. */
export interface ClockTask {
  title: string;
  time: string; // "HH:mm"
  done: boolean;
}

const FOCUS_RADIUS = 125; // focus sessions sit just inside the breaks
const TASK_RADIUS = 98; // task markers sit inside the hour numbers

/** Everything is drawn in the accent colour so the clock follows the chosen theme. */
const ACCENT = 'var(--accent)';

export class AnalogBreakClock {
  private container: HTMLElement;
  private svg: SVGSVGElement;
  private timerId: number | null = null;
  private breaks: Break[] = [];
  private log: Record<string, BreakLogEntry> = {};
  private startMinutes: number;
  private endMinutes: number;
  private center: ClockCenter | null = null;
  private focus: ClockFocus[] = [];
  private tasks: ClockTask[] = [];

  constructor(
    container: HTMLElement,
    breaks: Break[],
    startTime: string,
    endTime: string,
    log: Record<string, BreakLogEntry> = {}
  ) {
    this.container = container;
    this.breaks = breaks;
    this.log = log;
    this.startMinutes = timeStringToMinutes(startTime);
    this.endMinutes = timeStringToMinutes(endTime);
    this.svg = this.createSvg();
    this.render();
    this.startTicking();
  }

  private createSvg(): SVGSVGElement {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
    svg.setAttribute('class', 'analog-clock');
    svg.setAttribute('role', 'img');
    this.container.innerHTML = '';
    this.container.appendChild(svg);
    return svg;
  }

  private get totalMinutes(): number {
    return this.endMinutes - this.startMinutes;
  }

  private get twelveHour(): boolean {
    return getTimeFormat() === '12h';
  }

  private render() {
    this.svg.replaceChildren();

    if (!(this.totalMinutes > 0)) {
      this.text(CX, CY, 'Invalid working hours', { size: 14, fill: 'var(--text-secondary)' });
      return;
    }

    this.svg.appendChild(this.ring(RIM, 'clock-rim'));
    this.drawTrack();
    this.drawHourMarkers();
    this.breaks.forEach((b, i) => this.drawBreak(b, i));
    this.drawFocusSessions();
    this.drawTasks();
    this.drawTimeHand();
    this.drawCenter();

    this.svg.setAttribute('aria-label', this.describe());
  }

  private describe(): string {
    const start = formatTimeOfDay(minutesToTimeString(this.startMinutes));
    const end = formatTimeOfDay(minutesToTimeString(this.endMinutes));
    const times = this.breaks.map((b) => formatTimeOfDay(b.startTime)).join(', ');
    const c = this.center;
    return (
      `Break schedule clock for working hours ${start} to ${end}. Current time ${formatNow()}. ` +
      (c ? `${c.eyebrow} ${c.headline} ${c.detail}. ` : '') +
      (this.breaks.length ? `${this.breaks.length} breaks at ${times}.` : 'No breaks scheduled.')
    );
  }

  private polar(angle: number, r: number): { x: number; y: number } {
    const rad = (angle - 90) * (Math.PI / 180);
    return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
  }

  private angle(minutes: number): number {
    return angleTo(minutes, this.startMinutes, this.endMinutes);
  }

  /** Thin ring the breaks sit on. In 12 hour mode the PM half is tinted so AM and PM are easy to tell apart. */
  private drawTrack() {
    const quiet = 'var(--working-zone-bg)';
    const end = this.endMinutes - 0.001; // a full-circle arc would collapse to a point
    if (!this.twelveHour) {
      this.arc(this.svg, this.startMinutes, end, TRACK, 3, quiet, 1);
      return;
    }
    const amEnd = Math.min(end, NOON);
    const pmStart = Math.max(this.startMinutes, NOON);
    if (this.startMinutes < amEnd) this.arc(this.svg, this.startMinutes, amEnd, TRACK, 3, quiet, 1);
    if (pmStart < end) this.arc(this.svg, pmStart, end, TRACK, 3, ACCENT, 0.22);
  }

  private drawHourMarkers() {
    const hours = this.totalMinutes / 60;
    // Label every hour, or every 2nd/3rd hour for long days so labels don't collide
    const labelEvery = hours <= 12 ? 1 : hours <= 24 ? 2 : 3;

    const marks = new Set<number>([this.startMinutes]);
    for (let m = Math.ceil(this.startMinutes / 60) * 60; m < this.endMinutes; m += 60) {
      marks.add(m);
    }

    for (const minutes of marks) {
      const angle = this.angle(minutes);
      const isStart = minutes === this.startMinutes;
      const p1 = this.polar(angle, RIM - (isStart ? 9 : 5));
      const p2 = this.polar(angle, RIM);
      this.line(p1, p2, isStart ? ACCENT : 'var(--text-secondary)', isStart ? 1.5 : 1, isStart ? 1 : 0.5);

      const hourIndex = Math.round((minutes - this.startMinutes) / 60);
      if (!isStart && minutes % 60 === 0 && hourIndex % labelEvery !== 0) continue;

      const pos = this.polar(angle, LABELS);
      const pm = minutes >= NOON;
      const label =
        isStart && minutes % 60 !== 0
          ? formatTimeOfDay(minutesToTimeString(minutes))
          : formatHourLabel(Math.floor(minutes / 60));
      // PM hours use the accent colour, AM hours stay neutral
      const fill = this.twelveHour && pm ? ACCENT : 'var(--text-secondary)';
      this.text(pos.x, pos.y, label, { size: 10, weight: 400, fill, cls: 'hour-label' });

      // Spell out AM/PM where the day starts and where it crosses noon
      if (this.twelveHour && (isStart || minutes === NOON) && minutes % 60 === 0) {
        this.text(pos.x, pos.y + 10, pm ? 'PM' : 'AM', { size: 7, weight: 600, fill, cls: 'meridiem-label' });
      }
    }
  }

  private drawBreak(b: Break, index: number) {
    const start = timeStringToMinutes(b.startTime);
    const end = start + b.duration;
    const status = this.log[b.id]?.status;
    const done = status === 'completed' || status === 'skipped';
    const highlight = !done && (this.isCurrentBreak(b) || this.isNextBreak(b));

    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', `break-marker${highlight ? ' highlight' : ''}${done ? ' done' : ''}`);
    this.arc(group, start, end, TRACK, highlight ? 7 : 5, ACCENT, done ? 0.2 : highlight ? 1 : 0.5, 'break-arc');

    const angle = this.angle(start);
    const dot = this.polar(angle, RIM);
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('cx', String(dot.x));
    c.setAttribute('cy', String(dot.y));
    c.setAttribute('r', highlight ? '3' : '2');
    c.setAttribute('fill', ACCENT);
    c.setAttribute('opacity', done ? '0.25' : highlight ? '1' : '0.6');
    group.appendChild(c);

    const lp = this.polar(angle, RIM + 14);
    group.appendChild(
      this.textEl(lp.x, lp.y, String(index + 1), {
        size: highlight ? 12 : 10,
        weight: highlight ? 600 : 400,
        fill: highlight ? ACCENT : 'var(--text-secondary)',
        opacity: done ? 0.35 : 1,
        cls: 'break-label',
      })
    );
    this.svg.appendChild(group);
  }

  private drawTimeHand() {
    const nowMinutes = getSecondsSinceMidnight() / 60;
    if (nowMinutes < this.startMinutes || nowMinutes >= this.endMinutes) return;

    const angle = this.angle(nowMinutes);
    this.line(this.polar(angle, HAND_INNER), this.polar(angle, RIM - 2), ACCENT, 1.5, 1, 'time-hand');
    const tip = this.polar(angle, TRACK);
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('cx', String(tip.x));
    dot.setAttribute('cy', String(tip.y));
    dot.setAttribute('r', '3.5');
    dot.setAttribute('fill', 'var(--bg-primary)');
    dot.setAttribute('stroke', ACCENT);
    dot.setAttribute('stroke-width', '1.5');
    this.svg.appendChild(dot);
  }

  /** Next break / countdown / current time, in the middle of the dial. */
  private drawCenter() {
    const c = this.center;
    this.text(CX, CY - 44, formatNow(), { size: 11, weight: 500, fill: ACCENT, cls: 'clock-now' });
    if (!c) return;
    if (c.eyebrow) {
      this.text(CX, CY - 22, c.eyebrow, { size: 8, weight: 600, fill: 'var(--text-secondary)', spacing: 1.5, cls: 'clock-eyebrow' });
    }
    this.text(CX, CY + 4, c.headline, { size: c.headline.length > 12 ? 17 : 24, weight: 300, fill: 'var(--text-primary)', cls: 'clock-headline' });
    if (c.detail) {
      this.text(CX, CY + 30, c.detail, { size: 9.5, weight: 400, fill: 'var(--text-secondary)', cls: 'clock-detail' });
    }
  }

  /** Focus sessions and scheduled tasks to mark on the dial. */
  public setOverlays(focus: ClockFocus[], tasks: ClockTask[]) {
    const changed = JSON.stringify([focus, tasks]) !== JSON.stringify([this.focus, this.tasks]);
    this.focus = focus;
    this.tasks = tasks;
    if (changed) this.render();
  }

  /** Focus sessions: a solid arc just inside the breaks, with a check mark once finished. */
  private drawFocusSessions() {
    for (const f of this.focus) {
      const end = f.endedAt ?? Date.now();
      const from = Math.max(this.startMinutes, getMinutesSinceMidnight(new Date(f.startedAt)));
      const to = Math.min(this.endMinutes - 0.001, getMinutesSinceMidnight(new Date(end)) + (end % 60000) / 60000);
      if (!(to > from)) continue;

      const running = f.endedAt === null;
      const group = document.createElementNS(SVG_NS, 'g');
      group.setAttribute('class', `focus-marker${running ? ' running' : ''}`);
      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = running
        ? 'Focus session in progress'
        : f.completed
          ? `Focus session completed (${Math.round((end - f.startedAt) / 60000)} min)`
          : `Focus session stopped early (${Math.round((end - f.startedAt) / 60000)} min)`;
      group.appendChild(title);

      this.arc(group, from, to, FOCUS_RADIUS, 5, ACCENT, running ? 0.45 : f.completed ? 0.9 : 0.4, 'focus-arc');

      if (f.completed) {
        // Check mark badge at the end of the arc
        const p = this.polar(this.angle(to), FOCUS_RADIUS);
        const badge = document.createElementNS(SVG_NS, 'circle');
        badge.setAttribute('cx', String(p.x));
        badge.setAttribute('cy', String(p.y));
        badge.setAttribute('r', '6');
        badge.setAttribute('fill', ACCENT);
        group.appendChild(badge);
        const tick = document.createElementNS(SVG_NS, 'path');
        tick.setAttribute('d', `M ${p.x - 3} ${p.y} L ${p.x - 0.8} ${p.y + 2.4} L ${p.x + 3} ${p.y - 2.4}`);
        tick.setAttribute('fill', 'none');
        tick.setAttribute('stroke', '#fff');
        tick.setAttribute('stroke-width', '1.6');
        tick.setAttribute('stroke-linecap', 'round');
        tick.setAttribute('stroke-linejoin', 'round');
        group.appendChild(tick);
      }
      this.svg.appendChild(group);
    }
  }

  /** Scheduled tasks: open rings (filled once done) at their start time. */
  private drawTasks() {
    for (const t of this.tasks) {
      const m = timeStringToMinutes(t.time);
      if (!(m >= this.startMinutes && m < this.endMinutes)) continue;
      const p = this.polar(this.angle(m), TASK_RADIUS);
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', String(p.x));
      dot.setAttribute('cy', String(p.y));
      dot.setAttribute('r', '3.5');
      dot.setAttribute('fill', t.done ? ACCENT : 'var(--bg-primary)');
      dot.setAttribute('stroke', ACCENT);
      dot.setAttribute('stroke-width', '1.2');
      dot.setAttribute('class', 'task-marker');
      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = `${t.title} · ${formatTimeOfDay(t.time)}`;
      dot.appendChild(title);
      this.svg.appendChild(dot);
    }
  }

  public setCenter(center: ClockCenter) {
    const changed = JSON.stringify(center) !== JSON.stringify(this.center);
    this.center = center;
    if (changed) this.render();
  }

  // ---- SVG helpers ----

  private arc(
    parent: SVGElement,
    fromMinutes: number,
    toMinutes: number,
    radius: number,
    width: number,
    stroke: string,
    opacity: number,
    cls = 'track-arc'
  ) {
    const a1 = this.angle(fromMinutes);
    const a2 = this.angle(toMinutes);
    const p1 = this.polar(a1, radius);
    const p2 = this.polar(a2, radius);
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', `M ${p1.x} ${p1.y} A ${radius} ${radius} 0 ${a2 - a1 > 180 ? 1 : 0} 1 ${p2.x} ${p2.y}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', stroke);
    path.setAttribute('stroke-width', String(width));
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('opacity', String(opacity));
    path.setAttribute('class', cls);
    parent.appendChild(path);
  }

  private line(
    a: { x: number; y: number },
    b: { x: number; y: number },
    stroke: string,
    width: number,
    opacity = 1,
    cls = 'hour-marker'
  ) {
    const el = document.createElementNS(SVG_NS, 'line');
    el.setAttribute('x1', String(a.x));
    el.setAttribute('y1', String(a.y));
    el.setAttribute('x2', String(b.x));
    el.setAttribute('y2', String(b.y));
    el.setAttribute('stroke', stroke);
    el.setAttribute('stroke-width', String(width));
    el.setAttribute('stroke-linecap', 'round');
    el.setAttribute('opacity', String(opacity));
    el.setAttribute('class', cls);
    this.svg.appendChild(el);
  }

  private textEl(
    x: number,
    y: number,
    content: string,
    o: { size: number; weight?: number; fill: string; opacity?: number; spacing?: number; cls?: string }
  ): SVGTextElement {
    const t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('x', String(x));
    t.setAttribute('y', String(y));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('dominant-baseline', 'middle');
    t.setAttribute('fill', o.fill);
    t.setAttribute('font-size', String(o.size));
    t.setAttribute('font-weight', String(o.weight ?? 400));
    if (o.opacity !== undefined) t.setAttribute('opacity', String(o.opacity));
    if (o.spacing) t.setAttribute('letter-spacing', String(o.spacing));
    if (o.cls) t.setAttribute('class', o.cls);
    t.textContent = content;
    return t;
  }

  private text(
    x: number,
    y: number,
    content: string,
    o: { size: number; weight?: number; fill: string; opacity?: number; spacing?: number; cls?: string }
  ) {
    this.svg.appendChild(this.textEl(x, y, content, o));
  }

  private ring(r: number, className: string): SVGCircleElement {
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', String(CX));
    circle.setAttribute('cy', String(CY));
    circle.setAttribute('r', String(r));
    circle.setAttribute('class', className);
    circle.setAttribute('fill', 'var(--clock-bg)');
    circle.setAttribute('stroke', 'var(--border)');
    circle.setAttribute('stroke-width', '1');
    return circle;
  }

  private isNextBreak(b: Break): boolean {
    const now = getSecondsSinceMidnight() / 60;
    const next = this.breaks.find((x) => {
      const status = this.log[x.id]?.status;
      return status !== 'completed' && status !== 'skipped' && timeStringToMinutes(x.startTime) > now;
    });
    return next?.id === b.id;
  }

  private isCurrentBreak(b: Break): boolean {
    const now = getSecondsSinceMidnight() / 60;
    const start = timeStringToMinutes(b.startTime);
    return now >= start && now < start + b.duration;
  }

  private startTicking() {
    // Redraw once per second, aligned to the start of each second.
    const tick = () => {
      this.render();
      this.timerId = window.setTimeout(tick, 1000 - (Date.now() % 1000));
    };
    this.timerId = window.setTimeout(tick, 1000 - (Date.now() % 1000));
  }

  public destroy() {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  public updateBreaks(breaks: Break[], log: Record<string, BreakLogEntry> = this.log) {
    this.breaks = breaks;
    this.log = log;
    this.render();
  }
}
