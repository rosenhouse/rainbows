// Stage 5: a real 2D scalar-wave simulation (finite differences on the GPU).
// Two waves run side by side in one texture: red light in RG, violet light in BA.
// Each channel pair holds (current, previous) so one pass advances one time step.
import { label, INK2, MONO } from '../draw.js';

export const name = 'Wave';
export const scaleM = 1e-6;
export const controls = ['sun', 'split'];
export const caption = {
  title: 'Why colour bends differently',
  body: 'Light is a wave. In water it travels slower, so its crests bunch up and the whole wave swings toward the surface. Shorter waves, like violet, slow down a little more than longer ones, like red, so they swing a little further. That tiny difference, made in every drop in the sky, is the rainbow.',
};

const N_RED = 1.3311, N_VIO = 1.3435;            // water at 650 nm and 420 nm
const LAM_RED = 20, LAM_VIO = 20 * 420 / 650;   // grid cells per wavelength
const C0 = 0.5, LAYER = 22, SRC_X = 28, AMP = 0.45;   // AMP calibrated so the plane wave has amplitude ~0.7
const SPEED = 22;          // crest speed on screen, grid cells per second (a red crest passes about once a second)
const WARM_STEPS = 2600;   // burst through the start-up so the wave has already crossed the screen
const TILT = 31 * Math.PI / 180;                 // surface tangent angle; light hits at 59°, like the drop

