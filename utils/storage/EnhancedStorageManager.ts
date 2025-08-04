import { Task, TimeGap, UserPreferences } from '../../types/index';
import { StorageManager, IStorageStrategy } from './StorageStrategy';
import { IndexedDBStorage } from './IndexedDBStorage';
import { LocalStorageStrategy } from './StorageStrategy';
import { MemoryStorageStrategy } from './StorageStrategy';
import { EncryptedStorageStrategy } from './StorageEncryption';
import { StorageSync, SyncResult } from './StorageSync';
import { StorageAnalytics, StorageRecommendation } from './StorageAnalytics';
import { MemoryCache, MemoryCacheConfig } from './MemoryCache';
import { CacheLimitManager, CacheLimits } from './CacheLimits';
import { PredictiveCache } from './PredictiveCache';

export interface EnhancedStorageConfig {
  storageType: 'indexeddb' | 'localstorage' | 'memory' | 'auto';
  enableEncryption: boolean;
  encryptionKey?: string;
  encryptFields: string[];
  enableSync: boolean;
  enableAnalytics: boolean;
  enableMemoryCache: boolean;
  enablePredictiveCache: boolean;
  enableCacheLimits: boolean;
  analyticsConfig?: {
    trackAccessPatterns: boolean;
    trackSizeChanges: boolean;
    trackPerformance: boolean;
    retentionDays: number;
    sampleRate: number;
  };
  syncConfig?: {
    conflictResolution: 'local' | 'remote' | 'merge';
    syncInterval: number;
    retryAttempts: number;
    batchSize: number;
  };
  memoryCacheConfig?: Partial<MemoryCacheConfig>;
  cacheLimits?: Partial<CacheLimits>;
}

export interface StorageHealth {
  status: 'healthy' | 'warning' | 'critical';
  issues: string[];
  recommendations: StorageRecommendation[];
  usage: {
    used: number;
    available: number;
    percentage: number;
  };
}

export class EnhancedStorageManager {
  private storage!: IStorageStrategy;
  private encryptedStorage?: EncryptedStorageStrategy;
  private sync?: StorageSync;
  private analytics?: StorageAnalytics;
  private memoryCache?: MemoryCache;
  private cacheLimitManager?: CacheLimitManager;
  private predictiveCache?: PredictiveCache;
  private config: EnhancedStorageConfig;
  private userId: string;
  private isInitialized = false;

  constructor(userId: string, config: Partial<EnhancedStorageConfig> = {}) {
    this.userId = userId;
    this.config = {
      storageType: 'auto',
      enableEncryption: false,
      encryptFields: [], // Removed encryption from tasks to fix iOS offline issues
      enableSync: false,
      enableAnalytics: true,
      enableMemoryCache: true,
      enablePredictiveCache: true,
      enableCacheLimits: true,
      analyticsConfig: {
        trackAccessPatterns: true,
        trackSizeChanges: true,
        trackPerformance: true,
        retentionDays: 30,
        sampleRate: 0.1
      },
      syncConfig: {
        conflictResolution: 'merge',
        syncInterval: 30000,
        retryAttempts: 3,
        batchSize: 50
      },
      memoryCacheConfig: {
        maxSize: 100,
        defaultTTL: 5 * 60 * 1000, // 5 minutes
        enableStats: true,
        evictionPolicy: 'lru'
      },
      cacheLimits: {
        maxTasks: 1000,
        maxGaps: 5000,
        maxActivities: 500,
        maxStorageSize: 50 * 1024 * 1024, // 50MB
        maxMemoryUsage: 100, // 100MB
        maxCacheEntries: 1000,
        maxSessionData: 10, // 10MB
        cleanupThreshold: 0.8
      },
      ...config
    };
  }

