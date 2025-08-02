import Dexie, { Table } from 'dexie';
import { 
  LocalTask, 
  LocalTimeGap, 
  LocalUserPreferences, 
  LocalUserProfile, 
  LocalScheduledGap, 
  LocalActivityCompletion,
  SyncQueueItem,
  DatabaseSchema,
  DATABASE_CONFIG,
  DATABASE_INDEXES
} from './schema';
import { MIGRATIONS, runMigrations } from './migrations';

export class GaplyDatabase extends Dexie {
  // Tables
  tasks!: Table<LocalTask>;
  gaps!: Table<LocalTimeGap>;
  preferences!: Table<LocalUserPreferences>;
  profile!: Table<LocalUserProfile>;
  scheduled_gaps!: Table<LocalScheduledGap>;
  activity_completions!: Table<LocalActivityCompletion>;
  sync_queue!: Table<SyncQueueItem>;
  schema!: Table<DatabaseSchema>;

  constructor(userId: string) {
    super(`${DATABASE_CONFIG.name}_${userId}`);
    
    this.version(DATABASE_CONFIG.version).stores({
      tasks: DATABASE_INDEXES.tasks.join(','),
      gaps: DATABASE_INDEXES.gaps.join(','),
      preferences: DATABASE_INDEXES.preferences.join(','),
      profile: DATABASE_INDEXES.profile.join(','),
      scheduled_gaps: DATABASE_INDEXES.scheduled_gaps.join(','),
      activity_completions: DATABASE_INDEXES.activity_completions.join(','),
      sync_queue: DATABASE_INDEXES.sync_queue.join(','),
      schema: DATABASE_INDEXES.schema.join(',')
    });

    // Set up hooks for automatic sync flag management
    this.setupHooks();
  }

  private setupHooks(): void {
    // Auto-update local_updated_at and sync flags on changes
    this.tables.forEach(table => {
      table.hook('creating', (primKey, obj) => {
        obj.local_updated_at = new Date().toISOString();
        obj.is_synced = false;
        obj.sync_version = 1;
        return obj;
      });

      table.hook('updating', (modifications, primKey, obj) => {
        modifications.local_updated_at = new Date().toISOString();
        modifications.is_synced = false;
        modifications.sync_version = (obj.sync_version || 0) + 1;
        return modifications;
      });
    });
  }

  // Database initialization
  async initialize(): Promise<void> {
    try {
      // Check if schema exists
      const schemaRecord = await this.schema.get('schema');
      
      if (!schemaRecord) {
        // Initialize schema record
        await this.schema.put({
          version: DATABASE_CONFIG.version,
          last_migration: new Date().toISOString(),
          user_id: 'schema',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
      
      console.log('✅ Local database initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize local database:', error);
      throw error;
    }
  }

  // Utility methods
  async clearAllData(): Promise<void> {
    await this.transaction('rw', this.tables, async () => {
      await Promise.all(this.tables.map(table => table.clear()));
    });
  }

  async getDatabaseSize(): Promise<number> {
    // Estimate database size (rough calculation)
    let totalSize = 0;
    
    for (const table of this.tables) {
      const count = await table.count();
      totalSize += count * 1024; // Rough estimate: 1KB per record
    }
    
    return totalSize;
  }

  // Cleanup expired data
  async cleanupExpiredData(): Promise<void> {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const threeDaysAgoISO = threeDaysAgo.toISOString();

    // Delete gaps older than 3 days
    await this.gaps
      .where('date')
      .below(threeDaysAgoISO.split('T')[0])
      .delete();

    // Delete completed sync queue items older than 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoISO = sevenDaysAgo.toISOString();

    await this.sync_queue
      .where('created_at')
      .below(sevenDaysAgoISO)
      .filter(item => item.retry_count === 0) // Only delete successful syncs
      .delete();

    console.log('�� Cleaned up expired data');
  }
}

// Database instance management
let databaseInstance: GaplyDatabase | null = null;

export function getDatabase(userId: string): GaplyDatabase {
  if (!databaseInstance || databaseInstance.name !== `${DATABASE_CONFIG.name}_${userId}`) {
    databaseInstance = new GaplyDatabase(userId);
  }
  return databaseInstance;
}

export function closeDatabase(): void {
  if (databaseInstance) {
    databaseInstance.close();
    databaseInstance = null;
  }
} 