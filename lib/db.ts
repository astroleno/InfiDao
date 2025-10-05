import lancedb from '@lancedb/lancedb';
import { DatabaseSchema, Passage, SearchOptions, SearchResult } from '@/types';

export class Database {
  private db: any;
  private table: any;
  private isConnected = false;

  async connect(dbPath: string = process.env.LANCEDB_PATH || './data/lancedb') {
    try {
      console.log(`[DB] Connecting to database at: ${dbPath}`);
      this.db = await lancedb.connect(dbPath);

      // 尝试打开已存在的表，如果不存在则创建
      try {
        this.table = await this.db.openTable('classics');
        console.log('[DB] Connected to existing table: classics');
      } catch (e) {
        // 表不存在，创建新表
        const schema = {
          id: 'string',
          text: 'string',
          source: 'string',
          chapter: 'string',
          section: 'int32',
          vector: 'vector',
          created_at: 'string'
        };
        this.table = await this.db.createTable('classics', schema);
        console.log('[DB] Created new table: classics');
      }

      this.isConnected = true;
      console.log('[DB] Database connection established');
      return true;
    } catch (error) {
      console.error('[DB] Failed to connect to database:', error);
      throw error;
    }
  }

  async addPassages(passages: Passage[]) {
    if (!this.isConnected) {
      throw new Error('Database not connected');
    }

    try {
      const rows = passages.map(p => ({
        id: p.id,
        text: p.text,
        source: p.source,
        chapter: p.chapter,
        section: p.section,
        vector: p.vector || [],
        created_at: p.created_at || new Date().toISOString()
      }));

      await this.table.add(rows);
      console.log(`[DB] Added ${rows.length} passages to database`);
      return true;
    } catch (error) {
      console.error('[DB] Failed to add passages:', error);
      throw error;
    }
  }

  async search(queryVector: number[], options: SearchOptions = {}) {
    if (!this.isConnected) {
      throw new Error('Database not connected');
    }

    const {
      top_k = 5,
      threshold = 0.7,
      filters = {}
    } = options;

    try {
      let query = this.table.vectorSearch(queryVector).limit(top_k);

      // 应用过滤器
      if (filters.book && filters.book.length > 0) {
        query = query.where(`source IN ('${filters.book.join("','")}')`);
      }

      if (filters.chapter && filters.chapter.length > 0) {
        query = query.where(`chapter IN ('${filters.chapter.join("','")}')`);
      }

      const results = await query.execute();

      // 过滤并格式化结果
      const filteredResults = results
        .filter((r: any) => r._distance >= threshold)
        .map((r: any): SearchResult => ({
          id: r.id,
          text: r.text,
          source: r.source,
          chapter: r.chapter,
          section: r.section,
          score: r._distance,
          metadata: {
            created_at: r.created_at
          }
        }));

      console.log(`[DB] Search returned ${filteredResults.length} results`);
      return filteredResults;
    } catch (error) {
      console.error('[DB] Search failed:', error);
      throw error;
    }
  }

  async getStats() {
    if (!this.isConnected) {
      throw new Error('Database not connected');
    }

    try {
      const count = await this.table.countRows();
      return {
        total_passages: count,
        table_name: 'classics',
        connection_status: 'connected'
      };
    } catch (error) {
      console.error('[DB] Failed to get stats:', error);
      throw error;
    }
  }

  async close() {
    this.isConnected = false;
    console.log('[DB] Database connection closed');
  }
}

// 导出单例实例
export const db = new Database();