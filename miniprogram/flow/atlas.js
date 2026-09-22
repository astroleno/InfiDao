const WIDTH = 1024;
const TILE = 96;
const { paintGlyph } = require('./glyph-outline');
const cache = new WeakMap();

function atlasLayout(count, dpr = 1, maxTextureSize = 4096) {
  // CLAMP_TO_EDGE + LINEAR supports non-power-of-two atlases in WebGL 1.
  // Avoid doubling each edge (and quadrupling memory) for the 101st glyph.
  const side = Math.max(WIDTH, Math.ceil(Math.sqrt(Math.max(1, count))) * TILE);
  if (side > maxTextureSize) throw new Error('Quotation atlas exceeds device capacity');
  const scale = Math.max(1, Math.min(dpr, maxTextureSize / side));
  return { side, scale, size: Math.round(side * scale), tile: TILE * scale, columns: Math.floor(side / TILE) };
}

// Only quotations enter the optical scene; all metadata stays in the reader.
// dpr scales the canvas backing store so glyphs stay crisp when the wheel
// magnifies them — logical layout and UVs are unchanged.
function paintAtlas(canvas, frames, dpr = 1, maxTextureSize = 4096) {
  const characters = Array.from(new Set(frames.flatMap(frame => Array.from(frame.quote)))).sort();
  const { scale, size, tile, columns } = atlasLayout(characters.length, dpr, maxTextureSize);
  const key = characters.join('') + ':' + size;
  const previous = cache.get(canvas);
  if (previous && previous.key === key) return previous.glyphs;
  cache.delete(canvas);
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#ffffff';
  const glyphs = {};
  characters.forEach((char, i) => {
    const x = i % columns * tile, y = Math.floor(i / columns) * tile;
    if (y + tile > size) throw new Error('Quotation atlas overflow');
    paintGlyph(ctx, char, x + tile / 2, y + tile / 2, 64 * scale);
    glyphs[char] = [x / size, y / size, (x + tile) / size, (y + tile) / size];
  });
  cache.set(canvas, { key, glyphs });
  return glyphs;
}

module.exports = { WIDTH, atlasLayout, paintAtlas };
