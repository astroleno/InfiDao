const { paintAtlas } = require('./atlas');
const { CELL, modulo } = require('./timeline');
const { sceneMetrics, wheelGeometry, quotationGeometry } = require('./scene');

const VERTEX = `
precision highp float;
attribute vec3 a_position;
attribute vec3 a_normal;
attribute vec2 a_uv;
uniform vec2 u_resolution;
uniform float u_glyph;
uniform float u_cursor;
uniform float u_count;
uniform float u_radius;
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
    localY = mod(localY + period * 0.5, period) - period * 0.5;
    // All five bands turn together around the upright Y axis. A full phrase
    // arrives facing the reader whenever the next line crosses the center.
    float angle = a_position.x - u_cursor * 2.09439510239;
    p = vec3(sin(angle) * (u_radius + 0.8) + cos(angle) * a_position.y,
      localY + a_position.z,
      cos(angle) * (u_radius + 0.8) - sin(angle) * a_position.y);
    n = vec3(sin(angle), 0.0, cos(angle));
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
uniform float u_pitch;
uniform float u_final;
varying vec3 v_position;
float focus() { float d = v_position.y / u_pitch; return exp(-d * d * 2.2); }
float opacity() {
  float d = abs(v_position.y / u_pitch);
  return (u_final > 0.5 ? exp(-d * d * 0.42) : 1.0) * (1.0 - smoothstep(2.6, 3.2, d));
}
`;

const TEXT_FRAGMENT = `
precision highp float;
uniform sampler2D u_texture;
varying vec2 v_uv;
${FOCUS}
void main() {
  float blur = (1.0 - focus()) * 1.5 / 1024.0;
  float a = texture2D(u_texture, v_uv).a * 0.36;
  a += texture2D(u_texture, v_uv + vec2(blur, 0.0)).a * 0.16;
  a += texture2D(u_texture, v_uv - vec2(blur, 0.0)).a * 0.16;
  a += texture2D(u_texture, v_uv + vec2(0.0, blur)).a * 0.16;
  a += texture2D(u_texture, v_uv - vec2(0.0, blur)).a * 0.16;
  if (a < 0.005 || opacity() < 0.001) discard;
  gl_FragColor = vec4(vec3(opacity()), a);
}
`;

// Adapted from MeshTransmissionMaterial's volume transmission: trace different
// wavelengths through rear/front surfaces, project the exit rays into scene FBOs.
// Foreground glyphs stay white; the glass produces the dispersion.
const GLASS_FRAGMENT = `
precision highp float;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_thickness;
uniform float u_back;
varying vec3 v_normal;
${FOCUS}
float random(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 transmitted(vec3 n, vec3 v, float ior, float thickness) {
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
    float blur = (1.0 - focus()) * 0.012;
    vec3 normal = normalize(n + vec3(sin(float(i) * 2.4), cos(float(i) * 2.4), 0.0) * blur);
    light.r += transmitted(normal, v, 1.5, thickness).r;
    light.g += transmitted(normal, v, 1.5 * (1.0 + 0.05 * phase), thickness).g;
    light.b += transmitted(normal, v, 1.5 * (1.0 + 0.10 * phase), thickness).b;
  }
  light /= 8.0;
  float readingFace = focus() * smoothstep(0.45, 0.92, n.z);
  light *= 1.0 - readingFace * 0.86;
  // A barely visible neutral grazing reflection keeps the glass path connected.
  float rim = pow(1.0 - abs(dot(n, v)), 5.0) * 0.022;
  gl_FragColor = vec4((light + vec3(rim)) * opacity(), 1.0);
}
`;

function makeProgram(gl, fragment) {
  const shaders = [];
  const program = gl.createProgram();
  try {
    [gl.VERTEX_SHADER, gl.FRAGMENT_SHADER].forEach((type, i) => {
      const shader = gl.createShader(type);
      shaders.push(shader);
      gl.shaderSource(shader, i ? fragment : VERTEX);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      gl.attachShader(program, shader);
    });
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  } catch (error) { gl.deleteProgram(program); throw error; }
  finally { shaders.forEach(shader => gl.deleteShader(shader)); }
  const uniforms = {};
  ['resolution','texture','glyph','cursor','count','radius','pitch','final','thickness','back'].forEach(name => {
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
    this.scrollPitch = this.pitch * (this.height * 0.5) / (this.height * 0.5 - this.radius);
    this.running = false;
    this.destroyed = false;
    this.frameId = null;
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
    const glyphs = paintAtlas(this.atlasCanvas, frames), gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.textTexture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.atlasCanvas);
    if (gl.getError() !== gl.NO_ERROR) throw new Error('Glyph upload failed');
    this.quotations = this.geometry(quotationGeometry(frames, glyphs, this.radius, this.fontSize));
    this.count = frames.length;
    this.draw();
  }

  mesh(program, geometry, pass, glyph) {
    const gl = this.gl, u = program.uniforms;
    gl.useProgram(program.program);
    gl.uniform2f(u.resolution, this.width, this.height);
    gl.uniform1f(u.cursor, this.timeline.position / CELL - 0.46);
    gl.uniform1f(u.count, this.count);
    gl.uniform1f(u.radius, this.radius);
    gl.uniform1f(u.pitch, this.pitch);
    gl.uniform1f(u.glyph, glyph ? 1 : 0);
    gl.uniform1f(u.final, pass === 2 ? 1 : 0);
    gl.uniform1f(u.back, pass === 1 ? 1 : 0);
    gl.uniform1f(u.thickness, this.radius * (pass === 1 ? 2.5 : 1));
    gl.uniform1i(u.texture, 0);
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
    gl.activeTexture(gl.TEXTURE0);
    // 1: unobstructed scene. 2: rear glass + text. 3: front glass + text.
    for (let pass = 0; pass < 3; pass++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, pass < 2 ? this.targets[pass].buffer : null);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (pass) {
        gl.bindTexture(gl.TEXTURE_2D, this.targets[pass - 1].texture);
        gl.cullFace(pass === 1 ? gl.FRONT : gl.BACK);
        this.mesh(this.glassProgram, this.glass, pass, false);
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
    this.timeline.lastTime = null;
    let lastDraw = null;
    const loop = timestamp => {
      if (!this.running || this.destroyed) return;
      try {
        if (lastDraw === null || timestamp - lastDraw >= 32) {
          this.timeline.tick(timestamp); this.draw();
          if (this.onFrame) this.onFrame();
          lastDraw = timestamp;
        }
        this.frameId = this.canvas.requestAnimationFrame(loop);
      } catch (error) { this.stop(); if (this.onError) this.onError(error); }
    };
    this.frameId = this.canvas.requestAnimationFrame(loop);
  }

  center() {
    if (this.destroyed) return;
    this.stop();
    const from = this.timeline.position;
    const target = (Math.round(from / CELL - 0.46) + 0.46) * CELL;
    let began = null;
    const settle = now => {
      if (this.destroyed) return;
      if (began === null) began = now;
      const progress = Math.min((now - began) / 420, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      this.timeline.position = modulo(from + (target - from) * eased, this.count * CELL);
      try {
        this.draw();
        if (this.onFrame) this.onFrame();
      } catch (error) { this.stop(); if (this.onError) this.onError(error); return; }
      this.frameId = progress < 1 ? this.canvas.requestAnimationFrame(settle) : null;
    };
    this.frameId = this.canvas.requestAnimationFrame(settle);
  }

  stop() {
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
  }
}

module.exports = { WheelRenderer };