const VS = `#version 300 es
in vec2 p; out vec2 v; void main(){ v = p*0.5+0.5; gl_Position = vec4(p,0.0,1.0); }`;
const STEP = `#version 300 es
precision highp float; in vec2 v; out vec4 o;
uniform sampler2D S; uniform vec2 T, dim, arcC; uniform float arcR, t, nR, nV, wR, wV, aR, aV, ramp;
void main(){
  vec4 s = texture(S, v);
  vec2 p = v*dim;
  // u_tt = c div(c grad u): same wave speeds as u_tt = c^2 lap(u), but the interface reflects less
  // (about 4% of the light instead of 11%), which keeps the picture readable. Real rainbow light sits
  // between the two, depending on its polarisation.
  vec2 dx = vec2(T.x, 0.), dy = vec2(0., T.y);
  vec4 e = texture(S, v+dx), w = texture(S, v-dx), n = texture(S, v+dy), so = texture(S, v-dy);
  float water = step(distance(p, arcC), arcR);
  float wE = step(distance(p+vec2(1.,0.), arcC), arcR), wW = step(distance(p-vec2(1.,0.), arcC), arcR);
  float wN = step(distance(p+vec2(0.,1.), arcC), arcR), wS = step(distance(p-vec2(0.,1.), arcC), arcR);
  float cR = ${C0}/mix(1.0, nR, water), cV = ${C0}/mix(1.0, nV, water);
  float cRE = 0.5*(cR + ${C0}/mix(1.0, nR, wE)), cRW = 0.5*(cR + ${C0}/mix(1.0, nR, wW)), cRN = 0.5*(cR + ${C0}/mix(1.0, nR, wN)), cRS = 0.5*(cR + ${C0}/mix(1.0, nR, wS));
  float cVE = 0.5*(cV + ${C0}/mix(1.0, nV, wE)), cVW = 0.5*(cV + ${C0}/mix(1.0, nV, wW)), cVN = 0.5*(cV + ${C0}/mix(1.0, nV, wN)), cVS = 0.5*(cV + ${C0}/mix(1.0, nV, wS));
  float lr = cRE*(e.r-s.r) + cRW*(w.r-s.r) + cRN*(n.r-s.r) + cRS*(so.r-s.r);
  float lv = cVE*(e.b-s.b) + cVW*(w.b-s.b) + cVN*(n.b-s.b) + cVS*(so.b-s.b);
  float ur = 2.0*s.r - s.g + cR*lr;
  float uv = 2.0*s.b - s.a + cV*lv;
  float src = step(abs(p.x - ${SRC_X}.0), 0.5) * (1.0 - water);   // sunlight is launched in the air only
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

let gl = null, glc = null, prog = {}, tex = [], fb = [], SW = 0, SH = 0, t = 0, dead = false, cur = 0, phase = 0, acc = 0, lastTime = 0;

function shader(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
function program(fs) { const p = gl.createProgram(); gl.attachShader(p, shader(gl.VERTEX_SHADER, VS)); gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); const u = {}; for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) { const n = gl.getActiveUniform(p, i).name; u[n] = gl.getUniformLocation(p, n); } return { p, u }; }

// The simulation runs on a fixed square grid. On screen the square is rotated by the Sun's height
// (so sunlight slopes the same way as in the drop stage) and sized to cover the whole canvas at any tilt.
const GRID = 640;
const domain = (W, H) => 1.22 * (W + H) / Math.SQRT2;   // covers the canvas at any tilt, with the absorbing borders kept off screen
function setup(W, H) {
  if (gl) return true;
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
    SW = SH = GRID; glc.width = SW; glc.height = SH; t = 0;
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

let mid = [0.5, 0.5], tilt = TILT;   // where the surface crosses (fraction of the canvas, y up) and its slope
function arc() {
  // surface through the visible region's centre, curving very gently: water is down and to the right
  const R = SW * 2.4, nx = Math.sin(tilt), ny = -Math.cos(tilt);
  return { cx: SW * mid[0] + nx * R, cy: SH * mid[1] + ny * R, R };
}
function nViolet(S) { return S.split ? N_RED + (N_VIO - N_RED) * 10 : N_VIO; }

function simulate(S, time) {
  // where the visible region's centre lands in the (unrotated) simulation square
  const e = S.sun * Math.PI / 180, D = domain(S.W, S.H), ox = S.V.cx - S.W / 2, oy = S.V.cy - S.H / 2;
  const ux = ox * Math.cos(e) + oy * Math.sin(e), uy = -ox * Math.sin(e) + oy * Math.cos(e);
  mid = [0.5 + ux / D, 0.5 - uy / D]; tilt = TILT;
  const a = arc(), wR = C0 * 2 * Math.PI / LAM_RED, wV = C0 * 2 * Math.PI / LAM_VIO;
  gl.viewport(0, 0, SW, SH); gl.useProgram(prog.step.p);
  const u = prog.step.u;
  gl.uniform2f(u.T, 1 / SW, 1 / SH); gl.uniform2f(u.dim, SW, SH); gl.uniform2f(u.arcC, a.cx, a.cy); gl.uniform1f(u.arcR, a.R);
  gl.uniform1f(u.nR, N_RED); gl.uniform1f(u.nV, nViolet(S)); gl.uniform1f(u.wR, wR); gl.uniform1f(u.wV, wV);
  gl.uniform1f(u.aR, 2 * C0 * wR * AMP); gl.uniform1f(u.aV, 2 * C0 * wV * AMP);
  const dt = lastTime ? Math.min(100, time - lastTime) : 16; lastTime = time;
  acc += dt / 1000 * (SPEED / C0) * (S.reduced ? 0.6 : 1);
  let steps = Math.floor(acc); acc -= steps;
  if (t < WARM_STEPS) steps = Math.min(WARM_STEPS - t, 220);
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
export function warm(W, H, S, time) { if (setup(W, H)) simulate(S, time); }

// 2D stand-in when WebGL float textures are unavailable: crests drawn analytically.
function fallback(g, D, S, time) {
  const R = D * 2.4, nx = Math.sin(TILT), ny = -Math.cos(TILT), mx = mid[0] * D, my = (1 - mid[1]) * D, cx = mx + nx * R, cy = my + ny * R;
  phase = S.reduced ? 0 : time * 0.002;
  g.fillStyle = '#05070F'; g.fillRect(0, 0, D, D);
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fillStyle = 'rgba(30,70,140,.25)'; g.fill(); g.restore();
  const lam = D / GRID * LAM_RED;
  const draw = (col, n, lamPx, clipWater) => {
    g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 7); if (!clipWater) { g.rect(D, 0, -D, D); } g.clip('evenodd');
    g.strokeStyle = col; g.lineWidth = 1.5;
    const th = clipWater ? Math.asin(Math.sin(59 * Math.PI / 180) / n) : 59 * Math.PI / 180;
    const dir = clipWater ? [Math.cos(TILT - Math.PI / 2 + th), Math.sin(TILT - Math.PI / 2 + th)] : [1, 0];
    const sp = clipWater ? lamPx / n : lamPx, per = [-dir[1], dir[0]], off = (phase * lamPx) % sp;
    for (let i = -80; i < 80; i++) {
      const c = [mx + dir[0] * (i * sp + off), my + dir[1] * (i * sp + off)];
      g.beginPath(); g.moveTo(c[0] - per[0] * D * 2, c[1] - per[1] * D * 2); g.lineTo(c[0] + per[0] * D * 2, c[1] + per[1] * D * 2); g.stroke();
    }
    g.restore();
  };
  draw('rgba(255,60,30,.7)', N_RED, lam, false); draw('rgba(255,60,30,.7)', N_RED, lam, true);
  draw('rgba(140,80,255,.7)', nViolet(S), lam * 420 / 650, false); draw('rgba(140,80,255,.7)', nViolet(S), lam * 420 / 650, true);
  g.strokeStyle = 'rgba(234,240,255,.5)'; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
}

export function box() { return { x: 0, y: 0, w: 1 }; }

export function draw(g, W, H, S, time) {
  const D = domain(W, H), e = S.sun * Math.PI / 180;
  g.save(); g.translate(W / 2, H / 2); g.rotate(e); g.translate(-D / 2, -D / 2);
  if (setup(W, H)) { simulate(S, time); g.imageSmoothingEnabled = true; g.drawImage(glc, 0, 0, D, D); }
  else fallback(g, D, S, time);
  g.restore();

  const V = S.V, cellPx = D / GRID, micron = (1000 / 650) * LAM_RED * cellPx;
  label(g, 'air', V.x0 + 16, V.y0 + 18, 'left');
  label(g, 'water', V.x1 - 16, V.y1 - 18, 'right');
  g.save(); g.translate(V.x0 + 16, V.cy - V.h * 0.32); g.rotate(S.sun * Math.PI / 180); label(g, 'sunlight →', 0, 0, 'left', INK2); g.restore();
  // legend and scale bar
  const y = V.y1 - 18, x = V.x0 + 16;
  g.fillStyle = 'rgba(255,60,30,.95)'; g.fillRect(x, y - 4, 14, 8); label(g, 'red, 650 nm', x + 20, y, 'left', INK2, MONO);
  g.fillStyle = 'rgba(140,80,255,.95)'; g.fillRect(x + 120, y - 4, 14, 8); label(g, 'violet, 420 nm', x + 140, y, 'left', INK2, MONO);
  const by = y - 26; g.strokeStyle = 'rgba(234,240,255,.8)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(x, by); g.lineTo(x + micron, by); g.moveTo(x, by - 4); g.lineTo(x, by + 4); g.moveTo(x + micron, by - 4); g.lineTo(x + micron, by + 4); g.stroke();
  label(g, '1 µm', x + micron + 8, by, 'left', INK2, MONO);
}
