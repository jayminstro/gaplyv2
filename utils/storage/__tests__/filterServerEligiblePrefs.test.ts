import { describe, it, expect } from 'vitest';
import { filterServerEligiblePrefs } from '../filterServerEligiblePrefs';

describe('filterServerEligiblePrefs', () => {
  it('strips device-calendar fields', () => {
    const diff = {
      show_device_calendar_busy: true,
      show_device_calendar_titles: true,
      device_calendar_included_ids: ['1','2'],
      device_calendar_open_in: 'gaply',
      calendar_work_start: '09:00',
    } as any;

    const filtered = filterServerEligiblePrefs(diff);
    expect(filtered).toHaveProperty('calendar_work_start');
    expect((filtered as any).show_device_calendar_busy).toBeUndefined();
    expect((filtered as any).show_device_calendar_titles).toBeUndefined();
    expect((filtered as any).device_calendar_included_ids).toBeUndefined();
    expect((filtered as any).device_calendar_open_in).toBeUndefined();
  });

  it('preserves server-whitelisted fields only', () => {
    const diff = {
      calendar_work_start: '09:00',
      calendar_work_end: '17:00',
      preferred_categories: ['Work', 'Health'],
      dark_mode: true,
      // non-whitelisted
      device_calendar_included_ids: ['a'],
      device_calendar_open_in: 'gaply',
    } as any;

    const filtered = filterServerEligiblePrefs(diff);
    expect(filtered).toEqual({
      calendar_work_start: '09:00',
      calendar_work_end: '17:00',
      preferred_categories: ['Work', 'Health'],
      dark_mode: true,
    });
  });

  it('returns empty object when diff only contains device-calendar fields', () => {
    const diff = {
      show_device_calendar_busy: true,
      show_device_calendar_titles: false,
      device_calendar_included_ids: [],
      device_calendar_open_in: 'gaply',
    } as any;
    const filtered = filterServerEligiblePrefs(diff);
    expect(filtered).toEqual({});
  });
});


