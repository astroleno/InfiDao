/**
 * Multi-Level Cache Manager
 *
 * Implements L1 (in-memory) and L2 (Redis) caching
 * with TTL support and cache invalidation strategies.
 */

import { cacheConfig } from '@/lib/config';
import type { CacheConfig } from '@/types';

// Cache entry interface
interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
  hits: number;
}

// L1 Cache (in-memory)
export class L1Cache<T = any> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;
  private defaultTTL: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(maxSize: number, defaultTTL: number) {
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
    this.startCleanup();
  }

  // Get value from cache
  get(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return null;
    }

    // Update hit count
    entry.hits++;
    return entry.value;
  }

  // Set value in cache
  set(key: string, value: T, ttl?: number): void {
    // Check cache size limit
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    const entry: CacheEntry<T> = {
      value,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
      hits: 0,
    };

    this.cache.set(key, entry);
  }

  // Delete key from cache
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  // Clear all cache
  clear(): void {
    this.cache.clear();
  }

  // Check if key exists
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  // Get cache size
  size(): number {
    return this.cache.size;
  }

  // Get cache statistics
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    entries: Array<{
      key: string;
      hits: number;
      age: number;
      ttl: number;
    }>;
  } {
    let totalHits = 0;
    const entries: Array<{
      key: string;
      hits: number;
      age: number;
      ttl: number;
    }> = [];

    for (const [key, entry] of this.cache.entries()) {
      if (!this.isExpired(entry)) {
        totalHits += entry.hits;
        entries.push({
          key,
          hits: entry.hits,
          age: Date.now() - entry.timestamp,
          ttl: entry.ttl,
        });
      }
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: totalHits > 0 ? totalHits / (totalHits + 1) : 0,
      entries: entries.sort((a, b) => b.hits - a.hits),
    };
  }

  // Evict least recently used entry
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  // Check if entry is expired
  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.timestamp > entry.ttl * 1000;
  }

  // Start cleanup interval
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Cleanup every minute
  }

  // Cleanup expired entries
  private cleanup(): void {
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
      }
    }
  }

  // Stop cleanup interval
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }
}

// L2 Cache (Redis)
export class L2Cache<T = any> {
  private redis: any; // Redis client
  private keyPrefix: string;
  private defaultTTL: number;
  private isConnected = false;

  constructor(config: CacheConfig['l2']) {
    if (!config) {
      throw new Error('L2 cache configuration is required');
    }

    this.keyPrefix = config.keyPrefix;
    this.defaultTTL = config.defaultTTL;

    // Initialize Redis client
    this.initializeRedis(config.redis);
  }

  private async initializeRedis(config: any): Promise<void> {
    try {
      // Dynamic import to avoid SSR issues
      const Redis = await import('redis');

      if (config.url) {
        this.redis = Redis.createClient({ url: config.url });
      } else {
        this.redis = Redis.createClient({
          host: config.host,
          port: config.port,
          password: config.password,
          db: config.db,
        });
      }

      this.redis.on('error', (err: any) => {
        console.error('Redis error:', err);
        this.isConnected = false;
      });

      this.redis.on('connect', () => {
        console.log('Redis connected');
        this.isConnected = true;
      });

      await this.redis.connect();
    } catch (error) {
      console.error('Failed to initialize Redis:', error);
      this.redis = null;
      this.isConnected = false;
    }
  }

  // Get value from Redis
  async get(key: string): Promise<T | null> {
    if (!this.redis || !this.isConnected) {
      return null;
    }

    try {
      const value = await this.redis.get(this.keyPrefix + key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Redis get error:', error);
      return null;
    }
  }

  // Set value in Redis
  async set(key: string, value: T, ttl?: number): Promise<void> {
    if (!this.redis || !this.isConnected) {
      return;
    }

    try {
      const serialized = JSON.stringify(value);
      const expiry = ttl || this.defaultTTL;
      await this.redis.setEx(this.keyPrefix + key, expiry, serialized);
    } catch (error) {
      console.error('Redis set error:', error);
    }
  }

  // Delete key from Redis
  async delete(key: string): Promise<boolean> {
    if (!this.redis || !this.isConnected) {
      return false;
    }

    try {
      const result = await this.redis.del(this.keyPrefix + key);
      return result > 0;
    } catch (error) {
      console.error('Redis delete error:', error);
      return false;
    }
  }

  // Clear all keys with prefix
  async clear(): Promise<void> {
    if (!this.redis || !this.isConnected) {
      return;
    }

    try {
      const keys = await this.redis.keys(this.keyPrefix + '*');
      if (keys.length > 0) {
        await this.redis.del(keys);
      }
    } catch (error) {
      console.error('Redis clear error:', error);
    }
  }

  // Check if key exists
  async has(key: string): Promise<boolean> {
    if (!this.redis || !this.isConnected) {
      return false;
    }

    try {
      const result = await this.redis.exists(this.keyPrefix + key);
      return result === 1;
    } catch (error) {
      console.error('Redis exists error:', error);
      return false;
    }
  }

  // Get Redis statistics
  async getStats(): Promise<{
    connected: boolean;
    keys: number;
    memory: string;
  }> {
    if (!this.redis || !this.isConnected) {
      return {
        connected: false,
        keys: 0,
        memory: '0B',
      };
    }

    try {
      const keys = await this.redis.keys(this.keyPrefix + '*');
      const info = await this.redis.info('memory');
      const memoryMatch = info.match(/used_memory_human:(.+)/);
      const memory = memoryMatch ? memoryMatch[1].trim() : '0B';

      return {
        connected: true,
        keys: keys.length,
        memory,
      };
    } catch (error) {
      console.error('Redis stats error:', error);
      return {
        connected: false,
        keys: 0,
        memory: '0B',
      };
    }
  }

  // Close Redis connection
  async close(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.quit();
        this.isConnected = false;
      } catch (error) {
        console.error('Redis close error:', error);
      }
    }
  }
}

