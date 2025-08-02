import { StorageInfo } from './IndexedDBStorage';

export interface StorageMetrics {
  totalItems: number;
  totalSize: number;
  averageItemSize: number;
  largestItem: { id: string; size: number; type: string };
  smallestItem: { id: string; size: number; type: string };
  itemCountByType: Record<string, number>;
  sizeByType: Record<string, number>;
  lastAccessTime: string;
  accessFrequency: Record<string, number>;
}

export interface StorageTrend {
  date: string;
  totalItems: number;
  totalSize: number;
  itemCountByType: Record<string, number>;
  sizeByType: Record<string, number>;
}

export interface StorageRecommendation {
  type: 'cleanup' | 'optimization' | 'migration' | 'warning';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  action: string;
  impact: string;
  estimatedSavings?: number;
}

export interface AnalyticsConfig {
  trackAccessPatterns: boolean;
  trackSizeChanges: boolean;
  trackPerformance: boolean;
  retentionDays: number;
  sampleRate: number; // 0-1, percentage of operations to track
}

export class StorageAnalytics {
  private metrics: StorageMetrics;
  private trends: StorageTrend[] = [];
  private accessLog: Array<{ timestamp: string; operation: string; itemId: string; type: string; size: number }> = [];
  private performanceLog: Array<{ timestamp: string; operation: string; duration: number; success: boolean }> = [];
  private config: AnalyticsConfig;
  private storage: any;

  constructor(storage: any, config: Partial<AnalyticsConfig> = {}) {
    this.storage = storage;
    this.config = {
      trackAccessPatterns: true,
      trackSizeChanges: true,
      trackPerformance: true,
      retentionDays: 30,
      sampleRate: 0.1, // Track 10% of operations
      ...config
    };

    this.metrics = this.initializeMetrics();
  }

  /**
   * Initialize metrics structure
   */
  private initializeMetrics(): StorageMetrics {
    return {
      totalItems: 0,
      totalSize: 0,
      averageItemSize: 0,
      largestItem: { id: '', size: 0, type: '' },
      smallestItem: { id: '', size: 0, type: '' },
      itemCountByType: {},
      sizeByType: {},
      lastAccessTime: new Date().toISOString(),
      accessFrequency: {}
    };
  }

  /**
   * Track a storage operation
   */
  async trackOperation(
    operation: string,
    itemId: string,
    type: string,
    size: number = 0,
    duration?: number,
    success: boolean = true
  ): Promise<void> {
    // Apply sampling
    if (Math.random() > this.config.sampleRate) {
      return;
    }

    const timestamp = new Date().toISOString();

    // Track access patterns
    if (this.config.trackAccessPatterns) {
      this.accessLog.push({
        timestamp,
        operation,
        itemId,
        type,
        size
      });

      // Update access frequency
      const key = `${operation}_${type}`;
      this.metrics.accessFrequency[key] = (this.metrics.accessFrequency[key] || 0) + 1;
    }

    // Track performance
    if (this.config.trackPerformance && duration !== undefined) {
      this.performanceLog.push({
        timestamp,
        operation,
        duration,
        success
      });
    }

    // Update last access time
    this.metrics.lastAccessTime = timestamp;

    // Clean up old logs
    this.cleanupOldLogs();
  }