  /**
   * Initialize the enhanced storage system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('🚀 Initializing enhanced storage system...');

      // 1. Determine storage type
      const storageType = await this.determineStorageType();
      console.log(`📦 Using storage type: ${storageType}`);

      // 2. Create base storage
      this.storage = this.createStorageStrategy(storageType);

      // 3. Initialize base storage
      await this.storage.initialize();

      // 4. Add encryption layer if enabled
      if (this.config.enableEncryption) {
        const encryptionKey = this.config.encryptionKey || await this.generateEncryptionKey();
        this.encryptedStorage = new EncryptedStorageStrategy(
          this.storage,
          encryptionKey,
          this.config.encryptFields
        );
        console.log('🔐 Encryption layer enabled');
      }

      // 5. Add analytics if enabled
      if (this.config.enableAnalytics) {
        const storageForAnalytics = this.encryptedStorage || this.storage;
        this.analytics = new StorageAnalytics(storageForAnalytics, this.config.analyticsConfig);
        console.log('📊 Analytics enabled');
      }

      // 6. Add sync if enabled
      if (this.config.enableSync) {
        await this.initializeSync();
        console.log('🔄 Sync enabled');
      }

      // 7. Initialize memory cache if enabled
      if (this.config.enableMemoryCache) {
        this.memoryCache = new MemoryCache(this.config.memoryCacheConfig);
        console.log('⚡ Memory cache enabled');
      }

      // 8. Initialize cache limit manager if enabled
      if (this.config.enableCacheLimits) {
        this.cacheLimitManager = new CacheLimitManager(this.config.cacheLimits);
        console.log('📏 Cache limits enabled');
      }

      // 9. Initialize predictive cache if enabled
      if (this.config.enablePredictiveCache && this.memoryCache) {
        this.predictiveCache = new PredictiveCache(this.memoryCache);
        console.log('🔮 Predictive cache enabled');
      }

      this.isInitialized = true;
      console.log('✅ Enhanced storage system initialized successfully');

    } catch (error) {
      console.error('❌ Failed to initialize enhanced storage:', error);
      throw error;
    }
  }

  /**
   * Determine the best available storage type
   */
  private async determineStorageType(): Promise<'indexeddb' | 'localstorage' | 'memory'> {
    if (this.config.storageType === 'auto') {
      return StorageManager.detectBestStorage();
    }
    return this.config.storageType;
  }

  /**
   * Create storage strategy based on type
   */
  private createStorageStrategy(type: 'indexeddb' | 'localstorage' | 'memory'): IStorageStrategy {
    switch (type) {
      case 'indexeddb':
        return new IndexedDBStorage(this.userId);
      case 'localstorage':
        return new LocalStorageStrategy(this.userId);
      case 'memory':
        return new MemoryStorageStrategy(this.userId);
      default:
        throw new Error(`Unsupported storage type: ${type}`);
    }
  }

  /**
   * Generate encryption key if not provided
   */
  private async generateEncryptionKey(): Promise<string> {
    // In a real app, you might want to derive this from user credentials
    // or store it securely in a keychain
    const { StorageEncryption } = await import('./StorageEncryption');
    return StorageEncryption.generatePassword(32);
  }

  /**
   * Initialize sync system
   */
  private async initializeSync(): Promise<void> {
    if (!this.config.syncConfig) return;

    // Create a secondary storage for sync (could be different type)
    const secondaryStorage = new LocalStorageStrategy(this.userId);
    await secondaryStorage.initialize();

    const primaryStorage = this.encryptedStorage || this.storage;
    this.sync = new StorageSync(primaryStorage, secondaryStorage, this.config.syncConfig);

    // Register conflict handlers
    this.sync.registerConflictHandler('task', this.handleTaskConflict.bind(this));
    this.sync.registerConflictHandler('gap', this.handleGapConflict.bind(this));
    this.sync.registerConflictHandler('preference', this.handlePreferenceConflict.bind(this));
  }

  /**
   * Handle task conflicts
   */
  private async handleTaskConflict(_: any): Promise<'local' | 'remote' | 'merge'> {
    // For now, always use 'merge' strategy
    return 'merge';
  }

  /**
   * Handle gap conflicts
   */
  private async handleGapConflict(_: any): Promise<'local' | 'remote' | 'merge'> {
    // For now, always use 'merge' strategy
    return 'merge';
  }

