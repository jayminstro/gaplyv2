import { TimeGap, UserPreferences, Task } from '../types/index';
import { timeToMinutes, minutesToTime } from './helpers';
import { generateUUID } from './uuid';

export type GapModifier = 'system' | 'user' | 'calendar_sync';

/**
 * Core Gap Logic Implementation
 * Simplified architecture: gaps represent available time only
 * Implements 14-day rolling window: 7 days past, 7 days future
 */
/**
 * Normalize working days to array format
 * Handles both array and object formats, with fallbacks
 */
export function normalizeWorkingDays(workingDays: any): string[] {
  // If it's already an array, return it
  if (Array.isArray(workingDays)) {
    return workingDays;
  }
  
  // If it's an object, convert to array
  if (workingDays && typeof workingDays === 'object') {
    console.log(`🔍 Normalizing working days object:`, workingDays);
    
    // First try: get keys where value is true
    let result = Object.keys(workingDays).filter(day => workingDays[day] === true);
    
    // If empty, try truthy values
    if (result.length === 0) {
      result = Object.keys(workingDays).filter(day => workingDays[day]);
    }
    
    // If still empty, try day name mapping
    if (result.length === 0) {
      const dayMapping: { [key: string]: string } = {
        'mon': 'Monday', 'tue': 'Tuesday', 'wed': 'Wednesday', 'thu': 'Thursday', 'fri': 'Friday', 'sat': 'Saturday', 'sun': 'Sunday',
        'monday': 'Monday', 'tuesday': 'Tuesday', 'wednesday': 'Wednesday', 'thursday': 'Thursday', 'friday': 'Friday', 'saturday': 'Saturday', 'sunday': 'Sunday'
      };
      
      result = Object.keys(workingDays).map(key => dayMapping[key.toLowerCase()]).filter(Boolean);
    }
    
    // Final fallback: default working days
    if (result.length === 0) {
      console.log(`❌ Could not normalize working days, using defaults`);
      result = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    }
    
    console.log(`✅ Normalized working days:`, result);
    return result;
  }
  
  // If it's null/undefined/other, return defaults
  console.log(`❌ Invalid working days format, using defaults`);
  return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
}

export class GapLogic {
  
  /**
   * Calculate the 14-day rolling window dates
   * @returns {window_start, window_end} in YYYY-MM-DD format
   */
  static calculateRollingWindow(): { window_start: string; window_end: string } {
    const today = new Date();
    const window_start = new Date(today);
    window_start.setDate(today.getDate() - 7);
    const window_end = new Date(today);
    window_end.setDate(today.getDate() + 7);
    
    return {
      window_start: window_start.toLocaleDateString('en-CA'),
      window_end: window_end.toLocaleDateString('en-CA')
    };
  }

  /**
   * Check if a date is within the 14-day rolling window
   */
  static isDateInRollingWindow(date: string): boolean {
    const { window_start, window_end } = this.calculateRollingWindow();
    return date >= window_start && date <= window_end;
  }

  /**
   * Get dates that should be preloaded for smooth scrolling (+3 days)
   */
  static getPreloadDates(): string[] {
    const { window_end } = this.calculateRollingWindow();
    const preloadDates: string[] = [];
    
    for (let i = 1; i <= 3; i++) {
      const preloadDate = new Date(window_end);
      preloadDate.setDate(preloadDate.getDate() + i);
      preloadDates.push(preloadDate.toLocaleDateString('en-CA'));
    }
    
    return preloadDates;
  }

  /**
   * Clean up old gaps outside the rolling window
   * Should be called daily or on app launch
   */
  static getGapsToCleanup(existingGaps: TimeGap[]): string[] {
    const { window_start } = this.calculateRollingWindow();
    const today = new Date().toLocaleDateString('en-CA');
    
    return existingGaps
      .filter(gap => {
        // Delete system gaps older than 7 days
        const isOldSystemGap = gap.date < window_start && gap.modified_by === 'system';
        // Delete any gaps older than 7 days (except user-modified ones)
        const isOldGap = gap.date < window_start;
        return isOldSystemGap || isOldGap;
      })
      .map(gap => gap.id);
  }

