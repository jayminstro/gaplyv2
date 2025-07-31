import { Task, TimeGap, UserPreferences } from '../../types/index';
import { supabase } from '../supabase/client';

// Simple fallback implementation that uses localStorage and existing APIs
export class SimpleLocalFirstService {
  private userId: string;
  private isInitialized = false;

  constructor(userId: string) {
    this.userId = userId;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('🔧 Initializing simple local-first system...');
      
      // Check authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        throw new Error('User not authenticated');
      }

      this.isInitialized = true;
      console.log('✅ Simple local-first system initialized');
    } catch (error) {
      console.error('❌ Failed to initialize simple local-first system:', error);
      throw error;
    }
  }

  // Task operations using localStorage as fallback
  async createTask(taskData: Omit<Task, 'id' | 'created_at' | 'updated_at'>): Promise<Task> {
    await this.ensureInitialized();

    const task: Task = {
      ...taskData,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Store in localStorage
    const tasks = this.getLocalTasks();
    tasks.push(task);
    this.setLocalTasks(tasks);

    return task;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task | undefined> {
    await this.ensureInitialized();

    const tasks = this.getLocalTasks();
    const taskIndex = tasks.findIndex(t => t.id === id);
    
    if (taskIndex === -1) return undefined;

    tasks[taskIndex] = {
      ...tasks[taskIndex],
      ...updates,
      updated_at: new Date().toISOString()
    };

    this.setLocalTasks(tasks);
    return tasks[taskIndex];
  }

  async deleteTask(id: string): Promise<boolean> {
    await this.ensureInitialized();

    const tasks = this.getLocalTasks();
    const filteredTasks = tasks.filter(t => t.id !== id);
    
    if (filteredTasks.length === tasks.length) return false;

    this.setLocalTasks(filteredTasks);
    return true;
  }

  async getTasks(): Promise<Task[]> {
    await this.ensureInitialized();
    return this.getLocalTasks();
  }

  // Gap operations
  async getGaps(date: string): Promise<TimeGap[]> {
    await this.ensureInitialized();
    
    const storedGaps = localStorage.getItem(`gaply_gaps_${date}`);
    return storedGaps ? JSON.parse(storedGaps) : [];
  }

  async createGap(gapData: Omit<TimeGap, 'id' | 'created_at' | 'synced_at' | 'last_validated_at'>): Promise<TimeGap> {
    await this.ensureInitialized();

    const gap: TimeGap = {
      ...gapData,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      synced_at: new Date().toISOString(),
      last_validated_at: new Date().toISOString()
    };

    const gaps = await this.getGaps(gapData.date || new Date().toISOString().split('T')[0]);
    gaps.push(gap);
    
    const date = gapData.date || new Date().toISOString().split('T')[0];
    localStorage.setItem(`gaply_gaps_${date}`, JSON.stringify(gaps));

    return gap;
  }

  // User preferences
  async getUserPreferences(): Promise<UserPreferences | null> {
    await this.ensureInitialized();

    const stored = localStorage.getItem(`gaply_preferences_${this.userId}`);
    if (stored) return JSON.parse(stored);

    // Fallback to API
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return null;

      const { projectId } = await import('../supabase/info');
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-966d4846/preferences`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });

      if (response.ok) {
        const prefs = await response.json();
        localStorage.setItem(`gaply_preferences_${this.userId}`, JSON.stringify(prefs));
        return prefs;
      }
    } catch (error) {
      console.error('Failed to fetch user preferences:', error);
    }

    return null;
  }

  async updateUserPreferences(updates: Partial<UserPreferences>): Promise<UserPreferences> {
    await this.ensureInitialized();

    const currentPrefs = await this.getUserPreferences();
    if (!currentPrefs) throw new Error('No preferences found');

    const updatedPrefs = { ...currentPrefs, ...updates };
    localStorage.setItem(`gaply_preferences_${this.userId}`, JSON.stringify(updatedPrefs));

    return updatedPrefs;
  }

  // Sync operations (simplified)
  async sync(): Promise<any> {
    await this.ensureInitialized();
    console.log('🔄 Simple sync - no complex sync logic implemented');
    return { success: true, syncedItems: 0, conflicts: 0, errors: [] };
  }

  async getSyncStatus(): Promise<any> {
    return {
      isOnline: navigator.onLine,
      isSyncing: false,
      lastSyncTime: null
    };
  }

  // Utility methods
  private ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      return this.initialize();
    }
    return Promise.resolve();
  }

  private getLocalTasks(): Task[] {
    const stored = localStorage.getItem(`gaply_tasks_${this.userId}`);
    return stored ? JSON.parse(stored) : [];
  }

  private setLocalTasks(tasks: Task[]): void {
    localStorage.setItem(`gaply_tasks_${this.userId}`, JSON.stringify(tasks));
  }

  async cleanup(): Promise<void> {
    this.isInitialized = false;
  }
} 