import { UserPreferences } from '../../types/index';

/**
 * Filter a diff/object to only include server-eligible preference fields.
 * Mirrors the server whitelist in supabase/functions/.../server/index.tsx
 * Ensures device-calendar/local-only fields never reach the server.
 */
export function filterServerEligiblePrefs(
  diff: Partial<UserPreferences>
): Partial<UserPreferences> {
  if (!diff) return {};

  const preferencesFields: (keyof UserPreferences)[] = [
    'calendar_work_start',
    'calendar_work_end',
    'calendar_working_days',
    'calendar_buffer_time',
    'calendar_min_gap',
    'gap_sync_frequency',
    'autostart',
    'show_timer',
    'default_energy_level',
    'preferred_categories',
    'daily_reminder',
    'notification_activity_reminders',
    'notification_upcoming_gaps',
    'notification_lead_time',
    'dark_mode',
    'sound_enabled',
    'vibration_enabled',
    'manual_mode',
    'demo_mode',
    'timezone',
    'calendar_include_weekends',
    'quiet_hours_start',
    'quiet_hours_end',
    'calendar_event_status',
    'last_gap_sync',
    'google_access_token',
    'google_refresh_token',
    'google_token_expires_at',
  ];

  const filtered: Partial<UserPreferences> = {};
  for (const key of preferencesFields) {
    if (Object.prototype.hasOwnProperty.call(diff, key)) {
      (filtered as any)[key] = (diff as any)[key];
    }
  }

  return filtered;
}


