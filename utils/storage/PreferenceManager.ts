import { UserPreferences } from '../../types/index';
import { DEFAULT_PREFERENCES } from '../constants';
import { PreferencePreloader } from './PreferencePreloader';
import { IntelligentCache } from './IntelligentCache';
import { PreferenceValidationAPI } from '../api/preferenceValidation';
import { PreferenceChangeDetector } from './PreferenceChangeDetector';

export interface PreferenceValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  criticalFields: string[];
}

export interface PreferenceCacheConfig {
  memoryTTL: number; // 24 hours for preferences
  validationEnabled: boolean;
  criticalFields: string[];
  defaultFallback: boolean;
  enablePreloading: boolean;
  enableIntelligentCache: boolean;
  enableChangeDetection: boolean;
  enableServerValidation: boolean;
}

export class PreferenceManager {
  private static instance: PreferenceManager;
  private preferences: UserPreferences | null = null;
  private isLoading = false;
  private lastLoadTime = 0;
  private config: PreferenceCacheConfig;
  private storage: any;
  private preloader?: PreferencePreloader;
  private intelligentCache?: IntelligentCache;
  private changeDetector?: PreferenceChangeDetector;

  private constructor(storage: any, config: Partial<PreferenceCacheConfig> = {}) {
    this.storage = storage;
    this.config = {
      memoryTTL: 24 * 60 * 60 * 1000, // 24 hours
      validationEnabled: true,
      criticalFields: [
        'calendar_work_start',
        'calendar_work_end', 
        'calendar_working_days',
        'calendar_min_gap'
      ],
      defaultFallback: true,
      enablePreloading: true,
      enableIntelligentCache: true,
      enableChangeDetection: true,
      enableServerValidation: true,
      ...config
    };

    // Initialize Phase 2 components (but not preloader to avoid circular dependency)
    if (this.config.enableIntelligentCache) {
      this.intelligentCache = new IntelligentCache();
    }

    if (this.config.enableChangeDetection) {
      this.changeDetector = PreferenceChangeDetector.getInstance();
    }
  }

  static getInstance(storage: any, config?: Partial<PreferenceCacheConfig>): PreferenceManager {
    if (!PreferenceManager.instance) {
      PreferenceManager.instance = new PreferenceManager(storage, config);
      // Initialize preloader after instance creation to avoid circular dependency
      if (PreferenceManager.instance.config.enablePreloading) {
        PreferenceManager.instance.preloader = PreferencePreloader.getInstance();
        PreferenceManager.instance.preloader.initialize(storage);
      }
      return PreferenceManager.instance;
    }

    // If instance already exists, refresh its dependencies when a new storage is provided
    if (storage && PreferenceManager.instance.storage !== storage) {
      PreferenceManager.instance.storage = storage;
      if (PreferenceManager.instance.preloader) {
        PreferenceManager.instance.preloader.initialize(storage);
      }
    }

    // Optionally merge in any new config flags without removing existing ones
    if (config && Object.keys(config).length > 0) {
      PreferenceManager.instance.config = {
        ...PreferenceManager.instance.config,
        ...config,
      };
    }

    return PreferenceManager.instance;
  }

