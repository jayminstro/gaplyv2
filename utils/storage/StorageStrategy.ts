import { Task, TimeGap, UserPreferences } from '../../types/index';
import { IndexedDBStorage, StorageInfo } from './IndexedDBStorage';

export interface IStorageStrategy {
  initialize(): Promise<void>;
  saveTasks(tasks: Task[], replaceAll?: boolean): Promise<void>;
  saveTask(task: Task): Promise<void>;
  getTasks(): Promise<Task[]>;
  updateTask(taskId: string, updates: Partial<Task>): Promise<Task | null>;
  deleteTask(taskId: string): Promise<boolean>;
  saveGaps(gaps: TimeGap[], date: string): Promise<void>;
  getGaps(date: string): Promise<TimeGap[]>;
  getAllGaps(): Promise<TimeGap[]>;
  savePreferences(preferences: UserPreferences): Promise<void>;
  getPreferences(): Promise<UserPreferences | null>;
  saveCalendarState(key: string, value: any): Promise<void>;
  getCalendarState(key: string): Promise<any>;
  removeCalendarState(key: string): Promise<void>;
  getStorageInfo(): Promise<StorageInfo>;
  cleanupOldData(daysToKeep?: number): Promise<number>;
  resetDatabase(): Promise<void>;
  close(): Promise<void>;
  
  // Activity storage methods
  saveActivities(activities: any[]): Promise<void>;
  getActivities(): Promise<any[]>;
  updateActivity(activityId: string, updates: any): Promise<any | null>;
}

export class MemoryStorageStrategy implements IStorageStrategy {
  private tasks: Task[] = [];
  private gaps: Map<string, TimeGap[]> = new Map();
  private preferences: UserPreferences | null = null;
  private calendarState: Map<string, any> = new Map();
  private activities: any[] = [];
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  async initialize(): Promise<void> {
    console.log('✅ Memory storage initialized');
  }

  async saveTasks(tasks: Task[], replaceAll: boolean = false): Promise<void> {
    if (replaceAll) {
      this.tasks = [...tasks];
    } else {
      // Update existing tasks and add new ones
      const taskMap = new Map(this.tasks.map(task => [task.id, task]));
      tasks.forEach(task => taskMap.set(task.id, task));
      this.tasks = Array.from(taskMap.values());
    }
  }

  async saveTask(task: Task): Promise<void> {
    const index = this.tasks.findIndex(t => t.id === task.id);
    if (index !== -1) {
      this.tasks[index] = task;
    } else {
      this.tasks.push(task);
    }
  }

  async getTasks(): Promise<Task[]> {
    return [...this.tasks];
  }

  async updateTask(taskId: string, updates: Partial<Task>): Promise<Task | null> {
    const index = this.tasks.findIndex(t => t.id === taskId);
    if (index === -1) return null;

    this.tasks[index] = { ...this.tasks[index], ...updates, updated_at: new Date().toISOString() };
    return this.tasks[index];
  }

  async deleteTask(taskId: string): Promise<boolean> {
    const index = this.tasks.findIndex(t => t.id === taskId);
    if (index === -1) return false;

    this.tasks.splice(index, 1);
    return true;
  }

  async saveGaps(gaps: TimeGap[], date: string): Promise<void> {
    this.gaps.set(date, [...gaps]);
  }

  async getGaps(date: string): Promise<TimeGap[]> {
    return this.gaps.get(date) || [];
  }

  async getAllGaps(): Promise<TimeGap[]> {
    return Array.from(this.gaps.values()).flat();
  }

  async savePreferences(preferences: UserPreferences): Promise<void> {
    this.preferences = { ...preferences };
  }

  async getPreferences(): Promise<UserPreferences | null> {
    return this.preferences ? { ...this.preferences } : null;
  }

  async saveCalendarState(key: string, value: any): Promise<void> {
    this.calendarState.set(key, value);
  }

  async getCalendarState(key: string): Promise<any> {
    return this.calendarState.get(key) || null;
  }

  async removeCalendarState(key: string): Promise<void> {
    this.calendarState.delete(key);
  }

  async getStorageInfo(): Promise<StorageInfo> {
    const collections = {
      tasks: this.tasks.length,
      gaps: (await this.getAllGaps()).length,
      preferences: this.preferences ? 1 : 0,
      calendar: this.calendarState.size
    };

    const used = Object.values(collections).reduce((sum, count) => sum + count, 0);

    return {
      used,
      available: Number.MAX_SAFE_INTEGER, // Memory storage has no practical limit
      total: Number.MAX_SAFE_INTEGER,
      collections
    };
  }

