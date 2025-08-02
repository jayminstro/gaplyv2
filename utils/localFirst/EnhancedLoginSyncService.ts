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
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
    this.storage = new EnhancedStorageManager(userId, {
      storageType: 'auto',
      enableEncryption: true,
      encryptFields: ['description', 'notes', 'title'],
      enableAnalytics: true,
      enableSync: false, // We'll handle sync manually here
      analyticsConfig: {
        trackAccessPatterns: true,
        trackSizeChanges: true,
        trackPerformance: true,
        retentionDays: 30,
        sampleRate: 0.1
      }
    });
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
      const localTasks = await this.storage.getTasks();
      const localGaps = await this.storage.getAllGaps();
      const localPreferences = await this.storage.getPreferences();

      console.log(`📱 Local data loaded: ${localTasks.length} tasks, ${localGaps.length} gaps`);

      // 2. Fetch remote data
      const remoteData = await this.fetchRemoteData(session.access_token);
      console.log(`☁️ Remote data fetched: ${remoteData.tasks.length} tasks, ${remoteData.gaps.length} gaps`);

      // 3. Merge and store data
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
      // Merge tasks (remote takes precedence for now)
      if (remoteData.tasks.length > 0) {
        await this.storage.saveTasks(remoteData.tasks);
        result.tasksSynced = remoteData.tasks.length;
        console.log(`✅ Synced ${result.tasksSynced} tasks`);
      }

      // Merge gaps by date
      const gapsByDate = new Map<string, TimeGap[]>();
      
      // Add local gaps
      localGaps.forEach(gap => {
        const date = gap.date || new Date().toISOString().split('T')[0];
        if (!gapsByDate.has(date)) {
          gapsByDate.set(date, []);
        }
        gapsByDate.get(date)!.push(gap);
      });

      // Add remote gaps (overwrite local for same date)
      remoteData.gaps.forEach(gap => {
        const date = gap.date || new Date().toISOString().split('T')[0];
        gapsByDate.set(date, [gap]);
      });

      // Save gaps by date
      for (const [date, gaps] of gapsByDate.entries()) {
        await this.storage.saveGaps(gaps, date);
        result.gapsSynced += gaps.length;
      }

      console.log(`✅ Synced ${result.gapsSynced} gaps across ${gapsByDate.size} dates`);

      // Merge preferences (remote takes precedence)
      if (remoteData.preferences) {
        await this.storage.savePreferences(remoteData.preferences);
        console.log('✅ Synced preferences');
      }

    } catch (error) {
      console.error('Error merging and storing data:', error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
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