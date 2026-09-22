const TAU = Math.PI * 2;
const CENTER_SCALE = 1.12;
const ROW_TURN_MIN = 0.14;
const ROW_TURN_STEP = 0.02;
const COPIES = 5;
const { CELL, CENTER_PHASE, modulo } = require('./timeline');

function sceneMetrics(width, height) {
  const radius = Math.min(width * 0.5, height * 0.34), pitch = height * 0.058;
  return { radius, arc: 1.45, curl: 1.5, recede: height * 0.28, pitch, fontSize: Math.min(21, width * 0.056, height * 0.06), turns: 11,
    scrollPitch: height * 0.5 * 1.5396 * pitch / Math.max(height * 0.5 - radius, pitch) };
}

function focusAt(y, pitch) {
  const distance = y / pitch;
  return { focus: Math.exp(-distance * distance * 2.2), opacity: Math.exp(-distance * distance * 0.62) };
}

function centeredIndex(position, count) {
  return modulo(Math.round(position / CELL - CENTER_PHASE), count);
}

function rowTurn(ordinal) {
  const direction = modulo(ordinal, 2) === 0 ? 1 : -1;
  return direction * (ROW_TURN_MIN + modulo(ordinal * 3, 5) * ROW_TURN_STEP);
}

function rowMotion(index, cursor, count, rowOffset = 0) {
  const distance = modulo(cursor - index + count / 2, count) - count / 2;
  // The row keeps its direction and pace while passing through the viewport,
  // including an odd-length content loop. It faces front exactly at focus.
  const ordinal = Math.round(cursor - distance) + rowOffset;
  const turn = rowTurn(ordinal);
  return { distance, ordinal, turn, angle: -distance * turn };
}

function splitLines(frame) {
  // Keep the source verbatim. Prefer clause boundaries, then bounded grapheme
  // groups for a long unpunctuated clause; the full quotation stays attached.
  return (frame.lines || [frame.quote]).flatMap(line => {
    if (Array.from(line).length <= 10) return [line];
    return (line.match(/[^，。！？；]+[，。！？；]?/g) || [line]).flatMap(clause => {
      const chars = Array.from(clause), groups = [];
      while (chars.length) {
        const take = chars.length === 10 && /[，。！？；]/.test(chars[9]) ? 10 : 9;
        groups.push(chars.splice(0, take).join(''));
      }
      return groups;
    });
  });
}

function readingLines(frames) {
  return frames.flatMap(frame => splitLines(frame).map((line, index) => ({
    ...frame,
    passageId: frame.id,
    passageQuote: frame.quote,
    passageLines: splitLines(frame),
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
    if (x * camera / (camera - z) * CENTER_SCALE <= radius * 0.82) low = angle;
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
      for (let copy = 0; copy < COPIES; copy++) {
        const rear = copy * TAU / COPIES;
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

// Mirror the vertex projection for selectable front-facing rows. This is used
// on touch, not on every animation frame, and never makes blurred rear copies
// into invisible tap targets.
function projectedRows(vertices, cursor, count, width, height, reading = 0, rowOffset = 0) {
  const m = sceneMetrics(width, height), camera = height / 2, rows = new Map();
  for (let i = 0; i < vertices.length; i += 8) {
    if ((i / 8) % (6 * COPIES) >= 6) continue;
    const index = vertices[i + 3];
    const motion = rowMotion(index, cursor, count, rowOffset), d = motion.distance;
    if (Math.abs(d) > (reading > 0.5 ? 0.35 : 1.25)) continue;
    const angle = vertices[i] + motion.angle;
    const scale = 0.62 + (CENTER_SCALE - 0.62) * Math.exp(-d * d * 0.55);
    const gy = vertices[i + 2] * scale;
    const edge = Math.max(camera - m.radius, m.pitch) / m.pitch;
    const t = Math.min(Math.abs(d) / edge, 1);
    const phi = Math.sign(d) * m.arc * Math.pow(Math.max(t, 1e-4), m.curl);
    const z = Math.cos(angle) * (m.radius + 0.8) - Math.sin(angle) * vertices[i + 1] - gy * Math.sin(phi) - m.recede * (1 - Math.cos(phi));
    const w = camera - z;
    const x = width / 2 + (Math.sin(angle) * (m.radius + 0.8) + Math.cos(angle) * vertices[i + 1]) * scale * camera / w;
    const y = height / 2 - (Math.sign(d) * Math.sin(t * 1.5396) * w + gy * Math.cos(phi)) * camera / w;
    const row = rows.get(index) || { index, distance: d, left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
    row.left = Math.min(row.left, x); row.right = Math.max(row.right, x);
    row.top = Math.min(row.top, y); row.bottom = Math.max(row.bottom, y);
    rows.set(index, row);
  }
  return Array.from(rows.values());
}

module.exports = { TAU, CENTER_SCALE, ROW_TURN_MIN, ROW_TURN_STEP, COPIES, rowTurn, rowMotion, sceneMetrics, centeredIndex, focusAt, wheelGeometry, quotationGeometry, readingLines, projectedRows };