  async cleanupOldData(daysToKeep: number = 7): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

    let cleanedCount = 0;
    const datesToRemove: string[] = [];

    for (const [date, gaps] of this.gaps.entries()) {
      if (date < cutoffDateStr) {
        datesToRemove.push(date);
        cleanedCount += gaps.length;
      }
    }

    for (const date of datesToRemove) {
      this.gaps.delete(date);
    }

    return cleanedCount;
  }

  async resetDatabase(): Promise<void> {
    this.tasks = [];
    this.gaps.clear();
    this.preferences = null;
    this.calendarState.clear();
  }

  async saveActivities(activities: any[]): Promise<void> {
    this.activities = activities.map(activity => ({
      ...activity,
      userId: this.userId,
      createdAt: activity.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
  }

  async getActivities(): Promise<any[]> {
    return this.activities.filter(activity => activity.userId === this.userId);
  }

  async updateActivity(activityId: string, updates: any): Promise<any | null> {
    const index = this.activities.findIndex(a => a.id === activityId);
    if (index === -1) return null;

    this.activities[index] = {
      ...this.activities[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    return this.activities[index];
  }

  async close(): Promise<void> {
    this.tasks = [];
    this.gaps.clear();
    this.preferences = null;
    this.calendarState.clear();
    this.activities = [];
  }
}

export class LocalStorageStrategy implements IStorageStrategy {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  async initialize(): Promise<void> {
    console.log('✅ LocalStorage strategy initialized');
  }

  async saveTasks(tasks: Task[], replaceAll: boolean = false): Promise<void> {
    try {
      if (replaceAll) {
        localStorage.setItem(`gaply_tasks_${this.userId}`, JSON.stringify(tasks));
      } else {
        // Get existing tasks
        const existingTasks = await this.getTasks();
        const taskMap = new Map(existingTasks.map(task => [task.id, task]));
        
        // Update existing tasks and add new ones
        tasks.forEach(task => taskMap.set(task.id, task));
        localStorage.setItem(`gaply_tasks_${this.userId}`, JSON.stringify(Array.from(taskMap.values())));
      }
    } catch (error) {
      console.error('Failed to save tasks to localStorage:', error);
      throw error;
    }
  }

  async saveTask(task: Task): Promise<void> {
    try {
      const tasks = await this.getTasks();
      const index = tasks.findIndex(t => t.id === task.id);
      
      if (index !== -1) {
        tasks[index] = task;
      } else {
        tasks.push(task);
      }
      
      localStorage.setItem(`gaply_tasks_${this.userId}`, JSON.stringify(tasks));
    } catch (error) {
      console.error('Failed to save task to localStorage:', error);
      throw error;
    }
  }

  async getTasks(): Promise<Task[]> {
    try {
      const stored = localStorage.getItem(`gaply_tasks_${this.userId}`);
      if (!stored) return [];
      
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) {
        console.warn('Invalid tasks data in localStorage, clearing corrupted data');
        localStorage.removeItem(`gaply_tasks_${this.userId}`);
        return [];
      }
      
      return parsed;
    } catch (error) {
      console.error('Error reading tasks from localStorage:', error);
      return [];
    }
  }

  async updateTask(taskId: string, updates: Partial<Task>): Promise<Task | null> {
    const tasks = await this.getTasks();
    const index = tasks.findIndex(t => t.id === taskId);
    if (index === -1) return null;

    tasks[index] = { ...tasks[index], ...updates, updated_at: new Date().toISOString() };
    await this.saveTasks(tasks);
    return tasks[index];
  }

  async deleteTask(taskId: string): Promise<boolean> {
    const tasks = await this.getTasks();
    const index = tasks.findIndex(t => t.id === taskId);
    if (index === -1) return false;

    tasks.splice(index, 1);
    await this.saveTasks(tasks);
    return true;
  }

  async saveGaps(gaps: TimeGap[], date: string): Promise<void> {
    try {
      localStorage.setItem(`gaply_gaps_${date}`, JSON.stringify(gaps));
    } catch (error) {
      console.error('Failed to save gaps to localStorage:', error);
      throw error;
    }
  }

  async getGaps(date: string): Promise<TimeGap[]> {
    try {
      const stored = localStorage.getItem(`gaply_gaps_${date}`);
      if (!stored) return [];
      
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) {
        console.warn('Invalid gaps data in localStorage, clearing corrupted data');
        localStorage.removeItem(`gaply_gaps_${date}`);
        return [];
      }
      
      return parsed;
    } catch (error) {
      console.error('Error reading gaps from localStorage:', error);
      return [];
    }
  }

  async getAllGaps(): Promise<TimeGap[]> {
    const allGaps: TimeGap[] = [];
    const keys = Object.keys(localStorage);
    const gapKeys = keys.filter(key => key.startsWith('gaply_gaps_'));

    for (const key of gapKeys) {
      try {
        const gaps = await this.getGaps(key.replace('gaply_gaps_', ''));
        allGaps.push(...gaps);
      } catch (error) {
        console.error(`Error reading gaps from ${key}:`, error);
      }
    }

    return allGaps;
  }

  async savePreferences(preferences: UserPreferences): Promise<void> {
    try {
      localStorage.setItem(`gaply_preferences_${this.userId}`, JSON.stringify(preferences));
    } catch (error) {
      console.error('Failed to save preferences to localStorage:', error);
      throw error;
    }
  }

  async getPreferences(): Promise<UserPreferences | null> {
    try {
      const stored = localStorage.getItem(`gaply_preferences_${this.userId}`);
      if (!stored) return null;
      
      const parsed = JSON.parse(stored);
      if (typeof parsed !== 'object' || parsed === null) {
        console.warn('Invalid preferences data in localStorage, clearing corrupted data');
        localStorage.removeItem(`gaply_preferences_${this.userId}`);
        return null;
      }
      
      return parsed;
    } catch (error) {
      console.error('Error reading preferences from localStorage:', error);
      return null;
    }
  }

  async saveCalendarState(key: string, value: any): Promise<void> {
    try {
      localStorage.setItem(`gaply_calendar_${key}`, JSON.stringify(value));
    } catch (error) {
      console.error('Failed to save calendar state to localStorage:', error);
      throw error;
    }
  }

  async getCalendarState(key: string): Promise<any> {
    try {
      const stored = localStorage.getItem(`gaply_calendar_${key}`);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Error reading calendar state from localStorage:', error);
      return null;
    }
  }

  async removeCalendarState(key: string): Promise<void> {
    try {
      localStorage.removeItem(`gaply_calendar_${key}`);
    } catch (error) {
      console.error('Failed to remove calendar state from localStorage:', error);
    }
  }

  async getStorageInfo(): Promise<StorageInfo> {
    try {
      const keys = Object.keys(localStorage);
      const gaplyKeys = keys.filter(key => key.startsWith('gaply_'));
      
      let used = 0;
      for (const key of gaplyKeys) {
        try {
          const value = localStorage.getItem(key);
          if (value) {
            used += key.length + value.length;
          }
        } catch (error) {
          console.error(`Error calculating size for ${key}:`, error);
        }
      }
      
      const total = 5 * 1024 * 1024; // 5MB typical localStorage limit
      const available = Math.max(0, total - used);
      
      const collections = {
        tasks: gaplyKeys.filter(k => k.includes('tasks')).length,
        gaps: gaplyKeys.filter(k => k.includes('gaps')).length,
        preferences: gaplyKeys.filter(k => k.includes('preferences')).length,
        calendar: gaplyKeys.filter(k => k.includes('calendar')).length
      };
      
      return {
        used,
        available,
        total,
        collections
      };
    } catch (error) {
      console.error('Error getting storage info:', error);
      return {
        used: 0,
        available: 0,
        total: 0,
        collections: {}
      };
    }
  }

  async cleanupOldData(daysToKeep: number = 7): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

    let cleanedCount = 0;
    const keys = Object.keys(localStorage);
    const gapKeys = keys.filter(key => key.startsWith('gaply_gaps_'));

    for (const key of gapKeys) {
      const dateStr = key.replace('gaply_gaps_', '');
      if (dateStr < cutoffDateStr) {
        try {
          localStorage.removeItem(key);
          cleanedCount++;
        } catch (error) {
          console.error(`Failed to remove ${key}:`, error);
        }
      }
    }

    return cleanedCount;
  }

  async resetDatabase(): Promise<void> {
    const keys = Object.keys(localStorage);
    const gaplyKeys = keys.filter(key => key.startsWith('gaply_'));
    for (const key of gaplyKeys) {
      localStorage.removeItem(key);
    }
  }

  async saveActivities(activities: any[]): Promise<void> {
    try {
      const enrichedActivities = activities.map(activity => ({
        ...activity,
        userId: this.userId,
        createdAt: activity.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }));
      localStorage.setItem(`gaply_activities_${this.userId}`, JSON.stringify(enrichedActivities));
    } catch (error) {
      console.error('Failed to save activities to localStorage:', error);
      throw error;
    }
  }

  async getActivities(): Promise<any[]> {
    try {
      const stored = localStorage.getItem(`gaply_activities_${this.userId}`);
      if (!stored) return [];
      
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) {
        console.warn('Invalid activities data in localStorage, clearing corrupted data');
        localStorage.removeItem(`gaply_activities_${this.userId}`);
        return [];
      }
      
      return parsed.filter(activity => activity.userId === this.userId);
    } catch (error) {
      console.error('Error reading activities from localStorage:', error);
      return [];
    }
  }

  async updateActivity(activityId: string, updates: any): Promise<any | null> {
    try {
      const activities = await this.getActivities();
      const index = activities.findIndex(a => a.id === activityId);
      if (index === -1) return null;

      activities[index] = {
        ...activities[index],
        ...updates,
        updatedAt: new Date().toISOString()
      };
      
      await this.saveActivities(activities);
      return activities[index];
    } catch (error) {
      console.error('Error updating activity in localStorage:', error);
      return null;
    }
  }

  async close(): Promise<void> {
    // localStorage doesn't need explicit cleanup
  }
}

