// Sword upper-arm blood pressure monitor: its body, LCD, START/STOP button and ports, and the rolled cuff with its
// tube. Built in code from the product images (BP monitor/ref-1..7; the straight-on front, ref-6, is the layout
// reference: 925 px across = 10.4 cm, 88.9 px/cm). Units: centimetres.
// Local frame of the monitor: x across the face, y up it (the logo's end), z out of it; the face's rim at z = 0.
// - Face: a superellipse 10.4 x 13.9 cm, exponent 5.5 (fitted to the front's outline), inside a polished chrome bead
//   0.22 cm wide. Glossy black acrylic over the top 69 % (the LCD window, the logo), glossy white below (the button).
// - Body: a glossy white shell flaring a little below the bead and rounding under to the back; deeper at the logo's
//   end (a wedge, as the side views show).
// - LCD: drawn from the readings in the reference's style: mitred seven-segment digits (the hundreds a narrow 1),
//   the Bluetooth and memory icons, the clock, the pulse, the SYS / DIA / PULSE labels; lit (emissive) on a mid-grey
//   window under the acrylic.
// - The logo 12 % smaller than the images' (the user's ask), the 2026 mark (assets/yoga-block-logo.png).
import * as THREE from 'three';

export const BP = {
  W: 10.4, H: 13.9, n: 5.5, rim: 0.22,
  depth: { top: 4.2, bottom: 3.0 }, flare: 0.3, round: 0.8, rimDrop: 0.42,
  split: -2.9,                                     // the black acrylic / white boundary (y)
  lcd: { x0: -3.245, x1: 3.245, y0: -2.4, y1: 5.105, r: 0.14 },
  logo: { w: 3.62 * 0.88, cy: 5.81 },
  button: { cy: -4.64, w: 2.49, h: 1.87, r: 0.5 },
  jack: { y: 1.4, r: 0.45, hole: 0.17 },          // the air jack, left side
  usb: { y: -3.7, w: 0.9, h: 0.32 },              // the USB-C port, right side
};
// readings: the images' high one (138/88, pulse 78) and their low one (105/68, pulse 78)
export const BP_PRESETS = { high: { sys: '138', dia: '88', pulse: '78', time: '10:00' }, low: { sys: '105', dia: '68', pulse: '78', time: '10:00' } };
const LOGO_TEX = [3072, 796], LOGO_INK = 0.97907;

// ---------------------------------------------------------------- outlines and meshes
function superellipse(a, b, n, N) {   // anticlockwise from +x, evenly spaced
  const raw = [];
  for (let k = 0; k < 4000; k++) { const t = (2 * Math.PI * k) / 4000, c = Math.cos(t), s = Math.sin(t); raw.push([a * Math.sign(c) * Math.abs(c) ** (2 / n), b * Math.sign(s) * Math.abs(s) ** (2 / n)]); }
  return resampleClosed(raw, N);
}
function resampleClosed(raw, n) {
  const s = [0]; for (let i = 1; i <= raw.length; i++) { const a = raw[i - 1], b = raw[i % raw.length]; s.push(s[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const L = s[raw.length], out = []; let j = 0;
  for (let k = 0; k < n; k++) { const t = (L * k) / n; while (j < raw.length - 1 && s[j + 1] < t) j++; const a = raw[j], b = raw[(j + 1) % raw.length], f = (t - s[j]) / Math.max(1e-12, s[j + 1] - s[j]); out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); }
  return out;
}
function normalsOf(pts) { const n = pts.length; return pts.map((_, i) => { const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n], tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty); return [ty / l, -tx / l]; }); }
function roundRect(w, h, r, n, cx = 0, cy = 0) {
  const raw = [];
  for (const [x, y, a0] of [[w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, 90], [-w / 2 + r, -h / 2 + r, 180], [w / 2 - r, -h / 2 + r, 270]])
    for (let k = 0; k <= 24; k++) { const a = ((a0 + (90 * k) / 24) * Math.PI) / 180; raw.push([x + r * Math.cos(a), y + r * Math.sin(a)]); }
  return resampleClosed(raw, n).map((p) => [p[0] + cx, p[1] + cy]);
}
// rings (arrays of [x, y, z]) -> a smooth mesh; caps optional; outward check from a centre point
function ringMesh(rings, { closed = true, capStart = false, capEnd = false, centre = null, uv = null } = {}) {
  const m = rings[0].length, pos = [], idx = [];
  for (const r of rings) for (const p of r) pos.push(p[0], p[1], p[2]);
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < (closed ? m : m - 1); j++) { const j2 = (j + 1) % m, a = i * m + j, b = (i + 1) * m + j, c = (i + 1) * m + j2, d = i * m + j2; idx.push(a, b, c, a, c, d); }
  const cap = (ri, flip) => { const r = rings[ri], c = [0, 0, 0]; for (const p of r) for (let k = 0; k < 3; k++) c[k] += p[k] / m; const ci = pos.length / 3; pos.push(...c); for (let j = 0; j < m; j++) { const a = ri * m + j, b = ri * m + ((j + 1) % m); if (flip) idx.push(ci, b, a); else idx.push(ci, a, b); } };
  if (capStart) cap(0, false); if (capEnd) cap(rings.length - 1, true);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  if (centre) {   // faces outward from centre
    const P = g.attributes.position, N = g.attributes.normal; let s = 0;
    for (let i = 0; i < P.count; i++) s += (P.getX(i) - centre[0]) * N.getX(i) + (P.getY(i) - centre[1]) * N.getY(i) + (P.getZ(i) - centre[2]) * N.getZ(i);
    if (s < 0) { const a = g.index.array; for (let k = 0; k < a.length; k += 3) { const t = a[k + 1]; a[k + 1] = a[k + 2]; a[k + 2] = t; } g.computeVertexNormals(); }
  }
  return g;
}
function flatFan(outline, z, uvOf, up = true) {   // a flat face at z (concentric rows, so its texture doesn't stretch)
  const n = outline.length, rows = 10, pos = [], uv = [], idx = [];
  const c = outline.reduce((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n], [0, 0]);
  for (let r = 0; r <= rows; r++) for (const p of outline) { const f = 1 - r / rows, x = c[0] + (p[0] - c[0]) * f, y = c[1] + (p[1] - c[1]) * f; pos.push(x, y, z); if (uvOf) uv.push(...uvOf(x, y)); }
  for (let r = 0; r < rows; r++) for (let j = 0; j < n; j++) { const j2 = (j + 1) % n, a = r * n + j, b = (r + 1) * n + j, cc = (r + 1) * n + j2, d = r * n + j2; idx.push(a, d, cc, a, cc, b); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); if (uvOf) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  if ((g.attributes.normal.getZ(0) > 0) !== up) { const a = g.index.array; for (let k = 0; k < a.length; k += 3) { const t = a[k + 1]; a[k + 1] = a[k + 2]; a[k + 2] = t; } g.computeVertexNormals(); }
  return g;
}

