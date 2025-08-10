import { useMemo } from 'react';
import { Task, TimeGap, UserPreferences } from '../types/index';
import { GapLogic } from '../utils/gapLogic';

export function useGaps(date: string, tasks: Task[], preferences?: UserPreferences): TimeGap[] {
  return useMemo(() => {
    if (!preferences) return [];
    const dateTasks = tasks.filter(t => t.dueDate === date);
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
        .filter(t => t.dueDate === date)
        .map(t => [t.id, t.dueTime, t.duration, t.status, t.updated_at])
    )
  ]);
}


