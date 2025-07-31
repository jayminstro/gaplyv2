import { GaplyDatabase, getDatabase, closeDatabase } from './index';
import { TaskModel } from './models/TaskModel';
import { GapModel } from './models/GapModel';
import { PreferencesModel } from './models/PreferencesModel';
import { ProfileModel } from './models/ProfileModel';
import { LocalTask, LocalTimeGap, LocalUserPreferences } from './schema';

export class DatabaseManager {
  private db: GaplyDatabase;
  public tasks: TaskModel;
  public gaps: GapModel;
  public preferences: PreferencesModel;
  public profile: ProfileModel;

  constructor(userId: string) {
    this.db = getDatabase(userId);
    this.tasks = new TaskModel(this.db);
    this.gaps = new GapModel(this.db);
    this.preferences = new PreferencesModel(this.db);
    this.profile = new ProfileModel(this.db);
  }

  // Database lifecycle
  async initialize(): Promise<void> {
    await this.db.initialize();
  }

  async close(): Promise<void> {
    closeDatabase();
  }

  getDatabase(): GaplyDatabase {
    return this.db;
  }

  // Data migration from existing localStorage
  async migrateFromLocalStorage(): Promise<void> {
    try {
      // Migrate gaps from localStorage
      const today = new Date().toISOString().split('T')[0];
      const storedGaps = localStorage.getItem(`gaply_gaps_${today}`);
      
      if (storedGaps) {
        const gaps = JSON.parse(storedGaps);
        for (const gap of gaps) {
          await this.gaps.create({
            ...gap,
            is_synced: false,
            sync_version: 1,
            local_updated_at: new Date().toISOString()
          });
        }
        
        // Clear localStorage after migration
        localStorage.removeItem(`gaply_gaps_${today}`);
        console.log(`✅ Migrated ${gaps.length} gaps from localStorage`);
      }
    } catch (error) {
      console.error('❌ Error migrating from localStorage:', error);
    }
  }

  // Bulk operations
  async bulkCreateTasks(tasks: Omit<LocalTask, 'id' | 'is_synced' | 'sync_version' | 'local_updated_at'>[]): Promise<LocalTask[]> {
    const createdTasks: LocalTask[] = [];
    
    await this.db.transaction('rw', this.db.tasks, async () => {
      for (const task of tasks) {
        const createdTask = await this.tasks.create(task);
        createdTasks.push(createdTask);
      }
    });
    
    return createdTasks;
  }

  async bulkCreateGaps(gaps: Omit<LocalTimeGap, 'id' | 'is_synced' | 'sync_version' | 'local_updated_at'>[]): Promise<LocalTimeGap[]> {
    const createdGaps: LocalTimeGap[] = [];
    
    await this.db.transaction('rw', this.db.gaps, async () => {
      for (const gap of gaps) {
        const createdGap = await this.gaps.create(gap);
        createdGaps.push(createdGap);
      }
    });
    
    return createdGaps;
  }

  // Sync status
  async getSyncStatus(): Promise<{
    tasks: { total: number; synced: number; unsynced: number };
    gaps: { total: number; synced: number; unsynced: number };
    queue: { pending: number; failed: number };
  }> {
    const [taskCount, syncedTaskCount, gapCount, syncedGapCount, queueCount, failedQueueCount] = await Promise.all([
      this.db.tasks.count(),
      this.db.tasks.where('is_synced').equals(true).count(),
      this.db.gaps.count(),
      this.db.gaps.where('is_synced').equals(true).count(),
      this.db.sync_queue.count(),
      this.db.sync_queue.where('retry_count').above(3).count()
    ]);

    return {
      tasks: {
        total: taskCount,
        synced: syncedTaskCount,
        unsynced: taskCount - syncedTaskCount
      },
      gaps: {
        total: gapCount,
        synced: syncedGapCount,
        unsynced: gapCount - syncedGapCount
      },
      queue: {
        pending: queueCount,
        failed: failedQueueCount
      }
    };
  }

  // Maintenance
  async performMaintenance(): Promise<void> {
    await Promise.all([
      this.db.cleanupExpiredData(),
      this.gaps.deleteExpiredGaps()
    ]);
  }

  // Database info
  async getDatabaseInfo(): Promise<{
    size: number;
    tables: Record<string, number>;
    lastMaintenance: string;
  }> {
    const size = await this.db.getDatabaseSize();
    const tables = {
      tasks: await this.db.tasks.count(),
      gaps: await this.db.gaps.count(),
      preferences: await this.db.preferences.count(),
      profile: await this.db.profile.count(),
      scheduled_gaps: await this.db.scheduled_gaps.count(),
      activity_completions: await this.db.activity_completions.count(),
      sync_queue: await this.db.sync_queue.count()
    };

    return {
      size,
      tables,
      lastMaintenance: new Date().toISOString()
    };
  }
} 