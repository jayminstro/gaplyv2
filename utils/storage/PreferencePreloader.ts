import { PreferenceManager } from './PreferenceManager';

export interface PreloadConfig {
  preloadCritical: boolean;
  preloadFull: boolean;
  preloadOnAppStart: boolean;
  preloadOnAuth: boolean;
  preloadOnFocus: boolean;
  preloadTimeout: number;
}

export interface PreloadResult {
  success: boolean;
  criticalLoaded: boolean;
  fullLoaded: boolean;
  duration: number;
  error?: string;
}

export class PreferencePreloader {
  private static instance: PreferencePreloader;
  private preferenceManager: PreferenceManager | null = null;
  private config: PreloadConfig;
  private isPreloading = false;
  private preloadPromise: Promise<PreloadResult> | null = null;
  private lastPreloadTime = 0;
  private preloadTimeout: NodeJS.Timeout | null = null;

  private constructor(config: Partial<PreloadConfig> = {}) {
    this.config = {
      preloadCritical: true,
      preloadFull: false,
      preloadOnAppStart: true,
      preloadOnAuth: true,
      preloadOnFocus: false,
      preloadTimeout: 5000, // 5 seconds timeout
      ...config
    };
  }

  static getInstance(config?: Partial<PreloadConfig>): PreferencePreloader {
    if (!PreferencePreloader.instance) {
      PreferencePreloader.instance = new PreferencePreloader(config);
    }
    return PreferencePreloader.instance;
  }

  /**
   * Initialize the preloader with storage
   */
  initialize(storage: any): void {
    this.preferenceManager = PreferenceManager.getInstance(storage);
  }

  /**
   * Preload critical preferences immediately
   */
  async preloadCritical(): Promise<PreloadResult> {
    if (!this.preferenceManager) {
      throw new Error('PreferencePreloader not initialized');
    }

    const startTime = performance.now();
    
    try {
      console.log('🚀 Preloading critical preferences...');
      
      // Get critical preferences (this is fast and always available)
      this.preferenceManager.getCriticalPreferences();
      
      const duration = performance.now() - startTime;
      console.log(`✅ Critical preferences preloaded in ${duration.toFixed(2)}ms`);
      
      this.lastPreloadTime = Date.now();
      
      return {
        success: true,
        criticalLoaded: true,
        fullLoaded: false,
        duration
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error('❌ Failed to preload critical preferences:', error);
      
      return {
        success: false,
        criticalLoaded: false,
        fullLoaded: false,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Preload full preferences in background
   */
  async preloadFull(): Promise<PreloadResult> {
    if (!this.preferenceManager) {
      throw new Error('PreferencePreloader not initialized');
    }

    const startTime = performance.now();
    
    try {
      console.log('🔄 Preloading full preferences...');
      
      // Get full preferences (this may take longer)
      await this.preferenceManager.getPreferences();
      
      const duration = performance.now() - startTime;
      console.log(`✅ Full preferences preloaded in ${duration.toFixed(2)}ms`);
      
      this.lastPreloadTime = Date.now();
      
      return {
        success: true,
        criticalLoaded: true,
        fullLoaded: true,
        duration
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error('❌ Failed to preload full preferences:', error);
      
      return {
        success: false,
        criticalLoaded: false,
        fullLoaded: false,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Smart preload based on configuration
   */
  async preload(): Promise<PreloadResult> {
    if (this.isPreloading && this.preloadPromise) {
      console.log('⏳ Preload already in progress, waiting...');
      return this.preloadPromise;
    }

    this.isPreloading = true;
    
    // Set timeout for preload operation
    this.preloadTimeout = setTimeout(() => {
      console.warn('⚠️ Preference preload timeout reached');
      this.isPreloading = false;
    }, this.config.preloadTimeout);

    try {
      // Always preload critical first
      const criticalResult = await this.preloadCritical();
      
      if (!criticalResult.success) {
        return criticalResult;
      }

      // Preload full if configured
      if (this.config.preloadFull) {
        const fullResult = await this.preloadFull();
        return fullResult;
      }

      return criticalResult;
    } finally {
      this.isPreloading = false;
      if (this.preloadTimeout) {
        clearTimeout(this.preloadTimeout);
        this.preloadTimeout = null;
      }
    }
  }

  /**
   * Preload on app start
   */
  async preloadOnAppStart(): Promise<PreloadResult> {
    if (!this.config.preloadOnAppStart) {
      console.log('⏭️ App start preload disabled');
      return {
        success: true,
        criticalLoaded: false,
        fullLoaded: false,
        duration: 0
      };
    }

    console.log('🚀 Preloading preferences on app start...');
    return this.preload();
  }

  /**
   * Preload on authentication
   */
  async preloadOnAuth(): Promise<PreloadResult> {
    if (!this.config.preloadOnAuth) {
      console.log('⏭️ Auth preload disabled');
      return {
        success: true,
        criticalLoaded: false,
        fullLoaded: false,
        duration: 0
      };
    }

    console.log('🔐 Preloading preferences on authentication...');
    return this.preload();
  }

  /**
   * Preload on app focus (background refresh)
   */
  async preloadOnFocus(): Promise<PreloadResult> {
    if (!this.config.preloadOnFocus) {
      console.log('⏭️ Focus preload disabled');
      return {
        success: true,
        criticalLoaded: false,
        fullLoaded: false,
        duration: 0
      };
    }

    // Only preload if enough time has passed since last preload
    const timeSinceLastPreload = Date.now() - this.lastPreloadTime;
    if (timeSinceLastPreload < 5 * 60 * 1000) { // 5 minutes
      console.log('⏭️ Skipping focus preload (too recent)');
      return {
        success: true,
        criticalLoaded: true,
        fullLoaded: true,
        duration: 0
      };
    }

    console.log('📱 Preloading preferences on app focus...');
    return this.preload();
  }

  /**
   * Get preload status
   */
  getStatus(): {
    isPreloading: boolean;
    lastPreloadTime: number;
    timeSinceLastPreload: number;
    config: PreloadConfig;
  } {
    return {
      isPreloading: this.isPreloading,
      lastPreloadTime: this.lastPreloadTime,
      timeSinceLastPreload: Date.now() - this.lastPreloadTime,
      config: this.config
    };
  }

  /**
   * Update preload configuration
   */
  updateConfig(newConfig: Partial<PreloadConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('⚙️ Updated preload configuration:', this.config);
  }

  /**
   * Reset preloader state
   */
  reset(): void {
    this.isPreloading = false;
    this.preloadPromise = null;
    this.lastPreloadTime = 0;
    if (this.preloadTimeout) {
      clearTimeout(this.preloadTimeout);
      this.preloadTimeout = null;
    }
    console.log('🔄 Preference preloader reset');
  }
} 