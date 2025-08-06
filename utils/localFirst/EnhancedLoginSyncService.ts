import { EnhancedStorageManager } from '../storage/EnhancedStorageManager';
import { Task, TimeGap, UserPreferences } from '../../types/index';
import { supabase } from '../supabase/client';

export interface LoginSyncResult {
  success: boolean;
  tasksSynced: number;
  gapsSynced: number;
  conflictsResolved: number;
  errors: string[];
  localDataPreserved: boolean;
}

export class EnhancedLoginSyncService {
  private storage: EnhancedStorageManager;
  constructor(private userId: string, existingStorage?: EnhancedStorageManager) {
    if (existingStorage) {
      this.storage = existingStorage;
    } else {
      this.storage = new EnhancedStorageManager(userId, {
        storageType: 'auto',
        enableEncryption: true,
        encryptFields: ['description', 'notes', 'title'],
        enableAnalytics: true,
        enableSync: false, // We'll handle sync manually here
        enableMemoryCache: true, // Enable memory caching for sync operations
        enablePredictiveCache: false, // Disable predictive cache for sync service
        enableCacheLimits: true, // Enable storage limits
        analyticsConfig: {
          trackAccessPatterns: true,
          trackSizeChanges: true,
          trackPerformance: true,
          retentionDays: 30,
          sampleRate: 0.1
        },
        memoryCacheConfig: {
          maxSize: 50, // Smaller cache for sync operations
          defaultTTL: 5 * 60 * 1000, // 5 minutes TTL
          enableStats: true,
          evictionPolicy: 'lru'
        },
        cacheLimits: {
          maxTasks: 2000,
          maxGaps: 10000,
          maxActivities: 1000,
          maxStorageSize: 100 * 1024 * 1024, // 100MB
          maxMemoryUsage: 100, // 100MB
          maxCacheEntries: 1000,
          maxSessionData: 20,
          cleanupThreshold: 0.8
        }
      });
    }
  }

  /**
   * Initialize the service and perform login sync
   */
  async initializeAndSync(): Promise<LoginSyncResult> {
    try {
      console.log('🔄 Starting enhanced login sync service initialization...');
      
      // Initialize enhanced storage
      await this.storage.initialize();
      
      // Perform login sync
      const syncResult = await this.performLoginSync();
      
      console.log('✅ Enhanced login sync completed', syncResult);
      return syncResult;
    } catch (error) {
      console.error('❌ Enhanced login sync service initialization failed:', error);
      return {
        success: false,
        tasksSynced: 0,
        gapsSynced: 0,
        conflictsResolved: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        localDataPreserved: true
      };
    }
  }

