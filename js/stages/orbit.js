// Stage 1: a small 3D scene (Sun, Earth, you, the 42° cone) drawn with a perspective camera.
// During the zoom into stage 2 the camera swings 90° from a side view to a spot just behind your
// head looking along the line opposite the Sun, so the cone becomes the bow in the sky.
import { label, prng, INK2, smooth, lerp } from '../draw.js';
import { A, v3, slerp, scene, camera, project, line, conePoint, drawCone, drawAntisolar } from '../scene3d.js';
import * as sky from './sky.js';

export const name = 'Orbit';
export const scaleM = 1e8;
export const controls = ['sun'];
export const ownTransition = true;
export const caption = {
  title: 'Sunlight arrives in parallel',
  body: 'The Sun is so far away that every ray reaching Earth travels in the same direction. Your rainbow lives on a cone with its tip at your eye, opening 42° either side of the line pointing away from the Sun. Drag the Sun lower or higher to move where you are standing.',
};

const SUN = [-3.8, 0, 0], SUN_R = 0.55, SCENE_W = 5.5, SCENE_MID = [-1.55, 0, 0];

let stars = [], starKey = '';
function ensureStars(W, H) {
  const key = W + 'x' + H; if (key === starKey) return; starKey = key;
  const r = prng(11);
  stars = Array.from({ length: 150 }, () => ({ x: r() * W, y: r() * H, a: 0.12 + r() * 0.6, s: r() < 0.12 ? 1.8 : 1.1 }));
}

// Camera for transition parameter f (0 = side view from orbit, 1 = behind your head, looking level).
function orbitCamera(S, f) {
  const V = S.V, { up, p, h } = scene(S), sk = sky.geo(S), F1 = sk.F;
  const D0 = 40, F0 = 0.86 * V.w * D0 / SCENE_W;            // far away, almost orthographic, scene fills the view
  const t = smooth(Math.min(1, f / 0.7));                  // the move is finished by 70%, then holds for the cross-fade
  const tt = smooth(Math.min(1, f / 0.15));                // aim at you almost at once, so the camera never dives through the Earth
  const target = v3.add(v3.mul(SCENE_MID, 1 - tt), v3.mul(p, tt));
  const dir = slerp([0, 0, 1], v3.mul(h, -1), t);          // camera sits in front of the scene, then swings behind your head
  const dist = Math.exp(lerp(Math.log(D0), Math.log(0.004), t));
  const fwd = v3.mul(dir, -1);
  const upHint = v3.norm(v3.add(v3.mul([0, 1, 0], 1 - t), v3.mul(up, t)));
  const pos = v3.add(target, v3.mul(dir, dist));
  const F = Math.exp(lerp(Math.log(F0), Math.log(F1), t));
  return { ...camera(pos, fwd, upHint, F, V.cx, sk.hy), F1, t };
}
export function box(W, H, S) { const C = orbitCamera(S, 0), q = project(C, scene(S).p); return { x: q.x, y: q.y, w: W * 0.09 }; }