// ---------------------------------------------------------------- the LCD (canvas, drawn from the readings)
// mitred seven-segment cells (as the reference: bars about a tenth of the digit's height, ends cut at 45 degrees, small
// gaps); x, y the cell's top left, w, h its size, t the bar, gp the gap
function segPolys(w, h, t, gp) {
  const m = h / 2, ht = t / 2;
  return {
    a: [[gp, 0], [w - gp, 0], [w - gp - t, t], [gp + t, t]],
    d: [[gp, h], [w - gp, h], [w - gp - t, h - t], [gp + t, h - t]],
    f: [[0, gp], [t, gp + t], [t, m - ht - gp], [ht, m - gp], [0, m - ht - gp]],
    b: [[w, gp], [w - t, gp + t], [w - t, m - ht - gp], [w - ht, m - gp], [w, m - ht - gp]],
    e: [[0, h - gp], [t, h - gp - t], [t, m + ht + gp], [ht, m + gp], [0, m + ht + gp]],
    c: [[w, h - gp], [w - t, h - gp - t], [w - t, m + ht + gp], [w - ht, m + gp], [w, m + ht + gp]],
    g: [[gp + ht, m], [gp + t, m - ht], [w - gp - t, m - ht], [w - gp - ht, m], [w - gp - t, m + ht], [gp + t, m + ht]],
  };
}
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', ' ': '' };
function drawCell(g, ch, x, y, w, h, t, gp) {
  const P = segPolys(w, h, t, gp);
  for (const s of SEG[ch] ?? '') { g.beginPath(); P[s].forEach(([px, py], i) => (i ? g.lineTo(x + px, y + py) : g.moveTo(x + px, y + py))); g.closePath(); g.fill(); }
}
// a number in cells, right-aligned at xr: the hundreds of a three-digit reading in a narrow cell (only a 1 fits)
function drawNumber(g, txt, xr, y, w, h, gap, narrowGap = 0) {
  const t = h * 0.115, gp = h * 0.022, s = String(txt).replace(/[^0-9-]/g, '').slice(-3);
  let left = xr + gap;   // the left edge of the cell placed last (plus the gap), walking leftward
  for (let i = s.length - 1; i >= 0; i--) {
    if (narrowGap && i === 0 && s.length === 3) {   // the hundreds: a narrow cell just left of the tens (a 1; anything else full width)
      const right = left - narrowGap, wn = s[i] === '1' ? t * 1.02 : w;
      drawCell(g, s[i], right - wn, y, wn, h, t, gp); break;
    }
    const x = left - gap - w; drawCell(g, s[i], x, y, w, h, t, gp); left = x;
  }
}
function drawLCD(c, R) {
  const { lcd } = BP, g = c.getContext('2d'), W = c.width, H = c.height;
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.fillStyle = g.strokeStyle = '#ffffff'; g.shadowColor = 'rgba(255,255,255,0.45)'; g.shadowBlur = W * 0.006;
  // positions as fractions of the window (measured on ref-6's LCD, 573 x 668 px)
  const X = (f) => f * W, Y = (f) => f * H;
  // the icons: Bluetooth and the memory list (with its small plus)
  { const cx = X(0.394), cy = Y(0.072), hh = Y(0.057), ww = hh * 0.36; g.lineWidth = W * 0.0075; g.lineCap = g.lineJoin = 'round';
    g.beginPath(); g.moveTo(cx - ww, cy - hh * 0.24); g.lineTo(cx + ww, cy + hh * 0.22); g.lineTo(cx, cy + hh / 2); g.lineTo(cx, cy - hh / 2); g.lineTo(cx + ww, cy - hh * 0.22); g.lineTo(cx - ww, cy + hh * 0.24); g.stroke(); }
  { const cx = X(0.524), cy = Y(0.072), hh = Y(0.055), ww = hh * 0.78; g.lineWidth = W * 0.007;
    g.beginPath(); g.moveTo(cx + ww * 0.15, cy - hh / 2); g.lineTo(cx - ww / 2, cy - hh / 2); g.lineTo(cx - ww / 2, cy + hh / 2); g.lineTo(cx + ww / 2, cy + hh / 2); g.lineTo(cx + ww / 2, cy - hh * 0.05); g.stroke();
    for (const f of [-0.2, 0.02, 0.24]) { g.beginPath(); g.moveTo(cx - ww * 0.27, cy + hh * f); g.lineTo(cx + ww * 0.12 - (f > 0.2 ? ww * 0.1 : 0), cy + hh * f); g.stroke(); }
    g.beginPath(); g.moveTo(cx + ww * 0.42, cy - hh * 0.46); g.lineTo(cx + ww * 0.42, cy - hh * 0.08); g.moveTo(cx + ww * 0.23, cy - hh * 0.27); g.lineTo(cx + ww * 0.61, cy - hh * 0.27); g.stroke(); }
  // SYS and DIA: two cells 0.192 wide, 0.052 apart, the narrow hundreds to their left; right edge 0.747
  const cw = X(0.192), gapc = X(0.052), xr = X(0.747);
  drawNumber(g, R.sys, xr, Y(0.12), cw, Y(0.323), gapc, X(0.021));
  drawNumber(g, R.dia, xr, Y(0.476), cw, Y(0.314), gapc, X(0.021));
  // the pulse, smaller, and the clock, small, with its colon
  drawNumber(g, R.pulse, xr, Y(0.832), X(0.058), Y(0.108), X(0.018));
  { const tm = String(R.time || '').replace(/[^0-9:]/g, ''), [hh, mm] = tm.includes(':') ? tm.split(':') : [tm.slice(0, -2), tm.slice(-2)];
    const ch = Y(0.07), cw2 = X(0.039), gp2 = X(0.01), y = Y(0.862);
    drawNumber(g, (hh || '').slice(-2), X(0.183), y, cw2, ch, gp2);
    const cx = X(0.197); g.fillRect(cx - X(0.005), y + ch * 0.28, X(0.01), X(0.01)); g.fillRect(cx - X(0.005), y + ch * 0.66, X(0.01), X(0.01));
    drawNumber(g, (mm || '').slice(-2).padStart(2, '0'), X(0.293), y, cw2, ch, gp2); }
  // the labels, a clean sans: SYS, DIA bold over mmHg; PULSE over /min
  g.shadowBlur = W * 0.003; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  const font = (wt, px) => `${wt} ${Math.round(px)}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  const lx = X(0.885);
  g.font = font(700, Y(0.05)); g.fillText('SYS', lx, Y(0.289)); g.font = font(500, Y(0.03)); g.fillText('mmHg', lx, Y(0.322));
  g.font = font(700, Y(0.05)); g.fillText('DIA', lx, Y(0.646)); g.font = font(500, Y(0.03)); g.fillText('mmHg', lx, Y(0.679));
  g.font = font(600, Y(0.03)); g.fillText('PULSE', lx, Y(0.895)); g.font = font(500, Y(0.03)); g.fillText('/min', lx - X(0.012), Y(0.93));
}
// the face's print: black acrylic over the top (the LCD's grey window, the logo), white below; 2048 px tall
function faceCanvas(logoImg) {
  const { W, H, lcd, logo, split } = BP, N = 2048, s = N / H, c = document.createElement('canvas'); c.width = Math.round(W * s); c.height = N;
  const g = c.getContext('2d'), X = (x) => (x + W / 2) * s, Y = (y) => (H / 2 - y) * s;
  g.fillStyle = '#f6f6f7'; g.fillRect(0, 0, c.width, N);
  g.fillStyle = '#0d0d10'; g.fillRect(0, 0, c.width, Y(split));
  // the LCD window: mid grey, a soft diagonal sheen from its top left (as the images)
  const gr = g.createLinearGradient(X(lcd.x0), Y(lcd.y1), X(lcd.x1), Y(lcd.y0));
  gr.addColorStop(0, '#4a4a50'); gr.addColorStop(0.45, '#38383d'); gr.addColorStop(1, '#2c2c31');
  g.fillStyle = gr; g.beginPath(); g.roundRect(X(lcd.x0), Y(lcd.y1), (lcd.x1 - lcd.x0) * s, (lcd.y1 - lcd.y0) * s, lcd.r * s); g.fill();
  if (logoImg) {   // white ink through the logo's grey mask
    const tw = logo.w / LOGO_INK, th = (tw * LOGO_TEX[1]) / LOGO_TEX[0], m = document.createElement('canvas'); m.width = Math.round(tw * s); m.height = Math.round(th * s);
    const mg = m.getContext('2d'); mg.drawImage(logoImg, 0, 0, m.width, m.height);
    const id = mg.getImageData(0, 0, m.width, m.height); for (let i = 0; i < id.data.length; i += 4) { const a = id.data[i]; id.data[i] = id.data[i + 1] = id.data[i + 2] = 255; id.data[i + 3] = a; }
    mg.putImageData(id, 0, 0); g.drawImage(m, X(-tw / 2), Y(logo.cy + th / 2));
  }
  return c;
}
function buttonCanvas() {   // the cap's print: START, a rule, STOP, mid grey on white
  const { button: B } = BP, s = 400, c = document.createElement('canvas'); c.width = Math.round(B.w * s); c.height = Math.round(B.h * s);
  const g = c.getContext('2d'); g.fillStyle = '#f7f7f8'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = g.strokeStyle = '#98989d'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `400 ${Math.round(0.42 * s)}px "DIN Alternate", "DIN Condensed", "Arial Narrow", "Helvetica Neue", sans-serif`;
  g.fillText('START', c.width / 2, c.height * 0.3); g.fillText('STOP', c.width / 2, c.height * 0.73);
  g.lineWidth = 0.025 * s; g.beginPath(); g.moveTo(c.width * 0.27, c.height * 0.515); g.lineTo(c.width * 0.73, c.height * 0.515); g.stroke();
  return c;
}

// the cuff's texture, round its circumference (u: 1 - angle / 360, the angle from +x toward +z; v: up, 0 at the
// bottom, 1 at the top of the outer layer): grey nylon, the bound top and bottom edges with their stitching, the
// bound edge of the outer flap, and the white print traced from the photo (BP monitor/cuff-print-ref.webp, unwrapped
// by tools/cuff_print.py into assets/cuff-print.png, placed at PRINT_AT in this canvas)
const CUFF = { rx: 3.3, rz: 2.9, h: 14.2, taper: 0.14, t: 0.18, flap: 9 };   // a little taller than the monitor (ref-4); the flap's edge at 9 degrees
const CUFF_TEX = [3072, 2226], PRINT_AT = [2219, 337];
function cuffCanvas(printImg) {
  const [W, H] = CUFF_TEX, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), pxcm = H / CUFF.h;
  g.fillStyle = '#86878c'; g.fillRect(0, 0, W, H);
  // dye and fibre variation: soft blotches, then fine streaks along the weave
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 260; k++) { const x = rnd() * W, y = rnd() * H, r = 40 + rnd() * 160, a = 0.018 * rnd();
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, rnd() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
  for (let k = 0; k < 2600; k++) { g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.04)'; if (rnd() < 0.5) g.fillRect(rnd() * W, rnd() * H, 30 + rnd() * 120, 1.5); else g.fillRect(rnd() * W, rnd() * H, 1.5, 30 + rnd() * 120); }
  // the bindings: a smoother, slightly darker tape over each edge, stitched 0.3 cm in
  // stitching: short lengths of thread a shade lighter than the cloth, sunk a little (a soft shadow under each),
  // a needle hole between
  const bind = 0.42 * pxcm, stitch = (x0, y0, x1, y1) => {
    const L = Math.hypot(x1 - x0, y1 - y0), step = 0.3 * pxcm, n = Math.floor(L / step), dx = (x1 - x0) / L, dy = (y1 - y0) / L, nx = -dy, ny = dx;
    g.lineCap = 'round';
    for (let k = 0; k < n; k++) { const s0 = k * step + 0.03 * pxcm, e0 = s0 + 0.22 * pxcm, P = (s, o) => [x0 + dx * s + nx * o, y0 + dy * s + ny * o];
      g.strokeStyle = 'rgba(40,40,44,0.35)'; g.lineWidth = 0.06 * pxcm; g.beginPath(); g.moveTo(...P(s0, 0.012 * pxcm)); g.lineTo(...P(e0, 0.012 * pxcm)); g.stroke();
      g.strokeStyle = 'rgba(150,151,156,0.95)'; g.lineWidth = 0.034 * pxcm; g.beginPath(); g.moveTo(...P(s0, 0)); g.lineTo(...P(e0, 0)); g.stroke();
      g.fillStyle = 'rgba(35,35,38,0.6)'; g.beginPath(); g.arc(...P(e0 + 0.04 * pxcm, 0), 0.016 * pxcm, 0, 2 * Math.PI); g.fill(); } };
  for (const [y0, y1] of [[0, bind], [H - bind, H]]) { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, y0 === 0 ? '#6c6d72' : '#7a7b80'); gr.addColorStop(1, y0 === 0 ? '#7a7b80' : '#6c6d72'); g.fillStyle = gr; g.fillRect(0, y0, W, y1 - y0); }
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, bind - 2, W, 3); g.fillRect(0, H - bind - 1, W, 3);
  stitch(0, 0.27 * pxcm, W, 0.27 * pxcm); stitch(0, H - 0.27 * pxcm, W, H - 0.27 * pxcm);
  // the flap's bound edge (its rounded end is at u0, the tape on the outer side, toward larger angles: smaller u)
  const u0 = W * (1 - CUFF.flap / 360), fb = (W * 5.5) / 360;
  g.fillStyle = '#74757a'; g.fillRect(u0 - fb, 0, fb, H); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(u0 - fb - 1, 0, 3, H);
  stitch(u0 - fb * 0.55, bind, u0 - fb * 0.55, H - bind);
  if (printImg) { g.globalAlpha = 0.96; g.drawImage(printImg, PRINT_AT[0], PRINT_AT[1]); g.globalAlpha = 1; }
  // the weave in the colour too (576 yarns round, 448 up: the normal map's), gently, each yarn a shade lighter or
  // darker than the next (dye and slub), so the cloth still reads as cloth from a distance
  const im = g.getImageData(0, 0, W, H), d = im.data, PU = 576 / W, PV = 448 / H;
  let sd = 3; const rn = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const slubU = Float32Array.from({ length: 577 }, () => (rn() - 0.5) * 0.05), slubV = Float32Array.from({ length: 449 }, () => (rn() - 0.5) * 0.05);
  for (let y = 0; y < H; y++) { const fy = y * PV, j = Math.floor(fy), vy = Math.sin(Math.PI * (fy - j));
    for (let x = 0; x < W; x++) { const fx = x * PU, i = Math.floor(fx), vx = Math.sin(Math.PI * (fx - i)), up = (i + j) & 1, f = 0.965 + 0.045 * (up ? vy : vx) + (up ? slubV[j] : slubU[i]), k = (y * W + x) * 4;
      d[k] *= f; d[k + 1] *= f; d[k + 2] *= f; } }
  g.putImageData(im, 0, 0);
  return c;
}
// the nylon's weave: a plain weave (a 512 px tile, 64 yarns each way, 8 px a yarn), each yarn rounded, a little
// uneven in width, its twist showing as fine slanted ridges, loose fibre over it; as a normal map, a cavity map and a
// roughness map (the yarns' crowns smoother than the hollows between them)
function weaveMaps() {
  // an oxford weave: the warp in pairs over and under a heavier weft (2 x 1), each yarn wandering a little and a
  // little uneven along its length, its twist as fine slanted ridges, loose fibre over it all
  const N = 512, Y = 64, cell = N / Y, hgt = new Float32Array(N * N);
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const ph = Array.from({ length: Y * 4 }, () => rnd() * 6.283), wid = Array.from({ length: Y * 2 }, () => 0.85 + 0.25 * rnd());
  const fuzz = new Float32Array(N * N); for (let k = 0; k < N * N; k++) fuzz[k] = rnd();
  const blur = new Float32Array(N * N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let a = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) a += fuzz[((y + dy + N) % N) * N + ((x + dx + N) % N)]; blur[y * N + x] = a / 9; }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = Math.floor(x / cell), j = Math.floor(y / cell), wy = (y / N) * 6.283, wx = (x / N) * 6.283;
    // where each yarn's centre wanders, and how wide it is here
    const cxw = (i + 0.5) * cell + 0.5 * Math.sin(3 * wy + ph[i]), cyw = (j + 0.5) * cell + 0.5 * Math.sin(3 * wx + ph[Y + j]);
    const ww = wid[i] * (1 + 0.08 * Math.sin(5 * wy + ph[2 * Y + i])), wf = wid[Y + j] * 1.1 * (1 + 0.08 * Math.sin(5 * wx + ph[3 * Y + (j % Y)]));
    const dw = (x - cxw) / (cell * 0.5 * ww), df = (y - cyw) / (cell * 0.5 * wf);
    const warp = Math.max(0, 1 - dw * dw) ** 0.45, weft = Math.max(0, 1 - df * df) ** 0.45;
    const warpUp = (Math.floor(i / 2) + j) % 2 === 0;
    const fy = (y % cell) / cell, fx = (x % cell) / cell;
    const warpH = warp * (warpUp ? 0.8 + 0.2 * Math.sin(Math.PI * fy) : 0.35), weftH = weft * (warpUp ? 0.35 : 0.8 + 0.2 * Math.sin(Math.PI * fx));
    const top = Math.max(warpH, weftH), along = warpH > weftH ? y : x, across = warpH > weftH ? dw : df;
    hgt[y * N + x] = top * (1 + 0.06 * Math.sin(along * 1.9 + across * 2.2)) + 0.07 * (blur[y * N + x] - 0.5) + 0.03 * (fuzz[y * N + x] - 0.5);
  }
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = N; return c; };
  const nc = mk(), ac = mk(), rc = mk(), nd = nc.getContext('2d').createImageData(N, N), ad = ac.getContext('2d').createImageData(N, N), rd = rc.getContext('2d').createImageData(N, N);
  const H = (x, y) => hgt[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * 1.4, dy = (H(x, y + 1) - H(x, y - 1)) * 1.4, l = Math.hypot(dx, dy, 1), k = (y * N + x) * 4, h = Math.min(1, H(x, y));
    nd.data[k] = 128 + 127 * (-dx / l); nd.data[k + 1] = 128 + 127 * (dy / l); nd.data[k + 2] = 128 + 127 * (1 / l); nd.data[k + 3] = 255;
    ad.data[k] = ad.data[k + 1] = ad.data[k + 2] = 255 * (0.55 + 0.45 * h); ad.data[k + 3] = 255;
    rd.data[k] = rd.data[k + 1] = rd.data[k + 2] = 255 * (0.98 - 0.3 * h); rd.data[k + 3] = 255;
  }
  nc.getContext('2d').putImageData(nd, 0, 0); ac.getContext('2d').putImageData(ad, 0, 0); rc.getContext('2d').putImageData(rd, 0, 0);
  return { normal: nc, cavity: ac, rough: rc };
}

// ---------------------------------------------------------------- materials
export function createBPMaterials(maxAniso = 8) {
  const MM = { reading: { ...BP_PRESETS.high } };
  const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; return t; };
  MM.faceTex = tex(faceCanvas(null));
  const img = new Image();
  img.onload = () => { MM.faceTex.image = faceCanvas(img); MM.faceTex.needsUpdate = true; MM.onChange?.(); };
  img.src = new URL('./assets/yoga-block-logo.png', import.meta.url).href;
  // the LCD's light: drawn on black, added inside the window (under the acrylic's gloss)
  const { lcd: D, W, H } = BP, lc = document.createElement('canvas'); lc.width = 1200; lc.height = Math.round((1200 * (D.y1 - D.y0)) / (D.x1 - D.x0));
  drawLCD(lc, MM.reading); MM.lcdCanvas = lc; MM.lcdTex = tex(lc);
  // the face: glossy acrylic and plastic under a clear coat
  MM.face = new THREE.MeshPhysicalMaterial({ map: MM.faceTex, roughness: 0.2, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 0.25, ior: 1.49 });
  const rect = new THREE.Vector4((D.x0 + W / 2) / W, (D.y0 + H / 2) / H, (D.x1 - D.x0) / W, (D.y1 - D.y0) / H);
  MM.faceU = { uLCD: { value: MM.lcdTex }, uRect: { value: rect }, uGlow: { value: 1.5 } };
  MM.face.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, MM.faceU);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uLCD;\nuniform vec4 uRect;\nuniform float uGlow;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  { vec2 ruv = ( vMapUv - uRect.xy ) / uRect.zw; float inR = step( 0.0, ruv.x ) * step( ruv.x, 1.0 ) * step( 0.0, ruv.y ) * step( ruv.y, 1.0 );
    totalEmissiveRadiance += texture2D( uLCD, clamp( ruv, 0.0, 1.0 ) ).rgb * uGlow * inR; }`);
  };
  MM.face.customProgramCacheKey = () => 'bp-face-1';
  MM.shell = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#f1f1f3'), roughness: 0.24, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.12, specularIntensity: 0.5, sheen: 0.15, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ffffff') });
  MM.jack = MM.shell.clone(); MM.jack.vertexColors = true;   // the air jack: the shell's plastic, shaded inside by depth
  MM.jackBore = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#e6e7ea'), roughness: 0.55, metalness: 0, specularIntensity: 0.25, vertexColors: true });   // inside the jack: matte, little of the studio reaches in
  // the shell is opened where the jack is set into it (a disc on the left side: centre y, z, radius, and only for x
  // below .w), so the jack's dish and bore show; set by buildBPMonitor
  MM.jackHole = new THREE.Vector4(0, 0, 0, -1e9);
  MM.shell.onBeforeCompile = (sh) => {
    sh.uniforms.uJackHole = { value: MM.jackHole };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vJackP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvJackP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vJackP;\nuniform vec4 uJackHole;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif ( vJackP.x < uJackHole.w && length( vJackP.yz - uJackHole.xy ) < uJackHole.z ) discard;');
  };
  MM.shell.customProgramCacheKey = () => 'bp-shell-jack';
  MM.chrome = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#e4e5e8'), metalness: 1, roughness: 0.1 });
  MM.cap = new THREE.MeshPhysicalMaterial({ map: tex(buttonCanvas()), roughness: 0.3, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.1 });
  MM.port = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#2a2b2e'), roughness: 0.5 });
  MM.portIn = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#0b0b0c'), roughness: 0.7, side: THREE.DoubleSide });   // the dark ends of the ports, seen from inside or out
  MM.base = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#e9e9ec'), roughness: 0.5, metalness: 0 });
  // the cuff: grey nylon, its fine plain weave (a tiled normal map, its hollows a cavity map), a soft sheen; its print
  // and bindings a canvas round it, the traced print added when it loads
  const cuffTex = tex(cuffCanvas(null)); cuffTex.wrapS = THREE.RepeatWrapping;
  const pimg = new Image();
  pimg.onload = () => { cuffTex.image = cuffCanvas(pimg); cuffTex.needsUpdate = true; MM.onChange?.(); };
  pimg.src = new URL('./assets/cuff-print.png', import.meta.url).href;
  const wv = weaveMaps(), tile = (cv) => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(9, 7); t.anisotropy = Math.min(4, maxAniso); return t; };   // a little anisotropic filtering only: the weave melts into sheen at grazing angles, as cloth does
  MM.fabric = new THREE.MeshPhysicalMaterial({ map: cuffTex, normalMap: tile(wv.normal), normalScale: new THREE.Vector2(0.6, 0.6), aoMap: tile(wv.cavity), aoMapIntensity: 0.75, roughnessMap: tile(wv.rough),
    roughness: 1, metalness: 0, sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color('#c2c4c9'), specularIntensity: 0.22, side: THREE.DoubleSide });
  // where the hose goes into the cuff: a moulded rubber boot
  MM.boot = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#6b6d72'), roughness: 0.55, metalness: 0, clearcoat: 0.15, clearcoatRoughness: 0.4 });
  MM.cuffInner = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#2e2f32'), roughness: 0.95, side: THREE.DoubleSide });
  // the tube: grey PVC, satin (a soft, broad highlight); its plug a little lighter and glossier
  const tl = document.createElement('canvas'); tl.width = 16; tl.height = 512; { const g = tl.getContext('2d'); g.fillStyle = 'rgb(128,128,255)'; g.fillRect(0, 0, 16, 512);
    let sd = 5; const rn = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    for (let y = 0; y < 512; y += 1 + Math.floor(rn() * 6)) { const d = (rn() - 0.5) * 22; g.fillStyle = `rgb(128,${Math.round(128 + d)},255)`; g.fillRect(0, y, 16, 1); } }
  const tN = new THREE.CanvasTexture(tl); tN.wrapS = tN.wrapT = THREE.RepeatWrapping; tN.anisotropy = maxAniso;   // faint extrusion lines along the hose (constant along it)
  // its surface not quite even: soft patches a little rougher or smoother along it (handling, the extrusion)
  const tr = document.createElement('canvas'); tr.width = 256; tr.height = 64; { const g = tr.getContext('2d'); g.fillStyle = '#d0d0d0'; g.fillRect(0, 0, 256, 64);
    let sd = 9; const rn = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 140; k++) { const x = rn() * 256, y = rn() * 64, rx = 6 + rn() * 30, ry = 3 + rn() * 12, v = Math.round(170 + rn() * 85);
      for (const dx of [-256, 0, 256]) for (const dy of [-64, 0, 64]) { const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rx); gr.addColorStop(0, `rgba(${v},${v},${v},0.35)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
        g.save(); g.translate(x + dx, y + dy); g.scale(1, ry / rx); g.translate(-(x + dx), -(y + dy)); g.fillStyle = gr; g.fillRect(x + dx - rx, y + dy - rx, 2 * rx, 2 * rx); g.restore(); } } }
  const tR = new THREE.CanvasTexture(tr); tR.wrapS = tR.wrapT = THREE.RepeatWrapping; tR.repeat.set(8, 1);
  // grey PVC: satin, its highlight drawn out along the hose (extruded plastic is a little anisotropic), a thin
  // glossier skin over it
  MM.tube = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#8e9095'), roughness: 0.5, roughnessMap: tR, metalness: 0, anisotropy: 0.45, clearcoat: 0.22, clearcoatRoughness: 0.28,
    specularIntensity: 0.5, sheen: 0.25, sheenRoughness: 0.6, sheenColor: new THREE.Color('#c4c6ca'), normalMap: tN, normalScale: new THREE.Vector2(0.3, 0.3) });
  MM.plug = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#b9bbbf'), roughness: 0.3, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.18, specularIntensity: 0.55 });
  return MM;
}
export function setBPReading(MM, R) { MM.reading = { ...MM.reading, ...R }; drawLCD(MM.lcdCanvas, MM.reading); MM.lcdTex.needsUpdate = true; }

// ---------------------------------------------------------------- the monitor
// the cuff's turns: the outer one with soft rounded shoulders (an inflatable cuff), its flap spiralling in; the inner
// turns inside those shoulders, standing a little proud at the top
const CUFF_LAYERS = [{ d: 0, top: CUFF.h, bot: 0, spiral: true, sh: 0.6, shb: 0.45 }, { d: 0.6 + CUFF.t + 0.02, top: CUFF.h + 0.22, bot: 0.3, sh: 0.22, shb: 0.2 }, { d: 0.6 + 2 * CUFF.t + 0.08, top: CUFF.h + 0.08, bot: 0.3, deep: true, sh: 0.15, shb: 0.15 }];
// a turn's radial offset at angle th (from +x toward +z), height y, dr in from its outer face: a slight taper, a soft
// bulge, gentle uneven folds; the outer turn also has its bound edges (the tape a hair proud, a groove where it is
// stitched, the cloth puckering a little below it) and the spiral to the flap's rounded end
function cuffRadius(L, th, y, dr) {
  const C = CUFF, t = C.t, s = Math.sin((Math.PI * Math.min(Math.max(y, 0), C.h)) / C.h), deg = (th * 180) / Math.PI;
  let r = -L.d + dr + C.taper * (1 - y / C.h) + 0.14 * s + 0.03 * Math.sin(3 * th + 0.7) * s + 0.015 * Math.sin(7 * th + 2.1) * s;
  const et = L.top - y, eb = y - L.bot, shoulder = (e, R) => (e < R ? R - Math.sqrt(R * R - (R - Math.max(e, 0)) ** 2) : 0);
  r -= shoulder(et, L.sh) + shoulder(eb, L.shb);
  if (L.spiral) {
    r += 0.022 * Math.sin(5 * th + 0.9 * y + 1.1) * Math.sin(0.7 * y + 2 * th) * s + 0.012 * Math.sin(9 * th - 1.3 * y + 0.4) * s;   // soft, uneven folds
    for (const e of [et, eb]) {
      if (e < 0 || e > 2.5) continue;
      const band = 1 / (1 + Math.exp((e - 0.44) / 0.012));                                   // the binding tape, a hair proud
      r += 0.028 * band - 0.024 * Math.exp(-(((e - 0.27) / 0.028) ** 2));                     // and the stitches' groove in it
      r += 0.01 * (Math.sin(19 * th + 2.3 * Math.sin(3 * th) + 0.5) * Math.sin(7 * th + 1.9)) * Math.exp(-Math.max(e - 0.44, 0) / 0.45) * (1 - band);   // a little puckering below it
    }
    const m = (((deg - C.flap) % 360) + 360) % 360, w = 3.5; r -= t * (m / 360); if (m < w) r -= t * (1 - Math.sqrt(1 - (1 - m / w) ** 2));
  }
  return r;
}
// a point on a turn (in the cuff's own frame)
function cuffPoint(L, th, y, dr) { const r = cuffRadius(L, th, y, dr); return new THREE.Vector3((CUFF.rx + r) * Math.cos(th), y, (CUFF.rz + r) * Math.sin(th)); }

export function buildBPMonitor(MM) {
  const { W, H, n, rim, depth: Dp, flare, round: R, rimDrop } = BP, grp = new THREE.Group(); grp.name = 'bp-monitor';
  const body = new THREE.Group(); body.name = 'bp-body'; grp.add(body);
  const add = (name, geo, mat, parent = body) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = true; m.receiveShadow = false; parent.add(m); return m; };
  const N = 360, out = superellipse(W / 2, H / 2, n, N), nrm = normalsOf(out);
  const D = (y) => Dp.bottom + ((Dp.top - Dp.bottom) * (y + H / 2)) / H;
  const ring = (off, z) => out.map((p, j) => [p[0] + nrm[j][0] * off, p[1] + nrm[j][1] * off, typeof z === 'function' ? z(p[1]) : z]);
  // the chrome bead: from its inner edge (the face) up over a rounded top and down its outer side
  const chrome = [];
  for (let k = 0; k <= 10; k++) { const a = (k / 10) * Math.PI; chrome.push(ring(-rim / 2 - (rim / 2) * Math.cos(a), 0.035 * Math.sin(a) + 0.0)); }
  for (let k = 1; k <= 4; k++) chrome.push(ring(0.004 * k, -(rimDrop * k) / 4));
  add('bp-chrome', ringMesh(chrome, { centre: [0, 0, -1.5] }), MM.chrome);
  // the white shell: flaring a little, then rounding under to the back (its depth by y: a wedge)
  const shell = [chrome[chrome.length - 1]];
  for (let k = 1; k <= 14; k++) { const s = k / 14; shell.push(ring(0.016 + (flare - 0.016) * Math.sin((Math.PI / 2) * s), (y) => -rimDrop - (D(y) - R - rimDrop) * s)); }
  for (let k = 1; k <= 12; k++) { const a = ((k / 12) * Math.PI) / 2; shell.push(ring(flare - R * (1 - Math.cos(a)), (y) => -(D(y) - R) - R * Math.sin(a))); }
  const shellMesh = add('bp-shell', ringMesh(shell, { centre: [0, 0, -1.5] }), MM.shell);
  // the back: flat (a slanted plane), the white of the shell, matte
  const back = shell[shell.length - 1], cb = [0, 0, -D(0)];
  add('bp-back', ringMesh([back, back.map(() => cb)], { centre: [0, 0, 0] }), MM.base);
  // the face: inside the bead, its print and the LCD's light
  const faceOut = superellipse(W / 2 - rim, H / 2 - rim, n, N);
  add('bp-face', flatFan(faceOut, 0.0, (x, y) => [x / W + 0.5, y / H + 0.5]), MM.face);
  // the button: a chrome rim round a white cap that stands a little proud, its edges eased
  const B = BP.button;
  const rimR = [];
  for (let k = 0; k <= 8; k++) { const a = (k / 8) * Math.PI, d = 0.045 * Math.cos(a); rimR.push(roundRect(B.w + 0.09 + 2 * d, B.h + 0.09 + 2 * d, B.r + d, 160, 0, B.cy).map((p) => [p[0], p[1], 0.002 + 0.03 * Math.sin(a)])); }
  add('bp-button-rim', ringMesh(rimR, { centre: [0, B.cy, -1] }), MM.chrome);
  const capRings = [];
  for (let k = 0; k <= 8; k++) { const a = ((k / 8) * Math.PI) / 2, e = 0.06 * (1 - Math.cos(a)); capRings.push(roundRect(B.w - 2 * e, B.h - 2 * e, B.r - e, 160, 0, B.cy).map((p) => [p[0], p[1], 0.01 + 0.06 * Math.sin(a)])); }
  add('bp-button-side', ringMesh(capRings, { centre: [0, B.cy, -1] }), MM.shell);
  add('bp-button', flatFan(capRings[capRings.length - 1].map((p) => [p[0], p[1]]), 0.07, (x, y) => [(x + B.w / 2) / B.w, (y - B.cy + B.h / 2) / B.h]), MM.cap);
  // the ports, set in the shell's sides at mid depth: the air jack (left) and USB-C with SET above it (right)
  const sideAt = (sx, y) => { let best = out[0], bi = 0; out.forEach((p, i) => { if (Math.sign(p[0]) === sx && Math.abs(p[1] - y) < Math.abs(best[1] - y)) { best = p; bi = i; } }); return { x: best[0] + nrm[bi][0] * flare * 0.95, y: best[1], z: -D(y) * 0.45 }; };
  { const J = BP.jack, s = sideAt(-1, J.y), circ = (r, x) => Array.from({ length: 48 }, (_, i) => { const a = (2 * Math.PI * i) / 48; return [x, s.y + r * Math.cos(a), s.z + r * Math.sin(a)]; });
    // set into the side, as in the photos: a soft rounded lip, a shallow countersunk dish, a small raised ring round
    // the socket's mouth, then the bore going in, darker the deeper it goes (its own shadow), a dark hole at its end.
    // [radius, depth into the side] (the left side: in is +x)
    const prof = [[0.53, -0.004], [0.515, 0.006], [0.495, 0.022], [0.47, 0.045], [0.44, 0.068], [0.39, 0.098], [0.34, 0.125], [0.315, 0.138], [0.298, 0.14],
      [0.284, 0.133], [0.268, 0.118], [0.252, 0.112], [0.238, 0.118], [0.227, 0.135], [0.221, 0.165], [0.22, 0.25], [0.22, 0.4], [0.218, 0.5], [0.21, 0.56], [0.19, 0.585], [0.15, 0.595]];
    const shade = (d) => (d < 0.11 ? 1 - 0.5 * Math.max(0, d - 0.06) : d < 0.16 ? 0.97 : 0.78 - 0.66 * Math.pow(Math.min(1, (d - 0.16) / 0.43), 0.7));
    // the side bows out toward the front: each point of the jack is set from the shell's own surface there (a ray in
    // along +x), so its lip sits on the side all round
    const ray = new THREE.Raycaster(), surf = (y, z) => { ray.set(new THREE.Vector3(s.x - 3, y, z), new THREE.Vector3(1, 0, 0)); const h = ray.intersectObject(shellMesh, false)[0]; return h ? h.point.x : s.x; };
    const surfX = circ(0.53, 0).map(([, y, z]) => surf(y, z));
    const at = (r, d) => Array.from({ length: 48 }, (_, i) => { const a = (2 * Math.PI * i) / 48; return [surfX[i] + d, s.y + r * Math.cos(a), s.z + r * Math.sin(a)]; });
    const sx = surfX.reduce((t, x) => t + x / 48, 0);
    // the dish and the socket's ring in the shell's glossy plastic; the bore in a matte one, shaded by its depth
    const part = (pr, mat, name, wrong = (n) => n.getX(0) > 0) => {   // the dish faces out (-x), the bore its axis
      const g = ringMesh(pr.map(([r, d]) => at(r, d)));
      if (wrong(g.attributes.normal)) { const a = g.index.array; for (let k = 0; k < a.length; k += 3) { const t = a[k + 1]; a[k + 1] = a[k + 2]; a[k + 2] = t; } g.computeVertexNormals(); }
      g.setAttribute('color', new THREE.Float32BufferAttribute(pr.flatMap(([, d]) => { const c = shade(d); return Array.from({ length: 48 }, () => [c, c, c]).flat(); }), 3));
      return add(name, g, mat);
    };
    const cut = prof.findIndex(([, d]) => d >= 0.165);
    part(prof.slice(cut), MM.jackBore, 'bp-jack-bore', (n) => n.getY(0) > 0);
    part(prof.slice(0, cut + 1), MM.jack, 'bp-jack-dish');
    MM.jackHole?.set(s.y, s.z, 0.508, sx + 0.5);
    add('bp-jack-hole', ringMesh([at(0.15, 0.595), at(0.14, 0.8), at(0.001, 0.8)], { centre: [sx - 1, s.y, s.z] }), MM.portIn);
    // where the plug's collar sits (in the dish) is 0.26 out from this point
    const ref = new THREE.Object3D(); ref.name = 'bp-jack-ref'; ref.position.set(sx + 0.06 + 0.26, s.y, s.z); body.add(ref); }
  { const U = BP.usb, s = sideAt(1, U.y), slot = (w, h, x) => roundRect(h, w, h / 2 - 0.001, 64).map(([a, b]) => [x, s.y + b, s.z + a]);
    add('bp-usb', ringMesh([slot(U.w + 0.12, U.h + 0.12, s.x + 0.01), slot(U.w, U.h, s.x - 0.02), slot(U.w, U.h, s.x - 0.3)], { centre: [s.x + 1, s.y, s.z] }), MM.port);
    add('bp-usb-in', ringMesh([slot(U.w * 0.6, U.h * 0.35, s.x - 0.12), slot(0.001, 0.001, s.x - 0.12)]), MM.portIn); }
  // the cuff: a rolled sleeve of three turns, each a wall of fabric with a bound, rounded top and bottom edge (see
  // CUFF_LAYERS, cuffRadius); open right through, as a real cuff is
  const cuff = new THREE.Group(); cuff.name = 'bp-cuff'; grp.add(cuff);
  { const C = CUFF, M = 720, t = C.t;
    for (const [li, L] of CUFF_LAYERS.entries()) {
      // the profile (radial offset, y): up the inner side, over the top edge, down the outside (rows close together
      // near the edges, for the binding's step and its stitched groove), under the bottom edge
      const prof = [], arc = (cy, from, to, n = 9) => { for (let k = 0; k <= n; k++) { const a = from + ((to - from) * k) / n; prof.push([-t / 2 + (t / 2) * Math.cos(a), cy + (t / 2) * Math.sin(a)]); } };
      const innerLow = L.deep ? L.bot + t / 2 : L.top - 0.9;
      prof.push([-t, innerLow]); if (L.deep) for (let k = 1; k <= 24; k++) prof.push([-t, innerLow + ((L.top - t / 2 - innerLow) * k) / 25]);
      arc(L.top - t / 2, Math.PI, 0);
      const y0 = L.top - t / 2, y1 = L.bot + t / 2, NR = L.spiral ? 110 : 40;
      for (let k = 1; k < NR; k++) { const u = k / NR, g = u - (0.92 * Math.sin(2 * Math.PI * u)) / (2 * Math.PI); prof.push([0, y0 - (y0 - y1) * g]); }
      arc(L.bot + t / 2, 0, -Math.PI);
      prof.push([-t, L.bot + 0.9]);
      // v by distance along the cloth (over the rounded edges too, so the weave isn't smeared there), matching
      // height on the outside face: 1 at the outer turn's top
      const arcS = [0]; for (let i = 1; i < prof.length; i++) arcS.push(arcS[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
      const iTop = prof.findIndex(([dr, y], i) => i > 0 && dr === 0 && y < L.top - C.t / 2 - 1e-6) - 1, vTop = (prof[iTop][1] - (L.top - C.h)) / C.h;
      const vRow = arcS.map((sv) => vTop + (arcS[iTop] - sv) / C.h);
      const pos = [], uv = [], idx = [], cols = M + 1;
      for (const [ri, [dr, y]] of prof.entries()) for (let j = 0; j <= M; j++) {
        const th = (2 * Math.PI * j) / M, r = cuffRadius(L, th, y, dr);
        pos.push((C.rx + r) * Math.cos(th), y, (C.rz + r) * Math.sin(th));
        uv.push(1 - j / M, vRow[ri]);
      }
      for (let i = 0; i < prof.length - 1; i++) for (let j = 0; j < M; j++) { const a = i * cols + j, b = (i + 1) * cols + j; idx.push(a, b, b + 1, a, b + 1, a + 1); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
      geo.computeVertexNormals();
      { const N = geo.attributes.normal; for (let i = 0; i < prof.length; i++) { const a = i * cols, b = a + M; const n = new THREE.Vector3(N.getX(a) + N.getX(b), N.getY(a) + N.getY(b), N.getZ(a) + N.getZ(b)).normalize(); N.setXYZ(a, n.x, n.y, n.z); N.setXYZ(b, n.x, n.y, n.z); } }
      add(`bp-cuff-layer${li}`, geo, MM.fabric, cuff);
    } }
  return grp;
}
// the tube: a PVC hose swept along points (centripetal Catmull-Rom through them), radius r
function tubeAlong(ctrl, r = 0.3, sides = 40) {
  const curve = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal', 0.5);
  return new THREE.TubeGeometry(curve, Math.max(64, Math.round(curve.getLength() * 9)), r, sides, false);
}
// the plug at the air jack: a collar against the side, a short body, a taper down to the hose (along -x from x = 0)
function plugGeometry(r) {
  const p = [[0.001, -0.25], [0.19, -0.25], [0.19, 0], [0.43, 0], [0.45, 0.03], [0.45, 0.26], [0.42, 0.3], [0.38, 0.33], [0.38, 0.95], [0.36, 1.0], [r * 1.12, 1.25], [r * 1.04, 1.6], [r * 0.98, 1.7]];
  const pts = []; for (let i = 0; i < p.length; i++) { pts.push(new THREE.Vector2(p[i][0], p[i][1])); }
  const g = new THREE.LatheGeometry(pts, 48); g.rotateZ(Math.PI / 2);   // its axis (y) along -x
  return g;
}
const TUBE_R = 0.36;
// the boot where the hose joins the cuff: a flange on the cloth, a short sleeve tapering onto the hose (along +y)
function bootGeometry(r) {
  const p = [[0.001, -0.06], [0.62, -0.06], [0.66, -0.02], [0.66, 0.04], [0.6, 0.08], [r * 1.35, 0.14], [r * 1.3, 0.5], [r * 1.18, 0.75], [r * 1.06, 0.95], [r * 1.0, 1.05]];
  return new THREE.LatheGeometry(p.map(([a, b]) => new THREE.Vector2(a, b)), 48);
}
// the bounds of what shows (the hidden cuff left out)
export function visibleBox(obj) {
  const box = new THREE.Box3(); obj.updateMatrixWorld(true);
  obj.traverse((o) => { if (!o.isMesh) return; for (let p = o; p; p = p.parent) if (!p.visible) return; box.expandByObject(o, true); });
  return box;
}
// standing on its button end, leaning back a little (as the images); lying flat on its back
export function poseBPMonitor(grp, pose, withCuff = true, MM = null) {
  // worked out in the group's own frame (it may already be placed in the studio), then put back
  const keep = [grp.position.clone(), grp.quaternion.clone(), grp.scale.clone()];
  grp.position.set(0, 0, 0); grp.quaternion.identity(); grp.scale.set(1, 1, 1); grp.updateMatrixWorld(true);
  poseInFrame(grp, pose, withCuff, MM);
  grp.position.copy(keep[0]); grp.quaternion.copy(keep[1]); grp.scale.copy(keep[2]); grp.updateMatrixWorld(true);
}
function poseInFrame(grp, pose, withCuff, MM) {
  const body = grp.getObjectByName('bp-body'), cuff = grp.getObjectByName('bp-cuff');
  body.rotation.set(0, 0, 0);
  // lying on its back: the back is a slanted plane (the shell 4.2 cm deep at the top, 3.0 at the bottom), so it rests
  // flat on it, the face tipped up a little towards its bottom end, as a real one lies on a table
  if (pose === 'lying') body.rotation.x = -Math.PI / 2 + Math.atan((BP.depth.top - BP.depth.bottom) / BP.H);
  else body.rotation.x = -(8 * Math.PI) / 180;
  grp.userData.pose = pose;
  const old = grp.getObjectByName('bp-tube'); if (old) { old.traverse((o) => o.geometry?.dispose()); grp.remove(old); }
  cuff.visible = withCuff;
  if (!cuff.visible) return;
  grp.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(body, true), C = CUFF, lying = pose === 'lying', bx = (b.min.x + b.max.x) / 2;
  if (lying) {   // the cuff on its side behind the monitor, its open end (the coils) to the left, its print up and to the front
    cuff.rotation.set(0, 0, Math.PI / 2);
    cuff.position.set(bx + C.h / 2, b.min.y + C.rx + C.taper / 2 + 0.12, b.min.z - C.rz - 0.4);
  } else {       // the cuff behind the monitor, standing on the same floor, a little to its right; the monitor leans on it
    cuff.rotation.set(0, 0, 0);
    cuff.position.set(b.max.x + 0.1, b.min.y, b.min.z - C.rz + 0.3);   // tucked behind, about 3.4 cm of it beyond the monitor's right edge (ref-4)
  }
  grp.updateMatrixWorld(true);
  const J = body.getObjectByName('bp-jack-ref').getWorldPosition(new THREE.Vector3());
  const cx = cuff.position.x, cy = cuff.position.y, cz = cuff.position.z, top = b.min.y + C.h, r = TUBE_R, fl = b.min.y + r + 0.005, V = (x, y, z) => new THREE.Vector3(x, y, z);
  const mat = MM ? MM.tube : new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
  const tubes = new THREE.Group(); tubes.name = 'bp-tube'; grp.add(tubes);
  const hose = (pts, name) => { const m = new THREE.Mesh(tubeAlong(pts, r), mat); m.name = name; m.castShadow = true; tubes.add(m); return m; };
  // where the hose goes into the cuff's inner wall: a point on the innermost turn's inside face (angle th, height y,
  // in the cuff's frame), the hose leaving it in direction dl (cuff frame); returns the hose's first points (from
  // inside the wall) in the group's frame, and puts a rubber boot round the joint
  cuff.updateMatrixWorld(true);
  const Lin = CUFF_LAYERS[2], toG = (v) => v.clone().applyMatrix4(cuff.matrixWorld), dirG = (v) => v.clone().applyQuaternion(cuff.quaternion).normalize();
  const port = (th, y, dl, L = Lin, dr = -C.t) => {   // (L, dr: the inner wall by default; the outer turn's face with CUFF_LAYERS[0], 0)
    const Q = cuffPoint(L, th, y, dr), d = dl.clone().normalize();
    const boot = new THREE.Mesh(bootGeometry(r), MM ? MM.boot : mat); boot.name = 'bp-tube-boot'; boot.castShadow = true;
    boot.position.copy(toG(Q.clone().addScaledVector(d, -0.15))); boot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirG(d)); tubes.add(boot);
    return [toG(Q.clone().addScaledVector(d, -0.9)), toG(Q.clone().addScaledVector(d, -0.2)), toG(Q.clone().addScaledVector(d, 0.6))];
  };
  // the lead into the plug: out of it level (a stiff hose), then sweeping round toward the front as it falls to the
  // floor, a quarter turn of radius R; O is where it meets the floor (heading toward the front)
  const P = 1.96, E = V(J.x - P + 0.08, J.y, J.z), R = lying ? 3.0 : 4.2, O = V(E.x - R, fl, E.z + R), lead = [];
  for (let k = 0; k <= 12; k++) { const f = k / 12, ph = (f * Math.PI) / 2, fall = (1 - Math.cos(Math.PI * Math.min(1, f * 1.08))) / 2;
    lead.push(V(E.x - R * Math.sin(ph), E.y + (fl - E.y) * fall, E.z + R * (1 - Math.cos(ph)))); }
  lead.reverse();   // floor -> plug
  const loop = [];
  if (!lying) {
    // ref-1 and ref-3: the coils stick out of the roll's top as two arches side by side, the back one the taller
    const arch = (A, B, H, lean) => {   // legs straight up out of the roll, swelling wider above it, a round top, leaning back
      const leg = (P) => { const th = Math.atan2((P[1] - cz) / C.rz, (P[0] - cx) / C.rx), o = new THREE.Vector3(Math.cos(th), 0, Math.sin(th)), y = C.h - 2.6;
        const Q = cuffPoint(Lin, th, y, -C.t).add(cuff.position), dl = new THREE.Vector3((P[0] - Q.x) * 0.9, 1.4, (P[1] - Q.z) * 0.9).sub(o.multiplyScalar(0.1));
        return port(th, y, dl); };
      const pts = [...leg(A), V(A[0], top - 0.6, A[1])];
      for (let k = 0; k <= 12; k++) { const a = (Math.PI * k) / 12, f = (1 - Math.cos(a)) / 2, s = Math.sin(a);
        const bulge = 0.75 * Math.sin(2 * a) * Math.sin(a) ** 0.5;   // wider than its legs, round at the top (ref-1)
        pts.push(V(A[0] + (B[0] - A[0]) * f - Math.sign(B[0] - A[0]) * bulge, top + 0.4 + H * s, A[1] + (B[1] - A[1]) * f - lean * s)); }
      pts.push(V(B[0], top - 0.6, B[1]), ...leg(B).reverse());
      return pts;
    };
    hose(arch([cx - 1.65, cz - 0.45], [cx + 1.65, cz - 0.8], 4.3, 1.3), 'bp-tube-arch-back');   // about a third of the monitor's height above the cuff, leaning back
    hose(arch([cx - 1.65, cz + 0.5], [cx + 1.15, cz + 0.4], 3.5, 0.8), 'bp-tube-arch-front');
    // the floor loop: from inside the cuff (under its soft bottom edge) an oval round the monitor's front, a little
    // irregular as a hose lies, its left end at O
    const mx = bx + 0.8, zc = O.z, ax = mx - O.x, az = Math.max(4.0, b.max.z + 3.0 - zc);
    const ov = (deg) => { const a = (deg * Math.PI) / 180, w = 1 + 0.035 * Math.sin(3 * a + 1.1) * Math.sin((Math.PI * (deg + 50)) / 230); return V(mx + ax * w * Math.cos(a), fl, zc + az * w * Math.sin(a)); };   // no wobble at its ends
    const s0 = ov(-50), s1 = ov(-44), td = s1.clone().sub(s0).normalize();
    // out through a booted port in the cuff's outer face, low on its front right (as a real cuff's hose leaves it),
    // dipping straight down to the floor
    const thw = (48 * Math.PI) / 180, ow = new THREE.Vector3(Math.cos(thw), 0, Math.sin(thw)), yp = 1.25;
    const po = port(thw, yp, new THREE.Vector3(Math.cos(thw), -0.25, Math.sin(thw)), CUFF_LAYERS[0], 0), q0 = po[2];
    loop.push(...po, V(q0.x + ow.x * 0.7, fl + 0.22, q0.z + ow.z * 0.7), V(q0.x + ow.x * 1.8, fl, q0.z + ow.z * 1.8));
    for (let k = 0; k < 22; k++) loop.push(ov(-50 + (230 * k) / 22));
  } else {
    // out of the roll's open end, down to the floor, forward along the left, a hook round in front of the monitor's
    // left corner, back to O
    const xe = cx - C.h;   // the open end
    const pl = port(Math.PI, C.h - 2.4, new THREE.Vector3(0.3, 1, 0.04));   // its lowest side (the cuff's -x is down), the hose lying along it toward the open end
    const qy = cuffPoint(Lin, Math.PI, C.h - 1, -C.t).applyMatrix4(cuff.matrixWorld).y + r + 0.06;   // resting on the inner face
    loop.push(...pl.slice(0, 2), V(xe + 1.0, qy, cz + 0.08), V(xe - 0.35, qy + 0.02, cz + 0.2), V(xe - 1.3, qy - 0.5, cz + 0.45), V(xe - 1.9, fl + 0.5, cz + 1.0), V(xe - 2.4, fl, cz + 2.4),
      V(O.x - 2.6, fl, O.z - 0.5), V(O.x - 2.8, fl, b.max.z + 0.6), V(O.x - 1.2, fl, b.max.z + 3.0), V(O.x + 2.4, fl, b.max.z + 3.4),
      V(b.min.x + 3.2, fl, b.max.z + 2.2), V(O.x + 1.6, fl, O.z + 2.6), V(O.x + 0.15, fl, O.z + 1.2));
  }
  loop.push(...lead, V(E.x + 0.1, E.y, E.z));
  hose(loop, 'bp-tube-loop');
  const plug = new THREE.Mesh(plugGeometry(r), MM ? MM.plug : mat); plug.name = 'bp-tube-plug'; plug.castShadow = true;
  plug.position.copy(J); plug.position.x -= 0.26; tubes.add(plug);   // its collar in the jack's dish
}
