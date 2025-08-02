import { Task, TimeGap, UserPreferences } from '../../types/index';

export interface StorageItem {
  id: string;
  data: any;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface StorageInfo {
  used: number;
  available: number;
  total: number;
  collections: Record<string, number>;
}

export class IndexedDBStorage {
  private db: IDBDatabase | null = null;
  private readonly dbName = 'GaplyStorage';
  private readonly version = 1;
  private readonly userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(new Error('Failed to initialize IndexedDB storage'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('✅ IndexedDB storage initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create collections for different data types
        if (!db.objectStoreNames.contains('tasks')) {
          const taskStore = db.createObjectStore('tasks', { keyPath: 'id' });
          taskStore.createIndex('userId', 'userId', { unique: false });
          taskStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        if (!db.objectStoreNames.contains('gaps')) {
          const gapStore = db.createObjectStore('gaps', { keyPath: 'id' });
          gapStore.createIndex('userId', 'userId', { unique: false });
          gapStore.createIndex('date', 'date', { unique: false });
          gapStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        if (!db.objectStoreNames.contains('preferences')) {
          const prefStore = db.createObjectStore('preferences', { keyPath: 'userId' });
          prefStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        if (!db.objectStoreNames.contains('calendar')) {
          const calendarStore = db.createObjectStore('calendar', { keyPath: 'key' });
          calendarStore.createIndex('userId', 'userId', { unique: false });
        }

        console.log('✅ IndexedDB schema created/updated');
      };
    });
  }

  // Task operations
  async saveTasks(tasks: Task[]): Promise<void> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    const transaction = this.db.transaction(['tasks'], 'readwrite');
    const store = transaction.objectStore('tasks');

    // Clear existing tasks for this user
    const index = store.index('userId');
    const existingKeys = await this.getKeysFromIndex(index, this.userId);
    
    for (const key of existingKeys) {
      store.delete(key);
    }

    // Save new tasks
    for (const task of tasks) {
      const item: StorageItem = {
        id: task.id,
        data: task,
        createdAt: task.created_at,
        updatedAt: task.updated_at,
        version: 1
      };
      store.add(item);
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async getTasks(): Promise<Task[]> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    const transaction = this.db.transaction(['tasks'], 'readonly');
    const store = transaction.objectStore('tasks');
    const index = store.index('userId');

    return new Promise((resolve, reject) => {
      const request = index.getAll(this.userId);
      request.onsuccess = () => {
        const items: StorageItem[] = request.result;
        const tasks = items.map(item => item.data as Task);
        resolve(tasks);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async updateTask(taskId: string, updates: Partial<Task>): Promise<Task | null> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    const transaction = this.db.transaction(['tasks'], 'readwrite');
    const store = transaction.objectStore('tasks');

    return new Promise((resolve, reject) => {
      const getRequest = store.get(taskId);
      getRequest.onsuccess = () => {
        const item: StorageItem = getRequest.result;
        if (!item) {
          resolve(null);
          return;
        }

        const updatedTask = { ...item.data, ...updates, updated_at: new Date().toISOString() };
        const updatedItem: StorageItem = {
          ...item,
          data: updatedTask,
          updatedAt: updatedTask.updated_at
        };

        const putRequest = store.put(updatedItem);
        putRequest.onsuccess = () => resolve(updatedTask);
        putRequest.onerror = () => reject(putRequest.error);
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async deleteTask(taskId: string): Promise<boolean> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    const transaction = this.db.transaction(['tasks'], 'readwrite');
    const store = transaction.objectStore('tasks');

    return new Promise((resolve, reject) => {
      const request = store.delete(taskId);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  // Gap operations
  async saveGaps(gaps: TimeGap[], date: string): Promise<void> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    const transaction = this.db.transaction(['gaps'], 'readwrite');
    const store = transaction.objectStore('gaps');

    // Clear existing gaps for this user and date
    const index = store.index('userId');
    const existingKeys = await this.getKeysFromIndex(index, this.userId);
    
    for (const key of existingKeys) {
      const item = await this.getItemFromStore(store, key);
      if (item && item.data.date === date) {
        store.delete(key);
      }
    }

    // Save new gaps
    for (const gap of gaps) {
      const item: StorageItem = {
        id: gap.id,
        data: gap,
        createdAt: gap.created_at,
        updatedAt: gap.updated_at || gap.created_at,
        version: 1
      };
      store.add(item);
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async getGaps(date: string): Promise<TimeGap[]> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    const transaction = this.db.transaction(['gaps'], 'readonly');
    const store = transaction.objectStore('gaps');
    const index = store.index('userId');

    return new Promise((resolve, reject) => {
      const request = index.getAll(this.userId);
      request.onsuccess = () => {
        const items: StorageItem[] = request.result;
        const gaps = items
          .map(item => item.data as TimeGap)
          .filter(gap => gap.date === date);
        resolve(gaps);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getAllGaps(): Promise<TimeGap[]> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    const transaction = this.db.transaction(['gaps'], 'readonly');
    const store = transaction.objectStore('gaps');
    const index = store.index('userId');

    return new Promise((resolve, reject) => {
      const request = index.getAll(this.userId);
      request.onsuccess = () => {
        const items: StorageItem[] = request.result;
        const gaps = items.map(item => item.data as TimeGap);
        resolve(gaps);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Preferences operations
  async savePreferences(preferences: UserPreferences): Promise<void> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    const transaction = this.db.transaction(['preferences'], 'readwrite');
    const store = transaction.objectStore('preferences');

    const item: StorageItem = {
      id: this.userId,
      data: preferences,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1
    };

    return new Promise((resolve, reject) => {
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getPreferences(): Promise<UserPreferences | null> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    const transaction = this.db.transaction(['preferences'], 'readonly');
    const store = transaction.objectStore('preferences');

    return new Promise((resolve, reject) => {
      const request = store.get(this.userId);
      request.onsuccess = () => {
        const item: StorageItem = request.result;
        resolve(item ? item.data as UserPreferences : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Calendar operations
  async saveCalendarState(key: string, value: any): Promise<void> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    const transaction = this.db.transaction(['calendar'], 'readwrite');
    const store = transaction.objectStore('calendar');

    const item: StorageItem = {
      id: key,
      data: { userId: this.userId, value },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1
    };

    return new Promise((resolve, reject) => {
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getCalendarState(key: string): Promise<any> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    const transaction = this.db.transaction(['calendar'], 'readonly');
    const store = transaction.objectStore('calendar');

    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => {
        const item: StorageItem = request.result;
        resolve(item ? item.data.value : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async removeCalendarState(key: string): Promise<void> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    const transaction = this.db.transaction(['calendar'], 'readwrite');
    const store = transaction.objectStore('calendar');

    return new Promise((resolve, reject) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Storage management
  async getStorageInfo(): Promise<StorageInfo> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    const collections: Record<string, number> = {};
    let totalUsed = 0;

    // Get counts for each collection
    for (const storeName of this.db.objectStoreNames) {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      
      const count = await new Promise<number>((resolve, reject) => {
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      
      collections[storeName] = count;
      totalUsed += count;
    }

    // Estimate storage size (rough calculation)
    const total = 50 * 1024 * 1024; // 50MB typical IndexedDB limit
    const available = Math.max(0, total - totalUsed);

    return {
      used: totalUsed,
      available,
      total,
      collections
    };
  }

  async cleanupOldData(daysToKeep: number = 7): Promise<number> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    let cleanedCount = 0;

    // Clean up old gaps
    const gapTransaction = this.db.transaction(['gaps'], 'readwrite');
    const gapStore = gapTransaction.objectStore('gaps');
    const gapIndex = gapStore.index('createdAt');

    const oldGaps = await new Promise<StorageItem[]>((resolve, reject) => {
      const request = gapIndex.getAll();
      request.onsuccess = () => {
        const items: StorageItem[] = request.result;
        const old = items.filter(item => new Date(item.createdAt) < cutoffDate);
        resolve(old);
      };
      request.onerror = () => reject(request.error);
    });

    for (const item of oldGaps) {
      gapStore.delete(item.id);
      cleanedCount++;
    }

    return cleanedCount;
  }

  async migrateFromLocalStorage(): Promise<void> {
    console.log('🔄 Starting migration from localStorage to IndexedDB...');
    
    try {
      // Migrate tasks
      const taskKey = `gaply_tasks_${this.userId}`;
      const storedTasks = localStorage.getItem(taskKey);
      if (storedTasks) {
        const tasks = JSON.parse(storedTasks);
        if (Array.isArray(tasks)) {
          await this.saveTasks(tasks);
          localStorage.removeItem(taskKey);
          console.log(`✅ Migrated ${tasks.length} tasks`);
        }
      }

      // Migrate preferences
      const prefKey = `gaply_preferences_${this.userId}`;
      const storedPrefs = localStorage.getItem(prefKey);
      if (storedPrefs) {
        const prefs = JSON.parse(storedPrefs);
        if (prefs && typeof prefs === 'object') {
          await this.savePreferences(prefs);
          localStorage.removeItem(prefKey);
          console.log('✅ Migrated preferences');
        }
      }

      // Migrate gaps (last 7 days)
      const today = new Date();
      for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const gapKey = `gaply_gaps_${dateStr}`;
        
        const storedGaps = localStorage.getItem(gapKey);
        if (storedGaps) {
          const gaps = JSON.parse(storedGaps);
          if (Array.isArray(gaps)) {
            await this.saveGaps(gaps, dateStr);
            localStorage.removeItem(gapKey);
            console.log(`✅ Migrated ${gaps.length} gaps for ${dateStr}`);
          }
        }
      }

      console.log('✅ Migration from localStorage completed');
    } catch (error) {
      console.error('❌ Error during migration:', error);
      throw error;
    }
  }

  // Utility methods
  private async getKeysFromIndex(index: IDBIndex, value: any): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const request = index.getAllKeys(value);
      request.onsuccess = () => resolve(request.result as string[]);
      request.onerror = () => reject(request.error);
    });
  }

  private async getItemFromStore(store: IDBObjectStore, key: string): Promise<StorageItem | null> {
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
} 