  /**
   * Handle preference conflicts
   */
  private async handlePreferenceConflict(_: any): Promise<'local' | 'remote' | 'merge'> {
    // For now, always use 'merge' strategy
    return 'merge';
  }

  /**
   * Get the active storage strategy (with encryption if enabled)
   */
  private getActiveStorage(skipEncryption: boolean = false): IStorageStrategy {
    // Skip encryption for tasks to prevent decryption issues on iOS
    if (skipEncryption || !this.encryptedStorage) {
      return this.storage;
    }
    return this.encryptedStorage;
  }

  async resetDatabase(): Promise<void> {
    await this.ensureInitialized();
    console.log('🔄 EnhancedStorageManager: Resetting database...');
    
    try {
      await this.getActiveStorage().resetDatabase();
      console.log('✅ EnhancedStorageManager: Database reset completed');
    } catch (error) {
      console.error('❌ EnhancedStorageManager: Error resetting database:', error);
      throw error;
    }
  }

  // Debug method to force database reset for activities
  async forceResetForActivities(): Promise<void> {
    console.log('🔄 EnhancedStorageManager: Force resetting database for activities...');
    try {
      // Force a complete database reset
      await this.resetDatabase();
      
      // Re-initialize the storage
      await this.initialize();
      console.log('✅ EnhancedStorageManager: Force reset completed');
    } catch (error) {
      console.error('❌ EnhancedStorageManager: Error in force reset:', error);
      throw error;
    }
  }

    async saveTasks(tasks: Task[], replaceAll: boolean = false): Promise<void> {
    await this.ensureInitialized();
    const startTime = performance.now();

    try {
      console.log(`🔄 EnhancedStorageManager: Saving ${tasks.length} tasks...${replaceAll ? ' (replacing all)' : ''}`);
      await this.getActiveStorage(true).saveTasks(tasks, replaceAll);
      
      // Invalidate memory cache for tasks
      if (this.memoryCache) {
        this.memoryCache.delete(`tasks_${this.userId}`);
        console.log('🗑️ Invalidated tasks cache');
      }
      
      await this.trackOperation('saveTasks', 'batch', 'tasks', tasks.length, performance.now() - startTime);
      console.log(`✅ EnhancedStorageManager: Successfully saved ${tasks.length} tasks`);
    } catch (error) {
      console.error(`❌ EnhancedStorageManager: Error saving tasks:`, error);
      await this.trackOperation('saveTasks', 'batch', 'tasks', tasks.length, performance.now() - startTime, false);
      throw error;
    }
  }

  async saveTask(task: Task): Promise<void> {
    await this.ensureInitialized();
    const startTime = performance.now();

    try {
      console.log(`🔄 EnhancedStorageManager: Saving single task: ${task.id}`);
      await this.getActiveStorage(true).saveTask(task);
      await this.trackOperation('saveTask', task.id, 'task', 1, performance.now() - startTime);
      console.log(`✅ EnhancedStorageManager: Successfully saved task ${task.id}`);
    } catch (error) {
      console.error(`❌ EnhancedStorageManager: Error saving task:`, error);
      await this.trackOperation('saveTask', task.id, 'task', 1, performance.now() - startTime, false);
      throw error;
    }
  }

