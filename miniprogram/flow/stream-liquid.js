// Sparse contact patches in content space. Their position follows the actual
// lettering through a fold, including strokes in the middle of a line. The
// broad shoulders carry neighbouring strokes; only the core grows a neck.
// Keep this field in sync with liquidContactWeight in CONTACT_GLSL below.
const noisePermutation = Uint16Array.from({ length: 289 }, (_, p) => ((p * 34 + 1) * p) % 289);
const noisePermute = n => noisePermutation[n - Math.floor(n / 289) * 289];
const noiseFade = t => t * t * t * (t * (t * 6 - 15) + 10);
const noiseMix = (a, b, t) => a + (b - a) * t;
function noiseGradient(hash, dx, dy, dz) {
  const h = hash % 16;
  const u = h < 8 ? dx : dy;
  const v = h < 4 ? dy : h === 12 || h === 14 ? dx : dz;
  return (h % 2 < 1 ? u : -u) + (Math.floor(h / 2) % 2 < 1 ? v : -v);
}
function perlinNoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const dx = x - ix, dy = y - iy, dz = z - iz;
  const u = noiseFade(dx), v = noiseFade(dy), w = noiseFade(dz);
  const hx = noisePermute(ix), hx1 = noisePermute(ix + 1);
  const h00 = noisePermute(hx + iy), h10 = noisePermute(hx1 + iy);
  const h01 = noisePermute(hx + iy + 1), h11 = noisePermute(hx1 + iy + 1);
  const lower = noiseMix(
    noiseMix(noiseGradient(noisePermute(h00 + iz), dx, dy, dz), noiseGradient(noisePermute(h10 + iz), dx - 1, dy, dz), u),
    noiseMix(noiseGradient(noisePermute(h01 + iz), dx, dy - 1, dz), noiseGradient(noisePermute(h11 + iz), dx - 1, dy - 1, dz), u), v);
  const upper = noiseMix(
    noiseMix(noiseGradient(noisePermute(h00 + iz + 1), dx, dy, dz - 1), noiseGradient(noisePermute(h10 + iz + 1), dx - 1, dy, dz - 1), u),
    noiseMix(noiseGradient(noisePermute(h01 + iz + 1), dx, dy - 1, dz - 1), noiseGradient(noisePermute(h11 + iz + 1), dx - 1, dy - 1, dz - 1), u), v);
  return noiseMix(lower, upper, w);
}

// The visible field touches only a small rectangle of integer noise cells.
// Cache their exact two z-plane gradients, not sampled/interpolated noise.
// Fractional coordinates, quintic interpolation and phase still run per pixel.
function noiseHashGrid(width, height, scroll, phase, contact, previous) {
  const sx = contact ? .034 : .019, sy = contact ? .012 : .011;
  const ox = contact ? 11.7 : 4.3, oy = contact ? 3.1 : 7.2;
  // A two-cell guard also covers floating-point boundary rounding in GLSL.
  const left = Math.floor(-width * .5 * sx + ox) - 2;
  const top = Math.floor(scroll * sy + oy) - 2;
  const columns = Math.floor(width * .5 * sx + ox) + 3 - left + 1;
  const rows = Math.floor((scroll + height) * sy + oy) + 3 - top + 1;
  const z = Math.floor(contact ? Math.fround(phase) : Math.fround(Math.fround(phase) + Math.fround(.73)));
  if (previous && previous.left === left && previous.top === top && previous.width === columns
    && previous.height === rows && previous.z === z) return previous;
  const data = previous?.data.length === columns * rows * 4 ? previous.data : new Uint8Array(columns * rows * 4);
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    const xy = noisePermute(noisePermute(left + x) + top + y), at = (y * columns + x) * 4;
    data[at] = noisePermute(xy + z) % 16;
    data[at + 1] = noisePermute(xy + z + 1) % 16;
    data[at + 3] = 255;
  }
  return { left, top, width: columns, height: rows, z, data };
}

