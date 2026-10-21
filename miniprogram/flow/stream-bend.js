// Adapted from tongye-gallery/src/components/ui/bend.tsx (Canvas UI Bend).
// Extend its top/bottom fold into a continuous arc with a smooth curvature entry.
// The face itself never tilts or tumbles. Pixels and hits share these settings.
// Negative z is nearer in P / (P + z): the top/bottom rim comes towards the
// reader around the farther, flat center, forming the inside of a concave sheet.
function bendSettings(width, height) {
  // Only the central 8% is flat. Focus is independent, so the gently curved
  // adjacent lines can stay clear while the whole ribbon rolls towards us.
  const zone = Math.min(480, height * 0.46);
  // On phones a short camera distance magnified the vertical tangent more
  // than the arc shortened it. Pull back smoothly so the rim foreshortens.
  const t = Math.max(0, Math.min(1, (width - 600) / 300));
  const perspective = 1400 - 1000 * t * t * (3 - 2 * t);
  return { width, height, zone: zone / height, rounding: zone * 0.22 / height,
    angle: 88 * Math.PI / 180, perspective: perspective / height,
    flare: 0.5 * (1 - t * t * (3 - 2 * t)) };
}

// The longer phone camera keeps the vertical tangent foreshortened. Restore
// its lateral depth contrast independently, without stretching the center.
function lateralScale(z, shape) {
  const rimDepth = shape.zone / shape.angle * (1 - Math.cos(shape.angle));
  const widen = 1 + (shape.flare || 0) * Math.max(0, -z) / Math.max(rimDepth, 1e-7);
  return shape.perspective / (shape.perspective + z) * widen;
}

function edgePosition(u, shape) {
  const radius = shape.zone / shape.angle;
  const angle = u / radius;
  const t = Math.max(0, Math.min(1, u / shape.rounding));
  // Quintic easing matches position, tangent and curvature at both joins.
  // After this short entry, curvature continues all the way to the rim.
  const blend = t * t * t * (t * (t * 6 - 15) + 10);
  return {
    y: 1 - shape.zone + u + (radius * Math.sin(angle) - u) * blend,
    z: -radius * (1 - Math.cos(angle)) * blend,
  };
}

function foldSource(sy, shape) {
  const edge = 1 - shape.zone;
  if (sy <= edge) return { y: sy, z: 0, alpha: 1 };
  let previousY = edge, previousZ = 0, previousU = 0, match = null;
  // Same 40 segments and last visible intersection as the gallery shader.
  for (let index = 1; index <= 40; index++) {
    const u = shape.zone * index / 40;
    const position = edgePosition(u, shape);
    const screen = 0.5 + (position.y - 0.5) * shape.perspective / (shape.perspective + position.z);
    if (((previousY - sy) * (screen - sy) <= 0 || Math.abs(screen - sy) < 1e-7) && Math.abs(screen - previousY) > 1e-7) {
      const amount = Math.max(0, Math.min(1, (sy - previousY) / (screen - previousY)));
      match = { y: edge + previousU + (u - previousU) * amount,
        z: previousZ + (position.z - previousZ) * amount, alpha: 1 };
    }
    previousY = screen; previousZ = position.z; previousU = u;
  }
  return match || { y: 1, z: previousZ, alpha: 0 };
}

/** Display coordinates -> the unchanged DOM/source coordinates. */
function bendSourcePoint(x, y, shape) {
  const sy = 1 - y / shape.height;
  let sourceY = sy, z = 0, alpha = 1;
  if (sy >= 1 - shape.zone) {
    const folded = foldSource(sy, shape);
    sourceY = folded.y; z = folded.z; alpha = folded.alpha;
  } else if (sy <= shape.zone) {
    const folded = foldSource(1 - sy, shape);
    sourceY = 1 - folded.y; z = folded.z; alpha = folded.alpha;
  }
  const sourceX = 0.5 + (x / shape.width - 0.5) / lateralScale(z, shape);
  if (sourceX < 0 || sourceX > 1 || sourceY < 0 || sourceY > 1 || x < 0 || x > shape.width || y < 0 || y > shape.height) alpha = 0;
  return { x: sourceX * shape.width, y: (1 - sourceY) * shape.height, alpha };
}

