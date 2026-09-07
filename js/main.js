import * as orbit from './stages/orbit.js';
import * as sky from './stages/sky.js';
import * as rain from './stages/rain.js';
import * as drop from './stages/drop.js';
import * as wave from './stages/wave.js';
import { smooth, clamp } from './draw.js';

const STAGES = [orbit, sky, rain, drop, wave];
const $ = id => document.getElementById(id);
const canvas = $('view'), g = canvas.getContext('2d');
const panel = $('panel'), cap = $('cap'), thumb = $('thumb'), fill = $('fill'), scrub = $('scrub'), play = $('play');

const S = {
  z: 0, target: null, playing: false, dwellUntil: 0,
  sun: 12, lambda: 580, split: true,
  reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  V: null,
};
let W = 0, H = 0, dpr = 1, shownStage = -1, lastT = 0;

function resize() {
  W = innerWidth; H = innerHeight; dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  layout();
}
// The region of the canvas not covered by UI, where stages put what matters.
function layout() {
  const p = panel.getBoundingClientRect(), desktop = matchMedia('(min-width:900px)').matches;
  const dock = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dock')) || 84;
  const V = desktop
    ? { x0: p.right + 28, y0: 60, x1: W - 20, y1: H - dock - 10 }
    : { x0: 14, y0: 54, x1: W - 14, y1: p.top - 6 };
  V.w = V.x1 - V.x0; V.h = V.y1 - V.y0; V.cx = (V.x0 + V.x1) / 2; V.cy = (V.y0 + V.y1) / 2;
  S.V = V; S.W = W; S.H = H;
}

// ----- scale readout -----
function fmtScale(m) {
  const units = [[1e3, 'km'], [1, 'm'], [1e-3, 'mm'], [1e-6, 'µm'], [1e-9, 'nm']];
  for (const [u, s] of units) if (m >= u * 0.999) {
    const v = m / u, r = v >= 100 ? Math.round(v) : v >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100;
    return r.toLocaleString('en', { maximumFractionDigits: 2 }).replace(/,/g, ' ') + ' ' + s;
  }
  return (m * 1e9).toFixed(1) + ' nm';
}

// ----- captions and controls -----
function showStage(i) {
  if (i === shownStage) return; shownStage = i;
  const st = STAGES[i];
  cap.classList.add('swap');
  setTimeout(() => {
    $('stageNo').textContent = `Stage ${i + 1} of 5`; $('stageName').textContent = st.name;
    $('capTitle').textContent = st.caption.title; $('capBody').textContent = st.caption.body;
    for (const c of ['sun', 'lambda', 'split']) $('ctl-' + c).hidden = !st.controls.includes(c);
    cap.classList.remove('swap'); layout();
  }, S.reduced ? 0 : 160);
  thumb.setAttribute('aria-valuetext', st.name);
}

// ----- scrubber -----
function setZ(z) { S.z = clamp(z, 0, 4); }
function snap() { const r = Math.round(S.z); if (Math.abs(S.z - r) < 0.22) S.target = r; }
let dragging = false;
const zFromX = x => { const r = scrub.getBoundingClientRect(); return clamp((x - r.left) / r.width, 0, 1) * 4; };
scrub.addEventListener('pointerdown', e => { dragging = true; S.playing = false; S.target = null; scrub.setPointerCapture(e.pointerId); setZ(zFromX(e.clientX)); e.preventDefault(); });
scrub.addEventListener('pointermove', e => { if (dragging) setZ(zFromX(e.clientX)); });
const endDrag = () => { if (!dragging) return; dragging = false; snap(); };
scrub.addEventListener('pointerup', endDrag); scrub.addEventListener('pointercancel', endDrag);
thumb.addEventListener('keydown', e => {
  const r = Math.round(S.z); let handled = true;
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') S.target = clamp(r + 1, 0, 4);
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') S.target = clamp(r - 1, 0, 4);
  else if (e.key === 'Home') S.target = 0; else if (e.key === 'End') S.target = 4;
  else handled = false;
  if (handled) { S.playing = false; e.preventDefault(); }
});
let wheelTimer = 0;
addEventListener('wheel', e => {
  if (e.target.closest('.panel, .dock')) return;
  S.playing = false; S.target = null; setZ(S.z + e.deltaY * 0.0012);
  clearTimeout(wheelTimer); wheelTimer = setTimeout(snap, 320); e.preventDefault();
}, { passive: false });