  async getTasks(): Promise<Task[]> {
    await this.ensureInitialized();
    const startTime = performance.now();
    const cacheKey = `tasks_${this.userId}`;
    
    try {
      // Check memory cache first
      if (this.memoryCache) {
        const cachedTasks = this.memoryCache.get<Task[]>(cacheKey);
        if (cachedTasks) {
          console.log('⚡ Tasks retrieved from memory cache');
          await this.trackOperation('getTasks', 'batch', 'tasks', cachedTasks.length, performance.now() - startTime);
          
          // Record access pattern for predictive cache
          if (this.predictiveCache) {
            this.predictiveCache.recordAccess({
              type: 'task_access',
              userId: this.userId,
              context: this.getTimeContext()
            });
          }
          
          return cachedTasks;
        }
      }

      // Get from storage
      const tasks = await this.getActiveStorage(true).getTasks();
      
      // Store in memory cache
      if (this.memoryCache) {
        this.memoryCache.set(cacheKey, tasks, 10 * 60 * 1000); // 10 minutes TTL
      }
      
      // Update cache limits
      if (this.cacheLimitManager) {
        this.cacheLimitManager.updateUsage('tasks', tasks.length, JSON.stringify(tasks).length);
      }
      
      // Record access pattern for predictive cache
      if (this.predictiveCache) {
        this.predictiveCache.recordAccess({
          type: 'task_access',
          userId: this.userId,
          context: this.getTimeContext()
        });
      }
      
      await this.trackOperation('getTasks', 'batch', 'tasks', tasks.length, performance.now() - startTime);
      return tasks;
    } catch (error) {
      await this.trackOperation('getTasks', 'batch', 'tasks', 0, performance.now() - startTime, false);
      throw error;
    }
  }

  async updateTask(taskId: string, updates: Partial<Task>): Promise<Task | null> {
    await this.ensureInitialized();
    const startTime = performance.now();
    
    try {
      const result = await this.getActiveStorage(true).updateTask(taskId, updates);
      await this.trackOperation('updateTask', taskId, 'task', 1, performance.now() - startTime);
      return result;
    } catch (error) {
      await this.trackOperation('updateTask', taskId, 'task', 1, performance.now() - startTime, false);
      throw error;
    }
  }

  async deleteTask(taskId: string): Promise<boolean> {
    await this.ensureInitialized();
    const startTime = performance.now();
    
    try {
      const result = await this.getActiveStorage(true).deleteTask(taskId);
      await this.trackOperation('deleteTask', taskId, 'task', 1, performance.now() - startTime);
      return result;
    } catch (error) {
      await this.trackOperation('deleteTask', taskId, 'task', 1, performance.now() - startTime, false);
      throw error;
    }
  }

  async saveGaps(gaps: TimeGap[], date: string): Promise<void> {
    await this.ensureInitialized();
    const startTime = performance.now();
    
    try {
      console.log(`🔄 EnhancedStorageManager: Saving ${gaps.length} gaps for date ${date}...`);
      await this.getActiveStorage().saveGaps(gaps, date);
      
      // Invalidate memory cache for gaps
      if (this.memoryCache) {
        this.memoryCache.delete(`gaps_${this.userId}_${date}`);
        console.log(`🗑️ Invalidated gaps cache for ${date}`);
      }
      
      await this.trackOperation('saveGaps', date, 'gaps', gaps.length, performance.now() - startTime);
      console.log(`✅ EnhancedStorageManager: Successfully saved ${gaps.length} gaps for date ${date}`);
    } catch (error) {
      console.error(`❌ EnhancedStorageManager: Error saving gaps for date ${date}:`, error);
      await this.trackOperation('saveGaps', date, 'gaps', gaps.length, performance.now() - startTime, false);
      throw error;
    }
  }

  async getGaps(date: string): Promise<TimeGap[]> {
    await this.ensureInitialized();
    const startTime = performance.now();
    const cacheKey = `gaps_${this.userId}_${date}`;
    
    try {
      // Check memory cache first
      if (this.memoryCache) {
        const cachedGaps = this.memoryCache.get<TimeGap[]>(cacheKey);
        if (cachedGaps) {
          console.log(`⚡ Gaps for ${date} retrieved from memory cache`);
          await this.trackOperation('getGaps', date, 'gaps', cachedGaps.length, performance.now() - startTime);
          
          // Record access pattern for predictive cache
          if (this.predictiveCache) {
            this.predictiveCache.recordAccess({
              type: 'gap_access',
              userId: this.userId,
              itemId: date,
              context: this.getTimeContext()
            });
          }
          
          return cachedGaps;
        }
      }

      // Get from storage
      const gaps = await this.getActiveStorage().getGaps(date);
      
      // Store in memory cache
      if (this.memoryCache) {
        this.memoryCache.set(cacheKey, gaps, 30 * 60 * 1000); // 30 minutes TTL
      }
      
      // Update cache limits
      if (this.cacheLimitManager) {
        this.cacheLimitManager.updateUsage('gaps', gaps.length, JSON.stringify(gaps).length);
      }
      
      // Record access pattern for predictive cache
      if (this.predictiveCache) {
        this.predictiveCache.recordAccess({
          type: 'gap_access',
          userId: this.userId,
          itemId: date,
          context: this.getTimeContext()
        });
      }
      
      await this.trackOperation('getGaps', date, 'gaps', gaps.length, performance.now() - startTime);
      return gaps;
    } catch (error) {
      await this.trackOperation('getGaps', date, 'gaps', 0, performance.now() - startTime, false);
      throw error;
    }
  }

