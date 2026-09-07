import { label, glowPath, dashed, prng, INK2 } from '../draw.js';

export const name = 'Orbit';
export const scaleM = 1e8;
export const controls = ['sun'];
export const caption = {
  title: 'Sunlight arrives in parallel',
  body: 'The Sun is so far away that every ray reaching Earth travels in the same direction. A rainbow always appears on the side of the sky exactly opposite the Sun, centred on the shadow of your own head. Drag the Sun lower or higher to move where you are standing.',
};

let stars = [], starKey = '';
function ensureStars(W, H) {
  const key = W + 'x' + H; if (key === starKey) return; starKey = key;
  const r = prng(11);
  stars = Array.from({ length: 150 }, () => ({ x: r() * W, y: r() * H, a: 0.12 + r() * 0.6, s: r() < 0.12 ? 1.8 : 1.1 }));
}

function geo(S) {
  const V = S.V, m = Math.min(V.w, V.h);
  const sun = { x: V.x0 + V.w * 0.1, y: V.cy, r: m * 0.09 };
  const earth = { x: V.x0 + V.w * 0.7, y: V.cy, r: m * 0.15 };
  const a = Math.PI / 2 + S.sun * Math.PI / 180;      // observer on the sunlit side of the terminator
  const obs = { x: earth.x + Math.cos(a) * earth.r, y: earth.y - Math.sin(a) * earth.r };
  return { sun, earth, obs };
}

export function box(W, H, S) { const { obs } = geo(S); return { x: obs.x, y: obs.y, w: W * 0.09 }; }

export function draw(g, W, H, S) {
  ensureStars(W, H);
  const { sun, earth, obs } = geo(S);
  for (const s of stars) { g.fillStyle = `rgba(220,230,255,${s.a})`; g.fillRect(s.x, s.y, s.s, s.s); }

  // Sun with a wide soft glow
  let gr = g.createRadialGradient(sun.x, sun.y, sun.r * 0.5, sun.x, sun.y, sun.r * 4.5);
  gr.addColorStop(0, 'rgba(255,205,110,.5)'); gr.addColorStop(1, 'rgba(255,205,110,0)');
  g.fillStyle = gr; g.fillRect(sun.x - sun.r * 4.5, sun.y - sun.r * 4.5, sun.r * 9, sun.r * 9);
  g.fillStyle = '#FFD98A'; g.beginPath(); g.arc(sun.x, sun.y, sun.r, 0, 7); g.fill();

  // Parallel rays; the ones that hit Earth stop at its surface
  const n = 13;
  for (let i = 0; i < n; i++) {
    const y = earth.y - earth.r * 1.7 + i * (earth.r * 3.4 / (n - 1));
    const dy = y - earth.y, hits = Math.abs(dy) < earth.r;
    const xe = hits ? earth.x - Math.sqrt(earth.r ** 2 - dy * dy) : W + 10;
    g.strokeStyle = 'rgba(255,215,140,.22)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(sun.x + sun.r, y); g.lineTo(xe, y); g.stroke();
  }
  // The ray that reaches you
  glowPath(g, [[sun.x + sun.r, obs.y], [obs.x, obs.y]], [255, 220, 150], 1.6, 1);

  // Earth: day side toward the Sun, night side away, thin atmosphere
  gr = g.createLinearGradient(earth.x - earth.r, 0, earth.x + earth.r, 0);
  gr.addColorStop(0, '#6DB4F5'); gr.addColorStop(0.45, '#2C67C4'); gr.addColorStop(0.58, '#10264F'); gr.addColorStop(1, '#070C1E');
  g.fillStyle = gr; g.beginPath(); g.arc(earth.x, earth.y, earth.r, 0, 7); g.fill();
  g.strokeStyle = 'rgba(130,190,255,.35)'; g.lineWidth = earth.r * 0.05;
  g.beginPath(); g.arc(earth.x, earth.y, earth.r * 1.025, 0, 7); g.stroke();

  // Opposite the Sun: the direction the bow is centred on
  dashed(g, obs.x, obs.y, W + 10, obs.y);
  label(g, 'opposite the Sun', Math.min(W - 14, obs.x + earth.r * 1.4), obs.y - 12, 'right', INK2);

  // You
  g.fillStyle = '#fff'; g.beginPath(); g.arc(obs.x, obs.y, 3, 0, 7); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1; g.beginPath(); g.arc(obs.x, obs.y, 9, 0, 7); g.stroke();
  label(g, 'you', obs.x - 16, obs.y + 16, 'right');
  label(g, 'the Sun', sun.x, sun.y + sun.r + 22, 'center');
  label(g, 'Earth', earth.x, earth.y + earth.r + 22, 'center');
}
