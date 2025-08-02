import { LocalFirstService, LocalFirstConfig } from './LocalFirstService';
import { DatabaseManager } from '../database/DatabaseManager';
import { ConflictResolver } from '../sync/ConflictResolver';
import { LocalTask, LocalTimeGap, LocalUserPreferences } from '../database/schema';
import { Task, TimeGap, UserPreferences } from '../../types/index';
import { supabase } from '../supabase/client';
import { toast } from 'sonner';

export interface LoginSyncResult {
  success: boolean;
  tasksSynced: number;
  gapsSynced: number;
  conflictsResolved: number;
  errors: string[];
  localDataPreserved: boolean;
}

export class EnhancedLocalFirstService extends LocalFirstService {
  private conflictResolver: ConflictResolver;
  private isPerformingLoginSync = false;

  constructor(userId: string, config: Partial<LocalFirstConfig> = {}) {
    super(userId, config);
    this.conflictResolver = new ConflictResolver();
  }

  /**
   * Enhanced initialization with login sync
   */
  async initializeWithLoginSync(): Promise<LoginSyncResult> {
    if (this.isPerformingLoginSync) {
      throw new Error('Login sync already in progress');
    }

    this.isPerformingLoginSync = true;

    try {
      console.log('🔄 Starting enhanced initialization with login sync...');

      // Initialize the base system
      await this.initialize();

      // Perform login sync
      const syncResult = await this.performLoginSync();

      console.log('✅ Enhanced initialization completed:', syncResult);
      return syncResult;
    } catch (error) {
      console.error('❌ Enhanced initialization failed:', error);
      return {
        success: false,
        tasksSynced: 0,
        gapsSynced: 0,
        conflictsResolved: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        localDataPreserved: true
      };
    } finally {
      this.isPerformingLoginSync = false;
    }
  }

  /**
   * Perform comprehensive sync on login with conflict resolution
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
      const localTasks = await this.getTasks();
      const localGaps = await this.getGaps(new Date().toISOString().split('T')[0]);
      const localPreferences = await this.getUserPreferences();

      console.log(`📱 Local data loaded: ${localTasks.length} tasks, ${localGaps.length} gaps`);

      // 2. Fetch remote data
      const remoteData = await this.fetchRemoteData(session.access_token);
      
      console.log(`☁️ Remote data fetched: ${remoteData.tasks.length} tasks, ${remoteData.gaps.length} gaps`);

      // 3. Merge and resolve conflicts
      const mergeResult = await this.mergeLocalAndRemoteData(
        localTasks,
        localGaps,
        localPreferences,
        remoteData,
        session.access_token
      );

      result.tasksSynced = mergeResult.tasksSynced;
      result.gapsSynced = mergeResult.gapsSynced;
      result.conflictsResolved = mergeResult.conflictsResolved;
      result.errors = mergeResult.errors;

      // 4. Push any remaining local changes
      const pushResult = await this.pushLocalChanges(session.access_token);
      result.tasksSynced += pushResult.tasksSynced;
      result.gapsSynced += pushResult.gapsSynced;
      result.errors.push(...pushResult.errors);

      console.log(`✅ Login sync completed: ${result.tasksSynced} tasks, ${result.gapsSynced} gaps synced`);

      // Show user feedback
      if (result.conflictsResolved > 0) {
        toast.success(`${result.conflictsResolved} conflicts resolved during sync`);
      }

      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} sync errors occurred`);
      }

    } catch (error) {
      console.error('❌ Login sync failed:', error);
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      result.localDataPreserved = true; // Always preserve local data on error
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

      return { tasks, gaps, preferences };
    } catch (error) {
      console.error('Failed to fetch remote data:', error);
      return { tasks: [], gaps: [], preferences: null };
    }
  }

  /**
   * Merge local and remote data with conflict resolution
   */
  private async mergeLocalAndRemoteData(
    localTasks: LocalTask[],
    localGaps: LocalTimeGap[],
    localPreferences: LocalUserPreferences | null,
    remoteData: { tasks: any[]; gaps: any[]; preferences: any },
    accessToken: string
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

    // Merge tasks
    for (const remoteTask of remoteData.tasks) {
      try {
        const localTask = localTasks.find(t => t.id === remoteTask.id);
        const resolvedTask = await this.conflictResolver.resolveTaskConflict(localTask, remoteTask);
        
        if (resolvedTask) {
          await this.dbManager.tasks.update(remoteTask.id, resolvedTask);
          result.tasksSynced++;
          
          if (localTask && localTask.local_updated_at !== remoteTask.updated_at) {
            result.conflictsResolved++;
          }
        }
      } catch (error) {
        result.errors.push(`Task merge failed for ${remoteTask.id}: ${error}`);
      }
    }

    // Add remote tasks that don't exist locally
    for (const remoteTask of remoteData.tasks) {
      const exists = localTasks.some(t => t.id === remoteTask.id);
      if (!exists) {
        try {
          await this.dbManager.tasks.create({
            ...remoteTask,
            is_synced: true,
            sync_version: 1,
            local_updated_at: remoteTask.updated_at || new Date().toISOString()
          });
          result.tasksSynced++;
        } catch (error) {
          result.errors.push(`Failed to create remote task ${remoteTask.id}: ${error}`);
        }
      }
    }

    // Merge gaps
    for (const remoteGap of remoteData.gaps) {
      try {
        const localGap = localGaps.find(g => g.id === remoteGap.id);
        const resolvedGap = await this.conflictResolver.resolveGapConflict(localGap, remoteGap);
        
        if (resolvedGap) {
          await this.dbManager.gaps.update(remoteGap.id, resolvedGap);
          result.gapsSynced++;
          
          if (localGap && localGap.local_updated_at !== remoteGap.last_modified_at) {
            result.conflictsResolved++;
          }
        }
      } catch (error) {
        result.errors.push(`Gap merge failed for ${remoteGap.id}: ${error}`);
      }
    }

    // Add remote gaps that don't exist locally
    for (const remoteGap of remoteData.gaps) {
      const exists = localGaps.some(g => g.id === remoteGap.id);
      if (!exists) {
        try {
          await this.dbManager.gaps.create({
            ...remoteGap,
            is_synced: true,
            sync_version: 1,
            local_updated_at: remoteGap.last_modified_at || new Date().toISOString()
          });
          result.gapsSynced++;
        } catch (error) {
          result.errors.push(`Failed to create remote gap ${remoteGap.id}: ${error}`);
        }
      }
    }

    // Merge preferences
    if (remoteData.preferences && localPreferences) {
      try {
        const mergedPreferences = {
          ...localPreferences,
          ...remoteData.preferences,
          local_updated_at: new Date().toISOString(),
          is_synced: true,
          sync_version: (localPreferences.sync_version || 0) + 1
        };
        
        await this.dbManager.preferences.update('current', mergedPreferences);
      } catch (error) {
        result.errors.push(`Preferences merge failed: ${error}`);
      }
    } else if (remoteData.preferences && !localPreferences) {
      try {
        await this.dbManager.preferences.create({
          ...remoteData.preferences,
          is_synced: true,
          sync_version: 1,
          local_updated_at: new Date().toISOString()
        });
      } catch (error) {
        result.errors.push(`Failed to create remote preferences: ${error}`);
      }
    }

    return result;
  }

