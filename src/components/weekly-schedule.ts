import { BreakRule, BreakRuleKind, BreakSchedule } from '../state/types';
import { describeRule, RULE_COLORS } from '../utils/schedule-engine';
import {
  formatTimeOfDay,
  isValidTimeString,
  minutesToTimeString,
  timeStringToMinutes,
} from '../utils/time-calculations';

// Monday first, like the week view in most calendars
const DAYS = [
  { dow: 1, short: 'Mon', long: 'Monday' },
  { dow: 2, short: 'Tue', long: 'Tuesday' },
  { dow: 3, short: 'Wed', long: 'Wednesday' },
  { dow: 4, short: 'Thu', long: 'Thursday' },
  { dow: 5, short: 'Fri', long: 'Friday' },
  { dow: 6, short: 'Sat', long: 'Saturday' },
  { dow: 0, short: 'Sun', long: 'Sunday' },
];

const KIND_LABELS: Record<BreakRuleKind, { icon: string; label: string }> = {
  exact: { icon: '🕒', label: 'Exact time' },
  count: { icon: '🔢', label: 'Exact num' },
  repeated: { icon: '🔁', label: 'Repeated' },
};

type View = 'main' | 'add' | 'copy' | 'delete';

interface BreakForm {
  kind: BreakRuleKind;
  name: string;
  countAsWork: boolean;
  hour: number; // exact: time of day
  minute: number;
  everyHours: number; // repeated: interval
  everyMinutes: number;
  count: number; // count: breaks per day
  durHours: number;
  durMinutes: number;
}