  /**
   * Update storage metrics
   */
  async updateMetrics(): Promise<void> {
    try {
      const storageInfo = await this.storage.getStorageInfo();
      
      this.metrics.totalItems = Object.values(storageInfo.collections).reduce((sum, count) => sum + count, 0);
      this.metrics.totalSize = storageInfo.used;
      this.metrics.averageItemSize = this.metrics.totalItems > 0 ? this.metrics.totalSize / this.metrics.totalItems : 0;
      this.metrics.itemCountByType = storageInfo.collections;
      this.metrics.sizeByType = storageInfo.collections; // Simplified - in real implementation, calculate actual sizes

      // Find largest and smallest items (simplified)
      this.metrics.largestItem = { id: 'unknown', size: 0, type: 'unknown' };
      this.metrics.smallestItem = { id: 'unknown', size: Number.MAX_SAFE_INTEGER, type: 'unknown' };

      // Create trend entry
      const trend: StorageTrend = {
        date: new Date().toISOString().split('T')[0],
        totalItems: this.metrics.totalItems,
        totalSize: this.metrics.totalSize,
        itemCountByType: { ...this.metrics.itemCountByType },
        sizeByType: { ...this.metrics.sizeByType }
      };

      this.trends.push(trend);

      // Keep only recent trends
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);
      this.trends = this.trends.filter(trend => new Date(trend.date) >= cutoffDate);

    } catch (error) {
      console.error('Failed to update storage metrics:', error);
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): StorageMetrics {
    return { ...this.metrics };
  }

  /**
   * Get storage trends
   */
  getTrends(days: number = 7): StorageTrend[] {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    return this.trends.filter(trend => new Date(trend.date) >= cutoffDate);
  }

  /**
   * Get storage recommendations
   */
  async getRecommendations(): Promise<StorageRecommendation[]> {
    const recommendations: StorageRecommendation[] = [];

    // Check storage usage
    const storageInfo = await this.storage.getStorageInfo();
    const usagePercentage = (storageInfo.used / storageInfo.total) * 100;

    if (usagePercentage > 90) {
      recommendations.push({
        type: 'warning',
        priority: 'critical',
        title: 'Storage Nearly Full',
        description: `Storage is ${usagePercentage.toFixed(1)}% full. Consider cleaning up old data.`,
        action: 'Clean up old data',
        impact: 'Prevent storage failures',
        estimatedSavings: Math.floor(storageInfo.total * 0.2) // Estimate 20% cleanup
      });
    } else if (usagePercentage > 75) {
      recommendations.push({
        type: 'warning',
        priority: 'high',
        title: 'High Storage Usage',
        description: `Storage is ${usagePercentage.toFixed(1)}% full. Monitor usage closely.`,
        action: 'Monitor storage usage',
        impact: 'Prevent storage issues',
        estimatedSavings: undefined
      });
    }

    // Check for old data
    const oldDataCount = this.getOldDataCount();
    if (oldDataCount > 100) {
      recommendations.push({
        type: 'cleanup',
        priority: 'medium',
        title: 'Old Data Cleanup',
        description: `${oldDataCount} old items found. Consider removing data older than 30 days.`,
        action: 'Remove old data',
        impact: 'Free up storage space',
        estimatedSavings: oldDataCount * 1024 // Estimate 1KB per item
      });
    }

    // Check access patterns
    const unusedItems = this.getUnusedItems();
    if (unusedItems.length > 50) {
      recommendations.push({
        type: 'optimization',
        priority: 'low',
        title: 'Unused Data',
        description: `${unusedItems.length} items haven't been accessed recently.`,
        action: 'Review and remove unused data',
        impact: 'Optimize storage usage',
        estimatedSavings: unusedItems.length * 512 // Estimate 512B per item
      });
    }

    // Check performance issues
    const slowOperations = this.getSlowOperations();
    if (slowOperations.length > 0) {
      recommendations.push({
        type: 'optimization',
        priority: 'medium',
        title: 'Performance Issues',
        description: `${slowOperations.length} slow operations detected. Consider optimizing storage.`,
        action: 'Optimize storage operations',
        impact: 'Improve app performance',
        estimatedSavings: undefined
      });
    }

    return recommendations;
  }

  /**
   * Get storage usage report
   */
  async getUsageReport(): Promise<{
    summary: StorageMetrics;
    trends: StorageTrend[];
    recommendations: StorageRecommendation[];
    performance: {
      averageOperationTime: number;
      slowestOperations: Array<{ operation: string; averageTime: number }>;
      errorRate: number;
    };
  }> {
    await this.updateMetrics();

    const recommendations = await this.getRecommendations();
    const performance = this.getPerformanceMetrics();

    return {
      summary: this.getMetrics(),
      trends: this.getTrends(30),
      recommendations,
      performance
    };
  }

