// Stage 5: a real 2D scalar-wave simulation (finite differences on the GPU).
// Two waves run side by side in one texture: red light in RG, violet light in BA.
// Each channel pair holds (current, previous) so one pass advances one time step.
import { label, INK2, MONO } from '../draw.js';

export const name = 'Wave';
export const scaleM = 1e-6;
export const controls = ['split'];
export const caption = {
  title: 'Why colour bends differently',
  body: 'Light is a wave. In water it travels slower, so its crests bunch up and the whole wave swings toward the surface. Shorter waves, like violet, slow down a little more than longer ones, like red, so they swing a little further. That tiny difference, made in every drop in the sky, is the rainbow.',
};

const N_RED = 1.3311, N_VIO = 1.3435;            // water at 650 nm and 420 nm
const LAM_RED = 20, LAM_VIO = 20 * 420 / 650;   // grid cells per wavelength
const C0 = 0.5, LAYER = 22, SRC_X = 28, STEPS = 6, AMP = 0.45;   // AMP calibrated so the plane wave has amplitude ~0.7
const TILT = 31 * Math.PI / 180;                 // surface tangent angle; light hits at 59°, like the drop

const VS = `#version 300 es
in vec2 p; out vec2 v; void main(){ v = p*0.5+0.5; gl_Position = vec4(p,0.0,1.0); }`;
const STEP = `#version 300 es
precision highp float; in vec2 v; out vec4 o;
uniform sampler2D S; uniform vec2 T, dim, arcC; uniform float arcR, t, nR, nV, wR, wV, aR, aV, ramp;
void main(){
  vec4 s = texture(S, v);
  vec4 l = texture(S, v+vec2(T.x,0.)) + texture(S, v-vec2(T.x,0.)) + texture(S, v+vec2(0.,T.y)) + texture(S, v-vec2(0.,T.y)) - 4.0*s;
  vec2 p = v*dim;
  float water = step(distance(p, arcC), arcR);
  float cR = ${C0}/mix(1.0, nR, water), cV = ${C0}/mix(1.0, nV, water);
  float ur = 2.0*s.r - s.g + cR*cR*l.r;
  float uv = 2.0*s.b - s.a + cV*cV*l.b;
  float src = step(abs(p.x - ${SRC_X}.0), 0.5);
  ur += src*aR*sin(wR*t)*ramp; uv += src*aV*sin(wV*t)*ramp;
  float L = ${LAYER}.0;
  float dl = max(max(L-p.x, p.x-(dim.x-L)), max(L-p.y, p.y-(dim.y-L)));
  dl = clamp(dl/L, 0.0, 1.0); float d = 0.2*dl*dl;
  ur *= 1.0-d; uv *= 1.0-d;
  o = vec4(ur, s.r, uv, s.b);
}`;
const SHOW = `#version 300 es
precision highp float; in vec2 v; out vec4 o;
uniform sampler2D S; uniform vec2 dim, arcC; uniform float arcR;
void main(){
  vec4 s = texture(S, v); vec2 p = v*dim;
  float r = pow(max(s.r,0.0)*1.35, 1.7), b = pow(max(s.b,0.0)*1.35, 1.7);
  float water = step(distance(p, arcC), arcR);
  vec3 col = vec3(1.0,0.24,0.12)*r + vec3(0.55,0.32,1.0)*b;
  col = 1.0 - exp(-col*0.9);
  col += vec3(0.02,0.03,0.07) + water*vec3(0.02,0.07,0.15);
  float edge = 1.0 - smoothstep(0.0, 1.5, abs(distance(p, arcC)-arcR));
  col += edge*0.28;
  o = vec4(col, 1.0);
}`;

let gl = null, glc = null, prog = {}, tex = [], fb = [], SW = 0, SH = 0, t = 0, dead = false, cur = 0, phase = 0;

function shader(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
function program(fs) { const p = gl.createProgram(); gl.attachShader(p, shader(gl.VERTEX_SHADER, VS)); gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); const u = {}; for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) { const n = gl.getActiveUniform(p, i).name; u[n] = gl.getUniformLocation(p, n); } return { p, u }; }

function setup(W, H) {
  const aspect = W / H, sw = Math.round(Math.sqrt(210000 * aspect)), sh = Math.round(sw / aspect);
  if (gl && sw === SW && sh === SH) return true;
  if (dead) return false;
  try {
    if (!gl) {
      glc = document.createElement('canvas');
      gl = glc.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true, premultipliedAlpha: false });
      if (!gl || !gl.getExtension('EXT_color_buffer_float')) throw new Error('no float render targets');
      prog.step = program(STEP); prog.show = program(SHOW);
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      for (const q of [prog.step, prog.show]) { const a = gl.getAttribLocation(q.p, 'p'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0); }
    }
    SW = sw; SH = sh; glc.width = SW; glc.height = SH; t = 0;
    tex.forEach(x => gl.deleteTexture(x)); fb.forEach(x => gl.deleteFramebuffer(x)); tex = []; fb = [];
    for (let i = 0; i < 2; i++) {
      const x = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, x);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, SW, SH, 0, gl.RGBA, gl.FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, x, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('fbo incomplete');
      tex.push(x); fb.push(f);
    }
    return true;
  } catch (e) { console.warn('wave sim: falling back to 2D', e); dead = true; return false; }
}

let mid = [0.5, 0.5];   // where the surface crosses, as a fraction of the canvas (y up)
function arc() {
  // surface through the visible region's centre, curving very gently: water is down and to the right
  const R = SW * 2.4, nx = Math.sin(TILT), ny = -Math.cos(TILT);
  return { cx: SW * mid[0] + nx * R, cy: SH * mid[1] + ny * R, R };
}
function nViolet(S) { return S.split ? N_RED + (N_VIO - N_RED) * 10 : N_VIO; }

