import { useState, useEffect, useCallback, useRef } from 'react';
import { SyncService, SyncConfig } from '../utils/sync/SyncService';
import { DatabaseManager } from '../utils/database/DatabaseManager';
import { supabase } from '../utils/supabase/client';

export interface UseSyncOptions {
  autoSync?: boolean;
  syncInterval?: number;
  retryAttempts?: number;
  retryDelay?: number;
  backgroundSync?: boolean;
}

export interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  syncStatus: any;
  error: string | null;
}

export function useSync(userId: string, options: UseSyncOptions = {}): {
  sync: () => Promise<any>;
  state: SyncState;
  syncService: SyncService | null;
} {
  const [state, setState] = useState<SyncState>({
    isOnline: navigator.onLine,
    isSyncing: false,
    lastSyncTime: null,
    syncStatus: null,
    error: null
  });

  const syncServiceRef = useRef<SyncService | null>(null);
  const dbManagerRef = useRef<DatabaseManager | null>(null);

  // Initialize sync service
  useEffect(() => {
    const initializeSync = async () => {
      try {
        // Check authentication
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          throw new Error('User not authenticated');
        }

        // Create database manager
        const dbManager = new DatabaseManager(userId);
        dbManagerRef.current = dbManager;

        // Create sync service
        const config: SyncConfig = {
          autoSync: options.autoSync ?? true,
          syncInterval: options.syncInterval ?? 30000,
          retryAttempts: options.retryAttempts ?? 3,
          retryDelay: options.retryDelay ?? 1000,
          backgroundSync: options.backgroundSync ?? true
        };

        const syncService = new SyncService(dbManager, config);
        syncServiceRef.current = syncService;

        // Initialize
        await syncService.initialize();

        // Update state
        setState(prev => ({
          ...prev,
          isOnline: syncService.isOnline(),
          lastSyncTime: syncService.getLastSyncTime()
        }));

        // Set up status polling
        const updateStatus = async () => {
          if (syncService) {
            const status = await syncService.getStatus();
            setState(prev => ({
              ...prev,
              isSyncing: syncService.isSyncing(),
              syncStatus: status,
              lastSyncTime: syncService.getLastSyncTime()
            }));
          }
        };

        // Initial status update
        await updateStatus();

        // Poll for status updates
        const statusInterval = setInterval(updateStatus, 5000);

        return () => {
          clearInterval(statusInterval);
          syncService.cleanup();
        };
      } catch (error) {
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Failed to initialize sync'
        }));
      }
    };

    initializeSync();
  }, [userId, options.autoSync, options.syncInterval, options.retryAttempts, options.retryDelay, options.backgroundSync]);

  // Manual sync function
  const sync = useCallback(async () => {
    if (!syncServiceRef.current) {
      throw new Error('Sync service not initialized');
    }

    setState(prev => ({ ...prev, isSyncing: true, error: null }));

    try {
      const result = await syncServiceRef.current.sync({ priority: 'high' });
      
      setState(prev => ({
        ...prev,
        isSyncing: false,
        lastSyncTime: syncServiceRef.current?.getLastSyncTime() || null
      }));

      return result;
    } catch (error) {
      setState(prev => ({
        ...prev,
        isSyncing: false,
        error: error instanceof Error ? error.message : 'Sync failed'
      }));
      throw error;
    }
  }, []);

  return {
    sync,
    state,
    syncService: syncServiceRef.current
  };
} 