export class StorageManager {
  private strategy: IStorageStrategy;
  private userId: string;
  private storageType: 'indexeddb' | 'localstorage' | 'memory';

  constructor(userId: string, storageType: 'indexeddb' | 'localstorage' | 'memory' = 'indexeddb') {
    this.userId = userId;
    this.storageType = storageType;
    
    switch (storageType) {
      case 'indexeddb':
        this.strategy = new IndexedDBStorage(userId);
        break;
      case 'localstorage':
        this.strategy = new LocalStorageStrategy(userId);
        break;
      case 'memory':
        this.strategy = new MemoryStorageStrategy(userId);
        break;
      default:
        throw new Error(`Unsupported storage type: ${storageType}`);
    }
  }

  async initialize(): Promise<void> {
    await this.strategy.initialize();
    
    // If using IndexedDB, migrate from localStorage if needed
    if (this.storageType === 'indexeddb') {
      const indexedDBStrategy = this.strategy as IndexedDBStorage;
      await indexedDBStrategy.migrateFromLocalStorage();
    }
  }

  // Delegate all methods to the strategy
  async saveTasks(tasks: Task[]): Promise<void> {
    return this.strategy.saveTasks(tasks);
  }

  async getTasks(): Promise<Task[]> {
    return this.strategy.getTasks();
  }

