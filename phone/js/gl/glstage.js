// The WebGL2 layer under the 2D canvas. Draws a list of parts (see parts.js), one
// instanced-free quad each: a few dozen draw calls a frame at most, so plain uniforms
// are simpler and plenty fast. If WebGL2 is missing or the context is lost, `ok` goes
// false and the renderer falls back to Canvas 2D.

import { VERTEX, FRAGMENT } from './shaders.js';
import { linear, normalMatrix, scaleOf, partOnScreen } from './parts.js';

const UNIFORMS = ['uBox', 'uRow0', 'uRow1', 'uRes', 'uShape', 'uMode', 'uP0', 'uP1', 'uBalls', 'uNBalls', 'uN', 'uK',
  'uColor', 'uColor2', 'uSss', 'uMatA', 'uMatB', 'uMatC'];

export class GLStage {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas, { onLost } = {}) {
    this.canvas = canvas;
    this.onLost = onLost;
    this.ok = false;
    this.balls = new Float32Array(32);
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.ok = false;
      this.onLost?.();
    });
    canvas.addEventListener('webglcontextrestored', () => this.init());
    this.init();
  }

  init() {
    const gl = this.canvas.getContext('webgl2', {
      alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
      preserveDrawingBuffer: false, powerPreference: 'low-power', desynchronized: true,
    });
    if (!gl) return;
    this.gl = gl;
    this.software = isSoftware(gl);
    const prog = link(gl, VERTEX, FRAGMENT);
    if (!prog) return;
    this.prog = prog;
    this.u = Object.fromEntries(UNIFORMS.map((n) => [n, gl.getUniformLocation(prog, n)]));
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aCorner');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.ok = true;
  }

  resize(width, height) {
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
  }

  clear() {
    if (!this.ok) return;
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /** Draws parts in order (painter's algorithm). Returns how many were drawn. */
  draw(parts) {
    if (!this.ok) return 0;
    const gl = this.gl;
    const { u } = this;
    const W = this.canvas.width, H = this.canvas.height;
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(u.uRes, W, H);
    let drawn = 0;
    for (const part of parts) {
      if (!partOnScreen(part, W, H)) continue;
      const { m, box, mat, params } = part;
      gl.uniform4f(u.uBox, box.cx, box.cy, box.hx, box.hy);
      gl.uniform3f(u.uRow0, m[0], m[2], m[4]);
      gl.uniform3f(u.uRow1, m[1], m[3], m[5]);
      gl.uniformMatrix2fv(u.uN, false, normalMatrix(m));
      gl.uniform1f(u.uK, scaleOf(m));
      gl.uniform1i(u.uShape, part.shape);
      gl.uniform1i(u.uMode, part.mode);
      gl.uniform4f(u.uP0, params[0], params[1], params[2], params[3]);
      gl.uniform4f(u.uP1, params[4], params[5], params[6], params[7]);
      if (part.circles) {
        this.balls.fill(0);
        part.circles.forEach((c, i) => { this.balls[i * 4] = c.x; this.balls[i * 4 + 1] = c.y; this.balls[i * 4 + 2] = c.r; });
        gl.uniform4fv(u.uBalls, this.balls);
        gl.uniform1i(u.uNBalls, part.circles.length);
      }
      const c = linear(mat.color ?? '#ffffff');
      const c2 = linear(mat.color2 ?? mat.color ?? '#ffffff');
      const s = linear(mat.sssColor ?? mat.color ?? '#ffffff');
      gl.uniform3f(u.uColor, c[0], c[1], c[2]);
      gl.uniform3f(u.uColor2, c2[0], c2[1], c2[2]);
      gl.uniform3f(u.uSss, s[0], s[1], s[2]);
      gl.uniform4f(u.uMatA, mat.wrap ?? 0.4, mat.spec ?? 0.2, mat.shine ?? 20, mat.rim ?? 0.3);
      gl.uniform4f(u.uMatB, mat.ao ?? 0.2, mat.grain ?? 0, mat.emissive ?? 0, mat.alpha ?? 1);
      gl.uniform4f(u.uMatC, mat.depth ?? 0.4, mat.bevel ?? 0.1, mat.grad ?? 0, mat.sss ?? 0.4);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      drawn++;
    }
    return drawn;
  }
}

/** Software GL (SwiftShader, llvmpipe, WARP) is too slow for every-frame shading. */
function isSoftware(gl) {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    return /swiftshader|llvmpipe|software|basic render|warp/i.test(name);
  } catch {
    return false;
  }
}

function link(gl, vs, fs) {
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const p = gl.createProgram();
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.warn('Peek Pets GL link failed:', gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.warn('Peek Pets GL compile failed:', gl.getShaderInfoLog(s));
    return null;
  }
  return s;
}