  async getAllGaps(): Promise<TimeGap[]> {
    await this.ensureInitialized();
    const startTime = performance.now();
    
    try {
      const gaps = await this.getActiveStorage().getAllGaps();
      await this.trackOperation('getAllGaps', 'all', 'gaps', gaps.length, performance.now() - startTime);
      return gaps;
    } catch (error) {
      await this.trackOperation('getAllGaps', 'all', 'gaps', 0, performance.now() - startTime, false);
      throw error;
    }
  }

  async savePreferences(preferences: UserPreferences): Promise<void> {
    await this.ensureInitialized();
    const startTime = performance.now();
    
    try {
      await this.getActiveStorage().savePreferences(preferences);
      
      // Invalidate memory cache for preferences
      if (this.memoryCache) {
        this.memoryCache.delete(`preferences_${this.userId}`);
        console.log('🗑️ Invalidated preferences cache');
      }
      
      await this.trackOperation('savePreferences', 'preferences', 'preferences', 1, performance.now() - startTime);
    } catch (error) {
      await this.trackOperation('savePreferences', 'preferences', 'preferences', 1, performance.now() - startTime, false);
      throw error;
    }
  }

  async getPreferences(): Promise<UserPreferences | null> {
    await this.ensureInitialized();
    const startTime = performance.now();
    const cacheKey = `preferences_${this.userId}`;
    
    try {
      // Check memory cache first
      if (this.memoryCache) {
        const cachedPreferences = this.memoryCache.get<UserPreferences>(cacheKey);
        if (cachedPreferences) {
          console.log('⚡ Preferences retrieved from memory cache');
          await this.trackOperation('getPreferences', 'preferences', 'preferences', 1, performance.now() - startTime);
          
          // Record access pattern for predictive cache
          if (this.predictiveCache) {
            this.predictiveCache.recordAccess({
              type: 'preference_access',
              userId: this.userId,
              context: this.getTimeContext()
            });
          }
          
          return cachedPreferences;
        }
      }

      // Get from storage
      const prefs = await this.getActiveStorage().getPreferences();
      
      // Store in memory cache
      if (this.memoryCache && prefs) {
        this.memoryCache.set(cacheKey, prefs, 60 * 60 * 1000); // 1 hour TTL
      }
      
      // Update cache limits
      if (this.cacheLimitManager && prefs) {
        this.cacheLimitManager.updateUsage('preferences', 1, JSON.stringify(prefs).length);
      }
      
      // Record access pattern for predictive cache
      if (this.predictiveCache) {
        this.predictiveCache.recordAccess({
          type: 'preference_access',
          userId: this.userId,
          context: this.getTimeContext()
        });
      }
      
      await this.trackOperation('getPreferences', 'preferences', 'preferences', 1, performance.now() - startTime);
      return prefs;
    } catch (error) {
      await this.trackOperation('getPreferences', 'preferences', 'preferences', 1, performance.now() - startTime, false);
      throw error;
    }
  }

