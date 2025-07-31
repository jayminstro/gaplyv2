import { DatabaseManager } from '../database/DatabaseManager';
import { SyncManager } from './SyncManager';
import { NetworkMonitor } from './NetworkMonitor';

export interface SyncConfig {
  autoSync: boolean;
  syncInterval: number; // milliseconds
  retryAttempts: number;
  retryDelay: number; // milliseconds
  backgroundSync: boolean;
}

export class SyncService {
  private dbManager: DatabaseManager;
  private syncManager: SyncManager;
  private networkMonitor: NetworkMonitor;
  private config: SyncConfig;
  private backgroundSyncInterval?: NodeJS.Timeout;
  private isInitialized = false;

  constructor(dbManager: DatabaseManager, config: SyncConfig) {
    this.dbManager = dbManager;
    this.syncManager = new SyncManager(dbManager);
    this.networkMonitor = new NetworkMonitor();
    this.config = config;
  }

  // Initialize the sync service
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Initialize database
      await this.dbManager.initialize();
      
      // Migrate from localStorage if needed
      await this.dbManager.migrateFromLocalStorage();
      
      // Set up network monitoring
      this.setupNetworkMonitoring();
      
      // Start background sync if enabled
      if (this.config.backgroundSync) {
        this.startBackgroundSync();
      }
      
      this.isInitialized = true;
      console.log('✅ Sync service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize sync service:', error);
      throw error;
    }
  }

  // Manual sync
  async sync(options?: { force?: boolean; priority?: 'high' | 'normal' | 'low' }): Promise<any> {
    if (!this.isInitialized) {
      throw new Error('Sync service not initialized');
    }

    return await this.syncManager.sync(options);
  }

  // Background sync management
  private startBackgroundSync(): void {
    if (this.backgroundSyncInterval) {
      clearInterval(this.backgroundSyncInterval);
    }

    this.backgroundSyncInterval = setInterval(async () => {
      if (this.networkMonitor.isOnline() && !this.syncManager.isCurrentlySyncing()) {
        try {
          await this.syncManager.sync({ priority: 'low' });
        } catch (error) {
          console.error('Background sync failed:', error);
        }
      }
    }, this.config.syncInterval);
  }

  private stopBackgroundSync(): void {
    if (this.backgroundSyncInterval) {
      clearInterval(this.backgroundSyncInterval);
      this.backgroundSyncInterval = undefined;
    }
  }

  // Network monitoring setup
  private setupNetworkMonitoring(): void {
    this.networkMonitor.addListener(async (online) => {
      if (online && this.config.autoSync) {
        // Wait a bit for connection to stabilize
        setTimeout(async () => {
          try {
            await this.syncManager.sync({ priority: 'normal' });
          } catch (error) {
            console.error('Auto-sync after reconnection failed:', error);
          }
        }, 2000);
      }
    });
  }

  // Configuration management
  updateConfig(newConfig: Partial<SyncConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (this.config.backgroundSync) {
      this.startBackgroundSync();
    } else {
      this.stopBackgroundSync();
    }
  }

  getConfig(): SyncConfig {
    return { ...this.config };
  }

  // Status and monitoring
  getStatus(): Promise<any> {
    return this.syncManager.getSyncStatus();
  }

  isOnline(): boolean {
    return this.networkMonitor.isOnline();
  }

  isSyncing(): boolean {
    return this.syncManager.isCurrentlySyncing();
  }

  getLastSyncTime(): Date | null {
    return this.syncManager.getLastSyncTime();
  }

  // Maintenance
  async performMaintenance(): Promise<void> {
    await this.dbManager.performMaintenance();
  }

  // Cleanup
  async cleanup(): Promise<void> {
    this.stopBackgroundSync();
    await this.dbManager.close();
    this.isInitialized = false;
  }

  // Database access
  getDatabaseManager(): DatabaseManager {
    return this.dbManager;
  }
} 