import { Task, TimeGap, UserPreferences } from '../../types/index';
import { IStorageStrategy } from './StorageStrategy';

export interface SyncItem {
  id: string;
  type: 'task' | 'gap' | 'preference';
  data: any;
  version: number;
  lastModified: string;
  source: string;
}

export interface SyncConflict {
  itemId: string;
  type: 'task' | 'gap' | 'preference';
  localVersion: SyncItem;
  remoteVersion: SyncItem;
  resolution: 'local' | 'remote' | 'merge' | 'manual';
}

export interface SyncResult {
  success: boolean;
  syncedItems: number;
  conflicts: SyncConflict[];
  errors: string[];
  lastSyncTime: string;
}

export interface SyncOptions {
  conflictResolution: 'local' | 'remote' | 'merge' | 'manual';
  syncInterval: number; // milliseconds
  retryAttempts: number;
  batchSize: number;
}

export class StorageSync {
  private primaryStorage: IStorageStrategy;
  private secondaryStorage: IStorageStrategy;
  private options: SyncOptions;
  private isSyncing = false;
  private lastSyncTime: string | null = null;
  private syncQueue: SyncItem[] = [];
  private conflictHandlers: Map<string, (conflict: SyncConflict) => Promise<'local' | 'remote' | 'merge'>> = new Map();

  constructor(
    primaryStorage: IStorageStrategy,
    secondaryStorage: IStorageStrategy,
    options: Partial<SyncOptions> = {}
  ) {
    this.primaryStorage = primaryStorage;
    this.secondaryStorage = secondaryStorage;
    this.options = {
      conflictResolution: 'merge',
      syncInterval: 30000, // 30 seconds
      retryAttempts: 3,
      batchSize: 50,
      ...options
    };
  }

  /**
   * Register a conflict handler for a specific item type
   */
  registerConflictHandler(
    itemType: string,
    handler: (conflict: SyncConflict) => Promise<'local' | 'remote' | 'merge'>
  ): void {
    this.conflictHandlers.set(itemType, handler);
  }

  /**
   * Start automatic synchronization
   */
  startAutoSync(): void {
    if (this.isSyncing) return;

    const sync = async () => {
      if (!this.isSyncing) {
        await this.sync();
      }
    };

    // Initial sync
    sync();

    // Set up interval
    setInterval(sync, this.options.syncInterval);
  }

  /**
   * Stop automatic synchronization
   */
  stopAutoSync(): void {
    this.isSyncing = false;
  }

  /**
   * Perform a full synchronization between storage backends
   */
  async sync(): Promise<SyncResult> {
    if (this.isSyncing) {
      return {
        success: false,
        syncedItems: 0,
        conflicts: [],
        errors: ['Sync already in progress'],
        lastSyncTime: this.lastSyncTime || new Date().toISOString()
      };
    }

    this.isSyncing = true;
    const result: SyncResult = {
      success: true,
      syncedItems: 0,
      conflicts: [],
      errors: [],
      lastSyncTime: new Date().toISOString()
    };

    try {
      console.log('🔄 Starting storage synchronization...');

      // Sync tasks
      const taskResult = await this.syncTasks();
      result.syncedItems += taskResult.syncedItems;
      result.conflicts.push(...taskResult.conflicts);
      result.errors.push(...taskResult.errors);

      // Sync gaps
      const gapResult = await this.syncGaps();
      result.syncedItems += gapResult.syncedItems;
      result.conflicts.push(...gapResult.conflicts);
      result.errors.push(...gapResult.errors);

      // Sync preferences
      const prefResult = await this.syncPreferences();
      result.syncedItems += prefResult.syncedItems;
      result.conflicts.push(...prefResult.conflicts);
      result.errors.push(...prefResult.errors);

      // Handle conflicts
      if (result.conflicts.length > 0) {
        await this.resolveConflicts(result.conflicts);
      }

      this.lastSyncTime = result.lastSyncTime;
      console.log(`✅ Sync completed: ${result.syncedItems} items synced, ${result.conflicts.length} conflicts resolved`);
    } catch (error) {
      console.error('❌ Sync failed:', error);
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Unknown sync error');
    } finally {
      this.isSyncing = false;
    }

    return result;
  }

