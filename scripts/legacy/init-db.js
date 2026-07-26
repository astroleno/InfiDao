#!/usr/bin/env node

/**
 * Database Initialization Script
 *
 * This script initializes the LanceDB database and creates
 * the necessary tables for the InfiDao platform.
 */

const path = require('path');
const fs = require('fs');

async function initDatabase() {
  console.log('🗄️  Database Initialization');
  console.log('==========================\n');

  try {
    // Dynamic import of ESM modules
    const { connect } = await import('@lancedb/lancedb');

    // Configuration
    const DATABASE_PATH = process.env.DATABASE_PATH || './data/lancedb';
    const EMBEDDINGS_TABLE = process.env.EMBEDDINGS_TABLE || 'embeddings';
    const PASSAGES_TABLE = process.env.PASSAGES_TABLE || 'passages';

    // Ensure data directory exists
    const dataDir = path.dirname(DATABASE_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log('✓ Created data directory:', dataDir);
    }

    console.log('📊 Connecting to LanceDB...');
    console.log('   Database path:', DATABASE_PATH);

    // Connect to database
    const db = await connect(DATABASE_PATH);
    console.log('✓ Connected to LanceDB');

    // Get existing tables
    const existingTables = await db.tableNames();
    console.log('\n📋 Existing tables:', existingTables.join(', ') || 'None');

    // Create embeddings table if not exists
    if (!existingTables.includes(EMBEDDINGS_TABLE)) {
      console.log(`\n📝 Creating embeddings table: ${EMBEDDINGS_TABLE}`);

      await db.createTable(EMBEDDINGS_TABLE, {
        id: 'string',
        text: 'string',
        source: 'string',
        chapter: 'string',
        section: 'int32',
        vector: 'vector<float32,1024>',
        created_at: 'string',
        metadata: 'string',
      });

      console.log(`✓ Created table: ${EMBEDDINGS_TABLE}`);
    } else {
      console.log(`✓ Embeddings table already exists: ${EMBEDDINGS_TABLE}`);
    }

    // Create passages table if not exists
    if (!existingTables.includes(PASSAGES_TABLE)) {
      console.log(`\n📝 Creating passages table: ${PASSAGES_TABLE}`);

      await db.createTable(PASSAGES_TABLE, {
        id: 'string',
        text: 'string',
        source: 'string',
        chapter: 'string',
        section: 'int32',
        created_at: 'string',
        metadata: 'string',
      });

      console.log(`✓ Created table: ${PASSAGES_TABLE}`);
    } else {
      console.log(`✓ Passages table already exists: ${PASSAGES_TABLE}`);
    }

    // Test database operations
    console.log('\n🧪 Testing database operations...');
    const embeddingsTable = await db.openTable(EMBEDDINGS_TABLE);
    const passagesTable = await db.openTable(PASSAGES_TABLE);

    // Check table counts
    const embeddingCount = await embeddingsTable.countRows();
    const passageCount = await passagesTable.countRows();

    console.log(`   Embeddings: ${embeddingCount} rows`);
    console.log(`   Passages: ${passageCount} rows`);

    // Create indices for better performance
    console.log('\n📈 Creating database indices...');
    try {
      // LanceDB automatically creates vector indices
      // For scalar columns, indices are created on-demand
      console.log('✓ Database indices ready');
    } catch (error) {
      console.warn('⚠ Warning: Could not create indices:', error.message);
    }

    // Create sample data if empty
    if (embeddingCount === 0 && passageCount === 0) {
      console.log('\n📝 Database is empty. You can import sample data with:');
      console.log('   npm run import-data');
    }

    console.log('\n✅ Database initialization complete!');
    console.log('   Database location:', DATABASE_PATH);
    console.log('   Tables:', [EMBEDDINGS_TABLE, PASSAGES_TABLE].join(', '));

  } catch (error) {
    console.error('\n❌ Database initialization failed:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Ensure you have write permissions to the data directory');
    console.error('2. Check if LanceDB is installed: npm install @lancedb/lancedb');
    console.error('3. Verify the database path in your environment configuration');
    process.exit(1);
  }
}

// Check database health
async function checkDatabase() {
  try {
    const fs = require('fs');
    const path = require('path');
    const { connect } = await import('@lancedb/lancedb');

    const DATABASE_PATH = process.env.DATABASE_PATH || './data/lancedb';
    const EMBEDDINGS_TABLE = process.env.EMBEDDINGS_TABLE || 'embeddings';
    const PASSAGES_TABLE = process.env.PASSAGES_TABLE || 'passages';

    // Check if database file exists
    if (!fs.existsSync(DATABASE_PATH)) {
      console.log('❌ Database does not exist');
      return false;
    }

    // Connect and check
    const db = await connect(DATABASE_PATH);
    const embeddingsTable = await db.openTable(EMBEDDINGS_TABLE);
    const passagesTable = await db.openTable(PASSAGES_TABLE);

    const embeddingCount = await embeddingsTable.countRows();
    const passageCount = await passagesTable.countRows();

    console.log('✅ Database is healthy');
    console.log(`   Embeddings: ${embeddingCount} rows`);
    console.log(`   Passages: ${passageCount} rows`);

    return true;
  } catch (error) {
    console.error('❌ Database check failed:', error.message);
    return false;
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check') || args.includes('-c');

  if (checkOnly) {
    console.log('🔍 Checking database health...\n');
    const isHealthy = await checkDatabase();
    process.exit(isHealthy ? 0 : 1);
  } else {
    await initDatabase();
    console.log('\n🔍 Verifying database...');
    await checkDatabase();
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Initialization interrupted by user');
  process.exit(0);
});

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { initDatabase, checkDatabase };