import { TimeGap, UserPreferences } from '../types/index';
import { timeToMinutes, minutesToTime, safeTimeToMinutes, extractTimeFromDateTime } from './helpers';
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
              is_available: true,
              next_event_title: event.title,
              gap_source_id: 'calendar',
              modified_by: 'calendar_sync',
              last_modified_at: new Date().toISOString(),
              created_at: new Date().toISOString()
            });
          }
        }
      }
      
      currentTime = Math.max(currentTime, eventEndTime + preferences.calendar_buffer_time);
    }
    
    // Create final gap after last event if there's time
    if (currentTime < workEndTime - preferences.calendar_min_gap) {
      const conflictsWithManual = manualGaps.some(manualGap => 
        this.doGapsOverlap(
          { start_time: minutesToTime(currentTime), end_time: minutesToTime(workEndTime) },
          manualGap
        )
      );
      
      if (!conflictsWithManual) {
        gaps.push({
          id: generateUUID(),
          user_id: userId,
          date,
          start_time: minutesToTime(currentTime),
          end_time: minutesToTime(workEndTime),
          duration: workEndTime - currentTime,
          is_available: true,
          gap_source_id: 'calendar',
          modified_by: 'calendar_sync',
          last_modified_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        });
      }
    }
    
    // Combine manual gaps with new calendar gaps
    return [...manualGaps, ...gaps];
  }
  
  /**
   * Split a gap when a task is scheduled
   * Creates manual gaps with proper metadata
   */
  static splitGapForTask(
    originalGap: TimeGap,
    taskStartTime: string,
    taskEndTime: string,
    modifiedBy: GapModifier = 'user'
  ): TimeGap[] {
    const gapStartMinutes = safeTimeToMinutes(originalGap.start_time);
    const gapEndMinutes = safeTimeToMinutes(originalGap.end_time);
    const taskStartMinutes = safeTimeToMinutes(taskStartTime);
    const taskEndMinutes = safeTimeToMinutes(taskEndTime);
    
    const resultGaps: TimeGap[] = [];
    
    // Gap before task
    if (taskStartMinutes > gapStartMinutes) {
      resultGaps.push({
        ...originalGap,
        id: generateUUID(),
        end_time: taskStartTime,
        duration: taskStartMinutes - gapStartMinutes,
        gap_source_id: 'manual',
        modified_by: modifiedBy,
        last_modified_at: new Date().toISOString(),
        origin_gap_id: originalGap.id
      });
    }
    
    // Gap after task
    if (taskEndMinutes < gapEndMinutes) {
      resultGaps.push({
        ...originalGap,
        id: generateUUID(),
        start_time: taskEndTime,
        duration: gapEndMinutes - taskEndMinutes,
        gap_source_id: 'manual',
        modified_by: modifiedBy,
        last_modified_at: new Date().toISOString(),
        origin_gap_id: originalGap.id
      });
    }
    
    return resultGaps;
  }
  
  /**
   * Filter gaps by priority rules
   * manual > calendar > default
   */
  static filterGapsByPriority(gaps: TimeGap[], date: string): TimeGap[] {
    const gapsForDate = gaps.filter(gap => gap.date === date);
    
    // Group by overlapping time slots
    const overlappingGroups = this.groupOverlappingGaps(gapsForDate);
    
    const filteredGaps: TimeGap[] = [];
    
    for (const group of overlappingGroups) {
      // Sort by priority: manual > calendar > default
      const sortedByPriority = group.sort((a, b) => {
        const priorityOrder = { manual: 3, calendar: 2, default: 1 };
        return priorityOrder[b.gap_source_id] - priorityOrder[a.gap_source_id];
      });
      
      // Take the highest priority gap(s)
      const highestPriority = sortedByPriority[0].gap_source_id;
      const highestPriorityGaps = sortedByPriority.filter(
        gap => gap.gap_source_id === highestPriority
      );
      
      filteredGaps.push(...highestPriorityGaps);
    }
    
    return filteredGaps;
  }
  
  /**
   * Check if calendar sync should proceed
   * Returns false if manual gaps exist for the date
   */
  static shouldOverrideWithCalendar(existingGaps: TimeGap[], date: string): boolean {
    return !existingGaps.some(gap => 
      gap.date === date && gap.gap_source_id === 'manual'
    );
  }
  
  /**
   * Validate gaps don't overlap (debugging helper)
   */
  static validateNoOverlaps(gaps: TimeGap[]): boolean {
    for (let i = 0; i < gaps.length; i++) {
      for (let j = i + 1; j < gaps.length; j++) {
        if (this.doGapsOverlap(gaps[i], gaps[j])) {
          console.warn('Gap overlap detected:', gaps[i], gaps[j]);
          return false;
        }
      }
    }
    return true;
  }
  
  // Helper methods
  private static calculateDuration(startTime: string, endTime: string): number {
    return safeTimeToMinutes(endTime) - safeTimeToMinutes(startTime);
  }
  
  private static doGapsOverlap(gap1: {start_time: string, end_time: string}, gap2: {start_time: string, end_time: string}): boolean {
    const gap1Start = safeTimeToMinutes(gap1.start_time);
    const gap1End = safeTimeToMinutes(gap1.end_time);
    const gap2Start = safeTimeToMinutes(gap2.start_time);
    const gap2End = safeTimeToMinutes(gap2.end_time);
    
    return gap1Start < gap2End && gap2Start < gap1End;
  }
  
  private static groupOverlappingGaps(gaps: TimeGap[]): TimeGap[][] {
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
}