  // Activity storage methods
  async saveActivities(activities: any[]): Promise<void> {
    await this.ensureInitialized();
    const startTime = performance.now();
    
    try {
      console.log(`🔄 EnhancedStorageManager: Saving ${activities.length} activities...`);
      await this.getActiveStorage().saveActivities(activities);
      await this.trackOperation('saveActivities', 'batch', 'activities', activities.length, performance.now() - startTime);
      console.log(`✅ EnhancedStorageManager: Successfully saved ${activities.length} activities`);
    } catch (error) {
      console.error(`❌ EnhancedStorageManager: Error saving activities:`, error);
      await this.trackOperation('saveActivities', 'batch', 'activities', activities.length, performance.now() - startTime, false);
      throw error;
    }
  }

  async getActivities(): Promise<any[]> {
    await this.ensureInitialized();
    const startTime = performance.now();
    
    try {
      const activities = await this.getActiveStorage().getActivities();
      await this.trackOperation('getActivities', 'batch', 'activities', activities.length, performance.now() - startTime);
      return activities;
    } catch (error) {
      await this.trackOperation('getActivities', 'batch', 'activities', 0, performance.now() - startTime, false);
      throw error;
    }
  }

  async updateActivity(activityId: string, updates: any): Promise<any | null> {
    await this.ensureInitialized();
    const startTime = performance.now();
    
    try {
      const result = await this.getActiveStorage().updateActivity(activityId, updates);
      await this.trackOperation('updateActivity', activityId, 'activity', 1, performance.now() - startTime);
      return result;
    } catch (error) {
      await this.trackOperation('updateActivity', activityId, 'activity', 1, performance.now() - startTime, false);
      throw error;
    }
  }

  async saveCalendarState(key: string, value: any): Promise<void> {
    await this.ensureInitialized();
    const startTime = performance.now();
    
    try {
      await this.getActiveStorage().saveCalendarState(key, value);
      await this.trackOperation('saveCalendarState', key, 'calendar', 1, performance.now() - startTime);
    } catch (error) {
      await this.trackOperation('saveCalendarState', key, 'calendar', 1, performance.now() - startTime, false);
      throw error;
    }
  }

  async getCalendarState(key: string): Promise<any> {
    await this.ensureInitialized();
    const startTime = performance.now();
    
    try {
      const value = await this.getActiveStorage().getCalendarState(key);
      await this.trackOperation('getCalendarState', key, 'calendar', 1, performance.now() - startTime);
      return value;
    } catch (error) {
      await this.trackOperation('getCalendarState', key, 'calendar', 1, performance.now() - startTime, false);
      throw error;
    }
  }

  async removeCalendarState(key: string): Promise<void> {
    await this.ensureInitialized();
    const startTime = performance.now();
    
    try {
      await this.getActiveStorage().removeCalendarState(key);
      await this.trackOperation('removeCalendarState', key, 'calendar', 1, performance.now() - startTime);
    } catch (error) {
      await this.trackOperation('removeCalendarState', key, 'calendar', 1, performance.now() - startTime, false);
      throw error;
    }
  }

  async getStorageInfo(): Promise<any> {
    await this.ensureInitialized();
    return this.getActiveStorage().getStorageInfo();
  }

  async cleanupOldData(daysToKeep?: number): Promise<number> {
    await this.ensureInitialized();
    const startTime = performance.now();
    
    try {
      const result = await this.getActiveStorage().cleanupOldData(daysToKeep);
      await this.trackOperation('cleanupOldData', 'cleanup', 'maintenance', result, performance.now() - startTime);
      return result;
    } catch (error) {
      await this.trackOperation('cleanupOldData', 'cleanup', 'maintenance', 0, performance.now() - startTime, false);
      throw error;
    }
  }

  // Sync operations
  async startSync(): Promise<void> {
    if (this.sync) {
      this.sync.startAutoSync();
    }
  }

  async stopSync(): Promise<void> {
    if (this.sync) {
      this.sync.stopAutoSync();
    }
  }

  async forceSync(): Promise<SyncResult> {
    if (!this.sync) {
      throw new Error('Sync is not enabled');
    }
    return this.sync.forceSync();
  }