  /**
   * Create default free hour gaps for a given date
   * Called on app launch or when no gaps exist
   */
  static createFreeHourGaps(
    date: string, 
    preferences: UserPreferences, 
    userId: string
  ): TimeGap[] {
    // Validate preferences are provided
    if (!preferences) {
      console.error('❌ No preferences provided to createFreeHourGaps');
      return [];
    }
    
    // Validate required work time preferences
    if (!preferences.calendar_work_start || !preferences.calendar_work_end) {
      console.error('❌ Missing work start/end time in preferences:', {
        start: preferences.calendar_work_start,
        end: preferences.calendar_work_end
      });
      return [];
    }
    // Ensure date is in YYYY-MM-DD format
    const formattedDate = new Date(date).toLocaleDateString('en-CA');
    
    // Only create gaps within the rolling window
    if (!this.isDateInRollingWindow(formattedDate)) {
      console.log(`⏭️ Skipping gap creation for date outside rolling window: ${formattedDate}`);
      return [];
    }

    const dayOfWeek = new Date(formattedDate).getDay();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = dayNames[dayOfWeek];
    
    // Check if this day is in working days
    const workingDaysArray = normalizeWorkingDays(preferences.calendar_working_days);
    
    console.log(`🔍 Working days check for ${currentDay}:`, {
      original: preferences.calendar_working_days,
      normalized: workingDaysArray,
      includes: workingDaysArray.includes(currentDay)
    });
    
    if (!workingDaysArray.includes(currentDay)) {
      console.log(`⏭️ Skipping gap creation for non-working day: ${currentDay}`);
      return [];
    }
    
    const gaps: TimeGap[] = [];
    
    // Handle time format - convert HH:MM:SS to HH:MM if needed
    let workStartTime = preferences.calendar_work_start;
    let workEndTime = preferences.calendar_work_end;
    
    if (workStartTime && workStartTime.includes(':') && workStartTime.split(':').length === 3) {
      workStartTime = workStartTime.substring(0, 5); // Convert "06:00:00" to "06:00"
    }
    if (workEndTime && workEndTime.includes(':') && workEndTime.split(':').length === 3) {
      workEndTime = workEndTime.substring(0, 5); // Convert "21:00:00" to "21:00"
    }
    
    console.log(`📅 Creating gaps for ${formattedDate} from ${workStartTime} to ${workEndTime} (${timeToMinutes(workStartTime)}-${timeToMinutes(workEndTime)} minutes)`);
    
    const workStart = timeToMinutes(workStartTime);
    const workEnd = timeToMinutes(workEndTime);
    console.log(`🔍 DEBUG - Full preferences object:`, JSON.stringify({
      calendar_work_start: preferences.calendar_work_start,
      calendar_work_end: preferences.calendar_work_end,
      calendar_working_days: preferences.calendar_working_days,
    }, null, 2));
    
    // Create one gap per hour
    for (let hour = workStart; hour < workEnd; hour += 60) {
      const startTime = minutesToTime(hour);
      const endTime = minutesToTime(Math.min(hour + 60, workEnd));
      const durationMinutes = Math.min(60, workEnd - hour);
      
      const gap: TimeGap = {
        id: generateUUID(),
        user_id: userId,
        date: formattedDate,
        start_time: startTime,
        end_time: endTime,
        duration_minutes: durationMinutes,
        parent_gap_id: undefined,
        original_gap_id: undefined,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        modified_by: 'system'
      };
      
      gaps.push(gap);
      console.log(`✅ Created gap: ${startTime}-${endTime} (${durationMinutes} min)`);
    }
    
    console.log(`🎯 Created ${gaps.length} gaps for ${formattedDate}`);
    return gaps;
  }

