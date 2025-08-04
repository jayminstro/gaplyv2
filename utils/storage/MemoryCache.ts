export interface CacheItem<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

export interface MemoryCacheConfig {
  maxSize: number;
  defaultTTL: number; // milliseconds
  enableStats: boolean;
  evictionPolicy: 'lru' | 'lfu' | 'fifo';
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: number;
  averageAccessTime: number;
}

export class MemoryCache {
  private cache = new Map<string, CacheItem>();
  private config: MemoryCacheConfig;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    totalAccessTime: 0,
    accessCount: 0
  };

  constructor(config: Partial<MemoryCacheConfig> = {}) {
    this.config = {
      maxSize: 100,
      defaultTTL: 5 * 60 * 1000, // 5 minutes
      enableStats: true,
      evictionPolicy: 'lru',
      ...config
    };
  }

  /**
   * Set a value in the cache
   */
  set<T>(key: string, data: T, ttl?: number): void {
    const startTime = performance.now();
    
    // Check if we need to evict items
    if (this.cache.size >= this.config.maxSize) {
      this.evictItems();
    }

    const item: CacheItem<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.config.defaultTTL,
      accessCount: 0,
      lastAccessed: Date.now()
    };

    this.cache.set(key, item);
    
    if (this.config.enableStats) {
      this.stats.totalAccessTime += performance.now() - startTime;
      this.stats.accessCount++;
    }
  }

  /**
   * Get a value from the cache
   */
  get<T>(key: string): T | null {
    const startTime = performance.now();
    
    const item = this.cache.get(key);
    
    if (!item) {
      if (this.config.enableStats) {
        this.stats.misses++;
        this.stats.totalAccessTime += performance.now() - startTime;
        this.stats.accessCount++;
      }
      return null;
    }

    // Check if item has expired
    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      if (this.config.enableStats) {
        this.stats.misses++;
        this.stats.totalAccessTime += performance.now() - startTime;
        this.stats.accessCount++;
      }
      return null;
    }

    // Update access statistics
    item.accessCount++;
    item.lastAccessed = Date.now();

    if (this.config.enableStats) {
      this.stats.hits++;
      this.stats.totalAccessTime += performance.now() - startTime;
      this.stats.accessCount++;
    }

    return item.data;
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    const item = this.cache.get(key);
    if (!item) return false;
    
    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Delete a specific key
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cached items
   */
  clear(): void {
    this.cache.clear();
    if (this.config.enableStats) {
      this.stats.evictions += this.cache.size;
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;
    const averageAccessTime = this.stats.accessCount > 0 
      ? this.stats.totalAccessTime / this.stats.accessCount 
      : 0;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      size: this.cache.size,
      hitRate,
      averageAccessTime
    };
  }

  /**
   * Get all keys in the cache
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Evict items based on the configured policy
   */
  private evictItems(): void {
    const itemsToEvict = Math.ceil(this.config.maxSize * 0.1); // Evict 10% of max size
    
    switch (this.config.evictionPolicy) {
      case 'lru':
        this.evictLRU(itemsToEvict);
        break;
      case 'lfu':
        this.evictLFU(itemsToEvict);
        break;
      case 'fifo':
        this.evictFIFO(itemsToEvict);
        break;
    }
  }

  /**
   * Evict least recently used items
   */
  private evictLRU(count: number): void {
    const items = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed)
      .slice(0, count);

    items.forEach(([key]) => {
      this.cache.delete(key);
    });

    if (this.config.enableStats) {
      this.stats.evictions += items.length;
    }
  }

  /**
   * Evict least frequently used items
   */
  private evictLFU(count: number): void {
    const items = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.accessCount - b.accessCount)
      .slice(0, count);

    items.forEach(([key]) => {
      this.cache.delete(key);
    });

    if (this.config.enableStats) {
      this.stats.evictions += items.length;
    }
  }

  /**
   * Evict first in, first out items
   */
  private evictFIFO(count: number): void {
    const items = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.timestamp - b.timestamp)
      .slice(0, count);

    items.forEach(([key]) => {
      this.cache.delete(key);
    });

    if (this.config.enableStats) {
      this.stats.evictions += items.length;
    }
  }

  /**
   * Clean up expired items
   */
  cleanup(): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > item.ttl) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<MemoryCacheConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): MemoryCacheConfig {
    return { ...this.config };
  }
} 