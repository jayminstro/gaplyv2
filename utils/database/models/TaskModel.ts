import { GaplyDatabase } from '../index';
import { LocalTask, SyncQueueItem } from '../schema';
import { generateUUID } from '../../uuid';

export class TaskModel {
  constructor(private db: GaplyDatabase) {}

  // CRUD Operations
  async create(task: Omit<LocalTask, 'id' | 'is_synced' | 'sync_version' | 'local_updated_at'>): Promise<LocalTask> {
    const newTask: LocalTask = {
      ...task,
      id: task.id || generateUUID(),
      is_synced: false,
      sync_version: 1,
      local_updated_at: new Date().toISOString()
    };

    await this.db.tasks.add(newTask);
    
    // Add to sync queue
    await this.addToSyncQueue('tasks', 'create', newTask);
    
    return newTask;
  }

  async getById(id: string): Promise<LocalTask | undefined> {
    return await this.db.tasks.get(id);
  }

  async getByUserId(userId: string): Promise<LocalTask[]> {
    return await this.db.tasks
      .where('user_id')
      .equals(userId)
      .filter(task => !task.deleted_at)
      .toArray();
  }

  async getAll(): Promise<LocalTask[]> {
    return await this.db.tasks
      .filter(task => !task.deleted_at)
      .toArray();
  }

  async getByDateRange(userId: string, startDate: string, endDate: string): Promise<LocalTask[]> {
    return await this.db.tasks
      .where('user_id')
      .equals(userId)
      .filter(task => {
        if (task.deleted_at) return false;
        if (!task.dueDate) return false;
        return task.dueDate >= startDate && task.dueDate <= endDate;
      })
      .toArray();
  }

  async update(id: string, updates: Partial<LocalTask>): Promise<LocalTask | undefined> {
    const existingTask = await this.db.tasks.get(id);
    if (!existingTask) return undefined;

    const updatedTask: LocalTask = {
      ...existingTask,
      ...updates,
      local_updated_at: new Date().toISOString(),
      is_synced: false,
      sync_version: existingTask.sync_version + 1
    };

    await this.db.tasks.put(updatedTask);
    
    // Add to sync queue
    await this.addToSyncQueue('tasks', 'update', updatedTask);
    
    return updatedTask;
  }

  async delete(id: string): Promise<boolean> {
    const task = await this.db.tasks.get(id);
    if (!task) return false;

    // Soft delete
    const deletedTask: LocalTask = {
      ...task,
      deleted_at: new Date().toISOString(),
      local_updated_at: new Date().toISOString(),
      is_synced: false,
      sync_version: task.sync_version + 1
    };

    await this.db.tasks.put(deletedTask);
    
    // Add to sync queue
    await this.addToSyncQueue('tasks', 'delete', deletedTask);
    
    return true;
  }

  async hardDelete(id: string): Promise<boolean> {
    const deleted = await this.db.tasks.delete(id);
    return deleted > 0;
  }

  // Sync Operations
  async getUnsynced(): Promise<LocalTask[]> {
    return await this.db.tasks
      .where('is_synced')
      .equals(false)
      .filter(task => !task.deleted_at)
      .toArray();
  }

  async markSynced(id: string, syncVersion: number): Promise<void> {
    await this.db.tasks.update(id, {
      is_synced: true,
      sync_version: syncVersion
    });
  }

  async markDeletedSynced(id: string): Promise<void> {
    const task = await this.db.tasks.get(id);
    if (task && task.deleted_at) {
      await this.db.tasks.delete(id);
    }
  }

  // Utility Methods
  async getTasksForToday(userId: string): Promise<LocalTask[]> {
    const today = new Date().toISOString().split('T')[0];
    return await this.getByDateRange(userId, today, today);
  }

  async getOverdueTasks(userId: string): Promise<LocalTask[]> {
    const today = new Date().toISOString().split('T')[0];
    return await this.db.tasks
      .where('user_id')
      .equals(userId)
      .filter(task => {
        if (task.deleted_at) return false;
        if (!task.dueDate) return false;
        return task.dueDate < today && task.status !== 'completed';
      })
      .toArray();
  }

  private async addToSyncQueue(table: 'tasks', operation: 'create' | 'update' | 'delete', data: any): Promise<void> {
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