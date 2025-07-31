import { DatabaseManager } from '../database/DatabaseManager';
import { LocalTask, LocalTimeGap } from '../database/schema';

export interface DeleteOperation {
  id: string;
  table: 'tasks' | 'gaps' | 'preferences' | 'profile' | 'scheduled_gaps' | 'activity_completions';
  timestamp: string;
  userId: string;
  reason?: string;
}

export interface DeleteResult {
  success: boolean;
  phase: 'soft_delete' | 'remote_delete' | 'purge' | 'completed';
  error?: string;
}

export class SafeDeleteManager {
  private dbManager: DatabaseManager;
  private deleteQueue: DeleteOperation[] = [];
  private isProcessing = false;

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
  }

  // Safe delete process
  async safeDelete(
    id: string,
    table: DeleteOperation['table'],
    userId: string,
    reason?: string
  ): Promise<DeleteResult> {
    const operation: DeleteOperation = {
      id,
      table,
      timestamp: new Date().toISOString(),
      userId,
      reason
    };

    try {
      // Phase 1: Soft delete
      const softDeleteResult = await this.performSoftDelete(operation);
      if (!softDeleteResult.success) {
        return softDeleteResult;
      }

      // Add to delete queue for remote sync
      this.deleteQueue.push(operation);

      // Phase 2: Remote delete (will be handled by sync)
      return { success: true, phase: 'soft_delete' };
    } catch (error) {
      return {
        success: false,
        phase: 'soft_delete',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Perform soft delete
  private async performSoftDelete(operation: DeleteOperation): Promise<DeleteResult> {
    try {
      switch (operation.table) {
        case 'tasks':
          await this.dbManager.tasks.delete(operation.id);
          break;
        case 'gaps':
          await this.dbManager.gaps.delete(operation.id);
          break;
        case 'preferences':
          // Don't allow deletion of preferences
          return {
            success: false,
            phase: 'soft_delete',
            error: 'Cannot delete user preferences'
          };
        case 'profile':
          // Don't allow deletion of profile
          return {
            success: false,
            phase: 'soft_delete',
            error: 'Cannot delete user profile'
          };
        default:
          return {
            success: false,
            phase: 'soft_delete',
            error: `Unsupported table: ${operation.table}`
          };
      }

      return { success: true, phase: 'soft_delete' };
    } catch (error) {
      return {
        success: false,
        phase: 'soft_delete',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Process delete queue (called by sync system)
  async processDeleteQueue(): Promise<DeleteResult[]> {
    if (this.isProcessing || this.deleteQueue.length === 0) {
      return [];
    }

    this.isProcessing = true;
    const results: DeleteResult[] = [];

    try {
      for (const operation of this.deleteQueue) {
        try {
          // Check if item is still soft-deleted
          const isStillDeleted = await this.isItemSoftDeleted(operation);
          
          if (!isStillDeleted) {
            // Item was restored, remove from queue
            this.removeFromQueue(operation.id);
            results.push({
              success: true,
              phase: 'completed',
              error: 'Item was restored'
            });
            continue;
          }

          // Mark for remote deletion (sync will handle this)
          results.push({
            success: true,
            phase: 'remote_delete'
          });
        } catch (error) {
          results.push({
            success: false,
            phase: 'remote_delete',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    } finally {
      this.isProcessing = false;
    }

    return results;
  }

  // Confirm remote deletion and purge
  async confirmRemoteDeletion(id: string, table: DeleteOperation['table']): Promise<DeleteResult> {
    try {
      // Phase 3: Purge from local database
      await this.performPurge(id, table);
      
      // Remove from delete queue
      this.removeFromQueue(id);

      return { success: true, phase: 'purge' };
    } catch (error) {
      return {
        success: false,
        phase: 'purge',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Perform hard delete (purge)
  private async performPurge(id: string, table: DeleteOperation['table']): Promise<void> {
    switch (table) {
      case 'tasks':
        await this.dbManager.tasks.hardDelete(id);
        break;
      case 'gaps':
        await this.dbManager.gaps.hardDelete(id);
        break;
      default:
        throw new Error(`Unsupported table for purge: ${table}`);
    }
  }

  // Check if item is still soft-deleted
  private async isItemSoftDeleted(operation: DeleteOperation): Promise<boolean> {
    try {
      switch (operation.table) {
        case 'tasks':
          const task = await this.dbManager.tasks.getById(operation.id);
          return task?.deleted_at !== undefined;
        case 'gaps':
          const gap = await this.dbManager.gaps.getById(operation.id);
          return gap?.deleted_at !== undefined;
        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  // Restore soft-deleted item
  async restoreItem(id: string, table: DeleteOperation['table']): Promise<boolean> {
    try {
      switch (table) {
        case 'tasks':
          const task = await this.dbManager.tasks.getById(id);
          if (task?.deleted_at) {
            await this.dbManager.tasks.update(id, { deleted_at: undefined });
            return true;
          }
          break;
        case 'gaps':
          const gap = await this.dbManager.gaps.getById(id);
          if (gap?.deleted_at) {
            await this.dbManager.gaps.update(id, { deleted_at: undefined });
            return true;
          }
          break;
      }
      return false;
    } catch {
      return false;
    }
  }

  // Queue management
  private removeFromQueue(id: string): void {
    const index = this.deleteQueue.findIndex(op => op.id === id);
    if (index > -1) {
      this.deleteQueue.splice(index, 1);
    }
  }

  getQueueStatus(): {
    pending: number;
    operations: DeleteOperation[];
  } {
    return {
      pending: this.deleteQueue.length,
      operations: [...this.deleteQueue]
    };
  }

  // Cleanup old delete operations
  async cleanupOldOperations(maxAgeHours: number = 24): Promise<number> {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - maxAgeHours);

    const initialLength = this.deleteQueue.length;
    
    this.deleteQueue = this.deleteQueue.filter(operation => 
      new Date(operation.timestamp) > cutoff
    );

    const removed = initialLength - this.deleteQueue.length;
    if (removed > 0) {
      console.log(`🧹 Cleaned up ${removed} old delete operations`);
    }

    return removed;
  }
} 