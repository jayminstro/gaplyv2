import { Task, TimeGap, UserPreferences } from '../../types/index';
import { MemoryCache } from './MemoryCache';

export interface UserPattern {
  type: 'task_access' | 'gap_access' | 'preference_access' | 'activity_access';
  timestamp: number;
  userId: string;
  itemId?: string;
  context?: string; // e.g., 'morning', 'evening', 'weekend'
}

export interface PredictionRule {
  id: string;
  name: string;
  pattern: string;
  confidence: number;
  dataType: 'tasks' | 'gaps' | 'preferences' | 'activities';
  prefetchStrategy: 'immediate' | 'background' | 'scheduled';
  conditions: {
    timeOfDay?: { start: number; end: number };
    dayOfWeek?: number[];
    userActivity?: string[];
    dataAge?: number; // hours
  };
}

export interface PrefetchResult {
  success: boolean;
  itemsPrefetched: number;
  dataType: string;
  duration: number;
  errors: string[];
}

export interface UserBehaviorAnalytics {
  totalAccesses: number;
  accessPatterns: Record<string, number>;
  timeBasedPatterns: Record<string, number>;
  frequentlyAccessed: Array<{ id: string; count: number; type: string }>;
  averageSessionDuration: number;
  peakUsageTimes: Array<{ hour: number; count: number }>;
}

export class PredictiveCache {
  private memoryCache: MemoryCache;
  private userPatterns: UserPattern[] = [];
  private predictionRules: PredictionRule[] = [];
  private analytics: UserBehaviorAnalytics;
  private isEnabled: boolean = true;
  private prefetchQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;

  constructor(memoryCache: MemoryCache) {
    this.memoryCache = memoryCache;
    this.analytics = this.initializeAnalytics();
    this.initializeDefaultRules();
  }

  /**
   * Initialize default prediction rules
   */
  private initializeDefaultRules(): void {
    this.predictionRules = [
      {
        id: 'morning_tasks',
        name: 'Morning Task Access',
        pattern: 'User accesses tasks in the morning',
        confidence: 0.8,
        dataType: 'tasks',
        prefetchStrategy: 'immediate',
        conditions: {
          timeOfDay: { start: 6, end: 10 },
          dayOfWeek: [1, 2, 3, 4, 5] // Monday to Friday
        }
      },
      {
        id: 'today_gaps',
        name: 'Today\'s Gaps',
        pattern: 'User accesses today\'s gaps',
        confidence: 0.9,
        dataType: 'gaps',
        prefetchStrategy: 'immediate',
        conditions: {
          dataAge: 24 // Refresh if older than 24 hours
        }
      },
      {
        id: 'upcoming_tasks',
        name: 'Upcoming Tasks',
        pattern: 'User accesses upcoming tasks',
        confidence: 0.7,
        dataType: 'tasks',
        prefetchStrategy: 'background',
        conditions: {
          dataAge: 12 // Refresh if older than 12 hours
        }
      },
      {
        id: 'user_preferences',
        name: 'User Preferences',
        pattern: 'User accesses preferences',
        confidence: 0.6,
        dataType: 'preferences',
        prefetchStrategy: 'scheduled',
        conditions: {
          dataAge: 168 // Refresh if older than 1 week
        }
      }
    ];
  }

