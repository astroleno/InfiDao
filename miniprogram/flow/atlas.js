const WIDTH = 1024;
const TILE = 96;
const COLUMNS = 10;

// Only quotations enter the optical scene; all metadata stays in the reader.
function paintAtlas(canvas, frames) {
  const characters = Array.from(new Set(frames.flatMap(frame => Array.from(frame.quote))));
  canvas.width = WIDTH;
  canvas.height = WIDTH;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, WIDTH, WIDTH);
  ctx.fillStyle = '#ffffff';
  ctx.font = '64px "Songti SC", "STSong", "Noto Serif CJK SC", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const glyphs = {};
  characters.forEach((char, i) => {
    const x = i % COLUMNS * TILE, y = Math.floor(i / COLUMNS) * TILE;
    if (y + TILE > WIDTH) throw new Error('Quotation atlas overflow');
    ctx.fillText(char, x + TILE / 2, y + TILE / 2);
    glyphs[char] = [x / WIDTH, y / WIDTH, (x + TILE) / WIDTH, (y + TILE) / WIDTH];
  });
  return glyphs;
}

module.exports = { WIDTH, paintAtlas };