  /**
   * Push local changes to server
   */
  private async pushLocalChanges(accessToken: string): Promise<{
    tasksSynced: number;
    gapsSynced: number;
    errors: string[];
  }> {
    const result = {
      tasksSynced: 0,
      gapsSynced: 0,
      errors: []
    };

    try {
      // Get unsynced tasks
      const unsyncedTasks = await this.dbManager.tasks.getUnsynced();
      for (const task of unsyncedTasks) {
        try {
          await this.pushTaskToServer(task, accessToken);
          await this.dbManager.tasks.markSynced(task.id, task.sync_version);
          result.tasksSynced++;
        } catch (error) {
          result.errors.push(`Failed to push task ${task.id}: ${error}`);
        }
      }

      // Get unsynced gaps
      const unsyncedGaps = await this.dbManager.gaps.getUnsynced();
      for (const gap of unsyncedGaps) {
        try {
          await this.pushGapToServer(gap, accessToken);
          await this.dbManager.gaps.markSynced(gap.id, gap.sync_version);
          result.gapsSynced++;
        } catch (error) {
          result.errors.push(`Failed to push gap ${gap.id}: ${error}`);
        }
      }
    } catch (error) {
      result.errors.push(`Push operation failed: ${error}`);
    }

    return result;
  }

  /**
   * Push individual task to server
   */
  private async pushTaskToServer(task: LocalTask, accessToken: string): Promise<void> {
    const { projectId } = await import('../supabase/info');
    const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-966d4846/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(task)
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }
  }

  /**
   * Push individual gap to server
   */
  private async pushGapToServer(gap: LocalTimeGap, accessToken: string): Promise<void> {
    const { projectId } = await import('../supabase/info');
    const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-966d4846/gaps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}` 
      },
      body: JSON.stringify(gap)
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }
  }

  /**
   * Enhanced task creation with offline support
   */
  async createTask(taskData: Omit<Task, 'id' | 'created_at' | 'updated_at'>): Promise<LocalTask> {
    const task = await super.createTask(taskData);
    
    // Log for debugging
    console.log(`📝 Task created locally: ${task.id} - ${task.title}`);
    console.log(`🌐 Offline status: ${!navigator.onLine ? 'Offline' : 'Online'}`);
    
    return task;
  }

  /**
   * Enhanced task update with offline support
   */
  async updateTask(id: string, updates: Partial<Task>): Promise<LocalTask | undefined> {
    const task = await super.updateTask(id, updates);
    
    if (task) {
      console.log(`📝 Task updated locally: ${task.id} - ${task.title}`);
      console.log(`🌐 Offline status: ${!navigator.onLine ? 'Offline' : 'Online'}`);
    }
    
    return task;
  }

  /**
   * Get sync status with enhanced logging
   */
  async getEnhancedSyncStatus(): Promise<{
    isOnline: boolean;
    isSyncing: boolean;
    lastSyncTime: Date | null;
    localDataCount: { tasks: number; gaps: number };
    unsyncedCount: { tasks: number; gaps: number };
  }> {
    const baseStatus = await this.getSyncStatus();
    const localTasks = await this.getTasks();
    const localGaps = await this.getGaps(new Date().toISOString().split('T')[0]);
    const unsyncedTasks = await this.dbManager.tasks.getUnsynced();
    const unsyncedGaps = await this.dbManager.gaps.getUnsynced();

    return {
      isOnline: navigator.onLine,
      isSyncing: this.isPerformingLoginSync,
      lastSyncTime: baseStatus.lastSyncTime,
      localDataCount: {
        tasks: localTasks.length,
        gaps: localGaps.length
      },
      unsyncedCount: {
        tasks: unsyncedTasks.length,
        gaps: unsyncedGaps.length
      }
    };
  }

  /**
   * Force sync when network is restored
   */
  async syncWhenOnline(): Promise<void> {
    if (navigator.onLine && !this.isPerformingLoginSync) {
      console.log('🌐 Network restored - triggering sync...');
      try {
        await this.sync({ force: true, priority: 'high' });
        toast.success('Data synced successfully');
      } catch (error) {
        console.error('Sync on network restore failed:', error);
        toast.error('Sync failed - data preserved locally');
      }
    }
  }
} 