const { createGlyphSource, createGlyphRuntime } = require('./glyph-core');

// Native callers retain their existing synchronous interface and bundled fonts.
const runtime = createGlyphRuntime([
  () => require('../assets/fonts/serif-data'),
  () => require('../assets/fonts/supplement-data'),
], require('../assets/fonts/manifest').characters);

module.exports = { createGlyphSource, ...runtime };
