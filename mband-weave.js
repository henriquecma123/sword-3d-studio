// The M-Band's surfaces, drawn once at load: colour, relief (a normal map), roughness, ambient occlusion (the dark
// gaps between the yarns) and anisotropy (the yarn's sheen, stretched along its fibres). Units: centimetres.
// Matched to close-ups of the product photos:
// - The woven strap (a repeating tile): plump, glossy grey yarn floats, arched, 2.2 mm long, along the strap, in rows
//   2.4 mm apart, 26 across, touching their neighbours and leaning alternately, each a twisted ply (fine diagonal
//   grooves); between them, only dark gaps and a little of the dark diagonal base weave; a braided rope edge each side.
// - The tip (face A, its last 1.9 W): a fine dotted knit with the four hook patches, lighter and covered in hooks.
// - The pod's sensor panel: the two white dots, the red optical windows and the round disc (the bottom photo).
// - The plastics' grain: a fine, soft-touch texture that breaks up their highlights.
import * as THREE from 'three';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function rng(seed) {   // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// a separable box blur (wrapping or clamped), twice: close to a gaussian
function blur(H, nx, ny, r, wrap) {
  const pass = (src, horiz) => {
    const out = new Float32Array(src.length), n = horiz ? nx : ny, m = horiz ? ny : nx;
    for (let a = 0; a < m; a++) {
      let s = 0; const at = (b) => { if (wrap) b = ((b % n) + n) % n; else b = Math.min(n - 1, Math.max(0, b)); return horiz ? src[a * nx + b] : src[b * nx + a]; };
      for (let b = -r; b <= r; b++) s += at(b);
      for (let b = 0; b < n; b++) { out[horiz ? a * nx + b : b * nx + a] = s / (2 * r + 1); s += at(b + r + 1) - at(b - r); }
    }
    return out;
  };
  return pass(pass(pass(pass(H, true), false), true), false);
}

// per pixel: height H (0..1, `depth` cm at 1), colour C (sRGB 0..255), roughness R, anisotropy strength A (or none) ->
// textures. Columns run along the strap (texture u), rows across it (v); flipY is off, so row j is v = j / ny. The
// ambient occlusion comes from the height: how far a pixel lies below its surroundings (aoR cm round)
function toTextures(nx, ny, H, C, R, A, du, dv, depth, wrap, maxAniso, aoR = 0.025, aoK = 3, aoInColour = 0.45, D = null) {
  const canvas = (fill) => {
    const c = document.createElement('canvas'); c.width = nx; c.height = ny;
    const g = c.getContext('2d'), im = g.createImageData(nx, ny); fill(im.data); g.putImageData(im, 0, 0); return c;
  };
  const h = (i, j) => {
    if (wrap) { i = (i + nx) % nx; j = (j + ny) % ny; } else { i = Math.min(nx - 1, Math.max(0, i)); j = Math.min(ny - 1, Math.max(0, j)); }
    return H[j * nx + i];
  };
  const Hb = blur(H, nx, ny, Math.max(1, Math.round(aoR / du)), wrap), AO = new Float32Array(nx * ny);
  for (let k = 0; k < AO.length; k++) AO[k] = Math.min(1, Math.max(0.12, 1 - aoK * Math.max(0, Hb[k] - H[k])));
  const colour = canvas((d) => { for (let k = 0; k < nx * ny; k++) { const o = 1 - aoInColour * (1 - AO[k]); d[4 * k] = C[3 * k] * o; d[4 * k + 1] = C[3 * k + 1] * o; d[4 * k + 2] = C[3 * k + 2] * o; d[4 * k + 3] = 255; } });
  const normal = canvas((d) => {
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const gx = ((h(i + 1, j) - h(i - 1, j)) * depth) / (2 * du), gy = ((h(i, j + 1) - h(i, j - 1)) * depth) / (2 * dv);
      const l = Math.hypot(gx, gy, 1), k = j * nx + i;
      d[4 * k] = 128 - (127 * gx) / l; d[4 * k + 1] = 128 - (127 * gy) / l; d[4 * k + 2] = 128 + 127 / l; d[4 * k + 3] = 255;
    }
  });
  const grey = (V) => canvas((d) => { for (let k = 0; k < nx * ny; k++) { d[4 * k] = d[4 * k + 1] = d[4 * k + 2] = 255 * V[k]; d[4 * k + 3] = 255; } });
  const tex = (c, srgb) => {
    const t = new THREE.CanvasTexture(c); t.flipY = false; t.anisotropy = maxAniso;
    t.wrapS = t.wrapT = wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t;
  };
  const out = { map: tex(colour, true), normalMap: tex(normal, false), roughnessMap: tex(grey(R), false), aoMap: tex(grey(AO), false) };
  // anisotropy: its direction (tangent space; along the strap unless given per pixel, D), its strength per pixel
  if (A) out.anisotropyMap = tex(canvas((d) => { for (let k = 0; k < nx * ny; k++) { d[4 * k] = D ? 127.5 + 127.5 * D[2 * k] : 255; d[4 * k + 1] = D ? 127.5 + 127.5 * D[2 * k + 1] : 128; d[4 * k + 2] = 255 * A[k]; d[4 * k + 3] = 255; } }), false);
  return out;
}

