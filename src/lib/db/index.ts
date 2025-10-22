/**
 * Database Connection Manager
 *
 * Handles LanceDB connection, table management, and operations
 * for embeddings and passages storage.
 */

import { connect } from '@lancedb/lancedb';
import { Table } from 'lancedb';
import { v4 as uuidv4 } from 'uuid';
import { databaseConfig } from '@/lib/config';
import type {
  DatabaseSchema,
  Passage,
  SearchResult,
  VectorSimilarityResult,
  BM25Result,
  SearchFilters,
  SearchWeights
} from '@/types';

// Database connection class
export class DatabaseConnection {
  private db: any;
  private embeddingsTable: Table<any> | null = null;
  private passagesTable: Table<any> | null = null;
  private isConnected = false;

  // Initialize database connection
  async connect(): Promise<void> {
    try {
      console.log(`Connecting to LanceDB at: ${databaseConfig.path}`);
      this.db = await connect(databaseConfig.path);

      // Initialize tables
      await this.initializeTables();

      this.isConnected = true;
      console.log('Successfully connected to LanceDB');
    } catch (error) {
      console.error('Failed to connect to LanceDB:', error);
      throw new Error(`Database connection failed: ${error}`);
    }
  }

  // Initialize database tables
  private async initializeTables(): Promise<void> {
    try {
      // Check if embeddings table exists
      const tableNames = await this.db.tableNames();

      if (!tableNames.includes(databaseConfig.embeddingsTable)) {
        console.log(`Creating embeddings table: ${databaseConfig.embeddingsTable}`);
        await this.db.createTable(databaseConfig.embeddingsTable, this.getEmbeddingsSchema());
      }

      if (!tableNames.includes(databaseConfig.passagesTable)) {
        console.log(`Creating passages table: ${databaseConfig.passagesTable}`);
        await this.db.createTable(databaseConfig.passagesTable, this.getPassagesSchema());
      }

      // Get table references
      this.embeddingsTable = await this.db.openTable(databaseConfig.embeddingsTable);
      this.passagesTable = await this.db.openTable(databaseConfig.passagesTable);
    } catch (error) {
      console.error('Failed to initialize tables:', error);
      throw error;
    }
  }

  // Get embeddings table schema
  private getEmbeddingsSchema() {
    return {
      id: 'string',
      text: 'string',
      source: 'string',
      chapter: 'string',
      section: 'int32',
      vector: 'vector<float32,1024>',
      created_at: 'string',
      metadata: 'string', // JSON string
    };
  }

  // Get passages table schema
  private getPassagesSchema() {
    return {
      id: 'string',
      text: 'string',
      source: 'string',
      chapter: 'string',
      section: 'int32',
      created_at: 'string',
      metadata: 'string', // JSON string
    };
  }

  // Insert or update embeddings
  async upsertEmbeddings(data: DatabaseSchema[]): Promise<void> {
    if (!this.embeddingsTable) {
      throw new Error('Embeddings table not initialized');
    }

    try {
      const formattedData = data.map(item => ({
        ...item,
        vector: item.vector || [],
        metadata: JSON.stringify(item.metadata || {}),
        created_at: item.created_at || new Date().toISOString(),
      }));

      await this.embeddingsTable.add(formattedData);
      console.log(`Upserted ${data.length} embeddings`);
    } catch (error) {
      console.error('Failed to upsert embeddings:', error);
      throw error;
    }
  }

