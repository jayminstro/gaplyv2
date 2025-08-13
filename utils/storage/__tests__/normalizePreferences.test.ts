import { describe, it, expect } from 'vitest';
import { normalizeForCompare } from '../normalizePreferences';

describe('normalizeForCompare', () => {
  it('normalizes times to HH:MM:SS', () => {
    const a = normalizeForCompare({ calendar_work_start: '06:00' });
    const b = normalizeForCompare({ calendar_work_start: '06:00:00' });
    expect(a.calendar_work_start).toEqual('06:00:00');
    expect(b.calendar_work_start).toEqual('06:00:00');
    expect(a.calendar_work_start).toEqual(b.calendar_work_start);
  });

  it('normalizes day arrays order', () => {
    const a = normalizeForCompare({ calendar_working_days: ['Mon', 'Tue'] as any });
    const b = normalizeForCompare({ calendar_working_days: ['Tue', 'Mon'] as any });
    expect(a.calendar_working_days).toEqual(['Mon', 'Tue']);
    expect(b.calendar_working_days).toEqual(['Mon', 'Tue']);
  });

  it('coerces booleans/arrays defaults', () => {
    const a = normalizeForCompare({ dark_mode: undefined, preferred_categories: undefined } as any);
    expect(a.dark_mode).toEqual(false);
    expect(a.preferred_categories).toEqual([]);
  });
});


