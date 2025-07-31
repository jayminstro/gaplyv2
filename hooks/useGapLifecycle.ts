import { useState, useEffect, useCallback } from 'react';
import { GapLifecycleManager } from '../utils/gapLifecycle';
import { GapCache } from '../utils/gapCache';
import { LocalTimeGap, LocalUserPreferences } from '../utils/database/schema';
import { DatabaseManager } from '../utils/database/DatabaseManager';

export interface UseGapLifecycleOptions {
  enableCache?: boolean;
  enableBackgroundCalculation?: boolean;
  enableAutoCleanup?: boolean;
  cacheConfig?: {
    maxSize?: number;
    ttl?: number;
    enableCompression?: boolean;
  };
}

export interface GapLifecycleState {
  isCalculating: boolean;
  lastCalculated: string | null;
  cacheStats: any;
  errors: string[];
}

export function useGapLifecycle(
  dbManager: DatabaseManager,
  userId: string,
  options: UseGapLifecycleOptions = {}
): {
  calculateGaps: (date: string, preferences: LocalUserPreferences) => Promise<LocalTimeGap[]>;
  getGaps: (date: string) => Promise<LocalTimeGap[]>;
  state: GapLifecycleState;
  lifecycleManager: GapLifecycleManager;
  cache: GapCache;
} {
  const [state, setState] = useState<GapLifecycleState>({
    isCalculating: false,
    lastCalculated: null,
    cacheStats: {},
    errors: []
  });

  const [lifecycleManager] = useState(() => new GapLifecycleManager(dbManager));
  const [cache] = useState(() => new GapCache(options.cacheConfig));

  // Initialize background processes
  useEffect(() => {
    if (options.enableBackgroundCalculation) {
      const interval = setInterval(() => {
        lifecycleManager.startBackgroundCalculation();
      }, 5 * 60 * 1000); // Every 5 minutes

      return () => clearInterval(interval);
    }
  }, [options.enableBackgroundCalculation, lifecycleManager]);

  // Auto cleanup
  useEffect(() => {
    if (options.enableAutoCleanup) {
      const interval = setInterval(() => {
        lifecycleManager.cleanupExpiredGaps();
      }, 60 * 60 * 1000); // Every hour

      return () => clearInterval(interval);
    }
  }, [options.enableAutoCleanup, lifecycleManager]);

  // Calculate gaps for a specific date
  const calculateGaps = useCallback(async (
    date: string,
    preferences: LocalUserPreferences
  ): Promise<LocalTimeGap[]> => {
    setState(prev => ({ ...prev, isCalculating: true, errors: [] }));

    try {
      const result = await lifecycleManager.calculateGapsForDate(
        date,
        userId,
        preferences,
        false
      );

      if (result.errors.length > 0) {
        setState(prev => ({ 
          ...prev, 
          errors: [...prev.errors, ...result.errors] 
        }));
      }

      setState(prev => ({
        ...prev,
        isCalculating: false,
        lastCalculated: new Date().toISOString(),
        cacheStats: cache.getStats()
      }));

      return result.gaps;
    } catch (error) {
      setState(prev => ({
        ...prev,
        isCalculating: false,
        errors: [...prev.errors, error instanceof Error ? error.message : 'Unknown error']
      }));
      throw error;
    }
  }, [lifecycleManager, userId, cache]);

  // Get gaps for a specific date (with caching)
  const getGaps = useCallback(async (date: string): Promise<LocalTimeGap[]> => {
    const cacheKey = `${userId}_${date}`;

    // Check cache first
    if (options.enableCache) {
      const cached = cache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Get from database
    const gaps = await dbManager.gaps.getByDate(userId, date);
    
    // Cache the result
    if (options.enableCache) {
      cache.set(cacheKey, gaps);
    }

    return gaps;
  }, [dbManager, userId, cache, options.enableCache]);

  // Update cache stats periodically
  useEffect(() => {
    if (options.enableCache) {
      const interval = setInterval(() => {
        setState(prev => ({
          ...prev,
          cacheStats: cache.getStats()
        }));
      }, 10000); // Every 10 seconds

      return () => clearInterval(interval);
    }
  }, [options.enableCache, cache]);

  return {
    calculateGaps,
    getGaps,
    state,
    lifecycleManager,
    cache
  };
} 