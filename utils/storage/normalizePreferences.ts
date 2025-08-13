import { UserPreferences } from '../../types/index';

// Normalize a time string to HH:MM:SS if possible; otherwise return input
function toHHMMSS(input: any): any {
  if (typeof input !== 'string') return input;
  try {
    const parts = input.split(':');
    if (parts.length >= 3) {
      const hh = parts[0].padStart(2, '0');
      const mm = parts[1].padStart(2, '0');
      const ss = (parts[2] ?? '00').padStart(2, '0');
      return `${hh}:${mm}:${ss}`;
    } else if (parts.length === 2) {
      const hh = parts[0].padStart(2, '0');
      const mm = parts[1].padStart(2, '0');
      return `${hh}:${mm}:00`;
    }
    return input;
  } catch {
    return input;
  }
}

// Stable-sort non-semantic arrays (working days, categories). Do not sort arrays where order matters.
function stableSortIfNonSemantic(key: keyof UserPreferences, value: any): any {
  const nonSemanticArrays: (keyof UserPreferences)[] = [
    'calendar_working_days',
    'preferred_categories',
  ];
  if (!Array.isArray(value)) return value;
  if (!nonSemanticArrays.includes(key)) return value;
  return [...value].slice().sort((a, b) => String(a).localeCompare(String(b)));
}

// Coerce undefineds to defaults for boolean/array fields to avoid spurious diffs
function coerceDefaults(key: keyof UserPreferences, value: any): any {
  const booleanDefaults: (keyof UserPreferences)[] = [
    'autostart', 'show_timer', 'daily_reminder', 'notification_activity_reminders',
    'notification_upcoming_gaps', 'dark_mode', 'sound_enabled', 'vibration_enabled',
    'learning_enabled', 'habit_tracking_enabled', 'manual_mode', 'demo_mode', 'onboarding_completed',
    'show_device_calendar_busy', 'show_device_calendar_titles'
  ];
  const arrayDefaults: (keyof UserPreferences)[] = [
    'calendar_working_days', 'preferred_categories', 'preferred_activity_durations', 'device_calendar_included_ids'
  ];
  if (value === undefined) {
    if (booleanDefaults.includes(key)) return false;
    if (arrayDefaults.includes(key)) return [];
  }
  return value;
}

export function normalizeForCompare(prefs: Partial<UserPreferences>): Partial<UserPreferences> {
  if (!prefs) return {};
  const out: Partial<UserPreferences> = { ...prefs };

  // Times
  if (out.calendar_work_start !== undefined) out.calendar_work_start = toHHMMSS(out.calendar_work_start);
  if (out.calendar_work_end !== undefined) out.calendar_work_end = toHHMMSS(out.calendar_work_end);

  // Arrays (stable-sort where order non-semantic)
  if (out.calendar_working_days !== undefined) out.calendar_working_days = stableSortIfNonSemantic('calendar_working_days', out.calendar_working_days);
  if (out.preferred_categories !== undefined) out.preferred_categories = stableSortIfNonSemantic('preferred_categories', out.preferred_categories);

  // Coerce defaults for booleans/arrays
  for (const key of Object.keys(out) as (keyof UserPreferences)[]) {
    (out as any)[key] = coerceDefaults(key, (out as any)[key]);
  }

  return out;
}


