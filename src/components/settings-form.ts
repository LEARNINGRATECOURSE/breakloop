import { AccentColor, Settings, ThemeMode } from '../state/types';
import { SOUND_OPTIONS } from '../utils/service-worker';
import { isPushSupported, needsHomeScreenInstall } from '../utils/push';
import {
  getDeviceTimeZone,
  isValidTimeString,
  isValidTimeZone,
  timeStringToMinutes,
} from '../utils/time-calculations';

export const ACCENTS: Record<AccentColor, string> = {
  red: '#e44b3c',
  orange: '#f08a24',
  green: '#4caf50',
  teal: '#26a69a',
  blue: '#4a90e2',
  purple: '#9b6ef3',
};

const THEMES: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const LEAD_OPTIONS = [0, 1, 2, 5, 10];
const SNOOZE_OPTIONS = [3, 5, 10, 15];

function escapeAttr(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function timeZoneList(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  try {
    const zones = intl.supportedValuesOf?.('timeZone');
    if (zones?.length) return zones.includes('UTC') ? zones : ['UTC', ...zones];
  } catch {
    /* fall through */
  }
  return ['UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London',
    'Europe/Paris', 'Europe/Berlin', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo',
    'Australia/Sydney'];
}

function segmented(name: string, options: { value: string; label: string }[], current: string): string {
  return `<div class="segmented" role="radiogroup">${options
    .map(
      (o) => `
      <label class="segment">
        <input type="radio" name="${name}" value="${o.value}" ${o.value === current ? 'checked' : ''}>
        <span>${o.label}</span>
      </label>`
    )
    .join('')}</div>`;
}

/** Current time in `zone` using `format`, for the live preview under the time zone picker. */
export function previewTime(zone: string, format: '12h' | '24h'): string {
  const timeZone = zone === 'auto' || !isValidTimeZone(zone) ? undefined : zone;
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: format === '12h',
    weekday: 'short',
  }).format(new Date());
}

