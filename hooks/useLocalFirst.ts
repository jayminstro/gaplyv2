import { useState, useEffect, useCallback, useRef } from 'react';
import { LocalFirstService, LocalFirstConfig } from '../utils/localFirst/LocalFirstService';
import { SafeDeleteManager } from '../utils/localFirst/SafeDeleteManager';
import { LocalTask, LocalTimeGap, LocalUserPreferences } from '../utils/database/schema';
import { Task, TimeGap, UserPreferences } from '../types/index';
import { supabase } from '../utils/supabase/client';

export interface UseLocalFirstOptions {
  config?: Partial<LocalFirstConfig>;
  enableAutoSync?: boolean;
  enableBackgroundProcesses?: boolean;
}

export interface LocalFirstState {
  isInitialized: boolean;
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  syncStatus: any;
  systemStatus: any;
  errors: string[];
}

export function useLocalFirst(
  userId: string,
  options: UseLocalFirstOptions = {}
): {
  // Core operations
  createTask: (taskData: Omit<Task, 'id' | 'created_at' | 'updated_at'>) => Promise<LocalTask>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<LocalTask | undefined>;
  deleteTask: (id: string) => Promise<boolean>;
  getTasks: (filters?: any) => Promise<LocalTask[]>;
  
  createGap: (gapData: Omit<TimeGap, 'id' | 'created_at' | 'synced_at' | 'last_validated_at'>) => Promise<LocalTimeGap>;
  updateGap: (id: string, updates: Partial<TimeGap>) => Promise<LocalTimeGap | undefined>;
  deleteGap: (id: string) => Promise<boolean>;
  getGaps: (date: string) => Promise<LocalTimeGap[]>;
  
  // Gap lifecycle
  calculateGaps: (date: string, preferences: LocalUserPreferences) => Promise<LocalTimeGap[]>;
  recalculateGaps: (date: string) => Promise<void>;
  
  // Sync operations
  sync: (options?: any) => Promise<any>;
  getSyncStatus: () => Promise<any>;
  
  // User preferences
  getUserPreferences: () => Promise<LocalUserPreferences | null>;
  updateUserPreferences: (updates: Partial<UserPreferences>) => Promise<LocalUserPreferences>;
  
  // Safe delete
  safeDelete: (id: string, table: string, reason?: string) => Promise<any>;
  restoreItem: (id: string, table: string) => Promise<boolean>;
  
  // State and status
  state: LocalFirstState;
  service: LocalFirstService | null;
  deleteManager: SafeDeleteManager | null;
} {
  const [state, setState] = useState<LocalFirstState>({
    isInitialized: false,
    isOnline: navigator.onLine,
    isSyncing: false,
    lastSyncTime: null,
    syncStatus: null,
    systemStatus: null,
    errors: []
  });

  const serviceRef = useRef<LocalFirstService | null>(null);
  const deleteManagerRef = useRef<SafeDeleteManager | null>(null);

  // Initialize local-first system
  useEffect(() => {
    const initializeSystem = async () => {
      try {
        // Check authentication
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          throw new Error('User not authenticated');
        }

        // Create and initialize service
        const service = new LocalFirstService(userId, options.config);
        serviceRef.current = service;

        // Create delete manager
        const deleteManager = new SafeDeleteManager(service.getDatabaseManager());
        deleteManagerRef.current = deleteManager;

        // Initialize
        await service.initialize();

        // Set up status polling
        const updateStatus = async () => {
          if (service) {
            const [syncStatus, systemStatus] = await Promise.all([
              service.getSyncStatus(),
              service.getSystemStatus()
            ]);

            setState(prev => ({
              ...prev,
              isInitialized: true,
              isOnline: navigator.onLine,
              isSyncing: syncStatus.isSyncing || false,
              lastSyncTime: syncStatus.lastSyncTime ? new Date(syncStatus.lastSyncTime) : null,
              syncStatus,
              systemStatus
            }));
          }
        };

        // Initial status update
        await updateStatus();

        // Poll for status updates
        const statusInterval = setInterval(updateStatus, 10000);

        // Set up network monitoring
        const handleOnline = () => {
          setState(prev => ({ ...prev, isOnline: true }));
          if (options.enableAutoSync) {
            service.sync({ priority: 'normal' });
          }
        };

        const handleOffline = () => {
          setState(prev => ({ ...prev, isOnline: false }));
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
          clearInterval(statusInterval);
          window.removeEventListener('online', handleOnline);
          window.removeEventListener('offline', handleOffline);
          service.cleanup();
        };
      } catch (error) {
        setState(prev => ({
          ...prev,
          errors: [...prev.errors, error instanceof Error ? error.message : 'Failed to initialize']
        }));
      }
    };

    initializeSystem();
  }, [userId, options.config, options.enableAutoSync]);

  // Task operations
  const createTask = useCallback(async (taskData: Omit<Task, 'id' | 'created_at' | 'updated_at'>): Promise<LocalTask> => {
    if (!serviceRef.current) throw new Error('Service not initialized');
    return await serviceRef.current.createTask(taskData);
  }, []);

  const updateTask = useCallback(async (id: string, updates: Partial<Task>): Promise<LocalTask | undefined> => {
    if (!serviceRef.current) throw new Error('Service not initialized');
    return await serviceRef.current.updateTask(id, updates);
  }, []);

  const deleteTask = useCallback(async (id: string): Promise<boolean> => {
    if (!serviceRef.current) throw new Error('Service not initialized');
    return await serviceRef.current.deleteTask(id);
  }, []);

  const getTasks = useCallback(async (filters?: any): Promise<LocalTask[]> => {
    if (!serviceRef.current) throw new Error('Service not initialized');
    return await serviceRef.current.getTasks(filters);
  }, []);

  // Gap operations
  const createGap = useCallback(async (gapData: Omit<TimeGap, 'id' | 'created_at' | 'synced_at' | 'last_validated_at'>): Promise<LocalTimeGap> => {
    if (!serviceRef.current) throw new Error('Service not initialized');
    return await serviceRef.current.createGap(gapData);
  }, []);

  const updateGap = useCallback(async (id: string, updates: Partial<TimeGap>): Promise<LocalTimeGap | undefined> => {
    if (!serviceRef.current) throw new Error('Service not initialized');
    return await serviceRef.current.updateGap(id, updates);
  }, []);

  const deleteGap = useCallback(async (id: string): Promise<boolean> => {
    if (!serviceRef.current) throw new Error('Service not initialized');
    return await serviceRef.current.deleteGap(id);
  }, []);

  const getGaps = useCallback(async (date: string): Promise<LocalTimeGap[]> => {
    if (!serviceRef.current) throw new Error('Service not initialized');
    return await serviceRef.current.getGaps(date);
  }, []);

  // Gap lifecycle
  const calculateGaps = useCallback(async (date: string, preferences: LocalUserPreferences): Promise<LocalTimeGap[]> => {
    if (!serviceRef.current) throw new Error('Service not initialized');
    return await serviceRef.current.calculateGapsForDate(date, preferences);
  }, []);

  const recalculateGaps = useCallback(async (date: string): Promise<void> => {
    if (!serviceRef.current) throw new Error('Service not initialized');
    return await serviceRef.current.recalculateGapsForDate(date);
  }, []);

  // Sync operations
  const sync = useCallback(async (options?: any): Promise<any> => {
    if (!serviceRef.current) throw new Error('Service not initialized');
    return await serviceRef.current.sync(options);
  }, []);

  const getSyncStatus = useCallback(async (): Promise<any> => {
    if (!serviceRef.current) throw new Error('Service not initialized');
    return await serviceRef.current.getSyncStatus();
  }, []);

  // User preferences
  const getUserPreferences = useCallback(async (): Promise<LocalUserPreferences | null> => {
    if (!serviceRef.current) throw new Error('Service not initialized');
    return await serviceRef.current.getUserPreferences();
  }, []);

  const updateUserPreferences = useCallback(async (updates: Partial<UserPreferences>): Promise<LocalUserPreferences> => {
    if (!serviceRef.current) throw new Error('Service not initialized');
    return await serviceRef.current.updateUserPreferences(updates);
  }, []);

  // Safe delete operations
  const safeDelete = useCallback(async (id: string, table: string, reason?: string): Promise<any> => {
    if (!deleteManagerRef.current) throw new Error('Delete manager not initialized');
    return await deleteManagerRef.current.safeDelete(id, table as any, reason);
  }, []);

  const restoreItem = useCallback(async (id: string, table: string): Promise<boolean> => {
    if (!deleteManagerRef.current) throw new Error('Delete manager not initialized');
    return await deleteManagerRef.current.restoreItem(id, table as any);
  }, []);

  return {
    // Core operations
    createTask,
    updateTask,
    deleteTask,
    getTasks,
    createGap,
    updateGap,
    deleteGap,
    getGaps,
    
    // Gap lifecycle
    calculateGaps,
    recalculateGaps,
    
    // Sync operations
    sync,
    getSyncStatus,
    
    // User preferences
    getUserPreferences,
    updateUserPreferences,
    
    // Safe delete
    safeDelete,
    restoreItem,
    
    // State and status
    state,
    service: serviceRef.current,
    deleteManager: deleteManagerRef.current
  };
} 