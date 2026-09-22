const outlines = require('../assets/fonts/flow-outlines');
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const ARITY = [2, 2, 4, 6, 0];
const cache = Object.create(null);

// Decode only when a character first enters an atlas. The application does not
// need native font registration, DOM font matching, or a canvas font-family.
function glyphOutline(char) {
  if (cache[char]) return cache[char];
  const glyph = outlines[char];
  if (!glyph) throw new Error('Missing bundled flow glyph: ' + char);
  const bytes = [];
  let bits = 0, buffer = 0;
  for (const symbol of glyph[2]) {
    if (symbol === '=') break;
    const value = ALPHABET.indexOf(symbol);
    if (value < 0) throw new Error('Invalid glyph encoding');
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) { bits -= 8; bytes.push((buffer >>> bits) & 255); }
  }
  const commands = [];
  for (let index = 0; index < bytes.length;) {
    const opcode = bytes[index++], count = ARITY[opcode];
    if (count === undefined || index + count * 2 > bytes.length) throw new Error('Invalid glyph contour');
    const command = [opcode];
    for (let i = 0; i < count; i++) {
      const value = bytes[index++] | (bytes[index++] << 8);
      command.push(value >= 32768 ? value - 65536 : value);
    }
    commands.push(command);
  }
  return (cache[char] = { advance: glyph[0], baseline: glyph[1], commands });
}

function paintGlyph(ctx, char, centerX, centerY, fontPixels) {
  const glyph = glyphOutline(char), scale = fontPixels / 4096;
  ctx.save();
  try {
    ctx.translate(centerX - glyph.advance * scale / 2, centerY + glyph.baseline * scale);
    ctx.scale(scale, -scale);
    ctx.beginPath();
    for (const p of glyph.commands) {
      if (p[0] === 0) ctx.moveTo(p[1], p[2]);
      else if (p[0] === 1) ctx.lineTo(p[1], p[2]);
      else if (p[0] === 2) ctx.quadraticCurveTo(p[1], p[2], p[3], p[4]);
      else if (p[0] === 3) ctx.bezierCurveTo(p[1], p[2], p[3], p[4], p[5], p[6]);
      else ctx.closePath();
    }
    ctx.fill();
  } finally { ctx.restore(); }
}

module.exports = { glyphOutline, paintGlyph };
