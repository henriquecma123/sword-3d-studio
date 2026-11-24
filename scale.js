// Sword smart scale: tempered glass on a dark base, four brushed-steel electrodes, a seven-segment reading and the logo
// printed on the glass. Built in code from the product images (Scale/: a top view and a three-quarter view).
// Units: centimetres. Local frame: x to the right, y up, z toward the front (the logo's edge); the scale lies on the
// floor (y = 0 under its feet).
// - Size 30 x 30 cm, corners 2.9 cm (the top view, 828 px across: 27.6 px/cm). Glass 6 mm, a polished pencil edge.
// - Electrodes: 4.5 x 6.0 cm, superellipse outlines, centred at x +/-7.62 and z -8.04 / +8.21; thin stainless plates,
//   brushed along their length (anisotropic highlights).
// - The reading: seven-segment digits 3.1 cm tall, thin bars with rounded ends, drawn from text (adjustable), in a
//   faintly lighter window (light from the glass's own surface there, under its coat), a small Bluetooth mark above its left end; the logo (the 2026 mark, 5.1 cm) near the front.
// - Under the glass: a dark plastic base set well in, and four rounded feet under the corners.
import * as THREE from 'three';

export const SCALE = {
  W: 30, R: 2.9, glass: { y0: 1.4, t: 0.6, rTop: 0.12, rBot: 0.07 },
  base: { inset: 3.0, R: 2.2, y0: 0.42 },
  feet: { r: 1.75, at: 12.1, h: 0.5 },
  electrode: { w: 4.49, h: 5.98, e: 2.5, t: 0.035, x: 7.62, z: [-8.04, 8.21] },
  // the reading, as the display reference (Scale/display-reference.png) draws it, in its pixels (142 px = the digits'
  // 3.08 cm height): see drawReading
  display: { x0: -4.3, x1: 4.55, z0: -14.25, z1: -8.95, digitH: 3.08, right: 3.61, top: -12.79 },
  logo: { w: 5.07, cz: 11.76 },
};
// colours (sRGB): the printed glass, its edge, the steel, the base, the logo's ink, the digits
export const SCALE_COLORS = { glass: '#35383e', window: '#35383e', edge: '#24302f', steel: '#9b9a96', base: '#141518', ink: '#c9cacc', digit: '#ffffff' };
const LOGO_TEX = [3072, 796], LOGO_INK = 0.97907;

