import { TimeGap, UserPreferences } from '../types/index';
import { GapLogic, normalizeWorkingDays } from './gapLogic';
import { calendarService } from './calendar/index';
import { supabase } from './supabase/client';
import { timeToMinutes } from './helpers';
import { format } from 'date-fns';
import { generateUUID } from './uuid';

/**
 * Gaps API with simplified gap logic implementation
 * Handles all gap-related operations with the new single-table architecture
 * Implements 14-day rolling window and automatic cleanup
 */
export class GapsAPI {
  // Local-only implementation: no server calls for gaps. Gaps are derived from tasks + preferences.

  /**
   * Update calendar service initialization status when gaps are successfully saved
   */
  private static updateCalendarInitializationStatus(): void {
    try {
      // Access the calendar service instance and update its initialization status
      if (calendarService && typeof calendarService.updateInitializationStatus === 'function') {
        calendarService.updateInitializationStatus();
      }
    } catch (error) {
      console.log('🚀 Could not update calendar initialization status:', error);
    }
  }

  /**
   * Check if we should use local fallback mode
   */
  // Compatibility shim (no longer used)
  // private static shouldUseFallback(_error: unknown): boolean { return true; }

  /**
   * Get gaps within the 14-day rolling window
   */
  static async getGapsInRollingWindow(_accessToken: string, storageManager?: any): Promise<TimeGap[]> {
    const startTime = performance.now();
    const { window_start, window_end } = GapLogic.calculateRollingWindow();
    console.log(`📅 Computing gaps locally for rolling window: ${window_start} to ${window_end}`);
    const startDate = new Date(window_start);
    const endDate = new Date(window_end);

    // Load preferences and tasks from provided storageManager; fallback to localStorage
    let preferences: UserPreferences | null = null;
    let tasks: any[] = [];
    if (storageManager) {
      try { preferences = await storageManager.getPreferences(); } catch {}
      try { tasks = await storageManager.getTasks(); } catch {}
    }
    if (!preferences) {
      // localStorage best-effort
      const uid = (await supabase.auth.getSession()).data.session?.user?.id || 'local-user';
      const prefKeyCandidates = [
        `gaply_preferences_${uid}`,
        'gaply_preferences',
        'user_preferences',
        'preferences'
      ];
      for (const key of prefKeyCandidates) {
        const raw = localStorage.getItem(key);
        if (raw) { preferences = JSON.parse(raw); break; }
      }
    }
    if (!preferences) return [];

    const normalizedWorkingDays = normalizeWorkingDays(preferences.calendar_working_days);
    const out: TimeGap[] = [];
    
    // Progressive loading: Load current day first, then others without calendar integration
    const today = new Date().toISOString().split('T')[0];
    let currentDayProcessed = false;
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = format(d, 'yyyy-MM-dd');
      const dayOfWeek = d.toLocaleDateString('en-US', { weekday: 'long' });
      if (!normalizedWorkingDays.includes(dayOfWeek)) continue;
      
      const dateTasks = tasks.filter((t: any) => t.dueDate === dateStr);
      let gaps: TimeGap[];
      
      // Only integrate calendar for current day on initial load
      if (preferences.show_device_calendar_busy && dateStr === today && !currentDayProcessed) {
        // 🚀 SAFEGUARD: Prevent calendar calls during app initialization
        const hasExistingGaps = localStorage.getItem(`gaply_gaps_${today}`);
        let isInitializationMode = !hasExistingGaps || hasExistingGaps === '[]' || hasExistingGaps === 'null';
        
        // Additional check: parse JSON and verify if there are actual gaps
        if (!isInitializationMode && hasExistingGaps) {
          try {
            const gaps = JSON.parse(hasExistingGaps);
            isInitializationMode = !Array.isArray(gaps) || gaps.length === 0;
          } catch (e) {
            isInitializationMode = true; // If parsing fails, assume initialization mode
          }
        }
        
        if (isInitializationMode) {
          console.log('🚀 Initialization mode detected in getGapsInRollingWindow, skipping calendar integration to prevent freezing');
          console.log('🚀 Calculating basic gaps for current day instead');
          gaps = GapLogic.recalculateGapsForDate(dateStr, dateTasks, preferences, 'local-user');
        } else {
          console.log('🚀 Progressive loading: Processing current day with calendar integration');
          gaps = await calendarService.getAvailableGaps(dateStr, preferences, dateTasks, 'local-user');
        }
        currentDayProcessed = true;
      } else {
        // For other days, just calculate basic gaps without calendar integration
        console.log(`📅 Progressive loading: Processing ${dateStr} without calendar integration`);
        gaps = GapLogic.recalculateGapsForDate(dateStr, dateTasks, preferences, 'local-user');
      }
      
      out.push(...gaps);
      if (storageManager) { try { await storageManager.saveGaps(gaps, dateStr); } catch {} }
    }
    