  async updateTask(taskId: string, updates: Partial<Task>): Promise<Task | null> {
    return this.strategy.updateTask(taskId, updates);
  }

  async deleteTask(taskId: string): Promise<boolean> {
    return this.strategy.deleteTask(taskId);
  }

  async saveGaps(gaps: TimeGap[], date: string): Promise<void> {
    return this.strategy.saveGaps(gaps, date);
  }

  async getGaps(date: string): Promise<TimeGap[]> {
    return this.strategy.getGaps(date);
  }

  async getAllGaps(): Promise<TimeGap[]> {
    return this.strategy.getAllGaps();
  }

  async savePreferences(preferences: UserPreferences): Promise<void> {
    return this.strategy.savePreferences(preferences);
  }

  async getPreferences(): Promise<UserPreferences | null> {
    return this.strategy.getPreferences();
  }

  async saveCalendarState(key: string, value: any): Promise<void> {
    return this.strategy.saveCalendarState(key, value);
  }

  async getCalendarState(key: string): Promise<any> {
    return this.strategy.getCalendarState(key);
  }

  async removeCalendarState(key: string): Promise<void> {
    return this.strategy.removeCalendarState(key);
  }

  async getStorageInfo(): Promise<StorageInfo> {
    return this.strategy.getStorageInfo();
  }

  async cleanupOldData(daysToKeep?: number): Promise<number> {
    return this.strategy.cleanupOldData(daysToKeep);
  }

  async close(): Promise<void> {
    return this.strategy.close();
  }

  async resetDatabase(): Promise<void> {
    return this.strategy.resetDatabase();
  }

  // Utility method to detect best available storage
  static async detectBestStorage(): Promise<'indexeddb' | 'localstorage' | 'memory'> {
    // Test IndexedDB
    try {
      const testDB = indexedDB.open('test', 1);
      await new Promise((resolve, reject) => {
        testDB.onsuccess = () => {
          testDB.result.close();
          indexedDB.deleteDatabase('test');
          resolve(true);
        };
        testDB.onerror = () => reject(testDB.error);
      });
      return 'indexeddb';
    } catch (error) {
      console.warn('IndexedDB not available, falling back to localStorage');
    }

    // Test localStorage
    try {
      const testKey = 'test_storage';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
      return 'localstorage';
    } catch (error) {
      console.warn('localStorage not available, using memory storage');
    }

    return 'memory';
  }
} 