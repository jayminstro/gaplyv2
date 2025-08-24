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
  private readonly version = 5;
  private readonly userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  async initialize(): Promise<void> {
    return new Promise<void>((resolve) => {
      try {
        const startTime = Date.now();
        console.log('🔍 IndexedDB initialization started...');
        
        // Test if IndexedDB is actually available
        if (!window.indexedDB) {
          console.warn('IndexedDB not available, falling back to localStorage');
          this.fallbackToLocalStorage();
          resolve();
          return;
        }

        console.log('🔍 Opening IndexedDB...');
        const request = indexedDB.open(this.dbName, this.version);

        request.onerror = () => {
          console.warn('Failed to open IndexedDB, falling back to localStorage:', request.error);
          this.fallbackToLocalStorage();
          resolve();
        };

        request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
          this.handleUpgradeNeeded(event);
        };

        request.onsuccess = () => {
          this.db = request.result;
          console.log(`🔍 IndexedDB opened successfully (${Date.now() - startTime}ms)`);
          
          // Test if the database is actually writable
          this.testDatabaseWritable().then(() => {
            console.log(`✅ IndexedDB storage initialized and writable (${Date.now() - startTime}ms)`);
            resolve();
          }).catch(() => {
            console.warn('IndexedDB not writable, falling back to localStorage');
            this.fallbackToLocalStorage();
            resolve();
          });
        };
      } catch (error) {
        console.warn('Error during initialization:', error);
        this.fallbackToLocalStorage();
        resolve();
      }
    });
  }

  private handleUpgradeNeeded(event: IDBVersionChangeEvent): void {
    const request = event.target as IDBOpenDBRequest;
    const db = request.result;
        
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

    // Create or update activities store
    if (!db.objectStoreNames.contains('activities')) {
      const activityStore = db.createObjectStore('activities', { keyPath: 'id' });
      activityStore.createIndex('userId', 'userId', { unique: false });
      activityStore.createIndex('category', 'category', { unique: false });
      activityStore.createIndex('createdAt', 'createdAt', { unique: false });
      activityStore.createIndex('updated_at', 'updated_at', { unique: false });
    } else {
      // Add updated_at index if it doesn't exist
      const request = event.target as IDBOpenDBRequest;
      const transaction = request.transaction;
      if (transaction) {
        const activityStore = transaction.objectStore('activities');
        if (activityStore && !activityStore.indexNames.contains('updated_at')) {
          activityStore.createIndex('updated_at', 'updated_at', { unique: false });
        }
      }
    }

    console.log('✅ IndexedDB schema created/updated');
  }

  async resetDatabase(): Promise<void> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    console.log('🔄 Resetting IndexedDB database...');

    const transaction = this.db.transaction(['tasks', 'gaps', 'preferences', 'calendar'], 'readwrite');
    
    return new Promise((resolve, reject) => {
      const stores = ['tasks', 'gaps', 'preferences', 'calendar'];
      let clearedCount = 0;
      
      for (const storeName of stores) {
        const store = transaction.objectStore(storeName);
        const clearRequest = store.clear();
        
        clearRequest.onsuccess = () => {
          clearedCount++;
          if (clearedCount === stores.length) {
            console.log('✅ Database reset completed');
            resolve();
          }
        };
        
        clearRequest.onerror = () => {
          console.error(`❌ Failed to clear ${storeName}:`, clearRequest.error);
          reject(clearRequest.error);
        };
      }
      
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // Task operations
  async saveTasks(tasks: Task[], replaceAll: boolean = false): Promise<void> {
    try {
      console.log(`💾 Attempting to save ${tasks.length} tasks...${replaceAll ? ' (replacing all)' : ''}`);

      if (!this.db) {
        // Use localStorage fallback
        console.log('Using localStorage fallback for saving tasks');
        if (replaceAll) {
          await this.fallbackSaveToLocalStorage('tasks', tasks);
        } else {
          // Merge with existing tasks
          const existingTasks = await this.fallbackGetFromLocalStorage('tasks') || [];
          const mergedTasks = tasks.reduce((acc, task) => {
            const index = acc.findIndex(t => t.id === task.id);
            if (index >= 0) {
              acc[index] = task;
            } else {
              acc.push(task);
            }
            return acc;
          }, [...existingTasks]);
          await this.fallbackSaveToLocalStorage('tasks', mergedTasks);
        }
        return;
      }

      const transaction = this.db.transaction(['tasks'], 'readwrite');
      const store = transaction.objectStore('tasks');

      return new Promise((resolve, reject) => {
        const saveOperation = async () => {
          try {
            if (replaceAll) {
              await new Promise<void>((clearResolve, clearReject) => {
                const clearRequest = store.clear();
                clearRequest.onsuccess = () => {
                  console.log(`🗑️ Cleared all existing tasks, adding ${tasks.length} new tasks...`);
                  clearResolve();
                };
                clearRequest.onerror = () => {
                  console.warn('Failed to clear IndexedDB, falling back to localStorage');
                  this.fallbackSaveToLocalStorage('tasks', tasks)
                    .then(clearResolve)
                    .catch(clearReject);
                };
              });
            }

            // Add or update tasks
            await this.addOrUpdateTasks(store, tasks, resolve, reject);
          } catch (error) {
            console.warn('Error in IndexedDB operation, falling back to localStorage');
            this.fallbackSaveToLocalStorage('tasks', tasks)
              .then(resolve)
              .catch(reject);
          }
        };

        saveOperation().catch(() => {
          console.warn('Error in save operation, falling back to localStorage');
          this.fallbackSaveToLocalStorage('tasks', tasks)
            .then(resolve)
            .catch(reject);
        });
        
        transaction.onerror = () => {
          console.warn('Transaction error, falling back to localStorage');
          this.fallbackSaveToLocalStorage('tasks', tasks)
            .then(resolve)
            .catch(reject);
        };
      });
    } catch (error) {
      console.error('Critical error saving tasks:', error);
      // Try one last time with localStorage
      await this.fallbackSaveToLocalStorage('tasks', tasks);
    }
  }

  async saveTask(task: Task): Promise<void> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    console.log(`💾 Saving single task to IndexedDB: ${task.id}`);

    const transaction = this.db.transaction(['tasks'], 'readwrite');
    const store = transaction.objectStore('tasks');

    return new Promise((resolve, reject) => {
      const item = {
        ...task,
        id: task.id,
        userId: this.userId,
        createdAt: task.created_at || new Date().toISOString(),
        updatedAt: task.updated_at || new Date().toISOString(), // Keep the original updated_at
        version: 1,
        // Store the original timestamps for sync
        created_at: task.created_at || new Date().toISOString(),
        updated_at: task.updated_at || new Date().toISOString()
      };

      const request = store.put(item); // Use put instead of add to allow updates
      request.onsuccess = () => {
        console.log(`✅ Successfully saved task ${task.id} to IndexedDB`);
        resolve();
      };
      request.onerror = () => {
        console.error(`❌ Failed to save task ${task.id}:`, request.error);
        reject(request.error);
      };

      transaction.onerror = () => reject(transaction.error);
    });
  }

  private async addOrUpdateTasks(
    store: IDBObjectStore, 
    tasks: Task[], 
    resolve: () => void, 
    reject: (error: any) => void
  ): Promise<void> {
    let addedCount = 0;
    
    for (const task of tasks) {
      const item = {
        ...task,
        id: task.id,
        userId: this.userId,
        createdAt: task.created_at || new Date().toISOString(),
        updatedAt: task.updated_at || new Date().toISOString(), // Keep the original updated_at
        version: 1,
        // Store the original timestamps for sync
        created_at: task.created_at || new Date().toISOString(),
        updated_at: task.updated_at || new Date().toISOString()
      };
      
      const request = store.put(item); // Use put instead of add to allow updates
      request.onsuccess = () => {
        addedCount++;
        if (addedCount === tasks.length) {
          console.log(`✅ Successfully saved ${addedCount} tasks to IndexedDB`);
          resolve();
        }
      };
      request.onerror = () => {
        console.error(`❌ Failed to save task ${task.id}:`, request.error);
        reject(request.error);
      };
    }
  }

  async getTasks(): Promise<Task[]> {
    try {
      if (!this.db) {
        // Use localStorage fallback
        const tasks = await this.fallbackGetFromLocalStorage('tasks') || [];
        return Array.isArray(tasks) ? tasks : [];
      }

      const transaction = this.db.transaction(['tasks'], 'readonly');
      const store = transaction.objectStore('tasks');
      const index = store.index('userId');

      return new Promise((resolve, reject) => {
        const request = index.getAll(this.userId);
        request.onsuccess = () => {
          const items = request.result;
          const tasks = items.map(item => {
            // Remove internal fields but keep original timestamps
            const { userId, createdAt, updatedAt, version, created_at, updated_at, ...task } = item;
            return {
              ...task,
              created_at: created_at || createdAt,
              updated_at: updated_at || updatedAt
            } as Task;
          });
          resolve(tasks);
        };
        request.onerror = () => {
          console.warn('Failed to get tasks from IndexedDB, falling back to localStorage');
          this.fallbackGetFromLocalStorage('tasks')
            .then(tasks => resolve(Array.isArray(tasks) ? tasks : []))
            .catch(reject);
        };
      });
    } catch (error) {
      console.error('Error getting tasks:', error);
      // Return empty array as fallback
      return [];
    }
  }

  async updateTask(taskId: string, updates: Partial<Task>): Promise<Task | null> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    const transaction = this.db.transaction(['tasks'], 'readwrite');
    const store = transaction.objectStore('tasks');

    return new Promise((resolve, reject) => {
      const getRequest = store.get(taskId);
      getRequest.onsuccess = () => {
        const item = getRequest.result;
        if (!item) {
          resolve(null);
          return;
        }

        const { userId, createdAt, updatedAt, version, ...task } = item;
        const updatedTask = {
          ...task,
          ...updates,
          userId: this.userId,
          updated_at: new Date().toISOString(),
          version: version + 1
        };

        const putRequest = store.put(updatedTask);
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

    console.log(`💾 Saving ${gaps.length} gaps for date ${date} to IndexedDB...`);

    const transaction = this.db.transaction(['gaps'], 'readwrite');
    const store = transaction.objectStore('gaps');

    return new Promise((resolve, reject) => {
      // First, clear existing gaps for this specific date and user only
      const userIdIndex = store.index('userId');
      const userGapsRequest = userIdIndex.getAll(this.userId);
      
      userGapsRequest.onsuccess = () => {
        const existingGaps = userGapsRequest.result;
        const gapsToDelete = existingGaps.filter(item => {
          const gap = item.data as TimeGap;
          return gap.date === date;
        });
        
        if (gapsToDelete.length === 0) {
          // No existing gaps to delete, just add new ones
          console.log(`📝 No existing gaps found for date ${date}, adding ${gaps.length} new gaps...`);
          this.addNewGaps(store, gaps, date, resolve, reject);
          return;
        }
        
        console.log(`🗑️ Found ${gapsToDelete.length} existing gaps for date ${date}, deleting them...`);
        
        let deletedCount = 0;
        for (const gapItem of gapsToDelete) {
          const deleteRequest = store.delete(gapItem.id);
          deleteRequest.onsuccess = () => {
            deletedCount++;
            if (deletedCount === gapsToDelete.length) {
              console.log(`🗑️ Deleted ${deletedCount} existing gaps for date ${date}, adding ${gaps.length} new gaps...`);
              this.addNewGaps(store, gaps, date, resolve, reject);
            }
          };
          deleteRequest.onerror = () => {
            console.error('❌ Failed to delete existing gap:', deleteRequest.error);
            reject(deleteRequest.error);
          };
        }
      };
      
      userGapsRequest.onerror = () => {
        console.error('❌ Failed to get existing gaps:', userGapsRequest.error);
        reject(userGapsRequest.error);
      };
      
      transaction.onerror = () => reject(transaction.error);
    });
  }

  private addNewGaps(
    store: IDBObjectStore,
    gaps: TimeGap[],
    date: string,
    resolve: () => void,
    reject: (error: any) => void
  ): void {
    if (gaps.length === 0) {
      console.log(`✅ No gaps to add for date ${date}`);
      resolve();
      return;
    }
    
    let addedCount = 0;
    for (const gap of gaps) {
      const item: StorageItem = {
        id: gap.id,
        data: { ...gap, userId: this.userId }, // Include userId in the data
        createdAt: gap.created_at || new Date().toISOString(),
        updatedAt: gap.updated_at || gap.created_at || new Date().toISOString(),
        version: 1
      };
      
      const addRequest = store.add(item);
      addRequest.onsuccess = () => {
        addedCount++;
        if (addedCount === gaps.length) {
          console.log(`✅ Successfully saved ${addedCount} gaps for date ${date} to IndexedDB`);
          resolve();
        }
      };
      addRequest.onerror = () => {
        const error = addRequest.error;
        if (error && error.name === 'ConstraintError') {
          // Gap already exists, this is likely a race condition
          console.warn(`⚠️ Gap ${gap.id} already exists (race condition), skipping...`);
          addedCount++;
          if (addedCount === gaps.length) {
            console.log(`✅ Successfully processed ${addedCount} gaps for date ${date} to IndexedDB (with duplicates skipped)`);
            resolve();
          }
        } else {
          console.error(`❌ Failed to add gap ${gap.id}:`, error);
          reject(error);
        }
      };
    }
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
          .map(item => {
            const gap = item.data as TimeGap & { userId?: string };
            // Remove userId from the returned gap object
            const { userId, ...cleanGap } = gap;
            return cleanGap as TimeGap;
          })
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
        const gaps = items.map(item => {
          const gap = item.data as TimeGap & { userId?: string };
          // Remove userId from the returned gap object
          const { userId, ...cleanGap } = gap;
          return cleanGap as TimeGap;
        });
        resolve(gaps);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Preferences operations
  async savePreferences(preferences: UserPreferences): Promise<void> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    console.log(`💾 Saving preferences to IndexedDB...`);

    const transaction = this.db.transaction(['preferences'], 'readwrite');
    const store = transaction.objectStore('preferences');

    // For preferences, store the data directly since the keyPath is 'userId'
    const preferencesData = {
      ...preferences,
      userId: this.userId,
      createdAt: preferences.created_at || new Date().toISOString(),
      updatedAt: preferences.updated_at || new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
      const request = store.put(preferencesData);
      request.onsuccess = () => {
        console.log('✅ Successfully saved preferences to IndexedDB');
        resolve();
      };
      request.onerror = () => {
        console.error('❌ Failed to save preferences:', request.error);
        reject(request.error);
      };
    });
  }

  async getPreferences(): Promise<UserPreferences | null> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    const transaction = this.db.transaction(['preferences'], 'readonly');
    const store = transaction.objectStore('preferences');

    return new Promise((resolve, reject) => {
      const request = store.get(this.userId);
      request.onsuccess = () => {
        const preferences = request.result;
        if (!preferences) {
          resolve(null);
          return;
        }
        
        // Remove internal fields from the returned preferences object
        const { userId, createdAt, updatedAt, ...cleanPreferences } = preferences;
        resolve(cleanPreferences as UserPreferences);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Calendar operations
  async saveCalendarState(key: string, value: any): Promise<void> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    const transaction = this.db.transaction(['calendar'], 'readwrite');
    const store = transaction.objectStore('calendar');

    // For calendar state, store the data directly since the keyPath is 'key'
    const calendarData = {
      key: key,
      value: value,
      userId: this.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
      const request = store.put(calendarData);
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
        const calendarData = request.result;
        if (!calendarData) {
          resolve(null);
          return;
        }
        resolve(calendarData.value);
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


  private async testDatabaseWritable(): Promise<boolean> {
    if (!this.db) return false;

    try {
      const transaction = this.db.transaction(['tasks'], 'readwrite');
      const store = transaction.objectStore('tasks');
      
      // Try to add a test item
      const testItem = {
        id: '_test_' + Date.now(),
        userId: this.userId,
        title: 'Test Task',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1
      };

      await new Promise<void>((resolve, reject) => {
        const request = store.add(testItem);
        request.onsuccess = () => {
          // Clean up the test item
          store.delete(testItem.id);
          resolve();
        };
        request.onerror = () => reject(request.error);
      });

      return true;
    } catch (error) {
      console.error('Database write test failed:', error);
      return false;
    }
  }

  private fallbackToLocalStorage(): void {
    // Create a proxy that redirects all operations to localStorage
    this.db = null;
    console.log('🔄 Switching to localStorage fallback');
  }

  private getLocalStorageKey(type: string, id?: string): string {
    const base = `gaply_${type}_${this.userId}`;
    return id ? `${base}_${id}` : base;
  }

  private async fallbackSaveToLocalStorage(type: string, data: any, id?: string): Promise<void> {
    try {
      const key = this.getLocalStorageKey(type, id);
      localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      console.error(`Failed to save to localStorage (${type}):`, error);
      throw error;
    }
  }

  private async fallbackGetFromLocalStorage(type: string, id?: string): Promise<any> {
    try {
      const key = this.getLocalStorageKey(type, id);
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error(`Failed to get from localStorage (${type}):`, error);
      return null;
    }
  }

  async saveActivities(activities: any[]): Promise<void> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    return new Promise<void>((resolve, reject) => {
      try {
        const transaction = this.db!.transaction(['activities'], 'readwrite');
        const store = transaction.objectStore('activities');

        // Get existing activities first
        const getAllRequest = store.getAll();

        getAllRequest.onsuccess = async () => {
          const existingActivities = getAllRequest.result || [];
          const existingMap = new Map(existingActivities.map(a => [a.id, a]));

          // Process each activity
          for (const activity of activities) {
            const existing = existingMap.get(activity.id);
            
            if (!existing) {
              // New activity - add it
              store.add({
                ...activity,
                userId: this.userId,
                createdAt: activity.createdAt || new Date().toISOString(),
                updated_at: activity.updated_at || new Date().toISOString()
              });
            } else {
              // Compare updated_at timestamps
              const serverTimestamp = new Date(activity.updated_at || '').getTime();
              const localTimestamp = new Date(existing.updated_at || '').getTime();

              if (serverTimestamp > localTimestamp) {
                // Server version is newer - update local copy
                store.put({
                  ...activity,
                  userId: this.userId,
                  createdAt: existing.createdAt,
                  updated_at: activity.updated_at
                });
              }
            }
          }

          // Delete activities that no longer exist on server
          const serverIds = new Set(activities.map(a => a.id));
          for (const existingActivity of existingActivities) {
            if (!serverIds.has(existingActivity.id)) {
              store.delete(existingActivity.id);
            }
          }

          transaction.oncomplete = () => {
            console.log(`✅ Successfully synced ${activities.length} activities`);
            resolve();
          };
        };

        getAllRequest.onerror = () => {
          console.error('❌ Error getting existing activities:', getAllRequest.error);
          reject(getAllRequest.error);
        };

        transaction.onerror = () => {
          console.error('❌ Error saving activities:', transaction.error);
          reject(transaction.error);
        };
      } catch (error) {
        console.error('❌ Error in saveActivities:', error);
        reject(error);
      }
    });
  }

  async getActivities(): Promise<any[]> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    return new Promise<any[]>((resolve, reject) => {
      try {
        const transaction = this.db!.transaction(['activities'], 'readonly');
        const store = transaction.objectStore('activities');
        const userIndex = store.index('userId');
        const request = userIndex.getAll(this.userId);

        request.onsuccess = () => {
          const activities = request.result || [];
          // Sort by updated_at to ensure consistent order
          activities.sort((a, b) => {
            const aTime = new Date(a.updated_at || '').getTime();
            const bTime = new Date(b.updated_at || '').getTime();
            return bTime - aTime; // Most recent first
          });
          console.log(`📱 Retrieved ${activities.length} activities from IndexedDB`);
          resolve(activities);
        };

        request.onerror = () => {
          console.error('❌ Error getting activities:', request.error);
          reject(request.error);
        };
      } catch (error) {
        console.error('❌ Error in getActivities:', error);
        reject(error);
      }
    });
  }

  async updateActivity(activityId: string, updates: any): Promise<any | null> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    return new Promise<any | null>((resolve, reject) => {
      try {
        const transaction = this.db!.transaction(['activities'], 'readwrite');
        const store = transaction.objectStore('activities');
        const request = store.get(activityId);

        request.onsuccess = () => {
          const activity = request.result;
          if (!activity) {
            resolve(null);
            return;
          }

          const updatedActivity = {
            ...activity,
            ...updates,
            updatedAt: new Date().toISOString()
          };

          const updateRequest = store.put(updatedActivity);
          updateRequest.onsuccess = () => {
            resolve(updatedActivity);
          };
          updateRequest.onerror = () => {
            reject(updateRequest.error);
          };
        };

        request.onerror = () => {
          console.error('❌ Error updating activity:', request.error);
          reject(request.error);
        };
      } catch (error) {
        console.error('❌ Error in updateActivity:', error);
        reject(error);
      }
    });
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
} 