// ----- play -----
function setPlaying(on) { S.playing = on; play.setAttribute('aria-pressed', on); play.setAttribute('aria-label', on ? 'Pause' : 'Play the descent'); if (on) { S.target = null; if (S.z >= 3.999) S.z = 0; S.dwellUntil = 0; } }
play.addEventListener('click', () => setPlaying(!S.playing));
play.setAttribute('aria-pressed', 'false');

// ----- stage controls -----
$('sun').addEventListener('input', e => { S.sun = +e.target.value; $('sunV').textContent = Math.round(S.sun) + '°'; });
$('lambda').addEventListener('input', e => { S.lambda = +e.target.value; $('lambdaV').textContent = S.lambda + ' nm'; });
$('split').addEventListener('change', e => { S.split = e.target.checked; });

// ----- camera and compositing -----
function render(time) {
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#05070F'; g.fillRect(0, 0, W, H);
  const z = S.z, k = Math.min(3, Math.floor(z)), f = z - k;
  let drewWave = false;
  if (f < 0.001) STAGES[k].draw(g, W, H, S, time);
  else if (f > 0.999) { STAGES[k + 1].draw(g, W, H, S, time); drewWave = k + 1 === 4; }
  else if (STAGES[k].ownTransition) {
    STAGES[k].draw(g, W, H, S, time, f);
    const aIn = smooth((f - 0.62) / 0.38);
    if (aIn > 0) { g.save(); g.globalAlpha = aIn; STAGES[k + 1].draw(g, W, H, S, time); g.restore(); }
  }
  else {
    const A = STAGES[k], B = STAGES[k + 1], bx = A.box(W, H, S), w = bx.w / W, M = 1 / w, m = Math.pow(M, f);
    const P = { x: (W / 2 - M * bx.x) / (1 - M), y: (H / 2 - M * bx.y) / (1 - M) };
    const aOut = 1 - smooth((f - 0.45) / 0.45), aIn = smooth((f - 0.22) / 0.45);
    if (aOut > 0) {
      g.save(); g.globalAlpha = aOut; g.translate(P.x, P.y); g.scale(m, m); g.translate(-P.x, -P.y);
      A.draw(g, W, H, S, time); g.restore();
    }
    const m2 = m * w;
    g.save(); g.translate(P.x, P.y); g.scale(m2, m2); g.translate(-P.x, -P.y);
    g.beginPath(); g.rect(0, 0, W, H); g.clip();
    if (aIn > 0) { g.globalAlpha = aIn; B.draw(g, W, H, S, time); drewWave = k + 1 === 4; }
    g.globalAlpha = 1 - smooth((f - 0.55) / 0.4);
    g.strokeStyle = 'rgba(234,240,255,.55)'; g.lineWidth = 1 / m2; g.strokeRect(0, 0, W, H);
    g.restore();
  }
  // Rest state: hint at where the next zoom lands
  if (f < 0.001 && k < 4 && z < 3.999) {
    const bx = STAGES[k].box(W, H, S), bw = bx.w, bh = bw * H / W;
    g.save(); g.setLineDash([4, 4]); g.strokeStyle = 'rgba(234,240,255,.5)'; g.lineWidth = 1;
    g.strokeRect(bx.x - bw / 2, bx.y - bh / 2, bw, bh); g.restore();
  }
  if (!drewWave && z > 2.6) wave.warm(W, H, S, time);
}

function frame(time) {
  const dt = Math.min(50, time - (lastT || time)); lastT = time;
  if (S.playing) {
    if (time > S.dwellUntil) {
      const next = Math.floor(S.z + 1e-6) + 1, z2 = S.z + dt / 8000;
      if (z2 >= next) { S.z = next; S.dwellUntil = time + 2200; } else S.z = z2;
      if (S.z >= 4) { S.z = 4; setPlaying(false); }
    }
  } else if (S.target !== null) {
    S.z += (S.target - S.z) * (1 - Math.exp(-dt / 110));
    if (Math.abs(S.target - S.z) < 0.0008) { S.z = S.target; S.target = null; }
  }
  const z = S.z, k = Math.min(3, Math.floor(z)), f = z - k;
  showStage(Math.round(z));
  thumb.style.left = (z / 4 * 100) + '%'; fill.style.width = (z / 4 * 100) + '%';
  thumb.setAttribute('aria-valuenow', z.toFixed(2));
  $('scale').textContent = fmtScale(Math.pow(10, Math.log10(STAGES[k].scaleM) * (1 - f) + Math.log10(STAGES[Math.min(4, k + 1)].scaleM) * f));
  render(time);
  requestAnimationFrame(frame);
}

addEventListener('resize', resize);
resize(); showStage(0);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
requestAnimationFrame(frame);