// ---------------------------------------------------------------- outlines
function resampleClosed(raw, n) {
  const s = [0]; for (let i = 1; i <= raw.length; i++) { const a = raw[i - 1], b = raw[i % raw.length]; s.push(s[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const L = s[raw.length], out = []; let j = 0;
  for (let k = 0; k < n; k++) {
    const t = (L * k) / n; while (j < raw.length - 1 && s[j + 1] < t) j++;
    const a = raw[j], b = raw[(j + 1) % raw.length], f = (t - s[j]) / Math.max(1e-12, s[j + 1] - s[j]);
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}
function roundSquare(w, h, r, n, inset = 0) {   // (x, z), anticlockwise seen from above (+y)
  const hw = w / 2 - inset, hh = h / 2 - inset, rr = Math.max(0.01, r - inset), raw = [];
  for (const [cx, cz, a0] of [[hw - rr, -hh + rr, -90], [hw - rr, hh - rr, 0], [-hw + rr, hh - rr, 90], [-hw + rr, -hh + rr, 180]])
    for (let k = 0; k < 32; k++) { const a = ((a0 + (90 * k) / 32) * Math.PI) / 180; raw.push([cx + rr * Math.cos(a), cz + rr * Math.sin(a)]); }
  return resampleClosed(raw, n);
}
function superellipse(a, b, e, n, inset = 0, cx = 0, cz = 0) {
  const raw = [];
  for (let k = 0; k < 2000; k++) { const t = (2 * Math.PI * k) / 2000, c = Math.cos(t), s = Math.sin(t); raw.push([(a - inset) * Math.sign(c) * Math.abs(c) ** (2 / e), (b - inset) * Math.sign(s) * Math.abs(s) ** (2 / e)]); }
  return resampleClosed(raw, n).map((p) => [p[0] + cx, p[1] + cz]);
}
// a rounded slab between y0 and y1 (outline(inset) -> points), its top and bottom edges rounded; parts: top, side, bottom
function slab(outline, n, y0, y1, rTop, rBot, { topUV = null } = {}) {
  const rings = [];
  const ring = (inset, y) => outline(inset).map((p) => [p[0], y, p[1]]);
  for (let k = 0; k <= 8; k++) { const a = ((k / 8) * Math.PI) / 2; rings.push(ring(rBot * (1 - Math.sin(a)), y0 + rBot * (1 - Math.cos(a)))); }
  for (let k = 1; k <= 8; k++) { const a = ((k / 8) * Math.PI) / 2; rings.push(ring(rTop * (1 - Math.cos(a)), y1 - rTop + rTop * Math.sin(a))); }
  const side = new THREE.BufferGeometry(), pos = [], idx = [];
  for (const r of rings) for (const p of r) pos.push(...p);
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < n; j++) { const j2 = (j + 1) % n, a = i * n + j, b = (i + 1) * n + j, c = (i + 1) * n + j2, d = i * n + j2; idx.push(a, d, c, a, c, b); }
  side.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); side.setIndex(idx); side.computeVertexNormals();
  const cap = (r, y, up) => {
    const g = new THREE.BufferGeometry(), p2 = [], uv = [], ix = [];
    for (const p of r) { p2.push(p[0], y, p[2]); if (topUV) uv.push(...topUV(p[0], p[2])); }
    const c = r.reduce((s, p) => [s[0] + p[0] / n, s[1] + p[2] / n], [0, 0]); p2.push(c[0], y, c[1]); if (topUV) uv.push(...topUV(c[0], c[1]));
    for (let j = 0; j < n; j++) { const j2 = (j + 1) % n; if (up) ix.push(n, j2, j); else ix.push(n, j, j2); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(p2, 3)); if (topUV) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(ix); g.computeVertexNormals();
    if ((g.attributes.normal.getY(0) > 0) !== up) { const a = g.index.array; for (let k = 0; k < a.length; k += 3) { const t = a[k + 1]; a[k + 1] = a[k + 2]; a[k + 2] = t; } g.computeVertexNormals(); }
    return g;
  };
  // the side's normals outward
  const nrm = side.attributes.normal, mx = rings[0].reduce((s, p) => s + p[0] / n, 0), mz = rings[0].reduce((s, p) => s + p[2] / n, 0);
  let sg = 0; for (let i = 0; i < n; i++) sg += (pos[i * 3] - mx) * nrm.getX(i) + (pos[i * 3 + 2] - mz) * nrm.getZ(i);
  if (sg < 0) { const a = side.index.array; for (let k = 0; k < a.length; k += 3) { const t = a[k + 1]; a[k + 1] = a[k + 2]; a[k + 2] = t; } side.computeVertexNormals(); }
  return { top: cap(rings[rings.length - 1], y1, true), side, bottom: cap(rings[0], y0, false) };
}

// ---------------------------------------------------------------- the print and the reading (canvas textures)
function printCanvas(logoImg) {
  // the glass's print, seen from above: slate, the display window a shade lighter, the logo; 2048 px for 30 cm
  const { W, display: D, logo } = SCALE, N = 2048, s = N / W, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), X = (x) => (x + W / 2) * s, Z = (z) => (z + W / 2) * s;
  g.fillStyle = SCALE_COLORS.glass; g.fillRect(0, 0, N, N);
  g.fillStyle = SCALE_COLORS.window; g.beginPath(); g.roundRect(X(D.x0), Z(D.z0), (D.x1 - D.x0) * s, (D.z1 - D.z0) * s, 0.3 * s); g.fill();
  if (logoImg) {   // the mask is grey (white is ink): tinted through a second canvas
    const tw = logo.w / LOGO_INK, th = (tw * LOGO_TEX[1]) / LOGO_TEX[0], m = document.createElement('canvas');
    m.width = Math.round(tw * s); m.height = Math.round(th * s);
    const mg = m.getContext('2d'); mg.drawImage(logoImg, 0, 0, m.width, m.height);
    const id = mg.getImageData(0, 0, m.width, m.height), ink = new THREE.Color(SCALE_COLORS.ink);
    for (let i = 0; i < id.data.length; i += 4) { const a = id.data[i]; id.data[i] = ink.r * 255; id.data[i + 1] = ink.g * 255; id.data[i + 2] = ink.b * 255; id.data[i + 3] = a; }
    mg.putImageData(id, 0, 0);
    g.drawImage(m, X(-tw / 2), Z(logo.cz - th / 2));
  }
  return c;
}
// The digits as the display reference draws them (Scale/display-reference.png, in its pixels: a digit 142 tall, 68
// wide; bars 8.5 thick with round ends; the horizontal bars sit between the vertical ones, the joints just apart):
// segments a top, b top right, c bottom right, d bottom, e bottom left, f top left, g middle
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', ' ': '' };
const REF = { H: 142, W: 68, bar: 8.5, hx: [10, 58], hy: [4, 71, 138], vx: [4, 63.5], vUp: [9, 65], vLo: [76, 132],
  one: { x: 4, up: [1, 65], lo: [77, 142], adv: 41 }, gap: 24, dp: { w: 7, h: 6, before: 20, after: 21 }, bt: { dx: 2, w: 15, h: 23, above: 45 } };
function drawDigit(g, ch, x, y, k) {   // x, y: the cell's top left, in canvas px; k: canvas px per reference px
  const segs = SEG[ch] ?? '', bar = (x0, y0, x1, y1) => { g.beginPath(); g.moveTo(x + x0 * k, y + y0 * k); g.lineTo(x + x1 * k, y + y1 * k); g.stroke(); };
  const r = REF.bar / 2;   // round ends: each bar's centre line stops half a bar short of its ends
  if (ch === '1') {   // a narrow cell: one bar each half, longer
    bar(REF.one.x, REF.one.up[0] + r, REF.one.x, REF.one.up[1] - r); bar(REF.one.x, REF.one.lo[0] + r, REF.one.x, REF.one.lo[1] - r); return;
  }
  const [hx0, hx1] = REF.hx, [ya, yg, yd] = REF.hy, [xl, xr] = REF.vx;
  if (segs.includes('a')) bar(hx0 + r, ya, hx1 - r, ya);
  if (segs.includes('g')) bar(hx0 + r, yg, hx1 - r, yg);
  if (segs.includes('d')) bar(hx0 + r, yd, hx1 - r, yd);
  if (segs.includes('f')) bar(xl, REF.vUp[0] + r, xl, REF.vUp[1] - r);
  if (segs.includes('b')) bar(xr, REF.vUp[0] + r, xr, REF.vUp[1] - r);
  if (segs.includes('e')) bar(xl, REF.vLo[0] + r, xl, REF.vLo[1] - r);
  if (segs.includes('c')) bar(xr, REF.vLo[0] + r, xr, REF.vLo[1] - r);
}
// the reading's canvas covers the display window; text like "185.0" (digits, one decimal point, a minus), laid out
// from the right as the reference: cells 68 wide 24 apart, a 1 in a narrow cell, the point a small square on the
// baseline with room either side; the Bluetooth mark above the left edge of the second cell from the left of "185.0"
function drawReading(c, text) {
  const { display: D } = SCALE, s = c.width / (D.x1 - D.x0), g = c.getContext('2d');
  const cm = D.digitH / REF.H, k = cm * s;   // canvas px per reference px
  const X = (x) => (x - D.x0) * s, Z = (z) => (z - D.z0) * s;
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);   // black: only the segments give light
  g.strokeStyle = g.fillStyle = SCALE_COLORS.digit; g.lineWidth = REF.bar * k; g.lineCap = 'round';
  g.shadowColor = 'rgba(255,255,255,0.5)'; g.shadowBlur = 5 * k;   // the segments' glow in the glass
  const top = Z(D.top);
  // walk from the right; edge: where the next cell's right edge goes (canvas px). After a digit it is its left edge
  // less the gap; the point and the narrow 1 set their own spacing (the reference's)
  let edge = X(D.right);
  const chars = String(text).slice(0, 8).split('');
  for (let i = chars.length - 1; i >= 0; i--) {
    const ch = chars[i];
    if (ch === '.' || ch === ',') {
      const right = edge + (REF.gap - REF.dp.after) * k, left = right - REF.dp.w * k;
      g.fillRect(left, top + (REF.H - REF.dp.h) * k, REF.dp.w * k, REF.dp.h * k);
      edge = left - REF.dp.before * k; continue;
    }
    if (ch === '1') {   // its bar 33 short of the next cell (as before the 8 in "185.0"), the next 24 beyond its bar
      const centre = edge + (REF.gap - 33 - REF.bar / 2) * k;
      drawDigit(g, '1', centre - REF.one.x * k, top, k);
      edge = centre - (REF.bar / 2 + REF.gap) * k; continue;
    }
    const left = edge - REF.W * k; drawDigit(g, ch in SEG ? ch : ' ', left, top, k); edge = left - REF.gap * k;
  }
  // the Bluetooth mark: fixed, above the second cell of "185.0" (the reference's place for it)
  const bx = X(D.right) - (696 - 427.5) * k, by = top - (REF.bt.above - REF.bt.h / 2) * k;   // its centre: 268.5 left of the last cell's right edge
  const hh = REF.bt.h * k, ww = REF.bt.w * k * 0.42;
  g.lineWidth = 2.6 * k; g.lineJoin = 'round'; g.shadowBlur = 3 * k;
  g.beginPath(); g.moveTo(bx - ww, by - hh * 0.24); g.lineTo(bx + ww, by + hh * 0.22); g.lineTo(bx, by + hh / 2); g.lineTo(bx, by - hh / 2); g.lineTo(bx + ww, by - hh * 0.22); g.lineTo(bx - ww, by + hh * 0.24); g.stroke();
}

