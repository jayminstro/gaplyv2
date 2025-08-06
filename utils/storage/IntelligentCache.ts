import { UserPreferences } from '../../types/index';

export interface CacheStrategy {
  critical: {
    ttl: number;
    priority: 'high' | 'medium' | 'low';
    preload: boolean;
    maxSize: number;
  };
  nonCritical: {
    ttl: number;
    priority: 'high' | 'medium' | 'low';
    preload: boolean;
    maxSize: number;
  };
  validation: {
    ttl: number;
    priority: 'high' | 'medium' | 'low';
    preload: boolean;
    maxSize: number;
  };
}

export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  priority: 'high' | 'medium' | 'low';
  accessCount: number;
  lastAccess: number;
  size: number;
}

export interface CacheStats {
  totalEntries: number;
  totalSize: number;
  hitRate: number;
  missRate: number;
  evictions: number;
  averageAccessTime: number;
  memoryUsage: number;
}

export class IntelligentCache {
  private cache = new Map<string, CacheEntry>();
  private strategy: CacheStrategy;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    totalAccesses: 0
  };

  constructor(strategy?: Partial<CacheStrategy>) {
    this.strategy = {
      critical: {
        ttl: 24 * 60 * 60 * 1000, // 24 hours
        priority: 'high',
        preload: true,
        maxSize: 1024 * 1024 // 1MB
      },
      nonCritical: {
        ttl: 60 * 60 * 1000, // 1 hour
        priority: 'medium',
        preload: false,
        maxSize: 512 * 1024 // 512KB
      },
      validation: {
        ttl: 30 * 60 * 1000, // 30 minutes
        priority: 'low',
        preload: false,
        maxSize: 256 * 1024 // 256KB
      },
      ...strategy
    };
  }

  /**
   * Get data from cache with intelligent TTL
   */
  get<T>(key: string, _type: keyof CacheStrategy = 'nonCritical'): T | null {
    this.stats.totalAccesses++;
    const startTime = performance.now();

    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if entry is expired
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccess = now;

    this.stats.hits++;
    // const accessTime = performance.now() - startTime;

    return entry.data as T;
  }

  /**
   * Set data in cache with intelligent strategy
   */
  set<T>(
    key: string, 
    data: T, 
    type: keyof CacheStrategy = 'nonCritical',
    customTTL?: number
  ): void {
    const strategy = this.strategy[type];
    const dataSize = this.calculateSize(data);

    // Check if we need to evict entries
    this.ensureCapacity(type, dataSize);

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: customTTL || strategy.ttl,
      priority: strategy.priority,
      accessCount: 0,
      lastAccess: Date.now(),
      size: dataSize
    };

    this.cache.set(key, entry);
  }

  /**
   * Get critical preferences with high priority caching
   */
  getCriticalPreferences(): Partial<UserPreferences> | null {
    return this.get<Partial<UserPreferences>>('critical_preferences', 'critical');
  }

  /**
   * Set critical preferences with high priority caching
   */
  setCriticalPreferences(preferences: Partial<UserPreferences>): void {
    this.set('critical_preferences', preferences, 'critical');
  }

  /**
   * Get full preferences with medium priority caching
   */
  getFullPreferences(): UserPreferences | null {
    return this.get<UserPreferences>('full_preferences', 'nonCritical');
  }

  /**
   * Set full preferences with medium priority caching
   */
  setFullPreferences(preferences: UserPreferences): void {
    this.set('full_preferences', preferences, 'nonCritical');
  }

  /**
   * Get validation result with low priority caching
   */
  getValidationResult(key: string): any {
    return this.get(`validation_${key}`, 'validation');
  }

  /**
   * Set validation result with low priority caching
   */
  setValidationResult(key: string, result: any): void {
    this.set(`validation_${key}`, result, 'validation');
  }

  /**
   * Check if cache has valid entry
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    const now = Date.now();
    return now - entry.timestamp <= entry.ttl;
  }

  /**
   * Delete entry from cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.resetStats();
  }

  /**
   * Clear expired entries
   */
  clearExpired(): number {
    const now = Date.now();
    let cleared = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        cleared++;
      }
    }

    return cleared;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalEntries = this.cache.size;
    let totalSize = 0;
    let totalAccessTime = 0;

    for (const entry of this.cache.values()) {
      totalSize += entry.size;
      totalAccessTime += entry.accessCount;
    }

    const hitRate = this.stats.totalAccesses > 0 ? this.stats.hits / this.stats.totalAccesses : 0;
    const missRate = this.stats.totalAccesses > 0 ? this.stats.misses / this.stats.totalAccesses : 0;
    const averageAccessTime = totalEntries > 0 ? totalAccessTime / totalEntries : 0;

    return {
      totalEntries,
      totalSize,
      hitRate,
      missRate,
      evictions: this.stats.evictions,
      averageAccessTime,
      memoryUsage: this.getMemoryUsage()
    };
  }

  /**
   * Update cache strategy
   */
  updateStrategy(newStrategy: Partial<CacheStrategy>): void {
    this.strategy = { ...this.strategy, ...newStrategy };
  }

  /**
   * Get cache entries by type
   */
  getEntriesByType(type: keyof CacheStrategy): Array<{ key: string; entry: CacheEntry }> {
    const entries: Array<{ key: string; entry: CacheEntry }> = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.priority === this.strategy[type].priority) {
        entries.push({ key, entry });
      }
    }

    return entries;
  }

  /**
   * Ensure cache capacity for new entry
   */
  private ensureCapacity(type: keyof CacheStrategy, newEntrySize: number): void {
    const _strategy = this.strategy[type];
    const entries = this.getEntriesByType(type);
    
    let currentSize = 0;
    for (const { entry } of entries) {
      currentSize += entry.size;
    }

    // If adding this entry would exceed max size, evict some entries
    if (currentSize + newEntrySize > this.strategy[type].maxSize) {
      this.evictEntries(type, newEntrySize);
    }
  }

  /**
   * Evict entries based on LRU and priority
   */
  private evictEntries(type: keyof CacheStrategy, requiredSpace: number): void {
    const strategy = this.strategy[type];
    const entries = this.getEntriesByType(type);
    
    // Sort by last access time (LRU)
    entries.sort((a, b) => a.entry.lastAccess - b.entry.lastAccess);

    let freedSpace = 0;
    const entriesToEvict: string[] = [];

    for (const { key, entry } of entries) {
      if (freedSpace >= requiredSpace) break;
      
      entriesToEvict.push(key);
      freedSpace += entry.size;
    }

    // Evict entries
    for (const key of entriesToEvict) {
      this.cache.delete(key);
      this.stats.evictions++;
    }
  }

  /**
   * Calculate approximate size of data
   */
  private calculateSize(data: any): number {
    try {
      return new Blob([JSON.stringify(data)]).size;
    } catch {
      return 1024; // Default size if calculation fails
    }
  }

  /**
   * Get memory usage estimation
   */
  private getMemoryUsage(): number {
    let totalSize = 0;
    for (const entry of this.cache.values()) {
      totalSize += entry.size;
    }
    return totalSize;
  }

  /**
   * Reset statistics
   */
  private resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalAccesses: 0
    };
  }
} 