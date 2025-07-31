import { DATABASE_CONFIG } from './schema';

export interface Migration {
  version: number;
  name: string;
  up: (db: IDBDatabase) => Promise<void>;
  down?: (db: IDBDatabase) => Promise<void>;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'Initial schema',
    up: async (db: IDBDatabase) => {
      // Create tasks table
      const tasksStore = db.createObjectStore('tasks', { keyPath: 'id' });
      tasksStore.createIndex('user_id', 'user_id', { unique: false });
      tasksStore.createIndex('dueDate', 'dueDate', { unique: false });
      tasksStore.createIndex('status', 'status', { unique: false });
      tasksStore.createIndex('is_synced', 'is_synced', { unique: false });
      tasksStore.createIndex('deleted_at', 'deleted_at', { unique: false });

      // Create gaps table
      const gapsStore = db.createObjectStore('gaps', { keyPath: 'id' });
      gapsStore.createIndex('user_id', 'user_id', { unique: false });
      gapsStore.createIndex('date', 'date', { unique: false });
      gapsStore.createIndex('gap_source_id', 'gap_source_id', { unique: false });
      gapsStore.createIndex('is_synced', 'is_synced', { unique: false });
      gapsStore.createIndex('deleted_at', 'deleted_at', { unique: false });

      // Create preferences table
      const preferencesStore = db.createObjectStore('preferences', { keyPath: 'user_id' });
      preferencesStore.createIndex('is_synced', 'is_synced', { unique: false });

      // Create profile table
      const profileStore = db.createObjectStore('profile', { keyPath: 'id' });
      profileStore.createIndex('user_id', 'user_id', { unique: false });
      profileStore.createIndex('is_synced', 'is_synced', { unique: false });

      // Create scheduled_gaps table
      const scheduledGapsStore = db.createObjectStore('scheduled_gaps', { keyPath: 'id' });
      scheduledGapsStore.createIndex('user_id', 'user_id', { unique: false });
      scheduledGapsStore.createIndex('gap_id', 'gap_id', { unique: false });
      scheduledGapsStore.createIndex('task_id', 'task_id', { unique: false });
      scheduledGapsStore.createIndex('is_synced', 'is_synced', { unique: false });
      scheduledGapsStore.createIndex('deleted_at', 'deleted_at', { unique: false });

      // Create activity_completions table
      const activityCompletionsStore = db.createObjectStore('activity_completions', { keyPath: 'id' });
      activityCompletionsStore.createIndex('user_id', 'user_id', { unique: false });
      activityCompletionsStore.createIndex('completed_at', 'completed_at', { unique: false });
      activityCompletionsStore.createIndex('is_synced', 'is_synced', { unique: false });
      activityCompletionsStore.createIndex('deleted_at', 'deleted_at', { unique: false });

      // Create sync_queue table
      const syncQueueStore = db.createObjectStore('sync_queue', { keyPath: 'id' });
      syncQueueStore.createIndex('table', 'table', { unique: false });
      syncQueueStore.createIndex('operation', 'operation', { unique: false });
      syncQueueStore.createIndex('created_at', 'created_at', { unique: false });
      syncQueueStore.createIndex('retry_count', 'retry_count', { unique: false });

      // Create schema table
      const schemaStore = db.createObjectStore('schema', { keyPath: 'user_id' });
    }
  }
];

export async function runMigrations(db: IDBDatabase, currentVersion: number): Promise<void> {
  const pendingMigrations = MIGRATIONS.filter(migration => migration.version > currentVersion);
  
  for (const migration of pendingMigrations) {
    console.log(`Running migration ${migration.version}: ${migration.name}`);
    await migration.up(db);
  }
} 