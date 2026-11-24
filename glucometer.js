// Sword blood glucose meter (glucometer): its pebble body, LCD, round button, test-strip slot and port, and a test
// strip. Built in code from the product images in Figma (Brand Library Assets, "Pulse - Glucometer"; saved in
// Glucometer/: ref-front.png, the straight-on front, 1072 px across = 5.6 cm, is the layout reference).
// Units: centimetres. Local frame: x across the face, y up it (the strip's end), z out of it; the face at z = 0.
// - Body: a superellipse 5.6 x 8.32 cm, exponent 3.2 (fitted to the front's outline), 1.6 cm deep: a glossy white
//   front cap with a rounded edge, a fine parting line, a satin white back half rounding under to a flat back.
// - Face: glossy white; the LCD's window (a light grey frame round a black panel), the logo above it in light grey.
// - LCD: drawn from the reading in the reference's style: the clock and date in small seven-segment cells, the
//   Bluetooth, sync and battery icons, the reading in large mitred cells (a narrow 1 in the hundreds), mg/dL; lit.
// - Button: a satin silver ring round a white domed cap. Strip slot on the top edge, a port on the bottom edge.
// - The strip: blue, glossy, its sample end out of the slot.
import * as THREE from 'three';

export const GL = {
  W: 5.6, H: 8.32, n: 3.2, T: 1.6,
  rf: 0.34, rb: 0.55, part: -0.62, dome: 0.05,                       // front edge radius, back edge radius, parting line (z), the face's crown
  frame: { x0: -1.81, x1: 1.81, y0: -1.115, y1: 2.205, r: 0.17 },   // the LCD window's light grey frame
  panel: { inset: 0.07, r: 0.11 },                                   // the black panel inside it
  logo: { w: 1.96, cy: 2.95 },
  button: { cy: -2.03, ro: 0.8, ri: 0.665 },
  slot: { w: 0.78, h: 0.17, z: -0.8 }, port: { w: 0.62, h: 0.2, z: -0.8 },
  strip: { w: 0.56, t: 0.04, out: 2.15, in: 0.9 },
};
// readings: in range (108), high (212), low (64); the clock and the date as in the images
export const GL_PRESETS = { normal: { value: '108', time: '13:09', date: '21-12' }, high: { value: '212', time: '13:09', date: '21-12' }, low: { value: '64', time: '13:09', date: '21-12' } };
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

