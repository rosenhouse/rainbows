import { nWater, wlColor, bowAngle, bandWavelength, rgb } from '../physics.js';
import { label, prng, glowPath, dashed, INK2 } from '../draw.js';

export const name = 'Rain';
export const scaleM = 10;
export const controls = ['sun'];
export const caption = {
  title: 'Every drop is a tiny rainbow-maker',
  body: 'Each raindrop throws sunlight back out in a cone of colour. Only the drops sitting on your 42° circle happen to aim that colour at your eye. Someone standing next to you is lit by a different set of drops, so no two people ever see quite the same rainbow.',
};

// Angular tolerance is widened from the real ~2° so enough cartoon drops light up.
const HALF = 3;
const rnd = prng(23);
const field = Array.from({ length: 300 }, () => ({ x: rnd(), y: rnd(), fan: rnd() < 0.3 }));

let sprite = null, spriteKey = '';
// One drop's cone of colour, seen edge-on: two little fans at ±42° from the direction back toward the Sun.
// The fan is opened to 2·HALF degrees to match the widened band, so the colours can be told apart.
function fanSprite(sunDeg, L) {
  const key = sunDeg.toFixed(1) + ':' + Math.round(L); if (key === spriteKey) return sprite; spriteKey = key;
  const size = Math.ceil(L * 2.4), c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), o = size / 2, e = sunDeg * Math.PI / 180;
  const back = Math.PI + e;                                   // back toward the Sun (y down)
  // the sunlight arriving at the drop, so each fan reads as "sunlight in, colour out"
  const gi = g.createLinearGradient(o - Math.cos(e) * L, o - Math.sin(e) * L, o, o);
  gi.addColorStop(0, 'rgba(255,215,140,0)'); gi.addColorStop(1, 'rgba(255,215,140,.6)');
  g.strokeStyle = gi; g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(o - Math.cos(e) * L, o - Math.sin(e) * L); g.lineTo(o - Math.cos(e) * 3, o - Math.sin(e) * 3); g.stroke();
  const cols = [700, 610, 560, 500, 430];
  for (const sign of [1, -1]) {
    cols.forEach((l, i) => {
      const off = (HALF - (2 * HALF * i) / (cols.length - 1)) * Math.PI / 180;   // red on the outside
      const th = back + sign * (42 * Math.PI / 180 + off);
      const gr = g.createLinearGradient(o, o, o + Math.cos(th) * L, o + Math.sin(th) * L);
      gr.addColorStop(0, rgb(wlColor(l), 0.55)); gr.addColorStop(1, rgb(wlColor(l), 0));
      g.strokeStyle = gr; g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(o + Math.cos(th) * 3, o + Math.sin(th) * 3); g.lineTo(o + Math.cos(th) * L, o + Math.sin(th) * L); g.stroke();
    });
  }
  sprite = c; return sprite;
}

// Where you stand in the side view: head (your eye) at the lower left, feet on the ground line.
export function layout(S) {
  const V = S.V, figH = V.h * 0.16;
  const eye = { x: V.x0 + V.w * 0.1, y: V.y1 - V.h * 0.16 };
  return { eye, figH, ground: eye.y + figH * 0.87 };
}
function geo(S) {
  const V = S.V, { eye } = layout(S);
  const e = S.sun * Math.PI / 180, d = [Math.cos(e), Math.sin(e)];   // sunlight direction, y down
  const up = (42 - S.sun) * Math.PI / 180;                          // lit direction from the eye
  const lit = [Math.cos(up), -Math.sin(up)];
  const span = Math.min(V.w * 0.9, V.h * 0.9) / Math.max(Math.abs(lit[0]) + 0.001, Math.abs(lit[1]) + 0.001);
  const hero = { x: eye.x + lit[0] * span * 0.62, y: eye.y + lit[1] * span * 0.62 };
  return { eye, d, lit, hero };
}

export function box(W, H, S) { const { hero } = geo(S); return { x: hero.x, y: hero.y, w: W * 0.075 }; }