// Integer-valued permutations stay exactly representable in WebGL 1 floats,
// so the pointer inverse and the shader use the same gradient-noise field.
const PERLIN_GLSL = `
#ifdef NOISE_HASH_CACHE
uniform sampler2D u_noiseHashContact;
uniform sampler2D u_noiseHashSurface;
uniform vec4 u_noiseContactBounds;
uniform vec4 u_noiseSurfaceBounds;
uniform float u_noiseHashEnabled;
vec2 noiseHashPair(vec2 cell, float surface) {
  vec4 bounds = surface > 0.5 ? u_noiseSurfaceBounds : u_noiseContactBounds;
  vec2 uv = (cell - bounds.xy + 0.5) / bounds.zw;
  vec2 pair = surface > 0.5 ? texture2D(u_noiseHashSurface, uv).rg : texture2D(u_noiseHashContact, uv).rg;
  return floor(pair * 255.0 + 0.5);
}
#endif
float noiseMod(float n) { return n - floor(n / 289.0) * 289.0; }
float noisePermute(float n) { float p = noiseMod(n); return noiseMod((p * 34.0 + 1.0) * p); }
float noiseGradient(float hash, vec3 d) {
  float h = mod(hash, 16.0);
  float u = h < 8.0 ? d.x : d.y;
  float v = h < 4.0 ? d.y : (h == 12.0 || h == 14.0 ? d.x : d.z);
  return (mod(h, 2.0) < 1.0 ? u : -u) + (mod(floor(h / 2.0), 2.0) < 1.0 ? v : -v);
}
float perlinNoise(vec3 point, float surface) {
  vec3 cell = floor(point), d = point - cell;
  vec3 f = d * d * d * (d * (d * 6.0 - 15.0) + 10.0);
#ifdef NOISE_HASH_CACHE
  if (u_noiseHashEnabled > 0.5) {
    vec2 h00 = noiseHashPair(cell.xy, surface), h10 = noiseHashPair(cell.xy + vec2(1, 0), surface);
    vec2 h01 = noiseHashPair(cell.xy + vec2(0, 1), surface), h11 = noiseHashPair(cell.xy + vec2(1, 1), surface);
    float lower = mix(
      mix(noiseGradient(h00.x, d), noiseGradient(h10.x, d - vec3(1, 0, 0)), f.x),
      mix(noiseGradient(h01.x, d - vec3(0, 1, 0)), noiseGradient(h11.x, d - vec3(1, 1, 0)), f.x), f.y);
    float upper = mix(
      mix(noiseGradient(h00.y, d - vec3(0, 0, 1)), noiseGradient(h10.y, d - vec3(1, 0, 1)), f.x),
      mix(noiseGradient(h01.y, d - vec3(0, 1, 1)), noiseGradient(h11.y, d - vec3(1, 1, 1)), f.x), f.y);
    return mix(lower, upper, f.z);
  }
#endif
  // Adjacent corners share their x/xy permutations, just as the CPU field
  // does. Keep the same gradients while avoiding repeated hash arithmetic.
  float hx = noisePermute(cell.x), hx1 = noisePermute(cell.x + 1.0);
  float h00 = noisePermute(hx + cell.y), h10 = noisePermute(hx1 + cell.y);
  float h01 = noisePermute(hx + cell.y + 1.0), h11 = noisePermute(hx1 + cell.y + 1.0);
  float lower = mix(
    mix(noiseGradient(noisePermute(h00 + cell.z), d), noiseGradient(noisePermute(h10 + cell.z), d - vec3(1, 0, 0)), f.x),
    mix(noiseGradient(noisePermute(h01 + cell.z), d - vec3(0, 1, 0)), noiseGradient(noisePermute(h11 + cell.z), d - vec3(1, 1, 0)), f.x), f.y);
  float upper = mix(
    mix(noiseGradient(noisePermute(h00 + cell.z + 1.0), d - vec3(0, 0, 1)), noiseGradient(noisePermute(h10 + cell.z + 1.0), d - vec3(1, 0, 1)), f.x),
    mix(noiseGradient(noisePermute(h01 + cell.z + 1.0), d - vec3(0, 1, 1)), noiseGradient(noisePermute(h11 + cell.z + 1.0), d - vec3(1, 1, 1)), f.x), f.y);
  return mix(lower, upper, f.z);
}
`;

