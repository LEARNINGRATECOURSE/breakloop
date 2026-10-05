import { Break } from '../state/types';
import {
  timeStringToMinutes,
  getSecondsSinceMidnight,
  angleTo,
  arcAngle,
} from '../utils/time-calculations';

export class AnalogBreakClock {
  private container: HTMLElement;
  private svg: SVGElement;
  private animationId: number | null = null;
  private breaks: Break[] = [];
  private startMinutes: number;
  private endMinutes: number;
  private radius: number = 150;
  private nextBreakId: string | null = null;

  constructor(
    container: HTMLElement,
    breaks: Break[],
    startTime: string,
    endTime: string
  ) {
    this.container = container;
    this.breaks = breaks;
    this.startMinutes = timeStringToMinutes(startTime);
    this.endMinutes = timeStringToMinutes(endTime);
    this.svg = this.createSvg();
    this.render();
    this.startAnimation();
  }

  private createSvg(): SVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 320 320');
    svg.setAttribute('class', 'analog-clock');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Break schedule analog clock');
    this.container.innerHTML = '';
    this.container.appendChild(svg);
    return svg;
  }

  private render() {
    this.svg.innerHTML = '';

    const cx = 160;
    const cy = 160;

    // Background circle
    const bg = this.createCircle(cx, cy, this.radius, 'clock-background');
    this.svg.appendChild(bg);

    // Working hours zone (optional subtle background)
    this.drawWorkingHoursZone(cx, cy);

    // Hour markers and numbers
    this.drawHourMarkers(cx, cy);

    // Draw all breaks as arcs
    this.breaks.forEach((breakItem, index) => {
      this.drawBreakArc(cx, cy, breakItem, index);
    });

    // Draw current time hand
    this.drawTimeHand(cx, cy);
  }

  private drawWorkingHoursZone(cx: number, cy: number) {
    const totalMinutes = this.endMinutes - this.startMinutes;
    const startAngle = angleTo(this.startMinutes, this.startMinutes, this.endMinutes);
    const endAngle = angleTo(this.endMinutes, this.startMinutes, this.endMinutes);

    // Draw a wedge showing working hours
    const startRad = (startAngle - 90) * (Math.PI / 180);
    const endRad = (endAngle - 90) * (Math.PI / 180);

    const x1 = cx + this.radius * Math.cos(startRad);
    const y1 = cy + this.radius * Math.sin(startRad);
    const x2 = cx + this.radius * Math.cos(endRad);
    const y2 = cy + this.radius * Math.sin(endRad);

    const largeArc = endAngle - startAngle > 180 ? 1 : 0;

    const path = `
      M ${cx} ${cy}
      L ${x1} ${y1}
      A ${this.radius} ${this.radius} 0 ${largeArc} 1 ${x2} ${y2}
      Z
    `;

    const wedge = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    wedge.setAttribute('d', path);
    wedge.setAttribute('class', 'working-hours-zone');
    wedge.setAttribute('fill', 'var(--working-zone-bg)');
    wedge.setAttribute('opacity', '0.05');
    this.svg.appendChild(wedge);
  }

  private drawHourMarkers(cx: number, cy: number) {
    const totalMinutes = this.endMinutes - this.startMinutes;
    const step = totalMinutes / 12; // Show 12 markers

    for (let i = 0; i < 12; i++) {
      const minutes = this.startMinutes + step * i;
      const angle = angleTo(minutes, this.startMinutes, this.endMinutes);
      const rad = (angle - 90) * (Math.PI / 180);

      // Hour marker line
      const markerLen = 12;
      const x1 = cx + (this.radius - markerLen) * Math.cos(rad);
      const y1 = cy + (this.radius - markerLen) * Math.sin(rad);
      const x2 = cx + this.radius * Math.cos(rad);
      const y2 = cy + this.radius * Math.sin(rad);

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(x1));
      line.setAttribute('y1', String(y1));
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(y2));
      line.setAttribute('class', 'hour-marker');
      line.setAttribute('stroke', 'var(--text-secondary)');
      line.setAttribute('stroke-width', '2');
      this.svg.appendChild(line);

      // Hour label
      const labelRad = (angle - 90) * (Math.PI / 180);
      const labelDist = this.radius - 30;
      const labelX = cx + labelDist * Math.cos(labelRad);
      const labelY = cy + labelDist * Math.sin(labelRad);

      const timeStr = this.minutesToTimeString(Math.round(minutes));
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(labelX));
      text.setAttribute('y', String(labelY));
      text.setAttribute('class', 'hour-label');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('fill', 'var(--text-secondary)');
      text.setAttribute('font-size', '12');
      text.setAttribute('font-weight', '500');
      text.textContent = timeStr;
      this.svg.appendChild(text);
    }
  }

  private drawBreakArc(cx: number, cy: number, breakItem: Break, index: number) {
    const totalMinutes = this.endMinutes - this.startMinutes;
    const breakStartMinutes = timeStringToMinutes(breakItem.startTime);
    const breakEndMinutes = breakStartMinutes + breakItem.duration;

    const startAngle = angleTo(breakStartMinutes, this.startMinutes, this.endMinutes);
    const endAngle = angleTo(breakEndMinutes, this.startMinutes, this.endMinutes);

    const isUpcoming = this.isUpcomingBreak(breakItem);
    const isCurrent = this.isCurrentBreak(breakItem);

    // Arc
    this.drawArc(cx, cy, startAngle, endAngle, breakItem.color, isUpcoming || isCurrent);

    // Dot at start time
    this.drawBreakDot(cx, cy, startAngle, breakItem.color, isUpcoming || isCurrent);

    // Label (break number)
    this.drawBreakLabel(cx, cy, startAngle, index + 1, isUpcoming || isCurrent);
  }

  private drawArc(
    cx: number,
    cy: number,
    startAngle: number,
    endAngle: number,
    color: string,
    highlight: boolean
  ) {
    const arcRadius = this.radius - 20;
    const startRad = (startAngle - 90) * (Math.PI / 180);
    const endRad = (endAngle - 90) * (Math.PI / 180);

    const x1 = cx + arcRadius * Math.cos(startRad);
    const y1 = cy + arcRadius * Math.sin(startRad);
    const x2 = cx + arcRadius * Math.cos(endRad);
    const y2 = cy + arcRadius * Math.sin(endRad);

    const largeArc = endAngle - startAngle > 180 ? 1 : 0;

    const path = `M ${x1} ${y1} A ${arcRadius} ${arcRadius} 0 ${largeArc} 1 ${x2} ${y2}`;

    const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arc.setAttribute('d', path);
    arc.setAttribute('stroke', color);
    arc.setAttribute('fill', 'none');
    arc.setAttribute('stroke-width', highlight ? '4' : '2');
    arc.setAttribute('opacity', highlight ? '1' : '0.6');
    arc.setAttribute('class', 'break-arc');
    this.svg.appendChild(arc);
  }

  private drawBreakDot(
    cx: number,
    cy: number,
    angle: number,
    color: string,
    highlight: boolean
  ) {
    const rad = (angle - 90) * (Math.PI / 180);
    const x = cx + this.radius * Math.cos(rad);
    const y = cy + this.radius * Math.sin(rad);

    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', String(x));
    dot.setAttribute('cy', String(y));
    dot.setAttribute('r', highlight ? '5' : '4');
    dot.setAttribute('fill', color);
    dot.setAttribute('class', 'break-dot');
    this.svg.appendChild(dot);
  }

  private drawBreakLabel(
    cx: number,
    cy: number,
    angle: number,
    breakNumber: number,
    highlight: boolean
  ) {
    const rad = (angle - 90) * (Math.PI / 180);
    const labelDist = this.radius + 15;
    const x = cx + labelDist * Math.cos(rad);
    const y = cy + labelDist * Math.sin(rad);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(x));
    text.setAttribute('y', String(y));
    text.setAttribute('class', 'break-label');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('fill', 'var(--text-primary)');
    text.setAttribute('font-size', highlight ? '14' : '12');
    text.setAttribute('font-weight', '600');
    text.textContent = String(breakNumber);
    this.svg.appendChild(text);
  }

  private drawTimeHand(cx: number, cy: number) {
    const secondsSinceMidnight = getSecondsSinceMidnight();
    const minutesSinceMidnight = Math.floor(secondsSinceMidnight / 60);

    const angle = angleTo(minutesSinceMidnight, this.startMinutes, this.endMinutes);
    const rad = (angle - 90) * (Math.PI / 180);

    const handLength = this.radius - 10;
    const x = cx + handLength * Math.cos(rad);
    const y = cy + handLength * Math.sin(rad);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(cx));
    line.setAttribute('y1', String(cy));
    line.setAttribute('x2', String(x));
    line.setAttribute('y2', String(y));
    line.setAttribute('class', 'time-hand');
    line.setAttribute('stroke', 'var(--accent)');
    line.setAttribute('stroke-width', '3');
    line.setAttribute('stroke-linecap', 'round');
    this.svg.appendChild(line);

    // Center dot
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', String(cx));
    dot.setAttribute('cy', String(cy));
    dot.setAttribute('r', '4');
    dot.setAttribute('fill', 'var(--accent)');
    this.svg.appendChild(dot);
  }

  private isUpcomingBreak(breakItem: Break): boolean {
    const now = getSecondsSinceMidnight() / 60; // Convert to minutes
    const breakStartMinutes = timeStringToMinutes(breakItem.startTime);
    const breakEndMinutes = breakStartMinutes + breakItem.duration;

    // Next break is one that hasn't started yet
    return breakStartMinutes > now;
  }

  private isCurrentBreak(breakItem: Break): boolean {
    const now = getSecondsSinceMidnight() / 60; // Convert to minutes
    const breakStartMinutes = timeStringToMinutes(breakItem.startTime);
    const breakEndMinutes = breakStartMinutes + breakItem.duration;

    return now >= breakStartMinutes && now < breakEndMinutes;
  }

  private minutesToTimeString(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }

  private createCircle(cx: number, cy: number, r: number, className: string): SVGCircleElement {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(cx));
    circle.setAttribute('cy', String(cy));
    circle.setAttribute('r', String(r));
    circle.setAttribute('class', className);
    circle.setAttribute('fill', 'var(--clock-bg)');
    circle.setAttribute('stroke', 'var(--border)');
    circle.setAttribute('stroke-width', '1');
    return circle;
  }

  private startAnimation() {
    const tick = () => {
      this.render();
      this.animationId = requestAnimationFrame(tick);
    };
    this.animationId = requestAnimationFrame(tick);
  }

  public destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }

  public updateBreaks(breaks: Break[]) {
    this.breaks = breaks;
    this.render();
  }
}
