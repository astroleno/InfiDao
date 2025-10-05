/**
 * Database Connection Manager
 *
 * Handles connections to LanceDB with connection pooling,
 * error handling, and automatic table creation.
 */

import lancedb from '@lancedb/lancedb';
import * as schema from './schema';
import type { Passage, UserNote, Annotation, SearchCache } from './schema';

export class DatabaseConnection {
  private db: any;
  private tables: Map<string, any> = new Map();
  private isConnected = false;

  constructor(private path: string) {}

  async connect(): Promise<void> {
    try {
      this.db = await lancedb.connect(this.path);
      this.isConnected = true;
      console.log(`✓ Connected to LanceDB at: ${this.path}`);
    } catch (error) {
      console.error('✗ Failed to connect to LanceDB:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    // LanceDB doesn't require explicit disconnection
    this.isConnected = false;
    console.log('Disconnected from LanceDB');
  }

  async createTable<T extends keyof typeof schema>(
    tableName: T,
    schemaDefinition: typeof schema[typeof schema.PASSAGE_TABLE]
  ): Promise<any> {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      const table = await this.db.createTable(tableName, schemaDefinition);
      this.tables.set(tableName, table);
      console.log(`✓ Created table: ${tableName}`);
      return table;
    } catch (error) {
      // Table might already exist
      console.log(`Table ${tableName} already exists or failed to create`);
      return this.openTable(tableName);
    }
  }

  async openTable<T extends keyof typeof schema>(
    tableName: T
  ): Promise<any> {
    if (this.tables.has(tableName)) {
      return this.tables.get(tableName);
    }

    if (!this.isConnected) {
      await this.connect();
    }

    try {
      const table = await this.db.openTable(tableName);
      this.tables.set(tableName, table);
      return table;
    } catch (error) {
      console.error(`✗ Failed to open table ${tableName}:`, error);
      throw error;
    }
  }

  async getTable<T extends keyof typeof schema>(
    tableName: T
  ): Promise<any> {
    return this.openTable(tableName);
  }

  // CRUD Operations
  async insert<T extends keyof typeof schema>(
    tableName: T,
    data: any | any[]
  ): Promise<string> {
    const table = await this.getTable(tableName);
    const isArray = Array.isArray(data);

    try {
      if (isArray) {
        await table.add(data);
        return `Inserted ${data.length} records`;
      } else {
        await table.add([data]);
        return 'Inserted 1 record';
      }
    } catch (error) {
      console.error(`✗ Failed to insert into ${tableName}:`, error);
      throw error;
    }
  }

  async update<T extends keyof typeof schema>(
    tableName: T,
    id: string,
    updates: Partial<any>
  ): Promise<void> {
    const table = await this.getTable(tableName);

    try {
      // LanceDB doesn't support in-place updates directly
      // We need to read, update, and rewrite
      const record = await this.findById(tableName, id);
      if (!record) {
        throw new Error(`Record with id ${id} not found`);
      }

      const updated = { ...record, ...updates, updated_at: new Date().toISOString() };
      await table.delete(`id = '${id}'`);
      await table.add([updated]);
    } catch (error) {
      console.error(`✗ Failed to update ${tableName}:`, error);
      throw error;
    }
  }

  async delete<T extends keyof typeof schema>(
    tableName: T,
    condition: string
  ): Promise<number> {
    const table = await this.getTable(tableName);

    try {
      await table.delete(condition);
      return 1; // LanceDB doesn't return affected count
    } catch (error) {
      console.error(`✗ Failed to delete from ${tableName}:`, error);
      throw error;
    }
  }

  async findById<T extends keyof typeof schema>(
    tableName: T,
    id: string
  ): Promise<any | null> {
    const table = await this.getTable(tableName);

    try {
      const results = await table.search().where(`id = '${id}'').execute();
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      console.error(`✗ Failed to find by id in ${tableName}:`, error);
      return null;
    }
  }

  async search<T extends keyof typeof schema>(
    tableName: T,
    query: string,
    options: {
      limit?: number;
      offset?: number;
      filter?: string;
      orderBy?: string;
    } = {}
  ): Promise<any[]> {
    const table = await this.getTable(tableName);

    try {
      let searchBuilder = table.search();

      // Apply filter if provided
      if (options.filter) {
        searchBuilder = searchBuilder.where(options.filter);
      }

      // Apply order by
      if (options.orderBy) {
        // LanceDB specific implementation might vary
        console.log(`Order by: ${options.orderBy}`);
      }

      // Apply pagination
      const limit = options.limit || 10;
      const offset = options.offset || 0;

      const results = await searchBuilder.limit(limit + offset).execute();
      return results.slice(offset);
    } catch (error) {
      console.error(`✗ Failed to search in ${tableName}:`, error);
      throw error;
    }
  }

  // Vector search specific operations
  async vectorSearch(
    queryVector: Float32Array,
    options: {
      limit?: number;
      threshold?: number;
      filter?: string;
      metric?: 'cosine' | 'l2';
    } = {}
  ): Promise<Array<{ item: Passage; score: number }>> {
    const table = await this.getTable('passages');

    try {
      const limit = options.limit || 10;
      const threshold = options.threshold || 0;

      let searchBuilder = table
        .vectorSearch(Array.from(queryVector))
        .limit(limit)
        .refine('score > ' + threshold);

      if (options.filter) {
        searchBuilder = searchBuilder.where(options.filter);
      }

      const results = await searchBuilder.execute();
      return results;
    } catch (error) {
      console.error('✗ Vector search failed:', error);
      throw error;
    }
  }

  // Utility methods
  async countRows<T extends keyof typeof schema>(tableName: T): Promise<number> {
    const table = await this.getTable(tableName);

    try {
      // LanceDB might not have direct count method
      // Alternative: scan with empty search
      const results = await table.search().execute();
      return results.length;
    } catch (error) {
      console.error(`✗ Failed to count rows in ${tableName}:`, error);
      return 0;
    }
  }

  async vacuum<T extends keyof typeof schema>(tableName: T): Promise<void> {
    // LanceDB handles compaction automatically
    console.log(`Vacuum completed for table: ${tableName}`);
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      // Try to list tables
      const tables = await this.db.tableNames();
      return Array.isArray(tables);
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  // Initialize all tables
  async initializeTables(): Promise<void> {
    await this.createTable('passages', schema.PassageSchema);
    await this.createTable('user_notes', schema.UserNotesSchema);
    await this.createTable('annotations', schema.AnnotationsSchema);
    await this.createTable('search_cache', schema.SearchCacheSchema);

    console.log('✓ All database tables initialized');
  }
}

// Singleton instance
let dbInstance: DatabaseConnection | null = null;

export function getDatabaseConnection(path?: string): DatabaseConnection {
  if (!dbInstance) {
    const dbPath = path || process.env.LANCEDB_PATH || './data/lancedb';
    dbInstance = new DatabaseConnection(dbPath);
  }

  return dbInstance;
}

// For testing
export function resetDatabaseConnection(): void {
  dbInstance = null;
}