function liquidContactWeight(x, materialY, phase) {
  if (phase !== undefined) {
    const signal = .5 + perlinNoise(x * .034 + 11.7, materialY * .012 + 3.1, phase) * .95;
    const t = Math.max(0, Math.min(1, (signal - .42) / .32));
    return t * t * (3 - 2 * t);
  }
  const signal = .62 * Math.sin(x * .074 + materialY * .027 + 1.8)
    + .28 * Math.sin(x * .137 - materialY * .021 + .4)
    + .1 * Math.sin(x * .043 + materialY * .031 + 3.7);
  const t = Math.max(0, Math.min(1, (signal - .12) / .58));
  return t * t * (3 - 2 * t);
}

const CONTACT_GLSL = `
float liquidContactWeight(vec2 point) {
  float x = (point.x - 0.5) * u_resolution.x;
  float material = (1.0 - point.y) * u_resolution.y + u_bendScroll;
  if (u_bendPerlin > 0.5) {
    float signal = 0.5 + perlinNoise(vec3(x * 0.034 + 11.7, material * 0.012 + 3.1, u_bendNoisePhase), 0.0) * 0.95;
    return smoothstep(0.42, 0.74, signal);
  }
  float signal = 0.62 * sin(x * 0.074 + material * 0.027 + 1.8)
    + 0.28 * sin(x * 0.137 - material * 0.021 + 0.4)
    + 0.1 * sin(x * 0.043 + material * 0.031 + 3.7);
  return smoothstep(0.12, 0.70, signal);
}
`;

// A scroll-position-driven surface, shared by the liquid field and the bend.
// The opt-in Perlin profile evolves with travelled scroll distance. Pausing
// holds the field; reversing continues its flow rather than replaying it.
const ADHESION_PROFILE_GLSL = `
vec3 adhesionProfile(vec2 point) {
  float depth = (abs(point.y - 0.5) - (0.5 - u_bendZone)) / u_bendZone;
  // Each Perlin corner is a sum of two unit-bounded offsets; interpolation
  // keeps variation within +/-2.4. The earliest wet threshold is therefore
  // .38 - .095 * 2.4 = .152. Below .15 every caller returns its dry result.
  if (depth <= 0.15) return vec3(0.0);
  float material = (1.0 - point.y) * u_resolution.y + u_bendScroll;
  float variation = 0.5 * sin(material * 0.023 + point.x * 11.3 + 0.8)
    + 0.3 * sin(material * 0.041 - point.x * 23.7 + 2.1)
    + 0.2 * sin(material * 0.011 + point.x * 37.1 + 5.4);
  if (u_bendPerlin > 0.5) variation = perlinNoise(vec3(
    (point.x - 0.5) * u_resolution.x * 0.019 + 4.3, material * 0.011 + 7.2, u_bendNoisePhase + 0.73), 1.0) * 1.2;
  float phase = clamp((depth - (0.38 + 0.095 * variation)) / (0.58 + 0.045 * variation), 0.0, 1.0);
  float wet = smoothstep(0.0, 0.32, phase) * (1.0 - smoothstep(0.72, 1.0, phase));
  return vec3(variation, phase, wet);
}
`;