/** Source coordinates -> display coordinates, also used to locate QA targets. */
function bendDisplayPoint(x, y, shape) {
  const sy = 1 - y / shape.height;
  const top = sy >= 1 - shape.zone, bottom = sy <= shape.zone;
  if (!top && !bottom) return { x, y };
  const edge = edgePosition((top ? sy : 1 - sy) - (1 - shape.zone), shape);
  const scale = shape.perspective / (shape.perspective + edge.z);
  const projected = 0.5 + (edge.y - 0.5) * scale;
  return { x: shape.width / 2 + (x - shape.width / 2) * lateralScale(edge.z, shape),
    y: (top ? 1 - projected : projected) * shape.height };
}

const BEND_FRAGMENT = `
precision highp float;
uniform sampler2D u_texture;
uniform float u_bendZone;
uniform float u_bendRound;
uniform float u_bendAngle;
uniform float u_bendPersp;
uniform float u_bendFlare;
uniform vec2 u_resolution;
varying vec2 v_uv;
vec3 foldEdge(float sy) {
  float edge = 1.0 - u_bendZone;
  if (sy <= edge) return vec3(sy, 0.0, 1.0);
  float radius = u_bendZone / u_bendAngle;
  float previousY = edge, previousZ = 0.0, previousU = 0.0;
  float bestU = -1.0, bestZ = 0.0;
  for (int i = 1; i <= 40; i++) {
    float u = u_bendZone * float(i) / 40.0;
    float angle = u / radius;
    float t = clamp(u / u_bendRound, 0.0, 1.0);
    float blend = t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
    float y = edge + u + (radius * sin(angle) - u) * blend;
    float z = -radius * (1.0 - cos(angle)) * blend;
    float screen = 0.5 + (y - 0.5) * u_bendPersp / (u_bendPersp + z);
    if (((previousY - sy) * (screen - sy) <= 0.0 || abs(screen - sy) < 1e-7) && abs(screen - previousY) > 1e-7) {
      float amount = clamp((sy - previousY) / (screen - previousY), 0.0, 1.0);
      bestU = mix(previousU, u, amount);
      bestZ = mix(previousZ, z, amount);
    }
    previousY = screen; previousZ = z; previousU = u;
  }
  if (bestU < 0.0) return vec3(1.0, previousZ, 0.0);
  return vec3(edge + bestU, bestZ, 1.0);
}
void main() {
  vec2 source = v_uv;
  float z = 0.0, alpha = 1.0;
  if (v_uv.y >= 1.0 - u_bendZone) {
    vec3 folded = foldEdge(v_uv.y);
    source.y = folded.x; z = folded.y; alpha = folded.z;
  } else if (v_uv.y <= u_bendZone) {
    vec3 folded = foldEdge(1.0 - v_uv.y);
    source.y = 1.0 - folded.x; z = folded.y; alpha = folded.z;
  }
  float rimDepth = u_bendZone / u_bendAngle * (1.0 - cos(u_bendAngle));
  float widen = 1.0 + u_bendFlare * max(0.0, -z) / max(rimDepth, 1e-7);
  source.x = 0.5 + (v_uv.x - 0.5) * (u_bendPersp + z) / u_bendPersp / widen;
  vec2 feather = 1.5 / u_resolution;
  alpha *= smoothstep(vec2(0.0), feather, source).x;
  alpha *= 1.0 - smoothstep(1.0 - feather.x, 1.0, source.x);
  vec3 color = texture2D(u_texture, clamp(source, vec2(0.00001), vec2(0.99999))).rgb;
  gl_FragColor = vec4(mix(vec3(2.0, 3.0, 3.0) / 255.0, color, alpha), 1.0);
}
`;

module.exports = { bendSettings, bendSourcePoint, bendDisplayPoint, BEND_FRAGMENT };
