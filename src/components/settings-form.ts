import { Settings } from '../state/types';
import { isValidTimeString, timeStringToMinutes } from '../utils/time-calculations';

/** Form fields shared by onboarding and the settings panel. */
export function renderSettingsFields(settings: Settings, includeTheme = false): string {
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

    ${
      includeTheme
        ? `<div class="form-group checkbox">
            <input type="checkbox" id="dark-mode" ${settings.darkMode ? 'checked' : ''}>
            <label for="dark-mode">Dark mode</label>
          </div>`
        : ''
    }

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

  const darkMode = input('dark-mode');
  if (darkMode) {
    values.darkMode = darkMode.checked;
  }

  return { ok: true, values };
}

export function showFormError(root: ParentNode, message: string | null) {
  const el = root.querySelector<HTMLElement>('.form-error');
  if (!el) return;
  el.textContent = message ?? '';
  el.hidden = !message;
}
