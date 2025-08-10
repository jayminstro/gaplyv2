import { useMemo } from 'react';
import { Task, TimeGap, UserPreferences } from '../types/index';
import { GapLogic } from '../utils/gapLogic';
import { isSameDay } from 'date-fns';

export function useGaps(date: string, tasks: Task[], preferences?: UserPreferences): TimeGap[] {
  return useMemo(() => {
    if (!preferences) return [];
    // Robust date filter: support ISO timestamps and plain YYYY-MM-DD
    const selected = new Date(date);
    const dateTasks = tasks.filter(t => {
      if (!t.dueDate) return false;
      try {
        // Exact match first for speed
        if (t.dueDate === date) return true;
        // Fallback: compare calendar day
        const taskDate = new Date(t.dueDate);
        return isSameDay(taskDate, selected);
      } catch {
        // Last resort: compare split at 'T'
        const d = String(t.dueDate).split('T')[0];
        return d === date;
      }
    });
    const t0 = performance.now();
    const gaps = GapLogic.recalculateGapsForDate(date, dateTasks, preferences, 'local-user');
    const ms = Math.round(performance.now() - t0);
    console.log('metric.gap_recompute_ms', ms, 'gaps_count', gaps.length, 'calendar_connected', false);
    return gaps;
  }, [
    date,
    preferences?.calendar_work_start,
    preferences?.calendar_work_end,
    JSON.stringify(preferences?.calendar_working_days || []),
    JSON.stringify(
      tasks
        .filter(t => {
          if (!t.dueDate) return false;
          if (t.dueDate === date) return true;
          try { return isSameDay(new Date(t.dueDate), new Date(date)); } catch { return String(t.dueDate).split('T')[0] === date; }
        })
        .map(t => [t.id, t.dueTime, t.duration, t.status, t.updated_at])
    )
  ]);
}