// Build the continuous surface once in a small offscreen buffer. Its alpha is
// height; RGB carries a short source offset and the material's light energy.
// Transporting the real lettering into the neck preserves its material while
// derivatives of this SAME height drive every optical cue.
const LIQUID_FIELD_FRAGMENT = `
precision highp float;
uniform sampler2D u_inkMeta;
uniform sampler2D u_inkMetaNext;
uniform float u_inkMetaMix;
uniform vec2 u_sourceWindow;
uniform vec2 u_resolution;
uniform float u_bendZone;
uniform float u_bendAdhesion;
uniform float u_bendScroll;
uniform float u_bendContacts;
uniform float u_bendPerlin;
uniform float u_bendNoisePhase;
varying vec2 v_uv;
${PERLIN_GLSL}
${ADHESION_PROFILE_GLSL}
vec4 contactPatch(sampler2D mask, vec2 point) {
  vec2 uv = clamp(point, vec2(0.0), vec2(1.0));
  float x = (uv.x - u_sourceWindow.x) / u_sourceWindow.y;
  if ((x < 0.0 && u_sourceWindow.x > 0.0)
    || (x > 1.0 && u_sourceWindow.x + u_sourceWindow.y < 0.999999)) return vec4(0.0);
  return texture2D(mask, vec2(x, uv.y));
}
void main() {
  if (abs(v_uv.y - 0.5) <= 0.5 - u_bendZone) {
    gl_FragColor = vec4(128.0 / 255.0, 128.0 / 255.0, 0.0, 0.0); return;
  }
  vec3 profile = adhesionProfile(v_uv);
  float variation = profile.x, phase = profile.y, wet = profile.z;
  if (wet < 0.001) { gl_FragColor = vec4(128.0 / 255.0, 128.0 / 255.0, 0.0, 0.0); return; }
  float material = (1.0 - v_uv.y) * u_resolution.y + u_bendScroll;
  // The x component of a curl field derived from the material potential.
  // Boundary-normal flow is supplied by the existing outward fold; this small
  // tangential component lets the contact slide without boiling the lettering.
  float slide = 0.5 * 0.023 * cos(material * 0.023 + v_uv.x * 11.3 + 0.8)
    + 0.3 * 0.041 * cos(material * 0.041 - v_uv.x * 23.7 + 2.1)
    + 0.2 * 0.011 * cos(material * 0.011 + v_uv.x * 37.1 + 5.4);
  if (u_bendPerlin > 0.5) slide = variation * 0.018;
  float release = smoothstep(0.68, 0.98, phase);
  float stretch = (8.0 + 44.0 * smoothstep(0.08, 0.73, phase))
    * u_bendAdhesion * (0.85 + 0.15 * variation) * (1.0 - release * 0.67);
  vec2 tangent = vec2((v_uv.x - 0.5) * 0.38 + slide * 5.0, sign(v_uv.y - 0.5));
  vec4 field = vec4(0.0);
  vec2 origin = v_uv;
  for (int i = 0; i <= 12; i++) {
    float t = float(i) / 12.0;
    float slip = (variation * 4.5 + slide * 30.0) * wet * t * t;
    vec2 point = v_uv - (tangent * stretch * t + vec2(slip, 0.0)) / u_resolution;
    vec4 patch = contactPatch(u_inkMeta, point);
    if (u_inkMetaMix > 0.0) patch = mix(patch,
      contactPatch(u_inkMetaNext, point), u_inkMetaMix);
    // An empty contact cannot contribute to the maximum or its origin.
    // Preserve every nonzero sample, including the faint blurred shoulders.
    if (patch.a == 0.0) continue;
    float edge = patch.b / max(patch.a, 0.001);
    float shoulder = smoothstep(0.04, 0.65, edge);
    // A broad root becomes a narrow capillary neck as it stretches. The band
    // follows the real line end, including across individual token boundaries.
    float width = mix(0.48, 0.14, smoothstep(0.0, 0.9, t) * (0.55 + phase * 0.45));
    float neck = exp(-pow((edge - 0.64) / width, 2.0));
    float taper = (0.92 - 0.78 * t) * (1.0 - release * t * 0.8);
    if (u_bendContacts > 0.5) {
      // B now describes a contact patch anywhere on the glyph contour. A
      // wider root carries its neighbours, a concave waist thins, and the
      // small rounded tip releases after the waist closes. Different local
      // phases keep the contacts from separating in unison.
      float waist = exp(-pow((t - 0.56) / 0.23, 2.0));
      float tension = smoothstep(0.12, 0.74, phase);
      float pinch = smoothstep(0.60, 0.94, phase);
      neck = pow(clamp(edge, 0.0, 1.0), 1.0 + waist * (2.2 + tension * 3.5));
      shoulder = smoothstep(0.035, 0.52, edge);
      taper = (0.96 - 0.62 * t) * (1.0 - pinch * waist * 0.96)
        * (1.0 - smoothstep(0.82, 1.0, phase) * t);
    }
    // Spreading material along the neck reduces its thickness rather than
    // creating the opaque, equally wide white wedges of the previous version.
    float volume = inversesqrt(1.0 + stretch * t * 0.025);
    patch *= shoulder * mix(1.0, neck, smoothstep(0.0, 0.42, t)) * taper * volume;
    // Smooth maxima avoid a crease where neighbouring stroke contributions
    // exchange ownership. Empty space never receives the smoothing bias.
    if (patch.a > 0.002 && field.a > 0.002) {
      float blend = clamp(0.5 + 0.5 * (patch.a - field.a) / 0.025, 0.0, 1.0);
      origin = mix(origin, point, blend);
      field = mix(field, patch, blend);
      field.a += 0.025 * blend * (1.0 - blend);
    } else if (patch.a > field.a) { field = patch; origin = point; }
  }
  float energy = clamp(field.g / max(field.a, 0.001), 0.0, 1.0);
  float height = smoothstep(0.025, 0.27, field.a) * wet
    * (0.87 + 0.13 * variation) * (0.25 + 0.75 * energy);
  float opacity = clamp(field.r / max(field.a, 0.001), 0.0, 1.0);
  // Short offsets keep subpixel precision in WebGL 1's RGBA8 buffers, even at
  // a thin neck. Absolute UV divided by a tiny height would amplify rounding.
  vec2 transport = vec2(128.0 / 255.0) + (origin - v_uv) * u_resolution / vec2(40.0, 128.0);
  gl_FragColor = vec4(transport, opacity * energy, height);
}
`;