function simulate(S) {
  mid = [S.V.cx / S.W, 1 - S.V.cy / S.H];
  const a = arc(), wR = C0 * 2 * Math.PI / LAM_RED, wV = C0 * 2 * Math.PI / LAM_VIO;
  gl.viewport(0, 0, SW, SH); gl.useProgram(prog.step.p);
  const u = prog.step.u;
  gl.uniform2f(u.T, 1 / SW, 1 / SH); gl.uniform2f(u.dim, SW, SH); gl.uniform2f(u.arcC, a.cx, a.cy); gl.uniform1f(u.arcR, a.R);
  gl.uniform1f(u.nR, N_RED); gl.uniform1f(u.nV, nViolet(S)); gl.uniform1f(u.wR, wR); gl.uniform1f(u.wV, wV);
  gl.uniform1f(u.aR, 2 * C0 * wR * AMP); gl.uniform1f(u.aV, 2 * C0 * wV * AMP);
  const steps = S.reduced ? 2 : STEPS;
  for (let i = 0; i < steps; i++) {
    gl.uniform1f(u.t, t); gl.uniform1f(u.ramp, Math.min(1, t / 120));
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb[1 - cur]); gl.bindTexture(gl.TEXTURE_2D, tex[cur]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); cur = 1 - cur; t++;
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.useProgram(prog.show.p);
  const s = prog.show.u; gl.uniform2f(s.dim, SW, SH); gl.uniform2f(s.arcC, a.cx, a.cy); gl.uniform1f(s.arcR, a.R);
  gl.bindTexture(gl.TEXTURE_2D, tex[cur]); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// Keep the sim warm while the previous stage is on screen so the wave has arrived when we get here.
export function warm(W, H, S) { if (setup(W, H)) simulate(S); }

// 2D stand-in when WebGL float textures are unavailable: crests drawn analytically.
function fallback(g, W, H, S, time) {
  const R = W * 2.4, nx = Math.sin(TILT), ny = -Math.cos(TILT), cx = S.V.cx + nx * R, cy = S.V.cy + ny * R;
  phase = S.reduced ? 0 : time * 0.002;
  g.fillStyle = '#05070F'; g.fillRect(0, 0, W, H);
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fillStyle = 'rgba(30,70,140,.25)'; g.fill(); g.restore();
  const lam = W / 22;
  const draw = (col, n, lamPx, clipWater) => {
    g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 7); if (!clipWater) { g.rect(W, 0, -W, H); } g.clip('evenodd');
    g.strokeStyle = col; g.lineWidth = 1.5;
    const th = clipWater ? Math.asin(Math.sin(59 * Math.PI / 180) / n) : 59 * Math.PI / 180;
    const dir = clipWater ? [Math.cos(TILT - Math.PI / 2 + th), Math.sin(TILT - Math.PI / 2 + th)] : [1, 0];
    const sp = clipWater ? lamPx / n : lamPx, per = [-dir[1], dir[0]], off = (phase * lamPx) % sp;
    for (let i = -60; i < 60; i++) {
      const c = [W / 2 + dir[0] * (i * sp + off), H / 2 + dir[1] * (i * sp + off)];
      g.beginPath(); g.moveTo(c[0] - per[0] * W * 2, c[1] - per[1] * W * 2); g.lineTo(c[0] + per[0] * W * 2, c[1] + per[1] * W * 2); g.stroke();
    }
    g.restore();
  };
  draw('rgba(255,60,30,.7)', N_RED, lam, false); draw('rgba(255,60,30,.7)', N_RED, lam, true);
  draw('rgba(140,80,255,.7)', nViolet(S), lam * 420 / 650, false); draw('rgba(140,80,255,.7)', nViolet(S), lam * 420 / 650, true);
  g.strokeStyle = 'rgba(234,240,255,.5)'; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
}

export function box() { return { x: 0, y: 0, w: 1 }; }

export function draw(g, W, H, S, time) {
  if (setup(W, H)) { simulate(S); g.imageSmoothingEnabled = true; g.drawImage(glc, 0, 0, W, H); }
  else fallback(g, W, H, S, time);

  const V = S.V, cellPx = SW ? W / SW : (W / 22) / LAM_RED, micron = (1000 / 650) * LAM_RED * cellPx;
  label(g, 'air', V.x0 + 16, V.y0 + 18, 'left');
  label(g, 'water', V.x1 - 16, V.y1 - 18, 'right');
  label(g, 'sunlight →', V.x0 + 16, V.cy - V.h * 0.32, 'left', INK2);
  // legend and scale bar
  const y = V.y1 - 18, x = V.x0 + 16;
  g.fillStyle = 'rgba(255,60,30,.95)'; g.fillRect(x, y - 4, 14, 8); label(g, 'red, 650 nm', x + 20, y, 'left', INK2, MONO);
  g.fillStyle = 'rgba(140,80,255,.95)'; g.fillRect(x + 120, y - 4, 14, 8); label(g, 'violet, 420 nm', x + 140, y, 'left', INK2, MONO);
  const by = y - 26; g.strokeStyle = 'rgba(234,240,255,.8)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(x, by); g.lineTo(x + micron, by); g.moveTo(x, by - 4); g.lineTo(x, by + 4); g.moveTo(x + micron, by - 4); g.lineTo(x + micron, by + 4); g.stroke();
  label(g, '1 µm', x + micron + 8, by, 'left', INK2, MONO);
}
