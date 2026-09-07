// Optics of a water drop. Wavelengths in nanometres, angles in degrees unless noted.

// Refractive index of water at 20 °C, Cauchy fit (good to ~1e-3 across the visible band).
export const nWater = l => 1.3199 + 6878 / (l * l) - 1.132e9 / (l ** 4) + 1.11e14 / (l ** 6);

// Approximate sRGB for a spectral wavelength (Bruton's piecewise fit), as [r,g,b] 0–255.
export function wlColor(l) {
  let r = 0, g = 0, b = 0;
  if (l < 440) { r = -(l - 440) / 60; b = 1; }
  else if (l < 490) { g = (l - 440) / 50; b = 1; }
  else if (l < 510) { g = 1; b = -(l - 510) / 20; }
  else if (l < 580) { r = (l - 510) / 70; g = 1; }
  else if (l < 645) { r = 1; g = -(l - 645) / 65; }
  else { r = 1; }
  let f = 1;
  if (l < 420) f = 0.3 + 0.7 * (l - 380) / 40;
  else if (l > 700) f = 0.3 + 0.7 * (780 - l) / 80;
  const gm = v => Math.round(255 * Math.pow(Math.max(0, v * f), 0.8));
  return [gm(r), gm(g), gm(b)];
}
export const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

export const SPECTRUM = [400, 430, 460, 490, 520, 550, 580, 610, 640, 670, 700];

// Vector helpers on the unit circle. Drop is the unit disc centred at the origin,
// sunlight travels +x, y is up.
const refract = (I, N, eta) => {
  const c = -(I[0] * N[0] + I[1] * N[1]);
  const k = 1 - eta * eta * (1 - c * c);
  if (k < 0) return null;
  const a = eta * c - Math.sqrt(k);
  return [eta * I[0] + a * N[0], eta * I[1] + a * N[1]];
};
const reflect = (I, N) => { const d = 2 * (I[0] * N[0] + I[1] * N[1]); return [I[0] - d * N[0], I[1] - d * N[1]]; };
const hit = (p, d) => { const t = -2 * (p[0] * d[0] + p[1] * d[1]); return [p[0] + d[0] * t, p[1] + d[1] * t]; };

// Trace one ray with impact parameter b (−1..1) through a drop of index n with k internal reflections.
// Returns the polyline (unit-disc coords) and the exit direction.
export function trace(b, n, k = 1) {
  const q1 = [-Math.sqrt(1 - b * b), b];
  const pts = [[-4, b], q1];
  let d = refract([1, 0], q1, 1 / n), q = q1;
  for (let i = 0; i < k; i++) { q = hit(q, d); pts.push(q); d = reflect(d, q); }
  q = hit(q, d); pts.push(q);
  d = refract(d, [-q[0], -q[1]], n) || d;
  pts.push([q[0] + d[0] * 6, q[1] + d[1] * 6]);
  return { pts, dir: d, entry: q1 };
}

// Impact parameter of the caustic ("rainbow") ray, where the exit angle is stationary.
export const bowB = (n, k = 1) => Math.sqrt(1 - (n * n - 1) / (k * (k + 2)));

// Angle of the bow from the antisolar point, in degrees.
export function bowAngle(n, k = 1) {
  const b = bowB(n, k), i = Math.asin(b), r = Math.asin(b / n);
  const D = 180 * k + (2 * i - 2 * (k + 1) * r) * 180 / Math.PI;
  return k === 1 ? 180 - D : D - 180;
}

// Map an angle in the primary bow band back to the wavelength that lands there.
export function bandWavelength(angle, k = 1) {
  const lo = bowAngle(nWater(700), k), hi = bowAngle(nWater(400), k);
  const t = (angle - lo) / (hi - lo);            // 0 at red edge, 1 at violet edge
  return 700 - 300 * Math.min(1, Math.max(0, t));
}
