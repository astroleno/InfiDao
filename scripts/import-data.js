/**
 * Data Import Pipeline for Six Classics
 *
 * This script imports the Six Classics texts into the database,
 * generates embeddings, and creates indexes for efficient search.
 */

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const lancedb = require('@lancedb/lancedb');
const { pipeline } = require('@xenova/transformers');

// Configuration
const CONFIG = {
  dataDir: './data',
  lancedbPath: process.env.LANCEDB_PATH || './data/lancedb',
  batchSize: 32,
  embeddingModel: 'BAAI/bge-m3',
  embeddingDim: 1024,
  chunkSize: { min: 50, max: 200 }, // characters
};

// Six Classics data structure
const SIX_CLASSICS = [
  {
    book: '论语',
    chapters: [
      '学而篇', '为政篇', '八佾篇', '里仁篇', '公冶长篇',
      '雍也篇', '述而篇', '泰伯篇', '子罕篇', '乡党篇',
      '先进篇', '颜渊篇', '子路篇', '宪问篇', '卫灵公篇',
      '季氏篇', '阳货篇', '微子篇', '子张篇', '尧曰篇'
    ]
  },
  {
    book: '孟子',
    chapters: [
      '梁惠王上', '梁惠王下', '公孙丑上', '公孙丑下',
      '滕文公上', '滕文公下', '离娄上', '离娄下',
      '万章上', '万章下', '告子上', '告子下', '尽心上', '尽心下'
    ]
  },
  {
    book: '大学',
    chapters: ['经一章', '传十章']
  },
  {
    book: '中庸',
    chapters: ['第一章']
  },
  {
    book: '诗经',
    chapters: [
      '周南', '召南', '邶风', '鄘风', '卫风', '王风', '郑风',
      '齐风', '魏风', '唐风', '秦风', '陈风', '桧风', '曹风', '豳风'
    ]
  },
  {
    book: '尚书',
    chapters: [
      '尧典', '舜典', '大禹谟', '皋陶谟', '益稷',
      '禹贡', '甘誓', '五子之歌', '胤征', '汤誓',
      '仲虺之诰', '汤诰', '伊训', '太甲上', '太甲中', '太甲下',
      '咸有一德', '盘庚上', '盘庚中', '盘庚下', '说命上', '说命中', '说命下',
      '高宗肜日', '西伯戡黎', '微子', '牧誓', '洪范', '金縢',
      '大诰', '微子之命', '康诰', '酒诰', '梓材', '召诰',
      '洛诰', '多士', '无逸', '君奭', '蔡仲之命', '多方',
      '立政', '周官', '顾命', '康王之诰', '毕命', '君牙',
      '冏命', '吕刑', '文侯之命', '费誓', '秦誓'
    ]
  }
];

// Abbreviations for ID generation
const BOOK_ABBREVS = {
  '论语': 'LJ',
  '孟子': 'MZ',
  '大学': 'DX',
  '中庸': 'ZY',
  '诗经': 'SJ',
  '尚书': 'SS'
};

class DataImporter {
  constructor() {
    this.db = null;
    this.table = null;
    this.embedder = null;
    this.stats = {
      total: 0,
      imported: 0,
      skipped: 0,
      failed: 0,
      startTime: null,
      endTime: null
    };
  }

  async initialize() {
    try {
      console.log('🚀 Initializing database connection...');
      this.db = await lancedb.connect(CONFIG.lancedbPath);

      // Check if table exists, create if not
      const tables = await this.db.tableNames();
      if (!tables.includes('passages')) {
        console.log('📝 Creating passages table...');
        this.table = await this.db.createTable('passages', {
          id: 'string',
          book: 'string',
          chapter: 'string',
          section: 'uint32',
          text: 'string',
          tokens: 'uint16',
          vector: `float[${CONFIG.embeddingDim}]`,
          created_at: 'string',
          updated_at: 'string',
          version: 'string',
          checksum: 'string'
        });
      } else {
        console.log('📚 Opening existing passages table...');
        this.table = await this.db.openTable('passages');
      }

      console.log('🧠 Loading embedding model...');
      this.embedder = await pipeline('feature-extraction', CONFIG.embeddingModel);

      this.stats.startTime = new Date();
      console.log('✅ Initialization complete!');
    } catch (error) {
      console.error('❌ Initialization failed:', error);
      throw error;
    }
  }

