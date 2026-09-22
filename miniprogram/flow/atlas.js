const WIDTH = 1024;
const TILE = 96;
const COLUMNS = 10;
const { paintGlyph } = require('./glyph-outline');

// Only quotations enter the optical scene; all metadata stays in the reader.
// dpr scales the canvas backing store so glyphs stay crisp when the wheel
// magnifies them — logical layout and UVs are unchanged.
function paintAtlas(canvas, frames, dpr = 1) {
  const scale = Math.max(1, dpr);
  const size = WIDTH * scale, tile = TILE * scale;
  const characters = Array.from(new Set(frames.flatMap(frame => Array.from(frame.quote))));
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#ffffff';
  const glyphs = {};
  characters.forEach((char, i) => {
    const x = i % COLUMNS * tile, y = Math.floor(i / COLUMNS) * tile;
    if (y + tile > size) throw new Error('Quotation atlas overflow');
    paintGlyph(ctx, char, x + tile / 2, y + tile / 2, 64 * scale);
    glyphs[char] = [x / size, y / size, (x + tile) / size, (y + tile) / size];
  });
  return glyphs;
}

module.exports = { WIDTH, paintAtlas };
