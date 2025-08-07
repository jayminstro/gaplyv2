import { useState, useEffect, useCallback, useRef } from 'react';
import { UserPreferences } from '../types/index';
import { PreferenceManager } from '../utils/storage/PreferenceManager';
import { DEFAULT_PREFERENCES } from '../utils/constants';

export interface UsePreferencesOptions {
  loadOnMount?: boolean;
  criticalOnly?: boolean;
  refreshInterval?: number; // Auto-refresh interval in ms
  onError?: (error: Error) => void;
  enablePreloading?: boolean;
  enableChangeDetection?: boolean;
  onPreferenceChange?: (changeResult: any) => void;
}

export interface UsePreferencesReturn {
  preferences: UserPreferences | null;
  criticalPreferences: Partial<UserPreferences>;
  isLoading: boolean;
  error: Error | null;
  isLoaded: boolean;
  refresh: () => Promise<void>;
  updatePreferences: (newPreferences: Partial<UserPreferences>) => Promise<void>;
  savePreferences: (preferences: UserPreferences) => Promise<void>;
  clearCache: () => void;
  // Phase 2 additions
  preloadCritical: () => Promise<void>;
  preloadFull: () => Promise<void>;
  getCacheStats: () => any;
  getPreloadStatus: () => any;
}

export function usePreferences(
  storage: any,
  options: UsePreferencesOptions = {}
): UsePreferencesReturn {
  const {
    loadOnMount = true,
    criticalOnly = false,
    refreshInterval,
    onError,
    enablePreloading = true,
    enableChangeDetection = true,
    onPreferenceChange
  } = options;

  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const preferenceManagerRef = useRef<PreferenceManager | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize preference manager
  useEffect(() => {
    if (storage && !preferenceManagerRef.current) {
      preferenceManagerRef.current = PreferenceManager.getInstance(storage, {
        memoryTTL: 24 * 60 * 60 * 1000, // 24 hours
        validationEnabled: true,
        criticalFields: [
          'calendar_work_start',
          'calendar_work_end',
          'calendar_working_days',
          'calendar_min_gap'
        ],
        defaultFallback: true,
        enablePreloading,
        enableIntelligentCache: true,
        enableChangeDetection,
        enableServerValidation: true
      });
    }
  }, [storage, enablePreloading, enableChangeDetection]);

  // Load preferences on mount
  useEffect(() => {
    if (loadOnMount && preferenceManagerRef.current) {
      loadPreferences();
    }
  }, [loadOnMount]);

  // Listen for preference change events (Phase 2)
  useEffect(() => {
    if (!enableChangeDetection || !onPreferenceChange) return;

    const handlePreferenceChange = (event: CustomEvent) => {
      onPreferenceChange(event.detail);
    };

    window.addEventListener('preferenceChange', handlePreferenceChange as EventListener);

    return () => {
      window.removeEventListener('preferenceChange', handlePreferenceChange as EventListener);
    };
  }, [enableChangeDetection, onPreferenceChange]);

  // Set up auto-refresh interval
  useEffect(() => {
    if (refreshInterval && refreshInterval > 0) {
      refreshIntervalRef.current = setInterval(() => {
        if (preferenceManagerRef.current?.isLoaded()) {
          refresh();
        }
      }, refreshInterval);
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [refreshInterval]);

  const loadPreferences = useCallback(async () => {
    if (!preferenceManagerRef.current) return;

    setIsLoading(true);
    setError(null);

    try {
      const prefs = await preferenceManagerRef.current.getPreferences();
      setPreferences(prefs);
      setIsLoaded(true);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load preferences');
      setError(error);
      onError?.(error);
    } finally {
      setIsLoading(false);
    }
  }, [onError]);

  const refresh = useCallback(async () => {
    if (!preferenceManagerRef.current) return;

    setIsLoading(true);
    setError(null);

    try {
      const prefs = await preferenceManagerRef.current.refresh();
      setPreferences(prefs);
      setIsLoaded(true);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to refresh preferences');
      setError(error);
      onError?.(error);
    } finally {
      setIsLoading(false);
    }
  }, [onError]);

  const updatePreferences = useCallback(async (newPreferences: Partial<UserPreferences>) => {
    if (!preferenceManagerRef.current || !preferences) return;

    setIsLoading(true);
    setError(null);

    try {
      const updatedPreferences = { ...preferences, ...newPreferences };
      await preferenceManagerRef.current.savePreferences(updatedPreferences);
      setPreferences(updatedPreferences);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to update preferences');
      setError(error);
      onError?.(error);
    } finally {
      setIsLoading(false);
    }
  }, [preferences, onError]);

  const savePreferences = useCallback(async (newPreferences: UserPreferences) => {
    if (!preferenceManagerRef.current) return;

    setIsLoading(true);
    setError(null);

    try {
      await preferenceManagerRef.current.savePreferences(newPreferences);
      setPreferences(newPreferences);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to save preferences');
      setError(error);
      onError?.(error);
    } finally {
      setIsLoading(false);
    }
  }, [onError]);

  const clearCache = useCallback(() => {
    preferenceManagerRef.current?.clearCache();
    setPreferences(null);
    setIsLoaded(false);
  }, []);

  // Phase 2 methods
  const preloadCritical = useCallback(async () => {
    if (preferenceManagerRef.current) {
      await preferenceManagerRef.current.preloadCritical();
    }
  }, []);

  const preloadFull = useCallback(async () => {
    if (preferenceManagerRef.current) {
      await preferenceManagerRef.current.preloadFull();
    }
  }, []);

  const getCacheStats = useCallback(() => {
    return preferenceManagerRef.current?.getCacheStats() || null;
  }, []);

  const getPreloadStatus = useCallback(() => {
    return preferenceManagerRef.current?.getPreloadStatus() || null;
  }, []);

  // Get critical preferences for immediate use
  const criticalPreferences = preferences ? 
    preferenceManagerRef.current?.getCriticalPreferences() || {
      calendar_work_start: DEFAULT_PREFERENCES.calendar_work_start,
      calendar_work_end: DEFAULT_PREFERENCES.calendar_work_end,
      calendar_working_days: DEFAULT_PREFERENCES.calendar_working_days,
      calendar_min_gap: DEFAULT_PREFERENCES.calendar_min_gap
    } : {
      calendar_work_start: DEFAULT_PREFERENCES.calendar_work_start,
      calendar_work_end: DEFAULT_PREFERENCES.calendar_work_end,
      calendar_working_days: DEFAULT_PREFERENCES.calendar_working_days,
      calendar_min_gap: DEFAULT_PREFERENCES.calendar_min_gap
    };

  return {
    preferences: criticalOnly ? null : preferences,
    criticalPreferences,
    isLoading,
    error,
    isLoaded,
    refresh,
    updatePreferences,
    savePreferences,
    clearCache,
    // Phase 2 additions
    preloadCritical,
    preloadFull,
    getCacheStats,
    getPreloadStatus
  };
}

// Specialized hook for critical preferences only
export function useCriticalPreferences(storage: any): Partial<UserPreferences> {
  const { criticalPreferences } = usePreferences(storage, { 
    loadOnMount: true, 
    criticalOnly: true 
  });
  return criticalPreferences;
}

// Hook for preference validation
export function usePreferenceValidation(preferences: UserPreferences | null) {
  const [validation, setValidation] = useState<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }>({
    isValid: true,
    errors: [],
    warnings: []
  });

  useEffect(() => {
    if (!preferences) {
      setValidation({ isValid: false, errors: ['No preferences provided'], warnings: [] });
      return;
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate critical fields
    const criticalFields = [
      'calendar_work_start',
      'calendar_work_end',
      'calendar_working_days',
      'calendar_min_gap'
    ];

    for (const field of criticalFields) {
      const value = preferences[field as keyof UserPreferences];
      if (value === undefined || value === null || value === '') {
        errors.push(`Missing critical field: ${field}`);
      }
    }

    // Validate work hours
    if (preferences.calendar_work_start && preferences.calendar_work_end) {
      const start = timeToMinutes(preferences.calendar_work_start);
      const end = timeToMinutes(preferences.calendar_work_end);
      
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

    setValidation({
      isValid: errors.length === 0,
      errors,
      warnings
    });
  }, [preferences]);

  return validation;
}

// Helper function for time validation
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + (minutes || 0);
} 