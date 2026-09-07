import { nWater, wlColor, bowAngle, rgb } from '../physics.js';
import { label, prng, INK2, smooth, lerp } from '../draw.js';
import { v3, slerp, scene, camera, project, drawCone, drawAntisolar, drawSunlight, drawFigure, METRE } from '../scene3d.js';
import * as rain from './rain.js';

export const name = 'Sky';
export const scaleM = 1e2;
export const controls = ['sun'];
export const ownTransition = true;
export const fadeIn = [0.72, 1];
export const caption = {
  title: 'Sun behind you, rain ahead',
  body: 'Stand with the Sun at your back. Your bow is a circle 42° wide, centred on the point opposite the Sun, and the circle never changes size. When the Sun is low that centre sits just below the horizon and you see a tall arc. Raise the Sun and the centre sinks, taking the bow down with it. From a plane you could see the whole circle.',
};

const rainSeed = prng(5);
const streaks = Array.from({ length: 110 }, () => ({ x: rainSeed(), y: rainSeed(), l: 0.6 + rainSeed() * 0.8 }));

// The camera stands just behind your head, looking level, away from the Sun. Everything in the
// sky is placed by true perspective so it lands exactly on the orbit stage's 3D picture.
export function geo(S) {
  const V = S.V, e = S.sun * Math.PI / 180;
  const hy = V.y0 + V.h * 0.56;                    // horizon, also the camera's principal point
  const F = V.h * 0.62 / Math.tan(42 * Math.PI / 180);   // focal length in px: a 42° bow is 0.62 of the view tall
  const cx = V.cx, cy = hy + F * Math.tan(e);      // the point opposite the Sun: sun elevation below the horizon
  // directions in a level frame: x forward (away from the Sun, level), y up, z to the right
  const A = [Math.cos(e), -Math.sin(e), 0];        // opposite the Sun
  const project = d => d[0] > 1e-4 ? { x: cx + F * d[2] / d[0], y: hy - F * d[1] / d[0], ok: true } : { ok: false };
  // a point on the cone: ang from the axis, th around it (th = 90° is the top)
  const upA = [Math.sin(e), Math.cos(e), 0], side = [0, 0, 1];
  const cone = (ang, th) => { const ca = Math.cos(ang), sa = Math.sin(ang), ct = Math.cos(th), st = Math.sin(th);
    return [A[0] * ca + (upA[0] * st + side[0] * ct) * sa, A[1] * ca + (upA[1] * st + side[1] * ct) * sa, A[2] * ca + (upA[2] * st + side[2] * ct) * sa]; };
  return { hy, F, cx, cy, project, cone, r: F * Math.tan(42 * Math.PI / 180), obs: { x: V.cx, y: hy + V.h * 0.3, h: V.h * 0.2 } };
}

// The next move pivots around you, so the hint box sits on your head.
export function box(W, H, S) { const { obs } = geo(S); return { x: obs.x, y: obs.y - obs.h * 0.85, w: W * 0.09 }; }

// Trace one angular ring of the cone; returns the run of points above the horizon and below it.
function ring(G, ang, n = 180) {
  const above = [], below = [];
  for (let k = 0; k <= n; k++) { const d = G.cone(ang, (k / n) * Math.PI * 2), q = G.project(d); if (!q.ok) continue; (d[1] > 0 ? above : below).push(q); }
  return { above, below };
}
function stroke(g, pts) { if (pts.length < 2) return; g.beginPath(); pts.forEach((q, i) => i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)); g.stroke(); }

export function draw(g, W, H, S, time, f = 0) {
  if (f <= 0) { draw2d(g, W, H, S, time); return; }
  swing(g, W, H, S, f);
  if (f < 0.15) { g.save(); g.globalAlpha = 1 - smooth(f / 0.15); draw2d(g, W, H, S, time); g.restore(); }
}