// This is a local, shallow lens approximation, not a pool-water simulation.
// Its normals, reflection and bounded light concentration share one surface.
const LIQUID_OPTICS_GLSL = `
vec2 liquidRay(vec3 normal, vec3 incoming, float ior) {
  vec3 ray = refract(incoming, normal, 1.0 / ior);
  vec3 reference = refract(incoming, vec3(0.0, 0.0, 1.0), 1.0 / ior);
  // The parent glass already refracts the flat sheet. Apply only the local
  // membrane's extra throw, evaluated at the fold's oblique viewing angle.
  return ray.xy / max(-ray.z, 0.25) - reference.xy / max(-reference.z, 0.25);
}
vec2 liquidUv(vec2 point, vec2 ray, float thickness) {
  return clamp(point + ray * thickness / u_resolution,
    vec2(0.00001), vec2(0.99999));
}
vec3 liquidColor(vec2 point) {
  // A little transmission scattering prevents the stretched ink texture from
  // turning into hard metallic grooves in the otherwise smooth water film.
  vec2 r = vec2(u_bendContacts > 0.5 ? 2.6 : 1.35) / u_resolution;
  return texture2D(u_texture, point).rgb * 0.4
    + texture2D(u_texture, point + vec2(r.x, 0.0)).rgb * 0.15
    + texture2D(u_texture, point - vec2(r.x, 0.0)).rgb * 0.15
    + texture2D(u_texture, point + vec2(0.0, r.y)).rgb * 0.15
    + texture2D(u_texture, point - vec2(0.0, r.y)).rgb * 0.15;
}
vec3 liquidOptics(vec2 point, vec3 color) {
  vec4 field = texture2D(u_inkMeta, point);
  float height = field.a;
  if (height < 0.004) return color;
  vec2 origin = clamp(point + (field.rg - vec2(128.0 / 255.0)) * vec2(40.0, 128.0) / u_resolution,
    vec2(0.00001), vec2(0.99999));
  float energy = field.b;
  vec2 px = vec2(2.0) / u_resolution;
  float left = texture2D(u_inkMeta, point - vec2(px.x, 0.0)).a;
  float right = texture2D(u_inkMeta, point + vec2(px.x, 0.0)).a;
  float below = texture2D(u_inkMeta, point - vec2(0.0, px.y)).a;
  float above = texture2D(u_inkMeta, point + vec2(0.0, px.y)).a;
  vec2 gradient = vec2(right - left, above - below) / 4.0;
  gradient *= min(1.0, 0.11 / max(length(gradient), 0.0001));
  vec3 normal = normalize(vec3(-gradient * 6.5, 1.0));
  float depth = clamp((abs(point.y - 0.5) - (0.5 - u_bendZone)) / u_bendZone, 0.0, 1.0);
  float angle = depth * u_bendAngle * 0.6;
  vec3 incoming = vec3(0.0, sign(point.y - 0.5) * sin(angle), -cos(angle));
  float thickness = (3.0 + height * 4.5) * (1.0 + depth * 0.75);
  vec2 redRay = liquidRay(normal, incoming, 1.315);
  vec2 greenRay = liquidRay(normal, incoming, 1.335);
  vec2 blueRay = liquidRay(normal, incoming, 1.355);
  vec3 transmitted = vec3(
    liquidColor(liquidUv(origin, redRay, thickness)).r,
    liquidColor(liquidUv(origin, greenRay, thickness)).g,
    liquidColor(liquidUv(origin, blueRay, thickness)).b);
  float coverage = pow(height, 0.55) * smoothstep(0.004, 0.05, height);
  float grazing = 1.0 - max(dot(normal, -incoming), 0.0);
  // Wavelength footprints separate along the same surface normal. Limit this
  // artistic dispersion to a narrow rim; the carried light already contains
  // its source opacity, which must not be applied a second time here.
  vec2 fringe = gradient / max(length(gradient), 0.02)
    * (0.65 + 1.35 * sqrt(max(grazing, 0.0))) / u_resolution;
  float redHeight = texture2D(u_inkMeta, point + fringe).a;
  float blueHeight = texture2D(u_inkMeta, point - fringe).a;
  vec3 footprint = pow(vec3(redHeight, height, blueHeight), vec3(0.55))
    * smoothstep(0.004, 0.05, height);
  vec3 result = mix(color, transmitted * exp(-height * 0.075), footprint * 0.9);
  float fresnel = 0.02 + 0.98 * pow(grazing, 5.0);
  vec3 halfway = normalize(normalize(vec3(-0.45, 0.65, 0.9)) - incoming);
  float highlight = pow(max(0.0, dot(normal, halfway)), 32.0);
  float boundary = 1.0 - smoothstep(0.18, 0.82, height);
  float reflection = fresnel * 0.46 + highlight * (0.07 + boundary * 0.28);
  result += vec3(reflection) * coverage * energy;
  if (u_bendCaustics > 0.0) {
    float nw = texture2D(u_inkMeta, point + vec2(-px.x, px.y)).a;
    float ne = texture2D(u_inkMeta, point + px).a;
    float sw = texture2D(u_inkMeta, point - px).a;
    float se = texture2D(u_inkMeta, point + vec2(px.x, -px.y)).a;
    vec2 curvature = vec2(right + left - 2.0 * height, above + below - 2.0 * height) / 4.0;
    float crossCurvature = (ne + sw - nw - se) / 16.0;
    // The Jacobian of a shallow refracted-ray footprint: compressing its area
    // concentrates light. Clamp the footprint to avoid singular bright flashes.
    float travel = thickness * 6.5 * (1.0 - 1.0 / 1.335);
    float area = (1.0 + travel * curvature.x) * (1.0 + travel * curvature.y)
      - pow(travel * crossCurvature, 2.0);
    float focus = clamp(1.0 / max(abs(area), 0.38) - 1.0, 0.0, 1.35);
    result += transmitted * focus * u_bendCaustics * coverage;
    result += vec3(highlight * focus * 0.09) * u_bendCaustics * coverage;
  }
  return clamp(result, vec3(0.0), vec3(1.0));
}
`;

module.exports = { perlinNoise, noiseHashGrid, PERLIN_GLSL, liquidContactWeight, CONTACT_GLSL, ADHESION_PROFILE_GLSL, LIQUID_FIELD_FRAGMENT, LIQUID_OPTICS_GLSL };