export function draw(g, W, H, S) {
  const V = S.V, { eye, d, lit, hero } = geo(S), { figH, ground } = layout(S);
  const L = Math.min(V.w, V.h) * 0.11, sp = fanSprite(S.sun, L);
  const drops = field.map(p => ({ x: V.x0 + p.x * V.w, y: V.y0 + p.y * (V.h * 0.85), fan: p.fan })).filter(p => p.y < eye.y - 12);
  if (S.sun <= 42) drops.push({ ...hero, fan: true });

  // the same storm sky and ground as the view from behind you
  let gr = g.createLinearGradient(0, 0, 0, ground);
  gr.addColorStop(0, '#0A1230'); gr.addColorStop(0.75, '#1B2846'); gr.addColorStop(1, '#2C3552');
  g.fillStyle = gr; g.fillRect(0, 0, W, ground);
  gr = g.createLinearGradient(0, ground, 0, H);
  gr.addColorStop(0, '#1B2A24'); gr.addColorStop(1, '#0C1411');
  g.fillStyle = gr; g.fillRect(0, ground, W, H - ground);
  g.strokeStyle = 'rgba(234,240,255,.25)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, ground); g.lineTo(W, ground); g.stroke();

  // sunlight: parallel rays sweeping across the whole scene
  g.save(); g.beginPath(); g.rect(0, 0, W, ground); g.clip();      // light stops at the ground
  g.strokeStyle = 'rgba(255,215,140,.28)'; g.lineWidth = 1.2;
  const tanE = Math.tan(S.sun * Math.PI / 180);
  for (let i = -8; i < 40; i++) {
    const y0 = V.y0 - V.h * 0.3 + i * V.h * 0.05;
    g.beginPath(); g.moveTo(-10, y0); g.lineTo(W + 10, y0 + (W + 20) * tanE); g.stroke();
  }
  g.restore();
  label(g, 'sunlight', V.x0 + 14, V.y0 + 16, 'left', INK2);
  if (S.sun > 42) label(g, 'the Sun is above 42°: no drop can aim colour at your eye', V.cx, V.y0 + 40, 'center');

  // opposite the Sun, from your eye
  dashed(g, eye.x, eye.y, eye.x + d[0] * W, eye.y + d[1] * W);
  label(g, 'opposite the Sun', eye.x + 170, eye.y - 12 + d[1] * 170, 'left', INK2);

  // every drop makes colour; only some of it reaches you
  const aRed = bowAngle(nWater(700)), aVio = bowAngle(nWater(400)), mid = (aRed + aVio) / 2, half = Math.abs(aRed - aVio) / 2;
  const litOnes = [];
  for (const p of drops) {
    const vx = p.x - eye.x, vy = p.y - eye.y;
    const ang = Math.acos((vx * d[0] + vy * d[1]) / Math.hypot(vx, vy)) * 180 / Math.PI;
    const dev = (ang - mid) / (HALF / half);          // rescale the widened band to the real one
    if (p.fan) g.drawImage(sp, p.x - sp.width / 2, p.y - sp.height / 2);
    if (Math.abs(dev) <= half) litOnes.push({ p, l: bandWavelength(mid + dev) });
    else { g.fillStyle = 'rgba(160,185,230,.55)'; g.beginPath(); g.arc(p.x, p.y, 1.6, 0, 7); g.fill(); }
  }
  for (const { p, l } of litOnes) {
    const col = wlColor(l);
    g.strokeStyle = rgb(col, 0.35); g.lineWidth = 1;
    g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(eye.x, eye.y); g.stroke();
    g.fillStyle = rgb(col, 1); g.beginPath(); g.arc(p.x, p.y, 2.6, 0, 7); g.fill();
    g.fillStyle = rgb(col, 0.25); g.beginPath(); g.arc(p.x, p.y, 6, 0, 7); g.fill();
  }
  // the 42° line and its label
  glowPath(g, [[eye.x, eye.y], [eye.x + lit[0] * V.w * 0.25, eye.y + lit[1] * V.w * 0.25]], [255, 255, 255], 1, 0.6);
  g.strokeStyle = 'rgba(234,240,255,.5)'; g.lineWidth = 1;
  const a0 = Math.atan2(d[1], d[0]), a1 = Math.atan2(lit[1], lit[0]);
  g.beginPath(); g.arc(eye.x, eye.y, 48, a1, a0); g.stroke();
  label(g, '42°', eye.x + 62, eye.y - 26, 'left');

  // you, side on, your eye at the tip of the cone
  const r = figH * 0.13;
  g.fillStyle = '#06080F';
  g.beginPath(); g.roundRect(eye.x - figH * 0.11, eye.y + r * 0.9, figH * 0.22, figH * 0.72, figH * 0.06); g.fill();
  g.beginPath(); g.arc(eye.x, eye.y, r, 0, 7); g.fill();
  g.strokeStyle = 'rgba(255,190,120,.55)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(eye.x - figH * 0.11, eye.y + r * 0.9); g.lineTo(eye.x - figH * 0.11, eye.y + figH * 0.75); g.stroke();
  g.beginPath(); g.arc(eye.x, eye.y, r, Math.PI * 0.7, Math.PI * 1.5); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(eye.x + r * 0.55, eye.y - r * 0.15, 2.2, 0, 7); g.fill();
  label(g, 'your eye', eye.x, eye.y - r - 12, 'center');
}
