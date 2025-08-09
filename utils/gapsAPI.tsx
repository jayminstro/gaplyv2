import { TimeGap, UserPreferences } from '../types/index';
import { GapLogic, normalizeWorkingDays } from './gapLogic';
import { supabaseConfig } from './supabase/config';
import { supabase } from './supabase/client';
import { timeToMinutes } from './helpers';
import { generateUUID } from './uuid';

/**
 * Gaps API with simplified gap logic implementation
 * Handles all gap-related operations with the new single-table architecture
 * Implements 14-day rolling window and automatic cleanup
 */
export class GapsAPI {
  private static readonly BASE_URL = `https://${supabaseConfig.projectId}.supabase.co/functions/v1/make-server-966d4846`;
  private static readonly TIMEOUT_MS = 5000;
  private static readonly LOCAL_DEVELOPMENT = false; // Temporarily disabled to sync with production

  /**
   * Helper method to create a fetch request with timeout
   */
  private static async fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timed out after ${this.TIMEOUT_MS}ms`);
      }
      throw error;
    }
  }

  /**
   * Check if we should use local fallback mode
   */
  private static shouldUseFallback(error: unknown): boolean {
    if (this.LOCAL_DEVELOPMENT) {
      return true;
    }
    
    const errorMessage = error instanceof Error ? error.message.toLowerCase() : '';
    const isNetworkError = errorMessage.includes('fetch') || 
                          errorMessage.includes('network') ||
                          errorMessage.includes('timeout') ||
                          errorMessage.includes('404') ||
                          errorMessage.includes('failed to fetch');
    
    return isNetworkError;
  }

  /**
   * Get gaps within the 14-day rolling window
   */
  static async getGapsInRollingWindow(accessToken: string, storageManager?: any): Promise<TimeGap[]> {
    const { window_start, window_end } = GapLogic.calculateRollingWindow();
    
    try {
      console.log(`📅 Fetching gaps for rolling window: ${window_start} to ${window_end}`);
      
      if (this.LOCAL_DEVELOPMENT) {
        console.log(`🔧 Development mode - using local fallback for rolling window gaps`);
        throw new Error('Development mode - using local fallback');
      }
      
      const response = await this.fetchWithTimeout(
        `${this.BASE_URL}/gaps?start_date=${window_start}&end_date=${window_end}`, 
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Server error response: ${response.status} ${response.statusText}`);
        throw new Error(`Failed to fetch rolling window gaps: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const gaps = await response.json();
      console.log(`✅ Retrieved ${gaps.length} gaps for rolling window`);
      return gaps;
    } catch (error: unknown) {
      if (this.shouldUseFallback(error)) {
        console.log('🔄 Rolling window API unavailable, creating local fallback gaps for rolling window');
        
        // Create local gaps for the rolling window
        const localGaps: TimeGap[] = [];
        const startDate = new Date(window_start);
        const endDate = new Date(window_end);
        
                // Get user preferences - try storage manager first, then localStorage
        let preferences = null;
        
        if (storageManager) {
          try {
            console.log('🔍 Loading preferences from storage manager for rolling window...');
            preferences = await storageManager.getPreferences();
            if (preferences) {
              console.log(`✅ Found preferences from storage manager:`, {
                work_start: preferences.calendar_work_start,
                work_end: preferences.calendar_work_end,
                working_days: preferences.calendar_working_days
              });
            }
          } catch (storageError) {
            console.warn('⚠️ Could not load preferences from storage manager:', storageError);
          }
        }
        
        // Fallback to localStorage if storage manager failed or not provided
        if (!preferences) {
          try {
            // First try to get user ID from current session storage
            let userId = 'local-user';
            try {
              const sessionData = sessionStorage.getItem('gaply_session');
              if (sessionData) {
                const session = JSON.parse(sessionData);
                userId = session.user?.id || 'local-user';
              }
            } catch (sessionError) {
              console.warn('⚠️ Could not load session for userId:', sessionError);
            }

            // Try user-specific preference keys first, then generic ones
            const possibleKeys = [
              `gaply_preferences_${userId}`,
              'gaply_preferences',
              'user_preferences',
              'preferences'
            ];

            for (const key of possibleKeys) {
              const prefsData = localStorage.getItem(key);
              if (prefsData) {
                preferences = JSON.parse(prefsData);
                console.log(`📋 Found preferences in localStorage key: ${key}`);
                console.log(`🔍 Loaded preferences:`, {
                  work_start: preferences.calendar_work_start,
                  work_end: preferences.calendar_work_end,
                  working_days: preferences.calendar_working_days
                });
                break;
              }
            }
            
            if (!preferences) {
              console.warn('⚠️ No preferences found in any localStorage keys');
            }
          } catch (prefsError) {
            console.warn('⚠️ Could not load preferences for rolling window gaps:', prefsError);
            preferences = null;
          }
        }
        
        if (!preferences) {
          console.log('⚠️ No preferences available, skipping rolling window gap creation');
          return [];
        }
        
        // Get actual user ID from session or storage
        let userId = 'local-user';
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user?.id) {
            userId = session.user.id;
          }
        } catch (sessionError) {
          console.warn('⚠️ Could not get user ID from session:', sessionError);
        }
        
        // Create gaps for each day in the rolling window
        // Normalize working days once to handle any server/client shape
        const normalizedWorkingDays = normalizeWorkingDays(preferences.calendar_working_days);
        for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
          const dateStr = date.toLocaleDateString('en-CA');
          
          // Check if it's a working day
          const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
          if (!normalizedWorkingDays.includes(dayOfWeek)) {
            console.log(`⏸️ Skipping non-working day: ${dateStr} (${dayOfWeek})`);
            continue;
          }
          
          const dayGaps = GapLogic.createFreeHourGaps(dateStr, preferences, userId);
          localGaps.push(...dayGaps);
          console.log(`✅ Created ${dayGaps.length} gaps for ${dateStr} (${dayOfWeek})`);
        }
        
        // Save gaps to storage if storage manager is available
        if (storageManager && localGaps.length > 0) {
          try {
            console.log('💾 Saving rolling window gaps to storage...');
            // Group gaps by date and save
            const gapsByDate = new Map<string, TimeGap[]>();
            localGaps.forEach(gap => {
              const date = gap.date || new Date().toLocaleDateString('en-CA');
              if (!gapsByDate.has(date)) {
                gapsByDate.set(date, []);
              }
              gapsByDate.get(date)!.push(gap);
            });
            
            // Save each date's gaps
            for (const [date, gaps] of gapsByDate.entries()) {
              await storageManager.saveGaps(gaps, date);
            }
            console.log(`💾 Saved ${localGaps.length} gaps across ${gapsByDate.size} dates to storage`);
          } catch (storageError) {
            console.warn('⚠️ Could not save rolling window gaps to storage:', storageError);
          }
        }
        
        console.log(`✅ Created ${localGaps.length} local fallback gaps for rolling window`);
        return localGaps;
      }
      throw error;
    }
  }

  /**
   * Clean up old gaps outside the rolling window
   */
  static async cleanupOldGaps(existingGaps: TimeGap[], accessToken: string): Promise<{ deleted: number }> {
    const gapsToDelete = GapLogic.getGapsToCleanup(existingGaps);
    
    if (gapsToDelete.length === 0) {
      console.log('🧹 No old gaps to clean up');
      return { deleted: 0 };
    }
    
    console.log(`🧹 Cleaning up ${gapsToDelete.length} old gaps`);
    
    try {
      if (this.LOCAL_DEVELOPMENT) {
        console.log('🔧 Development mode - cleanup simulated locally');
        return { deleted: gapsToDelete.length };
      }
      
      const response = await this.fetchWithTimeout(`${this.BASE_URL}/gaps/cleanup`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ gapIds: gapsToDelete })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Cleanup failed:', response.status, errorText);
        throw new Error(`Cleanup failed: ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      console.log(`✅ Cleaned up ${result.deleted} old gaps`);
      return result;
    } catch (error: unknown) {
      if (this.shouldUseFallback(error)) {
        console.log('🔄 Cleanup API unavailable - will cleanup locally');
        return { deleted: gapsToDelete.length };
      }
      throw error;
    }
  }

  /**
   * Preload gaps for smooth scrolling (+3 days beyond rolling window)
   */
  static async preloadGaps(preferences: UserPreferences, accessToken: string): Promise<TimeGap[]> {
    const preloadDates = GapLogic.getPreloadDates();
    const preloadedGaps: TimeGap[] = [];
    
    console.log(`🔄 Preloading gaps for ${preloadDates.length} dates:`, preloadDates);
    
    for (const date of preloadDates) {
      try {
        const gaps = await this.initializeGapsForDate(date, preferences, accessToken);
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
    accessToken: string
  ): Promise<TimeGap[]> {
    console.log(`🔄 Restoring gaps after task deletion for ${taskDate}`);
    
    // Recalculate gaps for the date
    const restoredGaps = GapLogic.recalculateGapsForDate(
      taskDate,
      allTasks,
      preferences,
      'local-user' // Will be replaced with actual user ID
    );
    
    if (restoredGaps.length > 0) {
      try {
        await this.saveGaps(restoredGaps, accessToken);
        console.log(`✅ Restored ${restoredGaps.length} gaps for ${taskDate}`);
      } catch (error) {
        console.warn(`⚠️ Failed to save restored gaps:`, error);
      }
    }
    
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
      
      // Save gaps to Enhanced Storage Manager if available
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
  static async getGapsForDate(date: string, accessToken: string): Promise<TimeGap[]> {
    try {
      console.log(`📅 Fetching gaps for date: ${date}`);
      
      if (this.LOCAL_DEVELOPMENT) {
        console.log(`🔧 Development mode - using local fallback for gaps`);
        throw new Error('Development mode - using local fallback');
      }
      
      const response = await this.fetchWithTimeout(`${this.BASE_URL}/gaps?date=${date}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Server error response: ${response.status} ${response.statusText}`);
        throw new Error(`Failed to fetch gaps: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const gaps = await response.json();
      console.log(`✅ Retrieved ${gaps.length} gaps for ${date}`);
      return gaps;
    } catch (error: unknown) {
      if (this.shouldUseFallback(error)) {
        console.log('🔄 API unavailable, checking localStorage for gaps');
        
        // Try to get gaps from localStorage as fallback
        try {
          const localStorageKey = `gaply_gaps_${date}`;
          const storedGaps = localStorage.getItem(localStorageKey);
          
          if (storedGaps) {
            const gaps = JSON.parse(storedGaps);
            console.log(`✅ Retrieved ${gaps.length} gaps from localStorage for ${date}`);
            return gaps;
          } else {
            console.log(`📝 No gaps found in localStorage for ${date}`);
            return [];
          }
        } catch (localStorageError) {
          console.warn('⚠️ Failed to read gaps from localStorage:', localStorageError);
          return [];
        }
      }
      throw error;
    }
  }

  /**
   * Initialize gaps for a date (creates default gaps if none exist)
   */
  static async initializeGapsForDate(
    date: string, 
    preferences: UserPreferences, 
    accessToken: string,
    userId?: string,
    storageManager?: any // Accept optional storage manager instance
  ): Promise<TimeGap[]> {
    try {
      console.log(`🚀 Initializing gaps for date: ${date}`);
      
      if (this.LOCAL_DEVELOPMENT) {
        console.log(`🔧 Development mode - creating local gaps directly`);
        return await this.createLocalFallbackGaps(date, preferences, userId || 'local-user', storageManager);
      }
      
      const response = await this.fetchWithTimeout(`${this.BASE_URL}/gaps/initialize`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ date, preferences })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Server error response:', response.status, errorText);
        throw new Error(`Failed to initialize gaps: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      console.log('✅ Gap initialization response:', result);
      
      // Get all gaps for the date after initialization
      return await this.getGapsForDate(date, accessToken);
    } catch (error: unknown) {
      if (this.shouldUseFallback(error)) {
        console.log('🔄 API unavailable, creating local gaps directly');
        return await this.createLocalFallbackGaps(date, preferences, userId || 'local-user');
      }
      
      console.error('❌ Error initializing gaps:', error);
      throw error;
    }
  }

  /**
   * Schedule a task in a gap (splits the gap)
   */
  static async scheduleTaskInGap(
    gapId: string,
    taskStartTime: string,
    taskEndTime: string,
    taskData: any,
    accessToken: string
  ): Promise<{ success: boolean; newGaps: TimeGap[]; task: any }> {
    try {
      console.log(`📌 Scheduling task in gap ${gapId} from ${taskStartTime} to ${taskEndTime}`);
      
      if (this.LOCAL_DEVELOPMENT) {
        console.log(`🔧 Development mode - gap splitting not fully available locally`);
        // For development, simulate the operation
        return {
          success: true,
          newGaps: [],
          task: { ...taskData, id: generateUUID() }
        };
      }
      
      const response = await this.fetchWithTimeout(`${this.BASE_URL}/gaps/schedule`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ gapId, taskStartTime, taskEndTime, taskData })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Server responded with error:', response.status, errorText);
        throw new Error(`Failed to schedule task: ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        console.error('❌ Task scheduling failed on server:', result);
        throw new Error(result.error || 'Unknown server error');
      }
      
      console.log(`✅ Task scheduled successfully, created ${result.newGaps?.length || 0} new gaps`);
      
      return result;
    } catch (error: unknown) {
      if (this.shouldUseFallback(error)) {
        console.log('🔄 Task scheduling API unavailable - using local fallback');
        return {
          success: true,
          newGaps: [],
          task: { ...taskData, id: generateUUID() }
        };
      }
      
      console.error('❌ Error scheduling task:', {
        error,
        gapId,
        taskStartTime,
        taskEndTime,
        taskData
      });
      throw error;
    }
  }

  /**
   * Save gaps (bulk operation)
   */
  static async saveGaps(gaps: TimeGap[], accessToken: string): Promise<void> {
    try {
      console.log(`💾 Saving ${gaps.length} gaps`);
      
      if (this.LOCAL_DEVELOPMENT) {
        console.log(`🔧 Development mode - gaps saved to local storage as fallback`);
        const today = new Date().toISOString().split('T')[0];
        try {
          localStorage.setItem(`gaply_gaps_${today}`, JSON.stringify(gaps));
        } catch (error: unknown) {
          console.error('Failed to save gaps to localStorage in development mode:', error);
        }
        return;
      }
      
      const response = await this.fetchWithTimeout(`${this.BASE_URL}/gaps`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(gaps)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Server error response:', response.status, errorText);
        throw new Error(`Failed to save gaps: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      console.log('✅ Gap saving response:', result);
      console.log(`✅ Saved ${gaps.length} gaps successfully`);
    } catch (error: unknown) {
      if (this.shouldUseFallback(error)) {
        console.log('🔄 Gap saving API unavailable - storing locally');
        const today = new Date().toISOString().split('T')[0];
        try {
          localStorage.setItem(`gaply_gaps_${today}`, JSON.stringify(gaps));
        } catch (storageError: unknown) {
          console.error('Failed to save gaps to localStorage fallback:', storageError);
          throw new Error('Both API and localStorage failed to save gaps');
        }
        return;
      }
      
      console.error('❌ Error saving gaps:', error);
      throw error;
    }
  }

  /**
   * Get all gaps (no date filter)
   */
  static async getAllGaps(accessToken: string): Promise<TimeGap[]> {
    try {
      console.log('📅 Fetching all gaps');
      
      if (this.LOCAL_DEVELOPMENT) {
        console.log(`🔧 Development mode - loading gaps from local storage`);
        const today = new Date().toISOString().split('T')[0];
        try {
          const storedGaps = localStorage.getItem(`gaply_gaps_${today}`);
          if (storedGaps) {
            const gaps = JSON.parse(storedGaps);
            console.log(`✅ Loaded ${gaps.length} gaps from local storage`);
            return gaps;
          }
        } catch (error: unknown) {
          console.error('Failed to read gaps from localStorage in development mode:', error);
        }
        return [];
      }
      
      const response = await this.fetchWithTimeout(`${this.BASE_URL}/gaps`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch gaps: ${response.statusText}`);
      }

      const gaps = await response.json();
      console.log(`✅ Retrieved ${gaps.length} total gaps`);
      
      return gaps;
    } catch (error: unknown) {
      if (this.shouldUseFallback(error)) {
        console.log('🔄 Gap fetching API unavailable - checking local storage');
        const today = new Date().toISOString().split('T')[0];
        try {
          const storedGaps = localStorage.getItem(`gaply_gaps_${today}`);
          if (storedGaps) {
            return JSON.parse(storedGaps);
          }
        } catch (storageError: unknown) {
          console.error('Failed to read gaps from localStorage fallback:', storageError);
        }
        return [];
      }
      
      console.error('❌ Error fetching all gaps:', error);
      throw error;
    }
  }

  /**
   * High-level function: Ensure gaps exist for today
   */
  static async ensureTodayGaps(
    preferences: UserPreferences, 
    accessToken: string,
    userId?: string,
    storageManager?: any // Accept optional storage manager instance
  ): Promise<TimeGap[]> {
    const today = new Date().toLocaleDateString('en-CA'); // Use consistent date format
    
    try {
      console.log('🔄 Ensuring gaps for today:', today);
      
      // First, try to get existing gaps
      let gaps: TimeGap[] = [];
      
      try {
        gaps = await this.getGapsForDate(today, accessToken);
        console.log(`✅ Retrieved ${gaps.length} existing gaps for today`);
      } catch (fetchError: unknown) {
        console.log('🔄 Failed to fetch existing gaps, will try to initialize');
        gaps = [];
      }
      
      if (gaps.length === 0) {
        console.log('📝 No gaps found, initializing default gaps...');
        
        try {
          gaps = await this.initializeGapsForDate(today, preferences, accessToken, userId, storageManager);
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
    accessToken: string
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
      
      // Try backend API first
      try {
        const response = await this.fetchWithTimeout(`${this.BASE_URL}/gaps/update-working-time`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ oldPreferences, newPreferences })
        });

        if (response.ok) {
          const result = await response.json();
          console.log('✅ Working time change processed by backend:', result);
          return result;
        }
      } catch (apiError) {
        console.log('🔄 Backend API unavailable, using local gap recalculation');
      }
      
      // Fallback to local gap recalculation
      console.log('🔄 Performing local gap recalculation for working time change');
      
      const { GapLogic } = await import('./gapLogic');
      const { window_start, window_end } = GapLogic.calculateRollingWindow();
      // no-op variable removed (today not used here)
      
      console.log(`📅 Recalculating gaps for rolling window: ${window_start} to ${window_end}`);
      
      let totalCreated = 0;
      let totalDeleted = 0;
      let totalUpdated = 0;
      
      // Get existing gaps for the rolling window
      const existingGaps = await this.getGapsInRollingWindow(accessToken);
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
        
        // Save new gaps for this date
        try {
          await this.saveGaps(newGapsForDate, accessToken);
          console.log(`✅ Saved ${newGapsForDate.length} new gaps for ${dateStr}`);
        } catch (saveError) {
          console.warn(`⚠️ Failed to save gaps for ${dateStr}:`, saveError);
        }
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