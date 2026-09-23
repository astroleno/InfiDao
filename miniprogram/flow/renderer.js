const { atlasLayout, paintAtlas } = require('./atlas');
const { CELL, CENTER_PHASE, modulo } = require('./timeline');
const { CENTER_SCALE, ROW_TURN_MIN, ROW_TURN_STEP, sceneMetrics, wheelGeometry, quotationGeometry, projectedRows, projectedGlyphs } = require('./scene');
const { ranges, selectionFor } = require('./classic-text');
const { NOISE_SIZE, inkLight, grainPixels, INK_GLSL } = require('./atmosphere');

const BACKGROUND_VERTEX = `
attribute vec3 a_position;
void main() { gl_Position = vec4(a_position, 1.0); }
`;
const BACKGROUND_FRAGMENT = `
precision highp float;
uniform vec2 u_resolution;
${INK_GLSL}
void main() { gl_FragColor = vec4(inkBackground(), 1.0); }
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
varying vec3 v_position;
// Edge fade lives in the fragment stage: the glass wall is one quad strip
// with vertices only at ±height, so a vertex-level fade interpolates to zero
// across the whole wall and the glass vanishes.
float edgeFade() {
  float camera = u_resolution.y * 0.5;
  float ndcY = v_position.y / (camera - v_position.z);
  return 1.0 - smoothstep(0.9, 0.995, abs(ndcY));
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
float opacity() {
  float camera = u_resolution.y * 0.5;
  float y = v_position.y / (camera - v_position.z);
  // Keep the centered quotation intact. The other rings recede, and the
  // space below it clears for the native reading layer.
  float quiet = (1.0 - 0.97 * smoothstep(0.10, 0.32, abs(y))) * smoothstep(-0.30, -0.12, y);
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
  float dof = depthBlur();
  float blur = dof * 8.0 / u_atlasSize;
  // Lens chromatic aberration grows with defocus: red/blue channels split
  // along the glyph axis on out-of-focus rows.
  float ca = dof * 3.0 / u_atlasSize;
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
varying vec3 v_normal;
${FOCUS}
${INK_GLSL}
float random(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 transmitted(vec3 n, vec3 v, float ior, float thickness) {
  // Volume transmission: trace the wavelength's ray through the glass and
  // project the exit point into the scene buffer. At this radius the throw
  // lands inside the dark bands between rows, so echoes stay visible.
  vec3 ray = normalize(refract(-v, n, 1.0 / ior)) * thickness;
  vec3 exitPoint = v_position + ray;
  float camera = u_resolution.y * 0.5;
  vec2 uv = exitPoint.xy * camera / (camera - exitPoint.z) / u_resolution + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec3(0.0);
  float fresnel = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  return texture2D(u_texture, uv).rgb * (1.0 - fresnel);
}
void main() {
  vec3 n = normalize(v_normal) * (u_back > 0.5 ? -1.0 : 1.0);
  vec3 v = normalize(vec3(0.0, 0.0, u_resolution.y * 0.5) - v_position);
  vec3 light = vec3(0.0);
  float seed = random(gl_FragCoord.xy);
  for (int i = 0; i < 8; i++) {
    float phase = (float(i) + seed) / 8.0;
    float thickness = u_thickness * (1.0 + 0.1 * phase);
    // Roughness keeps the 8 taps diverging even at the focal plane, so echoes
    // smear into soft halos of light instead of sharp duplicate glyphs.
    float blur = 0.045 + depthBlur() * 0.09;
    vec3 normal = normalize(n + vec3(sin(float(i) * 2.4), cos(float(i) * 2.4), 0.0) * blur);
    light.r += transmitted(normal, v, 1.5, thickness).r;
    light.g += transmitted(normal, v, 1.5 * (1.0 + 0.09 * phase), thickness).g;
    light.b += transmitted(normal, v, 1.5 * (1.0 + 0.20 * phase), thickness).b;
  }
  light /= 8.0;
  // Keep the dispersion calm: echoes stay under the text they came from.
  light *= 0.5;
  // The far wall throws its echoes half a screen away, doubling rows onto
  // each other; keep it to a whisper so only the front fringe reads.
  light *= u_back > 0.5 ? 0.25 : 1.0;
  // Rear and off-axis refraction softens with depth, like a real lens.
  light *= 1.0 - depthBlur() * 0.4;
  float readingFace = centerWeight() * smoothstep(0.45, 0.92, n.z);
  light *= 1.0 - readingFace * 0.86;
  // A barely visible neutral grazing reflection keeps the glass path connected.
  float rim = pow(1.0 - abs(dot(n, v)), 5.0) * 0.04;
  vec3 color = (light + vec3(rim)) * opacity();
  // Add atmosphere only in the final image, outside the refraction buffers.
  // This keeps white glyphs and dispersion intact and grain in screen space.
  if (u_final > 0.5) color += inkBackground();
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
  ['resolution','texture','glyph','cursor','rowOffset','count','loop','radius','arc','curl','recede','pitch','final','reading','thickness','back','noise','dpr','inkLight','atlasSize'].forEach(name => {
    uniforms[name] = gl.getUniformLocation(program, 'u_' + name);
  });
  return { program, uniforms, attributes: ['position','normal','uv'].map(name => gl.getAttribLocation(program, 'a_' + name)) };
}

class WheelRenderer {
  constructor(canvas, atlasCanvas, options) {
    Object.assign(this, options, sceneMetrics(options.width, options.height));
    this.canvas = canvas;
    this.atlasCanvas = atlasCanvas;
    this.dpr = Math.min(options.dpr || 1, 2);
    this.running = false;
    this.destroyed = false;
    this.frameId = null;
    this.motionGeneration = 0;
    this.reading = 0;
    this.buffers = [];
    this.targets = [];
    this.programs = [];
    this.gl = canvas.getContext('webgl', { alpha: false, antialias: true, depth: true, preserveDrawingBuffer: true });
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

  target() {
    const gl = this.gl;
    const texture = this.texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.canvas.width, this.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const buffer = gl.createFramebuffer(), depth = gl.createRenderbuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, this.canvas.width, this.canvas.height);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteTexture(texture); gl.deleteFramebuffer(buffer); gl.deleteRenderbuffer(depth);
      throw new Error('Optical buffer unavailable');
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { texture, buffer, depth };
  }

  geometry(vertices) {
    const gl = this.gl, buffer = gl.createBuffer();
    this.buffers.push(buffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    return { buffer, count: vertices.length / 8 };
  }

  setFrames(frames) {
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
    this.draw();
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
    // Short throw keeps ghost echoes hugging their source glyphs as soft
    // chromatic fringes instead of readable duplicates on neighbouring rows.
    gl.uniform1f(u.thickness, this.radius * (pass === 1 ? 1.5 : 0.3));
    gl.uniform1i(u.texture, 0);
    gl.uniform1f(u.atlasSize, this.atlasSize || 1024);
    gl.uniform1i(u.noise, 1);
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
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.noiseTexture);
    gl.activeTexture(gl.TEXTURE0);
    // 1: unobstructed scene. 2: rear glass + text. 3: front glass + text.
    for (let pass = 0; pass < 3; pass++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, pass < 2 ? this.targets[pass].buffer : null);
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
        if (lastDraw === null || timestamp - lastDraw >= 32) {
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
  }
}

module.exports = { WheelRenderer };
