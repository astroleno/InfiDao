// Adapted from tongye-gallery/src/components/ui/bend.tsx (Canvas UI Bend).
// Extend its top/bottom fold into a continuous arc with a smooth curvature entry.
// The face itself never tilts or tumbles. Pixels and hits share these settings.
// Negative z is nearer in P / (P + z): the top/bottom rim comes towards the
// reader around the farther, flat center, forming the inside of a concave sheet.
const { perlinNoise, PERLIN_GLSL, liquidContactWeight, CONTACT_GLSL, ADHESION_PROFILE_GLSL, LIQUID_OPTICS_GLSL } = require('./stream-liquid');
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

// The unchanged fold depends only on the output row. Cache its exact
// 40-segment intersection at each physical pixel center, with float precision.
function bendRowMap(shape, pixelHeight) {
  const rows = new Float32Array(pixelHeight * 4);
  for (let row = 0; row < pixelHeight; row++) {
    const sy = (row + .5) / pixelHeight;
    let y = sy, z = 0, alpha = 1;
    if (sy >= 1 - shape.zone) {
      const folded = foldSource(sy, shape);
      y = folded.y; z = folded.z; alpha = folded.alpha;
    } else if (sy <= shape.zone) {
      const folded = foldSource(1 - sy, shape);
      y = 1 - folded.y; z = folded.z; alpha = folded.alpha;
    }
    rows.set([y, z, alpha, 1], row * 4);
  }
  return rows;
}

// Smooth material variation follows the content, rather than the clock. Each
// shoulder reaches and releases the rim at a slightly different position.
// Keep these expressions in sync with adhesionProfile in the fragment shader.
function adhesionProfile(x, y, shape) {
  const material = (1 - y) * shape.height + (shape.adhesionScroll || 0);
  const variation = shape.perlin
    ? perlinNoise((x - .5) * shape.width * .019 + 4.3, material * .011 + 7.2, (shape.noisePhase || 0) + .73) * 1.2
    : .5 * Math.sin(material * .023 + x * 11.3 + .8)
    + .3 * Math.sin(material * .041 - x * 23.7 + 2.1)
    + .2 * Math.sin(material * .011 + x * 37.1 + 5.4);
  const depth = (Math.abs(y - .5) - (.5 - shape.zone)) / shape.zone;
  const phase = Math.max(0, Math.min(1, (depth - (.38 + .095 * variation)) / (.58 + .045 * variation)));
  const enter = Math.max(0, Math.min(1, phase / .32));
  const leave = Math.max(0, Math.min(1, (phase - .72) / .28));
  const wet = enter * enter * (3 - 2 * enter) * (1 - leave * leave * (3 - 2 * leave));
  return { variation, phase, wet };
}

function adhesionSourcePoint(x, y, shape) {
  const strength = shape.adhesion || 0;
  if (!strength) return { x, y };
  const { variation, wet } = adhesionProfile(x, y, shape);
  if (shape.contacts) {
    const contact = liquidContactWeight((x - .5) * shape.width,
      (1 - y) * shape.height + (shape.adhesionScroll || 0), shape.perlin ? shape.noisePhase || 0 : undefined);
    const shoulder = Math.pow(contact, .7);
    return {
      // Bound the local stretch in pixels so a large desktop viewport cannot
      // amplify the narrow contact field into a folded-over hit surface.
      x: x - Math.min(1.1, shape.width * .0022) / shape.width * strength * wet * wet * variation * shoulder,
      y: y - Math.sign(y - .5) * Math.min(9, shape.height * .021) / shape.height
        * strength * wet * shoulder * (.85 + .15 * variation),
    };
  }
  const t = Math.max(0, Math.min(1, (Math.abs(x - .5) - .06) / .29));
  const shoulder = .15 + .85 * t * t * (3 - 2 * t);
  return {
    x: .5 + (x - .5) / (1 + .085 * strength * wet * wet * (.8 + .2 * variation))
      - .0018 * strength * wet * wet * variation,
    // This is an inverse texture lookup: sampling inwards makes the displayed
    // strokes stretch outwards, along the original concave fold at BOTH rims.
    y: y - Math.sign(y - .5) * .025 * strength * wet * shoulder * (.85 + .15 * variation),
  };
}

