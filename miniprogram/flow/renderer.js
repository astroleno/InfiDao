const { atlasLayout, paintAtlas } = require('./atlas');
const { CELL, CENTER_PHASE, modulo } = require('./timeline');
const { CENTER_SCALE, ROW_TURN_MIN, ROW_TURN_STEP, sceneMetrics, wheelGeometry, quotationGeometry, projectedRows, projectedGlyphs } = require('./scene');
const { ranges, selectionFor } = require('./classic-text');
const { NOISE_SIZE, inkLight, grainPixels, INK_GLSL } = require('./atmosphere');
const { BEND_FRAGMENT, bendRowMap } = require('./stream-bend');
const { LIQUID_FIELD_FRAGMENT, noiseHashGrid } = require('./stream-liquid');

const BACKGROUND_VERTEX = `
attribute vec3 a_position;
void main() { gl_Position = vec4(a_position, 1.0); }
`;
const BACKGROUND_FRAGMENT = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_opticalProfile;
${INK_GLSL}
void main() { gl_FragColor = vec4(mix(inkBackground(), vec3(2.0, 3.0, 3.0) / 255.0, u_opticalProfile), 1.0); }
`;

const VERTEX = `
precision highp float;
attribute vec3 a_position;
attribute vec3 a_normal;
attribute vec2 a_uv;
uniform vec2 u_resolution;
uniform float u_glyph;
uniform float u_cursor;
uniform float u_rowOffset;
uniform float u_count;
uniform float u_loop;
uniform float u_radius;
uniform float u_arc;
uniform float u_curl;
uniform float u_recede;
uniform float u_pitch;
varying vec3 v_position;
varying vec3 v_normal;
varying vec2 v_uv;
void main() {
  vec3 p = a_position;
  vec3 n = a_normal;
  if (u_glyph > 0.5) {
    float localY = (u_cursor - a_normal.x) * u_pitch;
    float period = u_count * u_pitch;
    if (u_loop > 0.5) localY = mod(localY + period * 0.5, period) - period * 0.5;
    // Adjacent horizontal rings turn in opposite directions at five quiet
    // paces. A row retains its identity across the content loop, and arrives
    // facing the reader rather than exposing a gap between repeated phrases.
    float raw = localY / u_pitch;
    float d = raw - a_normal.y;
    float ordinal = floor(u_cursor - raw + 0.5) + u_rowOffset;
    float turn = (1.0 - 2.0 * mod(ordinal, 2.0)) *
      (${ROW_TURN_MIN} + mod(ordinal * 3.0, 5.0) * ${ROW_TURN_STEP});
    float angle = a_position.x - d * turn;
    // Screen-space ribbon: rows land on a sine profile — evenly spread at the
    // center, compressed towards the edges, filling the canvas exactly top to
    // bottom on any device. Each row's plane pitches around its own tangent,
    // upright at the reading line, lying almost flat at the edge and always
    // facing the reader; recession pushes distant rows back for the lens.
    // Scale each whole row around its own baseline, continuously and
    // symmetrically. The focused line grows; its upper/lower neighbours recede.
    float rowScale = 0.62 + (${CENTER_SCALE} - 0.62) * exp(-d * d * 0.55);
    float glyphY = a_position.z * rowScale;
    float front = max(u_resolution.y * 0.5 - u_radius, u_pitch);
    float edge = front / u_pitch;
    float t = min(abs(d) / edge, 1.0);
    float phi = sign(d) * u_arc * pow(max(t, 1e-4), u_curl);
    float sp = sin(phi), cp = cos(phi);
    float recession = u_recede * (1.0 - cp);
    float cz = cos(angle) * (u_radius + 0.8) - sin(angle) * a_position.y;
    float pz = cz - glyphY * sp - recession;
    float ndc = sign(d) * sin(t * 1.5396);
    float w = u_resolution.y * 0.5 - pz;
    p = vec3((sin(angle) * (u_radius + 0.8) + cos(angle) * a_position.y) * rowScale,
      ndc * w + glyphY * cp,
      pz);
    n = vec3(sin(angle) * cp, sp, cos(angle) * cp);
  }
  float camera = u_resolution.y * 0.5;
  float w = camera - p.z;
  float far = u_resolution.y * 4.0;
  gl_Position = vec4(p.x * camera * 2.0 / u_resolution.x,
    p.y * camera * 2.0 / u_resolution.y,
    (far + 1.0) / (far - 1.0) * w - 2.0 * far / (far - 1.0), w);
  v_position = p;
  v_normal = n;
  v_uv = a_uv;
}
`;

const FOCUS = `
uniform vec2 u_resolution;
uniform float u_pitch;
uniform float u_radius;
uniform float u_final;
uniform float u_reading;
uniform float u_readingAmbient;
uniform float u_opticalProfile;
uniform float u_chromaticStrength;
uniform float u_edgeFadeStart;
varying vec3 v_position;
varying vec3 v_normal;
// Edge fade lives in the fragment stage: the glass wall is one quad strip
// with vertices only at ±height, so a vertex-level fade interpolates to zero
// across the whole wall and the glass vanishes.
float edgeFade() {
  float camera = u_resolution.y * 0.5;
  float ndcY = v_position.y / (camera - v_position.z);
  return 1.0 - smoothstep(u_edgeFadeStart, 0.995, abs(ndcY));
}
// Camera-lens depth of field: blur follows real distance from the focal
// plane (the centered reading line), not line index.
float depthBlur() {
  float camera = u_resolution.y * 0.5;
  float dist = camera - v_position.z;
  float focal = camera - (u_radius + 0.8);
  return clamp(abs(dist - focal) * 0.007, 0.0, 0.8);
}
float centerWeight() { float d = v_position.y / u_pitch; return exp(-d * d * 0.55); }
float opticalDefocus() {
  // Row-plane tilt is constant across a glyph: its top/bottom strokes must
  // not acquire colour fringes while the whole reading line is in focus.
  float y = abs(v_normal.y);
  // Overlapping focal bands interpolate without hard depth boundaries.
  float layers = 0.18 * smoothstep(0.08, 0.24, y)
    + 0.24 * smoothstep(0.24, 0.50, y)
    + 0.38 * smoothstep(0.50, 0.90, y);
  return mix(depthBlur(), max(depthBlur() * smoothstep(0.08, 0.24, y), layers), u_opticalProfile);
}
float chromaticSpread() {
  // Defocused peripheral rows retain quiet, stationary dispersion on pause.
  // The focal row remains white because its opticalDefocus is zero.
  float resting = min(u_readingAmbient * 2.0, 0.6) * smoothstep(0.16, 0.60, abs(v_normal.y));
  return mix(1.0, mix(1.0, resting, u_reading) * u_chromaticStrength, u_opticalProfile);
}
float opacity() {
  float camera = u_resolution.y * 0.5;
  float y = v_position.y / (camera - v_position.z);
  // Keep the centered quotation intact. The other rings recede, and the
  // space below it clears for the native reading layer.
  float quiet = (1.0 - 0.97 * smoothstep(0.10, 0.32, abs(y))) * smoothstep(-0.30, -0.12, y);
  quiet = max(quiet, u_readingAmbient * smoothstep(0.12, 0.32, y));
  float reading = u_final > 0.5 ? mix(1.0, quiet, u_reading) : 1.0;
  return (u_final > 0.5 ? 1.0 - depthBlur() * 0.4 : 1.0) * edgeFade() * reading;
}
`;

const TEXT_FRAGMENT = `
precision highp float;
uniform sampler2D u_texture;
uniform float u_atlasSize;
varying vec2 v_uv;
${FOCUS}
float glyphAlpha(vec2 uv, float blur) {
  float a = texture2D(u_texture, uv).a * 0.36;
  a += texture2D(u_texture, uv + vec2(blur, 0.0)).a * 0.16;
  a += texture2D(u_texture, uv - vec2(blur, 0.0)).a * 0.16;
  a += texture2D(u_texture, uv + vec2(0.0, blur)).a * 0.16;
  a += texture2D(u_texture, uv - vec2(0.0, blur)).a * 0.16;
  return a;
}
void main() {
  float dof = opticalDefocus();
  float blur = dof * 8.0 / u_atlasSize * mix(1.0, 1.0 - u_reading * 0.45, u_opticalProfile);
  // Lens chromatic aberration grows with defocus: red/blue channels split
  // along the glyph axis on out-of-focus rows.
  float ca = dof * 3.0 / u_atlasSize * mix(1.0, 1.4 + dof * 2.0, u_opticalProfile) * chromaticSpread();
  vec3 rgb = vec3(
    glyphAlpha(v_uv + vec2(ca, 0.0), blur),
    glyphAlpha(v_uv, blur),
    glyphAlpha(v_uv - vec2(ca, 0.0), blur));
  float a = (rgb.r + rgb.g + rgb.b) * 0.3333;
  if (a < 0.005 || opacity() < 0.001) discard;
  gl_FragColor = vec4(vec3(opacity()) * rgb / max(a, 0.001), a);
}
`;

// Adapted from MeshTransmissionMaterial's transmission: sample the scene FBO
// with a per-wavelength screen-space push, gated by fresnel. Foreground glyphs
// stay white; the glass produces the dispersion.
const GLASS_FRAGMENT = `
precision highp float;
uniform sampler2D u_texture;
uniform float u_thickness;
uniform float u_back;
uniform float u_borderless;
uniform float u_streamDispersion;
${FOCUS}
${INK_GLSL}
float random(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec2 projectedUv(vec3 position) {
  float camera = u_resolution.y * 0.5;
  return position.xy * camera / (camera - position.z) / u_resolution + 0.5;
}
vec3 transmitted(vec3 n, vec3 v, float ior, float thickness) {
  // Volume transmission: trace the wavelength's ray through the glass and
  // project the exit point into the scene buffer. At this radius the throw
  // lands inside the dark bands between rows, so echoes stay visible.
  vec3 ray = normalize(refract(-v, n, 1.0 / ior)) * thickness;
  vec3 exitPoint = v_position + ray;
  vec2 uv = projectedUv(exitPoint);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec3(0.0);
  float fresnel = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  return texture2D(u_texture, uv).rgb * (1.0 - fresnel);
}
void main() {
  float camera = u_resolution.y * 0.5;
  float distance = abs(v_position.y / (camera - v_position.z));
  float dispersion = u_streamDispersion * u_final * smoothstep(0.34, 0.80, distance);
  vec3 n = normalize(v_normal) * (u_back > 0.5 ? -1.0 : 1.0);
  vec3 v = normalize(vec3(0.0, 0.0, camera) - v_position);
  // Focus belongs to the projected light, independently of foreground depth.
  // Measure the unperturbed ray's screen-space throw back to its source glyph:
  // close projections stay compact; distant projections spread and fade.
  vec3 referenceRay = normalize(refract(-v, n, 1.0 / 1.5)) * u_thickness;
  float projectionDistance = length((projectedUv(v_position + referenceRay)
    - projectedUv(v_position)) * u_resolution);
  float projectionDefocus = smoothstep(3.0, max(36.0, u_pitch * 1.1), projectionDistance);
  float roughness = mix(0.045 + depthBlur() * 0.09,
    mix(0.032, 0.10, projectionDefocus), u_streamDispersion);
  vec3 light = vec3(0.0);
  float seed = random(gl_FragCoord.xy);
  float spread = chromaticSpread() * mix(1.0, 1.0 + opticalDefocus() * 0.5, u_opticalProfile);
  spread *= 1.0 + dispersion * 0.45;
  for (int i = 0; i < 8; i++) {
    float phase = (float(i) + seed) / 8.0;
    float thickness = u_thickness * (1.0 + 0.1 * phase);
    // All eight wavelength taps remain; only their spatial footprint changes.
    vec3 normal = normalize(n + vec3(sin(float(i) * 2.4), cos(float(i) * 2.4), 0.0) * roughness);
    // Keep the full wavelength distribution: overlapping rough rays produce
    // the original diamond fire instead of isolated blocks of primary colour.
    light.r += transmitted(normal, v, 1.5, thickness).r;
    light.g += transmitted(normal, v, 1.5 * (1.0 + 0.09 * phase * spread), thickness).g;
    light.b += transmitted(normal, v, 1.5 * (1.0 + 0.20 * phase * spread), thickness).b;
  }
  light /= 8.0;
  // White glyphs own the reading plane. Keep the multi-colour transmission
  // behind and beside them, with more room for light outside that plane.
  light *= mix(0.5, 0.7, u_streamDispersion * u_final);
  float readingTransmission = mix(0.35, 1.0, smoothstep(0.18, 0.72, distance));
  light *= mix(1.0, readingTransmission, u_streamDispersion * u_final);
  light *= mix(1.0, mix(1.0, 0.58, projectionDefocus), u_streamDispersion);
  // The far wall throws its echoes half a screen away, doubling rows onto
  // each other; keep it to a whisper so only the front fringe reads.
  light *= u_back > 0.5 ? 0.25 : 1.0;
  // Rear and off-axis refraction softens with depth, like a real lens.
  light *= 1.0 - depthBlur() * 0.4;
  float readingFace = centerWeight() * smoothstep(0.45, 0.92, n.z);
  light *= 1.0 - readingFace * 0.86;
  // A barely visible neutral grazing reflection keeps the glass path connected.
  // Wide browser canvases expose the cylinder silhouette as two hard rails.
  // Fade only its grazing transmission; keep the glyphs and central dispersion.
  float grazing = mix(1.0, smoothstep(0.0, 0.28, abs(dot(n, v))), u_borderless);
  light *= grazing;
  float rim = pow(1.0 - abs(dot(n, v)), 5.0) * 0.04 * (1.0 - u_borderless);
  vec3 color = (light + vec3(rim)) * opacity();
  // Add atmosphere only in the final image, outside the refraction buffers.
  // This keeps white glyphs and dispersion intact and grain in screen space.
  if (u_final > 0.5) color += mix(inkBackground(), vec3(2.0, 3.0, 3.0) / 255.0, u_opticalProfile);
  gl_FragColor = vec4(color, 1.0);
}
`;

function makeProgram(gl, fragment, vertex = VERTEX) {
  const shaders = [];
  const program = gl.createProgram();
  try {
    [gl.VERTEX_SHADER, gl.FRAGMENT_SHADER].forEach((type, i) => {
      const shader = gl.createShader(type);
      shaders.push(shader);
      gl.shaderSource(shader, i ? fragment : vertex);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      gl.attachShader(program, shader);
    });
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  } catch (error) { gl.deleteProgram(program); throw error; }
  finally { shaders.forEach(shader => gl.deleteShader(shader)); }
  const uniforms = {};
  ['resolution','texture','glyph','cursor','rowOffset','count','loop','radius','arc','curl','recede','pitch','final','reading','readingAmbient','opticalProfile','chromaticStrength','edgeFadeStart','thickness','back','borderless','streamReadability','streamDispersion','noise','dpr','inkLight','atlasSize','bendZone','bendRound','bendAngle','bendPersp','bendFlare','bendAdhesion','bendScroll','bendLiquid','bendCaustics','bendContacts','bendPerlin','bendNoisePhase','bendLookup','bendLookupEnabled','inkMeta','inkMetaNext','inkMetaMix','inkEnabled','sourceWindow'].forEach(name => {
    uniforms[name] = gl.getUniformLocation(program, 'u_' + name);
  });
  for (const name of ['noiseHashContact', 'noiseHashSurface', 'noiseContactBounds', 'noiseSurfaceBounds', 'noiseHashEnabled']) {
    uniforms[name] = gl.getUniformLocation(program, 'u_' + name);
  }
  uniforms.sourcePremultiplied = gl.getUniformLocation(program, 'u_sourcePremultiplied');
  return { program, uniforms, attributes: ['position','normal','uv'].map(name => gl.getAttribLocation(program, 'a_' + name)) };
}

class WheelRenderer {
  constructor(canvas, atlasCanvas, options) {
    Object.assign(this, options, sceneMetrics(options.width, options.height));
    this.canvas = canvas;
    this.atlasCanvas = atlasCanvas;
    this.dpr = Math.min(options.dpr || 1, 2);
    this.minFrameInterval = options.minFrameInterval ?? 32;
    this.refractionScale = Math.max(0.25, Math.min(1, options.refractionScale ?? 1));
    this.running = false;
    this.destroyed = false;
    this.frameId = null;
    this.motionGeneration = 0;
    this.reading = 0;
    this.buffers = [];
    this.targets = [];
    this.programs = [];
    this.gl = canvas.getContext('webgl', { alpha: false, antialias: options.antialias ?? true, depth: true,
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? true, powerPreference: options.powerPreference ?? 'default' });
    if (!this.gl) throw new Error('WebGL unavailable');
    try { this.init(); } catch (error) { this.destroy(); throw error; }
  }

  init() {
    const gl = this.gl;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.textProgram = makeProgram(gl, TEXT_FRAGMENT); this.programs.push(this.textProgram);
    this.glassProgram = makeProgram(gl, GLASS_FRAGMENT); this.programs.push(this.glassProgram);
    this.backgroundProgram = makeProgram(gl, BACKGROUND_FRAGMENT, BACKGROUND_VERTEX); this.programs.push(this.backgroundProgram);
    this.backgroundQuad = this.geometry([[-1,-1], [1,-1], [-1,1], [1,-1], [1,1], [-1,1]]
      .flatMap(([x,y]) => [x,y,0, 0,0,0, 0,0]));
    this.noiseTexture = this.texture();
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, NOISE_SIZE, NOISE_SIZE, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, grainPixels());
    this.textTexture = this.texture();
    this.targets.push(this.target()); this.targets.push(this.target());
    this.glass = this.geometry(wheelGeometry(this.radius, this.pitch, this.turns));
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 1);
  }

  texture() {
    const gl = this.gl, texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  target(scale = this.refractionScale) {
    const gl = this.gl;
    const width = Math.max(1, Math.round(this.canvas.width * scale));
    const height = Math.max(1, Math.round(this.canvas.height * scale));
    const texture = this.texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const buffer = gl.createFramebuffer(), depth = gl.createRenderbuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteTexture(texture); gl.deleteFramebuffer(buffer); gl.deleteRenderbuffer(depth);
      throw new Error('Optical buffer unavailable');
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { texture, buffer, depth, width, height };
  }

  geometry(vertices) {
    const gl = this.gl, buffer = gl.createBuffer();
    this.buffers.push(buffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    return { buffer, count: vertices.length / 8 };
  }

  setFrames(frames, draw = true) {
    if (this.destroyed) return;
    const gl = this.gl, limit = Math.min(4096, gl.getParameter(gl.MAX_TEXTURE_SIZE));
    const glyphs = paintAtlas(this.atlasCanvas, frames, this.dpr, limit);
    this.glyphMode = 'font-file';
    this.atlasSize = atlasLayout(Object.keys(glyphs).length, this.dpr, limit).side;
    if (this.atlasGlyphs !== glyphs) {
      gl.bindTexture(gl.TEXTURE_2D, this.textTexture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.atlasCanvas);
      if (gl.getError() !== gl.NO_ERROR) throw new Error('Glyph upload failed');
      this.atlasGlyphs = glyphs;
    }
    if (this.quotations) {
      gl.deleteBuffer(this.quotations.buffer);
      this.buffers = this.buffers.filter(buffer => buffer !== this.quotations.buffer);
    }
    this.frames = frames;
    this.vertices = quotationGeometry(frames, glyphs, this.radius, this.fontSize, this.height * 0.5);
    this.quotations = this.geometry(this.vertices);
    this.count = frames.length;
    if (draw) this.draw();
  }

  hitTest(x, y) {
    const rows = projectedRows(this.vertices, this.timeline.position / CELL - CENTER_PHASE, this.count, this.width, this.height, this.reading, this.timeline.rowOffset, this.timeline.loop);
    return rows.filter(row => x >= row.left - 10 && x <= row.right + 10 &&
      Math.abs(y - (row.top + row.bottom) / 2) <= Math.max(22, (row.bottom - row.top) / 2))
      .sort((a, b) => Math.abs(y - (a.top + a.bottom) / 2) - Math.abs(y - (b.top + b.bottom) / 2))[0];
  }

  hitText(x, y) {
    const glyphs = projectedGlyphs(this.vertices, this.timeline.position / CELL - CENTER_PHASE, this.count,
      this.width, this.height, this.reading, this.timeline.rowOffset, this.timeline.loop);
    const hits = glyphs.filter(g => x >= g.left && x <= g.right &&
      Math.abs(y - (g.top + g.bottom) / 2) <= Math.max(22, (g.bottom - g.top) / 2))
      .sort((a, b) => Math.hypot(x - (a.left + a.right) / 2, y - (a.top + a.bottom) / 2) -
        Math.hypot(x - (b.left + b.right) / 2, y - (b.top + b.bottom) / 2));
    const hit = hits[0], frame = hit && this.frames[hit.index];
    if (!frame || frame.lineStart < 0) return null;
    const offsets = []; let cursor = frame.lineStart;
    for (const char of Array.from(frame.quote)) { offsets.push(cursor); cursor += char.length; }
    const token = ranges(frame).find(range => offsets[hit.charIndex] >= range.start && offsets[hit.charIndex] < range.end);
    if (!token) return null;
    const boxes = glyphs.filter(g => g.index === hit.index && offsets[g.charIndex] >= token.start && offsets[g.charIndex] < token.end);
    return { frameId: frame.passageId, anchorId: `text:${token.start}:${token.end}`, selection: selectionFor(frame, token), label: token.text,
      left: Math.min(...boxes.map(g => g.left)), right: Math.max(...boxes.map(g => g.right)),
      top: Math.min(...boxes.map(g => g.top)), bottom: Math.max(...boxes.map(g => g.bottom)) };
  }

  mesh(program, geometry, pass, glyph) {
    const gl = this.gl, u = program.uniforms;
    gl.useProgram(program.program);
    gl.uniform2f(u.resolution, this.width, this.height);
    gl.uniform1f(u.cursor, this.timeline.position / CELL - CENTER_PHASE);
    gl.uniform1f(u.rowOffset, modulo(this.timeline.rowOffset, 10));
    gl.uniform1f(u.count, this.count);
    gl.uniform1f(u.loop, this.timeline.loop ? 1 : 0);
    gl.uniform1f(u.radius, this.radius);
    gl.uniform1f(u.arc, this.arc);
    gl.uniform1f(u.curl, this.curl);
    gl.uniform1f(u.recede, this.recede);
    gl.uniform1f(u.pitch, this.pitch);
    gl.uniform1f(u.glyph, glyph ? 1 : 0);
    gl.uniform1f(u.final, pass === 2 ? 1 : 0);
    gl.uniform1f(u.reading, this.reading);
    gl.uniform1f(u.back, pass === 1 ? 1 : 0);
    gl.uniform1f(u.borderless, this.borderless ? 1 : 0);
    gl.uniform1f(u.streamReadability, this.streamReadability ? 1 : 0);
    gl.uniform1f(u.streamDispersion, this.streamReadability && !this.reducedMotion ? Math.max(0, Math.min(1, this.streamDispersion || 0)) : 0);
    gl.uniform1f(u.readingAmbient, this.readingAmbient || 0);
    gl.uniform1f(u.opticalProfile, this.opticalProfile ? 1 : 0);
    gl.uniform1f(u.chromaticStrength, this.reducedMotion ? 0 : 1);
    gl.uniform1f(u.edgeFadeStart, this.edgeFadeStart ?? 0.9);
    // Short throw keeps ghost echoes hugging their source glyphs as soft
    // chromatic fringes instead of readable duplicates on neighbouring rows.
    gl.uniform1f(u.thickness, this.radius * (pass === 1 ? 1.5 : 0.3));
    gl.uniform1i(u.texture, 0);
    gl.uniform1f(u.atlasSize, this.atlasSize || 1024);
    gl.uniform1i(u.noise, 1);
    gl.uniform1i(u.inkMeta, 2);
    gl.uniform1f(u.inkEnabled, this.inkEnabled ? 1 : 0);
    gl.uniform1f(u.sourcePremultiplied, this.sourcePremultiplied ? 1 : 0);
    gl.uniform1f(u.dpr, this.dpr);
    gl.uniform1f(u.inkLight, inkLight(this.timeline.ambientPhase, this.reducedMotion));
    gl.bindBuffer(gl.ARRAY_BUFFER, geometry.buffer);
    program.attributes.forEach((location, i) => {
      if (location < 0) return;
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, i === 2 ? 2 : 3, gl.FLOAT, false, 32, [0,12,24][i]);
    });
    gl.drawArrays(gl.TRIANGLES, 0, geometry.count);
  }

  draw() {
    if (this.destroyed || !this.quotations) return;
    const gl = this.gl;
    if (gl.isContextLost()) throw new Error('WebGL context lost');
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.noiseTexture);
    gl.activeTexture(gl.TEXTURE0);
    // 1: unobstructed scene. 2: rear glass + text. 3: front glass + text.
    for (let pass = 0; pass < 3; pass++) {
      const target = pass < 2 ? this.targets[pass] : null;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.buffer : null);
      gl.viewport(0, 0, target ? target.width : this.canvas.width, target ? target.height : this.canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (pass === 2) {
        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);
        this.mesh(this.backgroundProgram, this.backgroundQuad, pass, false);
        gl.depthMask(true);
        gl.enable(gl.DEPTH_TEST);
      }
      if (pass) {
        gl.bindTexture(gl.TEXTURE_2D, this.targets[pass - 1].texture);
        gl.cullFace(pass === 1 ? gl.FRONT : gl.BACK);
        // The ribbon recedes past the front glass wall; the wall must not
        // depth-occlude it, or off-center lines get sliced into strips.
        if (pass === 2) gl.depthMask(false);
        this.mesh(this.glassProgram, this.glass, pass, false);
        if (pass === 2) gl.depthMask(true);
      }
      gl.cullFace(gl.BACK);
      gl.bindTexture(gl.TEXTURE_2D, this.textTexture);
      this.mesh(this.textProgram, this.quotations, pass, true);
    }
  }

  start() {
    if (this.running || this.destroyed) return;
    this.stop();
    this.running = true;
    const generation = this.motionGeneration;
    this.timeline.lastTime = null;
    let lastDraw = null;
    const loop = timestamp => {
      if (!this.running || this.destroyed || generation !== this.motionGeneration) return;
      try {
        if (lastDraw === null || timestamp - lastDraw >= this.minFrameInterval) {
          this.timeline.tick(timestamp);
          if (this.onFrame) this.onFrame();
          this.draw();
          lastDraw = timestamp;
        }
        if (this.running && generation === this.motionGeneration) this.frameId = this.canvas.requestAnimationFrame(loop);
      } catch (error) { this.stop(); if (this.onError) this.onError(error); }
    };
    this.frameId = this.canvas.requestAnimationFrame(loop);
  }

  center(onComplete) {
    const target = this.timeline.targetFor(this.timeline.index);
    this.animateTo({ position: target, reading: 1, duration: 420 }, onComplete);
  }

  restore(onComplete) {
    this.animateTo({ reading: 0, duration: 240 }, onComplete);
  }

  animateTo(options, onComplete) {
    if (this.destroyed) return;
    this.stop();
    const from = this.timeline.position;
    const period = this.count * CELL;
    const delta = options.position === undefined ? 0 : this.timeline.loop ? modulo(options.position - from + period / 2, period) - period / 2 : options.position - from;
    const fromReading = this.reading;
    const toReading = options.reading === undefined ? fromReading : options.reading;
    const generation = this.motionGeneration;
    let began = null;
    let moved = 0;
    const settle = now => {
      if (this.destroyed || generation !== this.motionGeneration) return;
      if (began === null) began = now;
      const progress = this.reducedMotion ? 1 : Math.min((now - began) / (options.duration || 1), 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const travel = delta * eased;
      this.timeline.advancePosition(travel - moved);
      moved = travel;
      this.reading = fromReading + (toReading - fromReading) * (progress * progress * (3 - 2 * progress));
      try {
        if (this.onFrame) this.onFrame();
        this.draw();
      } catch (error) { this.stop(); if (this.onError) this.onError(error); return; }
      if (generation !== this.motionGeneration) return;
      this.frameId = progress < 1 ? this.canvas.requestAnimationFrame(settle) : null;
      if (progress === 1 && onComplete) onComplete();
    };
    this.frameId = this.canvas.requestAnimationFrame(settle);
  }

  stop() {
    this.motionGeneration++;
    this.running = false;
    if (this.frameId !== null) this.canvas.cancelAnimationFrame(this.frameId);
    this.frameId = null;
    this.timeline.lastTime = null;
  }

  destroy() {
    if (this.destroyed) return;
    this.stop(); this.destroyed = true;
    const gl = this.gl;
    this.buffers.forEach(buffer => gl.deleteBuffer(buffer));
    this.programs.forEach(program => gl.deleteProgram(program.program));
    this.targets.forEach(target => {
      gl.deleteFramebuffer(target.buffer); gl.deleteRenderbuffer(target.depth); gl.deleteTexture(target.texture);
    });
    if (this.textTexture) gl.deleteTexture(this.textTexture);
    if (this.noiseTexture) gl.deleteTexture(this.noiseTexture);
    if (this.foregroundTexture) gl.deleteTexture(this.foregroundTexture);
    if (this.inkTexture) gl.deleteTexture(this.inkTexture);
    if (this.surfaceTextures) for (const slot of this.surfaceTextures) {
      if (slot.texture !== this.inkTexture) gl.deleteTexture(slot.texture);
    }
    this.surfaceTextures = null;
    if (this.noiseHashes) for (const slot of this.noiseHashes) gl.deleteTexture(slot.texture);
    this.noiseHashes = null;
    if (this.bendLookupTexture) gl.deleteTexture(this.bendLookupTexture);
    this.uploadSizes?.clear();
  }
}

// The browser's continuous reader supplies the same visible glyphs in screen
// coordinates. Keep the original glass material and transmission passes; its
// DOM owns reading order, hit targets and scrolling, with no second timeline.
const SCREEN_VERTEX = `
attribute vec3 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position.xy * 0.5 + 0.5;
  gl_Position = vec4(a_position, 1.0);
}
`;
const SCREEN_FRAGMENT = `
precision highp float;
uniform sampler2D u_texture;
uniform sampler2D u_inkMeta;
uniform float u_inkEnabled;
uniform float u_sourcePremultiplied;
uniform vec2 u_resolution;
uniform vec2 u_sourceWindow;
varying vec2 v_uv;
vec4 sourceGlyph(vec2 uv) {
  float x = (uv.x - u_sourceWindow.x) / u_sourceWindow.y;
  if ((x < 0.0 && u_sourceWindow.x > 0.0)
    || (x > 1.0 && u_sourceWindow.x + u_sourceWindow.y < 0.999999)) return vec4(0.0);
  vec4 glyph = texture2D(u_texture, vec2(x, uv.y));
  if (u_sourcePremultiplied > 0.5 && glyph.a > 0.0) glyph.rgb /= glyph.a;
  return glyph;
}
float inkHash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.37);
  return fract(p.x * p.y);
}
float inkNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(inkHash(i), inkHash(i + vec2(1.0, 0.0)), u.x),
    mix(inkHash(i + vec2(0.0, 1.0)), inkHash(i + vec2(1.0)), u.x), u.y);
}
float inkFbm(vec2 p) {
  float value = 0.0, amplitude = 0.57;
  for (int i = 0; i < 3; i++) {
    value += inkNoise(p) * amplitude;
    p = mat2(0.80, 0.60, -0.60, 0.80) * p * 2.02 + 7.13;
    amplitude *= 0.5;
  }
  return value;
}
void main() {
  vec4 glyph = sourceGlyph(v_uv);
  if (u_inkEnabled < 0.5) { gl_FragColor = glyph; return; }
  vec4 meta = texture2D(u_inkMeta, v_uv);
  if (meta.a < 0.5 || meta.r > 0.998) { gl_FragColor = glyph; return; }
  if (meta.r < 0.002) { gl_FragColor = vec4(0.0); return; }
  // Adapted from TongyeGuanmi's loader: multiple ink scales fill the real
  // glyph mask, with a short wet edge. Its colour comes from our own source.
  float p = smoothstep(0.0, 1.0, meta.r);
  vec2 px = (0.6 + sin(p * 3.14159265) * 0.5) / u_resolution;
  vec4 a = sourceGlyph(v_uv + vec2(px.x, 0.0));
  vec4 b = sourceGlyph(v_uv - vec2(px.x, 0.0));
  vec4 c = sourceGlyph(v_uv + vec2(0.0, px.y));
  vec4 d = sourceGlyph(v_uv - vec2(0.0, px.y));
  float wet = max(glyph.a, max(max(a.a, b.a), max(c.a, d.a)));
  // Include the original wet-edge neighbourhood before rejecting empty
  // pixels. The reveal noise cannot create ink where all five masks are zero.
  if (wet == 0.0) { gl_FragColor = vec4(0.0); return; }
  vec2 coord = v_uv * u_resolution / max(12.0, meta.b * 255.0);
  vec2 seed = vec2(meta.g * 43.7, meta.g * 71.3);
  float field = inkFbm(coord * 2.4 + seed) * 0.62
    + inkFbm(coord * 7.0 - seed) * 0.28 + inkNoise(coord * 24.0 + seed) * 0.10;
  float threshold = mix(0.90, 0.18, p);
  float reveal = smoothstep(threshold - 0.10, threshold + 0.09, field + p * 0.16);
  reveal = max(reveal, smoothstep(0.72, 0.98, p));
  float edge = (1.0 - smoothstep(0.0, 0.13, abs(field + p * 0.16 - threshold)))
    * smoothstep(0.04, 0.30, p) * (1.0 - smoothstep(0.68, 1.0, p));
  float bead = smoothstep(0.78, 0.98, inkHash(floor(coord * 18.0 + seed)));
  float alpha = clamp(glyph.a * reveal + wet * edge * (0.15 + bead * 0.14), 0.0, 1.0);
  vec3 color = max(glyph.rgb, max(max(a.rgb, b.rgb), max(c.rgb, d.rgb)));
  gl_FragColor = vec4(color, alpha);
}
`;

class StreamGlassRenderer extends WheelRenderer {
  init() {
    super.init();
    this.uploadSizes = new Map();
    // A resized canvas can reuse the previous WebGL context. Its enabled
    // attributes may still reference deleted geometry from the old instance.
    for (let index = 0; index < this.gl.getParameter(this.gl.MAX_VERTEX_ATTRIBS); index++) {
      this.gl.disableVertexAttribArray(index);
    }
    this.screenProgram = makeProgram(this.gl, SCREEN_FRAGMENT, SCREEN_VERTEX);
    this.programs.push(this.screenProgram);
    this.inkTexture = this.texture();
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, 1, 1, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, new Uint8Array(4));
    if (this.bend) {
      this.composite = this.target(1);
      this.targets.push(this.composite);
      this.foregroundTexture = this.texture();
      this.bendLookupTexture = this.texture();
      this.bendLookupAvailable = !!this.gl.getExtension('OES_texture_float')
        && this.canvas.height <= this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE);
      this.noiseHashAvailable = this.gl.getParameter(this.gl.MAX_TEXTURE_IMAGE_UNITS) >= 7;
      // Compile out the fallback's 40 intersections on lookup-capable GPUs.
      // Both variants retain the exact same fold geometry and resolution.
      this.bendProgram = makeProgram(this.gl,
        (this.bendLookupAvailable ? '#define BEND_LOOKUP_ONLY\n' : '')
        + (this.noiseHashAvailable ? '#define NOISE_HASH_CACHE\n' : '') + BEND_FRAGMENT, SCREEN_VERTEX);
      this.programs.push(this.bendProgram);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
      this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, 1, 1, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, new Uint8Array(4));
    }
    this.count = 1;
    this.borderless = true;
  }

  drawSurfaceQuad(program) {
    // These two screen-space passes do not use wheel geometry, ink timing,
    // atlas or material uniforms. Submit only their actual shared inputs.
    const gl = this.gl, geometry = this.backgroundQuad, u = program.uniforms;
    gl.uniform2f(u.resolution, this.width, this.height);
    gl.uniform1i(u.texture, 0);
    gl.uniform1i(u.inkMeta, 2);
    gl.uniform1f(u.noiseHashEnabled, this.noiseHashActive ? 1 : 0);
    if (this.noiseHashActive) {
      gl.uniform1i(u.noiseHashContact, 5);
      gl.uniform1i(u.noiseHashSurface, 6);
      const [contact, surface] = this.noiseHashes.map(slot => slot.frame);
      gl.uniform4f(u.noiseContactBounds, contact.left, contact.top, contact.width, contact.height);
      gl.uniform4f(u.noiseSurfaceBounds, surface.left, surface.top, surface.width, surface.height);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, geometry.buffer);
    program.attributes.forEach((location, index) => {
      if (location < 0) return;
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, index === 2 ? 2 : 3, gl.FLOAT, false, 32, [0, 12, 24][index]);
    });
    gl.drawArrays(gl.TRIANGLES, 0, geometry.count);
  }

  drawLiquidField(bend, sourceWindow) {
    const gl = this.gl;
    // Allocate only for the opt-in liquid profiles. The accepted comparison
    // and the normal reader keep their existing targets and optical path.
    if (!this.liquidProgram) {
      this.liquidProgram = makeProgram(gl,
        (this.noiseHashAvailable ? '#define NOISE_HASH_CACHE\n' : '') + LIQUID_FIELD_FRAGMENT, SCREEN_VERTEX);
      this.programs.push(this.liquidProgram);
      this.liquidTarget = this.target(0.66);
      this.targets.push(this.liquidTarget);
    }
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.surfaceTexture || this.inkTexture);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.nextSurfaceTexture || this.inkTexture);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.liquidTarget.buffer);
    gl.viewport(0, 0, this.liquidTarget.width, this.liquidTarget.height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.cullFace(gl.BACK);
    const program = this.liquidProgram, u = program.uniforms;
    gl.useProgram(program.program);
    gl.uniform1f(u.bendZone, bend.zone);
    gl.uniform1f(u.bendAdhesion, bend.adhesion || 0);
    gl.uniform1f(u.bendScroll, bend.adhesionScroll || 0);
    gl.uniform1f(u.bendContacts, bend.contacts ? 1 : 0);
    gl.uniform1f(u.bendPerlin, bend.perlin ? 1 : 0);
    gl.uniform1f(u.bendNoisePhase, bend.noisePhase || 0);
    gl.uniform1i(u.inkMetaNext, 4);
    gl.uniform1f(u.inkMetaMix, this.surfaceMix || 0);
    const left = sourceWindow?.left || 0, span = sourceWindow?.width ?? 1;
    gl.uniform2f(u.sourceWindow, left, span);
    // Storage width maps UVs; the active width only limits work. Clear the
    // whole previous field to its exact neutral encoding before either band.
    const activeSpan = sourceWindow?.activeWidth ?? span;
    const margin = (16 + 40 * Math.abs(bend.adhesion || 0)) / this.width;
    const pixels = this.liquidTarget.width, rows = this.liquidTarget.height;
    const x = Math.max(0, Math.floor((left - margin) * pixels));
    const end = Math.min(pixels, Math.ceil((left + activeSpan + margin) * pixels));
    const band = Math.min(rows, Math.ceil(rows * (bend.zone ?? 1)) + 1);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(128 / 255, 128 / 255, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.clearColor(0, 0, 0, 1);
    gl.enable(gl.SCISSOR_TEST);
    if (band * 2 >= rows) {
      gl.scissor(x, 0, end - x, rows); this.drawSurfaceQuad(program);
    } else {
      // The shader returns that same neutral value throughout the reading
      // center. A one-pixel guard keeps interpolation at each fold unchanged.
      gl.scissor(x, 0, end - x, band); this.drawSurfaceQuad(program);
      gl.scissor(x, rows - band, end - x, band); this.drawSurfaceQuad(program);
    }
    gl.disable(gl.SCISSOR_TEST);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.liquidTarget.texture);
    gl.activeTexture(gl.TEXTURE0);
  }

  bindBendRows(bend) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.bendLookupTexture);
    const key = `${this.canvas.height}:${bend.zone}:${bend.rounding}:${bend.angle}:${bend.perspective}`;
    if (this.bendLookupAvailable && this.bendLookupKey !== key) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, this.canvas.height, 0, gl.RGBA, gl.FLOAT, bendRowMap(bend, this.canvas.height));
      this.bendLookupKey = key;
    }
    gl.activeTexture(gl.TEXTURE0);
  }

  bindNoiseHashes(bend) {
    const gl = this.gl;
    if (!this.noiseHashes) this.noiseHashes = [0, 1].map(index => {
      gl.activeTexture(gl.TEXTURE5 + index);
      const texture = this.texture();
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      return { texture, frame: null };
    });
    for (let index = 0; index < 2; index++) {
      const slot = this.noiseHashes[index];
      const frame = noiseHashGrid(this.width, this.height, bend.adhesionScroll || 0, bend.noisePhase || 0, index === 0, slot.frame);
      gl.activeTexture(gl.TEXTURE5 + index);
      gl.bindTexture(gl.TEXTURE_2D, slot.texture);
      if (frame !== slot.frame) {
        if (slot.frame?.width === frame.width && slot.frame?.height === frame.height) {
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, frame.width, frame.height, gl.RGBA, gl.UNSIGNED_BYTE, frame.data);
        } else {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, frame.width, frame.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, frame.data);
        }
        slot.frame = frame;
      }
    }
    gl.activeTexture(gl.TEXTURE0);
  }

  uploadSource(texture, source) {
    const gl = this.gl, size = this.uploadSizes.get(texture);
    // The source canvases keep their dimensions while scrolling. Reuse the
    // texture storage instead of asking the driver to allocate it each frame.
    if (size && size.width === source.width && size.height === source.height) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      this.uploadSizes.set(texture, { width: source.width, height: source.height });
    }
  }

  bindSurfacePair(pair) {
    const gl = this.gl;
    if (!this.surfaceTextures) this.surfaceTextures = [{ texture: this.texture(), key: null }, { texture: this.texture(), key: null }];
    const bind = frame => {
      let slot = this.surfaceTextures.find(candidate => candidate.key === frame);
      if (!slot) {
        slot = this.surfaceTextures.find(candidate => candidate.key !== pair.current && candidate.key !== pair.next);
        gl.bindTexture(gl.TEXTURE_2D, slot.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        this.uploadSource(slot.texture, frame.canvas);
        slot.key = frame;
      }
      return slot.texture;
    };
    this.surfaceTexture = bind(pair.current);
    this.nextSurfaceTexture = bind(pair.next);
    this.surfaceMix = pair.mix;
    gl.bindTexture(gl.TEXTURE_2D, this.surfaceTexture);
  }

  drawSource(source, foreground, bend, ink, adhesion, sourceChanged = true, surfacePair, sourceWindow) {
    if (this.destroyed) return;
    const gl = this.gl;
    if (gl.isContextLost()) throw new Error('WebGL context lost');
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.textTexture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    if (sourceChanged) this.uploadSource(this.textTexture, source);
    if (sourceChanged && this.bendProgram && foreground) {
      gl.bindTexture(gl.TEXTURE_2D, this.foregroundTexture);
      this.uploadSource(this.foregroundTexture, foreground);
    }
    this.inkEnabled = !!ink;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.inkTexture);
    // A retained composite already contains this reveal frame. Upload again
    // when its immutable runs/progress change and the source is recomposed.
    if (ink && sourceChanged) this.uploadSource(this.inkTexture, ink);
    if (adhesion) {
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      if (surfacePair) this.bindSurfacePair(surfacePair);
      else {
        // Scrolling changes the lettering, so paint/upload the exact live mask.
        // Cached phases become invalid when this texture's contents change.
        if (!this.surfaceTextures) this.surfaceTextures = [{ texture: this.texture(), key: null }, { texture: this.texture(), key: null }];
        for (const slot of this.surfaceTextures) slot.key = null;
        this.surfaceTexture = this.surfaceTextures[0].texture;
        this.nextSurfaceTexture = null;
        this.surfaceMix = 0;
        gl.bindTexture(gl.TEXTURE_2D, this.surfaceTexture);
        this.uploadSource(this.surfaceTexture, adhesion);
      }
    }
    this.composeSource(bend, ink, adhesion, foreground, sourceChanged, sourceWindow);
  }

  // Browser glyph caches paint directly into textures on this context. The
  // same glass/dispersion/ink shaders consume them without a Canvas readback.
  drawGpuSource(sources, bend, sourceChanged = true, sourceWindow) {
    if (this.destroyed) return;
    if (this.gl.isContextLost()) throw new Error('WebGL context lost');
    const names = ['textTexture', 'foregroundTexture', 'inkTexture', 'surfaceTexture', 'nextSurfaceTexture', 'surfaceMix', 'sourcePremultiplied'];
    const previous = names.map(name => this[name]);
    try {
      this.textTexture = sources.source; this.foregroundTexture = sources.foreground;
      this.inkTexture = sources.ink || previous[2];
      this.surfaceTexture = sources.adhesion; this.nextSurfaceTexture = null; this.surfaceMix = 0;
      this.sourcePremultiplied = true; this.inkEnabled = !!sources.ink;
      this.composeSource(bend, sources.ink, sources.adhesion, sources.foreground, sourceChanged, sourceWindow);
    } finally { names.forEach((name, index) => { this[name] = previous[index]; }); }
  }

  composeSource(bend, ink, adhesion, foreground, sourceChanged, sourceWindow) {
    const gl = this.gl;
    // Ink metadata must remain independent while the contact field changes.
    // The screen passes sample it before the final fold binds the water field.
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.inkTexture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.noiseTexture);
    gl.activeTexture(gl.TEXTURE0);

    // The lettering and base glass stay in the composite while only the
    // liquid surface moves. No repeated text uploads or refraction passes.
    for (let pass = 0; sourceChanged && pass < 3; pass++) {
      const target = pass < 2 ? this.targets[pass] : this.bendProgram ? this.composite : null;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.buffer : null);
      gl.viewport(0, 0, target ? target.width : this.canvas.width, target ? target.height : this.canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (pass === 2) {
        if (this.opticalProfile) {
          // This profile's background shader is a constant, exactly matching
          // a clear. Avoid a full-screen program/texture pass on every scroll.
          gl.clearColor(2 / 255, 3 / 255, 3 / 255, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.clearColor(0, 0, 0, 1);
        } else {
          gl.disable(gl.DEPTH_TEST);
          gl.depthMask(false);
          this.mesh(this.backgroundProgram, this.backgroundQuad, pass, false);
          gl.depthMask(true);
          gl.enable(gl.DEPTH_TEST);
        }
      }
      if (pass) {
        gl.bindTexture(gl.TEXTURE_2D, this.targets[pass - 1].texture);
        gl.cullFace(pass === 1 ? gl.FRONT : gl.BACK);
        if (pass === 2) gl.depthMask(false);
        this.mesh(this.glassProgram, this.glass, pass, false);
        if (pass === 2) gl.depthMask(true);
      }
      // Active ink and folded glyphs share the foreground. Settled central
      // glyphs return to native text after their last ink frame.
      if (pass < 2 || this.bendProgram && foreground) {
        gl.disable(gl.DEPTH_TEST);
        gl.cullFace(gl.BACK);
        gl.bindTexture(gl.TEXTURE_2D, pass < 2 ? this.textTexture : this.foregroundTexture);
        gl.useProgram(this.screenProgram.program);
        const left = sourceWindow?.left || 0, span = sourceWindow?.width ?? 1;
        gl.uniform2f(this.screenProgram.uniforms.sourceWindow, left, span);
        // The source window includes the original blur and underline margins.
        // Skip only transparent columns, at the original backing resolution.
        if (sourceWindow) {
          const pixels = target ? target.width : this.canvas.width;
          const x = Math.max(0, Math.floor(left * pixels) - 1);
          const end = Math.min(pixels, Math.ceil((left + (sourceWindow.activeWidth ?? span)) * pixels) + 1);
          gl.enable(gl.SCISSOR_TEST);
          gl.scissor(x, 0, end - x, target ? target.height : this.canvas.height);
        }
        this.mesh(this.screenProgram, this.backgroundQuad, pass, false);
        if (sourceWindow) gl.disable(gl.SCISSOR_TEST);
        gl.enable(gl.DEPTH_TEST);
      }
    }
    if (this.bendProgram && bend) {
      const liquid = !!(adhesion && bend.liquid);
      this.noiseHashActive = !!(adhesion && bend.perlin && this.noiseHashAvailable);
      if (this.noiseHashActive) this.bindNoiseHashes(bend);
      if (liquid) this.drawLiquidField(bend, sourceWindow);
      else if (adhesion) {
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.surfaceTexture);
        gl.activeTexture(gl.TEXTURE0);
      }
      this.bindBendRows(bend);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.cullFace(gl.BACK);
      gl.bindTexture(gl.TEXTURE_2D, this.composite.texture);
      const program = this.bendProgram, u = program.uniforms;
      gl.useProgram(program.program);
      gl.uniform1f(u.bendZone, bend.zone);
      gl.uniform1f(u.bendRound, bend.rounding);
      gl.uniform1f(u.bendAngle, bend.angle);
      gl.uniform1f(u.bendPersp, bend.perspective);
      gl.uniform1f(u.bendFlare, bend.flare || 0);
      gl.uniform1f(u.bendAdhesion, adhesion ? bend.adhesion || 0 : 0);
      gl.uniform1f(u.bendScroll, bend.adhesionScroll || 0);
      gl.uniform1f(u.bendLiquid, liquid ? 1 : 0);
      gl.uniform1f(u.bendCaustics, liquid ? bend.caustics || 0 : 0);
      gl.uniform1f(u.bendContacts, liquid && bend.contacts ? 1 : 0);
      gl.uniform1f(u.bendPerlin, liquid && bend.perlin ? 1 : 0);
      gl.uniform1f(u.bendNoisePhase, bend.noisePhase || 0);
      gl.uniform1i(u.bendLookup, 3);
      gl.uniform1f(u.bendLookupEnabled, this.bendLookupAvailable ? 1 : 0);
      this.drawSurfaceQuad(program);
      gl.enable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);
    }
  }
}

module.exports = { WheelRenderer, StreamGlassRenderer };
