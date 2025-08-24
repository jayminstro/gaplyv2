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
  private static instance: CalendarService;
  private deviceProvider: DeviceCalendarProvider;
  private cache: CalendarCache;
  private dedup: CalendarDeduplicator;
  private calendarLoadingPromises: Map<string, Promise<CalendarBusyBlock[]>> = new Map();
  private loadingPhase: 'current' | 'future' | 'past' | 'complete' = 'current';
  private isInitializing = false;
  private isInitializationMode = true; // 🚀 Global initialization flag
  private initializationCheckDone = false; // 🚀 Track if we've checked initialization status

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
      const deduped = this.dedup.deduplicateEvents(blocks, preferences.calendar_dedupe_strategy || 'auto');
      console.log('🔧 After deduplication:', deduped);
      
      // Cache the results
      await this.cache.setBusyBlocks(dateRange.start, deduped.kept);
      console.log('🔧 Cached busy blocks');
      
      return deduped.kept;
    } catch (error) {
      console.error('🔧 Error in CalendarService.getBusyBlocks:', error);
      // Try to return cached data on error
      try {
        const cached = await this.cache.getBusyBlocks(dateRange.start);
        console.log('🔧 Returning cached data on error:', cached);
        return cached || [];
      } catch {
        console.log('🔧 No cached data available, returning empty array');
        return [];
      }
    }
  }

  async getAvailableGaps(date: string, prefs: UserPreferences, tasks: any[], userId: string): Promise<TimeGap[]> {
    const base = GapLogic.recalculateGapsForDate(date, tasks, prefs, userId);
    
    // Don't block gap calculation with calendar data on initial load
    if (!prefs?.show_device_calendar_busy) return base;
    
    // Load calendar data asynchronously to prevent blocking
    this.loadCalendarDataAsync({ start: date, end: date }, prefs);
    
    return base;
  }

  /**
   * Load calendar data asynchronously without blocking the UI
   */
  private async loadCalendarDataAsync(dateRange: DateRange, preferences: UserPreferences): Promise<void> {
    try {
      // 🚀 SAFEGUARD: Prevent calendar calls during app initialization
      if (this.checkInitializationStatus()) {
        console.log('🚀 Initialization mode detected in loadCalendarDataAsync, skipping calendar fetch to prevent freezing');
        console.log('🚀 Calendar data will be loaded later via progressive loading');
        return;
      }
      
      // Load calendar data in background without blocking UI
      const blocks = await this.getBusyBlocks(dateRange, preferences);
      console.log('🚀 Calendar data loaded asynchronously:', blocks.length, 'blocks');
    } catch (error) {
      console.error('🚀 Error loading calendar data asynchronously:', error);
    }
  }

  /**
   * Progressive calendar data loading strategy:
   * 1. Current day (immediate, blocking)
   * 2. Future days (async, high priority)
   * 3. Past days (async, low priority)
   */
  async initializeProgressiveLoading(preferences: UserPreferences): Promise<void> {
    if (this.loadingPhase !== 'current' || this.isInitializing) {
      console.log('🚀 Progressive loading already in progress or completed, skipping');
      return;
    }
    
    this.isInitializing = true;
    console.log('🚀 Starting progressive calendar data loading...');
    
    try {
      // Phase 1: Current day (immediate)
      await this.loadCurrentDayData(preferences);
      this.loadingPhase = 'future';
      
      // Phase 2: Future data (async, high priority)
      this.loadFutureDataAsync(preferences);
      
      // Phase 3: Past data (async, low priority)
      this.loadPastDataAsync(preferences);
      
    } catch (error) {
      console.error('🚀 Error in progressive loading:', error);
      this.loadingPhase = 'complete';
    } finally {
      this.isInitializing = false;
    }
  }

  private async loadCurrentDayData(preferences: UserPreferences): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    console.log('🚀 Phase 1: Loading current day data for', today);
    
    try {
      // 🚀 SAFEGUARD: Prevent calendar calls during app initialization
      if (this.checkInitializationStatus()) {
        console.log('🚀 Initialization mode detected in loadCurrentDayData, skipping calendar fetch to prevent freezing');
        console.log('🚀 Calendar data will be loaded later via progressive loading');
        return;
      }
      
      const blocks = await this.getBusyBlocks({ start: today, end: today }, preferences);
      console.log('🚀 Current day data loaded:', blocks.length, 'blocks');
      
      // If we successfully loaded calendar data, we can exit initialization mode
      if (blocks.length > 0) {
        this.updateInitializationStatus();
      }
    } catch (error) {
      console.error('🚀 Error loading current day data:', error);
    }
  }

  private async loadFutureDataAsync(preferences: UserPreferences): Promise<void> {
    console.log('🚀 Phase 2: Starting async future data loading...');
    
    // Load next 14 days
    const today = new Date();
    const futureEnd = new Date(today);
    futureEnd.setDate(today.getDate() + 14);
    
    const startDate = today.toISOString().split('T')[0];
    const endDate = futureEnd.toISOString().split('T')[0];
    
    console.log('🚀 Loading future data from', startDate, 'to', endDate);
    
    // Use setTimeout to ensure this runs after current execution
    setTimeout(async () => {
      try {
        const blocks = await this.getBusyBlocks({ start: startDate, end: endDate }, preferences);
        console.log('🚀 Future data loaded:', blocks.length, 'blocks');
        this.loadingPhase = 'past';
      } catch (error) {
        console.error('🚀 Error loading future data:', error);
        this.loadingPhase = 'complete';
      }
    }, 100);
  }

  private async loadPastDataAsync(preferences: UserPreferences): Promise<void> {
    console.log('🚀 Phase 3: Starting async past data loading...');
    
    // Load past 7 days
    const today = new Date();
    const pastStart = new Date(today);
    pastStart.setDate(today.getDate() - 7);
    
    const startDate = pastStart.toISOString().split('T')[0];
    const endDate = today.toISOString().split('T')[0];
    
    console.log('🚀 Loading past data from', startDate, 'to', endDate);
    
    // Use setTimeout with longer delay for past data (lower priority)
    setTimeout(async () => {
      try {
        const blocks = await this.getBusyBlocks({ start: startDate, end: endDate }, preferences);
        console.log('🚀 Past data loaded:', blocks.length, 'blocks');
        this.loadingPhase = 'complete';
      } catch (error) {
        console.error('🚀 Error loading past data:', error);
        this.loadingPhase = 'complete';
      }
    }, 1000); // 1 second delay for past data
  }

  async getCalendarDataWhenReady(dateRange: DateRange, preferences: UserPreferences): Promise<CalendarBusyBlock[]> {
    const key = `${dateRange.start}-${dateRange.end}`;
    
    if (this.calendarLoadingPromises.has(key)) {
      return this.calendarLoadingPromises.get(key)!;
    }
    
    const promise = this.getBusyBlocks(dateRange, preferences);
    this.calendarLoadingPromises.set(key, promise);
    
    // Clean up the promise after completion
    promise.finally(() => this.calendarLoadingPromises.delete(key));
    
    return promise;
  }

  isCalendarLoading(dateRange: DateRange): boolean {
    const key = `${dateRange.start}-${dateRange.end}`;
    return this.calendarLoadingPromises.has(key);
  }

  getLoadingPhase(): string {
    return this.loadingPhase;
  }

  isProgressiveLoadingComplete(): boolean {
    return this.loadingPhase === 'complete';
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

  /**
   * Check if we should exit initialization mode based on localStorage data
   */
  private checkInitializationStatus(): boolean {
    if (this.initializationCheckDone) {
      return this.isInitializationMode;
    }
    
    const today = new Date().toISOString().split('T')[0];
    const hasExistingGaps = localStorage.getItem(`gaply_gaps_${today}`);
    
    if (!hasExistingGaps || hasExistingGaps === '[]' || hasExistingGaps === 'null') {
      this.isInitializationMode = true;
    } else {
      try {
        const gaps = JSON.parse(hasExistingGaps);
        this.isInitializationMode = !Array.isArray(gaps) || gaps.length === 0;
      } catch (e) {
        this.isInitializationMode = true;
      }
    }
    
    this.initializationCheckDone = true;
    console.log('🚀 Initialization status checked:', this.isInitializationMode ? 'INITIALIZATION MODE' : 'NORMAL MODE');
    return this.isInitializationMode;
  }

  /**
   * Update initialization status when we have actual data
   */
  public updateInitializationStatus(): void {
    this.isInitializationMode = false;
    this.initializationCheckDone = true;
    console.log('🚀 Exited initialization mode - calendar integration now enabled');
  }
}

export const calendarService = new CalendarService();

