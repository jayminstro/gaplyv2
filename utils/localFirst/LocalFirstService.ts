import { DatabaseManager } from '../database/DatabaseManager';
import { SyncService, SyncConfig } from '../sync/SyncService';
import { GapLifecycleManager } from '../gapLifecycle';
import { GapCache } from '../gapCache';
import { LocalTask, LocalTimeGap, LocalUserPreferences } from '../database/schema';
import { Task, TimeGap, UserPreferences } from '../../types/index';
import { supabase } from '../supabase/client';

export interface LocalFirstConfig {
  sync: {
    autoSync: boolean;
    syncInterval: number;
    retryAttempts: number;
    retryDelay: number;
    backgroundSync: boolean;
  };
  cache: {
    enableCache: boolean;
    maxSize: number;
    ttl: number;
    enableCompression: boolean;
  };
  gaps: {
    enableBackgroundCalculation: boolean;
    enableAutoCleanup: boolean;
    calculationInterval: number;
    cleanupInterval: number;
  };
  throttling: {
    maxConcurrentOperations: number;
    operationDelay: number;
    batchSize: number;
  };
}

export class LocalFirstService {
  private dbManager: DatabaseManager;
  private syncService: SyncService;
  private gapLifecycleManager: GapLifecycleManager;
  private gapCache: GapCache;
  private config: LocalFirstConfig;
  private isInitialized = false;
  private operationQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;

  constructor(userId: string, config: Partial<LocalFirstConfig> = {}) {
    this.config = this.getDefaultConfig();
    Object.assign(this.config, config);

    this.dbManager = new DatabaseManager(userId);
    this.syncService = new SyncService(this.dbManager, this.config.sync);
    this.gapLifecycleManager = new GapLifecycleManager(this.dbManager);
    this.gapCache = new GapCache(this.config.cache);
  }

  private getDefaultConfig(): LocalFirstConfig {
    return {
      sync: {
        autoSync: true,
        syncInterval: 30000, // 30 seconds
        retryAttempts: 3,
        retryDelay: 1000,
        backgroundSync: true
      },
      cache: {
        enableCache: true,
        maxSize: 1000,
        ttl: 5 * 60 * 1000, // 5 minutes
        enableCompression: true
      },
      gaps: {
        enableBackgroundCalculation: true,
        enableAutoCleanup: true,
        calculationInterval: 5 * 60 * 1000, // 5 minutes
        cleanupInterval: 60 * 60 * 1000 // 1 hour
      },
      throttling: {
        maxConcurrentOperations: 3,
        operationDelay: 100,
        batchSize: 10
      }
    };
  }

  // Initialize the entire local-first system
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('�� Initializing local-first system...');

      // Initialize database
      await this.dbManager.initialize();

      // Initialize sync service
      await this.syncService.initialize();

      // Set up background processes
      this.setupBackgroundProcesses();

      // Perform initial sync
      if (this.config.sync.autoSync) {
        await this.throttledOperation(() => this.syncService.sync({ priority: 'high' }));
      }

