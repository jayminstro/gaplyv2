export interface CacheLimits {
  maxTasks: number;
  maxGaps: number;
  maxActivities: number;
  maxStorageSize: number; // in bytes
  maxMemoryUsage: number; // in MB
  maxCacheEntries: number;
  maxSessionData: number; // in MB
  cleanupThreshold: number; // percentage (0-1)
}

export interface StorageUsage {
  tasks: number;
  gaps: number;
  activities: number;
  preferences: number;
  calendar: number;
  totalSize: number; // in bytes
  memoryUsage: number; // in MB
  cacheEntries: number;
}

export interface LimitViolation {
  type: 'storage' | 'memory' | 'count' | 'size';
  current: number;
  limit: number;
  percentage: number;
  recommendation: string;
}

export class CacheLimitManager {
  private limits: CacheLimits;
  private usage: StorageUsage;

  constructor(limits: Partial<CacheLimits> = {}) {
    this.limits = {
      maxTasks: 1000,
      maxGaps: 5000, // 7 days * ~700 gaps per day
      maxActivities: 500,
      maxStorageSize: 50 * 1024 * 1024, // 50MB
      maxMemoryUsage: 100, // 100MB
      maxCacheEntries: 1000,
      maxSessionData: 10, // 10MB
      cleanupThreshold: 0.8, // 80%
      ...limits
    };

    this.usage = {
      tasks: 0,
      gaps: 0,
      activities: 0,
      preferences: 0,
      calendar: 0,
      totalSize: 0,
      memoryUsage: 0,
      cacheEntries: 0
    };
  }

  /**
   * Check if adding data would exceed limits
   */
  canAddData(type: keyof Omit<StorageUsage, 'totalSize' | 'memoryUsage' | 'cacheEntries'>, size: number = 0): boolean {
    const currentCount = this.usage[type];
    const limitKey = `max${type.charAt(0).toUpperCase() + type.slice(1)}` as keyof CacheLimits;
    const limit = this.limits[limitKey] as number;

    if (currentCount >= limit) {
      return false;
    }

    // Check storage size limit
    const newTotalSize = this.usage.totalSize + size;
    if (newTotalSize > this.limits.maxStorageSize) {
      return false;
    }

    return true;
  }

  /**
   * Update usage statistics
   */
  updateUsage(type: keyof Omit<StorageUsage, 'totalSize' | 'memoryUsage' | 'cacheEntries'>, count: number, size: number = 0): void {
    this.usage[type] = count;
    this.usage.totalSize += size;
  }

  /**
   * Update memory usage
   */
  updateMemoryUsage(usage: number): void {
    this.usage.memoryUsage = usage;
  }

  /**
   * Update cache entries count
   */
  updateCacheEntries(count: number): void {
    this.usage.cacheEntries = count;
  }

  /**
   * Check for limit violations
   */
  checkViolations(): LimitViolation[] {
    const violations: LimitViolation[] = [];

    // Check task count
    if (this.usage.tasks > this.limits.maxTasks) {
      violations.push({
        type: 'count',
        current: this.usage.tasks,
        limit: this.limits.maxTasks,
        percentage: this.usage.tasks / this.limits.maxTasks,
        recommendation: 'Consider archiving old tasks or implementing task cleanup'
      });
    }

    // Check gap count
    if (this.usage.gaps > this.limits.maxGaps) {
      violations.push({
        type: 'count',
        current: this.usage.gaps,
        limit: this.limits.maxGaps,
        percentage: this.usage.gaps / this.limits.maxGaps,
        recommendation: 'Implement automatic cleanup of old gaps (keep last 7 days)'
      });
    }

    // Check activity count
    if (this.usage.activities > this.limits.maxActivities) {
      violations.push({
        type: 'count',
        current: this.usage.activities,
        limit: this.limits.maxActivities,
        percentage: this.usage.activities / this.limits.maxActivities,
        recommendation: 'Archive old activities or implement activity cleanup'
      });
    }

    // Check storage size
    if (this.usage.totalSize > this.limits.maxStorageSize) {
      violations.push({
        type: 'storage',
        current: this.usage.totalSize,
        limit: this.limits.maxStorageSize,
        percentage: this.usage.totalSize / this.limits.maxStorageSize,
        recommendation: 'Clean up large files or implement data compression'
      });
    }

    // Check memory usage
    if (this.usage.memoryUsage > this.limits.maxMemoryUsage) {
      violations.push({
        type: 'memory',
        current: this.usage.memoryUsage,
        limit: this.limits.maxMemoryUsage,
        percentage: this.usage.memoryUsage / this.limits.maxMemoryUsage,
        recommendation: 'Reduce memory cache size or implement memory cleanup'
      });
    }

    // Check cache entries
    if (this.usage.cacheEntries > this.limits.maxCacheEntries) {
      violations.push({
        type: 'count',
        current: this.usage.cacheEntries,
        limit: this.limits.maxCacheEntries,
        percentage: this.usage.cacheEntries / this.limits.maxCacheEntries,
        recommendation: 'Reduce cache size or implement more aggressive eviction'
      });
    }

    return violations;
  }