// Multi-level Cache Manager
export class CacheManager {
  private l1: L1Cache;
  private l2: L2Cache | null;
  private stats = {
    l1Hits: 0,
    l1Misses: 0,
    l2Hits: 0,
    l2Misses: 0,
  };

  constructor(config: CacheConfig) {
    this.l1 = new L1Cache(config.l1.maxSize, config.l1.defaultTTL);
    this.l2 = config.l2 ? new L2Cache(config.l2) : null;
  }

  // Get value from cache (checks L1 then L2)
  async get<T>(key: string): Promise<T | null> {
    // Try L1 cache first
    let value = this.l1.get<T>(key);
    if (value !== null) {
      this.stats.l1Hits++;
      return value;
    }
    this.stats.l1Misses++;

    // Try L2 cache if available
    if (this.l2) {
      value = await this.l2.get<T>(key);
      if (value !== null) {
        this.stats.l2Hits++;
        // Store in L1 for faster future access
        this.l1.set(key, value);
        return value;
      }
      this.stats.l2Misses++;
    }

    return null;
  }

  // Set value in cache (stores in both L1 and L2)
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    // Store in L1
    this.l1.set(key, value, ttl);

    // Store in L2 if available
    if (this.l2) {
      await this.l2.set(key, value, ttl);
    }
  }

  // Delete key from cache (removes from both L1 and L2)
  async delete(key: string): Promise<void> {
    // Delete from L1
    this.l1.delete(key);

    // Delete from L2 if available
    if (this.l2) {
      await this.l2.delete(key);
    }
  }

  // Clear all cache
  async clear(): Promise<void> {
    // Clear L1
    this.l1.clear();

    // Clear L2 if available
    if (this.l2) {
      await this.l2.clear();
    }

    // Reset stats
    this.stats = {
      l1Hits: 0,
      l1Misses: 0,
      l2Hits: 0,
      l2Misses: 0,
    };
  }

  // Check if key exists
  async has(key: string): Promise<boolean> {
    // Check L1 first
    if (this.l1.has(key)) {
      return true;
    }

    // Check L2 if available
    if (this.l2) {
      return await this.l2.has(key);
    }

    return false;
  }

  // Get cache statistics
  async getStats(): Promise<{
    l1: ReturnType<L1Cache['getStats']>;
    l2?: Awaited<ReturnType<L2Cache['getStats']>>;
    overall: {
      totalHits: number;
      totalMisses: number;
      hitRate: number;
    };
  }> {
    const l1Stats = this.l1.getStats();
    const l2Stats = this.l2 ? await this.l2.getStats() : undefined;

    const totalHits = this.stats.l1Hits + this.stats.l2Hits;
    const totalMisses = this.stats.l1Misses + this.stats.l2Misses;
    const hitRate = totalHits + totalMisses > 0 ? totalHits / (totalHits + totalMisses) : 0;

    return {
      l1: l1Stats,
      l2: l2Stats,
      overall: {
        totalHits,
        totalMisses,
        hitRate,
      },
    };
  }

  // Generate cache key
  generateKey(prefix: string, ...parts: string[]): string {
    return [prefix, ...parts].join(':');
  }

  // Warm up cache with common queries
  async warmUp(keys: Array<{ key: string; value: any; ttl?: number }>): Promise<void> {
    const promises = keys.map(({ key, value, ttl }) => this.set(key, value, ttl));
    await Promise.all(promises);
  }

  // Get or set pattern (useful for memoization)
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttl);
    return value;
  }

  // Destroy cache manager
  async destroy(): Promise<void> {
    this.l1.destroy();
    if (this.l2) {
      await this.l2.close();
    }
  }
}

// Singleton instance
let cacheManager: CacheManager | null = null;

// Get cache manager instance
export function getCacheManager(): CacheManager {
  if (!cacheManager) {
    cacheManager = new CacheManager(cacheConfig);
  }
  return cacheManager;
}

// Cache utilities
export const cacheUtils = {
  // Generate search cache key
  generateSearchKey(params: any): string {
    const normalized = {
      q: params.query,
      k: params.topK,
      t: params.threshold,
      h: params.hybrid,
      f: params.filters || {},
      w: params.weights || {},
    };
    const hash = Buffer.from(JSON.stringify(normalized)).toString('base64');
    return `search:${hash}`;
  },

  // Generate embedding cache key
  generateEmbeddingKey(text: string, model: string): string {
    const hash = Buffer.from(`${model}:${text}`).toString('base64').substring(0, 32);
    return `embed:${hash}`;
  },

  // Generate annotation cache key
  generateAnnotationKey(note: string, context?: string): string {
    const content = context ? `${note}:${context}` : note;
    const hash = Buffer.from(content).toString('base64').substring(0, 32);
    return `annotation:${hash}`;
  },

  // Cache decorator for functions
  cacheable<T extends (...args: any[]) => Promise<any>>(
    keyGenerator: (...args: Parameters<T>) => string,
    ttl: number = 300
  ) {
    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
      const originalMethod = descriptor.value;

      descriptor.value = async function (...args: Parameters<T>) {
        const cache = getCacheManager();
        const key = keyGenerator(...args);

        return cache.getOrSet(key, () => originalMethod.apply(this, args), ttl);
      };

      return descriptor;
    };
  },
};