const TAU = Math.PI * 2;
const { CELL, modulo } = require('./timeline');

function sceneMetrics(width, height) {
  return { radius: width * 0.32, pitch: height * 0.104, fontSize: Math.min(25, width * 0.06), turns: 7 };
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

// Upright prayer-wheel volume. All horizontal text bands share the same Y axis.
// The cylinder is closed, so front and back refraction use the same real volume.
function wheelGeometry(radius, pitch, turns = 5) {
  const vertices = [];
  const segments = 64, height = pitch * turns / 2;
  const point = (a, y) => vertices.push(Math.sin(a) * radius, y, Math.cos(a) * radius, Math.sin(a), 0, Math.cos(a), 0, 0);
  for (let i = 0; i < segments; i++) {
    const a = i / segments * TAU, b = (i + 1) / segments * TAU;
    point(a, -height); point(b, -height); point(a, height);
    point(b, -height); point(b, height); point(a, height);
    for (const sign of [-1, 1]) {
      vertices.push(0, height * sign, 0, 0, sign, 0, 0, 0);
      for (const angle of sign === 1 ? [a, b] : [b, a]) {
        vertices.push(Math.sin(angle) * radius, height * sign, Math.cos(angle) * radius, 0, sign, 0, 0, 0);
      }
    }
  }
  return vertices;
}

function quotationGeometry(frames, glyphs, radius, fontSize) {
  const vertices = [];
  frames.forEach((frame, index) => {
    const chars = Array.from(frame.quote);
    const angleStep = TAU / 3 / (chars.length + 2);
    for (const rear of [0, TAU / 3, TAU * 2 / 3]) {
      chars.forEach((char, i) => {
        const angle = (i - (chars.length - 1) / 2) * angleStep + rear;
        const size = fontSize * 1.5;
        const uv = glyphs[char];
        const corners = [[-.5,-.5,uv[0],uv[3]],[.5,-.5,uv[2],uv[3]],[-.5,.5,uv[0],uv[1]],[.5,.5,uv[2],uv[1]]];
        for (const j of [0,1,2,1,3,2]) {
          const [x,y,u,v] = corners[j];
          vertices.push(angle, x * size, y * size, index, 0, 0, u, v);
        }
      });
    }
  });
  return vertices;
}

module.exports = { TAU, sceneMetrics, centeredIndex, focusAt, wheelGeometry, quotationGeometry, readingLines };
