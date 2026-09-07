// Small 2D canvas helpers shared by the stages.
export const LABEL = 'italic 14px Fraunces, Georgia, serif';
export const MONO = '12px "JetBrains Mono", ui-monospace, monospace';
export const INK = 'rgba(234,240,255,.9)';
export const INK2 = 'rgba(234,240,255,.55)';

export const labels = { alpha: 1 };   // set by the compositor to fade labels during zooms
export function label(g, text, x, y, align = 'left', color = INK, font = LABEL) {
  if (labels.alpha <= 0.01) return;
  g.save(); g.globalAlpha *= labels.alpha;
  g.font = font; g.textAlign = align; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = 4; g.strokeStyle = 'rgba(5,7,15,.75)';
  g.strokeText(text, x, y);
  g.fillStyle = color; g.fillText(text, x, y);
  g.restore();
}

// Stroke a polyline three times to fake a glow without shadowBlur (which is slow on phones).
export function glowPath(g, pts, col, width = 2, glow = 1) {
  const path = () => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); };
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (glow > 0) {
    path(); g.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${0.10 * glow})`; g.lineWidth = width * 5; g.stroke();
    path(); g.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${0.25 * glow})`; g.lineWidth = width * 2.2; g.stroke();
  }
  path(); g.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},1)`; g.lineWidth = width; g.stroke();
}

export function dashed(g, x0, y0, x1, y1, color = 'rgba(234,240,255,.4)') {
  g.save(); g.setLineDash([5, 7]); g.strokeStyle = color; g.lineWidth = 1;
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.restore();
}

// Deterministic pseudo-random generator so scenes are stable frame to frame.
export function prng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

export const smooth = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
