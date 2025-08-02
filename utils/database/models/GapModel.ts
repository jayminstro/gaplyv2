import { GaplyDatabase } from '../index';
import { LocalTimeGap, SyncQueueItem } from '../schema';
import { generateUUID } from '../../uuid';

export class GapModel {
  constructor(private db: GaplyDatabase) {}

  // CRUD Operations
  async create(gap: Omit<LocalTimeGap, 'id' | 'is_synced' | 'sync_version' | 'local_updated_at'>): Promise<LocalTimeGap> {
    const newGap: LocalTimeGap = {
      ...gap,
      id: gap.id || generateUUID(),
      is_synced: false,
      sync_version: 1,
      local_updated_at: new Date().toISOString()
    };

    await this.db.gaps.add(newGap);
    
    // Add to sync queue
    await this.addToSyncQueue('gaps', 'create', newGap);
    
    return newGap;
  }

  async getById(id: string): Promise<LocalTimeGap | undefined> {
    return await this.db.gaps.get(id);
  }

  async getByUserId(userId: string): Promise<LocalTimeGap[]> {
    return await this.db.gaps
      .where('user_id')
      .equals(userId)
      .filter(gap => !gap.deleted_at)
      .toArray();
  }

  async getAll(): Promise<LocalTimeGap[]> {
    return await this.db.gaps
      .filter(gap => !gap.deleted_at)
      .toArray();
  }

  async getByDate(userId: string, date: string): Promise<LocalTimeGap[]> {
    return await this.db.gaps
      .where(['user_id', 'date'])
      .equals([userId, date])
      .filter(gap => !gap.deleted_at)
      .toArray();
  }

  async getByDateRange(userId: string, startDate: string, endDate: string): Promise<LocalTimeGap[]> {
    return await this.db.gaps
      .where('user_id')
      .equals(userId)
      .filter(gap => {
        if (gap.deleted_at) return false;
        if (!gap.date) return false;
        return gap.date >= startDate && gap.date <= endDate;
      })
      .toArray();
  }

  async update(id: string, updates: Partial<LocalTimeGap>): Promise<LocalTimeGap | undefined> {
    const existingGap = await this.db.gaps.get(id);
    if (!existingGap) return undefined;

    const updatedGap: LocalTimeGap = {
      ...existingGap,
      ...updates,
      local_updated_at: new Date().toISOString(),
      is_synced: false,
      sync_version: existingGap.sync_version + 1
    };

    await this.db.gaps.put(updatedGap);
    
    // Add to sync queue
    await this.addToSyncQueue('gaps', 'update', updatedGap);
    
    return updatedGap;
  }

  async delete(id: string): Promise<boolean> {
    const gap = await this.db.gaps.get(id);
    if (!gap) return false;

    // Soft delete
    const deletedGap: LocalTimeGap = {
      ...gap,
      deleted_at: new Date().toISOString(),
      local_updated_at: new Date().toISOString(),
      is_synced: false,
      sync_version: gap.sync_version + 1
    };

    await this.db.gaps.put(deletedGap);
    
    // Add to sync queue
    await this.addToSyncQueue('gaps', 'delete', deletedGap);
    
    return true;
  }

  async hardDelete(id: string): Promise<boolean> {
    const deleted = await this.db.gaps.delete(id);
    return deleted > 0;
  }

  // Sync Operations
  async getUnsynced(): Promise<LocalTimeGap[]> {
    return await this.db.gaps
      .where('is_synced')
      .equals(false)
      .filter(gap => !gap.deleted_at)
      .toArray();
  }

  async markSynced(id: string, syncVersion: number): Promise<void> {
    await this.db.gaps.update(id, {
      is_synced: true,
      sync_version: syncVersion
    });
  }

  async markDeletedSynced(id: string): Promise<void> {
    const gap = await this.db.gaps.get(id);
    if (gap && gap.deleted_at) {
      await this.db.gaps.delete(id);
    }
  }

  // Utility Methods
  async getGapsForToday(userId: string): Promise<LocalTimeGap[]> {
    const today = new Date().toISOString().split('T')[0];
    return await this.getByDateRange(userId, today, today);
  }

  async getOverdueGaps(userId: string): Promise<LocalTimeGap[]> {
    const today = new Date().toISOString().split('T')[0];
    return await this.db.gaps
      .where('user_id')
      .equals(userId)
      .filter(gap => {
        if (gap.deleted_at) return false;
        if (!gap.date) return false;
        return gap.date < today && gap.gap_source_id !== 'activity'; // Assuming 'activity' is a gap source that doesn't have a due date
      })
      .toArray();
  }

  private async addToSyncQueue(table: 'gaps', operation: 'create' | 'update' | 'delete', data: any): Promise<void> {
    const queueItem: SyncQueueItem = {
      id: generateUUID(),
      table,
      operation,
      data,
      created_at: new Date().toISOString(),
      retry_count: 0
    };

    await this.db.sync_queue.add(queueItem);
  }
} 