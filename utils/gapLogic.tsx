import { TimeGap, UserPreferences, Task } from '../types/index';
import { LocalTask } from './database/schema';
import { timeToMinutes, minutesToTime, safeTimeToMinutes } from './helpers';
import { generateUUID } from './uuid';

export type GapSource = 'default' | 'calendar' | 'manual';
export type GapModifier = 'system' | 'calendar_sync' | 'user' | 'ai_assistant';

/**
 * Core Gap Logic Implementation
 * Implements the priority system: manual > calendar > default
 */
export class GapLogic {
  
  /**
   * Create default gaps for a given date
   * Called on app launch or when no calendar data is available
   */
  static createDefaultGaps(
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
    
    const gap: TimeGap = {
      id: generateUUID(),
      user_id: userId,
      date,
      start_time: preferences.calendar_work_start,
      end_time: preferences.calendar_work_end,
      duration: this.calculateDuration(preferences.calendar_work_start, preferences.calendar_work_end),
      duration_minutes: this.calculateDuration(preferences.calendar_work_start, preferences.calendar_work_end),
      is_available: true,
      gap_source_id: 'default',
      modified_by: 'system',
      last_modified_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    };
    
    return [gap];
  }
  
  /**
   * Create calendar-based gaps from event data
   * Replaces default gaps but respects manual gaps
   */
  static createCalendarGaps(
    date: string,
    calendarEvents: Array<{start: string, end: string, title: string}>,
    preferences: UserPreferences,
    userId: string,
    existingGaps: TimeGap[] = []
  ): TimeGap[] {
    // Filter out default gaps (will be replaced)
    // Keep manual gaps (higher priority)
    const manualGaps = existingGaps.filter(gap => gap.gap_source_id === 'manual');
    
    // Sort events by start time
    const sortedEvents = calendarEvents.sort((a, b) => 
      safeTimeToMinutes(a.start) - safeTimeToMinutes(b.start)
    );
    
    const gaps: TimeGap[] = [];
    let currentTime = safeTimeToMinutes(preferences.calendar_work_start);
    const workEndTime = safeTimeToMinutes(preferences.calendar_work_end);
    
    for (const event of sortedEvents) {
      const eventStartTime = safeTimeToMinutes(event.start);
      const eventEndTime = safeTimeToMinutes(event.end);
      
      // Create gap before this event if there's time
      if (eventStartTime > currentTime + preferences.calendar_min_gap) {
        const gapStart = currentTime;
        const gapEnd = Math.max(gapStart, eventStartTime - preferences.calendar_buffer_time);
        
        if (gapEnd > gapStart) {
          // Check if this gap conflicts with any manual gaps
          const conflictsWithManual = manualGaps.some(manualGap => 
            this.doGapsOverlap(
              { start_time: minutesToTime(gapStart), end_time: minutesToTime(gapEnd) },
              manualGap
            )
          );
          
          if (!conflictsWithManual) {
            gaps.push({
              id: generateUUID(),
              user_id: userId,
              date,
              start_time: minutesToTime(gapStart),
              end_time: minutesToTime(gapEnd),
              duration: gapEnd - gapStart,
              duration_minutes: gapEnd - gapStart,
              is_available: true,
              gap_source_id: 'calendar',
              modified_by: 'calendar_sync',
              last_modified_at: new Date().toISOString(),
              created_at: new Date().toISOString()
            });
          }
        }
      }
      
      // Update current time to end of this event
      currentTime = Math.max(currentTime, eventEndTime);
    }
    
    // Create final gap if time remains
    if (currentTime < workEndTime - preferences.calendar_min_gap) {
      const gapStart = currentTime;
      const gapEnd = workEndTime;
      
      // Check if this gap conflicts with any manual gaps
      const conflictsWithManual = manualGaps.some(manualGap => 
        this.doGapsOverlap(
          { start_time: minutesToTime(gapStart), end_time: minutesToTime(gapEnd) },
          manualGap
        )
      );
      
      if (!conflictsWithManual) {
        gaps.push({
          id: generateUUID(),
          user_id: userId,
          date,
          start_time: minutesToTime(gapStart),
          end_time: minutesToTime(gapEnd),
          duration: gapEnd - gapStart,
          duration_minutes: gapEnd - gapStart,
          is_available: true,
          gap_source_id: 'calendar',
          modified_by: 'calendar_sync',
          last_modified_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        });
      }
    }
    
    return gaps;
  }

  /**
   * Split a gap to accommodate a task
   */
  static splitGapForTask(
    originalGap: TimeGap,
    taskStartTime: string,
    taskEndTime: string,
    modifiedBy: GapModifier = 'user'
  ): TimeGap[] {
    const gapStart = timeToMinutes(originalGap.start_time);
    const gapEnd = timeToMinutes(originalGap.end_time);
    const taskStart = timeToMinutes(taskStartTime);
    const taskEnd = timeToMinutes(taskEndTime);
    
    const gaps: TimeGap[] = [];
    
    // Create gap before task if there's time
    if (taskStart > gapStart) {
      gaps.push({
        ...originalGap,
        id: generateUUID(),
        end_time: taskStartTime,
        duration: taskStart - gapStart,
        duration_minutes: taskStart - gapStart,
        modified_by: modifiedBy,
        last_modified_at: new Date().toISOString()
      });
    }
    
    // Create gap after task if there's time
    if (taskEnd < gapEnd) {
      gaps.push({
        ...originalGap,
        id: generateUUID(),
        start_time: taskEndTime,
        duration: gapEnd - taskEnd,
        duration_minutes: gapEnd - taskEnd,
        modified_by: modifiedBy,
        last_modified_at: new Date().toISOString()
      });
    }
    
    return gaps;
  }