// The camera swings 90° around you: from just behind your head, looking away from the Sun, to
// far off to your side, so the cone of colour is seen edge-on and your eye sits at its tip.
function swing(g, W, H, S, f) {
  const V = S.V, G = geo(S), sc = scene(S), { p, up, h, side } = sc, m = METRE, lay = rain.layout(S);
  const cx = V.cx, cy = G.hy, t = smooth(f);
  // Start: 6 m behind your head and 1.1 m above it, looking level. End: 200 m off to your side with a
  // long lens (near enough to a plain side view), aimed so your eye lands where the rain stage draws it.
  const F1 = G.F, D0 = 6 * m, D2 = 200 * m, F2 = lay.figH * 200 / 1.7;
  const T0 = v3.add(p, v3.mul(up, 1.1 * m));
  const T2 = v3.add(v3.sub(p, v3.mul(h, (lay.eye.x - cx) * D2 / F2)), v3.mul(up, (lay.eye.y - cy) * D2 / F2));
  const target = v3.add(v3.mul(T0, 1 - t), v3.mul(T2, t));
  const dir = slerp(v3.mul(h, -1), side, t), dist = Math.exp(lerp(Math.log(D0), Math.log(D2), t));
  const C = camera(v3.add(target, v3.mul(dir, dist)), v3.mul(dir, -1), up, Math.exp(lerp(Math.log(F1), Math.log(F2), t)), cx, cy);

  // sky, and ground that settles from the horizon down to your feet as the view goes side-on
  const gy = lerp(cy, lay.ground, t);
  let gr = g.createLinearGradient(0, 0, 0, gy);
  gr.addColorStop(0, '#0A1230'); gr.addColorStop(0.75, '#26375F'); gr.addColorStop(1, '#4C4F6B');
  g.fillStyle = gr; g.fillRect(0, 0, W, gy);
  gr = g.createLinearGradient(0, gy, 0, H);
  gr.addColorStop(0, '#1B2A24'); gr.addColorStop(1, '#0C1411');
  g.fillStyle = gr; g.fillRect(0, gy, W, H - gy);

  // sunlight: a sheaf of parallel rays around you, one of them reaching your eye
  const pts = [];
  for (let i = -3; i <= 4; i++) for (let j = -2; j <= 2; j++) if (i || j) pts.push(v3.add(v3.add(p, v3.mul(up, i * 2.2 * m)), v3.mul(side, j * 3 * m)));
  drawSunlight(g, C, pts, 60 * m, 'rgba(255,215,140,.22)', 1);
  drawSunlight(g, C, [p], 60 * m, 'rgba(255,225,160,.9)', 1.6);

  drawAntisolar(g, C, sc, 40 * m);
  drawCone(g, C, sc, 3, Math.min(C.F * 0.0035, F1 * 0.0035 * 1.6));
  drawFigure(g, C, sc);

  const head = project(C, p);
  if (t > 0.5) label(g, 'your eye', head.x - lay.figH * 0.13 - 8, head.y, 'right', 'rgba(234,240,255,' + smooth((t - 0.5) / 0.3) + ')');
}

