import { nWater, wlColor, bowAngle, rgb } from '../physics.js';
import { label, prng, INK2 } from '../draw.js';

export const name = 'Sky';
export const scaleM = 1e2;
export const controls = ['sun'];
export const caption = {
  title: 'Sun behind you, rain ahead',
  body: 'Stand with the Sun at your back. The bow is a circle 42° wide, centred on the point opposite the Sun. When the Sun is low that point sits just below the horizon and the bow stands tall. Raise the Sun and the whole bow sinks with it.',
};

const rainSeed = prng(5);
const rain = Array.from({ length: 110 }, () => ({ x: rainSeed(), y: rainSeed(), l: 0.6 + rainSeed() * 0.8 }));

function geo(S) {
  const V = S.V;
  const hy = V.y0 + V.h * 0.56;                    // horizon
  const s = V.h * 0.62 / 42;                       // pixels per degree
  const cx = V.cx, cy = hy + S.sun * s;            // antisolar point: sun elevation below the horizon
  return { hy, s, cx, cy, r: 42 * s, obs: { x: V.cx, y: hy + V.h * 0.3, h: V.h * 0.2 } };
}

export function box(W, H, S) {
  const { cx, cy, r, hy } = geo(S), th = 78 * Math.PI / 180;
  return { x: cx + r * Math.cos(th), y: Math.min(cy - r * Math.sin(th), hy - H * 0.05), w: W * 0.09 };
}

export function draw(g, W, H, S, t) {
  const V = S.V, { hy, s, cx, cy, r, obs } = geo(S);

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
  const bands = 14, bw = s * 0.2;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < bands; i++) {
      const l = 400 + (300 * i) / (bands - 1), a = bowAngle(nWater(l)), col = wlColor(l);
      g.strokeStyle = rgb(col, pass ? 0.9 : 0.12); g.lineWidth = pass ? bw * 1.15 : bw * 4;
      g.beginPath(); g.arc(cx, cy, a * s, Math.PI, 2 * Math.PI); g.stroke();
    }
  }
  g.restore();

  // Your shadow runs toward the point opposite the Sun
  g.fillStyle = 'rgba(0,0,0,.35)';
  g.beginPath(); g.moveTo(obs.x - obs.h * 0.2, obs.y); g.lineTo(obs.x + obs.h * 0.2, obs.y);
  g.lineTo(cx + 2, hy); g.lineTo(cx - 2, hy); g.closePath(); g.fill();

  // You, seen from behind, rim-lit by the low Sun
  const hh = obs.h;
  g.fillStyle = '#06080F';
  g.beginPath(); g.roundRect(obs.x - hh * 0.16, obs.y - hh * 0.72, hh * 0.32, hh * 0.72, hh * 0.08); g.fill();
  g.beginPath(); g.arc(obs.x, obs.y - hh * 0.85, hh * 0.13, 0, 7); g.fill();
  g.strokeStyle = 'rgba(255,190,120,.55)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(obs.x - hh * 0.16, obs.y); g.lineTo(obs.x - hh * 0.16, obs.y - hh * 0.66); g.stroke();
  g.beginPath(); g.arc(obs.x, obs.y - hh * 0.85, hh * 0.13, Math.PI * 0.7, Math.PI * 1.5); g.stroke();

  label(g, 'the Sun is behind you, ' + Math.round(S.sun) + '° up', V.x0 + 14, V.y1 - 14, 'left', INK2);
  label(g, 'horizon', W - 14, hy - 12, 'right', INK2);
  if (cy - r > hy) label(g, 'the bow is below the horizon now', cx, hy - V.h * 0.2, 'center');
  else label(g, '42° from the point opposite the Sun', cx - r * 0.35, Math.max(V.y0 + 14, cy - r * 0.94 - 16), 'right', INK2);
}