  /**
   * Initialize analytics structure
   */
  private initializeAnalytics(): UserBehaviorAnalytics {
    return {
      totalAccesses: 0,
      accessPatterns: {},
      timeBasedPatterns: {},
      frequentlyAccessed: [],
      averageSessionDuration: 0,
      peakUsageTimes: Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }))
    };
  }

  /**
   * Record user access pattern
   */
  recordAccess(pattern: Omit<UserPattern, 'timestamp'>): void {
    if (!this.isEnabled) return;

    const userPattern: UserPattern = {
      ...pattern,
      timestamp: Date.now()
    };

    this.userPatterns.push(userPattern);
    this.updateAnalytics(userPattern);
    
    // Keep only last 1000 patterns to prevent memory bloat
    if (this.userPatterns.length > 1000) {
      this.userPatterns = this.userPatterns.slice(-1000);
    }

    // Trigger prediction analysis
    this.analyzeAndPredict();
  }

  /**
   * Update analytics based on new pattern
   */
  private updateAnalytics(pattern: UserPattern): void {
    this.analytics.totalAccesses++;
    
    // Update access patterns
    const patternKey = `${pattern.type}_${pattern.context || 'default'}`;
    this.analytics.accessPatterns[patternKey] = (this.analytics.accessPatterns[patternKey] || 0) + 1;

    // Update time-based patterns
    const hour = new Date(pattern.timestamp).getHours();
    this.analytics.timeBasedPatterns[hour] = (this.analytics.timeBasedPatterns[hour] || 0) + 1;
    this.analytics.peakUsageTimes[hour].count++;

    // Update frequently accessed items
    if (pattern.itemId) {
      const existing = this.analytics.frequentlyAccessed.find(item => item.id === pattern.itemId);
      if (existing) {
        existing.count++;
      } else {
        this.analytics.frequentlyAccessed.push({
          id: pattern.itemId,
          count: 1,
          type: pattern.type
        });
      }

      // Sort by count and keep top 20
      this.analytics.frequentlyAccessed.sort((a, b) => b.count - a.count);
      this.analytics.frequentlyAccessed = this.analytics.frequentlyAccessed.slice(0, 20);
    }
  }

  /**
   * Analyze patterns and trigger predictions
   */
  private analyzeAndPredict(): void {
    const currentTime = new Date();
    const hour = currentTime.getHours();
    const dayOfWeek = currentTime.getDay();

    // Find applicable rules
    const applicableRules = this.predictionRules.filter(rule => {
      const conditions = rule.conditions;
      
      // Check time of day
      if (conditions.timeOfDay && (hour < conditions.timeOfDay.start || hour > conditions.timeOfDay.end)) {
        return false;
      }

      // Check day of week
      if (conditions.dayOfWeek && !conditions.dayOfWeek.includes(dayOfWeek)) {
        return false;
      }

      return true;
    });

    // Execute predictions
    applicableRules.forEach(rule => {
      this.executePrediction(rule);
    });
  }

  /**
   * Execute a specific prediction rule
   */
  private async executePrediction(rule: PredictionRule): Promise<void> {
    const prefetchFunction = async () => {
      try {
        console.log(`🔮 Executing prediction: ${rule.name}`);
        
        switch (rule.dataType) {
          case 'tasks':
            await this.prefetchTasks(rule);
            break;
          case 'gaps':
            await this.prefetchGaps(rule);
            break;
          case 'preferences':
            await this.prefetchPreferences(rule);
            break;
          case 'activities':
            await this.prefetchActivities(rule);
            break;
        }
      } catch (error) {
        console.error(`❌ Prediction failed for ${rule.name}:`, error);
      }
    };

    // Add to queue based on strategy
    switch (rule.prefetchStrategy) {
      case 'immediate':
        await prefetchFunction();
        break;
      case 'background':
        this.addToQueue(prefetchFunction);
        break;
      case 'scheduled':
        // Schedule for next available time
        setTimeout(() => this.addToQueue(prefetchFunction), 5000);
        break;
    }
  }

  /**
   * Prefetch tasks based on prediction rule
   */
  private async prefetchTasks(rule: PredictionRule): Promise<void> {
    const cacheKey = `predicted_tasks_${rule.id}`;
    
    // Check if already cached
    if (this.memoryCache.has(cacheKey)) {
      return;
    }

    // Simulate task prefetching (replace with actual API call)
    const predictedTasks: Task[] = [
      // Add predicted tasks based on user patterns
    ];

    this.memoryCache.set(cacheKey, predictedTasks, 30 * 60 * 1000); // 30 minutes TTL
    console.log(`✅ Prefetched ${predictedTasks.length} tasks for rule: ${rule.name}`);
  }

  /**
   * Prefetch gaps based on prediction rule
   */
  private async prefetchGaps(rule: PredictionRule): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `predicted_gaps_${rule.id}_${today}`;
    
    if (this.memoryCache.has(cacheKey)) {
      return;
    }

    // Simulate gap prefetching
    const predictedGaps: TimeGap[] = [
      // Add predicted gaps based on user patterns
    ];

    this.memoryCache.set(cacheKey, predictedGaps, 60 * 60 * 1000); // 1 hour TTL
    console.log(`✅ Prefetched ${predictedGaps.length} gaps for rule: ${rule.name}`);
  }

  /**
   * Prefetch preferences based on prediction rule
   */
  private async prefetchPreferences(rule: PredictionRule): Promise<void> {
    const cacheKey = `predicted_preferences_${rule.id}`;
    
    if (this.memoryCache.has(cacheKey)) {
      return;
    }

    // Simulate preferences prefetching
    const predictedPreferences: UserPreferences = {
      // Add predicted preferences
    } as UserPreferences;

    this.memoryCache.set(cacheKey, predictedPreferences, 24 * 60 * 60 * 1000); // 24 hours TTL
    console.log(`✅ Prefetched preferences for rule: ${rule.name}`);
  }

  /**
   * Prefetch activities based on prediction rule
   */
  private async prefetchActivities(rule: PredictionRule): Promise<void> {
    const cacheKey = `predicted_activities_${rule.id}`;
    
    if (this.memoryCache.has(cacheKey)) {
      return;
    }

    // Simulate activities prefetching
    const predictedActivities: any[] = [
      // Add predicted activities
    ];

    this.memoryCache.set(cacheKey, predictedActivities, 60 * 60 * 1000); // 1 hour TTL
    console.log(`✅ Prefetched ${predictedActivities.length} activities for rule: ${rule.name}`);
  }

  /**
   * Add function to prefetch queue
   */
  private addToQueue(fn: () => Promise<void>): void {
    this.prefetchQueue.push(fn);
    this.processQueue();
  }

  /**
   * Process the prefetch queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.prefetchQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.prefetchQueue.length > 0) {
      const fn = this.prefetchQueue.shift();
      if (fn) {
        try {
          await fn();
        } catch (error) {
          console.error('❌ Error processing prefetch queue:', error);
        }
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Get predicted data from cache
   */
  getPredictedData<T>(dataType: string, ruleId: string): T | null {
    const cacheKey = `predicted_${dataType}_${ruleId}`;
    return this.memoryCache.get<T>(cacheKey);
  }

  /**
   * Add custom prediction rule
   */
  addPredictionRule(rule: PredictionRule): void {
    this.predictionRules.push(rule);
  }

  /**
   * Remove prediction rule
   */
  removePredictionRule(ruleId: string): void {
    this.predictionRules = this.predictionRules.filter(rule => rule.id !== ruleId);
  }

  /**
   * Get user behavior analytics
   */
  getAnalytics(): UserBehaviorAnalytics {
    return { ...this.analytics };
  }

  /**
   * Get prediction rules
   */
  getPredictionRules(): PredictionRule[] {
    return [...this.predictionRules];
  }

  /**
   * Enable/disable predictive caching
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  /**
   * Check if predictive caching is enabled
   */
  isPredictiveEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Clear all prediction data
   */
  clearPredictions(): void {
    const keys = this.memoryCache.keys();
    keys.forEach(key => {
      if (key.startsWith('predicted_')) {
        this.memoryCache.delete(key);
      }
    });
  }

  /**
   * Get prediction accuracy score
   */
  getPredictionAccuracy(): number {
    // This would be calculated based on how often predicted data is actually used
    // For now, return a placeholder
    return 0.75; // 75% accuracy
  }

  /**
   * Generate prediction report
   */
  generateReport(): {
    totalPredictions: number;
    accuracy: number;
    mostUsedRules: Array<{ rule: string; usage: number }>;
    recommendations: string[];
  } {
    return {
      totalPredictions: this.predictionRules.length,
      accuracy: this.getPredictionAccuracy(),
      mostUsedRules: this.predictionRules.map(rule => ({
        rule: rule.name,
        usage: rule.confidence
      })),
      recommendations: [
        'Consider adding more time-based rules for better accuracy',
        'Monitor frequently accessed items to improve predictions',
        'Adjust confidence thresholds based on user feedback'
      ]
    };
  }
} 