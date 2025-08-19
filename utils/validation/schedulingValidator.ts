import { UserPreferences, TimeGap } from '../../types/index';
import { CalendarBusyBlock } from '../../types/calendar';

export type Interval = { start_time: string; end_time: string };
export type ValidationResult = { canSchedule: boolean; conflicts?: Interval[] };
export type Suggestion = { date: string; start_time: string; end_time: string };

function overlaps(a: Interval, b: Interval): boolean {
  return a.start_time < b.end_time && b.start_time < a.end_time;
}

export async function getBlockingIntervals(date: string, busyBlocks: CalendarBusyBlock[]): Promise<Interval[]> {
  return busyBlocks.filter(b => b.date === date).map(b => ({ start_time: b.start_time, end_time: b.end_time }));
}

export function canSchedule(candidate: Interval, blocking: Interval[]): boolean {
  return !blocking.some(b => overlaps(candidate, b));
}

export function suggestAlternatives(candidate: Interval, blocking: Interval[], gaps: TimeGap[], limit: number = 3): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const candidates: Interval[] = [];
  // fill from provided gaps first
  for (const gap of gaps) {
    candidates.push({ start_time: gap.start_time, end_time: gap.end_time });
  }
  // include slight shifts around candidate within 60 minutes window
  const toMinutes = (t: string) => parseInt(t.slice(0,2)) * 60 + parseInt(t.slice(3,5));
  const toTime = (m: number) => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
  const duration = toMinutes(candidate.end_time) - toMinutes(candidate.start_time);
  for (const delta of [15, 30, -15, -30, 45, -45, 60, -60]) {
    const s = toMinutes(candidate.start_time) + delta;
    const e = s + duration;
    if (s >= 0 && e <= 24*60) {
      candidates.push({ start_time: toTime(s), end_time: toTime(e) });
    }
  }
  for (const c of candidates) {
    if (suggestions.length >= limit) break;
    if (canSchedule(c, blocking)) {
      suggestions.push({ date: '', start_time: c.start_time, end_time: c.end_time });
    }
  }
  return suggestions;
}