function adhesionDisplayPoint(x, y, shape) {
  if (!shape.adhesion) return { x, y };
  // The small deformation is monotonic. Invert it with Newton steps so
  // keyboard/pointing targets follow exactly the same attached surface.
  let qx = x, qy = y;
  for (let index = 0; index < 7; index++) {
    const p = adhesionSourcePoint(qx, qy, shape);
    const px = adhesionSourcePoint(qx + .00001, qy, shape);
    const py = adhesionSourcePoint(qx, qy + .00001, shape);
    const a = (px.x - p.x) / .00001, b = (py.x - p.x) / .00001;
    const c = (px.y - p.y) / .00001, d = (py.y - p.y) / .00001;
    const determinant = a * d - b * c;
    if (Math.abs(determinant) < .01) break;
    const dx = p.x - x, dy = p.y - y;
    qx -= (d * dx - b * dy) / determinant;
    qy -= (a * dy - c * dx) / determinant;
  }
  return { x: qx, y: qy };
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
  const warped = adhesionSourcePoint(0.5 + (x / shape.width - 0.5) / lateralScale(z, shape), sourceY, shape);
  const sourceX = warped.x;
  sourceY = warped.y;
  if (sourceX < 0 || sourceX > 1 || sourceY < 0 || sourceY > 1 || x < 0 || x > shape.width || y < 0 || y > shape.height) alpha = 0;
  return { x: sourceX * shape.width, y: (1 - sourceY) * shape.height, alpha };
}