// ---------------------------------------------------------------- materials
const STEEL_GLSL = /* glsl */`
float scHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float scNoise( vec2 x ) { vec2 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( scHash( i ), scHash( i + vec2( 1, 0 ) ), f.x ), mix( scHash( i + vec2( 0, 1 ) ), scHash( i + vec2( 1, 1 ) ), f.x ), f.y ); }`;
export function createScaleMaterials(maxAniso = 8) {
  const logoTex = null;
  const SM = { reading: '185.0' };
  // the printed glass: slate under a glossy coat (the colour is printed on its underside, seen through 6 mm of glass)
  const printTex = new THREE.CanvasTexture(printCanvas(null)); printTex.colorSpace = THREE.SRGBColorSpace; printTex.anisotropy = maxAniso;
  SM.printTex = printTex;
  const img = new Image();
  img.onload = () => { printTex.image = printCanvas(img); printTex.needsUpdate = true; SM.onChange?.(); };
  img.src = new URL('./assets/yoga-block-logo.png', import.meta.url).href;
  SM.top = new THREE.MeshPhysicalMaterial({ map: printTex, roughness: 0.32, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.035, specularIntensity: 0.2, ior: 1.52 });   // the coat near a mirror: the studio is now a 1024 px cube of a smooth dome, so no facets or steps show in it
  // the reading: light from under the glass, inside the display window (its canvas drawn on black)
  const D = SCALE.display, W = SCALE.W;
  const rect = new THREE.Vector4(D.x0 / W + 0.5, 1 - (D.z1 / W + 0.5), (D.x1 - D.x0) / W, (D.z1 - D.z0) / W);
  SM.topU = { uReading: { value: null }, uRect: { value: rect }, uGlow: { value: 1.6 } };
  SM.top.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, SM.topU);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uReading;\nuniform vec4 uRect;\nuniform float uGlow;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  {
    vec2 ruv = ( vMapUv - uRect.xy ) / uRect.zw;
    float inR = step( 0.0, ruv.x ) * step( ruv.x, 1.0 ) * step( 0.0, ruv.y ) * step( ruv.y, 1.0 );
    totalEmissiveRadiance += ( texture2D( uReading, clamp( ruv, 0.0, 1.0 ) ).rgb * uGlow + vec3( 0.0015, 0.0016, 0.0018 ) ) * inR;   // and the backlight's faint bleed through the window
  }`);
  };
  SM.top.customProgramCacheKey = () => 'scale-top-1';
  SM.edge = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(SCALE_COLORS.edge), roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, specularIntensity: 1.2, ior: 1.52 });
  // the electrodes: brushed stainless, streaked along their length
  SM.steel = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(SCALE_COLORS.steel), metalness: 1, roughness: 0.52, anisotropy: 0.85, anisotropyRotation: Math.PI / 2 });
  SM.steel.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vScObj;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvScObj = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vScObj;\n' + STEEL_GLSL)
      .replace('#include <map_fragment>', `#include <map_fragment>
  float scBr = scNoise( vec2( vScObj.x * 260.0, vScObj.z * 3.0 ) ) * 0.6 + scNoise( vec2( vScObj.x * 900.0, vScObj.z * 9.0 ) ) * 0.4;
  diffuseColor.rgb *= 0.82 + 0.36 * scBr;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = clamp( roughnessFactor * ( 0.8 + 0.45 * scBr ), 0.05, 1.0 );');
  };
  SM.steel.customProgramCacheKey = () => 'scale-steel-1';
  SM.steelEdge = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(SCALE_COLORS.steel), metalness: 1, roughness: 0.22 });
  SM.base = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(SCALE_COLORS.base), roughness: 0.55, metalness: 0, specularIntensity: 0.4, sheen: 0.2, sheenRoughness: 0.6, sheenColor: new THREE.Color('#555') });
  SM.feet = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#0f1012'), roughness: 0.7, metalness: 0, specularIntensity: 0.3 });
  // the reading: light only (added over the glass), its canvas redrawn when the text changes
  const rc = document.createElement('canvas'); rc.width = 1400; rc.height = Math.round((1400 * (SCALE.display.z1 - SCALE.display.z0)) / (SCALE.display.x1 - SCALE.display.x0));
  drawReading(rc, SM.reading);
  SM.readingCanvas = rc; SM.readingTex = new THREE.CanvasTexture(rc); SM.readingTex.colorSpace = THREE.SRGBColorSpace; SM.readingTex.anisotropy = maxAniso;
  SM.topU.uReading.value = SM.readingTex;
  return SM;
}
export function setScaleReading(SM, text) {
  SM.reading = text; drawReading(SM.readingCanvas, text); SM.readingTex.needsUpdate = true;
}