function draw2d(g, W, H, S, t) {
  const V = S.V, G = geo(S), { hy, F, cx, cy, r, obs } = G;

  // Storm sky, darkest opposite the Sun; a little warmth where the sun is (behind us, low)
  let gr = g.createLinearGradient(0, 0, 0, hy);
  gr.addColorStop(0, '#0A1230'); gr.addColorStop(0.75, '#26375F'); gr.addColorStop(1, '#4C4F6B');
  g.fillStyle = gr; g.fillRect(0, 0, W, hy);
  gr = g.createLinearGradient(0, hy, 0, H);
  gr.addColorStop(0, '#1B2A24'); gr.addColorStop(1, '#0C1411');
  g.fillStyle = gr; g.fillRect(0, hy, W, H - hy);

  // Rain in the middle distance, drifting down
  const drift = S.reduced ? 0 : t * 0.00025;
  g.strokeStyle = 'rgba(170,195,235,.16)'; g.lineWidth = 1;
  for (const d of streaks) {
    const y = V.y0 + ((d.y + drift) % 1) * (hy - V.y0), x = d.x * W, l = 10 * d.l;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x - 1, y + l); g.stroke();
  }

  g.save(); g.beginPath(); g.rect(0, 0, W, hy); g.clip();
  // Inside the primary bow the sky really is brighter
  gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
  gr.addColorStop(0, 'rgba(255,255,255,.08)'); gr.addColorStop(0.85, 'rgba(255,255,255,.06)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, W, hy);
  // The bow: one ring of the cone per wavelength at its own angle, red outermost
  const bands = 14, bw = F * 0.0035, rings = [];
  for (let i = 0; i < bands; i++) { const l = 400 + (300 * i) / (bands - 1); rings.push({ col: wlColor(l), ...ring(G, bowAngle(nWater(l)) * Math.PI / 180) }); }
  for (let pass = 0; pass < 2; pass++) for (const rg of rings) {
    g.strokeStyle = rgb(rg.col, pass ? 0.9 : 0.12); g.lineWidth = pass ? bw * 1.15 : bw * 4; stroke(g, rg.above);
  }
  g.restore();

  // Your shadow runs toward the point opposite the Sun
  const k = 1 / (1 + 4 * Math.tan(S.sun * Math.PI / 180)), tip = { x: obs.x + (cx - obs.x) * k, y: obs.y + (cy - obs.y) * k };
  g.fillStyle = 'rgba(0,0,0,.35)';
  g.beginPath(); g.moveTo(obs.x - obs.h * 0.2, obs.y); g.lineTo(obs.x + obs.h * 0.2, obs.y);
  g.lineTo(tip.x + 3, tip.y); g.lineTo(tip.x - 3, tip.y); g.closePath(); g.fill();

  // The rest of the circle, hidden below the horizon, so it is clear the bow sinks rather than shrinks
  g.save(); g.beginPath(); g.rect(0, hy, W, H - hy); g.clip();
  g.setLineDash([3, 7]); g.strokeStyle = 'rgba(234,240,255,.28)'; g.lineWidth = 1.2;
  stroke(g, ring(G, 42 * Math.PI / 180).below); g.setLineDash([]);
  g.strokeStyle = 'rgba(234,240,255,.6)'; g.beginPath(); g.moveTo(cx - 6, cy); g.lineTo(cx + 6, cy); g.moveTo(cx, cy - 6); g.lineTo(cx, cy + 6); g.stroke();
  g.restore();
  if (cy > hy + 8) label(g, 'centre of the bow, ' + Math.round(S.sun) + '° below the horizon', cx, Math.min(cy, V.y1 - 40) + 18, 'center', INK2);

  // A rear-view mirror: the one place in this picture you can see the Sun behind you
  const mw = Math.min(V.w * 0.36, 230), mh = mw * 0.4, mx = V.x1 - mw - 6, my = V.y0 + 26;
  g.strokeStyle = 'rgba(234,240,255,.35)'; g.lineWidth = 3; g.beginPath(); g.moveTo(mx + mw / 2, V.y0 - 40); g.lineTo(mx + mw / 2, my); g.stroke();
  g.save(); g.beginPath(); g.roundRect(mx, my, mw, mh, 8); g.clip();
  const mhy = my + mh * 0.62, Fm = mh * 0.5;
  gr = g.createLinearGradient(0, my, 0, mhy);
  gr.addColorStop(0, '#2B3A6E'); gr.addColorStop(0.7, '#B96A4A'); gr.addColorStop(1, '#F2B266');
  g.fillStyle = gr; g.fillRect(mx, my, mw, mh);
  const sunY = mhy - Fm * Math.tan(S.sun * Math.PI / 180), sunR = mh * 0.075;
  gr = g.createRadialGradient(mx + mw / 2, sunY, sunR * 0.5, mx + mw / 2, sunY, sunR * 5);
  gr.addColorStop(0, 'rgba(255,220,140,.7)'); gr.addColorStop(1, 'rgba(255,220,140,0)');
  g.fillStyle = gr; g.fillRect(mx, my, mw, mh);
  g.fillStyle = '#FFE9A8'; g.beginPath(); g.arc(mx + mw / 2, sunY, sunR, 0, 7); g.fill();
  g.fillStyle = '#141C18'; g.fillRect(mx, mhy, mw, mh);
  g.restore();
  g.strokeStyle = 'rgba(234,240,255,.55)'; g.lineWidth = 2; g.beginPath(); g.roundRect(mx, my, mw, mh, 8); g.stroke();
  label(g, 'in the mirror: the Sun, behind you', mx + mw, my + mh + 16, 'right', INK2);

  // You, seen from behind, rim-lit by the low Sun
  const hh = obs.h;
  g.fillStyle = '#06080F';
  g.beginPath(); g.roundRect(obs.x - hh * 0.16, obs.y - hh * 0.72, hh * 0.32, hh * 0.72, hh * 0.08); g.fill();
  g.beginPath(); g.arc(obs.x, obs.y - hh * 0.85, hh * 0.13, 0, 7); g.fill();
  g.strokeStyle = 'rgba(255,190,120,.55)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(obs.x - hh * 0.16, obs.y); g.lineTo(obs.x - hh * 0.16, obs.y - hh * 0.66); g.stroke();
  g.beginPath(); g.arc(obs.x, obs.y - hh * 0.85, hh * 0.13, Math.PI * 0.7, Math.PI * 1.5); g.stroke();

  label(g, 'horizon', W - 14, hy - 12, 'right', INK2);
  const top = G.project(G.cone(42 * Math.PI / 180, Math.PI / 2));
  if (top.y > hy) label(g, 'the bow is below the horizon now', cx, hy - V.h * 0.2, 'center');
  else label(g, '42° from the centre', cx, Math.max(V.y0 + 14, top.y - 16), 'center', INK2);
}