// the main weave, between the braided edges: the loop side of a hook-and-loop fabric (the photos' close-ups). Thin,
// glossy, light grey yarn loops, about 56 across the strap in rows 2.4 mm apart, over a darker basket weave of flat
// diagonal tapes. A tile two rows long (TA) and a quarter of the woven width across (TC), repeated.
// The loops stand up off the base: seen at an angle each looks like an arc, all bowed alike; seen square on, a short
// straight dash, a little slanted (the top photo). Both are drawn, of the same loops (slant), and the strap's material
// blends from one to the other with the view (mband.js)
export function weaveTextures(maxAniso, Wl, slant = false) {
  const pcOf = (x) => Math.min(1, x * 1.4);
  const ROWS = 2, NL = 14, TA = 0.48, TC = Wl / 4, PX = 1000;
  const nx = Math.round(TA * PX), ny = Math.round(TC * PX), du = TA / nx, dv = TC / ny, N = nx * ny;
  const rowP = TA / ROWS, pitch = TC / NL, rnd = rng(23), loops = [];
  for (let r = 0; r < ROWS; r++) for (let k = 0; k < NL; k++) {
    loops.push({ u: (r + 0.5) * rowP + (rnd() - 0.5) * 0.02, v: (k + 0.5 + 0.5 * r + (rnd() - 0.5) * 0.35) * pitch,
      L: rowP * (0.64 + 0.12 * rnd()), bow: -(0.022 + 0.012 * rnd()), rs: 0.0062 + 0.0018 * rnd(), b: 0.82 + 0.34 * rnd(), ph: rnd(), sl: 0.14 + 0.08 * rnd() });
  }
  const H = new Float32Array(N), C = new Uint8ClampedArray(3 * N), R = new Float32Array(N), A = new Float32Array(N), D = new Float32Array(2 * N);
  const P1 = TA / 8, P2 = TC / Math.round(TC / 0.06);   // the base's tapes: one family each way, tiling the tile
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const u = (i + 0.5) * du, v = (j + 0.5) * dv, k = j * nx + i;
    // the base: two families of flat diagonal tapes, over and under each other in turn
    const p = u / P1 + v / P2, q = u / P1 - v / P2, fp = p - Math.floor(p), fq = q - Math.floor(q);
    const onP = Math.abs(fp - 0.5) < 0.4, onQ = Math.abs(fq - 0.5) < 0.4, pTop = ((Math.floor(p) + Math.floor(q)) & 1) === 0;
    let hgt = 0, col = 24, ro = 0.7, an = 0.1, dx = 1, dy = 0;
    const tape = (f) => Math.sqrt(Math.max(0, 1 - ((f - 0.5) / 0.4) ** 2));
    if (onP && (pTop || !onQ)) { hgt = 0.16 + 0.1 * tape(fp); col = 58 + 18 * tape(fp); ro = 0.55; }
    else if (onQ) { hgt = 0.16 + 0.1 * tape(fq); col = 55 + 18 * tape(fq); ro = 0.55; }
    // the loops: each a thin strand bowed sideways, rising out of the base and back in
    let best = 0, bl = null, bt = 0, bsl = 0;
    for (const l of loops) {
      let x = u - l.u; x -= TA * Math.round(x / TA); if (Math.abs(x) >= l.L / 2) continue;
      let y = v - l.v; y -= TC * Math.round(y / TC);
      const bw = slant ? 0.15 * l.bow : l.bow, sl = slant ? l.sl : 0;
      const f = (2 * x) / l.L, c = bw * (1 - f * f) + sl * x, slope = (-4 * bw * f) / l.L + sl, dd = (y - c) / Math.sqrt(1 + slope * slope);
      if (Math.abs(dd) >= l.rs) continue;
      const pc = Math.sqrt(1 - (dd / l.rs) ** 2), pa = Math.pow(Math.cos((f * Math.PI) / 2), 0.6), hh = pc * pa;   // rising out of the base and back, round across
      if (hh > best) { best = hh; bl = l; bt = x; bsl = slope; }
    }
    if (bl) {
      hgt = Math.max(hgt, 0.3 + 0.7 * best); col = (slant ? 104 + 40 * pcOf(best) : 86 + 34 * pcOf(best)) * bl.b; ro = 0.35; an = 1;   // (square on, a loop's top faces you: lighter)
      const l2 = Math.hypot(1, bsl); dx = 1 / l2; dy = bsl / l2;
    }
    H[k] = hgt; C[3 * k] = col; C[3 * k + 1] = col * 1.012; C[3 * k + 2] = col * 1.05; R[k] = ro; A[k] = an; D[2 * k] = dx; D[2 * k + 1] = dy;
  }
  return { ...toTextures(nx, ny, H, C, R, A, du, dv, 0.03, true, maxAniso, 0.012, 2.4, 0.35, D), TA, TC };
}