  // Perform vector similarity search
  async vectorSearch(
    queryVector: number[],
    topK: number = 5,
    threshold: number = 0.7,
    filters?: SearchFilters
  ): Promise<VectorSimilarityResult[]> {
    if (!this.embeddingsTable) {
      throw new Error('Embeddings table not initialized');
    }

    try {
      // Build query
      let query = this.embeddingsTable
        .search(queryVector)
        .limit(topK);

      // Apply filters if provided
      if (filters) {
        const whereConditions: string[] = [];

        if (filters.book) {
          whereConditions.push(`source IN (${filters.book.map(b => `'${b}'`).join(', ')})`);
        }

        if (filters.chapter) {
          whereConditions.push(`chapter IN (${filters.chapter.map(c => `'${c}'`).join(', ')})`);
        }

        if (filters.section_range) {
          whereConditions.push(`section BETWEEN ${filters.section_range[0]} AND ${filters.section_range[1]}`);
        }

        if (whereConditions.length > 0) {
          query = query.where(whereConditions.join(' AND '));
        }
      }

      // Execute query
      const results = await query.execute();

      // Transform results
      const transformedResults: VectorSimilarityResult[] = results
        .filter((result: any) => result._distance <= (1 - threshold))
        .map((result: any) => ({
          id: result.id,
          score: 1 - result._distance,
          distance: result._distance,
          passage: {
            id: result.id,
            text: result.text,
            source: result.source,
            chapter: result.chapter,
            section: result.section,
            metadata: result.metadata ? JSON.parse(result.metadata) : {},
          },
        }));

      return transformedResults;
    } catch (error) {
      console.error('Vector search failed:', error);
      throw error;
    }
  }

  // Perform full-text search (BM25 simulation)
  async fullTextSearch(
    query: string,
    topK: number = 5,
    filters?: SearchFilters
  ): Promise<BM25Result[]> {
    if (!this.passagesTable) {
      throw new Error('Passages table not initialized');
    }

    try {
      // Simple text matching (LanceDB doesn't have native BM25, so we simulate)
      const queryTerms = query.toLowerCase().split(/\s+/);

      let dbQuery = this.passagesTable.search(query).limit(topK);

      // Apply filters
      if (filters) {
        const whereConditions: string[] = [];

        if (filters.book) {
          whereConditions.push(`source IN (${filters.book.map(b => `'${b}'`).join(', ')})`);
        }

        if (filters.chapter) {
          whereConditions.push(`chapter IN (${filters.chapter.map(c => `'${c}'`).join(', ')})`);
        }

        if (filters.section_range) {
          whereConditions.push(`section BETWEEN ${filters.section_range[0]} AND ${filters.section_range[1]}`);
        }

        if (whereConditions.length > 0) {
          dbQuery = dbQuery.where(whereConditions.join(' AND '));
        }
      }

      const results = await dbQuery.execute();

      // Calculate BM25-like scores
      const transformedResults: BM25Result[] = results.map((result: any) => {
        const text = result.text.toLowerCase();
        const matchedTerms = queryTerms.filter(term => text.includes(term));
        const score = matchedTerms.length / queryTerms.length;

        return {
          id: result.id,
          score,
          matched_terms: matchedTerms,
          passage: {
            id: result.id,
            text: result.text,
            source: result.source,
            chapter: result.chapter,
            section: result.section,
            metadata: result.metadata ? JSON.parse(result.metadata) : {},
          },
        };
      });

      return transformedResults.sort((a, b) => b.score - a.score).slice(0, topK);
    } catch (error) {
      console.error('Full-text search failed:', error);
      throw error;
    }
  }

  // Get passage by ID
  async getPassageById(id: string): Promise<Passage | null> {
    if (!this.passagesTable) {
      throw new Error('Passages table not initialized');
    }

    try {
      const results = await this.passagesTable
        .where(`id = '${id}'`)
        .limit(1)
        .execute();

      if (results.length === 0) {
        return null;
      }

      const result = results[0];
      return {
        id: result.id,
        text: result.text,
        source: result.source,
        chapter: result.chapter,
        section: result.section,
        metadata: result.metadata ? JSON.parse(result.metadata) : {},
      };
    } catch (error) {
      console.error('Failed to get passage by ID:', error);
      throw error;
    }
  }

