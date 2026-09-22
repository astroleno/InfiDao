const TAU = Math.PI * 2;
const { CELL, modulo } = require('./timeline');

function sceneMetrics(width, height) {
  // Horizontal roller: radius controls ribbon curvature, pitch is line spacing.
  return { radius: height * 1.2, tilt: 3.7, pitch: height * 0.104, fontSize: Math.min(25, width * 0.06), turns: 7 };
}

function focusAt(y, pitch) {
  const distance = y / pitch;
  return { focus: Math.exp(-distance * distance * 2.2), opacity: Math.exp(-distance * distance * 0.62) };
}

function centeredIndex(position, count) {
  return modulo(Math.round(position / CELL - 0.46), count);
}

function readingLines(frames) {
  return frames.flatMap(frame => (frame.lines || [frame.quote]).map((line, index) => ({
    ...frame,
    id: frame.id + '-line-' + index,
    quote: line.replace(/[，。！？；]$/, ''),
    lines: [line],
  })));
}

// Horizontal glass roller: a closed cylinder around the X axis. The front
// surface sits at z = 0 where the reading line is, and curves back into depth.
function wheelGeometry(radius, width) {
  const vertices = [];
  const segments = 64, half = width * 0.56;
  const point = (x, a) => vertices.push(x, Math.sin(a) * radius, Math.cos(a) * radius - radius,
    0, Math.sin(a), Math.cos(a), 0, 0);
  for (let i = 0; i < segments; i++) {
    const a = i / segments * TAU, b = (i + 1) / segments * TAU;
    point(-half, a); point(half, a); point(-half, b);
    point(half, a); point(half, b); point(-half, b);
    for (const sign of [-1, 1]) {
      const capX = half * sign;
      vertices.push(capX, 0, -radius, sign, 0, 0, 0, 0);
      for (const angle of sign === 1 ? [a, b] : [b, a]) {
        vertices.push(capX, Math.sin(angle) * radius, Math.cos(angle) * radius - radius, sign, 0, 0, 0, 0);
      }
    }
  }
  return vertices;
}

// Each quotation is one straight line of glyphs. The vertex shader wraps the
// line around the roller: a_position = (charX, cornerX, cornerY).
function quotationGeometry(frames, glyphs, radius, fontSize, width) {
  const vertices = [];
  frames.forEach((frame, index) => {
    const chars = Array.from(frame.quote);
    const size = fontSize * 1.5;
    const advance = Math.min(size * 0.96, (width * 0.92) / Math.max(chars.length, 1));
    chars.forEach((char, i) => {
      const x = (i - (chars.length - 1) / 2) * advance;
      const uv = glyphs[char];
      const corners = [[-.5,-.5,uv[0],uv[3]],[.5,-.5,uv[2],uv[3]],[-.5,.5,uv[0],uv[1]],[.5,.5,uv[2],uv[1]]];
      for (const j of [0,1,2,1,3,2]) {
        const [cx, cy, u, v] = corners[j];
        vertices.push(x, cx * size, cy * size, index, 0, 0, u, v);
      }
    });
  });
  return vertices;
}

module.exports = { TAU, sceneMetrics, centeredIndex, focusAt, wheelGeometry, quotationGeometry, readingLines };