/** Source coordinates -> display coordinates, also used to locate QA targets. */
function bendDisplayPoint(x, y, shape) {
  let sy = 1 - y / shape.height;
  if (shape.adhesion) {
    const unwarped = adhesionDisplayPoint(x / shape.width, sy, shape);
    x = unwarped.x * shape.width;
    y = (1 - unwarped.y) * shape.height;
    sy = unwarped.y;
  }
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
uniform float u_bendAdhesion;
uniform float u_bendScroll;
uniform float u_bendLiquid;
uniform float u_bendCaustics;
uniform float u_bendContacts;
uniform float u_bendPerlin;
uniform float u_bendNoisePhase;
uniform sampler2D u_bendLookup;
uniform float u_bendLookupEnabled;
uniform sampler2D u_inkMeta;
uniform vec2 u_resolution;
varying vec2 v_uv;
${PERLIN_GLSL}
${ADHESION_PROFILE_GLSL}
${CONTACT_GLSL}
vec2 adhesionSource(vec2 point) {
  if (abs(point.y - 0.5) <= 0.5 - u_bendZone) return point;
  vec3 profile = adhesionProfile(point);
  float variation = profile.x, wet = profile.z;
  if (wet == 0.0) return point;
  if (u_bendContacts > 0.5) {
    float shoulder = pow(liquidContactWeight(point), 0.7);
    return point - vec2(min(1.1, u_resolution.x * 0.0022) / u_resolution.x
        * u_bendAdhesion * wet * wet * variation * shoulder,
      sign(point.y - 0.5) * min(9.0, u_resolution.y * 0.021) / u_resolution.y
        * u_bendAdhesion * wet * shoulder * (0.85 + 0.15 * variation));
  }
  float shoulder = 0.15 + 0.85 * smoothstep(0.06, 0.35, abs(point.x - 0.5));
  return vec2(0.5 + (point.x - 0.5) / (1.0 + 0.085 * u_bendAdhesion * wet * wet * (0.8 + 0.2 * variation))
      - 0.0018 * u_bendAdhesion * wet * wet * variation,
    point.y - sign(point.y - 0.5) * 0.025 * u_bendAdhesion * wet * shoulder * (0.85 + 0.15 * variation));
}
vec3 meniscus(vec2 point, vec3 color) {
  vec3 profile = adhesionProfile(point);
  float variation = profile.x, phase = profile.y, wet = profile.z;
  if (wet < 0.001) return color;
  // Advect real glyph material towards the rim. The tapered, slightly bent
  // neck follows the sheet's tangent; there is no separate horizontal bead.
  // Source-space distance is deliberately longer near the rim: the unchanged
  // 88-degree fold strongly foreshortens it in the final displayed image.
  float length = (7.0 + 45.0 * smoothstep(0.05, 0.85, phase))
    * u_bendAdhesion * (0.85 + 0.15 * variation);
  vec2 tangent = vec2((point.x - 0.5) * 0.38, sign(point.y - 0.5));
  float slip = variation * 5.5 * wet;
  vec4 field = texture2D(u_inkMeta, point);
  vec2 contour = point;
  for (int i = 1; i <= 10; i++) {
    float t = float(i) / 10.0;
    vec2 samplePoint = point - (tangent * length * t + vec2(slip * t * t, 0.0)) / u_resolution;
    vec4 patch = texture2D(u_inkMeta, samplePoint) * (0.88 - 0.78 * t);
    if (patch.a > field.a) { field = patch; contour = samplePoint; }
  }
  float shoulder = smoothstep(0.04, 0.65, field.b / max(field.a, 0.001));
  wet *= shoulder;
  if (wet < 0.001) return color;
  vec2 radius = vec2(1.5) / u_resolution;
  vec4 left = texture2D(u_inkMeta, contour - vec2(radius.x, 0.0));
  vec4 right = texture2D(u_inkMeta, contour + vec2(radius.x, 0.0));
  vec4 nearSide = texture2D(u_inkMeta, contour - vec2(0.0, radius.y));
  vec4 farSide = texture2D(u_inkMeta, contour + vec2(0.0, radius.y));
  float opacity = clamp(field.r / max(field.a, 0.001), 0.0, 1.0);
  float energy = clamp(field.g / max(field.a, 0.001), 0.0, 1.0);
  float gradient = (right.a - left.a) * 0.65 + (farSide.a - nearSide.a) * 0.45;
  float threshold = mix(0.20, 0.11 + variation * 0.018, shoulder);
  vec3 spectrum = smoothstep(vec3(threshold), vec3(threshold + 0.13), vec3(field.a + gradient, field.a, field.a - gradient));
  float body = smoothstep(threshold + 0.10, threshold + 0.28, field.a);
  vec3 film = max(vec3(body * 0.98), spectrum * 0.78);
  return max(color, film * wet * opacity * (0.65 + energy * 0.35));
}
${LIQUID_OPTICS_GLSL}
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
#ifdef BEND_LOOKUP_ONLY
  vec3 folded = texture2D(u_bendLookup, vec2(0.5, v_uv.y)).rgb;
  source.y = folded.x; z = folded.y; alpha = folded.z;
#else
  if (u_bendLookupEnabled > 0.5) {
    vec3 folded = texture2D(u_bendLookup, vec2(0.5, v_uv.y)).rgb;
    source.y = folded.x; z = folded.y; alpha = folded.z;
  } else if (v_uv.y >= 1.0 - u_bendZone) {
    vec3 folded = foldEdge(v_uv.y);
    source.y = folded.x; z = folded.y; alpha = folded.z;
  } else if (v_uv.y <= u_bendZone) {
    vec3 folded = foldEdge(1.0 - v_uv.y);
    source.y = 1.0 - folded.x; z = folded.y; alpha = folded.z;
  }
#endif
  if (alpha == 0.0) { gl_FragColor = vec4(vec3(2.0, 3.0, 3.0) / 255.0, 1.0); return; }
  float rimDepth = u_bendZone / u_bendAngle * (1.0 - cos(u_bendAngle));
  float widen = 1.0 + u_bendFlare * max(0.0, -z) / max(rimDepth, 1e-7);
  source.x = 0.5 + (v_uv.x - 0.5) * (u_bendPersp + z) / u_bendPersp / widen;
  if (u_bendAdhesion > 0.0) source = adhesionSource(source);
  vec2 feather = 1.5 / u_resolution;
  alpha *= smoothstep(vec2(0.0), feather, source).x;
  alpha *= 1.0 - smoothstep(1.0 - feather.x, 1.0, source.x);
  vec3 color = texture2D(u_texture, clamp(source, vec2(0.00001), vec2(0.99999))).rgb;
  if (u_bendLiquid > 0.5) color = liquidOptics(source, color);
  else if (u_bendAdhesion > 0.0) color = meniscus(source, color);
  gl_FragColor = vec4(mix(vec3(2.0, 3.0, 3.0) / 255.0, color, alpha), 1.0);
}
`;

module.exports = { bendSettings, bendSourcePoint, bendDisplayPoint, bendRowMap, BEND_FRAGMENT };