  /**
   * Get performance metrics
   */
  private getPerformanceMetrics(): {
    averageOperationTime: number;
    slowestOperations: Array<{ operation: string; averageTime: number }>;
    errorRate: number;
  } {
    if (this.performanceLog.length === 0) {
      return {
        averageOperationTime: 0,
        slowestOperations: [],
        errorRate: 0
      };
    }

    // Calculate average operation time
    const totalTime = this.performanceLog.reduce((sum, log) => sum + log.duration, 0);
    const averageOperationTime = totalTime / this.performanceLog.length;

    // Find slowest operations
    const operationTimes = new Map<string, number[]>();
    this.performanceLog.forEach(log => {
      if (!operationTimes.has(log.operation)) {
        operationTimes.set(log.operation, []);
      }
      operationTimes.get(log.operation)!.push(log.duration);
    });

    const slowestOperations = Array.from(operationTimes.entries())
      .map(([operation, times]) => ({
        operation,
        averageTime: times.reduce((sum, time) => sum + time, 0) / times.length
      }))
      .sort((a, b) => b.averageTime - a.averageTime)
      .slice(0, 5);

    // Calculate error rate
    const errorCount = this.performanceLog.filter(log => !log.success).length;
    const errorRate = (errorCount / this.performanceLog.length) * 100;

    return {
      averageOperationTime,
      slowestOperations,
      errorRate
    };
  }

  /**
   * Get count of old data items
   */
  private getOldDataCount(): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);

    return this.accessLog.filter(log => {
      const logDate = new Date(log.timestamp);
      return logDate < cutoffDate;
    }).length;
  }

  /**
   * Get unused items (not accessed in last 7 days)
   */
  private getUnusedItems(): string[] {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7);

    const recentAccess = new Set(
      this.accessLog
        .filter(log => new Date(log.timestamp) >= cutoffDate)
        .map(log => log.itemId)
    );

    const allItems = new Set(this.accessLog.map(log => log.itemId));
    return Array.from(allItems).filter(itemId => !recentAccess.has(itemId));
  }

  /**
   * Get slow operations (above 100ms average)
   */
  private getSlowOperations(): Array<{ operation: string; averageTime: number }> {
    const operationTimes = new Map<string, number[]>();
    
    this.performanceLog.forEach(log => {
      if (!operationTimes.has(log.operation)) {
        operationTimes.set(log.operation, []);
      }
      operationTimes.get(log.operation)!.push(log.duration);
    });

    return Array.from(operationTimes.entries())
      .map(([operation, times]) => ({
        operation,
        averageTime: times.reduce((sum, time) => sum + time, 0) / times.length
      }))
      .filter(op => op.averageTime > 100);
  }

  /**
   * Clean up old logs
   */
  private cleanupOldLogs(): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    this.accessLog = this.accessLog.filter(log => new Date(log.timestamp) >= cutoffDate);
    this.performanceLog = this.performanceLog.filter(log => new Date(log.timestamp) >= cutoffDate);
  }

  /**
   * Export analytics data
   */
  exportData(): {
    metrics: StorageMetrics;
    trends: StorageTrend[];
    accessLog: typeof this.accessLog;
    performanceLog: typeof this.performanceLog;
  } {
    return {
      metrics: this.getMetrics(),
      trends: this.getTrends(),
      accessLog: [...this.accessLog],
      performanceLog: [...this.performanceLog]
    };
  }

  /**
   * Reset analytics data
   */
  reset(): void {
    this.metrics = this.initializeMetrics();
    this.trends = [];
    this.accessLog = [];
    this.performanceLog = [];
  }
} 