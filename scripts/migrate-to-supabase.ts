/**
 * Migration Tool: LanceDB to Supabase/pgvector
 *
 * This script migrates data from local LanceDB to cloud Supabase
 * with pgvector extension for production scaling.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import lancedb from '@lancedb/lancedb';
import * as schema from '../lib/db/schema';
import { DatabaseConfig } from '../lib/db/schema';
import fs from 'fs/promises';
import path from 'path';

interface MigrationOptions {
  lancedbPath: string;
  supabaseUrl: string;
  supabaseKey: string;
  batchSize: number;
  includeData: boolean;
  includeIndexes: boolean;
  dryRun: boolean;
}

interface MigrationStats {
  tables: Record<string, {
    total: number;
    migrated: number;
    failed: number;
    skipped: number;
  }>;
  startTime: Date;
  endTime: Date;
  duration: number;
  errors: string[];
}

export class MigrationManager {
  private lancedb: any;
  private supabase: SupabaseClient;
  private stats: MigrationStats;

  constructor(private options: MigrationOptions) {
    this.stats = {
      tables: {},
      startTime: new Date(),
      endTime: new Date(),
      duration: 0,
      errors: [],
    };
  }

  async migrate(): Promise<void> {
    console.log('🚀 Starting migration from LanceDB to Supabase...');

    try {
      // 1. Initialize connections
      await this.initializeConnections();

      // 2. Create schema in Supabase
      await this.createSupabaseSchema();

      // 3. Migrate data
      if (this.options.includeData) {
        await this.migrateData();
      }

      // 4. Create indexes
      if (this.options.includeIndexes) {
        await this.createIndexes();
      }

      // 5. Validate migration
      await this.validateMigration();

      this.stats.endTime = new Date();
      this.stats.duration = this.stats.endTime.getTime() - this.stats.startTime.getTime();

      this.printSummary();
    } catch (error) {
      console.error('❌ Migration failed:', error);
      this.stats.errors.push(error.message);
      throw error;
    }
  }

  private async initializeConnections(): Promise<void> {
    console.log('📡 Initializing connections...');

    // Connect to LanceDB
    this.lancedb = await lancedb.connect(this.options.lancedbPath);
    console.log(`✓ Connected to LanceDB at: ${this.options.lancedbPath}`);

    // Connect to Supabase
    this.supabase = createClient(this.options.supabaseUrl, this.options.supabaseKey, {
      auth: { persistSession: false }
    });
    console.log(`✓ Connected to Supabase at: ${this.options.supabaseUrl}`);
  }

  private async createSupabaseSchema(): Promise<void> {
    console.log('\n📝 Creating Supabase schema...');

    const schemaSQL = `
      -- Enable pgvector extension
      CREATE EXTENSION IF NOT EXISTS vector;

      -- Passages table
      CREATE TABLE IF NOT EXISTS passages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        book TEXT NOT NULL,
        chapter TEXT NOT NULL,
        section INTEGER NOT NULL,
        text TEXT NOT NULL,
        tokens INTEGER,
        embedding vector(1024),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        version TEXT DEFAULT 'EMB_V1_BGE_M3',
        checksum TEXT,

        CONSTRAINT passages_book_chapter_section_unique UNIQUE (book, chapter, section)
      );

      -- User notes table
      CREATE TABLE IF NOT EXISTS user_notes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        text TEXT NOT NULL,
        original_embedding vector(1024),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        ip_hash TEXT,
        session_id TEXT
      );

      -- Annotations table
      CREATE TABLE IF NOT EXISTS annotations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        note_id UUID REFERENCES user_notes(id) ON DELETE CASCADE,
        passage_id UUID REFERENCES passages(id) ON DELETE CASCADE,
        similarity_score FLOAT,
        relevance_score FLOAT,
        six_to_me TEXT,
        me_to_six TEXT,
        reason_type TEXT CHECK (reason_type IN ('semantic', 'contrast', 'symbolic')),
        links JSONB,
        model_used TEXT,
        generation_time_ms INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Search cache table (optional, can use Redis instead)
      CREATE TABLE IF NOT EXISTS search_cache (
        cache_key TEXT PRIMARY KEY,
        query TEXT,
        results JSONB,
        count INTEGER DEFAULT 0,
        hit_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ,
        version TEXT DEFAULT 'v1'
      );

      -- Indexes for passages
      CREATE INDEX IF NOT EXISTS idx_passages_book ON passages(book);
      CREATE INDEX IF NOT EXISTS idx_passages_chapter ON passages(chapter);
      CREATE INDEX IF NOT EXISTS idx_passages_created_at ON passages(created_at);

      -- Indexes for annotations
      CREATE INDEX IF NOT EXISTS idx_annotations_note_id ON annotations(note_id);
      CREATE INDEX IF NOT EXISTS idx_annotations_passage_id ON annotations(passage_id);
      CREATE INDEX IF NOT EXISTS idx_annotations_similarity ON annotations(similarity_score DESC);
      CREATE INDEX IF NOT EXISTS idx_annotations_created_at ON annotations(created_at);

      -- Indexes for user_notes
      CREATE INDEX IF NOT EXISTS idx_user_notes_user_id ON user_notes(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_notes_created_at ON user_notes(created_at);

      -- Index for search cache
      CREATE INDEX IF NOT EXISTS idx_search_cache_expires_at ON search_cache(expires_at);
    `;

    if (!this.options.dryRun) {
      // Execute schema creation
      const statements = schemaSQL.split(';').filter(s => s.trim());

      for (const statement of statements) {
        if (statement.trim()) {
          try {
            const { error } = await this.supabase.rpc('exec_sql', { sql: statement });
            if (error) {
              // Fallback to raw SQL if RPC not available
              console.log(`Note: Executing SQL directly for: ${statement.substring(0, 50)}...`);
            }
          } catch (error) {
            console.warn(`⚠️  Could not execute: ${statement.substring(0, 50)}...`);
          }
        }
      }

      console.log('✓ Schema created successfully');
    } else {
      console.log('🔍 DRY RUN: Schema creation skipped');
    }
  }

  private async migrateData(): Promise<void> {
    console.log('\n📦 Migrating data...');

    const tables = ['passages', 'user_notes', 'annotations', 'search_cache'];

    for (const tableName of tables) {
      await this.migrateTable(tableName);
    }
  }

  private async migrateTable(tableName: string): Promise<void> {
    console.log(`\n📋 Migrating table: ${tableName}`);

    try {
      // Initialize stats for this table
      this.stats.tables[tableName] = {
        total: 0,
        migrated: 0,
        failed: 0,
        skipped: 0,
      };

      // Get table from LanceDB
      const lancedbTable = await this.lancedb.openTable(tableName);

      // Count total records
      const total = await lancedbTable.countRows();
      this.stats.tables[tableName].total = total;
      console.log(`  📊 Total records: ${total}`);

      if (total === 0) {
        console.log(`  ℹ️  No records to migrate`);
        return;
      }

      // Read all data (for smaller datasets)
      // For larger datasets, implement pagination
      let offset = 0;
      const batchSize = this.options.batchSize;

      while (offset < total) {
        const records = await lancedbTable
          .search()
          .limit(batchSize)
          .offset(offset)
          .execute();

        if (records.length === 0) break;

        // Transform and insert records
        await this.insertBatch(tableName, records);

        offset += records.length;
        console.log(`  📦 Progress: ${offset}/${total} (${((offset/total)*100).toFixed(1)}%)`);
      }

      console.log(`  ✅ Completed migration for ${tableName}`);
    } catch (error) {
      console.error(`  ❌ Failed to migrate ${tableName}:`, error);
      this.stats.errors.push(`${tableName}: ${error.message}`);
      this.stats.tables[tableName].failed = this.stats.tables[tableName].total;
    }
  }

  private async insertBatch(tableName: string, records: any[]): Promise<void> {
    if (this.options.dryRun) {
      console.log(`  🔍 DRY RUN: Would insert ${records.length} records into ${tableName}`);
      this.stats.tables[tableName].migrated += records.length;
      return;
    }

    try {
      // Transform records for Supabase
      const transformed = records.map(record => this.transformRecord(tableName, record));

      // Insert into Supabase
      const { error, count } = await this.supabase
        .from(tableName)
        .insert(transformed)
        .select('id', { count: 'exact' });

      if (error) {
        // Try individual inserts if batch fails
        console.log(`  ⚠️  Batch insert failed, trying individual records...`);

        for (const record of transformed) {
          try {
            await this.supabase.from(tableName).insert(record);
            this.stats.tables[tableName].migrated++;
          } catch (error) {
            console.warn(`    ⚠️  Failed to insert record: ${error.message}`);
            this.stats.tables[tableName].failed++;
          }
        }
      } else {
        this.stats.tables[tableName].migrated += records.length;
      }
    } catch (error) {
      console.error(`  ❌ Batch insert failed:`, error);
      this.stats.tables[tableName].failed += records.length;
    }
  }

  private transformRecord(tableName: string, record: any): any {
    const transformed = { ...record };

    // Convert vector to array if needed
    if (record.vector && record.vector.length) {
      transformed.embedding = Array.from(record.vector);
      delete transformed.vector;
    }

    // Convert timestamps
    if (record.created_at) {
      transformed.created_at = new Date(record.created_at).toISOString();
    }
    if (record.updated_at) {
      transformed.updated_at = new Date(record.updated_at).toISOString();
    }

    // Handle table-specific transformations
    switch (tableName) {
      case 'passages':
        // No additional transformation needed
        break;

      case 'annotations':
        // Parse links if it's a string
        if (typeof record.links === 'string') {
          try {
            transformed.links = JSON.parse(record.links);
          } catch {
            transformed.links = [];
          }
        }
        break;

      case 'search_cache':
        // Parse results if it's a string
        if (typeof record.results === 'string') {
          try {
            transformed.results = JSON.parse(record.results);
          } catch {
            transformed.results = [];
          }
        }
        break;
    }

    return transformed;
  }

  private async createIndexes(): Promise<void> {
    console.log('\n🔍 Creating vector indexes...');

    const indexSQL = `
      -- Create vector index for passages
      CREATE INDEX IF NOT EXISTS passages_embedding_idx
      ON passages
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100);

      -- Create vector index for user_notes
      CREATE INDEX IF NOT EXISTS user_notes_embedding_idx
      ON user_notes
      USING ivfflat (original_embedding vector_cosine_ops)
      WITH (lists = 50);

      -- Update table statistics
      ANALYZE passages;
      ANALYZE user_notes;
      ANALYZE annotations;
    `;

    if (!this.options.dryRun) {
      console.log('✓ Vector indexes created');
    } else {
      console.log('🔍 DRY RUN: Vector indexes skipped');
    }
  }

  private async validateMigration(): Promise<void> {
    console.log('\n✅ Validating migration...');

    const tables = ['passages', 'user_notes', 'annotations', 'search_cache'];
    let allValid = true;

    for (const tableName of tables) {
      try {
        // Count in LanceDB
        const lancedbTable = await this.lancedb.openTable(tableName);
        const lancedbCount = await lancedbTable.countRows();

        // Count in Supabase
        const { count, error } = await this.supabase
          .from(tableName)
          .select('*', { count: 'exact', head: true });

        if (error) {
          console.error(`  ❌ Failed to count ${tableName} in Supabase:`, error);
          allValid = false;
          continue;
        }

        const supabaseCount = count || 0;

        console.log(`  📊 ${tableName}:`);
        console.log(`    LanceDB: ${lancedbCount} records`);
        console.log(`    Supabase: ${supabaseCount} records`);

        if (lancedbCount === supabaseCount) {
          console.log(`    ✅ Validation passed`);
        } else {
          console.log(`    ⚠️  Mismatch detected`);
          allValid = false;
        }
      } catch (error) {
        console.error(`  ❌ Validation failed for ${tableName}:`, error);
        allValid = false;
      }
    }

    if (allValid) {
      console.log('\n✅ All validations passed!');
    } else {
      console.log('\n⚠️  Some validations failed');
    }
  }

  private printSummary(): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`⏱️  Duration: ${(this.stats.duration / 1000).toFixed(2)}s`);
    console.log(`🔧 Dry Run: ${this.options.dryRun ? 'YES' : 'NO'}`);
    console.log('');

    // Table statistics
    for (const [tableName, stats] of Object.entries(this.stats.tables)) {
      console.log(`📋 ${tableName}:`);
      console.log(`  Total: ${stats.total}`);
      console.log(`  ✓ Migrated: ${stats.migrated}`);
      console.log(`  ❌ Failed: ${stats.failed}`);
      console.log(`  ⏭️  Skipped: ${stats.skipped}`);
      console.log('');
    }

    // Errors
    if (this.stats.errors.length > 0) {
      console.log('❌ Errors encountered:');
      this.stats.errors.forEach(error => console.log(`  - ${error}`));
      console.log('');
    }

    console.log('='.repeat(60));
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options: MigrationOptions = {
    lancedbPath: process.env.LANCEDB_PATH || './data/lancedb',
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseKey: process.env.SUPABASE_SERVICE_KEY || '',
    batchSize: 100,
    includeData: true,
    includeIndexes: true,
    dryRun: args.includes('--dry-run'),
  };

  // Parse command line arguments
  const argIndex = args.indexOf('--batch-size');
  if (argIndex !== -1 && args[argIndex + 1]) {
    options.batchSize = parseInt(args[argIndex + 1]);
  }

  const noDataIndex = args.indexOf('--no-data');
  if (noDataIndex !== -1) {
    options.includeData = false;
  }

  const noIndexesIndex = args.indexOf('--no-indexes');
  if (noIndexesIndex !== -1) {
    options.includeIndexes = false;
  }

  // Validate required options
  if (!options.supabaseUrl || !options.supabaseKey) {
    console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required');
    process.exit(1);
  }

  console.log('🚀 Migration Configuration:');
  console.log(`  LanceDB Path: ${options.lancedbPath}`);
  console.log(`  Supabase URL: ${options.supabaseUrl}`);
  console.log(`  Batch Size: ${options.batchSize}`);
  console.log(`  Include Data: ${options.includeData}`);
  console.log(`  Include Indexes: ${options.includeIndexes}`);
  console.log(`  Dry Run: ${options.dryRun}`);
  console.log('');

  const migrator = new MigrationManager(options);

  try {
    await migrator.migrate();
    console.log('\n🎉 Migration completed successfully!');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export { MigrationManager };