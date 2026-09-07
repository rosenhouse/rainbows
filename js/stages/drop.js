import { nWater, wlColor, trace, bowB, bowAngle, rgb, SPECTRUM } from '../physics.js';
import { label, glowPath, dashed, INK2, MONO } from '../draw.js';

export const name = 'Drop';
export const scaleM = 1e-3;
export const controls = ['lambda'];
export const caption = {
  title: 'In, bounce, out',
  body: 'Light bends as it enters the drop, bounces off the back, and bends again on the way out. Every colour bends by a slightly different amount, so each leaves at its own angle: red at 42.4°, violet at 40.6°. Slide through the colours to follow one at a time.',
};

function geo(S) {
  const V = S.V, R = Math.min(V.w, V.h) * 0.3;
  return { cx: V.x0 + V.w * 0.6, cy: V.cy - V.h * 0.05, R };
}
const px = (p, G) => [G.cx + p[0] * G.R, G.cy - p[1] * G.R];

export function box(W, H, S) {
  const G = geo(S), n = nWater(S.lambda), e = trace(bowB(n), n).entry;
  const [x, y] = px(e, G); return { x, y, w: W * 0.085 };
}

export function draw(g, W, H, S) {
  const G = geo(S), { cx, cy, R } = G, lam = S.lambda, n = nWater(lam), col = wlColor(lam);

  // sunlight band
  const gr = g.createLinearGradient(0, 0, cx - R, 0);
  gr.addColorStop(0, 'rgba(255,215,140,.07)'); gr.addColorStop(1, 'rgba(255,215,140,0)');
  g.fillStyle = gr; g.fillRect(0, cy - R * 1.1, cx - R, R * 2.2);

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
  const ex = px(t.pts[t.pts.length - 2], G), ca = Math.atan2(-t.dir[1], t.dir[0]), ar = R * 0.55;
  dashed(g, ex[0], ex[1], ex[0] - R * 1.7, ex[1]);
  g.strokeStyle = 'rgba(234,240,255,.6)'; g.lineWidth = 1;
  g.beginPath(); g.arc(ex[0], ex[1], ar, ca, Math.PI); g.stroke();
  label(g, bowAngle(n).toFixed(1) + '°', ex[0] - ar - 8, ex[1] + 16, 'right', 'rgba(234,240,255,.9)', MONO);

  // notebook labels
  const e = px(t.entry, G), b = px(t.pts[2], G);
  label(g, 'sunlight', Math.max(14, cx - R * 2.6), cy - R * 0.98, 'left', INK2);
  label(g, 'bends in', e[0] - 14, e[1] - 18, 'right');
  label(g, 'bounces', b[0] + 16, b[1], 'left');
  label(g, 'bends out', ex[0] + 12, ex[1] + 20, 'left');
  label(g, 'a raindrop, about 1 mm', cx, cy + R + 24, 'center', INK2);
  label(g, lam + ' nm · n = ' + n.toFixed(4), cx, cy - R - 20, 'center', INK2, MONO);
}