  // Get statistics
  async getStatistics(): Promise<{
    totalPassages: number;
    totalEmbeddings: number;
    sources: string[];
    chapters: { [source: string]: string[] };
  }> {
    if (!this.passagesTable || !this.embeddingsTable) {
      throw new Error('Tables not initialized');
    }

    try {
      const passageStats = await this.passagesTable.countRows();
      const embeddingStats = await this.embeddingsTable.countRows();

      // Get unique sources
      const sources = await this.passagesTable
        .select('source')
        .distinct()
        .execute();

      const sourceList = sources.map((s: any) => s.source);

      // Get chapters per source
      const chapters: { [source: string]: string[] } = {};
      for (const source of sourceList) {
        const sourceChapters = await this.passagesTable
          .select('chapter')
          .where(`source = '${source}'`)
          .distinct()
          .execute();

        chapters[source] = sourceChapters.map((c: any) => c.chapter);
      }

      return {
        totalPassages: passageStats,
        totalEmbeddings: embeddingStats,
        sources: sourceList,
        chapters,
      };
    } catch (error) {
      console.error('Failed to get statistics:', error);
      throw error;
    }
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      // Simple query to test connection
      await this.db.tableNames();
      return true;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  // Close connection
  async close(): Promise<void> {
    try {
      if (this.db) {
        await this.db.close();
        this.isConnected = false;
        console.log('Database connection closed');
      }
    } catch (error) {
      console.error('Error closing database connection:', error);
    }
  }

  // Create index on specific field
  async createIndex(field: string): Promise<void> {
    if (!this.embeddingsTable) {
      throw new Error('Embeddings table not initialized');
    }

    try {
      // LanceDB automatically creates IVF index for vector columns
      // For other columns, we can create scalar indices
      console.log(`Creating index on field: ${field}`);
      // Note: LanceDB index creation depends on version
      // This is a placeholder for index creation logic
    } catch (error) {
      console.error('Failed to create index:', error);
      throw error;
    }
  }

  // Batch insert passages
  async batchInsertPassages(passages: Passage[]): Promise<void> {
    if (!this.passagesTable) {
      throw new Error('Passages table not initialized');
    }

    try {
      const formattedData = passages.map(passage => ({
        ...passage,
        created_at: passage.created_at || new Date().toISOString(),
        metadata: JSON.stringify(passage.metadata || {}),
      }));

      await this.passagesTable.add(formattedData);
      console.log(`Inserted ${passages.length} passages`);
    } catch (error) {
      console.error('Failed to batch insert passages:', error);
      throw error;
    }
  }
}

// Singleton instance
let dbInstance: DatabaseConnection | null = null;

// Get database connection
export function getDatabaseConnection(): DatabaseConnection {
  if (!dbInstance) {
    dbInstance = new DatabaseConnection();
  }
  return dbInstance;
}

// Initialize database
export async function initializeDatabase(): Promise<void> {
  const db = getDatabaseConnection();
  await db.connect();
}

// Database utility functions
export const dbUtils = {
  // Generate unique ID
  generateId: (): string => uuidv4(),

  // Format passage for database
  formatPassage: (passage: Omit<Passage, 'id'>): DatabaseSchema => ({
    id: uuidv4(),
    ...passage,
    vector: passage.vector || [],
    created_at: new Date().toISOString(),
  }),

  // Extract text for search
  extractText: (passage: Passage): string => {
    return `${passage.source} ${passage.chapter} ${passage.text}`.toLowerCase();
  },

  // Calculate relevance score
  calculateRelevanceScore: (
    vectorScore: number,
    bm25Score: number,
    weights: SearchWeights
  ): number => {
    const normalizedVector = Math.max(0, Math.min(1, vectorScore));
    const normalizedBM25 = Math.max(0, Math.min(1, bm25Score));

    return (normalizedVector * weights.vector + normalizedBM25 * weights.bm25) /
           (weights.vector + weights.bm25);
  },
};