// the strap's two edges: a round braided cord. A strip the strap's whole width across (only its edges are used: from
// |v| = from to the rim), 2.4 mm along, repeated along the strap
export function edgeTextures(maxAniso, W, from, to) {
  const TA = 0.24, PX = 900, span = 2 * to, nx = Math.round(TA * PX), ny = Math.round(span * PX), du = TA / nx, dv = span / ny, N = nx * ny;
  const H = new Float32Array(N), C = new Uint8ClampedArray(3 * N), R = new Float32Array(N), A = new Float32Array(N), D = new Float32Array(2 * N);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const u = (i + 0.5) * du, b = (j + 0.5) * dv - to, k = j * nx + i, e = Math.abs(b) - from, w = to - from;
    // strands slanting across the cord, one way on each side, each round; the cord darker towards its middle line
    const sg = b < 0 ? -1 : 1, ph = u / 0.06 + sg * (e / 0.05), f = ph - Math.floor(ph), st = Math.sqrt(Math.max(0, 1 - ((f - 0.5) / 0.46) ** 2));
    const across = Math.sin(Math.PI * Math.min(1, Math.max(0, e / w)));
    H[k] = 0.25 + 0.6 * st; const col = (40 + 62 * st) * (0.82 + 0.18 * across);
    C[3 * k] = col; C[3 * k + 1] = col * 1.012; C[3 * k + 2] = col * 1.05; R[k] = 0.42 + 0.2 * (1 - st); A[k] = 0.6;
    const l = Math.hypot(0.05, sg * 0.06); D[2 * k] = 0.05 / l; D[2 * k + 1] = (sg * 0.06) / l;   // along the strands
  }
  return { ...toTextures(nx, ny, H, C, R, A, du, dv, 0.03, true, maxAniso, 0.012, 2, 0.3, D), TA, span };
}