// ---------------------------------------------------------------- the scale
export function buildScale(SM) {
  const { W, R, glass: G, base: B, feet: Ft, electrode: E, display: D } = SCALE, grp = new THREE.Group(); grp.name = 'scale';
  const add = (name, geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = cast; m.receiveShadow = false; grp.add(m); return m; };
  const y1 = G.y0 + G.t, n = 480;
  const gl = slab((d) => roundSquare(W, W, R, n, d), n, G.y0, y1, G.rTop, G.rBot, { topUV: (x, z) => [x / W + 0.5, 1 - (z / W + 0.5)] });
  add('glass-top', gl.top, SM.top); add('glass-edge', gl.side, SM.edge); add('glass-under', gl.bottom, SM.edge);
  // the electrodes: thin plates standing proud of the glass, their edges eased
  for (const sx of [-1, 1]) for (const cz of E.z) {
    const p = slab((d) => superellipse(E.w / 2, E.h / 2, E.e, 240, d, sx * E.x, cz), 240, y1 - 0.004, y1 + E.t, 0.012, 0.0, { topUV: (x, z) => [x, z] });
    add('electrode', p.top, SM.steel); add('electrode-edge', p.side, SM.steelEdge);
  }
  // the base under the glass and the feet under its corners
  const b = slab((d) => roundSquare(W - 2 * B.inset, W - 2 * B.inset, B.R, 240, d), 240, B.y0, G.y0 + 0.001, 0.02, 0.25);
  add('base', b.side, SM.base); add('base-under', b.bottom, SM.base);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const circ = (d) => Array.from({ length: 96 }, (_, i) => { const a = (2 * Math.PI * i) / 96; return [sx * Ft.at + (Ft.r - d) * Math.cos(a), sz * Ft.at + (Ft.r - d) * Math.sin(a)]; }).reverse();
    const f = slab(circ, 96, 0, G.y0 + 0.001, 0.02, 0.18);
    add('foot', f.side, SM.feet); add('foot-under', f.bottom, SM.feet);
  }
  return grp;
}