  /**
   * Perform remote-to-local sync on login
   */
  private async performLoginSync(): Promise<LoginSyncResult> {
    const result: LoginSyncResult = {
      success: true,
      tasksSynced: 0,
      gapsSynced: 0,
      conflictsResolved: 0,
      errors: [],
      localDataPreserved: true
    };

    try {
      // Check network connectivity
      if (!navigator.onLine) {
        console.log('📱 Offline mode - preserving local data only');
        return result;
      }

      // Get authentication session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.log('🔐 No session - preserving local data only');
        return result;
      }

      console.log('🔄 Performing enhanced login sync...');

      // 1. Load local data first
      console.log('📱 Loading local data from storage...');
      const localTasks = await this.storage.getTasks();
      const localGaps = await this.storage.getAllGaps();
      const localPreferences = await this.storage.getPreferences();

      console.log(`📱 Local data loaded: ${localTasks.length} tasks, ${localGaps.length} gaps`);
      
      // Debug: Log gap details if any exist
      if (localGaps.length > 0) {
        console.log('📱 Local gaps found:', localGaps.map(g => ({ id: g.id, date: g.date, start: g.start_time, end: g.end_time })).slice(0, 3));
      }

      // 2. Fetch remote data
      const remoteData = await this.fetchRemoteData(session.access_token);
      console.log(`☁️ Remote data fetched: ${remoteData.tasks.length} tasks, ${remoteData.gaps.length} gaps`);

      // 3. Merge and store data
      console.log('🔄 Starting data merge process...');
      
      // Ensure storage is fully initialized
      if (!this.storage) {
        throw new Error('Storage manager not initialized');
      }
      
      const mergeResult = await this.mergeAndStoreData(
        localTasks,
        localGaps,
        localPreferences,
        remoteData
      );

      result.tasksSynced = mergeResult.tasksSynced;
      result.gapsSynced = mergeResult.gapsSynced;
      result.conflictsResolved = mergeResult.conflictsResolved;
      result.errors = mergeResult.errors;

      console.log(`✅ Enhanced login sync completed: ${result.tasksSynced} tasks, ${result.gapsSynced} gaps synced`);
      return result;

    } catch (error) {
      console.error('❌ Enhanced login sync failed:', error);
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      return result;
    }
  }

  /**
   * Fetch remote data from server
   */
  private async fetchRemoteData(accessToken: string): Promise<{
    tasks: Task[];
    gaps: TimeGap[];
    preferences: UserPreferences | null;
  }> {
    try {
      // Import APIs dynamically to avoid circular dependencies
      const { tasksAPI } = await import('../api');
      const { GapsAPI } = await import('../gapsAPI');

      // Fetch tasks
      let tasks: Task[] = [];
      try {
        tasks = await tasksAPI.get();
      } catch (error) {
        console.warn('Failed to fetch remote tasks:', error);
      }

      // Fetch gaps
      let gaps: TimeGap[] = [];
      try {
        gaps = await GapsAPI.getAllGaps(accessToken);
      } catch (error) {
        console.warn('Failed to fetch remote gaps:', error);
      }

      // Fetch preferences
      let preferences: UserPreferences | null = null;
      try {
        const { preferencesAPI } = await import('../api');
        preferences = await preferencesAPI.get();
      } catch (error) {
        console.warn('Failed to fetch remote preferences:', error);
      }

      return { tasks, gaps, preferences };
    } catch (error) {
      console.error('Error fetching remote data:', error);
      return { tasks: [], gaps: [], preferences: null };
    }
  }

  /**
   * Merge local and remote data and store in enhanced storage
   */
  private async mergeAndStoreData(
    localTasks: Task[],
    localGaps: TimeGap[],
    localPreferences: UserPreferences | null,
    remoteData: { tasks: Task[]; gaps: TimeGap[]; preferences: UserPreferences | null }
  ): Promise<{
    tasksSynced: number;
    gapsSynced: number;
    conflictsResolved: number;
    errors: string[];
  }> {
    const result = {
      tasksSynced: 0,
      gapsSynced: 0,
      conflictsResolved: 0,
      errors: [] as string[]
    };

    try {
      console.log('🔄 Starting data merge and store...');
      
      // Ensure storage is initialized
      if (!this.storage) {
        throw new Error('Storage not initialized');
      }
      
      console.log('📊 Data summary:', {
        localTasks: localTasks.length,
        localGaps: localGaps.length,
        localPreferences: !!localPreferences,
        remoteTasks: remoteData.tasks.length,
        remoteGaps: remoteData.gaps.length,
        remotePreferences: !!remoteData.preferences
      });

      // Merge tasks based on timestamps
      const mergedTasks = new Map<string, Task>();
      
      // First add all local tasks
      localTasks.forEach(task => {
        mergedTasks.set(task.id, task);
      });

      // Then merge remote tasks, only overwriting if they're newer
      remoteData.tasks.forEach(remoteTask => {
        const localTask = mergedTasks.get(remoteTask.id);
        
        if (!localTask) {
          // Task doesn't exist locally, add it
          mergedTasks.set(remoteTask.id, remoteTask);
        } else {
          // Compare timestamps
          const remoteTimestamp = new Date(remoteTask.updated_at || '').getTime();
          const localTimestamp = new Date(localTask.updated_at || '').getTime();
          
          if (remoteTimestamp > localTimestamp) {
            // Remote task is newer, use it
            mergedTasks.set(remoteTask.id, remoteTask);
          }
          // Otherwise keep the local task
        }
      });

      // Save merged tasks
      const finalTasks = Array.from(mergedTasks.values());
      if (finalTasks.length > 0) {
        console.log('💾 Saving merged tasks...');
        await this.storage.saveTasks(finalTasks, true);
        result.tasksSynced = finalTasks.length;
        console.log(`✅ Synced ${result.tasksSynced} tasks`);
      }

      // Merge gaps by date
      console.log(`📅 Processing gaps... Local: ${localGaps.length}, Remote: ${remoteData.gaps.length}`);
      const gapsByDate = new Map<string, TimeGap[]>();
      
      // Add local gaps
      localGaps.forEach(gap => {
        const date = gap.date || new Date().toLocaleDateString('en-CA');
        if (!gapsByDate.has(date)) {
          gapsByDate.set(date, []);
        }
        gapsByDate.get(date)!.push(gap);
      });

      // Add remote gaps (only overwrite local if remote has data for that date)
      if (remoteData.gaps.length > 0) {
        console.log('☁️ Remote gaps found, merging with local gaps...');
        remoteData.gaps.forEach(gap => {
          const date = gap.date || new Date().toLocaleDateString('en-CA');
          // Only overwrite if local doesn't have gaps for this date
          if (!gapsByDate.has(date) || gapsByDate.get(date)!.length === 0) {
            gapsByDate.set(date, [gap]);
          } else {
            console.log(`🔄 Preserving local gaps for date ${date}, skipping remote gap`);
          }
        });
      } else {
        // If remote has no gaps, preserve all local gaps
        console.log(`🔄 Remote gaps empty, preserving all ${localGaps.length} local gaps.`);
        localGaps.forEach(gap => {
          const date = gap.date || new Date().toLocaleDateString('en-CA'); // Use consistent date format
          if (!gapsByDate.has(date)) {
            gapsByDate.set(date, []);
          }
          gapsByDate.get(date)!.push(gap);
        });
      }

      console.log(`📅 Saving gaps for ${gapsByDate.size} dates...`);
      // Save gaps by date
      for (const [date, gaps] of gapsByDate.entries()) {
        console.log(`💾 Saving ${gaps.length} gaps for date: ${date}`);
        await this.storage.saveGaps(gaps, date);
        result.gapsSynced += gaps.length;
      }
      
      console.log(`📊 Final gap summary: ${result.gapsSynced} gaps synced across ${gapsByDate.size} dates`);

      console.log(`✅ Synced ${result.gapsSynced} gaps across ${gapsByDate.size} dates`);

      // Merge preferences (remote takes precedence)
      if (remoteData.preferences) {
        console.log('⚙️ Saving remote preferences...');
        await this.storage.savePreferences(remoteData.preferences);
        console.log('✅ Synced preferences');
      }

      console.log('✅ Data merge and store completed successfully');

    } catch (error: any) {
      console.error('Error merging and storing data:', error);
      console.error('Error details:', {
        errorType: typeof error,
        errorMessage: error?.message || 'Unknown error',
        errorStack: error?.stack || 'No stack trace',
        errorString: String(error)
      });
      result.errors.push(error instanceof Error ? error.message : String(error) || 'Unknown error');
    }

    return result;
  }

  // Delegate storage methods to the enhanced storage manager
  async getTasks(): Promise<Task[]> {
    return this.storage.getTasks();
  }

  async getGaps(date?: string): Promise<TimeGap[]> {
    if (date) {
      return this.storage.getGaps(date);
    }
    return this.storage.getAllGaps();
  }

  async getUserPreferences(): Promise<UserPreferences | null> {
    return this.storage.getPreferences();
  }

  async savePreferences(preferences: UserPreferences): Promise<void> {
    return this.storage.savePreferences(preferences);
  }

  async saveTasks(tasks: Task[], replaceAll: boolean = false): Promise<void> {
    return this.storage.saveTasks(tasks, replaceAll);
  }

  async saveGaps(gaps: TimeGap[], date: string): Promise<void> {
    return this.storage.saveGaps(gaps, date);
  }

  async getSyncStatus(): Promise<{
    isOnline: boolean;
    lastSyncTime: Date | null;
    localDataCount: { tasks: number; gaps: number };
  }> {
    try {
      const tasks = await this.storage.getTasks();
      const gaps = await this.storage.getAllGaps();
      
      return {
        isOnline: navigator.onLine,
        lastSyncTime: new Date(), // TODO: Track actual last sync time
        localDataCount: {
          tasks: tasks.length,
          gaps: gaps.length
        }
      };
    } catch (error) {
      console.error('Error getting sync status:', error);
      return {
        isOnline: navigator.onLine,
        lastSyncTime: null,
        localDataCount: { tasks: 0, gaps: 0 }
      };
    }
  }

  async getStorageHealth(): Promise<any> {
    return this.storage.getStorageHealth();
  }

  async getAnalyticsReport(): Promise<any> {
    return this.storage.getAnalyticsReport();
  }

  async cleanup(): Promise<void> {
    await this.storage.close();
  }
} 