  /**
   * Sync tasks between storage backends
   */
  private async syncTasks(): Promise<{ syncedItems: number; conflicts: SyncConflict[]; errors: string[] }> {
    const result = { syncedItems: 0, conflicts: [] as SyncConflict[], errors: [] as string[] };

    try {
      const [primaryTasks, secondaryTasks] = await Promise.all([
        this.primaryStorage.getTasks(),
        this.secondaryStorage.getTasks()
      ]);

      const primaryMap = new Map(primaryTasks.map(task => [task.id, task]));
      const secondaryMap = new Map(secondaryTasks.map(task => [task.id, task]));

      // Find items that need syncing
      const allIds = new Set([...primaryMap.keys(), ...secondaryMap.keys()]);

      for (const id of allIds) {
        const primaryTask = primaryMap.get(id);
        const secondaryTask = secondaryMap.get(id);

        if (!primaryTask && secondaryTask) {
          // Task only exists in secondary storage
          await this.primaryStorage.updateTask(id, secondaryTask);
          result.syncedItems++;
        } else if (primaryTask && !secondaryTask) {
          // Task only exists in primary storage
          await this.secondaryStorage.updateTask(id, primaryTask);
          result.syncedItems++;
        } else if (primaryTask && secondaryTask) {
          // Task exists in both - check for conflicts
          const conflict = this.detectConflict('task', id, primaryTask, secondaryTask);
          if (conflict) {
            result.conflicts.push(conflict);
          } else {
            // No conflict, ensure both are up to date
            const latestTask = this.getLatestVersion(primaryTask, secondaryTask);
            await Promise.all([
              this.primaryStorage.updateTask(id, latestTask),
              this.secondaryStorage.updateTask(id, latestTask)
            ]);
            result.syncedItems++;
          }
        }
      }
    } catch (error) {
      result.errors.push(`Task sync error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Sync gaps between storage backends
   */
  private async syncGaps(): Promise<{ syncedItems: number; conflicts: SyncConflict[]; errors: string[] }> {
    const result = { syncedItems: 0, conflicts: [] as SyncConflict[], errors: [] as string[] };

    try {
      const [primaryGaps, secondaryGaps] = await Promise.all([
        this.primaryStorage.getAllGaps(),
        this.secondaryStorage.getAllGaps()
      ]);

      const primaryMap = new Map(primaryGaps.map(gap => [gap.id, gap]));
      const secondaryMap = new Map(secondaryGaps.map(gap => [gap.id, gap]));

      const allIds = new Set([...primaryMap.keys(), ...secondaryMap.keys()]);

      for (const id of allIds) {
        const primaryGap = primaryMap.get(id);
        const secondaryGap = secondaryMap.get(id);

        if (!primaryGap && secondaryGap) {
          // Gap only exists in secondary storage
          const date = secondaryGap.date || new Date().toISOString().split('T')[0];
          const existingGaps = await this.primaryStorage.getGaps(date);
          existingGaps.push(secondaryGap);
          await this.primaryStorage.saveGaps(existingGaps, date);
          result.syncedItems++;
        } else if (primaryGap && !secondaryGap) {
          // Gap only exists in primary storage
          const date = primaryGap.date || new Date().toISOString().split('T')[0];
          const existingGaps = await this.secondaryStorage.getGaps(date);
          existingGaps.push(primaryGap);
          await this.secondaryStorage.saveGaps(existingGaps, date);
          result.syncedItems++;
        } else if (primaryGap && secondaryGap) {
          // Gap exists in both - check for conflicts
          const conflict = this.detectConflict('gap', id, primaryGap, secondaryGap);
          if (conflict) {
            result.conflicts.push(conflict);
          } else {
            // No conflict, ensure both are up to date
            const latestGap = this.getLatestVersion(primaryGap, secondaryGap);
            const date = latestGap.date || new Date().toISOString().split('T')[0];
            
            await Promise.all([
              this.updateGapInStorage(this.primaryStorage, latestGap, date),
              this.updateGapInStorage(this.secondaryStorage, latestGap, date)
            ]);
            result.syncedItems++;
          }
        }
      }
    } catch (error) {
      result.errors.push(`Gap sync error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Sync preferences between storage backends
   */
  private async syncPreferences(): Promise<{ syncedItems: number; conflicts: SyncConflict[]; errors: string[] }> {
    const result = { syncedItems: 0, conflicts: [] as SyncConflict[], errors: [] as string[] };

    try {
      const [primaryPrefs, secondaryPrefs] = await Promise.all([
        this.primaryStorage.getPreferences(),
        this.secondaryStorage.getPreferences()
      ]);

      if (!primaryPrefs && secondaryPrefs) {
        // Preferences only exist in secondary storage
        await this.primaryStorage.savePreferences(secondaryPrefs);
        result.syncedItems++;
      } else if (primaryPrefs && !secondaryPrefs) {
        // Preferences only exist in primary storage
        await this.secondaryStorage.savePreferences(primaryPrefs);
        result.syncedItems++;
      } else if (primaryPrefs && secondaryPrefs) {
        // Preferences exist in both - check for conflicts
        const conflict = this.detectConflict('preference', 'preferences', primaryPrefs, secondaryPrefs);
        if (conflict) {
          result.conflicts.push(conflict);
        } else {
          // No conflict, ensure both are up to date
          const latestPrefs = this.getLatestVersion(primaryPrefs, secondaryPrefs);
          await Promise.all([
            this.primaryStorage.savePreferences(latestPrefs),
            this.secondaryStorage.savePreferences(latestPrefs)
          ]);
          result.syncedItems++;
        }
      }
    } catch (error) {
      result.errors.push(`Preferences sync error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Detect conflicts between two versions of an item
   */
  private detectConflict(
    type: 'task' | 'gap' | 'preference',
    id: string,
    primary: any,
    secondary: any
  ): SyncConflict | null {
    const primaryVersion = this.getItemVersion(primary);
    const secondaryVersion = this.getItemVersion(secondary);

    if (primaryVersion === secondaryVersion) {
      return null; // No conflict
    }

    return {
      itemId: id,
      type,
      localVersion: {
        id,
        type,
        data: primary,
        version: primaryVersion,
        lastModified: primary.updated_at || primary.created_at,
        source: 'primary'
      },
      remoteVersion: {
        id,
        type,
        data: secondary,
        version: secondaryVersion,
        lastModified: secondary.updated_at || secondary.created_at,
        source: 'secondary'
      },
      resolution: this.options.conflictResolution
    };
  }

  /**
   * Get the latest version of an item based on modification time
   */
  private getLatestVersion(primary: any, secondary: any): any {
    const primaryTime = new Date(primary.updated_at || primary.created_at).getTime();
    const secondaryTime = new Date(secondary.updated_at || secondary.created_at).getTime();
    
    return primaryTime >= secondaryTime ? primary : secondary;
  }

  /**
   * Get a version number for an item (based on modification time)
   */
  private getItemVersion(item: any): number {
    const time = new Date(item.updated_at || item.created_at).getTime();
    return Math.floor(time / 1000); // Convert to seconds for simpler versioning
  }

  /**
   * Update a gap in storage (helper method)
   */
  private async updateGapInStorage(storage: IStorageStrategy, gap: any, date: string): Promise<void> {
    const existingGaps = await storage.getGaps(date);
    const index = existingGaps.findIndex(g => g.id === gap.id);
    
    if (index !== -1) {
      existingGaps[index] = gap;
    } else {
      existingGaps.push(gap);
    }
    
    await storage.saveGaps(existingGaps, date);
  }

  /**
   * Resolve conflicts using the configured resolution strategy
   */
  private async resolveConflicts(conflicts: SyncConflict[]): Promise<void> {
    for (const conflict of conflicts) {
      let resolution = conflict.resolution;

      // Check for custom handler
      const handler = this.conflictHandlers.get(conflict.type);
      if (handler) {
        try {
          resolution = await handler(conflict);
        } catch (error) {
          console.error('Error in conflict handler:', error);
          resolution = this.options.conflictResolution;
        }
      }

      await this.applyConflictResolution(conflict, resolution);
    }
  }

  /**
   * Apply the chosen resolution to a conflict
   */
  private async applyConflictResolution(conflict: SyncConflict, resolution: 'local' | 'remote' | 'merge'): Promise<void> {
    const { itemId, type, localVersion, remoteVersion } = conflict;

    switch (resolution) {
      case 'local':
        await this.updateItemInStorage(type, itemId, localVersion.data);
        break;
      case 'remote':
        await this.updateItemInStorage(type, itemId, remoteVersion.data);
        break;
      case 'merge':
        const mergedData = this.mergeItems(localVersion.data, remoteVersion.data);
        await this.updateItemInStorage(type, itemId, mergedData);
        break;
      default:
        console.warn(`Unknown conflict resolution: ${resolution}`);
    }
  }

  /**
   * Update an item in both storage backends
   */
  private async updateItemInStorage(type: 'task' | 'gap' | 'preference', id: string, data: any): Promise<void> {
    switch (type) {
      case 'task':
        await Promise.all([
          this.primaryStorage.updateTask(id, data),
          this.secondaryStorage.updateTask(id, data)
        ]);
        break;
      case 'gap':
        const date = data.date || new Date().toISOString().split('T')[0];
        await Promise.all([
          this.updateGapInStorage(this.primaryStorage, data, date),
          this.updateGapInStorage(this.secondaryStorage, data, date)
        ]);
        break;
      case 'preference':
        await Promise.all([
          this.primaryStorage.savePreferences(data),
          this.secondaryStorage.savePreferences(data)
        ]);
        break;
    }
  }

  /**
   * Merge two items (simple strategy - prefer non-null values)
   */
  private mergeItems(local: any, remote: any): any {
    const merged = { ...local };
    
    for (const [key, value] of Object.entries(remote)) {
      if (value !== null && value !== undefined && merged[key] === null || merged[key] === undefined) {
        merged[key] = value;
      }
    }
    
    // Update timestamp to reflect merge
    merged.updated_at = new Date().toISOString();
    
    return merged;
  }

  /**
   * Get sync status
   */
  getSyncStatus(): {
    isSyncing: boolean;
    lastSyncTime: string | null;
    queueLength: number;
  } {
    return {
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      queueLength: this.syncQueue.length
    };
  }

  /**
   * Force a sync operation
   */
  async forceSync(): Promise<SyncResult> {
    return this.sync();
  }
} 