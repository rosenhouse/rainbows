import { nWater, wlColor, bowAngle, rgb } from '../physics.js';
import { label, prng, INK2 } from '../draw.js';

export const name = 'Sky';
export const scaleM = 1e2;
export const controls = ['sun'];
export const caption = {
  title: 'Sun behind you, rain ahead',
  body: 'Stand with the Sun at your back. Your bow is a circle 42° wide, centred on the point opposite the Sun, and the circle never changes size. When the Sun is low that centre sits just below the horizon and you see a tall arc. Raise the Sun and the centre sinks, taking the bow down with it. From a plane you could see the whole circle.',
};

const rainSeed = prng(5);
const rain = Array.from({ length: 110 }, () => ({ x: rainSeed(), y: rainSeed(), l: 0.6 + rainSeed() * 0.8 }));

export function geo(S) {
  const V = S.V;
  const hy = V.y0 + V.h * 0.56;                    // horizon, also the camera's principal point
  const F = V.h * 0.62 / Math.tan(42 * Math.PI / 180);   // focal length in px: a 42° bow is 0.62 of the view tall
  const s = a => F * Math.tan(a * Math.PI / 180);        // pixels from the antisolar point for an angle
  const cx = V.cx, cy = hy + s(S.sun);             // antisolar point: sun elevation below the horizon
  return { hy, F, s, cx, cy, r: s(42), obs: { x: V.cx, y: hy + V.h * 0.3, h: V.h * 0.2 } };
}

export function box(W, H, S) {
  const { cx, cy, r, hy } = geo(S), th = 78 * Math.PI / 180;
  return { x: cx + r * Math.cos(th), y: Math.min(cy - r * Math.sin(th), hy - H * 0.05), w: W * 0.09 };
}

export function draw(g, W, H, S, t) {
  const V = S.V, { hy, F, s, cx, cy, r, obs } = geo(S);

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
  for (const d of rain) {
    const y = V.y0 + ((d.y + drift) % 1) * (hy - V.y0), x = d.x * W, l = 10 * d.l;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x - 1, y + l); g.stroke();
  }

  g.save(); g.beginPath(); g.rect(0, 0, W, hy); g.clip();
  // Inside the primary bow the sky really is brighter
  gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
  gr.addColorStop(0, 'rgba(255,255,255,.08)'); gr.addColorStop(0.85, 'rgba(255,255,255,.06)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, W, hy);
  // The bow: one arc per wavelength at its own angle, red outermost
  const bands = 14, bw = F * 0.0035;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < bands; i++) {
      const l = 400 + (300 * i) / (bands - 1), a = bowAngle(nWater(l)), col = wlColor(l);
      g.strokeStyle = rgb(col, pass ? 0.9 : 0.12); g.lineWidth = pass ? bw * 1.15 : bw * 4;
      g.beginPath(); g.arc(cx, cy, s(a), Math.PI, 2 * Math.PI); g.stroke();
    }
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
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
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
  if (cy - r > hy) label(g, 'the bow is below the horizon now', cx, hy - V.h * 0.2, 'center');
  else label(g, '42° from the centre', cx, Math.max(V.y0 + 14, cy - r - 16), 'center', INK2);
}
