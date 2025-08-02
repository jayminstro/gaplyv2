import { DatabaseManager } from '../database/DatabaseManager';
import { ConflictResolver } from '../sync/ConflictResolver';
import { LocalTask, LocalTimeGap, LocalUserPreferences } from '../database/schema';
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

export class LoginSyncService {
  private dbManager: DatabaseManager;
  private conflictResolver: ConflictResolver;
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
    this.dbManager = new DatabaseManager(userId);
    this.conflictResolver = new ConflictResolver();
  }

  /**
   * Initialize the service and perform login sync
   */
  async initializeAndSync(): Promise<LoginSyncResult> {
    try {
      console.log('🔄 Starting login sync service initialization...');
      
      // Initialize database
      await this.dbManager.initialize();
      
      // Perform login sync
      const syncResult = await this.performLoginSync();
      
      console.log('✅ Login sync completed', syncResult);
      return syncResult;
    } catch (error) {
      console.error('❌ Login sync service initialization failed:', error);
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

      console.log('🔄 Performing login sync...');

      // 1. Load local data first
      const localTasks = await this.dbManager.tasks.getAll();
      const localGaps = await this.dbManager.gaps.getAll();
      const localPreferences = await this.dbManager.preferences.get('current');

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

      // Update result
      result.tasksSynced = mergeResult.tasksSynced;
      result.gapsSynced = mergeResult.gapsSynced;
      result.conflictsResolved = mergeResult.conflictsResolved;
      result.errors = mergeResult.errors;

      console.log(`✅ Login sync completed: ${result.tasksSynced} tasks, ${result.gapsSynced} gaps synced`);
      if (result.conflictsResolved > 0) {
        console.log(`🔄 ${result.conflictsResolved} conflicts resolved`);
      }

    } catch (error) {
      console.error('❌ Login sync failed:', error);
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    return result;
  }

  /**
   * Fetch remote data from server
   */
  private async fetchRemoteData(accessToken: string): Promise<{
    tasks: any[];
    gaps: any[];
    preferences: any;
  }> {
    const { projectId } = await import('../supabase/info');
    const baseUrl = `https://${projectId}.supabase.co/functions/v1/make-server-966d4846`;

    try {
      console.log('🌐 Fetching remote data...');

      const [tasksResponse, gapsResponse, preferencesResponse] = await Promise.allSettled([
        fetch(`${baseUrl}/tasks`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        }),
        fetch(`${baseUrl}/gaps`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        }),
        fetch(`${baseUrl}/preferences`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        })
      ]);

      const tasks = tasksResponse.status === 'fulfilled' && tasksResponse.value.ok 
        ? await tasksResponse.value.json() 
        : [];
      
      const gaps = gapsResponse.status === 'fulfilled' && gapsResponse.value.ok 
        ? await gapsResponse.value.json() 
        : [];
      
      const preferences = preferencesResponse.status === 'fulfilled' && preferencesResponse.value.ok 
        ? await preferencesResponse.value.json() 
        : null;

      console.log(`✅ Remote data fetched: ${tasks.length} tasks, ${gaps.length} gaps`);
      return { tasks, gaps, preferences };
    } catch (error) {
      console.error('❌ Failed to fetch remote data:', error);
      return { tasks: [], gaps: [], preferences: null };
    }
  }

  /**
   * Merge remote data with local data and store in local database
   */
  private async mergeAndStoreData(
    localTasks: LocalTask[],
    localGaps: LocalTimeGap[],
    localPreferences: LocalUserPreferences | null,
    remoteData: { tasks: any[]; gaps: any[]; preferences: any }
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
      errors: []
    };

    // Process tasks
    for (const remoteTask of remoteData.tasks) {
      try {
        const localTask = localTasks.find(t => t.id === remoteTask.id);
        const resolvedTask = await this.conflictResolver.resolveTaskConflict(localTask, remoteTask);
        
        if (resolvedTask) {
          if (localTask) {
            // Update existing task
            await this.dbManager.tasks.update(remoteTask.id, resolvedTask);
            if (localTask.local_updated_at !== remoteTask.updated_at) {
              result.conflictsResolved++;
            }
          } else {
            // Create new task
            await this.dbManager.tasks.create(resolvedTask);
          }
          result.tasksSynced++;
        }
              } catch (error) {
          const errorMsg = `Task merge failed for ${remoteTask.id}: ${error}`;
          console.error(errorMsg);
        result.errors.push(errorMsg);
      }
    }

    // Process gaps
    for (const remoteGap of remoteData.gaps) {
      try {
        const localGap = localGaps.find(g => g.id === remoteGap.id);
        const resolvedGap = await this.conflictResolver.resolveGapConflict(localGap, remoteGap);
        
        if (resolvedGap) {
          if (localGap) {
            // Update existing gap
            await this.dbManager.gaps.update(remoteGap.id, resolvedGap);
            if (localGap.local_updated_at !== remoteGap.last_modified_at) {
              result.conflictsResolved++;
            }
          } else {
            // Create new gap
            await this.dbManager.gaps.create(resolvedGap);
          }
          result.gapsSynced++;
        }
              } catch (error) {
          const errorMsg = `Gap merge failed for ${remoteGap.id}: ${error}`;
          console.error(errorMsg);
        result.errors.push(errorMsg);
      }
    }

    // Process preferences
    if (remoteData.preferences) {
      try {
        if (localPreferences) {
          // Merge preferences
          const mergedPreferences = {
            ...localPreferences,
            ...remoteData.preferences,
            local_updated_at: new Date().toISOString(),
            is_synced: true,
            sync_version: (localPreferences.sync_version || 0) + 1
          };
          await this.dbManager.preferences.update('current', mergedPreferences);
        } else {
          // Create new preferences
          await this.dbManager.preferences.create({
            ...remoteData.preferences,
            is_synced: true,
            sync_version: 1,
            local_updated_at: new Date().toISOString()
          });
        }
              } catch (error) {
          const errorMsg = `Preferences merge failed: ${error}`;
          console.error(errorMsg);
        result.errors.push(errorMsg);
      }
    }

    return result;
  }

  /**
   * Get tasks from local database
   */
  async getTasks(): Promise<LocalTask[]> {
    return await this.dbManager.tasks.getAll();
  }

  /**
   * Get gaps from local database
   */
  async getGaps(date?: string): Promise<LocalTimeGap[]> {
    if (date) {
      return await this.dbManager.gaps.getByDate(this.userId, date);
    }
    return await this.dbManager.gaps.getAll();
  }

  /**
   * Get user preferences from local database
   */
  async getUserPreferences(): Promise<LocalUserPreferences | null> {
    return await this.dbManager.preferences.get('current');
  }

  /**
   * Get sync status
   */
  async getSyncStatus(): Promise<{
    isOnline: boolean;
    lastSyncTime: Date | null;
    localDataCount: { tasks: number; gaps: number };
  }> {
    const tasks = await this.dbManager.tasks.getAll();
    const gaps = await this.dbManager.gaps.getAll();

    return {
      isOnline: navigator.onLine,
      lastSyncTime: new Date(), // This would be stored and retrieved in a real implementation
      localDataCount: { tasks: tasks.length, gaps: gaps.length }
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // Close database connection if needed
    // For now, just log cleanup
    console.log('🧹 Login sync service cleanup completed');
  }
} 