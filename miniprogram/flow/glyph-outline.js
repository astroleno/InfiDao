const opentype = require('./vendor/opentype');
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// Decode in the logic layer: no browser globals, Node Buffer or native font API.
function fontBuffer(data) {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  if (typeof data !== 'string' || !data.length || data.length % 4) throw new Error('Invalid font data');
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array(data.length / 4 * 3 - padding);
  let bits = 0, buffer = 0, offset = 0;
  for (let i = 0; i < data.length - padding; i++) {
    const value = ALPHABET.indexOf(data[i]);
    if (value < 0) throw new Error('Invalid font encoding');
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) { bits -= 8; bytes[offset++] = (buffer >>> bits) & 255; }
  }
  return bytes.buffer;
}

// Font data is the source of truth, not a build-time list of quotation glyphs.
// A full or downloaded WOFF/TTF can use the same path without exporting curves.
function createGlyphSource(sources) {
  const fonts = [], cache = new Map();
  return function glyphOutline(char) {
    if (cache.has(char)) return cache.get(char);
    for (let i = 0; i < sources.length; i++) {
      if (!fonts[i]) {
        const source = typeof sources[i] === 'function' ? sources[i]() : sources[i];
        fonts[i] = opentype.parse(fontBuffer(source), { lowMemory: true });
      }
      const font = fonts[i], index = font.charToGlyphIndex(char);
      if (!index) continue;
      const glyph = font.glyphs.get(index);
      if (char.trim() && !glyph.path.commands.length) continue;
      const outline = {
        advance: glyph.advanceWidth, baseline: (font.ascender + font.descender) / 2,
        units: font.unitsPerEm, commands: glyph.path.commands,
      };
      cache.set(char, outline);
      return outline;
    }
    throw new Error('Missing font glyph: ' + char);
  };
}

// These are exactly the font files registered for the native page text.
const glyphOutline = createGlyphSource([
  () => require('../assets/fonts/serif-data'),
  () => require('../assets/fonts/supplement-data'),
]);

function paintGlyph(ctx, char, centerX, centerY, fontPixels) {
  const glyph = glyphOutline(char), scale = fontPixels / glyph.units;
  ctx.save();
  try {
    ctx.translate(centerX - glyph.advance * scale / 2, centerY + glyph.baseline * scale);
    ctx.scale(scale, -scale);
    ctx.beginPath();
    for (const p of glyph.commands) {
      if (p.type === 'M') ctx.moveTo(p.x, p.y);
      else if (p.type === 'L') ctx.lineTo(p.x, p.y);
      else if (p.type === 'Q') ctx.quadraticCurveTo(p.x1, p.y1, p.x, p.y);
      else if (p.type === 'C') ctx.bezierCurveTo(p.x1, p.y1, p.x2, p.y2, p.x, p.y);
      else if (p.type === 'Z') ctx.closePath();
      else throw new Error('Unsupported glyph command: ' + p.type);
    }
    ctx.fill();
  } finally { ctx.restore(); }
}

module.exports = { createGlyphSource, glyphOutline, paintGlyph };