function newForm(): BreakForm {
  return {
    kind: 'repeated',
    name: '',
    countAsWork: true,
    hour: 12,
    minute: 0,
    everyHours: 0,
    everyMinutes: 25,
    count: 8,
    durHours: 0,
    durMinutes: 5,
  };
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

const formatClock = formatTimeOfDay;

/**
 * Editor for the per-day schedule: workday toggle, hours and break rules, plus
 * copying a day to other days and clearing breaks. Edits are kept in memory
 * and handed to `onSave` all at once.
 */
export class WeeklySchedule {
  private container: HTMLElement;
  private drafts = new Map<number, BreakSchedule>();
  private selected = 1;
  private view: View = 'main';
  private form: BreakForm = newForm();
  private error: string | null = null;
  private onSave: (schedules: BreakSchedule[]) => void | Promise<void>;
  private onTitle: (title: string) => void;
  private onClose: () => void;
  private colorIndex = 0;

  private clickHandler = (e: Event) => this.handleClick(e);
  private inputHandler = (e: Event) => this.handleInput(e);

  constructor(
    container: HTMLElement,
    schedules: BreakSchedule[],
    handlers: {
      onSave: (schedules: BreakSchedule[]) => void | Promise<void>;
      onTitle: (title: string) => void;
      onClose: () => void;
    },
    initialDay = new Date().getDay()
  ) {
    this.container = container;
    this.onSave = handlers.onSave;
    this.onTitle = handlers.onTitle;
    this.onClose = handlers.onClose;
    for (const s of schedules) {
      this.drafts.set(s.dayOfWeek, structuredClone(s));
    }
    this.selected = initialDay;
    this.container.addEventListener('click', this.clickHandler);
    this.container.addEventListener('input', this.inputHandler);
    this.container.addEventListener('change', this.inputHandler);
  }

  public destroy() {
    this.container.removeEventListener('click', this.clickHandler);
    this.container.removeEventListener('input', this.inputHandler);
    this.container.removeEventListener('change', this.inputHandler);
  }

  private get day(): BreakSchedule {
    return this.drafts.get(this.selected)!;
  }

  private dayName(dow = this.selected): string {
    return DAYS.find((d) => d.dow === dow)!.long;
  }

  public render() {
    switch (this.view) {
      case 'main':
        this.onTitle('Weekly Schedule');
        this.container.innerHTML = this.renderMain();
        break;
      case 'add':
        this.onTitle('New Break');
        this.container.innerHTML = this.renderAdd();
        break;
      case 'copy':
        this.onTitle('Copy schedule');
        this.container.innerHTML = this.renderDayPicker('copy');
        break;
      case 'delete':
        this.onTitle('Delete all breaks');
        this.container.innerHTML = this.renderDayPicker('delete');
        break;
    }
  }

  // ---- Views ----

  private renderMain(): string {
    const day = this.day;
    const rules = day.rules ?? [];
    const workday = day.isWorkday !== false;

    return `
      <div class="weekly-schedule">
        <div class="day-tabs" role="tablist" aria-label="Day of week">
          ${DAYS.map(
            (d) => `
            <button type="button" role="tab" class="day-tab ${d.dow === this.selected ? 'active' : ''}"
              aria-selected="${d.dow === this.selected}" data-ws="select-day" data-dow="${d.dow}">${d.short}</button>`
          ).join('')}
        </div>

        <div class="form-group checkbox">
          <input type="checkbox" id="ws-workday" ${workday ? 'checked' : ''}>
          <label for="ws-workday">This is a workday</label>
        </div>

        <fieldset class="ws-fields" ${workday ? '' : 'disabled'}>
          <div class="form-row ws-hours">
            <div class="form-group">
              <label for="ws-start">Start</label>
              <input type="time" id="ws-start" value="${day.startTime}">
            </div>
            <div class="form-group">
              <label for="ws-end">End</label>
              <input type="time" id="ws-end" value="${day.endTime}">
            </div>
          </div>

          <div class="ws-tools">
            <button type="button" class="btn btn-secondary btn-small" data-ws="open-copy">Copy schedule…</button>
            <button type="button" class="btn btn-secondary btn-small" data-ws="open-delete">Delete all breaks…</button>
          </div>

          <div class="ws-breaks-header">
            <h3>Breaks</h3>
            <button type="button" class="btn btn-primary btn-small" data-ws="open-add">+ Add break</button>
          </div>

          ${
            rules.length === 0
              ? '<p class="no-breaks">No breaks on this day.</p>'
              : `<ul class="rule-list">${rules.map((r) => this.renderRule(r)).join('')}</ul>`
          }
        </fieldset>

        <p class="form-error" role="alert" ${this.error ? '' : 'hidden'}>${escapeHtml(this.error ?? '')}</p>

        <div class="ws-footer">
          <button type="button" class="btn btn-secondary" data-ws="cancel">Cancel</button>
          <button type="button" class="btn btn-primary" data-ws="save">Save</button>
        </div>
      </div>
    `;
  }

  private renderRule(rule: BreakRule): string {
    const name = rule.name.trim() || KIND_LABELS[rule.kind].label;
    return `
      <li class="rule-item">
        <span class="rule-color" style="background-color: ${rule.color}" aria-hidden="true"></span>
        <span class="rule-info">
          <strong>${escapeHtml(name)}</strong>
          <span>${KIND_LABELS[rule.kind].icon} ${describeRule(rule)}${rule.countAsWork ? '' : ' · not work time'}</span>
        </span>
        <button type="button" class="break-action break-action-secondary" data-ws="delete-rule"
          data-rule-id="${rule.id}" aria-label="Delete break ${escapeHtml(name)}">Delete</button>
      </li>`;
  }

  private renderAdd(): string {
    const f = this.form;
    const day = this.day;
    return `
      <div class="weekly-schedule break-form">
        <p class="ws-context">${this.dayName()}: ${formatClock(day.startTime)} – ${formatClock(day.endTime)}</p>

        <div class="form-group">
          <label for="bf-name">Break name</label>
          <input type="text" id="bf-name" maxlength="40" placeholder="Enter break name (optional)" value="${escapeHtml(f.name)}">
        </div>

        <div class="kind-picker" role="radiogroup" aria-label="Break type">
          ${(Object.keys(KIND_LABELS) as BreakRuleKind[])
            .map(
              (k) => `
            <button type="button" role="radio" aria-checked="${f.kind === k}"
              class="kind-btn ${f.kind === k ? 'active' : ''}" data-ws="set-kind" data-kind="${k}">
              <span aria-hidden="true">${KIND_LABELS[k].icon}</span>${KIND_LABELS[k].label}
            </button>`
            )
            .join('')}
        </div>

        <div class="form-group checkbox">
          <input type="checkbox" id="bf-work" ${f.countAsWork ? 'checked' : ''}>
          <label for="bf-work">Count break time as work time</label>
        </div>

        ${this.renderWhenSection()}

        <section class="slider-section">
          <h3 class="slider-title">${f.kind === 'count' ? 'Duration per break' : 'Duration'}</h3>
          <p class="slider-value" id="bf-dur-value">${this.durLabel()}</p>
          ${this.slider('bf-dur-h', 'Hours', 0, 4, 1, f.durHours)}
          ${this.slider('bf-dur-m', 'Minutes', 0, 59, 1, f.durMinutes)}
        </section>

        <p class="form-error" role="alert" ${this.error ? '' : 'hidden'}>${escapeHtml(this.error ?? '')}</p>

        <div class="ws-footer">
          <button type="button" class="btn btn-secondary" data-ws="cancel-add">Cancel</button>
          <button type="button" class="btn btn-primary" data-ws="confirm-add">Add</button>
        </div>
      </div>
    `;
  }

  private renderWhenSection(): string {
    const f = this.form;
    if (f.kind === 'exact') {
      return `
        <section class="slider-section">
          <h3 class="slider-title">Break at</h3>
          <p class="slider-value" id="bf-when-value">${this.whenLabel()}</p>
          ${this.slider('bf-hour', 'Hours', 0, 23, 1, f.hour)}
          ${this.slider('bf-minute', 'Minutes', 0, 55, 5, f.minute)}
        </section>`;
    }
    if (f.kind === 'count') {
      return `
        <section class="slider-section">
          <h3 class="slider-title">Breaks per day</h3>
          <p class="slider-value" id="bf-when-value">${this.whenLabel()}</p>
          ${this.slider('bf-count', 'Breaks', 1, 20, 1, f.count)}
        </section>`;
    }
    return `
      <section class="slider-section">
        <h3 class="slider-title">Break every</h3>
        <p class="slider-value" id="bf-when-value">${this.whenLabel()}</p>
        ${this.slider('bf-every-h', 'Hours', 0, 8, 1, f.everyHours)}
        ${this.slider('bf-every-m', 'Minutes', 0, 55, 5, f.everyMinutes)}
      </section>`;
  }

  private slider(id: string, label: string, min: number, max: number, step: number, value: number): string {
    return `
      <div class="slider-row">
        <label for="${id}">${label}</label>
        <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}">
      </div>`;
  }

  private whenLabel(): string {
    const f = this.form;
    if (f.kind === 'exact') return formatClock(`${pad(f.hour)}:${pad(f.minute)}`);
    if (f.kind === 'count') return String(f.count);
    return `${pad(f.everyHours)}h ${pad(f.everyMinutes)}m`;
  }

  private durLabel(): string {
    return `${pad(this.form.durHours)}h ${pad(this.form.durMinutes)}m`;
  }

  /** Copy / delete: pick the days to apply the action to. */
  private renderDayPicker(mode: 'copy' | 'delete'): string {
    const days = mode === 'copy' ? DAYS.filter((d) => d.dow !== this.selected) : DAYS;
    return `
      <div class="weekly-schedule day-picker">
        <p class="ws-context">${
          mode === 'copy'
            ? `This will overwrite the selected days.<br>From ${this.dayName()} to:`
            : 'On days:'
        }</p>
        <ul class="day-picker-list">
          ${days
            .map(
              (d) => `
            <li class="form-group checkbox">
              <input type="checkbox" id="pick-${d.dow}" data-pick="${d.dow}">
              <label for="pick-${d.dow}">${d.long}</label>
            </li>`
            )
            .join('')}
        </ul>
        <div class="ws-footer">
          <button type="button" class="btn btn-secondary" data-ws="back">Cancel</button>
          <button type="button" class="btn ${mode === 'copy' ? 'btn-primary' : 'btn-danger'}"
            data-ws="${mode === 'copy' ? 'confirm-copy' : 'confirm-delete'}" disabled>${
              mode === 'copy' ? 'Copy' : 'Delete'
            }</button>
        </div>
      </div>
    `;
  }

  // ---- Events ----

  private go(view: View) {
    this.view = view;
    this.error = null;
    this.render();
  }

  private pickedDays(): number[] {
    return Array.from(this.container.querySelectorAll<HTMLInputElement>('input[data-pick]:checked')).map(
      (el) => Number(el.dataset.pick)
    );
  }

  private handleClick(e: Event) {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-ws]');
    if (!target) return;

    switch (target.dataset.ws) {
      case 'select-day':
        if (!this.commitMainFields()) return;
        this.selected = Number(target.dataset.dow);
        this.go('main');
        break;
      case 'open-add':
        if (!this.commitMainFields()) return;
        this.form = newForm();
        this.go('add');
        break;
      case 'open-copy':
        if (!this.commitMainFields()) return;
        this.go('copy');
        break;
      case 'open-delete':
        if (!this.commitMainFields()) return;
        this.go('delete');
        break;
      case 'back':
      case 'cancel-add':
        this.go('main');
        break;
      case 'set-kind':
        this.form.kind = target.dataset.kind as BreakRuleKind;
        this.error = null;
        this.render();
        break;
      case 'confirm-add':
        this.confirmAdd();
        break;
      case 'delete-rule': {
        const day = this.day;
        day.rules = (day.rules ?? []).filter((r) => r.id !== target.dataset.ruleId);
        this.render();
        break;
      }
      case 'confirm-copy':
        this.copyTo(this.pickedDays());
        this.go('main');
        break;
      case 'confirm-delete':
        for (const dow of this.pickedDays()) {
          const d = this.drafts.get(dow);
          if (d) d.rules = [];
        }
        this.go('main');
        break;
      case 'cancel':
        this.onClose();
        break;
      case 'save':
        if (this.commitMainFields()) void this.save();
        break;
    }
  }

  private handleInput(e: Event) {
    const el = e.target as HTMLInputElement;
    if (!el.id && !el.dataset.pick) return;

    if (el.dataset.pick) {
      const confirm = this.container.querySelector<HTMLButtonElement>(
        '[data-ws="confirm-copy"], [data-ws="confirm-delete"]'
      );
      if (confirm) confirm.disabled = this.pickedDays().length === 0;
      return;
    }

    if (this.view === 'main') {
      if (el.id === 'ws-workday' && e.type === 'change') {
        this.day.isWorkday = el.checked;
        this.render();
      }
      return;
    }
    if (this.view !== 'add') return;

    const f = this.form;
    switch (el.id) {
      case 'bf-name':
        f.name = el.value;
        return;
      case 'bf-work':
        f.countAsWork = el.checked;
        return;
      case 'bf-hour':
        f.hour = Number(el.value);
        break;
      case 'bf-minute':
        f.minute = Number(el.value);
        break;
      case 'bf-count':
        f.count = Number(el.value);
        break;
      case 'bf-every-h':
        f.everyHours = Number(el.value);
        break;
      case 'bf-every-m':
        f.everyMinutes = Number(el.value);
        break;
      case 'bf-dur-h':
        f.durHours = Number(el.value);
        break;
      case 'bf-dur-m':
        f.durMinutes = Number(el.value);
        break;
      default:
        return;
    }

    // Update the readouts in place so the slider being dragged isn't replaced
    const when = this.container.querySelector('#bf-when-value');
    if (when) when.textContent = this.whenLabel();
    const dur = this.container.querySelector('#bf-dur-value');
    if (dur) dur.textContent = this.durLabel();
  }

  /** Read the hours fields into the draft. Returns false (and shows an error) if invalid. */
  private commitMainFields(): boolean {
    if (this.view !== 'main') return true;
    const start = this.container.querySelector<HTMLInputElement>('#ws-start')?.value;
    const end = this.container.querySelector<HTMLInputElement>('#ws-end')?.value;
    if (start === undefined || end === undefined) return true;

    if (this.day.isWorkday !== false) {
      if (!isValidTimeString(start) || !isValidTimeString(end)) {
        return this.fail('Please enter valid start and end times.');
      }
      if (timeStringToMinutes(end) <= timeStringToMinutes(start)) {
        return this.fail('End time must be after the start time.');
      }
      this.day.startTime = start;
      this.day.endTime = end;
    }
    return true;
  }

  private fail(message: string): false {
    this.error = message;
    const el = this.container.querySelector<HTMLElement>('.form-error');
    if (el) {
      el.textContent = message;
      el.hidden = false;
    }
    return false;
  }

  private confirmAdd() {
    const f = this.form;
    const day = this.day;
    const duration = f.durHours * 60 + f.durMinutes;
    const workMinutes = timeStringToMinutes(day.endTime) - timeStringToMinutes(day.startTime);

    if (duration < 1) {
      this.fail('Duration must be at least 1 minute.');
      return;
    }

    const rule: BreakRule = {
      id: `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      kind: f.kind,
      name: f.name.trim(),
      duration,
      countAsWork: f.countAsWork,
      color: RULE_COLORS[this.nextColorIndex(day)],
    };

    if (f.kind === 'exact') {
      const start = f.hour * 60 + f.minute;
      if (
        start < timeStringToMinutes(day.startTime) ||
        start + duration > timeStringToMinutes(day.endTime)
      ) {
        this.fail(`The break must fit inside the workday (${day.startTime} – ${day.endTime}).`);
        return;
      }
      rule.time = minutesToTimeString(start);
    } else if (f.kind === 'count') {
      if (f.count * duration >= workMinutes) {
        this.fail('Those breaks would take up the whole workday.');
        return;
      }
      rule.count = f.count;
    } else {
      const every = f.everyHours * 60 + f.everyMinutes;
      if (every <= duration) {
        this.fail('The time between breaks must be longer than the break itself.');
        return;
      }
      rule.everyMinutes = every;
    }

    // Starting from "follow the defaults" and adding a break customises the day
    day.rules = [...(day.rules ?? []), rule];
    this.go('main');
  }

  private nextColorIndex(day: BreakSchedule): number {
    const used = new Set((day.rules ?? []).map((r) => r.color));
    const free = RULE_COLORS.findIndex((c) => !used.has(c));
    if (free >= 0) return free;
    return this.colorIndex++ % RULE_COLORS.length;
  }

  private copyTo(days: number[]) {
    const source = this.day;
    for (const dow of days) {
      const target = this.drafts.get(dow);
      if (!target) continue;
      Object.assign(target, {
        startTime: source.startTime,
        endTime: source.endTime,
        lunchStart: source.lunchStart,
        lunchEnd: source.lunchEnd,
        isWorkday: source.isWorkday,
        rules: structuredClone(source.rules),
      });
    }
  }

  private async save() {
    const schedules = [...this.drafts.values()].map((s) => ({ ...s, customized: true }));
    await this.onSave(schedules);
  }
}