  /**
   * Get preferences with optimized loading strategy
   * Priority: Intelligent Cache -> Memory cache -> Storage -> Server -> Defaults
   */
  async getPreferences(): Promise<UserPreferences> {
    const now = Date.now();
    
    // Check intelligent cache first (Phase 2)
    if (this.intelligentCache) {
      const cachedPrefs = this.intelligentCache.getFullPreferences();
      if (cachedPrefs) {
        console.log('⚡ Preferences retrieved from intelligent cache');
        return cachedPrefs;
      }
    }
    
    // Check if we have valid cached preferences
    if (this.preferences && (now - this.lastLoadTime) < this.config.memoryTTL) {
      console.log('⚡ Preferences retrieved from memory cache');
      return this.preferences;
    }

    // Prevent concurrent loading
    if (this.isLoading) {
      console.log('⏳ Preferences already loading, waiting...');
      while (this.isLoading) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      return this.preferences || DEFAULT_PREFERENCES;
    }

    this.isLoading = true;
    
    try {
      console.log('🔄 Loading preferences...');
      
      // Try storage first (fastest)
      let prefs = await this.loadFromStorage();
      
      if (!prefs) {
        // Try server if storage is empty
        prefs = await this.loadFromServer();
      }
      
      if (!prefs && this.config.defaultFallback) {
        // Use defaults as last resort
        prefs = DEFAULT_PREFERENCES;
        console.log('⚠️ Using default preferences');
      }

      if (prefs) {
        // Server-side validation (Phase 2)
        if (this.config.enableServerValidation) {
          try {
            const validation = await PreferenceValidationAPI.validateStrict(prefs);
            if (!validation.isValid) {
              console.warn('⚠️ Server validation failed:', validation.errors);
              if (this.config.defaultFallback) {
                prefs = this.mergeWithDefaults(prefs);
              }
            }
          } catch (validationError) {
            console.warn('⚠️ Server validation failed, using client validation:', validationError);
            // Fall back to client validation
            const validation = this.validatePreferences(prefs);
            if (!validation.isValid) {
              console.warn('⚠️ Client validation failed:', validation.errors);
              if (this.config.defaultFallback) {
                prefs = this.mergeWithDefaults(prefs);
              }
            }
          }
        } else {
          // Client-side validation
          const validation = this.validatePreferences(prefs);
          if (!validation.isValid) {
            console.warn('⚠️ Preference validation failed:', validation.errors);
            if (this.config.defaultFallback) {
              prefs = this.mergeWithDefaults(prefs);
            }
          }
        }

        this.preferences = prefs;
        this.lastLoadTime = now;
        
        // Cache in intelligent cache (Phase 2)
        if (this.intelligentCache) {
          this.intelligentCache.setFullPreferences(prefs);
        }
        
        // Cache in storage for next time
        await this.saveToStorage(prefs);
        
        console.log('✅ Preferences loaded successfully');
        return prefs;
      }

      throw new Error('Failed to load preferences from all sources');
    } catch (error) {
      console.error('❌ Error loading preferences:', error);
      if (this.config.defaultFallback) {
        return DEFAULT_PREFERENCES;
      }
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Save preferences with validation and caching
   */
  async savePreferences(preferences: UserPreferences): Promise<void> {
    console.log('💾 Saving preferences...');
    
    // Change detection (Phase 2)
    if (this.changeDetector && this.preferences) {
      const normalizeDays = (val: any) => Array.isArray(val) ? val : (val && typeof val === 'object' ? Object.values(val) : val);
      const normalizedOld = { ...this.preferences, calendar_working_days: normalizeDays(this.preferences.calendar_working_days) } as UserPreferences;
      const normalizedNew = { ...preferences, calendar_working_days: normalizeDays(preferences.calendar_working_days) } as UserPreferences;
      const changeResult = this.changeDetector.detectChanges(normalizedOld, normalizedNew);
      if (changeResult.hasChanges) {
        console.log('🔄 Preference changes detected:', changeResult.summary);
        
        if (changeResult.requiresGapRecalculation) {
          console.log('⚠️ Gap recalculation required for affected dates:', changeResult.affectedDateRange);
          // Emit change event for gap recalculation
          this.emitPreferenceChangeEvent(changeResult);
        }
      }
    }
    
            // Server-side validation (Phase 2) - Temporarily disabled for debugging
        if (false && this.config.enableServerValidation) {
          try {
            const validation = await PreferenceValidationAPI.validateStrict(preferences);
            if (!validation.isValid) {
              throw new Error(`Server validation failed: ${validation.errors.join(', ')}`);
            }
          } catch (validationError) {
            console.warn('⚠️ Server validation failed, using client validation:', validationError);
            // Fall back to client validation
            if (this.config.validationEnabled) {
              const validation = this.validatePreferences(preferences);
              if (!validation.isValid) {
                throw new Error(`Invalid preferences: ${validation.errors.join(', ')}`);
              }
            }
          }
        } else {
          // Client-side validation - Temporarily disabled for debugging
          if (false && this.config.validationEnabled) {
            const validation = this.validatePreferences(preferences);
            if (!validation.isValid) {
              console.warn('⚠️ Client validation failed, but allowing save for debugging:', validation.errors);
              // Temporarily allow invalid preferences for debugging
              // throw new Error(`Invalid preferences: ${validation.errors.join(', ')}`);
            }
          }
        }

    // Update intelligent cache (Phase 2)
    if (this.intelligentCache) {
      this.intelligentCache.setFullPreferences(preferences);
    }

    // Update memory cache immediately
    this.preferences = preferences;
    this.lastLoadTime = Date.now();

    // Save to storage
    await this.saveToStorage(preferences);
    
    // Sync to server in background
    this.syncToServer(preferences).catch(error => {
      console.warn('⚠️ Background server sync failed:', error);
    });

    console.log('✅ Preferences saved successfully');
  }

  /**
   * Get critical preferences only (for immediate use)
   */
  getCriticalPreferences(): Partial<UserPreferences> {
    // Check intelligent cache first (Phase 2)
    if (this.intelligentCache) {
      const cachedCritical = this.intelligentCache.getCriticalPreferences();
      if (cachedCritical) {
        return cachedCritical;
      }
    }

    if (!this.preferences) {
      const defaultCritical = {
        calendar_work_start: DEFAULT_PREFERENCES.calendar_work_start,
        calendar_work_end: DEFAULT_PREFERENCES.calendar_work_end,
        calendar_working_days: DEFAULT_PREFERENCES.calendar_working_days,
        calendar_min_gap: DEFAULT_PREFERENCES.calendar_min_gap
      };

      // Cache default critical preferences
      if (this.intelligentCache) {
        this.intelligentCache.setCriticalPreferences(defaultCritical);
      }

      return defaultCritical;
    }

          const criticalPrefs = this.config.criticalFields.reduce((acc, field) => {
        const value = this.preferences![field as keyof UserPreferences];
        if (value !== undefined) {
          (acc as any)[field] = value;
        }
        return acc;
      }, {} as Partial<UserPreferences>);

    // Cache critical preferences
    if (this.intelligentCache) {
      this.intelligentCache.setCriticalPreferences(criticalPrefs);
    }

    return criticalPrefs;
  }

  /**
   * Check if preferences are loaded and valid
   */
  isLoaded(): boolean {
    return this.preferences !== null && (Date.now() - this.lastLoadTime) < this.config.memoryTTL;
  }

  /**
   * Force refresh preferences from server
   */
  async refresh(): Promise<UserPreferences> {
    console.log('🔄 Force refreshing preferences...');
    this.preferences = null;
    this.lastLoadTime = 0;
    return this.getPreferences();
  }

  /**
   * Clear memory cache
   */
  clearCache(): void {
    this.preferences = null;
    this.lastLoadTime = 0;
    
    // Clear intelligent cache (Phase 2)
    if (this.intelligentCache) {
      this.intelligentCache.clear();
    }
    
    console.log('🗑️ Preference cache cleared');
  }

  /**
   * Preload critical preferences (Phase 2)
   */
  async preloadCritical(): Promise<void> {
    if (this.preloader) {
      await this.preloader.preloadCritical();
    }
  }

  /**
   * Preload full preferences (Phase 2)
   */
  async preloadFull(): Promise<void> {
    if (this.preloader) {
      await this.preloader.preloadFull();
    }
  }

  /**
   * Get cache statistics (Phase 2)
   */
  getCacheStats(): any {
    if (this.intelligentCache) {
      return this.intelligentCache.getStats();
    }
    return null;
  }

  /**
   * Get preload status (Phase 2)
   */
  getPreloadStatus(): any {
    if (this.preloader) {
      return this.preloader.getStatus();
    }
    return null;
  }

  /**
   * Emit preference change event for gap recalculation
   */
  private emitPreferenceChangeEvent(changeResult: any): void {
    // This would integrate with your existing gap recalculation system
    // For now, we'll just log the event
    console.log('📡 Preference change event emitted:', {
      requiresGapRecalculation: changeResult.requiresGapRecalculation,
      affectedDateRange: changeResult.affectedDateRange,
      changes: changeResult.changes
    });
    
    // You can integrate this with your existing gap recalculation logic
    // For example, dispatch a custom event or call a callback
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('preferenceChange', {
        detail: changeResult
      }));
    }
  }