  async importAll() {
    console.log('\n📖 Starting import of Six Classics...');

    for (const classic of SIX_CLASSICS) {
      await this.importClassic(classic);
    }

    this.stats.endTime = new Date();
    this.printSummary();
  }

  async importClassic(classic) {
    console.log(`\n📚 Processing: ${classic.book}`);

    for (const chapter of classic.chapters) {
      await this.importChapter(classic.book, chapter);
    }
  }

  async importChapter(book, chapter) {
    try {
      // Check if data file exists
      const dataFile = path.join(CONFIG.dataDir, 'sixclassics', `${book}_${chapter}.jsonl`);

      // Fallback to generate sample data if file doesn't exist
      let passages;
      try {
        const content = await fs.readFile(dataFile, 'utf-8');
        passages = content.split('\n')
          .filter(line => line.trim())
          .map(line => JSON.parse(line));
      } catch (error) {
        console.log(`  📝 Generating sample data for ${book} ${chapter}...`);
        passages = this.generateSampleData(book, chapter);
      }

      // Process passages in batches
      const batches = this.createBatches(passages, CONFIG.batchSize);

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        console.log(`  📦 Processing batch ${i + 1}/${batches.length} (${batch.length} passages)`);

        await this.processBatch(batch, book, chapter);
      }
    } catch (error) {
      console.error(`  ❌ Failed to import ${book} ${chapter}:`, error);
      this.stats.failed++;
    }
  }

  async processBatch(passages, book, chapter) {
    try {
      // Generate embeddings for the batch
      const texts = passages.map(p => p.text);
      const embeddings = await this.generateEmbeddings(texts);

      // Prepare records
      const records = passages.map((passage, idx) => {
        const embedding = embeddings[idx];
        if (!embedding || embedding.length !== CONFIG.embeddingDim) {
          console.warn(`    ⚠️  Invalid embedding for passage, skipping...`);
          this.stats.skipped++;
          return null;
        }

        const id = this.generateId(book, chapter, passage.section || idx + 1);
        const checksum = this.calculateChecksum(passage.text);

        return {
          id,
          book,
          chapter,
          section: passage.section || idx + 1,
          text: passage.text,
          tokens: this.countTokens(passage.text),
          vector: Array.from(embedding),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          version: 'EMB_V1_BGE_M3',
          checksum
        };
      }).filter(record => record !== null);

      // Insert into database
      if (records.length > 0) {
        await this.table.add(records);
        this.stats.imported += records.length;
        console.log(`    ✅ Imported ${records.length} passages`);
      }

      this.stats.total += passages.length;
    } catch (error) {
      console.error('    ❌ Batch processing failed:', error);
      this.stats.failed += passages.length;
    }
  }

  async generateEmbeddings(texts) {
    console.log(`    🧠 Generating embeddings for ${texts.length} texts...`);

    const embeddings = [];

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      try {
        const output = await this.embedder(text, {
          pooling: 'mean',
          normalize: true
        });

        // Handle different output formats
        let embedding;
        if (output.data) {
          embedding = Array.from(output.data);
        } else if (output[0]?.data) {
          embedding = Array.from(output[0].data);
        } else {
          throw new Error('Unexpected embedding output format');
        }

        if (embedding.length === CONFIG.embeddingDim) {
          embeddings.push(new Float32Array(embedding));
        } else {
          console.warn(`      ⚠️  Embedding dimension mismatch: ${embedding.length} vs ${CONFIG.embeddingDim}`);
          embeddings.push(null);
        }
      } catch (error) {
        console.error(`      ❌ Failed to generate embedding for text ${i}:`, error);
        embeddings.push(null);
      }

      // Progress indicator
      if ((i + 1) % 10 === 0) {
        console.log(`      📊 Processed ${i + 1}/${texts.length} texts`);
      }
    }

    return embeddings;
  }

  generateSampleData(book, chapter) {
    // Generate sample passages for demonstration
    const sampleTexts = {
      '论语': [
        '学而时习之，不亦说乎？有朋自远方来，不亦乐乎？',
        '其为人也孝弟，而好犯上者，鲜矣；不好犯上，而好作乱者，未之有也。',
        '巧言令色，鲜矣仁。',
        '吾日三省吾身：为人谋而不忠乎？与朋友交而不信乎？传不习乎？',
        '道千乘之国，敬事而信，节用而爱人，使民以时。'
      ],
      '孟子': [
        '孟子见梁惠王。王曰：叟！不远千里而来，亦将有以利吾国乎？',
        '孟子对曰：王！何必曰利？亦有仁义而已矣。',
        '王曰：何以利吾国？大夫曰：何以利吾家？士庶人曰：何以利吾身？',
        '上下交征利而国危矣。',
        '君行仁政，斯民亲其上，死其长矣。'
      ],
      '大学': [
        '大学之道，在明明德，在亲民，在止于至善。',
        '古之欲明明德于天下者，先治其国；欲治其国者，先齐其家。',
        '欲齐其家者，先修其身；欲修其身者，先正其心。',
        '欲正其心者，先诚其意；欲诚其意者，先致其知。',
        '致知在格物。物格而后知至，知至而后意诚。'
      ],
      '中庸': [
        '天命之谓性，率性之谓道，修道之谓教。',
        '喜怒哀乐之未发，谓之中；发而皆中节，谓之和。',
        '中也者，天下之大本也；和也者，天下之达道也。',
        '致中和，天地位焉，万物育焉。',
        '君子中庸，小人反中庸。'
      ],
      '诗经': [
        '关关雎鸠，在河之洲。窈窕淑女，君子好逑。',
        '参差荇菜，左右流之。窈窕淑女，寤寐求之。',
        '求之不得，寤寐思服。悠哉悠哉，辗转反侧。',
        '蒹葭苍苍，白露为霜。所谓伊人，在水一方。',
        '桃之夭夭，灼灼其华。之子于归，宜其室家。'
      ],
      '尚书': [
        '惟天地，万物父母；惟人，万物之灵。',
        '满招损，谦受益，时乃天道。',
        '民惟邦本，本固邦宁。',
        '玩人丧德，玩物丧志。',
        '为山九仞，功亏一篑。'
      ]
    };

    const texts = sampleTexts[book] || sampleTexts['论语'];

    return texts.map((text, idx) => ({
      text,
      section: idx + 1
    }));
  }

  generateId(book, chapter, section) {
    const bookAbbr = BOOK_ABBREVS[book] || 'XX';
    const chapterAbbr = chapter.substring(0, 2).replace(/篇|第|章/g, '');
    return `${bookAbbr}_${chapterAbbr}_${String(section).padStart(3, '0')}`;
  }

  calculateChecksum(text) {
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  countTokens(text) {
    // Simple token count (approximation)
    // In production, use proper tokenizer
    return Math.ceil(text.length / 2);
  }

  createBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  printSummary() {
    const duration = this.stats.endTime - this.stats.startTime;
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);

    console.log('\n' + '='.repeat(50));
    console.log('📊 IMPORT SUMMARY');
    console.log('='.repeat(50));
    console.log(`⏱️  Duration: ${minutes}m ${seconds}s`);
    console.log(`📚 Total passages: ${this.stats.total}`);
    console.log(`✅ Successfully imported: ${this.stats.imported}`);
    console.log(`⚠️  Skipped: ${this.stats.skipped}`);
    console.log(`❌ Failed: ${this.stats.failed}`);
    console.log(`📈 Success rate: ${((this.stats.imported / this.stats.total) * 100).toFixed(2)}%`);
    console.log('='.repeat(50));
  }

  async cleanup() {
    if (this.db) {
      console.log('\n🧹 Cleaning up...');
      // LanceDB doesn't require explicit cleanup
    }
  }
}

// Main execution
async function main() {
  const importer = new DataImporter();

  try {
    await importer.initialize();
    await importer.importAll();
  } catch (error) {
    console.error('\n❌ Import failed:', error);
    process.exit(1);
  } finally {
    await importer.cleanup();
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { DataImporter };