// A tiny 3D scene shared by the camera moves: the Sun, Earth, you, the line opposite the Sun,
// and the 42° cone your rainbow lives on. World units are Earth radii; the Sun is at −x,
// sunlight travels +x, y is up in the orbit view.
import { nWater, wlColor, bowAngle, rgb } from './physics.js';

export const A = [1, 0, 0];                              // opposite the Sun
export const METRE = 1 / 6.371e6;                        // one metre, in Earth radii
export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};
export const slerp = (a, b, t) => {
  const th = Math.acos(Math.max(-1, Math.min(1, v3.dot(a, b)))); if (th < 1e-4) return a;
  return v3.norm(v3.add(v3.mul(a, Math.sin((1 - t) * th) / Math.sin(th)), v3.mul(b, Math.sin(t * th) / Math.sin(th))));
};

// Where you stand for a given Sun height: on the surface, with the Sun that many degrees up.
export function scene(S) {
  const e = S.sun * Math.PI / 180;
  const up = [-Math.sin(e), Math.cos(e), 0];             // local vertical where you stand
  const p = up;                                          // you, on the surface (Earth radius 1)
  const h = v3.norm(v3.sub(A, v3.mul(up, v3.dot(A, up)))); // level line of sight, away from the Sun
  return { e, up, p, h, side: [0, 0, 1] };
}

export function camera(pos, fwd, upHint, F, cx, cy) {
  const right = v3.norm(v3.cross(fwd, upHint)), up = v3.cross(right, fwd);
  return { pos, fwd, right, up, F, cx, cy };
}
export function project(C, q) {
  const d = v3.sub(q, C.pos), z = v3.dot(d, C.fwd);
  return { x: C.cx + C.F * v3.dot(d, C.right) / z, y: C.cy - C.F * v3.dot(d, C.up) / z, z };
}
// Clip a segment to the near plane, then project.
export function segment(C, a, b, near) {
  near = near ?? Math.max(1e-9, 1e-3 * Math.hypot(...v3.sub(a, C.pos)));
  let za = v3.dot(v3.sub(a, C.pos), C.fwd), zb = v3.dot(v3.sub(b, C.pos), C.fwd);
  if (za < near && zb < near) return null;
  if (za < near) a = v3.add(a, v3.mul(v3.sub(b, a), (near - za) / (zb - za)));
  else if (zb < near) b = v3.add(a, v3.mul(v3.sub(b, a), (near - za) / (zb - za)));
  return [project(C, a), project(C, b)];
}
export function line(g, C, a, b) {
  const s = segment(C, a, b); if (!s) return false;
  g.beginPath(); g.moveTo(s[0].x, s[0].y); g.lineTo(s[1].x, s[1].y); g.stroke(); return true;
}

// A point on the cone of directions `ang` away from the anti-Sun line, `ph` around it, `L` out from the apex.
const U = v3.norm(v3.cross(A, [0, 0, 1])), Wv = v3.cross(A, U);
export const conePoint = (apex, ang, ph, L) => v3.add(apex, v3.mul(v3.add(v3.mul(A, Math.cos(ang)), v3.add(v3.mul(U, Math.cos(ph) * Math.sin(ang)), v3.mul(Wv, Math.sin(ph) * Math.sin(ang)))), L));

// The cone: faint rays from the apex and a spectral rim, red outermost, only above your horizon.
export function drawCone(g, C, sc, L, bw, alpha = 1) {
  const { p, up } = sc, above = q => v3.dot(v3.sub(q, p), up) > -1e-3 * L;
  g.strokeStyle = `rgba(234,240,255,${0.22 * alpha})`; g.lineWidth = 1;
  for (let i = 0; i < 16; i++) { const q = conePoint(p, 42 * Math.PI / 180, i / 16 * Math.PI * 2, L); if (above(q)) line(g, C, p, q); }
  const bands = 9;
  for (let i = 0; i < bands; i++) {
    const l = 400 + 300 * i / (bands - 1), ang = bowAngle(nWater(l)) * Math.PI / 180;
    g.strokeStyle = rgb(wlColor(l), 0.9 * alpha); g.lineWidth = bw;
    let prev = null;
    for (let k = 0; k <= 96; k++) {
      const q = conePoint(p, ang, k / 96 * Math.PI * 2, L);
      if (above(q) && prev) line(g, C, prev, q);
      prev = above(q) ? q : null;
    }
  }
}
// The line opposite the Sun, from you outward.
export function drawAntisolar(g, C, sc, L) {
  g.save(); g.setLineDash([5, 7]); g.strokeStyle = 'rgba(234,240,255,.45)'; g.lineWidth = 1;
  line(g, C, sc.p, v3.add(sc.p, v3.mul(A, L))); g.restore();
}
// Parallel sunlight through a set of points, each ray running `len` along the light.
export function drawSunlight(g, C, points, len, style = 'rgba(255,215,140,.22)', width = 1) {
  g.strokeStyle = style; g.lineWidth = width;
  for (const q of points) line(g, C, v3.sub(q, v3.mul(A, len)), v3.add(q, v3.mul(A, len * 0.15)));
}
// You: a simple silhouette whose head sits at the apex of the cone, rim-lit by the low Sun.
export function drawFigure(g, C, sc, alpha = 1) {
  const head = project(C, sc.p), feet = project(C, v3.sub(sc.p, v3.mul(sc.up, 1.7 * METRE)));
  if (head.z <= 0 || feet.z <= 0) return;
  const hh = Math.hypot(feet.x - head.x, feet.y - head.y) / 0.85, r = hh * 0.13;
  if (hh > 4000 || hh < 2) return;
  g.save(); g.globalAlpha = alpha;
  g.translate(head.x, head.y); g.rotate(Math.atan2(feet.y - head.y, feet.x - head.x) - Math.PI / 2);
  g.fillStyle = '#06080F';
  g.beginPath(); g.roundRect(-hh * 0.16, r * 0.9, hh * 0.32, hh * 0.72, hh * 0.08); g.fill();
  g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
  g.strokeStyle = 'rgba(255,190,120,.55)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(-hh * 0.16, r * 0.9); g.lineTo(-hh * 0.16, hh * 0.72); g.stroke();
  g.beginPath(); g.arc(0, 0, r, Math.PI * 0.7, Math.PI * 1.5); g.stroke();
  g.restore();
}
