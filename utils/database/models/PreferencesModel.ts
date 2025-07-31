import { GaplyDatabase } from '../index';
import { LocalUserPreferences, SyncQueueItem } from '../schema';
import { generateUUID } from '../../uuid';

export class PreferencesModel {
  constructor(private db: GaplyDatabase) {}

  // CRUD Operations
  async create(preferences: Omit<LocalUserPreferences, 'is_synced' | 'sync_version' | 'local_updated_at'>): Promise<LocalUserPreferences> {
    const newPreferences: LocalUserPreferences = {
      ...preferences,
      user_id: preferences.user_id || 'current', // Add default user_id
      is_synced: false,
      sync_version: 1,
      local_updated_at: new Date().toISOString()
    };

    await this.db.preferences.add(newPreferences);
    
    // Add to sync queue
    await this.addToSyncQueue('preferences', 'create', newPreferences);
    
    return newPreferences;
  }

  async get(userId: string): Promise<LocalUserPreferences | undefined> {
    return await this.db.preferences.get(userId);
  }

  async update(userId: string, updates: Partial<LocalUserPreferences>): Promise<LocalUserPreferences | undefined> {
    const existingPreferences = await this.db.preferences.get(userId);
    if (!existingPreferences) return undefined;

    const updatedPreferences: LocalUserPreferences = {
      ...existingPreferences,
      ...updates,
      local_updated_at: new Date().toISOString(),
      is_synced: false,
      sync_version: existingPreferences.sync_version + 1
    };

    await this.db.preferences.put(updatedPreferences);
    
    // Add to sync queue
    await this.addToSyncQueue('preferences', 'update', updatedPreferences);
    
    return updatedPreferences;
  }

  async delete(userId: string): Promise<boolean> {
    const preferences = await this.db.preferences.get(userId);
    if (!preferences) return false;

    // Soft delete
    const deletedPreferences: LocalUserPreferences = {
      ...preferences,
      deleted_at: new Date().toISOString(),
      local_updated_at: new Date().toISOString(),
      is_synced: false,
      sync_version: preferences.sync_version + 1
    };

    await this.db.preferences.put(deletedPreferences);
    
    // Add to sync queue
    await this.addToSyncQueue('preferences', 'delete', deletedPreferences);
    
    return true;
  }

  // Sync Operations
  async getUnsynced(): Promise<LocalUserPreferences[]> {
    return await this.db.preferences
      .where('is_synced')
      .equals(0)
      .filter(prefs => !prefs.deleted_at)
      .toArray();
  }

  async markSynced(userId: string, syncVersion: number): Promise<void> {
    await this.db.preferences.update(userId, {
      is_synced: true,
      sync_version: syncVersion
    });
  }

  private async addToSyncQueue(table: 'preferences', operation: 'create' | 'update' | 'delete', data: any): Promise<void> {
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