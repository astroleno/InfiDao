#!/usr/bin/env node

/**
 * Cache Clearing Script
 * Clears various cache directories for development and production
 */

const fs = require('fs').promises;
const path = require('path');

async function clearCache() {
  console.log('🧹 Clearing Cache Directories');
  console.log('='.repeat(30));

  const cacheDirs = [
    {
      name: 'Next.js Build Cache',
      path: '.next',
      description: 'Next.js build artifacts and cache'
    },
    {
      name: 'Node Modules Cache',
      path: 'node_modules/.cache',
      description: 'Node modules build cache'
    },
    {
      name: 'TypeScript Cache',
      path: '.tsbuildinfo',
      description: 'TypeScript build info'
    },
    {
      name: 'ESLint Cache',
      path: '.eslintcache',
      description: 'ESLint cache file'
    },
    {
      name: 'Data Cache',
      path: 'data/cache',
      description: 'Application data cache'
    },
    {
      name: 'Temp Files',
      path: 'tmp',
      description: 'Temporary files'
    },
    {
      name: 'Log Files',
      path: 'logs',
      description: 'Application logs'
    }
  ];

  let clearedCount = 0;
  let errorCount = 0;

  for (const cacheDir of cacheDirs) {
    try {
      const fullPath = path.resolve(cacheDir.path);

      try {
        const stats = await fs.stat(fullPath);
        if (stats.isDirectory()) {
          await fs.rmdir(fullPath, { recursive: true });
          console.log(`✓ Cleared: ${cacheDir.name} (${cacheDir.path})`);
          clearedCount++;
        } else {
          await fs.unlink(fullPath);
          console.log(`✓ Cleared: ${cacheDir.name} (${cacheDir.path})`);
          clearedCount++;
        }
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.log(`- Already empty: ${cacheDir.name}`);
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error(`✗ Failed to clear ${cacheDir.name}:`, error.message);
      errorCount++;
    }
  }

  console.log('\n' + '='.repeat(30));
  console.log(`Cache clearing completed!`);
  console.log(`✓ Cleared: ${clearedCount}`);
  console.log(`✗ Errors: ${errorCount}`);

  if (clearedCount > 0) {
    console.log('\n💡 Next steps:');
    console.log('   npm run dev    # Start development server');
    console.log('   npm run build  # Build for production');
  }
}

if (require.main === module) {
  clearCache().catch(console.error);
}

module.exports = { clearCache };