  /**
   * Check if cleanup is needed based on threshold
   */
  needsCleanup(): boolean {
    const violations = this.checkViolations();
    return violations.some(v => v.percentage > this.limits.cleanupThreshold);
  }

  /**
   * Get cleanup recommendations
   */
  getCleanupRecommendations(): string[] {
    const violations = this.checkViolations();
    return violations
      .filter(v => v.percentage > this.limits.cleanupThreshold)
      .map(v => v.recommendation);
  }

  /**
   * Get current usage statistics
   */
  getUsage(): StorageUsage {
    return { ...this.usage };
  }

  /**
   * Get current limits
   */
  getLimits(): CacheLimits {
    return { ...this.limits };
  }

  /**
   * Update limits
   */
  updateLimits(newLimits: Partial<CacheLimits>): void {
    this.limits = { ...this.limits, ...newLimits };
  }

  /**
   * Calculate storage efficiency score (0-100)
   */
  getEfficiencyScore(): number {
    const violations = this.checkViolations();
    if (violations.length === 0) return 100;

    const totalPenalty = violations.reduce((sum, v) => sum + (v.percentage - 1), 0);
    const efficiency = Math.max(0, 100 - (totalPenalty * 100));
    
    return Math.round(efficiency);
  }

  /**
   * Get storage health status
   */
  getHealthStatus(): 'healthy' | 'warning' | 'critical' {
    const violations = this.checkViolations();
    const criticalViolations = violations.filter(v => v.percentage > 1.2);
    const warningViolations = violations.filter(v => v.percentage > 0.8 && v.percentage <= 1.2);

    if (criticalViolations.length > 0) return 'critical';
    if (warningViolations.length > 0) return 'warning';
    return 'healthy';
  }

  /**
   * Estimate storage growth rate
   */
  estimateGrowthRate(historicalData: StorageUsage[]): number {
    if (historicalData.length < 2) return 0;

    const recent = historicalData.slice(-7); // Last 7 data points
    const growthRates = [];

    for (let i = 1; i < recent.length; i++) {
      const growth = (recent[i].totalSize - recent[i - 1].totalSize) / recent[i - 1].totalSize;
      growthRates.push(growth);
    }

    const averageGrowth = growthRates.reduce((sum, rate) => sum + rate, 0) / growthRates.length;
    return averageGrowth;
  }

  /**
   * Predict when limits will be reached
   */
  predictLimitReach(growthRate: number): { days: number; type: string } | null {
    if (growthRate <= 0) return null;

    const violations = this.checkViolations();
    if (violations.length === 0) return null;

    // Find the most critical violation
    const criticalViolation = violations.reduce((max, v) => 
      v.percentage > max.percentage ? v : max
    );

    const remainingCapacity = criticalViolation.limit - criticalViolation.current;
    const dailyGrowth = this.usage.totalSize * growthRate;
    const daysToReach = remainingCapacity / dailyGrowth;

    return {
      days: Math.round(daysToReach),
      type: criticalViolation.type
    };
  }

  /**
   * Reset usage statistics
   */
  resetUsage(): void {
    this.usage = {
      tasks: 0,
      gaps: 0,
      activities: 0,
      preferences: 0,
      calendar: 0,
      totalSize: 0,
      memoryUsage: 0,
      cacheEntries: 0
    };
  }
} 