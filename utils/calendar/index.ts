import { DateRange } from '../../types/calendar';
import { UserPreferences, TimeGap } from '../../types/index';
import { CalendarBusyBlock } from '../../types/calendar';
// @ts-ignore - build systems may lag type discovery; relative path is correct
import { DeviceCalendarProvider } from './deviceProvider';
import { GapLogic } from '../gapLogic';
import { CalendarCache } from './cache';
import { CalendarDeduplicator } from './deduplicator';
import { getBlockingIntervals, canSchedule as _canSchedule, suggestAlternatives as _suggest } from '../validation/schedulingValidator';

export class CalendarService {
  private deviceProvider: DeviceCalendarProvider;
  private cache: CalendarCache;
  private dedup: CalendarDeduplicator;

  constructor() {
    this.deviceProvider = new DeviceCalendarProvider();
    this.cache = new CalendarCache();
    this.dedup = new CalendarDeduplicator();
  }

  async getBusyBlocks(dateRange: DateRange, preferences: UserPreferences): Promise<CalendarBusyBlock[]> {
    console.log('🔧 CalendarService.getBusyBlocks called with:', { dateRange, preferences: { 
      show_device_calendar_busy: preferences.show_device_calendar_busy,
      debugCalendarSync: preferences.debugCalendarSync,
      device_calendar_included_ids: preferences.device_calendar_included_ids
    }});
    
    try {
      const blocks = await this.deviceProvider.getBusyBlocks(dateRange, preferences);
      console.log('🔧 DeviceProvider returned blocks:', blocks);
      
      // Apply deduplication
      const deduped = this.dedup.deduplicateEvents(blocks, preferences);
      console.log('🔧 After deduplication:', deduped);
      
      // Cache the results
      await this.cache.setBusyBlocks(dateRange, deduped);
      console.log('🔧 Cached busy blocks');
      
      return deduped;
    } catch (error) {
      console.error('🔧 Error in CalendarService.getBusyBlocks:', error);
      // Try to return cached data on error
      try {
        const cached = await this.cache.getBusyBlocks(dateRange);
        console.log('🔧 Returning cached data on error:', cached);
        return cached;
      } catch {
        console.log('🔧 No cached data available, returning empty array');
        return [];
      }
    }
  }

  async getAvailableGaps(date: string, prefs: UserPreferences, tasks: any[], userId: string): Promise<TimeGap[]> {
    const base = GapLogic.recalculateGapsForDate(date, tasks, prefs, userId);
    if (!prefs?.show_device_calendar_busy) return base;
    const blocks = await this.getBusyBlocks({ start: date, end: date }, prefs);
    return GapLogic.applyBusyToGaps(base, blocks.filter(b => b.date === date));
  }

  async validateScheduling(candidate: { start_time: string; end_time: string }, date: string, prefs: UserPreferences): Promise<{ canSchedule: boolean; conflicts?: any[] }> {
    const blocks = await this.getBusyBlocks({ start: date, end: date }, prefs);
    const blocking = await getBlockingIntervals(date, blocks);
    const ok = _canSchedule(candidate, blocking);
    return ok ? { canSchedule: true } : { canSchedule: false, conflicts: blocking };
  }

  async suggestAlternatives(candidate: { start_time: string; end_time: string }, date: string, gaps: TimeGap[], prefs: UserPreferences) {
    const blocks = await this.getBusyBlocks({ start: date, end: date }, prefs);
    const blocking = await getBlockingIntervals(date, blocks);
    return _suggest(candidate, blocking, gaps);
  }
}

export const calendarService = new CalendarService();