  /**
   * Recalculate gaps for a specific date after task changes
   * Used when tasks are added, updated, or deleted
   */
  static recalculateGapsForDate(
    date: string,
    tasks: Task[],
    preferences: UserPreferences,
    userId: string
  ): TimeGap[] {
    // Only recalculate within rolling window
    if (!this.isDateInRollingWindow(date)) {
      return [];
    }

    console.log(`🔄 Recalculating gaps for ${date} with ${tasks.length} tasks`);
    
    // Get tasks for this date
    const dateTasks = tasks.filter(task => task.dueDate === date);
    
    // Create base gaps for the date
    const baseGaps = this.createFreeHourGaps(date, preferences, userId);
    
    if (baseGaps.length === 0) {
      return [];
    }
    
    // Process each task to split/remove gaps
    let currentGaps = [...baseGaps];
    
    for (const task of dateTasks) {
      if (!task.dueTime || !task.duration) continue;
      
      const taskStart = task.dueTime;
      const taskDuration = this.parseTaskDuration(task.duration);
      const taskEnd = minutesToTime(timeToMinutes(taskStart) + taskDuration);
      
      // Find and process overlapping gaps
      const newGaps: TimeGap[] = [];
      
      for (const gap of currentGaps) {
        try {
          // Check if task overlaps with this gap
          const gapStart = timeToMinutes(gap.start_time);
          const gapEnd = timeToMinutes(gap.end_time);
          const taskStartMinutes = timeToMinutes(taskStart);
          const taskEndMinutes = timeToMinutes(taskEnd);
          
          // Check for overlap: task starts before gap ends AND task ends after gap starts
          if (taskStartMinutes < gapEnd && taskEndMinutes > gapStart) {
            console.log(`📍 Task ${taskStart}-${taskEnd} overlaps with gap ${gap.start_time}-${gap.end_time}`);
            const result = this.scheduleTaskInGap(gap, taskStart, taskEnd, 'system');
            
            if (!result.deletedGap) {
              // Gap wasn't fully consumed, add remaining parts
              newGaps.push(...result.newGaps);
            }
            // If gap was deleted, don't add it back
          } else {
            // No overlap, keep the original gap
            newGaps.push(gap);
          }
        } catch (error) {
          // If there's an error (e.g., task doesn't fit in gap), keep the original gap
          console.warn(`⚠️ Could not schedule task in gap ${gap.start_time}-${gap.end_time}:`, error);
          newGaps.push(gap);
        }
      }
      
      currentGaps = newGaps;
    }
    
    console.log(`✅ Recalculated ${currentGaps.length} gaps for ${date}`);
    return currentGaps;
  }

  /**
   * Parse task duration from various formats (HH:MM:SS, MM:SS, "30 min", etc.)
   */
  private static parseTaskDuration(duration: string): number {
    if (duration.includes(':')) {
      const parts = duration.split(':');
      if (parts.length >= 2) {
        const hours = parseInt(parts[0]) || 0;
        const minutes = parseInt(parts[1]) || 0;
        return (hours * 60) + minutes;
      }
    } else {
      // Handle "30 min" format
      const match = duration.match(/(\d+)/);
      if (match) {
        return parseInt(match[1]);
      }
    }
    return 30; // Default 30 minutes
  }

  /**
   * Schedule task in gap - returns new gaps after splitting
   * If task fills entire gap, returns empty array (gap should be deleted)
   * If task partially fills gap, returns remaining gap(s)
   */
  static scheduleTaskInGap(
    originalGap: TimeGap,
    taskStartTime: string,
    taskEndTime: string,
    modifiedBy: GapModifier = 'user'
  ): { deletedGap: boolean; newGaps: TimeGap[] } {
    const gapStart = timeToMinutes(originalGap.start_time);
    const gapEnd = timeToMinutes(originalGap.end_time);
    const taskStart = timeToMinutes(taskStartTime);
    const taskEnd = timeToMinutes(taskEndTime);
    
    // Validate task fits within gap
    if (taskStart < gapStart || taskEnd > gapEnd) {
      throw new Error('Task time range exceeds gap boundaries');
    }
    
    const newGaps: TimeGap[] = [];
    
    // Case 1: Task fills entire gap - no new gaps needed
    if (taskStart === gapStart && taskEnd === gapEnd) {
      return { deletedGap: true, newGaps: [] };
    }
    
    // Case 2: Task partially fills gap - create remaining gaps
    
    // Gap before task (if any)
    if (taskStart > gapStart) {
      newGaps.push({
        id: generateUUID(),
        user_id: originalGap.user_id,
        date: originalGap.date,
        start_time: originalGap.start_time,
        end_time: taskStartTime,
        duration_minutes: taskStart - gapStart,
        parent_gap_id: originalGap.id,
        original_gap_id: originalGap.original_gap_id || originalGap.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        modified_by: modifiedBy
      });
    }
    
    // Gap after task (if any)
    if (taskEnd < gapEnd) {
      newGaps.push({
        id: generateUUID(),
        user_id: originalGap.user_id,
        date: originalGap.date,
        start_time: taskEndTime,
        end_time: originalGap.end_time,
        duration_minutes: gapEnd - taskEnd,
        parent_gap_id: originalGap.id,
        original_gap_id: originalGap.original_gap_id || originalGap.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        modified_by: modifiedBy
      });
    }
    
    return { deletedGap: false, newGaps };
  }

