import { GaplyDatabase } from '../index';
import { LocalUserProfile, SyncQueueItem } from '../schema';
import { generateUUID } from '../../uuid';

export class ProfileModel {
  constructor(private db: GaplyDatabase) {}

  // CRUD Operations
  async create(profile: Omit<LocalUserProfile, 'is_synced' | 'sync_version' | 'local_updated_at'>): Promise<LocalUserProfile> {
    const newProfile: LocalUserProfile = {
      ...profile,
      is_synced: false,
      sync_version: 1,
      local_updated_at: new Date().toISOString()
    };

    await this.db.profile.add(newProfile);
    
    // Add to sync queue
    await this.addToSyncQueue('profile', 'create', newProfile);
    
    return newProfile;
  }

  async getById(id: string): Promise<LocalUserProfile | undefined> {
    return await this.db.profile.get(id);
  }

  async getByUserId(userId: string): Promise<LocalUserProfile | undefined> {
    return await this.db.profile
      .where('user_id')
      .equals(userId)
      .filter(profile => !profile.deleted_at)
      .first();
  }

  async update(id: string, updates: Partial<LocalUserProfile>): Promise<LocalUserProfile | undefined> {
    const existingProfile = await this.db.profile.get(id);
    if (!existingProfile) return undefined;

    const updatedProfile: LocalUserProfile = {
      ...existingProfile,
      ...updates,
      local_updated_at: new Date().toISOString(),
      is_synced: false,
      sync_version: existingProfile.sync_version + 1
    };

    await this.db.profile.put(updatedProfile);
    
    // Add to sync queue
    await this.addToSyncQueue('profile', 'update', updatedProfile);
    
    return updatedProfile;
  }

  async delete(id: string): Promise<boolean> {
    const profile = await this.db.profile.get(id);
    if (!profile) return false;

    // Soft delete
    const deletedProfile: LocalUserProfile = {
      ...profile,
      deleted_at: new Date().toISOString(),
      local_updated_at: new Date().toISOString(),
      is_synced: false,
      sync_version: profile.sync_version + 1
    };

    await this.db.profile.put(deletedProfile);
    
    // Add to sync queue
    await this.addToSyncQueue('profile', 'delete', deletedProfile);
    
    return true;
  }

  // Sync Operations
  async getUnsynced(): Promise<LocalUserProfile[]> {
    return await this.db.profile
      .where('is_synced')
      .equals(false)
      .filter(profile => !profile.deleted_at)
      .toArray();
  }

  async markSynced(id: string, syncVersion: number): Promise<void> {
    await this.db.profile.update(id, {
      is_synced: true,
      sync_version: syncVersion
    });
  }

  private async addToSyncQueue(table: 'profile', operation: 'create' | 'update' | 'delete', data: any): Promise<void> {
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