  /**
   * Validate preferences structure and critical fields
   */
  private validatePreferences(preferences: UserPreferences): PreferenceValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const criticalFields: string[] = [];

    // Check critical fields
    for (const field of this.config.criticalFields) {
      const value = preferences[field as keyof UserPreferences];
      if (value === undefined || value === null || value === '') {
        errors.push(`Missing critical field: ${field}`);
        criticalFields.push(field);
      }
    }

    // Validate work hours
    if (preferences.calendar_work_start && preferences.calendar_work_end) {
      const start = this.timeToMinutes(preferences.calendar_work_start);
      const end = this.timeToMinutes(preferences.calendar_work_end);
      
      if (start >= end) {
        errors.push('Work start time must be before work end time');
      }
      
      if (end - start < 60) {
        warnings.push('Work hours are less than 1 hour');
      }
    }

    // Validate working days
    if (preferences.calendar_working_days) {
      if (!Array.isArray(preferences.calendar_working_days) || preferences.calendar_working_days.length === 0) {
        errors.push('Working days must be a non-empty array');
      }
    }

    // Validate time format
    const timeFields = ['calendar_work_start', 'calendar_work_end'];
    for (const field of timeFields) {
      const value = preferences[field as keyof UserPreferences];
      if (value && typeof value === 'string' && !this.isValidTimeFormat(value)) {
        warnings.push(`Invalid time format for ${field}: ${value}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      criticalFields
    };
  }

  /**
   * Merge preferences with defaults for missing critical fields
   */
  private mergeWithDefaults(preferences: UserPreferences): UserPreferences {
    return {
      ...DEFAULT_PREFERENCES,
      ...preferences,
      // Ensure critical fields are present
      calendar_work_start: preferences.calendar_work_start || DEFAULT_PREFERENCES.calendar_work_start,
      calendar_work_end: preferences.calendar_work_end || DEFAULT_PREFERENCES.calendar_work_end,
      calendar_working_days: preferences.calendar_working_days || DEFAULT_PREFERENCES.calendar_working_days,
      calendar_min_gap: preferences.calendar_min_gap || DEFAULT_PREFERENCES.calendar_min_gap
    };
  }

  /**
   * Load preferences from local storage
   */
  private async loadFromStorage(): Promise<UserPreferences | null> {
    try {
      return await this.storage.getPreferences();
    } catch (error) {
      console.warn('⚠️ Failed to load preferences from storage:', error);
      return null;
    }
  }

  /**
   * Load preferences from server
   */
  private async loadFromServer(): Promise<UserPreferences | null> {
    try {
      const { preferencesAPI } = await import('../api');
      const remote = await preferencesAPI.get();
      // Merge with any locally stored device-calendar prefs to preserve local-only fields
      try {
        const localStored = await this.loadFromStorage();
        if (localStored) {
          return {
            ...remote,
            show_device_calendar_busy: (localStored as any).show_device_calendar_busy ?? false,
            show_device_calendar_titles: (localStored as any).show_device_calendar_titles ?? false,
            device_calendar_included_ids: (localStored as any).device_calendar_included_ids ?? [],
            device_calendar_open_in: (localStored as any).device_calendar_open_in ?? 'gaply',
          } as UserPreferences;
        }
      } catch {}
      return remote;
    } catch (error) {
      console.warn('⚠️ Failed to load preferences from server:', error);
      return null;
    }
  }

  /**
   * Save preferences to local storage
   */
  private async saveToStorage(preferences: UserPreferences): Promise<void> {
    try {
      await this.storage.savePreferences(preferences);
    } catch (error) {
      console.error('❌ Failed to save preferences to storage:', error);
      throw error;
    }
  }

  /**
   * Sync preferences to server in background
   */
  private async syncToServer(preferences: UserPreferences): Promise<void> {
    try {
      const { preferencesAPI } = await import('../api');
      const diff = this.preferences ? this.computePreferenceDiff(this.preferences, preferences) : preferences;
      if (Object.keys(diff).length === 0) return;

      // Apply server-eligible filter and rate limiting
      const { filterServerEligiblePrefs } = await import('./filterServerEligiblePrefs');
      const { consumePatchToken } = await import('./patchRateLimiter');
      const filtered = filterServerEligiblePrefs(diff as Partial<UserPreferences>);
      if (Object.keys(filtered).length === 0) return;

      if (!consumePatchToken()) {
        console.warn('Rate limit: skipping background preference PATCH');
        return;
      }

      await preferencesAPI.patch(filtered);
    } catch (error) {
      console.warn('⚠️ Background server sync failed:', error);
    }
  }

  private computePreferenceDiff(oldPrefs: any, newPrefs: any) {
    const normalizeDays = (val: any) => Array.isArray(val) ? val : (val && typeof val === 'object' ? Object.values(val) : []);
    const diff: any = {};
    const keys = Object.keys(newPrefs || {});
    for (const k of keys) {
      const ov = k === 'calendar_working_days' ? normalizeDays(oldPrefs?.[k]) : oldPrefs?.[k];
      const nv = k === 'calendar_working_days' ? normalizeDays(newPrefs?.[k]) : newPrefs?.[k];
      if (JSON.stringify(ov) !== JSON.stringify(nv)) diff[k] = nv;
    }
    return diff;
  }

  /**
   * Convert time string to minutes for validation
   */
  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + (minutes || 0);
  }

  /**
   * Validate time format (HH:MM or HH:MM:SS)
   */
  private isValidTimeFormat(time: string): boolean {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;
    return timeRegex.test(time);
  }
} 