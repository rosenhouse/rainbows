import { nWater, wlColor, trace, bowB, bowAngle, rgb, SPECTRUM } from '../physics.js';
import { label, glowPath, dashed, INK2, MONO } from '../draw.js';

export const name = 'Drop';
export const scaleM = 1e-3;
export const controls = ['sun', 'lambda'];
export const caption = {
  title: 'In, bounce, out',
  body: 'Light bends as it enters the drop, bounces off the back, and bends again on the way out. Every colour bends by a slightly different amount, so each leaves at its own angle: deep red (700 nm) at 42.5°, violet (400 nm) at 40.3°. Slide through the colours to follow one at a time.',
};

// The whole diagram is tilted by the Sun's height, so sunlight arrives at the same angle as in
// the rain stage and the exit ray heads for your eye at the same angle too.
function geo(S) {
  const V = S.V, narrow = V.w < 600, R = Math.min(V.w, V.h) * (narrow ? 0.25 : 0.3), e = S.sun * Math.PI / 180;
  return { cx: V.x0 + V.w * (narrow ? 0.52 : 0.6), cy: V.cy - V.h * 0.05, R, ce: Math.cos(e), se: Math.sin(e), e };
}
// unit-disc coords (x along the sunlight, y up) → screen, rotated so sunlight slopes down by e
const px = (p, G) => { const x = p[0] * G.ce + p[1] * G.se, y = -p[0] * G.se + p[1] * G.ce; return [G.cx + x * G.R, G.cy - y * G.R]; };

export function box(W, H, S) {
  const G = geo(S), n = nWater(S.lambda), e = trace(bowB(n), n).entry;
  const [x, y] = px(e, G); return { x, y, w: W * 0.085 };
}

export function draw(g, W, H, S) {
  const G = geo(S), { cx, cy, R } = G, lam = S.lambda, n = nWater(lam), col = wlColor(lam), V = S.V;
  g.save(); g.beginPath(); g.rect(V.x0 - 2, V.y0 - 8, V.w + 4, V.h + 16); g.clip();   // keep the rays off the header and panel

  // sunlight band, sloping down at the Sun's height
  g.save(); g.translate(cx, cy); g.rotate(G.e);
  const gr = g.createLinearGradient(-R * 9, 0, -R, 0);
  gr.addColorStop(0, 'rgba(255,215,140,.07)'); gr.addColorStop(1, 'rgba(255,215,140,0)');
  g.fillStyle = gr; g.fillRect(-R * 9, -R * 1.1, R * 8, R * 2.2); g.restore();

  // the drop
  g.fillStyle = 'rgba(80,120,200,.10)'; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
  g.strokeStyle = 'rgba(180,200,240,.7)'; g.lineWidth = 1.5; g.stroke();

  // a fan of rays at the chosen colour, faint: most of the light leaves near one angle
  for (let i = 1; i <= 9; i++) {
    const t = trace((i / 10) * 0.98, n);
    g.strokeStyle = rgb(col, 0.16); g.lineWidth = 1; g.lineCap = 'round';
    g.beginPath(); t.pts.forEach((p, j) => { const q = px(p, G); j ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.stroke();
  }
  // the rainbow ray for every colour
  for (const l of SPECTRUM) {
    const nn = nWater(l), t = trace(bowB(nn), nn);
    glowPath(g, t.pts.map(p => px(p, G)), wlColor(l), 1.4, 0.5);
  }
  // and the chosen colour, bold
  const t = trace(bowB(n), n);
  glowPath(g, t.pts.map(p => px(p, G)), col, 2.6, 1.2);

  // exit angle arc, measured from the direction back toward the Sun
  const exit = t.pts[t.pts.length - 2], ex = px(exit, G), ar = R * 0.55;
  const back = px([exit[0] - 1.7, exit[1]], G), fwd = px([exit[0] + t.dir[0], exit[1] + t.dir[1]], G);
  dashed(g, ex[0], ex[1], back[0], back[1]);
  const a0 = Math.atan2(back[1] - ex[1], back[0] - ex[0]), a1 = Math.atan2(fwd[1] - ex[1], fwd[0] - ex[0]);
  const sweep = ((a1 - a0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2), ccw = sweep > Math.PI;   // always the short way round
  g.strokeStyle = 'rgba(234,240,255,.6)'; g.lineWidth = 1;
  g.beginPath(); g.arc(ex[0], ex[1], ar, a0, a1, ccw); g.stroke();
  const am = px([exit[0] - 0.42 * Math.cos(bowAngle(n) / 2 * Math.PI / 180), exit[1] - 0.42 * Math.sin(bowAngle(n) / 2 * Math.PI / 180)], G);
  label(g, bowAngle(n).toFixed(1) + '°', am[0], am[1], 'center', 'rgba(234,240,255,.95)', MONO);

  // notebook labels
  const e = px(t.entry, G), b = px(t.pts[2], G);
  const sl = px([-2.6, 1.05], G); label(g, 'sunlight', Math.max(V.x0 + 14, sl[0]), Math.max(V.y0 + 14, sl[1]), 'left', INK2);
  label(g, 'bends in', e[0] - 14, e[1] - 18, 'right');
  if (b[0] + 80 < V.x1) label(g, 'bounces', b[0] + 16, b[1], 'left'); else label(g, 'bounces', b[0], b[1] + 22, 'center');
  label(g, 'bends out', ex[0], ex[1] + 22, 'center');
  label(g, 'a raindrop, about 1 mm', V.x1 - 14, V.y1 - 34, 'right', INK2);
  label(g, lam + ' nm · n = ' + n.toFixed(4), V.x1 - 14, V.y1 - 14, 'right', INK2, MONO);
  label(g, 'to your eye', fwd[0] + (fwd[0] - ex[0]) * 0.9, fwd[1] + (fwd[1] - ex[1]) * 0.9 + 16, 'center', INK2);
  g.restore();
}