// the tip's face A, from where its fine weave starts (u = 0) to the end (u = len), across from -W/2 (v = 0) to W/2;
// patches: the hook patches' centres (cm from u = 0), each pw along by ph across, with round ends
export function tipTextures(maxAniso, W, len, patches, pw, ph) {
  const PX = 300, nx = Math.round(len * PX), ny = Math.round(W * PX), du = len / nx, dv = W / ny, N = nx * ny;
  const H = new Float32Array(N), C = new Uint8ClampedArray(3 * N), R = new Float32Array(N), A = new Float32Array(N);
  const rr = pw / 2, seg = ph / 2 - rr, HP = 0.07, KP = 0.045;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const u = (i + 0.5) * du, b = (j + 0.5) * dv - W / 2, k = j * nx + i, e = W / 2 - Math.abs(b);
    // the fine knit: a close, staggered grid of little loops; the braided edges as on the rest of the strap
    const kr = Math.floor(b / KP), ku = (u / KP + (kr & 1) * 0.5) % 1, kv = b / KP - kr, m = smooth(0.48, 0.12, Math.hypot(ku - 0.5, (kv - 0.5) * 1.3));
    let hgt = 0.15 + 0.55 * m, col = 66 + 30 * m, ro = 0.62 - 0.12 * m, an = 0.2;
    if (e < 0.11) { const c = 0.5 + 0.5 * Math.cos(2 * Math.PI * (u / 0.055 + Math.sign(b) * (e / 0.04))), pr = Math.sqrt(Math.sin((Math.PI * e) / 0.11)); hgt = 0.2 + 0.7 * pr * (0.55 + 0.45 * c); col = (44 + 40 * c) * (0.75 + 0.25 * pr); ro = 0.5; an = 0.35; }
    for (const pu of patches) {
      const dd = Math.hypot(u - pu, Math.max(0, Math.abs(b) - seg)) - rr; if (dd > 0.02) continue;
      const inside = smooth(0.02, -0.02, dd);
      const row = Math.floor(b / HP), hu = (u / HP + (row & 1) * 0.5) % 1, hv = b / HP - row;
      const hook = smooth(0.4, 0.18, Math.hypot(hu - 0.5, (hv - 0.5) * 0.8));   // the hooks: a staggered grid of small dark loops
      hgt += (0.7 + 0.25 * (1 - hook) - hgt) * inside; col += (114 - 46 * hook - col) * inside; ro += (0.6 - ro) * inside; an *= 1 - inside;
    }
    H[k] = hgt; C[3 * k] = col; C[3 * k + 1] = col * 1.012; C[3 * k + 2] = col * 1.055; R[k] = ro; A[k] = an;
  }
  return toTextures(nx, ny, H, C, R, A, du, dv, 0.035, false, maxAniso, 0.015, 1.0, 0.15);
}

// the plastics' soft-touch grain: a tiling normal map of fine noise
export function grainTexture(maxAniso) {
  const n = 256, H = new Float32Array(n * n), rnd = rng(5);
  for (let k = 0; k < H.length; k++) H[k] = rnd();
  const Hb = blur(H, n, n, 1, true), C = new Uint8ClampedArray(3 * n * n).fill(128), R = new Float32Array(n * n).fill(0.5);
  const T = toTextures(n, n, Hb, C, R, null, 1, 1, 0.6, true, maxAniso, 1, 0, 0);
  return T.normalMap;
}

