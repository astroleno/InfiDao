#!/usr/bin/env node

/**
 * Download BGE-M3 Model Script
 *
 * This script downloads and sets up the BGE-M3 embedding model
 * using the @xenova/transformers library.
 */

const fs = require('fs');
const path = require('path');

const MODEL_PATH = path.join(process.cwd(), 'models', 'bge-m3');
const MODEL_REPO = 'BAAI/bge-m3';

console.log('🔄 BGE-M3 Model Downloader');
console.log('==========================\n');

async function downloadModel() {
  try {
    // Dynamic import to handle ESM
    const { pipeline } = require('@xenova/transformers');

    // Check if model already exists
    if (fs.existsSync(MODEL_PATH) && fs.readdirSync(MODEL_PATH).length > 0) {
      console.log('✓ Model already exists at:', MODEL_PATH);
      return;
    }

    console.log('📥 Downloading BGE-M3 model...');
    console.log('   Repository:', MODEL_REPO);
    console.log('   Local path:', MODEL_PATH);
    console.log('\n⏳ This may take a few minutes depending on your connection...\n');

    // Create model directory if it doesn't exist
    if (!fs.existsSync(MODEL_PATH)) {
      fs.mkdirSync(MODEL_PATH, { recursive: true });
    }

    // Initialize the pipeline to download the model
    console.log('   Downloading model files...');
    const extractor = await pipeline('feature-extraction', MODEL_REPO, {
      cache_dir: MODEL_PATH,
      local_files_only: false,
    });

    // Test the model
    console.log('\n🧪 Testing model...');
    const testText = '这是一个测试文本';
    const output = await extractor(testText);

    if (output && output.data) {
      console.log('✓ Model downloaded and tested successfully!');
      console.log('   Model output dimensions:', output.data.length);
    } else {
      throw new Error('Model test failed');
    }

    // Create a marker file to indicate successful download
    fs.writeFileSync(
      path.join(MODEL_PATH, '.downloaded'),
      new Date().toISOString()
    );

    console.log('\n✅ Model setup complete!');
    console.log('   Model saved to:', MODEL_PATH);
    console.log('   Ready to use for embeddings.\n');

  } catch (error) {
    console.error('\n❌ Error downloading model:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Check your internet connection');
    console.error('2. Ensure you have enough disk space (~2GB required)');
    console.error('3. Try running the script again');
    console.error('4. If the problem persists, manually download from:', MODEL_REPO);
    console.error('5. Install @xenova/transformers: npm install @xenova/transformers');
    process.exit(1);
  }
}

// Check if model needs to be downloaded
async function checkModel() {
  const markerFile = path.join(MODEL_PATH, '.downloaded');

  if (fs.existsSync(markerFile)) {
    const downloadTime = fs.readFileSync(markerFile, 'utf8');
    console.log('✓ Model was downloaded on:', downloadTime);

    // Optional: Verify model integrity
    try {
      const { pipeline } = require('@xenova/transformers');
      const extractor = await pipeline('feature-extraction', MODEL_REPO, {
        cache_dir: MODEL_PATH,
        local_files_only: true,
      });
      console.log('✓ Model integrity verified');
      return true;
    } catch (error) {
      console.log('⚠ Model integrity check failed, re-downloading...');
      return false;
    }
  }

  return false;
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const forceDownload = args.includes('--force') || args.includes('-f');

  if (!forceDownload && await checkModel()) {
    console.log('\n✅ Model is ready to use!');
    return;
  }

  if (forceDownload) {
    console.log('🔄 Force download requested...\n');

    // Clean up existing model
    if (fs.existsSync(MODEL_PATH)) {
      console.log('🗑️  Cleaning up existing model...');
      fs.rmSync(MODEL_PATH, { recursive: true, force: true });
    }
  }

  await downloadModel();
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Download interrupted by user');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n⚠️  Download terminated');
  process.exit(0);
});

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { downloadModel, checkModel };