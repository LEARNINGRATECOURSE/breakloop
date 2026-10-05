import { Break, BreakLogEntry } from '../state/types';
import {
  timeStringToMinutes,
  minutesToTimeString,
  formatTimeOfDay,
  formatHourLabel,
  getSecondsSinceMidnight,
  angleTo,
} from '../utils/time-calculations';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SIZE = 360; // viewBox size; leaves room for break labels outside the rim
const CX = SIZE / 2;
const CY = SIZE / 2;

export class AnalogBreakClock {
  private container: HTMLElement;
  private svg: SVGSVGElement;
  private timerId: number | null = null;
  private breaks: Break[] = [];
  private log: Record<string, BreakLogEntry> = {};
  private startMinutes: number;
  private endMinutes: number;
  private radius: number = 150;

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

  private render() {
    this.svg.replaceChildren();

    if (!(this.totalMinutes > 0)) {
      this.drawCenterText('Invalid working hours');
      return;
    }

    // Background / working hours face
    this.svg.appendChild(this.createCircle(this.radius, 'clock-background'));
    this.drawWorkingHoursZone();

    // Hour markers and numbers
    this.drawHourMarkers();

    // Draw all breaks as arcs
    this.breaks.forEach((breakItem, index) => {
      this.drawBreakArc(breakItem, index);
    });

    // Draw current time hand
    this.drawTimeHand();

    this.svg.setAttribute('aria-label', this.describe());
  }

  private describe(): string {
    const start = formatTimeOfDay(minutesToTimeString(this.startMinutes));
    const end = formatTimeOfDay(minutesToTimeString(this.endMinutes));
    const now = formatTimeOfDay(minutesToTimeString(Math.floor(getSecondsSinceMidnight() / 60)));
    const times = this.breaks.map((b) => formatTimeOfDay(b.startTime)).join(', ');
    return (
      `Break schedule clock for working hours ${start} to ${end}. Current time ${now}. ` +
      (this.breaks.length
        ? `${this.breaks.length} breaks at ${times}.`
        : 'No breaks scheduled.')
    );
  }

  private polar(angle: number, r: number): { x: number; y: number } {
    const rad = (angle - 90) * (Math.PI / 180);
    return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
  }

  private drawWorkingHoursZone() {
    // The whole face is the working-hours window, so the zone is a full ring
    const zone = this.createCircle(this.radius - 20, 'working-hours-zone');
    zone.setAttribute('fill', 'none');
    zone.setAttribute('stroke', 'var(--working-zone-bg)');
    zone.setAttribute('stroke-width', '10');
    this.svg.appendChild(zone);
  }

