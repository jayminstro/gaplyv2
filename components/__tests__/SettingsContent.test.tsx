/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/platform', () => ({
  detectPlatform: () => ({
    isIOS: true,
    isAndroid: false,
    isWeb: false,
    isMobile: true,
    isDesktop: false,
    platform: 'ios'
  })
}));

vi.mock('../../utils/api', () => ({
  preferencesAPI: {},
  profileAPI: { get: async () => null }
}));

vi.mock('../../utils/gapsAPI', () => ({
  GapsAPI: {}
}));

vi.mock('../../src/utils/calendarSource.ios', () => ({
  ensurePermissionOrThrow: vi.fn(),
  loadCalendars: vi.fn().mockResolvedValue([]),
  getPermissionStatus: vi.fn().mockResolvedValue({ status: 'granted' }),
  openIOSSettings: vi.fn()
}));

vi.mock('../../utils/calendar/index', () => ({
  calendarService: {}
}));

import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { SettingsContent } from '../SettingsContent';
import { UserPreferences } from '../../types';

describe('SettingsContent device calendar toggle', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.innerHTML = '';
    document.body.appendChild(container);
    localStorage.clear();
  });

  it('persists disabled device calendar state', async () => {
    const prefs: UserPreferences = {
      calendar_work_start: '09:00',
      calendar_work_end: '17:00',
      calendar_working_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      calendar_buffer_time: 0,
      calendar_min_gap: 0,
      gap_sync_frequency: 15,
      show_device_calendar_busy: true,
      show_device_calendar_titles: true,
      device_calendar_included_ids: [],
      autostart: false,
      show_timer: false,
      default_energy_level: 'medium',
      preferred_categories: [],
      preferred_activity_durations: [],
      activity_success_threshold: 0,
      daily_reminder: false,
      notification_activity_reminders: false,
      notification_upcoming_gaps: false,
      notification_lead_time: 0,
      dark_mode: false,
      sound_enabled: false,
      vibration_enabled: false,
      learning_enabled: false,
      habit_tracking_enabled: false,
      manual_mode: false,
      demo_mode: false,
      onboarding_completed: false
    };

    const session = { user: { id: 'user1' } };
    const onUpdate = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SettingsContent
          session={session}
          preferences={prefs}
          onSignOut={() => {}}
          onPreferencesUpdate={onUpdate}
          localFirstService={null}
        />
      );
    });

    const busySwitch = container.querySelectorAll('[data-slot="switch"]')[0] as HTMLElement;
    await act(async () => {
      busySwitch.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(busySwitch.getAttribute('data-state')).toBe('unchecked');

    const stored = JSON.parse(localStorage.getItem('gaply_device_calendar_user1') || '{}');
    expect(stored.show_device_calendar_busy).toBe(false);
    expect(stored.show_device_calendar_titles).toBe(false);
    expect(stored.device_calendar_open_in).toBe('gaply');

    const updatedPrefs = onUpdate.mock.calls[0][0] as UserPreferences;
    await act(async () => {
      root.render(
        <SettingsContent
          session={session}
          preferences={updatedPrefs}
          onSignOut={() => {}}
          onPreferencesUpdate={onUpdate}
          localFirstService={null}
        />
      );
    });

    const rerenderSwitch = container.querySelectorAll('[data-slot="switch"]')[0] as HTMLElement;
    expect(rerenderSwitch.getAttribute('data-state')).toBe('unchecked');

    const storedAgain = JSON.parse(localStorage.getItem('gaply_device_calendar_user1') || '{}');
    expect(storedAgain.show_device_calendar_busy).toBe(false);
    expect(storedAgain.show_device_calendar_titles).toBe(false);
    expect(storedAgain.device_calendar_open_in).toBe('gaply');
  });
});

