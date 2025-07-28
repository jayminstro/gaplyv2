import { TimeGap, UserPreferences } from '../types/index';
import { GapLogic, GapManager } from './gapLogic';
import { projectId, publicAnonKey } from './supabase/info';
import { safeTimeToMinutes } from './helpers';

/**
 * Gaps API with gap logic implementation
 * Handles all gap-related operations following the priority system
 */
export class GapsAPI {
  private static readonly BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-966d4846`;

  /**
   * Get gaps for a specific date with priority filtering
   */
  static async getGapsForDate(date: string, accessToken: string): Promise<TimeGap[]> {
    try {
      console.log(`📅 Fetching gaps for date: ${date}`);
      
      const response = await fetch(`${this.BASE_URL}/gaps?date=${date}`, {
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
      
      // Apply gap logic priority filtering
      const filteredGaps = GapLogic.filterGapsByPriority(gaps, date);
      
      console.log(`✅ Retrieved ${filteredGaps.length} gaps for ${date}`, filteredGaps);
      return filteredGaps;
    } catch (error) {
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
      
      const response = await fetch(`${this.BASE_URL}/gaps/initialize`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ date })
      });

      if (!response.ok) {
        throw new Error(`Failed to initialize gaps: ${response.statusText}`);
      }

      const result = await response.json();
      
      // Get all gaps for the date after initialization
      return await this.getGapsForDate(date, accessToken);
    } catch (error) {
      console.error('❌ Error initializing gaps:', error);
      throw error;
    }
  }

  /**
   * Process calendar sync for a date
   */
  static async processCalendarSync(
    date: string,
    calendarEvents: Array<{start: string, end: string, title: string}>,
    accessToken: string
  ): Promise<{gaps: TimeGap[], replaced: boolean}> {
    try {
      console.log(`📅 Processing calendar sync for ${date} with ${calendarEvents.length} events`);
      
      const response = await fetch(`${this.BASE_URL}/gaps/calendar-sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ date, calendarEvents })
      });

      if (!response.ok) {
        throw new Error(`Failed to process calendar sync: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.preserved) {
        console.log(`⚠️ Calendar sync skipped for ${date} - manual gaps exist`);
        const gaps = await this.getGapsForDate(date, accessToken);
        return { gaps, replaced: false };
      }

      console.log(`✅ Calendar sync completed for ${date}, created ${result.gaps.length} gaps`);
      return { gaps: result.gaps, replaced: true };
    } catch (error) {
      console.error('❌ Error processing calendar sync:', error);
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
    modifiedBy: 'user' | 'ai_assistant' = 'user',
    accessToken: string
  ): Promise<TimeGap[]> {
    try {
      console.log(`📌 Scheduling task in gap ${gapId} from ${taskStartTime} to ${taskEndTime}`);
      
      const response = await fetch(`${this.BASE_URL}/gaps/${gapId}/split`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ taskStartTime, taskEndTime, modifiedBy })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Server responded with error:', response.status, errorText);
        throw new Error(`Failed to split gap: ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        console.error('❌ Gap splitting failed on server:', result);
        throw new Error(result.error || 'Unknown server error');
      }
      
      console.log(`✅ Gap split successfully, created ${result.newGaps?.length || 0} new gaps`);
      
      return result.newGaps || [];
    } catch (error) {
      console.error('❌ Error splitting gap:', {
        error,
        gapId,
        taskStartTime,
        taskEndTime,
        modifiedBy
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
      
      const response = await fetch(`${this.BASE_URL}/gaps`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(gaps)
      });

      if (!response.ok) {
        throw new Error(`Failed to save gaps: ${response.statusText}`);
      }

      console.log(`✅ Saved ${gaps.length} gaps successfully`);
    } catch (error) {
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
      
      const response = await fetch(`${this.BASE_URL}/gaps`, {
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
    } catch (error) {
      console.error('❌ Error fetching all gaps:', error);
      throw error;
    }
  }

  /**
   * High-level function: Ensure gaps exist for today
   * Handles the entire gap initialization flow
   */
  static async ensureTodayGaps(
    preferences: UserPreferences, 
    accessToken: string
  ): Promise<TimeGap[]> {
    const today = new Date().toISOString().split('T')[0];
    
    try {
      // First, try to get existing gaps
      let gaps = await this.getGapsForDate(today, accessToken);
      
      if (gaps.length === 0) {
        // No gaps exist, initialize default gaps
        gaps = await this.initializeGapsForDate(today, preferences, accessToken);
      }
      
      // If calendar is connected and no manual gaps exist, we might want to trigger sync
      const hasManualGaps = gaps.some(gap => gap.gap_source_id === 'manual');
      
      if (preferences.google_calendar_connected && !hasManualGaps) {
        console.log('🔄 Calendar connected and no manual gaps - sync might be needed');
        // Note: Calendar sync would be triggered by a separate process
      }
      
      return gaps;
    } catch (error) {
      console.error('❌ Error ensuring today gaps:', error);
      throw error;
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
          const gap1Start = safeTimeToMinutes(gap1.start_time);
          const gap1End = safeTimeToMinutes(gap1.end_time);
          const gap2Start = safeTimeToMinutes(gap2.start_time);
          const gap2End = safeTimeToMinutes(gap2.end_time);
          
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
}

/**
 * Legacy API compatibility layer
 * Maintains compatibility with existing code while adding gap logic
 */
export const gapsAPI = {
  /**
   * Get gaps (with gap logic filtering)
   */
  async get(accessToken?: string): Promise<TimeGap[]> {
    if (!accessToken) {
      console.warn('No access token provided for gaps API');
      return [];
    }
    
    return await GapsAPI.getAllGaps(accessToken);
  },

  /**
   * Save gaps (with gap logic validation)
   */
  async save(gaps: TimeGap[], accessToken?: string): Promise<void> {
    if (!accessToken) {
      console.warn('No access token provided for gaps API');
      return;
    }
    
    // Validate gaps before saving
    const validation = GapsAPI.validateGaps(gaps);
    if (!validation.valid) {
      console.warn('Gap validation warnings:', validation.errors);
    }
    
    await GapsAPI.saveGaps(gaps, accessToken);
  },

  /**
   * Get gaps for a specific date
   */
  async getForDate(date: string, accessToken?: string): Promise<TimeGap[]> {
    if (!accessToken) {
      console.warn('No access token provided for gaps API');
      return [];
    }
    
    return await GapsAPI.getGapsForDate(date, accessToken);
  }
};