      this.isInitialized = true;
      console.log('✅ Local-first system initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize local-first system:', error);
      throw error;
    }
  }

  // Task Management
  async createTask(taskData: Omit<Task, 'id' | 'created_at' | 'updated_at'>): Promise<LocalTask> {
    await this.ensureInitialized();

    const task = await this.throttledOperation(async () => {
      return await this.dbManager.tasks.create({
        ...taskData,
        is_synced: false,
        sync_version: 1,
        local_updated_at: new Date().toISOString()
      });
    });

    // Trigger gap recalculation if task has a due date
    if (task.dueDate) {
      await this.recalculateGapsForDate(task.dueDate);
    }

    return task;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<LocalTask | undefined> {
    await this.ensureInitialized();

    const task = await this.throttledOperation(async () => {
      return await this.dbManager.tasks.update(id, updates);
    });

    // Trigger gap recalculation if due date changed
    if (updates.dueDate && task) {
      await this.recalculateGapsForDate(updates.dueDate);
    }

    return task;
  }

  async deleteTask(id: string): Promise<boolean> {
    await this.ensureInitialized();

    // Get task before deletion for gap recalculation
    const task = await this.dbManager.tasks.getById(id);
    const dueDate = task?.dueDate;

    const deleted = await this.throttledOperation(async () => {
      return await this.dbManager.tasks.delete(id);
    });

    // Trigger gap recalculation if task had a due date
    if (deleted && dueDate) {
      await this.recalculateGapsForDate(dueDate);
    }

    return deleted;
  }

  async getTasks(filters?: {
    userId?: string;
    dateRange?: { start: string; end: string };
    status?: string[];
    category?: string[];
  }): Promise<LocalTask[]> {
    await this.ensureInitialized();

    if (filters?.dateRange) {
      return await this.dbManager.tasks.getByDateRange(
        filters.userId || 'current',
        filters.dateRange.start,
        filters.dateRange.end
      );
    }

    return await this.dbManager.tasks.getByUserId(filters?.userId || 'current');
  }

  // Gap Management
  async getGaps(date: string, userId?: string): Promise<LocalTimeGap[]> {
    await this.ensureInitialized();

    const cacheKey = `${userId || 'current'}_${date}`;
    
    // Check cache first
    if (this.config.cache.enableCache) {
      const cached = this.gapCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Get from database
    const gaps = await this.dbManager.gaps.getByDate(userId || 'current', date);
    
    // Cache the result
    if (this.config.cache.enableCache) {
      this.gapCache.set(cacheKey, gaps);
    }

    return gaps;
  }

  async createGap(gapData: Omit<TimeGap, 'id' | 'created_at' | 'synced_at' | 'last_validated_at'>): Promise<LocalTimeGap> {
    await this.ensureInitialized();

    return await this.throttledOperation(async () => {
      return await this.dbManager.gaps.create({
        ...gapData,
        is_synced: false,
        sync_version: 1,
        local_updated_at: new Date().toISOString()
      });
    });
  }

  async updateGap(id: string, updates: Partial<TimeGap>): Promise<LocalTimeGap | undefined> {
    await this.ensureInitialized();

    return await this.throttledOperation(async () => {
      return await this.dbManager.gaps.update(id, updates);
    });
  }

  async deleteGap(id: string): Promise<boolean> {
    await this.ensureInitialized();

    return await this.throttledOperation(async () => {
      return await this.dbManager.gaps.delete(id);
    });
  }

  // Gap Lifecycle Management
  async calculateGapsForDate(date: string, preferences: LocalUserPreferences): Promise<LocalTimeGap[]> {
    await this.ensureInitialized();

    const result = await this.throttledOperation(async () => {
      return await this.gapLifecycleManager.calculateGapsForDate(
        date,
        preferences.user_id!,
        preferences,
        false
      );
    });

    return result.gaps;
  }

  async recalculateGapsForDate(date: string): Promise<void> {
    await this.ensureInitialized();

    // Get user preferences
    const preferences = await this.getUserPreferences();
    if (!preferences) return;

    await this.throttledOperation(async () => {
      await this.gapLifecycleManager.calculateGapsForDate(
        date,
        preferences.user_id!,
        preferences,
        true // Force recalculation
      );
    });
  }

  // Sync Management
  async sync(options?: { force?: boolean; priority?: 'high' | 'normal' | 'low' }): Promise<any> {
    await this.ensureInitialized();

    return await this.throttledOperation(async () => {
      return await this.syncService.sync(options);
    });
  }

  async getSyncStatus(): Promise<any> {
    await this.ensureInitialized();
    return await this.syncService.getStatus();
  }

  // User Preferences
  async getUserPreferences(): Promise<LocalUserPreferences | null> {
    await this.ensureInitialized();

    // Try to get from database first
    const preferences = await this.dbManager.preferences.get('current');
    if (preferences) return preferences;

    // Fallback to API if not in local database
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return null;

      const { projectId } = await import('../supabase/info');
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-966d4846/preferences`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });

      if (response.ok) {
        const prefs = await response.json();
        await this.dbManager.preferences.create(prefs);
        return prefs;
      }
    } catch (error) {
      console.error('Failed to fetch user preferences:', error);
    }

    return null;
  }

  async updateUserPreferences(updates: Partial<UserPreferences>): Promise<LocalUserPreferences> {
    await this.ensureInitialized();

    const preferences = await this.throttledOperation(async () => {
      return await this.dbManager.preferences.update('current', updates);
    });

    // Trigger gap recalculation for all dates if work hours changed
    if (updates.calendar_work_start || updates.calendar_work_end) {
      await this.recalculateAllGaps();
    }

    return preferences;
  }

  // Background Processes
  private setupBackgroundProcesses(): void {
    // Background gap calculation
    if (this.config.gaps.enableBackgroundCalculation) {
      setInterval(() => {
        this.gapLifecycleManager.startBackgroundCalculation();
      }, this.config.gaps.calculationInterval);
    }

    // Auto cleanup
    if (this.config.gaps.enableAutoCleanup) {
      setInterval(() => {
        this.gapLifecycleManager.cleanupExpiredGaps();
      }, this.config.gaps.cleanupInterval);
    }

    // Database maintenance
    setInterval(() => {
      this.dbManager.performMaintenance();
    }, 24 * 60 * 60 * 1000); // Daily
  }

  // Throttling and Queue Management
  private async throttledOperation<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.operationQueue.push(async () => {
        try {
          await this.delay(this.config.throttling.operationDelay);
          const result = await operation();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.operationQueue.length === 0) return;

    this.isProcessingQueue = true;

    try {
      while (this.operationQueue.length > 0) {
        const batch = this.operationQueue.splice(0, this.config.throttling.batchSize);
        await Promise.all(batch.map(op => op()));
        
        if (this.operationQueue.length > 0) {
          await this.delay(this.config.throttling.operationDelay);
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Utility Methods
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  private async recalculateAllGaps(): Promise<void> {
    // Recalculate gaps for next 30 days
    const today = new Date();
    const dates = [];

    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date.toISOString().split('T')[0]);
    }

    // Process in batches
    const batchSize = 5;
    for (let i = 0; i < dates.length; i += batchSize) {
      const batch = dates.slice(i, i + batchSize);
      await Promise.all(batch.map(date => this.recalculateGapsForDate(date)));
    }
  }

  // Cleanup
  async cleanup(): Promise<void> {
    await this.syncService.cleanup();
    await this.dbManager.close();
    this.gapCache.clear();
    this.isInitialized = false;
  }

  // Status and Monitoring
  async getSystemStatus(): Promise<{
    initialized: boolean;
    sync: any;
    cache: any;
    database: any;
    gaps: any;
  }> {
    return {
      initialized: this.isInitialized,
      sync: await this.syncService.getStatus(),
      cache: this.gapCache.getStats(),
      database: await this.dbManager.getDatabaseInfo(),
      gaps: this.gapLifecycleManager.getCacheStats()
    };
  }
} 