    // Initialize progressive calendar loading in background
    if (preferences.show_device_calendar_busy) {
      console.log('🚀 Progressive loading: Starting background calendar data loading');
      // Don't await this - let it run in background
      calendarService.initializeProgressiveLoading(preferences).catch(error => {
        console.error('🚀 Progressive loading error:', error);
      });
    }
    
    const endTime = performance.now();
    const duration = Math.round(endTime - startTime);
    console.log(`🚀 Progressive loading completed in ${duration}ms - ${out.length} gaps created`);
    
    return out;
  }

  /**
   * Clean up old gaps outside the rolling window
   */
  static async cleanupOldGaps(existingGaps: TimeGap[], _accessToken: string): Promise<{ deleted: number }> {
    const gapsToDelete = GapLogic.getGapsToCleanup(existingGaps);
    if (gapsToDelete.length === 0) return { deleted: 0 };
    // Local-only: caller should remove from local cache/storage; return count
    return { deleted: gapsToDelete.length };
  }

  /**
   * Preload gaps for smooth scrolling (+3 days beyond rolling window)
   */
  static async preloadGaps(preferences: UserPreferences, _accessToken: string): Promise<TimeGap[]> {
    const preloadDates = GapLogic.getPreloadDates();
    const preloadedGaps: TimeGap[] = [];
    
    console.log(`🔄 Preloading gaps for ${preloadDates.length} dates:`, preloadDates);
    
    for (const date of preloadDates) {
      try {
        const gaps = await this.initializeGapsForDate(date, preferences, '');
        preloadedGaps.push(...gaps);
      } catch (error) {
        console.warn(`⚠️ Failed to preload gaps for ${date}:`, error);
      }
    }
    
    console.log(`✅ Preloaded ${preloadedGaps.length} gaps`);
    return preloadedGaps;
  }

  /**
   * Restore gaps when a task is deleted
   */
  static async restoreGapsAfterTaskDeletion(
    taskDate: string,
    allTasks: any[],
    preferences: UserPreferences,
    _accessToken: string
  ): Promise<TimeGap[]> {
    console.log(`🔄 Restoring gaps after task deletion for ${taskDate}`);
    
    // Recalculate gaps for the date
    const restoredGaps = GapLogic.recalculateGapsForDate(
      taskDate,
      allTasks,
      preferences,
      'local-user' // Will be replaced with actual user ID
    );
    
    // No server persistence; gaps are derived. Caller may cache locally if desired.
    
    return restoredGaps;
  }

  /**
   * Create local fallback gaps when API is unavailable
   */
  static async createLocalFallbackGaps(
    date: string, 
    preferences: UserPreferences, 
    userId: string,
    storageManager?: any // Accept optional storage manager instance
  ): Promise<TimeGap[]> {
    try {
      // Create basic hourly gaps
      let gaps = GapLogic.createFreeHourGaps(date, preferences, userId);
      console.log(`✅ Created ${gaps.length} basic gaps for ${date}`);
      
      // Get existing tasks for this date and recalculate gaps to split around them
      try {
        if (storageManager) {
          const allTasks = await storageManager.getTasks();
          const dateTasks = allTasks.filter((task: any) => task.dueDate === date);
          
          if (dateTasks.length > 0) {
            console.log(`🔄 Recalculating gaps for ${dateTasks.length} existing tasks on ${date}`);
            gaps = GapLogic.recalculateGapsForDate(date, dateTasks, preferences, userId);
            console.log(`✅ Recalculated to ${gaps.length} gaps after considering existing tasks`);
          }
        }
      } catch (taskError) {
        console.warn('⚠️ Could not load tasks for gap recalculation:', taskError);
        // Continue with basic gaps if task loading fails
      }
      
      // Save gaps to Enhanced Storage Manager if available (cache only)
      try {
        if (storageManager) {
          // Use the provided storage manager instance
          await storageManager.saveGaps(gaps, date);
          console.log(`💾 Saved ${gaps.length} gaps to provided Enhanced Storage Manager for ${date}`);
        } else {
          // If no storage manager provided, save to localStorage as fallback
          console.warn('⚠️ No storage manager provided, saving to localStorage only');
          localStorage.setItem(`gaply_gaps_${date}`, JSON.stringify(gaps));
          console.log(`💾 Saved ${gaps.length} gaps to localStorage for ${date}`);
        }
      } catch (storageError) {
        console.warn('⚠️ Failed to save gaps to Enhanced Storage Manager:', storageError);
        // Fallback to localStorage
        try {
          localStorage.setItem(`gaply_gaps_${date}`, JSON.stringify(gaps));
          console.log(`💾 Saved ${gaps.length} gaps to localStorage for ${date}`);
        } catch (localStorageError) {
          console.error('❌ Failed to save gaps to localStorage:', localStorageError);
        }
      }
      
      // Also save to localStorage as backup for immediate access
      try {
        localStorage.setItem(`gaply_gaps_${date}`, JSON.stringify(gaps));
        console.log(`💾 Also saved ${gaps.length} gaps to localStorage as backup for ${date}`);
        
        // 🚀 Update calendar initialization status if we have actual gaps
        if (gaps.length > 0) {
          this.updateCalendarInitializationStatus();
        }
      } catch (localStorageError) {
        console.warn('⚠️ Failed to save gaps to localStorage backup:', localStorageError);
      }
      
      return gaps;
    } catch (error: unknown) {
      console.error('❌ Error creating local fallback gaps:', error);
      return [];
    }
  }

  /**
   * Get gaps for a specific date
   */
  static async getGapsForDate(date: string, _accessToken: string): Promise<TimeGap[]> {
    // Compute locally from cached tasks/preferences when possible; fallback to localStorage gaps cache
    try {
      let preferences: UserPreferences | null = null;
      let tasks: any[] = [];
      // Try to infer storageManager via minimal lazy import pattern (optional)
      try {
        // No shared singleton; skip
      } catch {}
      if (!preferences) {
        const uid = (await supabase.auth.getSession()).data.session?.user?.id || 'local-user';
        const prefKeys = [`gaply_preferences_${uid}`, 'gaply_preferences', 'user_preferences', 'preferences'];
        for (const key of prefKeys) { const raw = localStorage.getItem(key); if (raw) { preferences = JSON.parse(raw); break; } }
        const taskKey = `gaply_tasks_${uid}`;
        const rawTasks = localStorage.getItem(taskKey);
        if (rawTasks) { tasks = JSON.parse(rawTasks) || []; }
      }
      if (preferences) {
        const dateTasks = tasks.filter((t: any) => t.dueDate === date);
        
              // 🚀 PREVENT CALENDAR CALLS DURING INITIALIZATION
      // Check if we're in initialization mode (no existing gaps in storage)
      const hasExistingGaps = localStorage.getItem(`gaply_gaps_${date}`);
      let isInitializationMode = !hasExistingGaps || hasExistingGaps === '[]' || hasExistingGaps === 'null';
      
      // Additional check: parse JSON and verify if there are actual gaps
      if (!isInitializationMode && hasExistingGaps) {
        try {
          const gaps = JSON.parse(hasExistingGaps);
          isInitializationMode = !Array.isArray(gaps) || gaps.length === 0;
        } catch (e) {
          isInitializationMode = true; // If parsing fails, assume initialization mode
        }
      }
        
        if (isInitializationMode) {
          console.log('🚀 Initialization mode detected, skipping calendar integration to prevent freezing');
          console.log('🚀 Calculating basic gaps from tasks and preferences only');
          const gaps = GapLogic.recalculateGapsForDate(date, dateTasks, preferences, 'local-user');
          return gaps;
        }
        
        // Only integrate calendar if not in initialization mode
        if (preferences.show_device_calendar_busy) {
          return await calendarService.getAvailableGaps(date, preferences, dateTasks, 'local-user');
        } else {
          const gaps = GapLogic.recalculateGapsForDate(date, dateTasks, preferences, 'local-user');
          return gaps;
        }
      }
    } catch {}
    // Fallback to any locally cached gaps by date
    try {
      const localStorageKey = `gaply_gaps_${date}`;
      const storedGaps = localStorage.getItem(localStorageKey);
      if (storedGaps) return JSON.parse(storedGaps);
    } catch {}
    return [];
  }

  /**
   * Initialize gaps for a date (creates default gaps if none exist)
   */
  static async initializeGapsForDate(
    date: string, 
    preferences: UserPreferences, 
    _accessToken: string,
    userId?: string,
    storageManager?: any // Accept optional storage manager instance
  ): Promise<TimeGap[]> {
    console.log(`🚀 Initializing gaps locally for date: ${date}`);
    return await this.createLocalFallbackGaps(date, preferences, userId || 'local-user', storageManager);
  }

  /**
   * Schedule a task in a gap (splits the gap)
   */
  static async scheduleTaskInGap(
    _gapId: string,
    taskStartTime: string,
    _taskEndTime: string,
    taskData: any
  ): Promise<{ success: boolean; newGaps: TimeGap[]; task: any }> {
    // Local-only: set dueTime and mark scheduled. UI should recompute gaps for the day.
    return {
      success: true,
      newGaps: [],
      task: { ...taskData, id: taskData?.id || generateUUID(), dueTime: taskStartTime, status: 'scheduled' }
    };
  }

  /**
   * Save gaps (bulk operation)
   */
  static async saveGaps(_gaps: TimeGap[], _accessToken: string): Promise<void> {
    // No-op: gaps are derived from tasks + preferences. Persist tasks, not gaps.
    console.log('ℹ️ saveGaps called; ignored (gaps are derived locally).');
  }

  /**
   * Get all gaps (no date filter)
   */
  static async getAllGaps(_accessToken: string): Promise<TimeGap[]> {
    // Local cache only (best-effort)
    const today = new Date().toISOString().split('T')[0];
    try {
      const storedGaps = localStorage.getItem(`gaply_gaps_${today}`);
      if (storedGaps) return JSON.parse(storedGaps);
    } catch {}
    return [];
  }

  /**
   * High-level function: Ensure gaps exist for today
   */
  static async ensureTodayGaps(
    preferences: UserPreferences, 
    _accessToken: string,
    userId?: string,
    storageManager?: any // Accept optional storage manager instance
  ): Promise<TimeGap[]> {
    const today = new Date().toLocaleDateString('en-CA'); // Use consistent date format
    
    try {
      console.log('🔄 Ensuring gaps for today:', today);
      
      // First, try to get existing gaps
      let gaps: TimeGap[] = [];
      
      try {
        gaps = await this.getGapsForDate(today, '');
        console.log(`✅ Retrieved ${gaps.length} existing gaps for today`);
      } catch (fetchError: unknown) {
        console.log('🔄 Failed to fetch existing gaps, will try to initialize');
        gaps = [];
      }
      
      if (gaps.length === 0) {
        console.log('📝 No gaps found, initializing default gaps...');
        
        try {
          gaps = await this.initializeGapsForDate(today, preferences, '', userId, storageManager);
          console.log(`✅ Initialized ${gaps.length} gaps`);
        } catch (initError: unknown) {
          console.log('🔄 API initialization failed, creating local default gaps');
          gaps = await this.createLocalFallbackGaps(today, preferences, userId || 'local-user', storageManager);
          console.log(`✅ Created ${gaps.length} local default gaps as fallback`);
        }
      }
      
      return gaps;
    } catch (error: unknown) {
      console.log('🔄 Critical error in ensureTodayGaps, using emergency fallback');
      
      try {
        const fallbackGaps = await this.createLocalFallbackGaps(today, preferences, userId || 'local-user', storageManager);
        console.log(`🚨 Using emergency fallback gaps (${fallbackGaps.length} gaps)`);
        return fallbackGaps;
      } catch (fallbackError: unknown) {
        console.error('❌ Even fallback gap creation failed:', fallbackError);
        return [];
      }
    }
  }

  /**
   * Validation helper: Check for gap overlaps
   */
  static validateGaps(gaps: TimeGap[]): {valid: boolean, errors: string[]} {
    const errors: string[] = [];
    
    for (let i = 0; i < gaps.length; i++) {
      for (let j = i + 1; j < gaps.length; j++) {
        const gap1 = gaps[i];
        const gap2 = gaps[j];
        
        if (gap1.date === gap2.date) {
          const gap1Start = timeToMinutes(gap1.start_time);
          const gap1End = timeToMinutes(gap1.end_time);
          const gap2Start = timeToMinutes(gap2.start_time);
          const gap2End = timeToMinutes(gap2.end_time);
          
          if (gap1Start < gap2End && gap2Start < gap1End) {
            errors.push(`Gap overlap detected between ${gap1.id} and ${gap2.id} on ${gap1.date}`);
          }
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Update gaps when working time preferences change
   */
  static async updateGapsForWorkingTimeChange(
    oldPreferences: UserPreferences,
    newPreferences: UserPreferences,
    _accessToken: string
  ): Promise<{ success: boolean; created: number; deleted: number; updated: number }> {
    try {
      console.log('🔄 Updating gaps for working time change');
      
      // Check if working times actually changed
      const workStartChanged = oldPreferences.calendar_work_start !== newPreferences.calendar_work_start;
      const workEndChanged = oldPreferences.calendar_work_end !== newPreferences.calendar_work_end;
      const workingDaysChanged = JSON.stringify(oldPreferences.calendar_working_days) !== JSON.stringify(newPreferences.calendar_working_days);
      
      if (!workStartChanged && !workEndChanged && !workingDaysChanged) {
        console.log('🔄 No working time changes detected, skipping gap update');
        return { success: true, created: 0, deleted: 0, updated: 0 };
      }
      
      console.log('🔄 Working time changes detected:', {
        workStartChanged,
        workEndChanged,
        workingDaysChanged,
        oldWorkStart: oldPreferences.calendar_work_start,
        newWorkStart: newPreferences.calendar_work_start,
        oldWorkEnd: oldPreferences.calendar_work_end,
        newWorkEnd: newPreferences.calendar_work_end
      });
      
      // Local gap recalculation across rolling window
      console.log('🔄 Performing local gap recalculation for working time change');
      
      const { GapLogic } = await import('./gapLogic');
      const { window_start, window_end } = GapLogic.calculateRollingWindow();
      // no-op variable removed (today not used here)
      
      console.log(`📅 Recalculating gaps for rolling window: ${window_start} to ${window_end}`);
      
      let totalCreated = 0;
      let totalDeleted = 0;
      let totalUpdated = 0;
      
      // Get existing gaps for the rolling window
      const existingGaps = await this.getGapsInRollingWindow('');
      console.log(`📊 Found ${existingGaps.length} existing gaps to process`);
      
      // Process each date in the rolling window
      const startDate = new Date(window_start);
      const endDate = new Date(window_end);
      
      for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
        const dateStr = date.toLocaleDateString('en-CA');
        
        // Check if it's a working day
        const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
        const { normalizeWorkingDays } = await import('./gapLogic');
        const workingDays = normalizeWorkingDays(newPreferences.calendar_working_days);
        
        if (!workingDays.includes(dayOfWeek)) {
          console.log(`⏸️ Skipping non-working day: ${dateStr} (${dayOfWeek})`);
          continue;
        }
        
        // Get existing gaps for this date
        const existingGapsForDate = existingGaps.filter(gap => gap.date === dateStr);
        console.log(`📅 Processing ${dateStr}: ${existingGapsForDate.length} existing gaps`);
        
        // Create new gaps for this date with updated preferences
        const newGapsForDate = GapLogic.createFreeHourGaps(dateStr, newPreferences, existingGapsForDate[0]?.user_id || 'local-user');
        console.log(`📅 Created ${newGapsForDate.length} new gaps for ${dateStr}`);
        
        // Calculate changes
        const deleted = existingGapsForDate.length;
        const created = newGapsForDate.length;
        const updated = Math.min(deleted, created); // Gaps that were effectively updated
        
        totalDeleted += deleted;
        totalCreated += created;
        totalUpdated += updated;
        
        // No server save; caller may update local cache if desired
      }
      
      const result = {
        success: true,
        created: totalCreated,
        deleted: totalDeleted,
        updated: totalUpdated
      };
      
      console.log('✅ Local working time change processed:', result);
      return result;
      
    } catch (error: unknown) {
      console.error('❌ Error updating gaps for working time change:', error);
      throw error;
    }
  }
}

/**
 * Legacy API compatibility layer
 */
export const gapsAPI = {
  async get(accessToken?: string): Promise<TimeGap[]> {
    if (!accessToken) {
      console.warn('No access token provided for gaps API, using local fallback');
      const today = new Date().toISOString().split('T')[0];
      const storedGaps = localStorage.getItem(`gaply_gaps_${today}`);
      if (storedGaps) {
        return JSON.parse(storedGaps);
      }
      return [];
    }
    
    return await GapsAPI.getAllGaps(accessToken);
  },

  async save(gaps: TimeGap[], accessToken?: string): Promise<void> {
    if (!accessToken) {
      console.warn('No access token provided for gaps API, saving locally');
      const today = new Date().toISOString().split('T')[0];
      localStorage.setItem(`gaply_gaps_${today}`, JSON.stringify(gaps));
      
      // 🚀 Update calendar initialization status if we have actual gaps
      if (gaps.length > 0) {
        GapsAPI.updateCalendarInitializationStatus();
      }
      return;
    }
    
    const validation = GapsAPI.validateGaps(gaps);
    if (!validation.valid) {
      console.warn('Gap validation warnings:', validation.errors);
    }
    
    await GapsAPI.saveGaps(gaps, accessToken);
  },

  async getForDate(date: string, accessToken?: string): Promise<TimeGap[]> {
    if (!accessToken) {
      console.warn('No access token provided for gaps API, using local fallback');
      const storedGaps = localStorage.getItem(`gaply_gaps_${date}`);
      if (storedGaps) {
        return JSON.parse(storedGaps);
      }
      return [];
    }
    
    return await GapsAPI.getGapsForDate(date, accessToken);
  }
};