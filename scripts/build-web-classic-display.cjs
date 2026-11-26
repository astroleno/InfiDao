/* Build-only corpus projection. Install opencc@1.4.2 in an isolated directory
 * and pass its package directory as the first argument. */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { tmpdir } = require('node:os');
const { gzipSync } = require('node:zlib');
const { unpackJSON } = require('../shared/content/codec.cjs');
const { createClassicProjector, normalizeClassic } = require('../src/lib/flow-browser/classic-display-projector.cjs');

const root = path.resolve(__dirname, '..');
const openccPath = path.resolve(process.argv[2]);
const { OpenCC } = require(openccPath);
if (OpenCC.version !== '1.4.2') throw new Error('Use OpenCC 1.4.2');
const reference = new OpenCC('s2t.json');
const scratch = fs.mkdtempSync(path.join(tmpdir(), 'infidao-opencc-'));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const json = file => JSON.parse(read(file));
const fixtureTexts = [
  '皇后，后来，干戈，才干', '甲丽乙', '不以梦剧乱知谓之静', '君安其乐而思其终',
];

function readDictionary(name) {
  const source = path.join(openccPath, 'prebuilds/assets', name + '.ocd2');
  const target = path.join(scratch, name + '.txt');
  OpenCC.generateDict(source, target, 'ocd2', 'text');
  return Object.fromEntries(fs.readFileSync(target, 'utf8').trimEnd().split('\n').map(line => {
    const [key, values] = line.split('\t');
    return [key, values.split(' ')[0]];
  }));
}

function readPoems() {
  const rows = [];
  const { poetryManifests } = json('data/content-packs/manifest.json');
  for (const file of poetryManifests) {
    for (const shard of json('data/' + file).shards) {
      const db = new DatabaseSync(path.join(root, 'data', shard.path), { readOnly: true });
      try {
        for (const row of db.prepare('SELECT json FROM passages ORDER BY id').iterate()) rows.push(unpackJSON(row.json).text);
      } finally { db.close(); }
    }
  }
  return rows;
}

function build() {
  const core = json('data/corpus-manifest.json').files.flatMap(({ path: file }) =>
    read(file).split('\n').filter(line => line.trim()).map(line => JSON.parse(line).text));
  const poetry = readPoems();
  const curated = Object.values(require('../shared/flow/curated-data.js').passages);
  const checks = [...new Set([...core, ...poetry, ...fixtureTexts, ...curated.map(frame => frame.fullText)])]
    .map(source => ({ source, expected: reference.convertSync(source) }));
  const allCharacters = readDictionary('STCharacters');
  for (const [key, value] of Object.entries(readDictionary('CJK_Compatibility_Ideographs'))) {
    if (normalizeClassic(key) !== value) throw new Error('Unicode compatibility normalization differs: ' + key);
  }
  const allPhrases = { ...readDictionary('STPhrases_GeneratedFromRegionalPhrases'), ...readDictionary('STPhrases') };
  const baseline = createClassicProjector({ characters: allCharacters, phrases: {} });
  const full = createClassicProjector({ characters: allCharacters, phrases: allPhrases });
  const normalizedCharacters = new Set();
  const neededPhrases = {};
  for (const check of checks) {
    const { source, expected } = check;
    for (const char of normalizeClassic(source)) normalizedCharacters.add(char);
    const used = {};
    const result = full(source, (key, value) => { used[key] = value; });
    if (result?.text !== expected) throw new Error('OpenCC projection differs at ' + source.slice(0, 48));
    check.used = used;
    for (const [key, value] of Object.entries(used)) {
      if (baseline(key)?.text !== value) neededPhrases[key] = value;
    }
  }
  const characters = Object.fromEntries(Object.entries(allCharacters)
    .filter(([key, value]) => normalizedCharacters.has(key) && key !== value));
  // Identical phrase matches can still block overlapping contextual phrases.
  // Retain those matches where the projection would otherwise change output.
  for (;;) {
    const reduced = createClassicProjector({ characters, phrases: neededPhrases });
    const mismatches = checks.filter(({ source, expected }) => reduced(source)?.text !== expected);
    if (!mismatches.length) break;
    const before = Object.keys(neededPhrases).length;
    for (const { used } of mismatches) Object.assign(neededPhrases, used);
    if (Object.keys(neededPhrases).length === before) throw new Error('Reduced projection lost authority coverage');
  }
  const sorted = entries => Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  const projection = JSON.stringify({ characters: sorted(characters), phrases: sorted(neededPhrases) }) + '\n';
  fs.writeFileSync(path.join(root, 'src/lib/flow-browser/classic-display.generated.json'), projection);
  const targets = {
    core: core.map(source => reference.convertSync(source)),
    poetry: poetry.map(source => reference.convertSync(source)),
    fixtures: fixtureTexts.map(source => reference.convertSync(source)),
    opening: curated.map(({ fullText, quoteStart, quoteEnd }) => full(fullText).slice(quoteStart, quoteEnd)),
  };
  if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(targets));
  console.log(JSON.stringify({ passages: core.length, poetry: poetry.length, bytes: Buffer.byteLength(projection),
    gzipBytes: gzipSync(projection).byteLength, characters: Object.keys(characters).length, phrases: Object.keys(neededPhrases).length }));
}

try { build(); } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
