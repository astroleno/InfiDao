const NOISE_SIZE = 64;
const BASE_LIGHT = 0.021;
const BREATH_LIGHT = 0.004;
const GRAIN_RANGE = 0.010;

function inkLight(phase = 0, reducedMotion = false) {
  return BASE_LIGHT + (reducedMotion ? 0 : Math.sin(phase * Math.PI * 2) * BREATH_LIGHT);
}

// A fixed 4 KiB luminance tile. Grain never changes with frame time.
function grainPixels() {
  const pixels = new Uint8Array(NOISE_SIZE * NOISE_SIZE);
  let seed = 0x62e29ac5;
  for (let i = 0; i < pixels.length; i++) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    pixels[i] = seed >>> 24;
  }
  return pixels;
}

// u_resolution is in logical pixels, while gl_FragCoord is in backing pixels.
// The same field is used inside and outside the front glass to avoid a seam.
const INK_GLSL = `
uniform sampler2D u_noise;
uniform float u_dpr;
uniform float u_inkLight;
vec3 inkBackground() {
  vec2 p = gl_FragCoord.xy / (u_resolution * u_dpr) * 2.0 - 1.0;
  float field = pow(max(1.0 - dot(p, p), 0.0), 2.0);
  float grain = texture2D(u_noise, gl_FragCoord.xy / (u_dpr * ${NOISE_SIZE}.0)).r - 0.5;
  return vec3(field * (u_inkLight + grain * ${GRAIN_RANGE.toFixed(3)}));
}
`;

module.exports = { NOISE_SIZE, inkLight, grainPixels, INK_GLSL };
