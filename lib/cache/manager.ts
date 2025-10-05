/**
 * Multi-Tier Caching System
 *
 * Implements L1 (in-memory), L2 (Redis), and L3 (database buffer) caching
 * with automatic invalidation and performance monitoring.
 */

export interface CacheEntry {
  data: any;
  expiresAt: number;
  hits: number;
  createdAt: number;
}

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  maxSize?: number;
  tags?: string[];
}

export interface CacheMetrics {
  l1Hits: number;
  l1Misses: number;
  l2Hits: number;
  l2Misses: number;
  l3Hits: number;
  l3Misses: number;
  totalRequests: number;
  hitRate: number;
  memoryUsage: number;
}

/**
 * L1 Cache: In-memory cache with LRU eviction
 */
export class L1Cache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;
  private defaultTTL: number;
  private metrics = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };

  constructor(options: { maxSize?: number; defaultTTL?: number } = {}) {
    this.maxSize = options.maxSize || 1000;
    this.defaultTTL = options.defaultTTL || 60; // 1 minute
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.metrics.misses++;
      return null;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.metrics.misses++;
      return null;
    }

    // Update hit count and move to end (LRU)
    entry.hits++;
    this.cache.delete(key);
    this.cache.set(key, entry);
    this.metrics.hits++;

    return entry.data;
  }

  set(key: string, data: any, options: CacheOptions = {}): void {
    const ttl = options.ttl || this.defaultTTL;
    const maxSize = options.maxSize || this.maxSize;

    // Evict if necessary
    while (this.cache.size >= maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      this.metrics.evictions++;
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttl * 1000,
      hits: 0,
      createdAt: Date.now(),
    });
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.metrics = { hits: 0, misses: 0, evictions: 0 };
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    return entry && Date.now() <= entry.expiresAt;
  }

  size(): number {
    return this.cache.size;
  }

  getMetrics() {
    return {
      ...this.metrics,
      hitRate: this.metrics.hits / (this.metrics.hits + this.metrics.misses) || 0,
      size: this.cache.size,
      memoryUsage: this.estimateMemoryUsage(),
    };
  }

  private estimateMemoryUsage(): number {
    // Rough estimation in bytes
    let size = 0;
    for (const [key, entry] of this.cache.entries()) {
      size += key.length * 2; // UTF-16
      size += JSON.stringify(entry.data).length * 2;
      size += 64; // Overhead
    }
    return size;
  }

  // Clean expired entries
  cleanup(): number {
    let cleaned = 0;
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }
}

/**
 * L2 Cache: Redis implementation
 */
export class L2Cache {
  private redis: RedisClient;
  private defaultTTL: number;
  private keyPrefix: string;
  private metrics = {
    hits: 0,
    misses: 0,
    errors: 0,
  };

  constructor(redis: RedisClient, options: { keyPrefix?: string; defaultTTL?: number } = {}) {
    this.redis = redis;
    this.keyPrefix = options.keyPrefix || 'infidao:';
    this.defaultTTL = options.defaultTTL || 1800; // 30 minutes
  }

  async get(key: string): Promise<any | null> {
    try {
      const fullKey = this.keyPrefix + key;
      const data = await this.redis.get(fullKey);

      if (data) {
        this.metrics.hits++;
        return JSON.parse(data);
      }

      this.metrics.misses++;
      return null;
    } catch (error) {
      this.metrics.errors++;
      console.error('L2Cache get error:', error);
      return null;
    }
  }

  async set(key: string, data: any, options: CacheOptions = {}): Promise<void> {
    try {
      const fullKey = this.keyPrefix + key;
      const ttl = options.ttl || this.defaultTTL;
      const serialized = JSON.stringify(data);

      if (ttl > 0) {
        await this.redis.setex(fullKey, ttl, serialized);
      } else {
        await this.redis.set(fullKey, serialized);
      }
    } catch (error) {
      this.metrics.errors++;
      console.error('L2Cache set error:', error);
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const fullKey = this.keyPrefix + key;
      const result = await this.redis.del(fullKey);
      return result > 0;
    } catch (error) {
      this.metrics.errors++;
      console.error('L2Cache delete error:', error);
      return false;
    }
  }