  /**
   * Filter gaps by priority (manual > calendar > default)
   */
  static filterGapsByPriority(gaps: TimeGap[], _date: string): TimeGap[] {
    // Group gaps by source
    const manualGaps = gaps.filter(gap => gap.gap_source_id === 'manual');
    const calendarGaps = gaps.filter(gap => gap.gap_source_id === 'calendar');
    const defaultGaps = gaps.filter(gap => gap.gap_source_id === 'default');
    
    // Return manual gaps if any exist, otherwise calendar gaps, otherwise default gaps
    if (manualGaps.length > 0) {
      return manualGaps;
    } else if (calendarGaps.length > 0) {
      return calendarGaps;
    } else {
      return defaultGaps;
    }
  }

  /**
   * Check if calendar gaps should override existing gaps
   */
  static shouldOverrideWithCalendar(existingGaps: TimeGap[], date: string): boolean {
    const existingGapsForDate = existingGaps.filter(gap => gap.date === date);
    return existingGapsForDate.every(gap => gap.gap_source_id !== 'manual');
  }

  /**
   * Validate that no gaps overlap
   */
  static validateNoOverlaps(gaps: TimeGap[]): boolean {
    for (let i = 0; i < gaps.length; i++) {
      for (let j = i + 1; j < gaps.length; j++) {
        if (this.doGapsOverlap(gaps[i], gaps[j])) {
          return false;
        }
      }
    }
    return true;
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
   * Group overlapping gaps for processing
   */
  private static _groupOverlappingGaps(gaps: TimeGap[]): TimeGap[][] {
    const groups: TimeGap[][] = [];
    const processed = new Set<string>();
    
    for (const gap of gaps) {
      if (processed.has(gap.id)) continue;
      
      const group = [gap];
      processed.add(gap.id);
      
      for (const otherGap of gaps) {
        if (processed.has(otherGap.id)) continue;
        
        if (this.doGapsOverlap(gap, otherGap)) {
          group.push(otherGap);
          processed.add(otherGap.id);
        }
      }
      
      groups.push(group);
    }
    
    return groups;
  }

  /**
   * Calculate gaps from local tasks and events
   * Enhanced version for local-first architecture
   */
  static calculateLocalGaps(
    date: string,
    tasks: (Task | LocalTask)[],
    preferences: UserPreferences,
    userId: string,
    existingGaps: TimeGap[] = []
  ): TimeGap[] {
    // Filter tasks for the specific date
    const dateTasks = tasks.filter(task => 
      task.dueDate === date && 
      task.status !== 'completed' &&
      !('deleted_at' in task && task.deleted_at)
    );

    // Convert tasks to calendar events
    const calendarEvents = dateTasks.map(task => ({
      start: task.dueTime!,
      end: this.calculateTaskEndTime(task),
      title: task.title
    }));

    // Use existing calendar gap logic
    return this.createCalendarGaps(
      date,
      calendarEvents,
      preferences,
      userId,
      existingGaps
    );
  }

  /**
   * Calculate task end time based on duration
   */
  private static calculateTaskEndTime(task: Task): string {
    if (!task.dueTime || !task.duration) return task.dueTime!;
    
    const startMinutes = timeToMinutes(task.dueTime);
    const durationMinutes = parseInt(task.duration.split(':')[1]) + (parseInt(task.duration.split(':')[0]) * 60);
    const endMinutes = startMinutes + durationMinutes;
    
    return minutesToTime(endMinutes);
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
        if (this.doGapsOverlap(gaps[i], gaps[j])) {
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
      const duration = gap.duration_minutes || gap.duration;
      return duration >= minGapDuration;
    }).map(gap => ({
      ...gap,
      quality_score: this.calculateGapQuality(gap, preferences)
    }));
  }

  /**
   * Calculate gap quality score
   */
  private static calculateGapQuality(gap: TimeGap, preferences: UserPreferences): number {
    let score = 100;
    
    // Prefer longer gaps
    const duration = gap.duration_minutes || gap.duration;
    if (duration < 30) score -= 20;
    if (duration < 15) score -= 30;
    
    // Prefer gaps during work hours
    const startMinutes = timeToMinutes(gap.start_time);
    const workStart = timeToMinutes(preferences.calendar_work_start);
    const workEnd = timeToMinutes(preferences.calendar_work_end);
    
    if (startMinutes < workStart || startMinutes > workEnd) {
      score -= 15;
    }
    
    // Prefer manual gaps
    if (gap.gap_source_id === 'manual') {
      score += 10;
    }
    
    return Math.max(0, Math.min(100, score));
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
    // Check if we should use calendar data
    if (GapLogic.shouldOverrideWithCalendar(existingGaps, date)) {
      // For now, return default gaps
      // In a real implementation, you'd fetch calendar data here
      return GapLogic.createDefaultGaps(date, preferences, userId);
    }
    
    return existingGaps;
  }

  /**
   * Handle calendar sync for a date
   */
  static async handleCalendarSync(
    date: string,
    calendarEvents: Array<{start: string, end: string, title: string}>,
    userId: string,
    preferences: UserPreferences,
    existingGaps: TimeGap[] = []
  ): Promise<TimeGap[]> {
    return GapLogic.createCalendarGaps(
      date,
      calendarEvents,
      preferences,
      userId,
      existingGaps
    );
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
    return GapLogic.splitGapForTask(gap, taskStartTime, taskEndTime, modifiedBy);
  }
}