// ---------------------------------------------------------------- the LCD (canvas, drawn from the reading)
// mitred seven-segment cells (bars about a ninth of the digit's height, ends cut at 45 degrees, small gaps)
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
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g' };
function drawCell(g, ch, x, y, w, h, t, gp) {
  const P = segPolys(w, h, t, gp);
  for (const s of SEG[ch] ?? '') { g.beginPath(); P[s].forEach(([px, py], i) => (i ? g.lineTo(x + px, y + py) : g.moveTo(x + px, y + py))); g.closePath(); g.fill(); }
}
// a line of small cells (the clock, the date), from x: a 1 after another digit in a full cell (its bars at the cell's
// right, as the date's "2 1"), otherwise a narrow one; a dash a short cell, a colon two dots
function drawSmall(g, str, x, y, w, h, gap, alignRight = false) {
  const t = h * 0.13, gp = h * 0.025, chars = [...String(str)];
  const items = chars.map((ch, i) => ({ ch, w: ch === '1' && !/[0-9]/.test(chars[i - 1] ?? '') ? t * 1.05 : ch === ':' ? w * 0.3 : ch === '-' ? w * 0.62 : w }));
  const total = items.reduce((s, it) => s + it.w, 0) + gap * (items.length - 1);
  let cx = alignRight ? x - total : x;
  for (const it of items) {
    if (it.ch === ':') { const d = t * 0.95; g.fillRect(cx + (it.w - d) / 2, y + h * 0.28, d, d); g.fillRect(cx + (it.w - d) / 2, y + h * 0.66, d, d); }
    else if (it.ch === '1') drawCell(g, '1', cx + it.w - w, y, w, h, t, gp);   // only its right bars show
    else if (it.ch === '-') { g.fillRect(cx + gp, y + h / 2 - t / 2, it.w - 2 * gp, t); }
    else drawCell(g, it.ch, cx, y, it.w, h, t, gp);
    cx += it.w + gap;
  }
}
// the reading, right-aligned at xr: a hundreds 1 in a narrow cell (anything else full width)
function drawReading(g, txt, xr, y, w, h, gap) {
  const s = String(txt).replace(/[^0-9]/g, '').slice(-3);
  if (s.length === 3 && s[0] !== '1') { w *= 0.84; gap *= 0.8; }   // three full digits: a little narrower, clear of the icons
  const t = h * 0.122, gp = h * 0.02;
  let left = xr + gap;
  for (let i = s.length - 1; i >= 0; i--) {
    if (i === 0 && s.length === 3 && s[0] === '1') { const wn = t * 1.05, right = left - gap * 1.2; drawCell(g, '1', right - w, y, w, h, t, gp); break; }
    const x = left - gap - w; drawCell(g, s[i], x, y, w, h, t, gp); left = x;
  }
}
function drawLCD(c, R) {
  const g = c.getContext('2d'), W = c.width, H = c.height, X = (f) => f * W, Y = (f) => f * H;
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.fillStyle = g.strokeStyle = '#ffffff'; g.shadowColor = 'rgba(255,255,255,0.45)'; g.shadowBlur = W * 0.006;
  // positions as fractions of the black panel (measured on ref-front.png's panel, 647 x 590 px)
  drawSmall(g, R.time || '', X(0.034), Y(0.04), X(0.074), Y(0.168), X(0.016));
  drawSmall(g, R.date || '', X(0.966), Y(0.04), X(0.074), Y(0.168), X(0.016), true);
  g.lineCap = g.lineJoin = 'round';
  { const cx = X(0.322), cy = Y(0.29), hh = Y(0.072), ww = hh * 0.34; g.lineWidth = W * 0.0075;   // Bluetooth
    g.beginPath(); g.moveTo(cx - ww, cy - hh * 0.24); g.lineTo(cx + ww, cy + hh * 0.22); g.lineTo(cx, cy + hh / 2); g.lineTo(cx, cy - hh / 2); g.lineTo(cx + ww, cy - hh * 0.22); g.lineTo(cx - ww, cy + hh * 0.24); g.stroke(); }
  { const cx = X(0.556), cy = Y(0.272), r = Y(0.038); g.lineWidth = W * 0.008;   // sync: two arrows round a circle, an x in it
    g.beginPath(); g.arc(cx, cy, r, Math.PI * 1.1, Math.PI * 1.85); g.stroke(); g.beginPath(); g.arc(cx, cy, r, Math.PI * 0.1, Math.PI * 0.85); g.stroke();
    const ah = r * 0.45; for (const [a, s] of [[Math.PI * 1.85, 1], [Math.PI * 0.85, 1]]) { const px = cx + r * Math.cos(a), py = cy + r * Math.sin(a); g.beginPath(); g.moveTo(px - ah * Math.cos(a - 0.6 * s), py - ah * Math.sin(a - 0.6 * s)); g.lineTo(px, py); g.lineTo(px - ah * Math.cos(a + 1.4), py - ah * Math.sin(a + 1.4)); g.stroke(); }
    const k = r * 0.38; g.beginPath(); g.moveTo(cx - k, cy - k); g.lineTo(cx + k, cy + k); g.moveTo(cx + k, cy - k); g.lineTo(cx - k, cy + k); g.stroke(); }
  { const x0 = X(0.773), x1 = X(0.893), y0 = Y(0.24), y1 = Y(0.302); g.lineWidth = W * 0.006;   // battery, three bars
    g.beginPath(); g.roundRect(x0, y0, x1 - x0, y1 - y0, (y1 - y0) * 0.2); g.stroke(); g.fillRect(x1 + W * 0.003, y0 + (y1 - y0) * 0.3, W * 0.008, (y1 - y0) * 0.4);
    const bw = (x1 - x0 - W * 0.024) / 3; for (let k = 0; k < 3; k++) g.fillRect(x0 + W * 0.009 + k * (bw + W * 0.003), y0 + (y1 - y0) * 0.22, bw - W * 0.002, (y1 - y0) * 0.56); }
  drawReading(g, R.value || '', X(0.94), Y(0.332), X(0.285), Y(0.54), X(0.04));
  g.shadowBlur = W * 0.003; g.textAlign = 'right'; g.textBaseline = 'alphabetic';
  g.font = `700 ${Math.round(Y(0.066))}px "Helvetica Neue", Helvetica, Arial, sans-serif`; g.fillText('mg/dL', X(0.975), Y(0.952));
}
// the face's print: glossy white, the LCD window's light grey frame and black panel, the logo in light grey; 2048 px tall
function faceCanvas(logoImg) {
  const { W, H, frame: F, panel: P, logo } = GL, N = 2048, s = N / H, c = document.createElement('canvas'); c.width = Math.round(W * s); c.height = N;
  const g = c.getContext('2d'), X = (x) => (x + W / 2) * s, Y = (y) => (H / 2 - y) * s;
  g.fillStyle = '#f7f7f8'; g.fillRect(0, 0, c.width, N);
  g.fillStyle = '#e2e3e5'; g.beginPath(); g.roundRect(X(F.x0), Y(F.y1), (F.x1 - F.x0) * s, (F.y1 - F.y0) * s, F.r * s); g.fill();
  g.fillStyle = '#060607'; g.beginPath(); g.roundRect(X(F.x0 + P.inset), Y(F.y1 - P.inset), (F.x1 - F.x0 - 2 * P.inset) * s, (F.y1 - F.y0 - 2 * P.inset) * s, P.r * s); g.fill();
  if (logoImg) {   // light grey ink through the logo's mask
    const tw = logo.w / LOGO_INK, th = (tw * LOGO_TEX[1]) / LOGO_TEX[0], m = document.createElement('canvas'); m.width = Math.round(tw * s); m.height = Math.round(th * s);
    const mg = m.getContext('2d'); mg.drawImage(logoImg, 0, 0, m.width, m.height);
    const id = mg.getImageData(0, 0, m.width, m.height); for (let i = 0; i < id.data.length; i += 4) { const a = id.data[i]; id.data[i] = 178; id.data[i + 1] = 179; id.data[i + 2] = 183; id.data[i + 3] = a; }
    mg.putImageData(id, 0, 0); g.drawImage(m, X(-tw / 2), Y(logo.cy + th / 2));
  }
  return c;
}
// the strip's print (its face, from its sample end down): blue, the sample end's window, a white mark, contacts
function stripCanvas() {
  const { strip: S } = GL, L = S.out + S.in, s = 600, c = document.createElement('canvas'); c.width = Math.round(S.w * s); c.height = Math.round(L * s);
  const g = c.getContext('2d'), X = (f) => f * c.width, Y = (cm) => cm * s;
  g.fillStyle = '#1f62d6'; g.fillRect(0, 0, c.width, c.height);
  const gr = g.createLinearGradient(0, 0, c.width, 0); gr.addColorStop(0, 'rgba(0,0,0,0.08)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.06)'); gr.addColorStop(1, 'rgba(0,0,0,0.08)'); g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
  // the sample end: a darker band with the reaction window (a white frame, small dark squares in it)
  g.fillStyle = '#1a4fb0'; g.fillRect(0, 0, c.width, Y(0.28));
  g.fillStyle = '#f2f4f7'; g.fillRect(X(0.3), Y(0.05), X(0.4), Y(0.5));
  g.fillStyle = '#163a2c'; for (let k = 0; k < 4; k++) g.fillRect(X(0.38), Y(0.09 + k * 0.105), X(0.24), Y(0.07));
  // a white mark: two loops, and three small letters running along the strip
  g.strokeStyle = '#ffffff'; g.lineWidth = X(0.07); const mx = X(0.5), my = Y(1.55), r = X(0.14);
  g.beginPath(); g.ellipse(mx, my - r * 0.95, r * 0.8, r, 0, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.ellipse(mx, my + r * 0.95, r * 0.8, r, 0, 0, Math.PI * 2); g.stroke();
  g.save(); g.translate(X(0.5), Y(1.95)); g.rotate(Math.PI / 2); g.fillStyle = '#ffffff'; g.font = `600 ${Math.round(X(0.22))}px "Helvetica Neue", Arial, sans-serif`; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('G T S', 0, 0); g.restore();
  // inside the meter: the contacts
  g.fillStyle = '#b9bdc4'; for (let k = 0; k < 3; k++) g.fillRect(X(0.18 + k * 0.25), Y(S.out + 0.15), X(0.14), Y(S.in - 0.25));
  return c;
}

// ---------------------------------------------------------------- materials
export function createGlucoMaterials(maxAniso = 8) {
  const MM = { reading: { ...GL_PRESETS.normal } };
  const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; return t; };
  MM.faceTex = tex(faceCanvas(null));
  const img = new Image();
  img.onload = () => { MM.faceTex.image = faceCanvas(img); MM.faceTex.needsUpdate = true; MM.onChange?.(); };
  img.src = new URL('./assets/yoga-block-logo.png', import.meta.url).href;
  const { frame: F, panel: P, W, H } = GL, px0 = F.x0 + P.inset, px1 = F.x1 - P.inset, py0 = F.y0 + P.inset, py1 = F.y1 - P.inset;
  const lc = document.createElement('canvas'); lc.width = 1200; lc.height = Math.round((1200 * (py1 - py0)) / (px1 - px0));
  drawLCD(lc, MM.reading); MM.lcdCanvas = lc; MM.lcdTex = tex(lc);
  // the face: glossy white plastic under a clear window; the LCD's light added inside the panel
  MM.face = new THREE.MeshPhysicalMaterial({ map: MM.faceTex, roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 0.25, ior: 1.5 });
  const rect = new THREE.Vector4((px0 + W / 2) / W, (py0 + H / 2) / H, (px1 - px0) / W, (py1 - py0) / H);
  MM.faceU = { uLCD: { value: MM.lcdTex }, uRect: { value: rect }, uGlow: { value: 1.5 } };
  MM.face.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, MM.faceU);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uLCD;\nuniform vec4 uRect;\nuniform float uGlow;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  { vec2 ruv = ( vMapUv - uRect.xy ) / uRect.zw; float inR = step( 0.0, ruv.x ) * step( ruv.x, 1.0 ) * step( 0.0, ruv.y ) * step( ruv.y, 1.0 );
    totalEmissiveRadiance += texture2D( uLCD, clamp( ruv, 0.0, 1.0 ) ).rgb * uGlow * inR; }`);
  };
  MM.face.customProgramCacheKey = () => 'gluco-face-1';
  // the front cap's edge: the same glossy white; the back half satin, a touch greyer (as the side views)
  MM.shell = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#f3f3f5'), roughness: 0.22, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.08, specularIntensity: 0.5 });
  MM.back = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#e9eaec'), roughness: 0.42, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.3, specularIntensity: 0.45, sheen: 0.2, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ffffff') });
  MM.groove = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#b9babd'), roughness: 0.5 });
  MM.ring = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#d9dade'), metalness: 1, roughness: 0.22, side: THREE.DoubleSide });
  MM.cap = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#f7f7f8'), roughness: 0.25, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.1, side: THREE.DoubleSide });
  MM.hole = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#141416'), roughness: 0.7 });
  MM.portIn = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#5c5e63'), roughness: 0.4, metalness: 0.6 });
  const st = tex(stripCanvas());
  MM.strip = new THREE.MeshPhysicalMaterial({ map: st, roughness: 0.3, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.15 });
  MM.stripEdge = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#1b55bd'), roughness: 0.35, clearcoat: 0.4 });
  return MM;
}
export function setGlucoReading(MM, R) { MM.reading = { ...MM.reading, ...R }; drawLCD(MM.lcdCanvas, MM.reading); MM.lcdTex.needsUpdate = true; }

// ---------------------------------------------------------------- the meter
export function buildGlucometer(MM) {
  const { W, H, n, T, rf, rb, part, dome } = GL, grp = new THREE.Group(); grp.name = 'glucometer';
  const body = new THREE.Group(); body.name = 'gl-body'; grp.add(body);
  const add = (name, geo, mat, parent = body) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = true; m.receiveShadow = false; parent.add(m); return m; };
  const N = 320, out = superellipse(W / 2, H / 2, n, N), nrm = normalsOf(out);
  const ring = (off, z) => out.map((p, j) => [p[0] + nrm[j][0] * off, p[1] + nrm[j][1] * off, z]);
  // the face: the outline inset by the edge's radius, crowned a little
  const faceOut = ring(-rf, 0).map(([x, y]) => [x, y]);
  const face = flatFan(faceOut, 0, (x, y) => [(x + W / 2) / W, (y + H / 2) / H]);
  { const P = face.attributes.position, a = W / 2 - rf, b = H / 2 - rf;
    for (let i = 0; i < P.count; i++) { const x = P.getX(i) / a, y = P.getY(i) / b, r = Math.min(1, (Math.abs(x) ** n + Math.abs(y) ** n) ** (1 / n)); P.setZ(i, dome * (1 - r * r)); }
    face.computeVertexNormals(); }
  add('gl-face', face, MM.face);
  // the front cap's edge: a quarter round to the side, down to the parting line
  const cap = [];
  for (let k = 0; k <= 10; k++) { const a = (k / 10) * (Math.PI / 2); cap.push(ring(-rf + rf * Math.sin(a), -rf + rf * Math.cos(a))); }
  for (let k = 1; k <= 3; k++) cap.push(ring(0, -rf + ((part + 0.03 + rf) * k) / 3));
  add('gl-cap', ringMesh(cap, { centre: [0, 0, -T / 2] }), MM.shell);
  // the parting line: a fine groove
  add('gl-groove', ringMesh([ring(0, part + 0.03), ring(-0.035, part + 0.015), ring(-0.035, part - 0.015), ring(0, part - 0.03)], { centre: [0, 0, -T / 2] }), MM.groove);
  // the back half: the side a hair fuller in the middle, then rounding under to the flat back
  const back = [ring(0, part - 0.03)];
  for (let k = 1; k <= 6; k++) { const f = k / 6, z = part - 0.03 - (T - rb + part - 0.03) * f; back.push(ring(0.025 * Math.sin(Math.PI * f), z)); }
  for (let k = 1; k <= 10; k++) { const a = (k / 10) * (Math.PI / 2); back.push(ring(-rb + rb * Math.cos(a), -(T - rb) - rb * Math.sin(a))); }
  add('gl-back', ringMesh(back, { centre: [0, 0, -T / 2] }), MM.back);
  add('gl-backface', flatFan(ring(-rb, -T).map(([x, y]) => [x, y]), -T, null, false), MM.back);
  // the button: the silver ring, a white domed cap inside it (lathes about z)
  { const B = GL.button, lathe = (pts, mat, name) => { const g = new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), 96); g.rotateX(Math.PI / 2); g.translate(0, B.cy, 0); return add(name, g, mat); };
    const zf = (r) => dome * (1 - Math.min(1, ((B.cy / (H / 2 - rf)) ** 2 + 0)) ) * 1.0;   // the face's height there
    const z0 = zf(), rr = [];
    for (let k = 0; k <= 12; k++) { const a = (k / 12) * Math.PI, rm = (B.ro + B.ri) / 2, hw = (B.ro - B.ri) / 2; rr.push([rm - hw * Math.cos(a), z0 + 0.075 * Math.sin(a) ** 0.7]); }
    lathe([[B.ri - 0.02, z0 - 0.05], ...rr, [B.ro + 0.01, z0 - 0.02]].reverse(), MM.ring, 'gl-ring');
    const capPts = [[0.001, z0 + 0.06]]; for (let k = 1; k <= 12; k++) { const f = k / 12; capPts.push([(B.ri - 0.03) * f, z0 + 0.06 - 0.035 * f * f]); } capPts.push([B.ri - 0.02, z0 - 0.04]);
    lathe(capPts, MM.cap, 'gl-btn'); }
  // the strip slot (top edge) and the port (bottom edge): dark rounded openings, a little in from the surface
  { const sl = GL.slot, o = roundRect(sl.w, sl.h, sl.h / 2 - 0.001, 48).map(([a, b]) => [a, b]);
    const top = H / 2, g1 = ringMesh([o.map(([a, b]) => [a, top + 0.002, sl.z + b]), o.map(([a, b]) => [a * 0.9, top - 0.25, sl.z + b * 0.6])], { centre: [0, top - 1, sl.z] });
    add('gl-slot', g1, MM.hole); add('gl-slot-in', flatFan(o.map(([a, b]) => [a * 0.9, b * 0.6]), 0, null).rotateX(-Math.PI / 2).translate(0, top - 0.25, sl.z), MM.hole);
    const po = GL.port, o2 = roundRect(po.w, po.h, po.h / 2 - 0.001, 48), bot = -H / 2;
    add('gl-port', ringMesh([o2.map(([a, b]) => [a, bot - 0.002, po.z + b]), o2.map(([a, b]) => [a, bot + 0.2, po.z + b])], { centre: [0, bot + 1, po.z] }), MM.hole);
    add('gl-port-in', new THREE.BoxGeometry(po.w * 0.62, 0.02, po.h * 0.3).translate(0, bot + 0.1, po.z), MM.portIn); }
  // the strip, in its slot
  { const S = GL.strip, L = S.out + S.in, g = new THREE.BoxGeometry(S.w, L, S.t);
    g.translate(0, H / 2 - S.in + L / 2, GL.slot.z);
    const m = new THREE.Mesh(g, [MM.stripEdge, MM.stripEdge, MM.stripEdge, MM.stripEdge, MM.strip, MM.stripEdge]); m.name = 'gl-strip'; m.castShadow = true;
    // the print on the +z face reads from the sample end (top of the canvas at the top)
    body.add(m); }
  return grp;
}
// upright on its bottom edge, leaning back by lean degrees (forward if negative), or lying on its back; with or
// without the strip
export function poseGlucometer(grp, pose, withStrip = true, lean = 10) {
  const body = grp.getObjectByName('gl-body');
  body.rotation.set(pose === 'lying' ? -Math.PI / 2 : -(lean * Math.PI) / 180, 0, 0);
  body.getObjectByName('gl-strip').visible = withStrip;
  grp.userData.pose = pose;
}