/**
 * Gap Management Service
 * High-level API for gap operations
 */
export class GapManager {
  
  /**
   * Initialize gaps for a user (called on app launch)
   */
  static async initializeGapsForDate(
    date: string,
    userId: string,
    preferences: UserPreferences,
    existingGaps: TimeGap[] = []
  ): Promise<TimeGap[]> {
    // Check if we already have gaps for this date
    const existingGapsForDate = existingGaps.filter(gap => gap.date === date);
    
    if (existingGapsForDate.length > 0) {
      // Return existing gaps filtered by priority
      return GapLogic.filterGapsByPriority(existingGaps, date);
    }
    
    // Create default gaps if no existing gaps
    if (!preferences.google_calendar_connected) {
      return GapLogic.createDefaultGaps(date, preferences, userId);
    }
    
    // If calendar is connected but no gaps exist, create default as fallback
    // Calendar sync will replace these when it runs
    return GapLogic.createDefaultGaps(date, preferences, userId);
  }
  
  /**
   * Handle calendar sync completion
   */
  static async handleCalendarSync(
    date: string,
    calendarEvents: Array<{start: string, end: string, title: string}>,
    userId: string,
    preferences: UserPreferences,
    existingGaps: TimeGap[] = []
  ): Promise<TimeGap[]> {
    // Only proceed if no manual gaps exist for this date
    if (!GapLogic.shouldOverrideWithCalendar(existingGaps, date)) {
      console.log(`Skipping calendar override for ${date} - manual gaps exist`);
      return GapLogic.filterGapsByPriority(existingGaps, date);
    }
    
    // Create new calendar-based gaps
    const newGaps = GapLogic.createCalendarGaps(
      date, 
      calendarEvents, 
      preferences, 
      userId, 
      existingGaps
    );
    
    // Return all gaps (new calendar gaps + existing manual gaps from other dates)
    const otherDateGaps = existingGaps.filter(gap => gap.date !== date);
    return [...otherDateGaps, ...newGaps];
  }
  
  /**
   * Schedule a task in a gap
   */
  static scheduleTaskInGap(
    gap: TimeGap,
    taskStartTime: string,
    taskDurationMinutes: number,
    modifiedBy: GapModifier = 'user'
  ): TimeGap[] {
    const taskEndMinutes = safeTimeToMinutes(taskStartTime) + taskDurationMinutes;
    const taskEndTime = minutesToTime(taskEndMinutes);
    
    return GapLogic.splitGapForTask(gap, taskStartTime, taskEndTime, modifiedBy);
  }
}