  async clear(pattern?: string): Promise<number> {
    try {
      const scanPattern = pattern ? this.keyPrefix + pattern : this.keyPrefix + '*';
      const keys = await this.redis.keys(scanPattern);

      if (keys.length > 0) {
        return await this.redis.del(...keys);
      }
      return 0;
    } catch (error) {
      this.metrics.errors++;
      console.error('L2Cache clear error:', error);
      return 0;
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      const fullKey = this.keyPrefix + key;
      const result = await this.redis.exists(fullKey);
      return result === 1;
    } catch (error) {
      this.metrics.errors++;
      console.error('L2Cache has error:', error);
      return false;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      const fullKey = this.keyPrefix + key;
      return await this.redis.ttl(fullKey);
    } catch (error) {
      this.metrics.errors++;
      console.error('L2Cache ttl error:', error);
      return -1;
    }
  }

  getMetrics() {
    return {
      ...this.metrics,
      hitRate: this.metrics.hits / (this.metrics.hits + this.metrics.misses) || 0,
    };
  }
}

/**
 * Cache Manager: Coordinates L1 and L2 caches
 */
export class CacheManager {
  constructor(
    private l1: L1Cache,
    private l2?: L2Cache,
    private l3?: Database // Database buffer pool is managed by DB
  ) {}

  async get(key: string): Promise<any | null> {
    // Try L1 first
    let result = this.l1.get(key);
    if (result !== null) {
      return result;
    }

    // Try L2 if available
    if (this.l2) {
      result = await this.l2.get(key);
      if (result !== null) {
        // Promote to L1
        this.l1.set(key, result);
        return result;
      }
    }

    // L3 (database) would be handled by the calling code
    return null;
  }

  async set(key: string, data: any, options: CacheOptions = {}): Promise<void> {
    // Always set in L1
    this.l1.set(key, data, options);

    // Set in L2 if available
    if (this.l2) {
      await this.l2.set(key, data, options);
    }
  }

  async delete(key: string): Promise<void> {
    // Delete from all levels
    this.l1.delete(key);
    if (this.l2) {
      await this.l2.delete(key);
    }
  }

  async clear(pattern?: string): Promise<void> {
    this.l1.clear();
    if (this.l2) {
      await this.l2.clear(pattern);
    }
  }

  getMetrics(): CacheMetrics {
    const l1Metrics = this.l1.getMetrics();
    const l2Metrics = this.l2?.getMetrics() || { hits: 0, misses: 0 };

    const totalHits = l1Metrics.hits + l2Metrics.hits;
    const totalMisses = l1Metrics.misses + l2Metrics.misses;
    const totalRequests = totalHits + totalMisses;

    return {
      l1Hits: l1Metrics.hits,
      l1Misses: l1Metrics.misses,
      l2Hits: l2Metrics.hits,
      l2Misses: l2Metrics.misses,
      l3Hits: 0, // Tracked by database
      l3Misses: 0,
      totalRequests,
      hitRate: totalHits / totalRequests || 0,
      memoryUsage: l1Metrics.memoryUsage,
    };
  }

  // Warm up cache with common data
  async warmUp(keys: string[], dataLoader: (key: string) => Promise<any>): Promise<void> {
    const promises = keys.map(async key => {
      const data = await dataLoader(key);
      await this.set(key, data, { ttl: 3600 }); // 1 hour
    });

    await Promise.all(promises);
    console.log(`Warmed up ${keys.length} cache entries`);
  }

  // Invalidate cache by tags
  async invalidateByTag(tag: string): Promise<void> {
    // Implementation depends on tag storage strategy
    // For now, just clear all
    await this.clear();
  }
}

// Redis client interface
interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  setex(key: string, seconds: number, value: string): Promise<void>;
  del(...keys: string[]): Promise<number>;
  exists(key: string): Promise<number>;
  ttl(key: string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
}

// Database interface for L3 cache
interface Database {
  getFromBuffer(key: string): Promise<any>;
  setInBuffer(key: string, data: any): Promise<void>;
}

// Factory function for easy setup
export function createCacheManager(options: {
  l1?: { maxSize?: number; defaultTTL?: number };
  l2?: { redis: RedisClient; keyPrefix?: string; defaultTTL?: number };
}): CacheManager {
  const l1 = new L1Cache(options.l1);
  const l2 = options.l2 ? new L2Cache(options.l2.redis, options.l2) : undefined;

  return new CacheManager(l1, l2);
}