  getSyncStatus(): any {
    if (!this.sync) {
      return { isSyncing: false, lastSyncTime: null, queueLength: 0 };
    }
    return this.sync.getSyncStatus();
  }

  // Analytics operations
  async getAnalyticsReport(): Promise<any> {
    if (!this.analytics) {
      throw new Error('Analytics is not enabled');
    }
    return this.analytics.getUsageReport();
  }

  async getStorageHealth(): Promise<StorageHealth> {
    await this.ensureInitialized();
    
    const storageInfo = await this.getStorageInfo();
    const usagePercentage = (storageInfo.used / storageInfo.total) * 100;
    
    const recommendations = this.analytics ? await this.analytics.getRecommendations() : [];
    
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    const issues: string[] = [];

    if (usagePercentage > 90) {
      status = 'critical';
      issues.push(`Storage is ${usagePercentage.toFixed(1)}% full`);
    } else if (usagePercentage > 75) {
      status = 'warning';
      issues.push(`Storage is ${usagePercentage.toFixed(1)}% full`);
    }

    const criticalRecommendations = recommendations.filter(r => r.priority === 'critical');
    if (criticalRecommendations.length > 0) {
      status = 'critical';
      issues.push(`${criticalRecommendations.length} critical recommendations`);
    }

    return {
      status,
      issues,
      recommendations,
      usage: {
        used: storageInfo.used,
        available: storageInfo.available,
        percentage: usagePercentage
      }
    };
  }

  // Utility methods
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  private async trackOperation(
    operation: string,
    itemId: string,
    type: string,
    size: number,
    duration: number,
    success: boolean = true
  ): Promise<void> {
    if (this.analytics) {
      await this.analytics.trackOperation(operation, itemId, type, size, duration, success);
    }
  }

  async close(): Promise<void> {
    if (this.sync) {
      this.sync.stopAutoSync();
    }
    
    await this.getActiveStorage().close();
    this.isInitialized = false;
  }

  // Configuration methods
  updateConfig(newConfig: Partial<EnhancedStorageConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  getConfig(): EnhancedStorageConfig {
    return { ...this.config };
  }

  /**
   * Get time context for predictive caching
   */
  private getTimeContext(): string {
    const hour = new Date().getHours();
    const dayOfWeek = new Date().getDay();
    
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    if (hour >= 21 || hour < 6) return 'night';
    
    if (dayOfWeek === 0 || dayOfWeek === 6) return 'weekend';
    
    return 'weekday';
  }

  /**
   * Get memory cache statistics
   */
  getMemoryCacheStats() {
    return this.memoryCache?.getStats();
  }

  /**
   * Get cache limit violations
   */
  getCacheLimitViolations() {
    return this.cacheLimitManager?.checkViolations();
  }

  /**
   * Get predictive cache analytics
   */
  getPredictiveCacheAnalytics() {
    return this.predictiveCache?.getAnalytics();
  }

  /**
   * Get comprehensive cache health report
   */
  getCacheHealthReport() {
    const memoryStats = this.getMemoryCacheStats();
    const violations = this.getCacheLimitViolations();
    const analytics = this.getPredictiveCacheAnalytics();
    const predictionReport = this.predictiveCache?.generateReport();

    return {
      memoryCache: memoryStats,
      limitViolations: violations,
      predictiveAnalytics: analytics,
      predictionReport,
      recommendations: this.generateCacheRecommendations(memoryStats, violations)
    };
  }

  /**
   * Generate cache recommendations
   */
  private generateCacheRecommendations(memoryStats: any, violations: any[] | undefined): string[] {
    const recommendations: string[] = [];

    if (memoryStats?.hitRate < 0.5) {
      recommendations.push('Consider increasing memory cache size or TTL for better hit rates');
    }

    if (violations && violations.length > 0) {
      recommendations.push('Cache limits exceeded - consider cleanup or increasing limits');
    }

    if (memoryStats?.evictions > 100) {
      recommendations.push('High eviction rate - consider increasing cache size or optimizing access patterns');
    }

    return recommendations;
  }
} 