  private drawHourMarkers() {
    const hours = this.totalMinutes / 60;
    // Label every hour, or every 2nd/3rd hour for long days so labels don't collide
    const labelEvery = hours <= 12 ? 1 : hours <= 24 ? 2 : 3;

    // Whole hours inside the window, plus the start (which may not be on the hour)
    const marks = new Set<number>([this.startMinutes]);
    for (let m = Math.ceil(this.startMinutes / 60) * 60; m < this.endMinutes; m += 60) {
      marks.add(m);
    }

    for (const minutes of marks) {
      const angle = angleTo(minutes, this.startMinutes, this.endMinutes);
      const isStart = minutes === this.startMinutes;

      const markerLen = isStart ? 16 : 10;
      const p1 = this.polar(angle, this.radius - markerLen);
      const p2 = this.polar(angle, this.radius);

      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(p1.x));
      line.setAttribute('y1', String(p1.y));
      line.setAttribute('x2', String(p2.x));
      line.setAttribute('y2', String(p2.y));
      line.setAttribute('class', 'hour-marker');
      line.setAttribute('stroke', isStart ? 'var(--accent)' : 'var(--text-secondary)');
      line.setAttribute('stroke-width', isStart ? '3' : '2');
      this.svg.appendChild(line);

      const hourIndex = Math.round((minutes - this.startMinutes) / 60);
      if (!isStart && minutes % 60 === 0 && hourIndex % labelEvery !== 0) {
        continue;
      }

      const labelPos = this.polar(angle, this.radius - 34);
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', String(labelPos.x));
      text.setAttribute('y', String(labelPos.y));
      text.setAttribute('class', 'hour-label');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('fill', 'var(--text-secondary)');
      text.setAttribute('font-size', '12');
      text.setAttribute('font-weight', '500');
      text.textContent = isStart && minutes % 60 !== 0
        ? formatTimeOfDay(minutesToTimeString(minutes))
        : formatHourLabel(Math.floor(minutes / 60));
      this.svg.appendChild(text);
    }
  }

  private drawBreakArc(breakItem: Break, index: number) {
    const breakStartMinutes = timeStringToMinutes(breakItem.startTime);
    const breakEndMinutes = breakStartMinutes + breakItem.duration;

    const startAngle = angleTo(breakStartMinutes, this.startMinutes, this.endMinutes);
    const endAngle = angleTo(breakEndMinutes, this.startMinutes, this.endMinutes);

    const status = this.log[breakItem.id]?.status;
    const done = status === 'completed' || status === 'skipped';
    const highlight = !done && (this.isCurrentBreak(breakItem) || this.isNextBreak(breakItem));

    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', `break-marker${highlight ? ' highlight' : ''}${done ? ' done' : ''}`);
    group.setAttribute('opacity', done ? '0.35' : highlight ? '1' : '0.7');

    this.drawArc(group, startAngle, endAngle, breakItem.color, highlight);
    this.drawBreakDot(group, startAngle, breakItem.color, highlight);
    this.drawBreakLabel(group, startAngle, index + 1, highlight);

    this.svg.appendChild(group);
  }

  private drawArc(
    parent: SVGElement,
    startAngle: number,
    endAngle: number,
    color: string,
    highlight: boolean
  ) {
    const arcRadius = this.radius - 20;
    const p1 = this.polar(startAngle, arcRadius);
    const p2 = this.polar(endAngle, arcRadius);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;

    const arc = document.createElementNS(SVG_NS, 'path');
    arc.setAttribute(
      'd',
      `M ${p1.x} ${p1.y} A ${arcRadius} ${arcRadius} 0 ${largeArc} 1 ${p2.x} ${p2.y}`
    );
    arc.setAttribute('stroke', color);
    arc.setAttribute('fill', 'none');
    arc.setAttribute('stroke-width', highlight ? '10' : '8');
    arc.setAttribute('stroke-linecap', 'round');
    arc.setAttribute('class', 'break-arc');
    parent.appendChild(arc);
  }

  private drawBreakDot(parent: SVGElement, angle: number, color: string, highlight: boolean) {
    const p = this.polar(angle, this.radius);

    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('cx', String(p.x));
    dot.setAttribute('cy', String(p.y));
    dot.setAttribute('r', highlight ? '6' : '4');
    dot.setAttribute('fill', color);
    dot.setAttribute('class', 'break-dot');
    parent.appendChild(dot);
  }

  private drawBreakLabel(
    parent: SVGElement,
    angle: number,
    breakNumber: number,
    highlight: boolean
  ) {
    const p = this.polar(angle, this.radius + 16);

    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', String(p.x));
    text.setAttribute('y', String(p.y));
    text.setAttribute('class', 'break-label');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('fill', 'var(--text-primary)');
    text.setAttribute('font-size', highlight ? '14' : '12');
    text.setAttribute('font-weight', '600');
    text.textContent = String(breakNumber);
    parent.appendChild(text);
  }

  private drawTimeHand() {
    const nowMinutes = getSecondsSinceMidnight() / 60;

    if (nowMinutes < this.startMinutes || nowMinutes >= this.endMinutes) {
      // Outside the working window the hand would point at a meaningless angle
      this.drawCenterText(nowMinutes < this.startMinutes ? 'Before work' : 'Day done');
      return;
    }

    const angle = angleTo(nowMinutes, this.startMinutes, this.endMinutes);
    const p = this.polar(angle, this.radius - 10);

    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', String(CX));
    line.setAttribute('y1', String(CY));
    line.setAttribute('x2', String(p.x));
    line.setAttribute('y2', String(p.y));
    line.setAttribute('class', 'time-hand');
    line.setAttribute('stroke', 'var(--accent)');
    line.setAttribute('stroke-width', '3');
    line.setAttribute('stroke-linecap', 'round');
    this.svg.appendChild(line);

    // Center dot
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('cx', String(CX));
    dot.setAttribute('cy', String(CY));
    dot.setAttribute('r', '5');
    dot.setAttribute('fill', 'var(--accent)');
    this.svg.appendChild(dot);
  }

  private drawCenterText(label: string) {
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', String(CX));
    text.setAttribute('y', String(CY));
    text.setAttribute('class', 'clock-center-text');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('fill', 'var(--text-secondary)');
    text.setAttribute('font-size', '16');
    text.setAttribute('font-weight', '600');
    text.textContent = label;
    this.svg.appendChild(text);
  }

  private isNextBreak(breakItem: Break): boolean {
    const now = getSecondsSinceMidnight() / 60;
    const next = this.breaks.find((b) => {
      const status = this.log[b.id]?.status;
      return status !== 'completed' && status !== 'skipped' && timeStringToMinutes(b.startTime) > now;
    });
    return next?.id === breakItem.id;
  }

  private isCurrentBreak(breakItem: Break): boolean {
    const now = getSecondsSinceMidnight() / 60;
    const breakStartMinutes = timeStringToMinutes(breakItem.startTime);
    const breakEndMinutes = breakStartMinutes + breakItem.duration;

    return now >= breakStartMinutes && now < breakEndMinutes;
  }

  private createCircle(r: number, className: string): SVGCircleElement {
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

  private startTicking() {
    // Redraw once per second, aligned to the start of each second.
    // (Redrawing every animation frame burned CPU for no visible change.)
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