/** The full Settings panel, grouped into sections. */
export function renderSettingsSections(settings: Settings): string {
  const zones = timeZoneList();
  const zone = settings.timeZone;
  const zoneKnown = zone === 'auto' || zones.includes(zone);

  return `
    <section class="settings-section">
      <h3>Appearance</h3>
      <div class="form-group">
        <span class="field-label">Theme</span>
        ${segmented('theme', THEMES, settings.theme)}
      </div>
      <div class="form-group">
        <span class="field-label">Accent colour</span>
        <div class="swatches" role="radiogroup" aria-label="Accent colour">
          ${(Object.keys(ACCENTS) as AccentColor[])
            .map(
              (a) => `
            <label class="swatch" title="${a}">
              <input type="radio" name="accent" value="${a}" ${a === settings.accent ? 'checked' : ''}>
              <span style="background-color: ${ACCENTS[a]}"></span>
              <span class="sr-only">${a}</span>
            </label>`
            )
            .join('')}
        </div>
      </div>
    </section>

    <section class="settings-section">
      <h3>Time</h3>
      <div class="form-group">
        <span class="field-label">Time format</span>
        ${segmented(
          'time-format',
          [
            { value: '12h', label: '12-hour (AM/PM)' },
            { value: '24h', label: '24-hour' },
          ],
          settings.timeFormat
        )}
      </div>
      <div class="form-group">
        <label for="time-zone">Time zone</label>
        <select id="time-zone">
          <option value="auto" ${zone === 'auto' ? 'selected' : ''}>Automatic (${escapeAttr(getDeviceTimeZone())})</option>
          ${!zoneKnown ? `<option value="${escapeAttr(zone)}" selected>${escapeAttr(zone)}</option>` : ''}
          ${zones
            .map((z) => `<option value="${escapeAttr(z)}" ${z === zone ? 'selected' : ''}>${escapeAttr(z.replace(/_/g, ' '))}</option>`)
            .join('')}
        </select>
        <p class="field-hint">Break times and the clock follow this zone. Right now it is
          <strong id="time-zone-preview">${previewTime(zone, settings.timeFormat)}</strong> there.</p>
      </div>
    </section>

    <section class="settings-section">
      <h3>Workday defaults</h3>
      <p class="field-hint">Used for days you haven't customised in the weekly schedule.</p>
      ${renderWorkdayFields(settings)}
    </section>

    <section class="settings-section">
      <h3>Notifications</h3>
      <div class="form-group checkbox">
        <input type="checkbox" id="notifications" ${settings.notificationsEnabled ? 'checked' : ''}>
        <label for="notifications">Enable notifications</label>
      </div>
      <div class="form-group checkbox">
        <input type="checkbox" id="sound" ${settings.soundEnabled ? 'checked' : ''}>
        <label for="sound">Play a sound</label>
      </div>
      <div class="form-group">
        <div class="form-group checkbox">
          <input type="checkbox" id="background-reminders" ${settings.backgroundReminders ? 'checked' : ''}
            ${isPushSupported() ? '' : 'disabled'}>
          <label for="background-reminders">Remind me even when the app is closed</label>
        </div>
        <p class="field-hint">
          ${
            !isPushSupported()
              ? "This browser doesn't support background notifications."
              : needsHomeScreenInstall()
                ? 'On iPhone/iPad, add BreakLoop to your Home Screen first (Share → Add to Home Screen), then turn this on from the installed app.'
                : 'Uses a small reminder service that only stores your device\'s push address and the times and text of upcoming reminders. Nothing else leaves your device.'
          }
          The alert sound for these is your phone's own notification sound.
        </p>
      </div>
      <div class="form-group">
        <span class="field-label">Notification sound (while the app is open)</span>
        <div class="sound-list" role="radiogroup" aria-label="Notification sound">
          ${SOUND_OPTIONS.map(
            (o) => `
            <div class="sound-option">
              <label class="sound-choice">
                <input type="radio" name="sound-type" value="${o.value}" ${o.value === settings.soundType ? 'checked' : ''}>
                <span><strong>${o.label}</strong><small>${o.hint}</small></span>
              </label>
              <button type="button" class="btn btn-secondary btn-small" data-action="test-sound" data-sound="${o.value}"
                aria-label="Play ${o.label} sound">▶ Test</button>
            </div>`
          ).join('')}
        </div>
      </div>
      <div class="form-group">
        <label for="sound-volume">Volume</label>
        <input type="range" id="sound-volume" min="0" max="100" step="5" value="${settings.soundVolume}" class="volume-slider">
      </div>
      <div class="form-group">
        <button type="button" class="btn btn-secondary btn-small" data-action="test-popup">Show a test pop-up</button>
        <p class="field-hint">Break reminders appear as a pop-up in the corner while BreakLoop is open, and as a system notification when it's in the background.</p>
      </div>
      <div class="form-group">
        <label for="lead-time">Remind me before a break</label>
        <select id="lead-time">
          ${LEAD_OPTIONS.map(
            (m) => `<option value="${m}" ${m === settings.reminderLeadMinutes ? 'selected' : ''}>${
              m === 0 ? 'When it starts' : `${m} minute${m === 1 ? '' : 's'} before`
            }</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group">
        <label for="snooze-time">Snooze for</label>
        <select id="snooze-time">
          ${SNOOZE_OPTIONS.map(
            (m) => `<option value="${m}" ${m === settings.snoozeMinutes ? 'selected' : ''}>${m} minutes</option>`
          ).join('')}
        </select>
      </div>
    </section>

    <section class="settings-section">
      <h3>Your data</h3>
      <p class="field-hint">Everything lives in this browser. Nothing is sent anywhere.</p>
      <div class="ws-tools">
        <button type="button" class="btn btn-secondary btn-small" data-action="export-data">Export my data</button>
        <button type="button" class="btn btn-danger btn-small" data-action="reset-data">Reset everything</button>
      </div>
    </section>

    <p class="form-error" role="alert" hidden></p>
  `;
}

function renderWorkdayFields(settings: Settings): string {
  return `
    <div class="form-row ws-hours">
      <div class="form-group">
        <label for="work-start">Work start</label>
        <input type="time" id="work-start" value="${settings.workingHoursStart}" required>
      </div>
      <div class="form-group">
        <label for="work-end">Work end</label>
        <input type="time" id="work-end" value="${settings.workingHoursEnd}" required>
      </div>
    </div>
    <div class="form-row ws-hours">
      <div class="form-group">
        <label for="break-frequency">Every (min)</label>
        <input type="number" id="break-frequency" value="${settings.breakFrequencyMinutes}" min="10" max="180" required>
      </div>
      <div class="form-group">
        <label for="break-duration">Length (min)</label>
        <input type="number" id="break-duration" value="${settings.breakDurationMinutes}" min="1" max="60" required>
      </div>
    </div>
  `;
}


/** Form fields shared by onboarding and the settings panel. */
export function renderSettingsFields(settings: Settings): string {
  return `
    <div class="form-group">
      <label for="work-start">Work Start Time</label>
      <input type="time" id="work-start" value="${settings.workingHoursStart}" required>
    </div>

    <div class="form-group">
      <label for="work-end">Work End Time</label>
      <input type="time" id="work-end" value="${settings.workingHoursEnd}" required>
    </div>

    <div class="form-group">
      <label for="break-frequency">Break every (minutes)</label>
      <input type="number" id="break-frequency" value="${settings.breakFrequencyMinutes}" min="10" max="180" required>
    </div>

    <div class="form-group">
      <label for="break-duration">Break Duration (minutes)</label>
      <input type="number" id="break-duration" value="${settings.breakDurationMinutes}" min="1" max="60" required>
    </div>

    <div class="form-group checkbox">
      <input type="checkbox" id="notifications" ${settings.notificationsEnabled ? 'checked' : ''}>
      <label for="notifications">Enable notifications</label>
    </div>

    <div class="form-group checkbox">
      <input type="checkbox" id="sound" ${settings.soundEnabled ? 'checked' : ''}>
      <label for="sound">Enable sound</label>
    </div>

    <p class="form-error" role="alert" hidden></p>
  `;
}

export type SettingsFormResult =
  | { ok: true; values: Partial<Settings> }
  | { ok: false; error: string };

/** Read and validate the fields rendered by `renderSettingsFields`. */
export function readSettingsFields(root: ParentNode): SettingsFormResult {
  const input = (id: string) => root.querySelector<HTMLInputElement>(`#${id}`);

  const workStart = input('work-start')?.value ?? '';
  const workEnd = input('work-end')?.value ?? '';
  const breakFreq = Number(input('break-frequency')?.value);
  const breakDuration = Number(input('break-duration')?.value);

  if (!isValidTimeString(workStart) || !isValidTimeString(workEnd)) {
    return { ok: false, error: 'Please enter valid start and end times.' };
  }
  if (timeStringToMinutes(workEnd) <= timeStringToMinutes(workStart)) {
    return { ok: false, error: 'Work end time must be after the start time.' };
  }
  if (!Number.isInteger(breakFreq) || breakFreq < 10 || breakFreq > 180) {
    return { ok: false, error: 'Break frequency must be between 10 and 180 minutes.' };
  }
  if (!Number.isInteger(breakDuration) || breakDuration < 1 || breakDuration > 60) {
    return { ok: false, error: 'Break duration must be between 1 and 60 minutes.' };
  }
  if (breakDuration >= breakFreq) {
    return { ok: false, error: 'Break duration must be shorter than the time between breaks.' };
  }

  const values: Partial<Settings> = {
    workingHoursStart: workStart,
    workingHoursEnd: workEnd,
    breakFrequencyMinutes: breakFreq,
    breakDurationMinutes: breakDuration,
    notificationsEnabled: input('notifications')?.checked ?? false,
    soundEnabled: input('sound')?.checked ?? false,
  };

  // Fields below only exist in the full Settings panel, not in onboarding
  const radio = (name: string) =>
    root.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value;
  const select = (id: string) =>
    root.querySelector<HTMLSelectElement | HTMLInputElement>(`#${id}`)?.value;

  const theme = radio('theme');
  if (theme === 'system' || theme === 'light' || theme === 'dark') values.theme = theme;
  const accent = radio('accent');
  if (accent && accent in ACCENTS) values.accent = accent as AccentColor;
  const timeFormat = radio('time-format');
  if (timeFormat === '12h' || timeFormat === '24h') values.timeFormat = timeFormat;
  const timeZone = select('time-zone');
  if (timeZone !== undefined) {
    if (timeZone !== 'auto' && !isValidTimeZone(timeZone)) {
      return { ok: false, error: 'Please choose a valid time zone.' };
    }
    values.timeZone = timeZone;
  }
  const background = root.querySelector<HTMLInputElement>('#background-reminders');
  if (background && !background.disabled) values.backgroundReminders = background.checked;
  const soundType = radio('sound-type');
  if (soundType === 'chime' || soundType === 'beep' || soundType === 'marimba') values.soundType = soundType;
  const volume = Number(select('sound-volume'));
  if (select('sound-volume') !== undefined && volume >= 0 && volume <= 100) values.soundVolume = volume;
  const lead = Number(select('lead-time'));
  if (select('lead-time') !== undefined && Number.isFinite(lead)) values.reminderLeadMinutes = lead;
  const snooze = Number(select('snooze-time'));
  if (select('snooze-time') !== undefined && Number.isFinite(snooze) && snooze > 0) {
    values.snoozeMinutes = snooze;
  }

  return { ok: true, values };
}

export function showFormError(root: ParentNode, message: string | null) {
  const el = root.querySelector<HTMLElement>('.form-error');
  if (!el) return;
  el.textContent = message ?? '';
  el.hidden = !message;
}
