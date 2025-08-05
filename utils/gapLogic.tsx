import { TimeGap, UserPreferences, Task } from '../types/index';
import { timeToMinutes, minutesToTime } from './helpers';
import { generateUUID } from './uuid';

export type GapModifier = 'system' | 'user' | 'calendar_sync';

/**
 * Core Gap Logic Implementation
 * Simplified architecture: gaps represent available time only
 */
export class GapLogic {
  
  /**
   * Create default free hour gaps for a given date
   * Called on app launch or when no gaps exist
   */
  static createFreeHourGaps(
    date: string, 
    preferences: UserPreferences, 
    userId: string
  ): TimeGap[] {
    const dayOfWeek = new Date(date).getDay();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = dayNames[dayOfWeek];
    
    // Check if this day is in working days
    if (!preferences.calendar_working_days.includes(currentDay)) {
      return [];
    }
    
    // Skip weekends if not included
    if (!preferences.calendar_include_weekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
      return [];
    }
    
    const gaps: TimeGap[] = [];
    const workStart = timeToMinutes(preferences.calendar_work_start);
    const workEnd = timeToMinutes(preferences.calendar_work_end);
    
    // Create one gap per hour
    for (let hour = workStart; hour < workEnd; hour += 60) {
      const startTime = minutesToTime(hour);
      const endTime = minutesToTime(Math.min(hour + 60, workEnd));
      
      gaps.push({
        id: generateUUID(),
        user_id: userId,
        date,
        start_time: startTime,
        end_time: endTime,
        duration_minutes: Math.min(60, workEnd - hour),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        modified_by: 'system'
      });
    }
    
    return gaps;
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
    
    return { deletedGap: true, newGaps };
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
      const wasWorkingDay = oldPreferences.calendar_working_days.includes(currentDay);
      const isWorkingDay = newPreferences.calendar_working_days.includes(currentDay);

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