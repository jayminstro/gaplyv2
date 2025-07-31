import { DatabaseManager } from '../database/DatabaseManager';
import { ConflictResolver } from './ConflictResolver.ts';
import { DeltaCalculator } from './DeltaCalculator.ts';
import { NetworkMonitor } from './NetworkMonitor';
import { LocalTask, LocalTimeGap, SyncQueueItem } from '../database/schema';
import { supabase } from '../supabase/client';


export interface SyncOptions {
  force?: boolean;
  priority?: 'high' | 'normal' | 'low';
  retryCount?: number;
}

export interface SyncResult {
  success: boolean;
  syncedItems: number;
  conflicts: number;
  errors: string[];
  duration: number;
}

export class SyncManager {
  private dbManager: DatabaseManager;
  private conflictResolver: ConflictResolver;
  private deltaCalculator: DeltaCalculator;
  private networkMonitor: NetworkMonitor;
  private isSyncing = false;

  private lastSyncTime: Date | null = null;

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
    this.conflictResolver = new ConflictResolver();
    this.deltaCalculator = new DeltaCalculator();
    this.networkMonitor = new NetworkMonitor();
  }

  // Main sync orchestration
  async sync(options: SyncOptions = {}): Promise<SyncResult> {
    if (this.isSyncing && !options.force) {
      console.log('🔄 Sync already in progress, skipping...');
      return { success: false, syncedItems: 0, conflicts: 0, errors: ['Sync already in progress'], duration: 0 };
    }

    const startTime = Date.now();
    this.isSyncing = true;

    try {
      console.log('🔄 Starting sync...');
      
      // Check network connectivity
      if (!this.networkMonitor.isOnline()) {
        throw new Error('No network connectivity');
      }

      // Get authentication session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No authentication session');
      }

      const result = await this.performSync(session.access_token, options);
      
      this.lastSyncTime = new Date();
      console.log(`✅ Sync completed: ${result.syncedItems} items synced, ${result.conflicts} conflicts`);
      
      return result;
    } catch (error) {
      console.error('❌ Sync failed:', error);
      return {
        success: false,
        syncedItems: 0,
        conflicts: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        duration: Date.now() - startTime
      };
    } finally {
      this.isSyncing = false;
    }
  }

  private async performSync(accessToken: string, options: SyncOptions): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      syncedItems: 0,
      conflicts: 0,
      errors: [],
      duration: 0
    };

    // 1. Push local changes to server
    const pushResult = await this.pushLocalChanges(accessToken, options);
    result.syncedItems += pushResult.syncedItems;
    result.conflicts += pushResult.conflicts;
    result.errors.push(...pushResult.errors);

    // 2. Pull server changes
    const pullResult = await this.pullServerChanges(accessToken, options);
    result.syncedItems += pullResult.syncedItems;
    result.conflicts += pullResult.conflicts;
    result.errors.push(...pullResult.errors);

    // 3. Process sync queue
    const queueResult = await this.processSyncQueue(accessToken, options);
    result.syncedItems += queueResult.syncedItems;
    result.conflicts += queueResult.conflicts;
    result.errors.push(...queueResult.errors);

    return result;
  }

  private async pushLocalChanges(accessToken: string, _options: SyncOptions): Promise<SyncResult> {
    const result: SyncResult = { success: true, syncedItems: 0, conflicts: 0, errors: [], duration: 0 };

    try {
      // Get unsynced tasks
      const unsyncedTasks = await this.dbManager.tasks.getUnsynced();
      for (const task of unsyncedTasks) {
        try {
          await this.pushTask(task, accessToken);
          result.syncedItems++;
        } catch (error) {
          result.errors.push(`Failed to sync task ${task.id}: ${error}`);
        }
      }

      // Get unsynced gaps
      const unsyncedGaps = await this.dbManager.gaps.getUnsynced();
      for (const gap of unsyncedGaps) {
        try {
          await this.pushGap(gap, accessToken);
          result.syncedItems++;
        } catch (error) {
          result.errors.push(`Failed to sync gap ${gap.id}: ${error}`);
        }
      }
    } catch (error) {
      result.success = false;
      result.errors.push(`Push failed: ${error}`);
    }

    return result;
  }

  private async pullServerChanges(accessToken: string, _options: SyncOptions): Promise<SyncResult> {
    const result: SyncResult = { success: true, syncedItems: 0, conflicts: 0, errors: [], duration: 0 };

    try {
      // Get last sync time for delta sync
      const lastSync = this.lastSyncTime?.toISOString() || new Date(0).toISOString();

      // Pull tasks
      const serverTasks = await this.fetchServerTasks(accessToken, lastSync);
      for (const serverTask of serverTasks) {
        try {
          const localTask = await this.dbManager.tasks.getById(serverTask.id);
          const resolvedTask = await this.conflictResolver.resolveTaskConflict(localTask, serverTask);
          
          if (resolvedTask) {
            await this.dbManager.tasks.update(serverTask.id, resolvedTask);
            result.syncedItems++;
          }
        } catch (error) {
          result.conflicts++;
          result.errors.push(`Task conflict resolution failed for ${serverTask.id}: ${error}`);
        }
      }

      // Pull gaps
      const serverGaps = await this.fetchServerGaps(accessToken, lastSync);
      for (const serverGap of serverGaps) {
        try {
          const localGap = await this.dbManager.gaps.getById(serverGap.id);
          const resolvedGap = await this.conflictResolver.resolveGapConflict(localGap, serverGap);
          
          if (resolvedGap) {
            await this.dbManager.gaps.update(serverGap.id, resolvedGap);
            result.syncedItems++;
          }
        } catch (error) {
          result.conflicts++;
          result.errors.push(`Gap conflict resolution failed for ${serverGap.id}: ${error}`);
        }
      }
    } catch (error) {
      result.success = false;
      result.errors.push(`Pull failed: ${error}`);
    }

    return result;
  }

  private async processSyncQueue(accessToken: string, _options: SyncOptions): Promise<SyncResult> {
    const result: SyncResult = { success: true, syncedItems: 0, conflicts: 0, errors: [], duration: 0 };

    try {
      const queueItems = await this.dbManager.getDatabase().sync_queue.toArray();
      
      for (const item of queueItems) {
        try {
          await this.processQueueItem(item, accessToken);
          await this.dbManager.getDatabase().sync_queue.delete(item.id);
          result.syncedItems++;
        } catch (error) {
          item.retry_count++;
          item.last_retry_at = new Date().toISOString();
          item.error_message = error instanceof Error ? error.message : 'Unknown error';
          
          if (item.retry_count >= 5) {
            await this.dbManager.getDatabase().sync_queue.delete(item.id);
            result.errors.push(`Max retries exceeded for ${item.table} ${item.operation}`);
          } else {
            await this.dbManager.getDatabase().sync_queue.put(item);
          }
        }
      }
    } catch (error) {
      result.success = false;
      result.errors.push(`Queue processing failed: ${error}`);
    }

    return result;
  }

  // Individual item sync methods
  private async pushTask(task: LocalTask, accessToken: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke('make-server-966d4846/tasks', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { task: this.deltaCalculator.calculateTaskDelta(task) }
    });

    if (error) throw error;
    
    await this.dbManager.tasks.markSynced(task.id, task.sync_version);
  }

  private async pushGap(gap: LocalTimeGap, accessToken: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke('make-server-966d4846/gaps', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { gap: this.deltaCalculator.calculateGapDelta(gap) }
    });

    if (error) throw error;
    
    await this.dbManager.gaps.markSynced(gap.id, gap.sync_version);
  }

  private async fetchServerTasks(accessToken: string, since: string): Promise<any[]> {
    const { data, error } = await supabase.functions.invoke('make-server-966d4846/tasks', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { since }
    });

    if (error) throw error;
    return data || [];
  }

  private async fetchServerGaps(accessToken: string, since: string): Promise<any[]> {
    const { data, error } = await supabase.functions.invoke('make-server-966d4846/gaps', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { since }
    });

    if (error) throw error;
    return data || [];
  }

  private async processQueueItem(item: SyncQueueItem, accessToken: string): Promise<void> {
    switch (item.table) {
      case 'tasks':
        if (item.operation === 'delete') {
          await this.deleteServerTask(item.data.id, accessToken);
        } else {
          await this.pushTask(item.data, accessToken);
        }
        break;
      case 'gaps':
        if (item.operation === 'delete') {
          await this.deleteServerGap(item.data.id, accessToken);
        } else {
          await this.pushGap(item.data, accessToken);
        }
        break;
      default:
        throw new Error(`Unsupported table: ${item.table}`);
    }
  }

  private async deleteServerTask(taskId: string, accessToken: string): Promise<void> {
    const { error } = await supabase.functions.invoke(`make-server-966d4846/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      method: 'DELETE'
    });

    if (error) throw error;
    await this.dbManager.tasks.markDeletedSynced(taskId);
  }

  private async deleteServerGap(gapId: string, accessToken: string): Promise<void> {
    const { error } = await supabase.functions.invoke(`make-server-966d4846/gaps/${gapId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      method: 'DELETE'
    });

    if (error) throw error;
    await this.dbManager.gaps.markDeletedSynced(gapId);
  }

  // Background sync
  async startBackgroundSync(intervalMs: number = 30000): Promise<void> {
    setInterval(async () => {
      if (this.networkMonitor.isOnline() && !this.isSyncing) {
        await this.sync({ priority: 'low' });
      }
    }, intervalMs);
  }

  // Status methods
  isCurrentlySyncing(): boolean {
    return this.isSyncing;
  }

  getLastSyncTime(): Date | null {
    return this.lastSyncTime;
  }

  async getSyncStatus(): Promise<any> {
    return await this.dbManager.getSyncStatus();
  }
} 