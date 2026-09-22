const TAU = Math.PI * 2;
const CENTER_SCALE = 1.12;
const { CELL, modulo } = require('./timeline');

function sceneMetrics(width, height) {
  return { radius: width * 0.5, arc: 1.45, curl: 1.5, recede: height * 0.28, pitch: height * 0.058, fontSize: Math.min(21, width * 0.056), turns: 11 };
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
    passageId: frame.id,
    passageQuote: frame.quote,
    passageLines: frame.lines || [frame.quote],
    lineIndex: index,
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

const PUNCTUATION = /[，。、；：？！""''「」『』《》〈〉（）—…·]/;

function quotationGeometry(frames, glyphs, radius, fontSize, camera = radius * 2) {
  const vertices = [];
  // Fit the enlarged row to the actual phone's perspective. Only tracking
  // changes: all quotations retain the same focused glyph size and baseline.
  const halfGlyph = fontSize * 0.75;
  let low = 0, high = TAU / 10;
  for (let i = 0; i < 18; i++) {
    const angle = (low + high) / 2;
    const x = Math.sin(angle) * (radius + 0.8) + Math.cos(angle) * halfGlyph;
    const z = Math.cos(angle) * (radius + 0.8) - Math.sin(angle) * halfGlyph;
    if (x * camera / (camera - z) * CENTER_SCALE <= radius * 0.94) low = angle;
    else high = angle;
  }
  frames.forEach((frame, index) => {
    const chars = Array.from(frame.quote);
    // Fixed tracking: all lines share one character advance, and punctuation
    // takes a half slot so 句读 marks hug the previous character instead of
    // floating in a full-width gap. Long lines compress into one wheel slot.
    const widths = chars.map(char => PUNCTUATION.test(char) ? 0.5 : 1);
    const units = widths.reduce((sum, w) => sum + w, 0) || 1;
    // Leave room for the focused row's 1.12x magnification, including long
    // quotations. Grow the glyphs without pushing the first/last one offscreen.
    const step = Math.min(fontSize * 1.4 / radius, low * 2 / Math.max(1, units - 1));
    let cursor = -units / 2;
    chars.forEach((char, i) => {
      const offset = (cursor + widths[i] / 2) * step;
      cursor += widths[i];
      const size = fontSize * 1.5;
      const uv = glyphs[char];
      const corners = [[-.5,-.5,uv[0],uv[3]],[.5,-.5,uv[2],uv[3]],[-.5,.5,uv[0],uv[1]],[.5,.5,uv[2],uv[1]]];
      // Five copies around the wheel: mid-scroll rows sit at ±36°, always on the
      // front arc — the center never opens up between detents.
      for (const rear of [0, TAU / 5, TAU * 2 / 5, TAU * 3 / 5, TAU * 4 / 5]) {
        const angle = offset + rear;
        for (const j of [0,1,2,1,3,2]) {
          const [x,y,u,v] = corners[j];
          vertices.push(angle, x * size, y * size, index, 0, 0, u, v);
        }
      }
    });
  });
  return vertices;
}

module.exports = { TAU, CENTER_SCALE, sceneMetrics, centeredIndex, focusAt, wheelGeometry, quotationGeometry, readingLines };
