// The browser adapter is also selected for the shared atlas by Next's alias.
// Font bytes arrive through the integrity-checked loader, never through JS.
const { createGlyphRuntime } = require('../../../miniprogram/flow/glyph-core');
module.exports = createGlyphRuntime();
