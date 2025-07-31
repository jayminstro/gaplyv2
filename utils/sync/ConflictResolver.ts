import { LocalTask, LocalTimeGap } from '../database/schema';

export interface ConflictResolution {
  resolved: boolean;
  data?: any;
  strategy: 'local' | 'remote' | 'merge' | 'manual';
}

export class ConflictResolver {
  
  // Task conflict resolution
  async resolveTaskConflict(localTask: LocalTask | undefined, serverTask: any): Promise<LocalTask | null> {
    if (!localTask) {
      // No local task, use server data
      return this.convertServerTaskToLocal(serverTask);
    }

    if (!serverTask) {
      // No server task, keep local data
      return localTask;
    }

    // Compare timestamps to determine winner
    const localTime = new Date(localTask.local_updated_at).getTime();
    const serverTime = new Date(serverTask.updated_at).getTime();

    if (localTime > serverTime) {
      // Local is newer, keep local
      return localTask;
    } else if (serverTime > localTime) {
      // Server is newer, use server
      return this.convertServerTaskToLocal(serverTask);
    } else {
      // Same timestamp, merge if possible
      return this.mergeTasks(localTask, serverTask);
    }
  }

  // Gap conflict resolution
  async resolveGapConflict(localGap: LocalTimeGap | undefined, serverGap: any): Promise<LocalTimeGap | null> {
    if (!localGap) {
      // No local gap, use server data
      return this.convertServerGapToLocal(serverGap);
    }

    if (!serverGap) {
      // No server gap, keep local data
      return localGap;
    }

    // Compare timestamps to determine winner
    const localTime = new Date(localGap.local_updated_at).getTime();
    const serverTime = new Date(serverGap.last_modified_at).getTime();

    if (localTime > serverTime) {
      // Local is newer, keep local
      return localGap;
    } else if (serverTime > localTime) {
      // Server is newer, use server
      return this.convertServerGapToLocal(serverGap);
    } else {
      // Same timestamp, merge if possible
      return this.mergeGaps(localGap, serverGap);
    }
  }

  // Conversion methods
  private convertServerTaskToLocal(serverTask: any): LocalTask {
    return {
      ...serverTask,
      is_synced: true,
      sync_version: 1,
      local_updated_at: serverTask.updated_at || new Date().toISOString(),
      deleted_at: undefined
    };
  }

  private convertServerGapToLocal(serverGap: any): LocalTimeGap {
    return {
      ...serverGap,
      is_synced: true,
      sync_version: 1,
      local_updated_at: serverGap.last_modified_at || new Date().toISOString(),
      deleted_at: undefined
    };
  }

  // Merge methods
  private mergeTasks(localTask: LocalTask, serverTask: any): LocalTask {
    // For tasks, prefer local changes for user-specific fields
    return {
      ...serverTask,
      ...localTask,
      is_synced: true,
      sync_version: Math.max(localTask.sync_version, 1) + 1,
      local_updated_at: new Date().toISOString(),
      // Preserve local user preferences
      notes: localTask.notes || serverTask.notes,
      isTimerRunning: localTask.isTimerRunning,
      timerRemaining: localTask.timerRemaining,
      timerTotal: localTask.timerTotal
    };
  }

  private mergeGaps(localGap: LocalTimeGap, serverGap: any): LocalTimeGap {
    // For gaps, prefer server data for structural fields, local for user modifications
    return {
      ...serverGap,
      ...localGap,
      is_synced: true,
      sync_version: Math.max(localGap.sync_version, 1) + 1,
      local_updated_at: new Date().toISOString(),
      // Preserve local user modifications
      is_available: localGap.is_available,
      modified_by: localGap.modified_by
    };
  }

  // Advanced conflict resolution strategies
  async resolveComplexConflict(localData: any, serverData: any, type: 'task' | 'gap'): Promise<ConflictResolution> {
    // This method can be extended for more complex conflict scenarios
    // For now, we use timestamp-based resolution
    
    const localTime = new Date(localData.local_updated_at || localData.updated_at).getTime();
    const serverTime = new Date(serverData.updated_at || serverData.last_modified_at).getTime();

    if (localTime > serverTime) {
      return { resolved: true, data: localData, strategy: 'local' };
    } else if (serverTime > localTime) {
      return { resolved: true, data: serverData, strategy: 'remote' };
    } else {
      // Same timestamp, require manual resolution
      return { resolved: false, strategy: 'manual' };
    }
  }
} 