  /**
   * Calculate duration between two times in minutes
   */
  private static calculateDuration(startTime: string, endTime: string): number {
    return timeToMinutes(endTime) - timeToMinutes(startTime);
  }

  /**
   * Check if two gaps overlap
   */
  private static doGapsOverlap(gap1: {start_time: string, end_time: string}, gap2: {start_time: string, end_time: string}): boolean {
    const start1 = timeToMinutes(gap1.start_time);
    const end1 = timeToMinutes(gap1.end_time);
    const start2 = timeToMinutes(gap2.start_time);
    const end2 = timeToMinutes(gap2.end_time);
    
    return start1 < end2 && end1 > start2;
  }

  /**
   * Validate gap consistency
   */
  static validateGapConsistency(gaps: TimeGap[]): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for overlaps
    for (let i = 0; i < gaps.length; i++) {
      for (let j = i + 1; j < gaps.length; j++) {
        if (gaps[i].date === gaps[j].date && this.doGapsOverlap(gaps[i], gaps[j])) {
          errors.push(`Gap overlap detected: ${gaps[i].id} and ${gaps[j].id}`);
        }
      }
    }

    // Check for gaps outside work hours
    for (const gap of gaps) {
      const startMinutes = timeToMinutes(gap.start_time);
      const endMinutes = timeToMinutes(gap.end_time);
      
      if (startMinutes < 0 || endMinutes > 1440) {
        warnings.push(`Gap outside valid time range: ${gap.id}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Optimize gaps for better user experience
   */
  static optimizeGaps(gaps: TimeGap[], preferences: UserPreferences): TimeGap[] {
    const minGapDuration = preferences.calendar_min_gap || 15;
    
    return gaps.filter(gap => {
      return gap.duration_minutes >= minGapDuration;
    });
  }

  /**
   * Handle working time changes and update gaps accordingly
   */
  static handleWorkingTimeChange(
    existingGaps: TimeGap[],
    oldPreferences: UserPreferences,
    newPreferences: UserPreferences,
    userId: string
  ): { gapsToCreate: TimeGap[], gapsToDelete: string[], gapsToUpdate: TimeGap[] } {
    const gapsToCreate: TimeGap[] = [];
    const gapsToDelete: string[] = [];
    const gapsToUpdate: TimeGap[] = [];

    // Group gaps by date for easier processing
    const gapsByDate = new Map<string, TimeGap[]>();
    existingGaps.forEach(gap => {
      if (!gapsByDate.has(gap.date)) {
        gapsByDate.set(gap.date, []);
      }
      gapsByDate.get(gap.date)!.push(gap);
    });

    // Process each date
    for (const [date, gaps] of gapsByDate) {
      const dayOfWeek = new Date(date).getDay();
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const currentDay = dayNames[dayOfWeek];

      // Check if this day is still a working day
      const oldWorkingDays = normalizeWorkingDays(oldPreferences.calendar_working_days);
      const newWorkingDays = normalizeWorkingDays(newPreferences.calendar_working_days);
      
      const wasWorkingDay = oldWorkingDays.includes(currentDay);
      const isWorkingDay = newWorkingDays.includes(currentDay);

      if (!isWorkingDay && wasWorkingDay) {
        // Day is no longer a working day - delete all gaps
        gaps.forEach(gap => gapsToDelete.push(gap.id));
        continue;
      }

      if (isWorkingDay && !wasWorkingDay) {
        // Day is now a working day - create new gaps
        const newGaps = this.createFreeHourGaps(date, newPreferences, userId);
        gapsToCreate.push(...newGaps);
        continue;
      }

      if (!isWorkingDay) {
        // Not a working day in either case - skip
        continue;
      }

      // Day is still a working day - check for time changes
      const oldWorkStart = timeToMinutes(oldPreferences.calendar_work_start);
      const oldWorkEnd = timeToMinutes(oldPreferences.calendar_work_end);
      const newWorkStart = timeToMinutes(newPreferences.calendar_work_start);
      const newWorkEnd = timeToMinutes(newPreferences.calendar_work_end);

      // Process each gap on this date
      gaps.forEach(gap => {
        const gapStart = timeToMinutes(gap.start_time);
        const gapEnd = timeToMinutes(gap.end_time);

        // Check if gap is completely outside new working hours
        if (gapEnd <= newWorkStart || gapStart >= newWorkEnd) {
          gapsToDelete.push(gap.id);
          return;
        }

        // Check if gap needs to be updated (partially outside or needs adjustment)
        let needsUpdate = false;
        let newStartTime = gap.start_time;
        let newEndTime = gap.end_time;

        // Adjust start time if gap starts before new work start
        if (gapStart < newWorkStart) {
          newStartTime = minutesToTime(newWorkStart);
          needsUpdate = true;
        }

        // Adjust end time if gap ends after new work end
        if (gapEnd > newWorkEnd) {
          newEndTime = minutesToTime(newWorkEnd);
          needsUpdate = true;
        }

        if (needsUpdate) {
          const newDuration = timeToMinutes(newEndTime) - timeToMinutes(newStartTime);
          
          // Only update if the gap still has meaningful duration
          if (newDuration >= (newPreferences.calendar_min_gap || 15)) {
            gapsToUpdate.push({
              ...gap,
              start_time: newStartTime,
              end_time: newEndTime,
              duration_minutes: newDuration,
              updated_at: new Date().toISOString(),
              modified_by: 'system'
            });
          } else {
            // Gap is too small after adjustment - delete it
            gapsToDelete.push(gap.id);
          }
        }
      });

      // Create new gaps for extended working hours
      if (newWorkStart < oldWorkStart) {
        // Work starts earlier - create gaps for the new early period
        const earlyGaps = this.createGapsForTimeRange(
          date,
          newWorkStart,
          oldWorkStart,
          newPreferences,
          userId
        );
        gapsToCreate.push(...earlyGaps);
      }

      if (newWorkEnd > oldWorkEnd) {
        // Work ends later - create gaps for the new late period
        const lateGaps = this.createGapsForTimeRange(
          date,
          oldWorkEnd,
          newWorkEnd,
          newPreferences,
          userId
        );
        gapsToCreate.push(...lateGaps);
      }
    }

    return { gapsToCreate, gapsToDelete, gapsToUpdate };
  }

  /**
   * Create gaps for a specific time range
   */
  private static createGapsForTimeRange(
    date: string,
    startMinutes: number,
    endMinutes: number,
    preferences: UserPreferences,
    userId: string
  ): TimeGap[] {
    const gaps: TimeGap[] = [];
    const minGapDuration = preferences.calendar_min_gap || 15;

    // Create one gap per hour in the specified range
    for (let hour = startMinutes; hour < endMinutes; hour += 60) {
      const gapStart = minutesToTime(hour);
      const gapEnd = minutesToTime(Math.min(hour + 60, endMinutes));
      const gapDuration = Math.min(60, endMinutes - hour);

      // Only create gap if it meets minimum duration requirement
      if (gapDuration >= minGapDuration) {
        gaps.push({
          id: generateUUID(),
          user_id: userId,
          date,
          start_time: gapStart,
          end_time: gapEnd,
          duration_minutes: gapDuration,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          modified_by: 'system'
        });
      }
    }

    return gaps;
  }
}

/**
 * High-level gap management class
 */
export class GapManager {
  
  /**
   * Initialize gaps for a specific date
   */
  static async initializeGapsForDate(
    date: string,
    userId: string,
    preferences: UserPreferences,
    existingGaps: TimeGap[] = []
  ): Promise<TimeGap[]> {
    // If gaps already exist, return them
    if (existingGaps.length > 0) {
      return existingGaps;
    }
    
    // Create default free hour gaps
    return GapLogic.createFreeHourGaps(date, preferences, userId);
  }

  /**
   * Schedule a task in a specific gap
   */
  static scheduleTaskInGap(
    gap: TimeGap,
    taskStartTime: string,
    taskDurationMinutes: number,
    modifiedBy: GapModifier = 'user'
  ): TimeGap[] {
    const taskEndTime = minutesToTime(timeToMinutes(taskStartTime) + taskDurationMinutes);
    const result = GapLogic.scheduleTaskInGap(gap, taskStartTime, taskEndTime, modifiedBy);
    return result.newGaps;
  }
}