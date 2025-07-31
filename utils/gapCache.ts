import { LocalTimeGap } from './database/schema';

export interface GapCacheConfig {
  maxSize: number;
  ttl: number; // Time to live in milliseconds
  enableCompression: boolean;
}

export interface CachedGapData {
  gaps: LocalTimeGap[];
  metadata: {
    created: string;
    lastAccessed: string;
    accessCount: number;
    size: number;
  };
}

export class GapCache {
  private cache = new Map<string, CachedGapData>();
  private config: GapCacheConfig;

  constructor(config: Partial<GapCacheConfig> = {}) {
    this.config = {
      maxSize: config.maxSize ?? 1000,
      ttl: config.ttl ?? 5 * 60 * 1000, // 5 minutes
      enableCompression: config.enableCompression ?? false
    };
  }

  // Set gap data in cache
  set(key: string, gaps: LocalTimeGap[]): void {
    // Check if we need to evict items
    if (this.cache.size >= this.config.maxSize) {
      this.evictLeastUsed();
    }

    const data: CachedGapData = {
      gaps: this.config.enableCompression ? this.compressGaps(gaps) : gaps,
      metadata: {
        created: new Date().toISOString(),
        lastAccessed: new Date().toISOString(),
        accessCount: 0,
        size: this.calculateSize(gaps)
      }
    };

    this.cache.set(key, data);
  }

  // Get gap data from cache
  get(key: string): LocalTimeGap[] | null {
    const data = this.cache.get(key);
    
    if (!data) return null;

    // Check TTL
    const age = Date.now() - new Date(data.metadata.created).getTime();
    if (age > this.config.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Update access metadata
    data.metadata.lastAccessed = new Date().toISOString();
    data.metadata.accessCount++;

    return this.config.enableCompression ? this.decompressGaps(data.gaps) : data.gaps;
  }

  // Check if key exists and is valid
  has(key: string): boolean {
    const data = this.cache.get(key);
    if (!data) return false;

    const age = Date.now() - new Date(data.metadata.created).getTime();
    if (age > this.config.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  // Remove item from cache
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  // Clear all cache
  clear(): void {
    this.cache.clear();
  }

  // Get cache statistics
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    totalAccesses: number;
    averageSize: number;
  } {
    let totalAccesses = 0;
    let totalSize = 0;

    for (const data of this.cache.values()) {
      totalAccesses += data.metadata.accessCount;
      totalSize += data.metadata.size;
    }

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hitRate: totalAccesses > 0 ? totalAccesses / this.cache.size : 0,
      totalAccesses,
      averageSize: this.cache.size > 0 ? totalSize / this.cache.size : 0
    };
  }

  // Evict least used items
  private evictLeastUsed(): void {
    const entries = Array.from(this.cache.entries());
    
    // Sort by access count and last accessed time
    entries.sort((a, b) => {
      const aScore = a[1].metadata.accessCount + 
        (Date.now() - new Date(a[1].metadata.lastAccessed).getTime()) / 1000;
      const bScore = b[1].metadata.accessCount + 
        (Date.now() - new Date(b[1].metadata.lastAccessed).getTime()) / 1000;
      
      return aScore - bScore;
    });

    // Remove 10% of items
    const toRemove = Math.ceil(this.cache.size * 0.1);
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0]);
    }
  }

  // Calculate size of gap data
  private calculateSize(gaps: LocalTimeGap[]): number {
    return JSON.stringify(gaps).length;
  }

  // Simple compression (remove unnecessary fields for cache)
  private compressGaps(gaps: LocalTimeGap[]): any[] {
    return gaps.map(gap => ({
      id: gap.id,
      date: gap.date,
      start_time: gap.start_time,
      end_time: gap.end_time,
      duration: gap.duration,
      is_available: gap.is_available,
      gap_source_id: gap.gap_source_id,
      modified_by: gap.modified_by
    }));
  }

  // Decompress gaps (restore full structure)
  private decompressGaps(compressed: any[]): LocalTimeGap[] {
    return compressed.map(gap => ({
      ...gap,
      user_id: gap.user_id,
      duration_minutes: gap.duration,
      next_event_title: gap.next_event_title,
      source: gap.source,
      quality_score: gap.quality_score,
      created_at: gap.created_at,
      synced_at: gap.synced_at,
      last_validated_at: gap.last_validated_at,
      created_by_user_id: gap.created_by_user_id,
      last_modified_at: gap.last_modified_at,
      origin_gap_id: gap.origin_gap_id,
      is_synced: false,
      sync_version: 1,
      local_updated_at: new Date().toISOString()
    }));
  }

  // Preload gaps for date range
  async preloadGaps(
    userId: string,
    startDate: string,
    endDate: string,
    loader: (date: string) => Promise<LocalTimeGap[]>
  ): Promise<void> {
    const dates = this.generateDateRange(startDate, endDate);
    
    // Load gaps for each date in parallel (with concurrency limit)
    const concurrency = 3;
    for (let i = 0; i < dates.length; i += concurrency) {
      const batch = dates.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async (date) => {
          const key = `${userId}_${date}`;
          if (!this.has(key)) {
            try {
              const gaps = await loader(date);
              this.set(key, gaps);
            } catch (error) {
              console.error(`Failed to preload gaps for ${date}:`, error);
            }
          }
        })
      );
    }
  }

  // Generate date range
  private generateDateRange(startDate: string, endDate: string): string[] {
    const dates: string[] = [];
    const current = new Date(startDate);
    const end = new Date(endDate);

    while (current <= end) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }

    return dates;
  }
} 