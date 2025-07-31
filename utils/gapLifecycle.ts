import { DatabaseManager } from './database/DatabaseManager';
import { LocalTask, LocalTimeGap, LocalUserPreferences } from './database/schema';
import { GapLogic } from './gapLogic';
import { timeToMinutes, minutesToTime } from './helpers';
import { generateUUID } from './uuid';

export interface GapCalculationResult {
  gaps: LocalTimeGap[];
  conflicts: number;
  replaced: number;
  errors: string[];
}

export interface GapCacheEntry {
  date: string;
  gaps: LocalTimeGap[];
  lastCalculated: string;
  version: number;
  source: 'local' | 'calendar' | 'default';
}

export class GapLifecycleManager {
  private dbManager: DatabaseManager;
  private cache: Map<string, GapCacheEntry> = new Map();
  private calculationQueue: Set<string> = new Set();
  private isProcessing = false;

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
  }

  // Main gap calculation and management
  async calculateGapsForDate(
    date: string,
    userId: string,
    preferences: LocalUserPreferences,
    forceRecalculate: boolean = false
  ): Promise<GapCalculationResult> {
    const result: GapCalculationResult = {
      gaps: [],
      conflicts: 0,
      replaced: 0,
      errors: []
    };

    try {
      // Check cache first
      const cacheKey = `${userId}_${date}`;
      const cached = this.cache.get(cacheKey);
      
      if (!forceRecalculate && cached && this.isCacheValid(cached)) {
        console.log(`📋 Using cached gaps for ${date}`);
        result.gaps = cached.gaps;
        return result;
      }

      // Get existing gaps for the date
      const existingGaps = await this.dbManager.gaps.getByDate(userId, date);
      
      // Get tasks for the date
      const tasks = await this.dbManager.tasks.getByDateRange(userId, date, date);
      
      // Calculate new gaps
      const calculatedGaps = await this.performGapCalculation(
        date,
        userId,
        preferences,
        tasks,
        existingGaps
      );

      // Resolve conflicts and merge
      const { gaps, conflicts, replaced } = await this.mergeGaps(
        existingGaps,
        calculatedGaps,
        date
      );

      result.gaps = gaps;
      result.conflicts = conflicts;
      result.replaced = replaced;

      // Update cache
      this.updateCache(cacheKey, {
        date,
        gaps,
        lastCalculated: new Date().toISOString(),
        version: (cached?.version || 0) + 1,
        source: this.determineGapSource(gaps)
      });

      // Save to database
      await this.saveGapsToDatabase(gaps, existingGaps);

      console.log(`✅ Calculated ${gaps.length} gaps for ${date} (${conflicts} conflicts, ${replaced} replaced)`);
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      console.error(`❌ Error calculating gaps for ${date}:`, error);
    }

    return result;
  }

  // Perform the actual gap calculation
  private async performGapCalculation(
    date: string,
    userId: string,
    preferences: LocalUserPreferences,
    tasks: LocalTask[],
    existingGaps: LocalTimeGap[]
  ): Promise<LocalTimeGap[]> {
    // Filter out completed tasks
    const activeTasks = tasks.filter(task => 
      task.status !== 'completed' && !task.deleted_at
    );

    // Sort tasks by start time
    const sortedTasks = activeTasks.sort((a, b) => {
      if (!a.dueTime || !b.dueTime) return 0;
      return timeToMinutes(a.dueTime) - timeToMinutes(b.dueTime);
    });

    // Convert tasks to calendar events format
    const calendarEvents = sortedTasks.map(task => ({
      start: task.dueTime!,
      end: this.calculateTaskEndTime(task),
      title: task.title
    }));

    // Use existing GapLogic for calculation
    const calculatedGaps = GapLogic.createCalendarGaps(
      date,
      calendarEvents,
      preferences,
      userId,
      existingGaps
    );

    // Convert to LocalTimeGap format
    return calculatedGaps.map(gap => ({
      ...gap,
      is_synced: false,
      sync_version: 1,
      local_updated_at: new Date().toISOString()
    }));
  }

  // Calculate task end time
  private calculateTaskEndTime(task: LocalTask): string {
    if (!task.dueTime || !task.duration) return task.dueTime!;
    
    const startMinutes = timeToMinutes(task.dueTime);
    const durationMinutes = parseInt(task.duration.split(':')[1]) + (parseInt(task.duration.split(':')[0]) * 60);
    const endMinutes = startMinutes + durationMinutes;
    
    return minutesToTime(endMinutes);
  }

  // Merge existing and calculated gaps
  private async mergeGaps(
    existingGaps: LocalTimeGap[],
    calculatedGaps: LocalTimeGap[],
    date: string
  ): Promise<{ gaps: LocalTimeGap[]; conflicts: number; replaced: number }> {
    let conflicts = 0;
    let replaced = 0;

    // Separate manual gaps (highest priority)
    const manualGaps = existingGaps.filter(gap => gap.gap_source_id === 'manual');
    const nonManualGaps = existingGaps.filter(gap => gap.gap_source_id !== 'manual');

    // Merge calculated gaps with non-manual gaps
    const mergedGaps = [...manualGaps];

    for (const calculatedGap of calculatedGaps) {
      // Check for conflicts with manual gaps
      const conflictsWithManual = manualGaps.some(manualGap => 
        this.doGapsOverlap(calculatedGap, manualGap)
      );

      if (conflictsWithManual) {
        conflicts++;
        continue; // Skip this calculated gap
      }

      // Check for conflicts with existing non-manual gaps
      const conflictingGap = nonManualGaps.find(existingGap => 
        this.doGapsOverlap(calculatedGap, existingGap)
      );

      if (conflictingGap) {
        // Replace existing gap with calculated one
        replaced++;
        mergedGaps.push(calculatedGap);
      } else {
        mergedGaps.push(calculatedGap);
      }
    }

    return { gaps: mergedGaps, conflicts, replaced };
  }

  // Check if two gaps overlap
  private doGapsOverlap(gap1: LocalTimeGap, gap2: LocalTimeGap): boolean {
    const start1 = timeToMinutes(gap1.start_time);
    const end1 = timeToMinutes(gap1.end_time);
    const start2 = timeToMinutes(gap2.start_time);
    const end2 = timeToMinutes(gap2.end_time);

    return start1 < end2 && end1 > start2;
  }

  // Save gaps to database
  private async saveGapsToDatabase(
    newGaps: LocalTimeGap[],
    existingGaps: LocalTimeGap[]
  ): Promise<void> {
    // Create a map of existing gaps by ID for quick lookup
    const existingGapMap = new Map(existingGaps.map(gap => [gap.id, gap]));

    // Process each new gap
    for (const newGap of newGaps) {
      const existingGap = existingGapMap.get(newGap.id);
      
      if (existingGap) {
        // Update existing gap
        await this.dbManager.gaps.update(newGap.id, newGap);
      } else {
        // Create new gap
        await this.dbManager.gaps.create(newGap);
      }
    }

    // Delete gaps that are no longer needed
    const newGapIds = new Set(newGaps.map(gap => gap.id));
    for (const existingGap of existingGaps) {
      if (!newGapIds.has(existingGap.id) && existingGap.gap_source_id !== 'manual') {
        await this.dbManager.gaps.delete(existingGap.id);
      }
    }
  }

  // Cache management
  private isCacheValid(entry: GapCacheEntry): boolean {
    const cacheAge = Date.now() - new Date(entry.lastCalculated).getTime();
    const maxAge = 5 * 60 * 1000; // 5 minutes
    
    return cacheAge < maxAge;
  }

  private updateCache(key: string, entry: GapCacheEntry): void {
    this.cache.set(key, entry);
    
    // Limit cache size
    if (this.cache.size > 100) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
  }

  private determineGapSource(gaps: LocalTimeGap[]): 'local' | 'calendar' | 'default' {
    if (gaps.some(gap => gap.gap_source_id === 'manual')) return 'local';
    if (gaps.some(gap => gap.gap_source_id === 'calendar')) return 'calendar';
    return 'default';
  }

  // Background gap calculation
  async startBackgroundCalculation(): Promise<void> {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    
    try {
      // Calculate gaps for next 7 days
      const today = new Date();
      const dates = [];
      
      for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        dates.push(date.toISOString().split('T')[0]);
      }

      // Process dates in parallel with concurrency limit
      const concurrency = 3;
      for (let i = 0; i < dates.length; i += concurrency) {
        const batch = dates.slice(i, i + concurrency);
        await Promise.all(
          batch.map(date => this.queueGapCalculation(date))
        );
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async queueGapCalculation(date: string): Promise<void> {
    if (this.calculationQueue.has(date)) return;
    
    this.calculationQueue.add(date);
    
    try {
      // Get user preferences (you'll need to implement this)
      const preferences = await this.getUserPreferences();
      if (!preferences) return;

      await this.calculateGapsForDate(date, preferences.user_id!, preferences);
    } finally {
      this.calculationQueue.delete(date);
    }
  }

  private async getUserPreferences(): Promise<LocalUserPreferences | null> {
    // This should be implemented based on your user management
    // For now, return null
    return null;
  }

  // Gap expiration management
  async cleanupExpiredGaps(): Promise<number> {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const threeDaysAgoDate = threeDaysAgo.toISOString().split('T')[0];

    const expiredGaps = await this.dbManager.gaps.getByDateRange(
      'all', // You'll need to implement this for all users
      '1970-01-01',
      threeDaysAgoDate
    );

    let deletedCount = 0;
    for (const gap of expiredGaps) {
      if (gap.gap_source_id !== 'manual') { // Don't delete manual gaps
        await this.dbManager.gaps.delete(gap.id);
        deletedCount++;
      }
    }

    // Clear expired cache entries
    for (const [key, entry] of this.cache.entries()) {
      if (entry.date < threeDaysAgoDate) {
        this.cache.delete(key);
      }
    }

    console.log(`🧹 Cleaned up ${deletedCount} expired gaps`);
    return deletedCount;
  }

  // Cache management
  clearCache(): void {
    this.cache.clear();
  }

  getCacheStats(): { size: number; entries: Array<{ date: string; source: string }> } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
        date: entry.date,
        source: entry.source
      }))
    };
  }

  // Gap validation
  async validateGaps(date: string, userId: string): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const gaps = await this.dbManager.gaps.getByDate(userId, date);
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
    const preferences = await this.getUserPreferences();
    if (preferences) {
      const workStart = timeToMinutes(preferences.calendar_work_start);
      const workEnd = timeToMinutes(preferences.calendar_work_end);

      for (const gap of gaps) {
        const gapStart = timeToMinutes(gap.start_time);
        const gapEnd = timeToMinutes(gap.end_time);

        if (gapStart < workStart || gapEnd > workEnd) {
          warnings.push(`Gap outside work hours: ${gap.id}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
} 