export function draw(g, W, H, S, time, f = 0) {
  ensureStars(W, H);
  const { up, p } = scene(S), C = orbitCamera(S, f);
  for (const s of stars) { g.fillStyle = `rgba(220,230,255,${s.a})`; g.fillRect(s.x, s.y, s.s, s.s); }

  // Sun, with a wide glow (skipped once it is behind the camera)
  const sun = project(C, SUN);
  if (sun.z > 0.5) {
    const r = C.F * SUN_R / sun.z;
    let gr = g.createRadialGradient(sun.x, sun.y, r * 0.5, sun.x, sun.y, r * 4.5);
    gr.addColorStop(0, 'rgba(255,205,110,.5)'); gr.addColorStop(1, 'rgba(255,205,110,0)');
    g.fillStyle = gr; g.fillRect(sun.x - r * 4.5, sun.y - r * 4.5, r * 9, r * 9);
    g.fillStyle = '#FFD98A'; g.beginPath(); g.arc(sun.x, sun.y, r, 0, 7); g.fill();
    label(g, 'the Sun', sun.x, sun.y + r + 22, 'center');
  }

  // Parallel rays: a ring of them around the Sun–Earth line. Seen from behind your head they all
  // converge on the one point opposite the Sun.
  g.strokeStyle = 'rgba(255,215,140,.22)'; g.lineWidth = 1;
  const x0 = SUN[0] + SUN_R + 0.1;
  for (let i = 0; i < 14; i++) {
    const ph = i / 14 * Math.PI * 2, rr = i % 2 ? 1.55 : 0.9, y = Math.sin(ph) * rr, z = Math.cos(ph) * rr;
    const hits = y * y + z * z < 1, xe = hits ? -Math.sqrt(1 - y * y - z * z) : 3.5;
    line(g, C, [x0, y, z], [xe, y, z]);
  }
  // the ray that reaches you
  g.strokeStyle = 'rgba(255,225,160,.9)'; g.lineWidth = 1.6; line(g, C, [x0, p[1], p[2]], p);

  // Earth: lit toward the Sun. Up close it is simply the ground below the horizon,
  // so it darkens toward the sky stage's ground colour as the camera lands.
  const ec = project(C, [0, 0, 0]);
  if (ec.z > 0.001) {
    const r = C.F / ec.z;
    const sunDir = v3.mul(A, -1), sx = v3.dot(sunDir, C.right), sy = -v3.dot(sunDir, C.up), sl = Math.hypot(sx, sy) || 1;
    const lit = 0.5 + 0.5 * v3.dot(C.fwd, A);           // how much of the visible disc is daylight
    const gr = g.createLinearGradient(ec.x + sx / sl * r, ec.y + sy / sl * r, ec.x - sx / sl * r, ec.y - sy / sl * r);
    gr.addColorStop(0, '#6DB4F5'); gr.addColorStop(Math.max(0.02, lit - 0.08), '#2C67C4'); gr.addColorStop(Math.min(0.98, lit + 0.06), '#10264F'); gr.addColorStop(1, '#070C1E');
    // up close the disc is enormous: draw it as the half-plane below its top edge instead
    g.beginPath(); if (r < W * 4) g.arc(ec.x, ec.y, r, 0, 7); else g.rect(-10, ec.y - r, W + 20, H + 20 - (ec.y - r));
    g.fillStyle = gr; g.fill();
    const ground = smooth((C.t - 0.4) / 0.45);
    if (ground > 0) { g.fillStyle = `rgba(22,33,29,${ground})`; g.fill(); }
    if (r < W * 2) { g.strokeStyle = `rgba(130,190,255,${0.35 * (1 - ground)})`; g.lineWidth = r * 0.04; g.beginPath(); g.arc(ec.x, ec.y, r * 1.01, 0, 7); g.stroke(); }
    if (f < 0.3) label(g, 'Earth', ec.x, ec.y + r + 22, 'center');
  }

  drawAntisolar(g, C, { p }, 3);
  const CONE_L = lerp(0.9, 3, C.t);                       // short enough to fit the orbit view, long enough to be exact up close
  drawCone(g, C, { p, up }, CONE_L, lerp(1.3, C.F1 * 0.0035, C.t));

  // You
  const me = project(C, p);
  if (f < 0.6 && me.z > 0.01) {
    const a = 1 - smooth((f - 0.35) / 0.25);
    g.save(); g.globalAlpha = a;
    g.fillStyle = '#fff'; g.beginPath(); g.arc(me.x, me.y, 3, 0, 7); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1; g.beginPath(); g.arc(me.x, me.y, 9, 0, 7); g.stroke();
    label(g, 'you', me.x - 16, me.y + 16, 'right');
    const tip = project(C, v3.add(p, v3.mul(A, 2.6)));
    if (tip.z > 0.01) label(g, 'opposite the Sun', Math.min(tip.x, W - 14), tip.y + 14, 'right', INK2);
    let top = null;
    for (let k = 0; k < 64; k++) { const q = project(C, conePoint(p, 42 * Math.PI / 180, k / 64 * Math.PI * 2, CONE_L)); if (q.z > 0.01 && (!top || q.y < top.y)) top = q; }
    if (top) label(g, S.sun > 42 ? 'the Sun is too high: the cone points below your horizon' : 'your rainbow lives on this cone', Math.min(top.x, W - 14), top.y - 14, top.x > W * 0.6 ? 'right' : 'center', INK2);
    g.restore();
  }
}