// the sensor panel (plL x plW cm): u along the pod from its ring end, v across. Its colour; roughness; relief (the
// windows and the disc set into it, the dots standing up a little); where it is glass (a clear coat: the windows and
// the disc); and the dots' faint glow
export function sensorTextures(maxAniso, plL, plW, base) {
  const nx = 1024, ny = Math.round((nx * plW) / plL), s = nx / plL;
  const X = (x) => (x + plL / 2) * s, Y = (y) => (y + plW / 2) * s;
  const draw = (paint) => { const c = document.createElement('canvas'); c.width = nx; c.height = ny; paint(c.getContext('2d')); return c; };
  const shapes = (g, pick) => {   // pick(part) -> the fill for that part (or null: leave it)
    const rect = (x0, x1, h, fill) => { if (!fill) return; g.fillStyle = fill; g.beginPath(); g.roundRect(X(x0), Y(-h), (x1 - x0) * s, 2 * h * s, 0.03 * s); g.fill(); };
    const disc = (x, y, r, fill) => { if (!fill) return; g.fillStyle = fill; g.beginPath(); g.arc(X(x), Y(y), r * s, 0, 2 * Math.PI); g.fill(); };
    for (const y of [-0.15, 0.15]) disc(-1.12, y, 0.1, pick('dot'));
    for (const [x0, x1] of [[-0.81, -0.46], [-0.09, 0.53]]) rect(x0, x1, 0.2, pick('window', x0, x1));
    rect(-0.37, -0.21, 0.2, pick('divider'));
    disc(1.04, 0, 0.235, pick('discRim')); disc(1.04, 0, 0.19, pick('disc'));
  };
  // the windows: deep red glass set into the panel, its frame shading the top of each; the second with its dark end
  const windowFill = (g, x0, x1) => {
    const gr = g.createLinearGradient(0, Y(-0.2), 0, Y(0.2)); gr.addColorStop(0, '#5e3034'); gr.addColorStop(0.16, '#a1636a'); gr.addColorStop(0.5, '#b27a80'); gr.addColorStop(1, '#7d464b');
    return gr;
  };
  const map = draw((g) => {
    g.fillStyle = base; g.fillRect(0, 0, nx, ny);
    shapes(g, (part, x0, x1) => part === 'dot' ? '#f4f4f2' : part === 'window' ? windowFill(g, x0, x1) : part === 'divider' ? '#2c2d31' : part === 'discRim' ? '#3a3b3f' : '#202125');
    g.fillStyle = '#1e1f23'; g.beginPath(); g.roundRect(X(0.28), Y(-0.2), 0.25 * s, 0.4 * s, 0.03 * s); g.fill();   // the second window's dark end
    g.strokeStyle = 'rgba(20,20,24,0.55)'; g.lineWidth = 0.012 * s;                                                  // a fine dark frame round each window
    for (const [x0, x1] of [[-0.81, -0.46], [-0.09, 0.53]]) { g.beginPath(); g.roundRect(X(x0), Y(-0.2), (x1 - x0) * s, 0.4 * s, 0.03 * s); g.stroke(); }
  });
  const rough = draw((g) => { g.fillStyle = '#808080'; g.fillRect(0, 0, nx, ny); shapes(g, (part) => part === 'window' ? '#1a1a1a' : part === 'disc' ? '#3a3a3a' : part === 'dot' ? '#707070' : null); });
  const coat = draw((g) => { g.fillStyle = '#000'; g.fillRect(0, 0, nx, ny); shapes(g, (part) => part === 'window' || part === 'disc' ? '#fff' : part === 'discRim' ? '#555' : null); });
  const glow = draw((g) => { g.fillStyle = '#000'; g.fillRect(0, 0, nx, ny); shapes(g, (part) => part === 'dot' ? '#fff' : null); });
  const relief = draw((g) => { g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, nx, ny); shapes(g, (part) => part === 'window' ? '#5a5a5a' : part === 'discRim' ? '#4a4a4a' : part === 'disc' ? '#8a8a8a' : part === 'dot' ? '#ffffff' : null); });
  // the relief as a normal map: set in 0.15 mm, its edges softened a little
  const R = relief.getContext('2d').getImageData(0, 0, nx, ny).data, H = new Float32Array(nx * ny);
  for (let k = 0; k < H.length; k++) H[k] = R[4 * k] / 255;
  const Hb = blur(H, nx, ny, 2, false), d = 0.015, px = plL / nx;
  const nrm = draw((g) => {
    const im = g.createImageData(nx, ny), D = im.data, h = (i, j) => Hb[Math.min(ny - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const gx = ((h(i + 1, j) - h(i - 1, j)) * d) / (2 * px), gy = ((h(i, j + 1) - h(i, j - 1)) * d) / (2 * px), l = Math.hypot(gx, gy, 1), k = j * nx + i;
      D[4 * k] = 128 - (127 * gx) / l; D[4 * k + 1] = 128 - (127 * gy) / l; D[4 * k + 2] = 128 + 127 / l; D[4 * k + 3] = 255;
    }
    g.putImageData(im, 0, 0);
  });
  const tex = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.flipY = false; t.anisotropy = maxAniso; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t; };
  return { map: tex(map, true), roughnessMap: tex(rough, false), normalMap: tex(nrm, false), clearcoatMap: tex(coat, false), emissiveMap: tex(glow, true) };
}
