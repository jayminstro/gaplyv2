import { TimeGap, UserPreferences } from '../types/index';
import { GapLogic, GapManager } from './gapLogic';
import { supabaseConfig } from './supabase/config';
import { timeToMinutes, minutesToTime } from './helpers';
import { generateUUID } from './uuid';

/**
 * Gaps API with simplified gap logic implementation
 * Handles all gap-related operations with the new single-table architecture
 */
export class GapsAPI {
  private static readonly BASE_URL = `https://${supabaseConfig.projectId}.supabase.co/functions/v1/make-server-966d4846`;
  private static readonly TIMEOUT_MS = 5000;
  private static readonly LOCAL_DEVELOPMENT = process.env.NODE_ENV === 'development';

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
   * Create local fallback gaps when API is unavailable
   */
  private static async createLocalFallbackGaps(
    date: string, 
    preferences: UserPreferences, 
    userId: string = 'local-user'
  ): Promise<TimeGap[]> {
    try {
      const gaps = GapLogic.createFreeHourGaps(date, preferences, userId);
      console.log(`✅ Created ${gaps.length} local fallback gaps for ${date}`);
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
      
      if (!Array.isArray(gaps)) {
        console.warn('⚠️ Server returned non-array gaps response:', gaps);
        return [];
      }
      
      console.log(`✅ Retrieved ${gaps.length} gaps for ${date}`);
      return gaps;
    } catch (error: unknown) {
      if (this.shouldUseFallback(error)) {
        console.log('🔄 API unavailable, using local fallback gaps');
        const { DEFAULT_PREFERENCES } = await import('./constants');
        return await this.createLocalFallbackGaps(date, DEFAULT_PREFERENCES);
      }
      
      console.error('❌ Error fetching gaps:', error);
      throw error;
    }
  }

  /**
   * Initialize gaps for a date (creates default gaps if none exist)
   */
  static async initializeGapsForDate(
    date: string, 
    preferences: UserPreferences, 
    accessToken: string
  ): Promise<TimeGap[]> {
    try {
      console.log(`🚀 Initializing gaps for date: ${date}`);
      
      if (this.LOCAL_DEVELOPMENT) {
        console.log(`🔧 Development mode - creating local gaps directly`);
        return await this.createLocalFallbackGaps(date, preferences);
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
        return await this.createLocalFallbackGaps(date, preferences);
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
    accessToken: string
  ): Promise<TimeGap[]> {
    const today = new Date().toISOString().split('T')[0];
    
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
          gaps = await this.initializeGapsForDate(today, preferences, accessToken);
          console.log(`✅ Initialized ${gaps.length} gaps`);
        } catch (initError: unknown) {
          console.log('🔄 API initialization failed, creating local default gaps');
          gaps = await this.createLocalFallbackGaps(today, preferences);
          console.log(`✅ Created ${gaps.length} local default gaps as fallback`);
        }
      }
      
      return gaps;
    } catch (error: unknown) {
      console.log('🔄 Critical error in ensureTodayGaps, using emergency fallback');
      
      try {
        const fallbackGaps = await this.createLocalFallbackGaps(today, preferences);
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
      
      if (this.LOCAL_DEVELOPMENT) {
        console.log('🔧 Development mode - working time change not fully available locally');
        return { success: true, created: 0, deleted: 0, updated: 0 };
      }
      
      const response = await this.fetchWithTimeout(`${this.BASE_URL}/gaps/update-working-time`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ oldPreferences, newPreferences })
      });

      if (!response.ok) {
        throw new Error(`Failed to update gaps: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('✅ Working time change processed:', result);
      
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