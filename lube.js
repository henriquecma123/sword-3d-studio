// The lubricant sachets (Women's Health): single-use stick packs of personal lubricant, built in code from their
// product photo (lube-offline/ref/sachets-in-hand.webp). One, two or three of them, with real physics: drop them,
// pick one up and it follows your hand smoothly, drooping a little, push one into another and it shoves it (cannon-es).
//
// A sachet: a blue satin foil tube, flattened and filled with gel, sealed across both ends and down the back (a fin
// seal folded flat to one side). The top is die-cut: a tear-off head tab over a V notch on each side, a neck, then
// shoulders out to the body. The seals are crimped with a fine diamond knurl; the gel reaches up through the neck into
// the head as a rounded bump. Where the filled tube flattens into the seals the foil creases.
//
// Units: cm (the studio's). Sachet frame: x across, y along (+y the head), z through (+z the front).
import * as THREE from 'three';
import * as CANNON from './vendor/cannon-es.js';

// ---------------------------------------------------------------- the shape (mm, measured off the photo)
// The photo's body is 340 px across and 1220 px long; at 0.1176 mm a pixel that is 40 x 143.5 mm.
const MM = 0.1;
const LEN = 143.5;               // mm, top of the head tab to the bottom edge
const BODY = 20;                 // mm, the body's half width
const HEAD = 12.8;               // the head tab's half width
const T_HALF = 2.75;             // mm, half the filled body's thickness
const FILM = 0.08;               // mm, half a seal's thickness (two films pressed together)
export const SACHET = { W: 2 * BODY * MM, L: LEN * MM, T: 2 * T_HALF * MM };

// the right half of the die-cut outline, from the top down: [x, y (mm from the top), corner radius]
const OUTLINE = [
  [0, 0, 0], [HEAD, 0, 2.0], [HEAD, 8.5, 0.8], [9.6, 11.6, 0.7], [14.1, 16.5, 0.6], [BODY, 17.9, 1.6],
  [BODY, LEN, 1.4], [0, LEN, 0],
];
// where the gel can go (inside: everything else is seal): the body between the seals, a channel up the neck and a
// rounded bump into the head. The top seal's edge runs from the body's sides (23.5 mm down) up to the channel
const GEL_TOP_SIDE = 24, CH = 5.0, CH_TOP = 11.7, CH_FOOT = 17.4, GEL_BOTTOM = 136.4;

// a polyline's corners rounded (each vertex's radius), as points
function rounded(pts, seg = 10) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, y, r] = pts[i];
    if (!r || i === 0 || i === pts.length - 1) { out.push([x, y]); continue; }
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i + 1];
    let ux = ax - x, uy = ay - y, vx = bx - x, vy = by - y;
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy); ux /= lu; uy /= lu; vx /= lv; vy /= lv;
    const ang = Math.acos(Math.max(-1, Math.min(1, ux * vx + uy * vy))), t = Math.min(r / Math.tan(ang / 2), lu * 0.45, lv * 0.45);
    const p0 = [x + ux * t, y + uy * t], p1 = [x + vx * t, y + vy * t];
    // the arc's centre: along the bisector
    let bxx = ux + vx, byy = uy + vy; const lb = Math.hypot(bxx, byy); bxx /= lb; byy /= lb;
    const rr = t * Math.tan(ang / 2), dc = rr / Math.sin(ang / 2), cx = x + bxx * dc, cy = y + byy * dc;
    let a0 = Math.atan2(p0[1] - cy, p0[0] - cx), a1 = Math.atan2(p1[1] - cy, p1[0] - cx);
    let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    for (let k = 0; k <= seg; k++) { const a = a0 + da * (k / seg); out.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); }
  }
  return out;
}
// the half width at y: the outline as a function of y (it never turns back up)
const EDGE = (() => {
  const p = rounded(OUTLINE).slice(1, -1);   // (without the centre points: the first row is the top edge, the last the bottom)
  for (let i = 1; i < p.length; i++) if (p[i][1] < p[i - 1][1]) p[i][1] = p[i - 1][1];
  return p;
})();
function halfWidth(y) {
  if (y <= EDGE[0][1]) return EDGE[0][0];
  for (let i = 1; i < EDGE.length; i++) {
    const [x0, y0] = EDGE[i - 1], [x1, y1] = EDGE[i];
    if (y <= y1) return y1 - y0 < 1e-9 ? Math.max(x0, x1) : x0 + (x1 - x0) * ((y - y0) / (y1 - y0));
  }
  return EDGE[EDGE.length - 1][0];
}

// the gel's outline (closed, mm): its sides run out past the sachet's (the body's sides are folds, not seals)
const GEL = (() => {
  const k = (GEL_TOP_SIDE - CH_FOOT) / (BODY - CH), far = 26;
  const pts = [[-far, GEL_TOP_SIDE + (far - BODY) * k, 0], [-CH, CH_FOOT, 1.6]];
  // up the channel and round its top
  pts.push([-CH, CH_TOP, 0]);
  for (let i = 1; i < 12; i++) { const a = Math.PI + (Math.PI * i) / 12; pts.push([CH * Math.cos(a), CH_TOP + CH * Math.sin(a), 0]); }
  pts.push([CH, CH_TOP, 0], [CH, CH_FOOT, 1.6], [far, GEL_TOP_SIDE + (far - BODY) * k, 0], [far, GEL_BOTTOM, 0], [-far, GEL_BOTTOM, 0]);
  const r = rounded([[pts[pts.length - 1][0], pts[pts.length - 1][1], 0], ...pts, [pts[0][0], pts[0][1], 0]]);
  return r.slice(1, -1);
})();
// signed distance to the gel's outline: + inside (mm)
function gelDist(x, y) {
  let d = Infinity, inside = false;
  for (let i = 0, j = GEL.length - 1; i < GEL.length; j = i++) {
    const [xi, yi] = GEL[i], [xj, yj] = GEL[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    const ex = xj - xi, ey = yj - yi, t = Math.max(0, Math.min(1, ((x - xi) * ex + (y - yi) * ey) / (ex * ex + ey * ey)));
    d = Math.min(d, Math.hypot(x - xi - ex * t, y - yi - ey * t));
  }
  return inside ? d : -d;
}

// ---------------------------------------------------------------- creases
// a small seeded random
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// where the filled tube flattens into the seals the foil folds: valleys running off the seals into the body. Each:
// from p0 (mm) along a direction, its depth fading along it
function creasesFor(seed) {
  const R = rng(seed), C = [], L = (a, b) => a + (b - a) * R();
  const add = (x, y, angDeg, len, depth, width) => { const a = angDeg * Math.PI / 180; C.push({ x, y, dx: Math.sin(a), dy: Math.cos(a), len, depth, width }); };
  // under the neck: one down the middle, a few fanning out from where the channel opens into the body
  // the tongue of gel up the neck runs on into the body as a soft ridge: a valley down each side of it
  for (const s of [-1, 1]) add(s * L(5.6, 6.6), L(15.5, 17), s * L(-6, 4), L(9, 15), L(0.3, 0.45), L(0.9, 1.3));
  for (const s of [-1, 1]) {
    add(s * L(5, 7.5), L(17.5, 19.5), s * L(24, 42), L(12, 22), L(0.25, 0.4), L(1.0, 1.6));
    if (R() < 0.75) add(s * L(8, 12), L(19, 21), s * L(40, 62), L(7, 12), L(0.18, 0.3), L(0.8, 1.2));
    add(s * L(16, 19), L(22, 24), s * L(-10, 15), L(5, 9), L(0.15, 0.28), L(0.7, 1.1));   // at the shoulder's corner
  }
  // off the bottom seal, short ones
  const nB = 4 + Math.floor(R() * 3);
  for (let i = 0; i < nB; i++) add(L(-17, 17), GEL_BOTTOM - 0.2, 180 + L(-28, 28), L(4, 9), L(0.18, 0.34), L(0.7, 1.2));
  // and a long, soft one or two across the body (the gel not quite even)
  for (let i = 0; i < 4; i++) add(L(-14, 14), L(26, 110), L(-40, 40) + (R() < 0.5 ? 180 : 0), L(18, 45), L(0.07, 0.16), L(2.2, 4.5));
  return { C, ph: [L(0, 6.3), L(0, 6.3), L(0, 6.3)], k: [L(0.05, 0.09), L(0.03, 0.06)] };
}
function creaseAt(W, x, y) {
  let s = 0;
  for (const c of W.C) {
    const px = x - c.x, py = y - c.y, t = px * c.dx + py * c.dy;
    if (t < 0 || t > c.len) continue;
    const n = px * c.dy - py * c.dx;
    const u = Math.min(1, t / 4), fade = u * u * u * (u * (u * 6 - 15) + 10) * Math.pow(1 - t / c.len, 1.4);   // (coming in smoothly over its first 4 mm: a sudden start, or a ramp's end, showed as a line)
    s += c.depth * fade * Math.exp(-(n * n) / (c.width * c.width));
  }
  // the broad unevenness of a pouch filled by hand
  s += 0.09 * Math.sin(x * W.k[0] + y * 0.031 + W.ph[0]) * Math.sin(y * W.k[1] + W.ph[1]);
  return s;
}

// ---------------------------------------------------------------- the mesh
// rows down the length (closer through the head, the notches and the shoulders), columns across (closer at the folds)
function rowsY() {
  const ys = new Set();
  for (let y = 0; y <= LEN + 1e-6; y += 0.5) ys.add(+y.toFixed(3));
  for (let y = 0; y <= 26; y += 0.16) ys.add(+y.toFixed(3));
  for (let y = GEL_BOTTOM - 4; y <= LEN; y += 0.2) ys.add(+y.toFixed(3));
  for (const [, y] of EDGE) ys.add(+y.toFixed(3));
  ys.add(LEN);
  const a = [...ys].filter((y) => y >= 0 && y <= LEN).sort((p, q) => p - q), out = [a[0]];
  for (let i = 1; i < a.length; i++) if (a[i] - out[out.length - 1] > 0.06) out.push(a[i]);
  if (out[out.length - 1] !== LEN) out[out.length - 1] = LEN;
  return out;
}
const NCOL = 81;
const colS = (j) => Math.sin((Math.PI / 2) * (j / (NCOL - 1) * 2 - 1));

// how far a sachet's gel puffs it out at (x, y) (mm, one face), and how much of it is seal (0..1)
const circ = (u) => (u >= 1 ? 1 : u <= 0 ? 0 : Math.sqrt(1 - (1 - u) * (1 - u)));
const para = (u) => (u >= 1 ? 1 : u <= 0 ? 0 : 1 - (1 - u) * (1 - u));
function puff(x, y, w) {
  const d = gelDist(x, y);
  if (d <= 0) return { h: 0, d };
  const S = THREE.MathUtils.smoothstep, re = 8.5 - 2 * S(y, 14, 28) - 2.2 * S(y, 60, 100);   // (off the bottom seal: 4.3 mm; quicker read as a hard ledge)   // (smoothly: a step here showed as a line)                        // the long slope up from the top seal; a quick one off the bottom
  // off the seal the film curves up smoothly (no kink: a vertical start, sampled by a grid running across the seal's
  // edge at an angle, combed it into teeth); full a little sooner
  const u = Math.min(1, d / (re * 0.85)), sm = u * u * (3 - 2 * u), pe = 1 - Math.pow(1 - sm, 1.7);
  const side = Math.max(0, w - Math.abs(x)), ps = circ(side / 3.4);   // the body's sides: round folds
  const neck = 0.58 + 0.42 * THREE.MathUtils.smoothstep(y, 13, 24);   // the gel in the neck: a low, soft tongue
  const dome = 1 - 0.22 * (x / BODY) * (x / BODY);
  return { h: T_HALF * pe * ps * neck * dome, d };
}

// a sachet: front, back and the thin edge round them, plus the back's fin seal. seed: its own creases and warp
export function buildSachetGeometry(seed = 1) {
  const Wf = creasesFor(seed * 7 + 1), Wb = creasesFor(seed * 7 + 4), Rw = rng(seed * 13 + 5);
  // a gentle warp of the whole sachet (a bend along it, a slight twist): no sachet lies quite flat
  const bend = (Rw() - 0.5) * 0.8, twist = (Rw() - 0.5) * 0.02, tip = (Rw() - 0.5) * 1.4, cup = 0.3 + Rw() * 0.35;   // (how it bends along its length is the physics' now: its joints)
  // (bend: the ends lifted or dropped up to 3 mm; cup: the sides a little forward, as the filled tube rounds itself)
  const warp = (x, y) => bend * ((y - LEN / 2) / (LEN / 2)) ** 2 + twist * x * (y - LEN / 2) / 10 + (y < 9 ? tip * ((9 - y) / 9) ** 2 : 0) + cup * (x / BODY) ** 2;

  // the back seam (a fin seal): the tube's two edges sealed face to face into a strip 8 mm wide, folded flat to one
  // side and lying on the back, running its whole length. Not a separate piece laid on it: the back itself, raised by
  // the strip's two films. At its root it rolls over (the fold); its other edge is the cut, a crisp step. Through the
  // top and bottom seals it is crushed flat with them
  const FW = 8.2, fx0 = -1.2 + (Rw() - 0.5) * 0.6, fx1 = fx0 + FW, fph = Rw() * 6.3;
  const FT = 0.17;   // mm: the strip's thickness (two films and their seal)
  const finAt = (x, y, sealK) => {
    const t = x - fx0;
    if (t < 0 || t > FW + 0.04 || Math.abs(x) > halfWidth(y) - 0.35) return 0;   // (the whole length, up into the head tab: inside its outline)
    let h;
    if (t < 0.32) h = FT * Math.sqrt(Math.max(0, 1 - ((0.32 - t) / 0.32) ** 2));   // the fold, rolling over
    else if (t > FW - 0.05) h = FT * Math.max(0, 1 - (t - (FW - 0.05)) / 0.09);     // the cut edge
    else h = FT * (1 + 0.06 * Math.sin(y * 0.55 + fph) * Math.sin(t * 0.8));        // (its films not quite even)
    return h * (1 - 0.55 * sealK);   // (crushed in the end seals)
  };
  // columns across: closer at the folds, and gathered where the seam's fold and cut edge fall (on the body, 20 mm half
  // width, they are fixed in x)
  const S0 = []; for (let j = 0; j < NCOL; j++) S0.push(Math.sin((Math.PI / 2) * ((j / (NCOL - 1)) * 2 - 1)));
  for (const dx of [-0.25, 0, 0.08, 0.16, 0.24, 0.32, 0.5]) S0.push((fx0 + dx) / BODY);
  for (const dx of [-0.4, -0.15, -0.06, -0.02, 0.03, 0.09, 0.3]) S0.push((fx1 + dx) / BODY);
  const SC = [...new Set(S0.map((v) => +v.toFixed(5)))].sort((p, q) => p - q);
  const ys = rowsY(), nr = ys.length, nc = SC.length, n = nr * nc;

  const pos = new Float32Array((2 * n + 2 * (2 * (nr + nc))) * 3), uv = new Float32Array(pos.length / 3 * 2), seal = new Float32Array(pos.length / 3), cav = new Float32Array(pos.length / 3).fill(1);
  const P = (i, x, y, z, s, cv = 1) => { pos[3 * i] = x * MM; pos[3 * i + 1] = (LEN / 2 - y) * MM; pos[3 * i + 2] = z * MM; uv[2 * i] = x / 10; uv[2 * i + 1] = (LEN / 2 - y) / 10; seal[i] = s; cav[i] = cv; };
  for (let r = 0; r < nr; r++) {
    const y = ys[r], w = halfWidth(y);
    for (let c = 0; c < nc; c++) {
      const x = SC[c] * w, i = r * nc + c, { h, d } = puff(x, y, w);
      const gel = Math.min(1, h / (0.35 * T_HALF));
      // the crimp stops just short of the seal's edge, which the jaws leave as a slight bead; beside it the film puckers
      const s = 1 - THREE.MathUtils.smoothstep(d, -1.1, -0.1);   // (over a millimetre: narrower than the mesh, it frayed into teeth)
      const bead = 0.035 * Math.exp(-(((d + 0.3) / 0.38) ** 2));
      const along = x * 0.8 + y * 0.6, puck = d > 0.15 && (y > 19.5 || y > GEL_BOTTOM - 8) ? 0.07 * (1 - Math.exp(-(d - 0.15) / 0.3)) * Math.exp(-d / 1.1) * Math.sin(along * 2.55 + 1.7 * Math.sin(along * 0.37 + seed)) * (0.6 + 0.4 * Math.sin(along * 0.21 + seed * 2)) : 0;
      const edge = c === 0 || c === nc - 1;
      const f = edge ? FILM : Math.max(FILM, h - gel * creaseAt(Wf, x, y)) + bead + puck;
      const fin = edge ? 0 : finAt(x, y, 1 - THREE.MathUtils.smoothstep(d, -0.3, 0.6));
      const b = edge ? FILM : Math.max(FILM, h - gel * creaseAt(Wb, -x, y)) + bead + puck * 0.8 + fin;
      // the creases' and the seam's shade: in the fold's crease, and in the step's shadow just past the cut edge
      const t = x - fx0, inFin = t > -0.6 && t < FW + 0.8 && Math.abs(x) < halfWidth(y) - 0.2;
      const cvB = inFin ? (1 - 0.18 * Math.exp(-(t * t) / 0.03)) * (1 - 0.22 * Math.exp(-(((t - FW - 0.12) / 0.16) ** 2))) : 1;
      const cvS = 1 - 0.06 * Math.exp(-(((d - 0.05) / 0.22) ** 2));   // (the seal's edge: the film tucks in there)
      const wz = warp(x, y);
      P(i, x, y, wz + f, s, cvS);
      P(n + i, x, y, wz - b, Math.max(s, fin > 0.02 ? Math.min(1, (t - 0.25) / 0.2) * Math.min(1, (FW - 0.1 - t) / 0.15) : 0), cvS * cvB);
    }
  }
  const idx = [];
  for (let r = 0; r < nr - 1; r++) for (let c = 0; c < nc - 1; c++) {
    const a = r * nc + c, b = a + 1, cc = a + nc, d = cc + 1;
    idx.push(a, cc, b, b, cc, d);                              // front (+z)
    idx.push(n + a, n + b, n + cc, n + b, n + d, n + cc);     // back
  }
  // the edge: the boundary loop (clockwise seen from the front), front to back
  const loop = [];
  for (let r = 0; r < nr; r++) loop.push(r * nc + nc - 1);
  for (let c = nc - 2; c >= 0; c--) loop.push((nr - 1) * nc + c);
  for (let r = nr - 2; r >= 0; r--) loop.push(r * nc);
  for (let c = 1; c < nc - 1; c++) loop.push(c);
  let k = 2 * n;
  const rim0 = k;
  for (const i of loop) {
    for (const src of [i, n + i]) { pos[3 * k] = pos[3 * src]; pos[3 * k + 1] = pos[3 * src + 1]; pos[3 * k + 2] = pos[3 * src + 2]; uv[2 * k] = uv[2 * src]; uv[2 * k + 1] = uv[2 * src + 1]; seal[k] = seal[src] > 0.5 ? 2 : 1; cav[k] = 0.85; k++; }
  }
  const L = loop.length;
  for (let q = 0; q < L; q++) {
    const F0 = rim0 + 2 * q, B0 = F0 + 1, F1 = rim0 + 2 * ((q + 1) % L), B1 = F1 + 1;
    idx.push(F0, F1, B0, F1, B1, B0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, 3 * k), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv.subarray(0, 2 * k), 2));
  geo.setAttribute('aSeal', new THREE.BufferAttribute(seal.subarray(0, k), 1));
  geo.setAttribute('aCav', new THREE.BufferAttribute(cav.subarray(0, k), 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  geo.userData.grid = { nr, nc };   // (two small numbers: the contact shading samples every other row and column)
  return { body: geo };
}

// ---------------------------------------------------------------- materials
// the crimp: fine diamond knurl, square pyramids on a 45° lattice 1.25 mm apart, a little rounded. A normal map, its
// height in alpha (the grooves darken a touch)
function knurlTexture(maxAniso) {
  // 8 cells to a 10 mm tile (1.25 mm apart), 64 px a cell: rounded pyramids (their tops and the grooves between them
  // soft, as an embossing roller leaves them in foil), each a touch higher or lower than the next, the grooves' floors
  // a little uneven
  const S = 512, N = 8, data = new Uint8Array(S * S * 4), R = rng(77);
  const cellH = new Float32Array(N * N).map(() => 0.82 + 0.36 * R());
  const sm = (t) => t * t * (3 - 2 * t);
  const hgt = (u, v) => {
    const a = N * (u + v), b = N * (u - v), ia = Math.floor(a), ib = Math.floor(b);
    const f = a - ia - 0.5, g = b - ib - 0.5;
    const m = Math.pow(Math.pow(Math.abs(f), 4) + Math.pow(Math.abs(g), 4), 1 / 4);   // a rounded square, 45° turned
    const k = cellH[(((ia % N) + N) % N) * N + (((ib % N) + N) % N)];
    return k * sm(Math.max(0, Math.min(1, 1 - m * 2.05)));
  };
  const e = 1 / S, s = 0.011;   // (the pyramids' height, in tile units: about 0.11 mm)
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const u = (i + 0.5) / S, v = (j + 0.5) / S, h = hgt(u, v);
    const dx = (hgt(u + e, v) - hgt(u - e, v)) / (2 * e), dy = (hgt(u, v + e) - hgt(u, v - e)) / (2 * e);
    let nx = -dx * s, ny = -dy * s, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const o = 4 * (j * S + i);
    data[o] = Math.round((nx * 0.5 + 0.5) * 255); data[o + 1] = Math.round((ny * 0.5 + 0.5) * 255); data[o + 2] = Math.round((nz * 0.5 + 0.5) * 255); data[o + 3] = Math.round(Math.min(1, h) * 255);
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.anisotropy = maxAniso; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
  return t;
}
// the foil's satin: a faint orange-peel, so its highlights break up as real printed foil's do (not a perfect mirror blur)
function peelTexture(maxAniso) {
  const S = 256, R = rng(11), data = new Uint8Array(S * S * 4), H = new Float32Array(S * S);
  // a few octaves of smoothed noise
  for (const [cell, amp] of [[32, 1], [16, 0.55], [8, 0.3]]) {
    const g = new Float32Array((S / cell + 1) ** 2).map(() => R());
    const G = (a, b) => g[(b % (S / cell)) * (S / cell + 1) + (a % (S / cell))];
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const a = i / cell, b = j / cell, a0 = Math.floor(a), b0 = Math.floor(b), fa = a - a0, fb = b - b0;
      const sa = fa * fa * (3 - 2 * fa), sb = fb * fb * (3 - 2 * fb);
      H[j * S + i] += amp * ((G(a0, b0) * (1 - sa) + G(a0 + 1, b0) * sa) * (1 - sb) + (G(a0, b0 + 1) * (1 - sa) + G(a0 + 1, b0 + 1) * sa) * sb);
    }
  }
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const h = (a, b) => H[((b + S) % S) * S + ((a + S) % S)];
    const dx = (h(i + 1, j) - h(i - 1, j)) * 0.5, dy = (h(i, j + 1) - h(i, j - 1)) * 0.5, s = 0.9;
    let nx = -dx * s, ny = -dy * s, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const o = 4 * (j * S + i);
    data[o] = Math.round((nx * 0.5 + 0.5) * 255); data[o + 1] = Math.round((ny * 0.5 + 0.5) * 255); data[o + 2] = Math.round((nz * 0.5 + 0.5) * 255); data[o + 3] = 255;
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.anisotropy = maxAniso; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
  return t;
}

export function createLubeMaterials(maxAniso = 8) {
  const knurl = knurlTexture(maxAniso), peel = peelTexture(maxAniso);
  const aoK = { value: 1 };   // the contact shading's strength: off while they move (it is worked out where they rest)
  // satin-printed metallised foil: a clear mid blue, a soft sheen (its highlights broad and pale), a touch of metal
  const foil = new THREE.MeshPhysicalMaterial({
    color: 0x55ade3, roughness: 0.48, metalness: 0.34, specularIntensity: 0.8,
    sheen: 0.16, sheenColor: 0xcfe6f5, sheenRoughness: 0.6,
    clearcoat: 0.04, clearcoatRoughness: 0.6,   // (a soft satin: its highlights broad, nothing hard or glassy)
    normalMap: knurl, normalScale: new THREE.Vector2(1, 1),
  });
  foil.onBeforeCompile = (sh) => {
    sh.uniforms.tPeel = { value: peel };
    sh.uniforms.uAOk = aoK;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSeal;\nattribute float aAO;\nattribute float aCav;\nvarying float vSeal;\nvarying float vAO;\nvarying float vCav;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSeal = aSeal; vAO = aAO; vCav = aCav;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSeal;\nvarying float vAO;\nvarying float vCav;\nuniform sampler2D tPeel;\nuniform float uAOk;')
      // the knurl only on the seals; the foil's faint peel everywhere else (vSeal: 0 foil .. 1 seal; 2 a cut edge)
      .replace('#include <normal_fragment_maps>', `
        float sealM = min( vSeal, 1.0 );
        vec4 knT = texture2D( normalMap, vNormalMapUv );
        vec3 knN = knT.xyz * 2.0 - 1.0;
        vec3 peN = texture2D( tPeel, vNormalMapUv * 1.1 ).xyz * 2.0 - 1.0;
        vec3 mapN = normalize( mix( vec3( peN.xy * 0.22, 1.0 ), knN, sealM ) );
        mapN.xy *= normalScale;
        normal = normalize( tbn * mapN );`)
      // the crimp's grooves a touch darker, its faces a touch more matte; a cut edge the laminate's aluminium
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix( min( 1.0, roughnessFactor + 0.1 * min( vSeal, 1.0 ) ), 0.42, step( 1.5, vSeal ) );`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = mix( metalnessFactor, 0.8, step( 1.5, vSeal ) );`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        { float knH = texture2D( normalMap, vNormalMapUv ).a; diffuseColor.rgb *= mix( 1.0, 0.9 + 0.12 * knH, min( vSeal, 1.0 ) );
          // a cut edge: the laminate's aluminium core, dulled, between its blue faces
          diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.52, 0.56, 0.6 ), 0.65 * step( 1.5, vSeal ) ); }`)
      // where one sachet lies on another, or on the floor: the light that can't get in there (worked out where they rest)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        { float ao = mix( 1.0, vAO, uAOk ) * vCav;
          reflectedLight.indirectDiffuse *= ao; reflectedLight.indirectSpecular *= ao;
          reflectedLight.directDiffuse *= mix( 1.0, ao, 0.55 ); reflectedLight.directSpecular *= mix( 1.0, ao, 0.7 );
          #ifdef USE_CLEARCOAT
            clearcoatSpecularIndirect *= ao;
          #endif
          #ifdef USE_SHEEN
            sheenSpecularIndirect *= ao;
          #endif
        }`);
  };
  foil.customProgramCacheKey = () => 'lube-foil-3';
  return { foil, knurl, peel, aoK };
}


// ---------------------------------------------------------------- the sachets and their physics
// Each sachet moves as one solid body (cannon-es: steady when they land across one another, are pushed or picked
// up). How it then bends is worked out on top, as a filled gel pack does: along its length it sags under its own
// weight wherever there is room below it (onto the floor, or over the sachets under it) as far as its stiffness lets
// it, and never into anything. So one laid across another drapes over it, and an end hanging over an edge droops.
const MAX = 3;
const DEG = Math.PI / 180;
const G = 981;                   // cm/s²
const STEP = 1 / 360;            // (finer than 1/240: falling into the bag, a sachet went through its 5 mm floor)
const NS = 49;                   // stations along the length, for the bend
const DS = SACHET.L / (NS - 1);
const STIFF = 30;                // EI over the weight per length (cm³): very soft, a gel pack: it lies into whatever is under it
const stY = (j) => SACHET.L / 2 - j * DS;                // a station's y in the sachet's own frame (j = 0 the top)

// the second-difference stiffness (D2ᵀD2: free ends), banded: M[j][k - j + 2], k = j-2 .. j+2
const BAND = (() => {
  const M = Array.from({ length: NS }, () => new Float64Array(5));
  for (let r = 1; r < NS - 1; r++) {
    const c = [[r - 1, 1], [r, -2], [r + 1, 1]];
    for (const [a, va] of c) for (const [b, vb] of c) M[a][b - a + 2] += va * vb;
  }
  return M;
})();

function prepSkin(geo) {
  const P = geo.attributes.position.array, n = P.length / 3, st = new Uint8Array(n), fr = new Float32Array(n);
  for (let v = 0; v < n; v++) { const j = Math.min(NS - 1.0001, Math.max(0, (SACHET.L / 2 - P[3 * v + 1]) / DS)); st[v] = Math.floor(j); fr[v] = j - Math.floor(j); }
  geo.computeBoundingBox();
  return { geo, rest: P.slice(), restN: geo.attributes.normal.array.slice(), st, fr, box0: geo.boundingBox.clone(), grid: geo.userData.grid || null };
}

export function buildLube(LM) {
  const group = new THREE.Group(); group.name = 'lube';
  const sachets = [], skins = [];
  for (let i = 0; i < MAX; i++) {
    const { body } = buildSachetGeometry(i + 1);
    for (const g of [body]) g.setAttribute('aAO', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(1), 1));
    const s = new THREE.Group(); s.name = `sachet-${i}`;
    const m = new THREE.Mesh(body, LM.foil); m.name = 'sachet';
    for (const o of [m]) { o.castShadow = true; o.receiveShadow = true; }
    s.add(m); group.add(s); sachets.push(s);
    skins.push([prepSkin(body)]);   // (the back seam is part of the body now)
  }
  // (kept off userData: the floor shadow's stand-in is a clone, and a clone copies userData as JSON)
  Object.defineProperty(group, 'sim', { value: new LubeSim(sachets, skins, LM) });
  return group;
}

export const LUBE_ARRANGEMENTS = ['pile', 'fan', 'row', 'float'];

// across each station, where its faces are: 5 points (x, half thickness), cm
const ACROSS = (() => {
  const out = [];
  for (let j = 0; j < NS; j++) {
    const ymm = j * DS / MM, w = halfWidth(ymm), pts = [];
    for (const f of [-0.85, -0.45, 0, 0.45, 0.85]) { const x = f * w; pts.push([x * MM, (Math.max(FILM, puff(x, ymm, w).h) + 0.02) * MM]); }
    out.push({ pts, hw: w * MM * 0.96, th: Math.max(...pts.map((p) => p[1])) });
  }
  return out;
})();

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4();
export class LubeSim {
  constructor(sachets, skins, LM) {
    this.sachets = sachets; this.skins = skins; this.LM = LM;
    const w = this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -G, 0) });
    w.allowSleep = true;
    w.solver.iterations = 30;
    w.solver.tolerance = 1e-6;
    const mat = new CANNON.Material('foil');
    // (soft: a low contact stiffness and a long relaxation, so they meet with a soft give and no bounce, and a little grip)
    Object.assign(w.defaultContactMaterial, { friction: 0.46, restitution: 0, contactEquationStiffness: 4e5, contactEquationRelaxation: 8, frictionEquationStiffness: 4e5, frictionEquationRelaxation: 7 });
    // (one being held slides over what it touches: the engine's friction doesn't lessen as a held one is lifted off its
    // load, and with every one of its contact points gripping, a sachet drawn out from under the others stuck fast)
    this.foil = mat; this.heldMat = new CANNON.Material('held');
    w.addContactMaterial(new CANNON.ContactMaterial(this.heldMat, mat, { friction: 0.08, restitution: 0, contactEquationStiffness: 4e5, contactEquationRelaxation: 8, frictionEquationStiffness: 4e5, frictionEquationRelaxation: 7 }));
    this.floor = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, material: mat });
    this.floor.addShape(new CANNON.Plane());
    this.floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    w.addBody(this.floor);
    // a sachet: the filled body as thick as it is when it rests, its underside flattened (the gel gives: 4.2 mm, not
    // 5.5), its sides round, the head tab and the bottom seal plates at its mid-plane
    const Th = 0.195, yTop = (LEN / 2 - 19) * MM, yBot = (LEN / 2 - GEL_BOTTOM) * MM, hl = (yTop - yBot) / 2, yc = (yTop + yBot) / 2;
    this.bodies = sachets.map(() => {
      const b = new CANNON.Body({ mass: 1, material: mat, linearDamping: 0.16, angularDamping: 0.42, allowSleep: true, sleepSpeedLimit: 0.35, sleepTimeLimit: 0.5 });   // (looser, and one starting to topple slowly went to sleep leaning)
      b.addShape(new CANNON.Box(new CANNON.Vec3(1.32, hl, Th)), new CANNON.Vec3(0, yc, 0));
      // its sides round (a row of small balls each side, not a box's edge: on a box's edge it could stand up, leaning on
      // another, as no gel pack would)
      for (const sx of [-1, 1]) for (let k = 0; k < 8; k++) b.addShape(new CANNON.Sphere(0.17), new CANNON.Vec3(sx * 1.81, yBot + 0.25 + (k / 7) * (2 * hl - 0.5), 0));
      // (the seals are 0.16 mm thin, but as plates that thin they went through one another as the sachets landed, and
      // locked together: 4 mm, nearly the body's)
      b.addShape(new CANNON.Box(new CANNON.Vec3(HEAD * MM, 0.95, 0.2)), new CANNON.Vec3(0, (LEN / 2 - 9.5) * MM, 0));
      b.addShape(new CANNON.Box(new CANNON.Vec3(BODY * MM * 0.96, ((LEN - GEL_BOTTOM) * MM) / 2, 0.2)), new CANNON.Vec3(0, (LEN / 2 - (LEN + GEL_BOTTOM) / 2) * MM, 0));
      return b;
    });
    // each sachet's bend: u (cm) at each station, along d (its face that is downward)
    this.bend = sachets.map(() => ({ u: new Float64Array(NS), free: new Float64Array(NS).fill(9), press: new Float64Array(NS), v: new Float64Array(NS), d: new THREE.Vector3(), s: 1, on: false, shown: -1 }));
    this.count = 3; this.arr = 'pile'; this.drops = 0;
    this.acc = 0; this.last = 0; this.drag = null; this.awake = false;
    this.box = new THREE.Box3();
    this.obs = []; this.obsBody = null; this.encl = null;
    this.arrange('pile', 3, { settle: true });
  }
  active() { return this.bodies.slice(0, this.count); }
  // the other devices in a combined shot, solid: boxes { c: [x, y, z], ax: [9: its axes], h: [3] } in this group's frame.
  // encl: a hollow they can go into (the travel bag): { m: this frame → its frame (Matrix4), light(x, y, z): how much
  // light gets in there, 0..1 } or null. Anything left inside a box (a device put down on them) is lifted out on top of it
  setObstacles(list, encl = null, solids = null, keep = new Set()) {   // (solids: the whole shapes to push out of, the bag one box; keep: sachets left where they are, in the bag)
    if (this.obsBody) { this.world.removeBody(this.obsBody); this.obsBody = null; }
    this.obs = list.map((o) => ({ r: Math.hypot(...o.h) + 0.3, c: new THREE.Vector3(...o.c), ax: [new THREE.Vector3(o.ax[0], o.ax[1], o.ax[2]), new THREE.Vector3(o.ax[3], o.ax[4], o.ax[5]), new THREE.Vector3(o.ax[6], o.ax[7], o.ax[8])], h: [...o.h] }));
    this.encl = encl;
    if (this.obs.length) {
      const b = this.obsBody = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, material: this.floor.material });
      const m = new THREE.Matrix4(), q = new THREE.Quaternion();
      for (const o of this.obs) {
        q.setFromRotationMatrix(m.makeBasis(o.ax[0], o.ax[1], o.ax[2]));
        b.addShape(new CANNON.Box(new CANNON.Vec3(Math.max(0.05, o.h[0]), Math.max(0.05, o.h[1]), Math.max(0.05, o.h[2]))), new CANNON.Vec3(o.c.x, o.c.y, o.c.z), new CANNON.Quaternion(q.x, q.y, q.z, q.w));
      }
      this.world.addBody(b);
    }
    // (a device put down where sachets lie: they are pushed out from under it, sideways, the shortest way, as it would
    // shove them aside; only from under something very low, they end up on it)
    let moved = false;
    const S2 = solids ? solids.map((o) => ({ c: new THREE.Vector3(...o.c), ax: [new THREE.Vector3(o.ax[0], o.ax[1], o.ax[2]), new THREE.Vector3(o.ax[3], o.ax[4], o.ax[5]), new THREE.Vector3(o.ax[6], o.ax[7], o.ax[8])], h: [...o.h] })) : this.obs;
    for (let pass = 0; pass < 6; pass++) for (const [bi, b] of this.active().entries()) {
      if (keep.has(bi)) continue;
      const q = new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w), ex = new THREE.Vector3(1, 0, 0).applyQuaternion(q), ey = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      for (const o of S2) {
        const d = new THREE.Vector3(b.position.x, b.position.y, b.position.z).sub(o.c);
        const l = [d.dot(o.ax[0]), d.dot(o.ax[1]), d.dot(o.ax[2])];
        if (!(Math.abs(l[0]) < o.h[0] + 0.15 && Math.abs(l[1]) < o.h[1] + 0.15 && Math.abs(l[2]) < o.h[2] + 0.15)) continue;
        const top = o.c.y + Math.abs(o.ax[0].y) * o.h[0] + Math.abs(o.ax[1].y) * o.h[1] + Math.abs(o.ax[2].y) * o.h[2];
        let best = null;
        if (top > 1.5) for (let k = 0; k < 3; k++) {
          if (Math.abs(o.ax[k].y) > 0.5) continue;   // (sideways only)
          const dir = o.ax[k].clone().setY(0).normalize().multiplyScalar(Math.sign(l[k]) || 1);
          const out = o.h[k] - Math.abs(l[k]) + Math.abs(ey.dot(dir)) * SACHET.L / 2 + Math.abs(ex.dot(dir)) * SACHET.W / 2 + 0.6;   // (all of it clear)
          if (!best || out < best.out) best = { out, dir };
        }
        if (best) { b.position.x += best.dir.x * best.out; b.position.z += best.dir.z * best.out; }
        else b.position.y = top + 0.6;
        b.velocity.setZero(); b.angularVelocity.setZero(); moved = true;
      }
    }
    for (const b of this.active()) b.wakeUp();
    if (this.world.gravity.y !== 0) this.wake();
    return moved;
  }
  // carry the sachets inside something that moved (the bag) with it: those for which inside(x, y, z) holds, by the move M
  carry(M, inside) {
    const q = new THREE.Quaternion().setFromRotationMatrix(M), p = new THREE.Vector3(), bq = new THREE.Quaternion();
    let any = false;
    for (const b of this.active()) {
      if (!inside(b.position.x, b.position.y, b.position.z)) continue;
      p.set(b.position.x, b.position.y, b.position.z).applyMatrix4(M); b.position.set(p.x, p.y, p.z);
      bq.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w).premultiply(q); b.quaternion.set(bq.x, bq.y, bq.z, bq.w);
      b.velocity.setZero(); b.angularVelocity.setZero(); any = true;
    }
    if (any) this.sync(true);
    return any;
  }
  setGravity(on) { this.world.gravity.set(0, on ? -G : 0, 0); for (const b of this.bodies) { b.linearDamping = on ? 0.16 : 0.85; b.angularDamping = on ? 0.42 : 0.9; } }   // (a soft pack hardly spins)
  place(i, p, e) {
    const b = this.bodies[i]; _q.setFromEuler(_e.set(e[0], e[1], e[2], 'YXZ'));
    b.position.set(p[0], p[1], p[2]); b.quaternion.set(_q.x, _q.y, _q.z, _q.w);
    b.velocity.setZero(); b.angularVelocity.setZero(); b.force.setZero(); b.torque.setZero(); b.wakeUp();
    this.bend[i].u.fill(0); this.bend[i].v.fill(0); this.bend[i].on = false;
  }
  // where they start, for the arrangement (settle: shown at rest at once; else the drop plays out)
  arrange(arr = this.arr, count = this.count, { settle = arr !== 'pile' } = {}) {
    this.arr = arr; this.count = count; this.endDrag(false); this.steepT = 0; this.acc = 0;
    for (let i = 0; i < MAX; i++) {
      const b = this.bodies[i], on = i < count, inW = this.world.bodies.includes(b);
      if (on && !inW) this.world.addBody(b); if (!on && inW) this.world.removeBody(b);
      this.sachets[i].visible = on;
    }
    const n = count, L2 = SACHET.L / 2;
    if (arr === 'float') {
      // as in the photo: upright, fanned from their bottoms, each leaning a little more to the left, the right one in
      // front; held still in the air (no gravity: moved, they drift and shove one another, as in space)
      this.setGravity(false);
      const lean = n === 3 ? [24, 11, 0] : n === 2 ? [13, 0] : [6];
      for (let i = 0; i < n; i++) {
        const a = lean[i] * DEG, off = new THREE.Vector3(0, L2 - 1.4, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), a);
        this.place(i, [off.x + (i - (n - 1)) * 0.55, off.y, -(n - 1 - i) * 0.68], [0, -6 * DEG, a]);
      }
      this.sync(); const low = this.box.min.y; for (const b of this.active()) b.position.y += 4 - low;
    } else if (arr === 'fan') {
      this.setGravity(true);
      const yaw = n === 3 ? [22, 0, -22] : n === 2 ? [13, -13] : [8];
      for (let i = 0; i < n; i++) { const a = yaw[i] * DEG, d = L2 - 2.2; this.place(i, [-Math.sin(a) * d, 0.3 + i * 0.8, 5 - Math.cos(a) * d], [-90 * DEG, a, 0]); }
    } else if (arr === 'row') {
      this.setGravity(true);
      const jit = [-2.5, 1.5, -1];
      for (let i = 0; i < n; i++) this.place(i, [(i - (n - 1) / 2) * (SACHET.W + 0.9), 0.3, 0], [-90 * DEG, jit[i] * DEG, 0]);
    } else {   // pile: dropped from a little above, crossing, turned this way and that (now and then one face down)
      this.setGravity(true);
      const R = rng(1000 + this.drops * 17);
      for (let i = 0; i < n; i++) {
        const flip = R() < 0.25 ? Math.PI : 0;
        // (each well above the last: tilted, a sachet reaches 2 cm up and down)
        this.place(i, [(R() - 0.5) * 3.5, 2.6 + i * 4.4 + R() * 0.5, (R() - 0.5) * 3.5], [-90 * DEG + (R() - 0.5) * 30 * DEG, R() * Math.PI * 2, flip + (R() - 0.5) * 26 * DEG]);
      }
    }
    if (arr !== 'float' && settle) this.settle();
    else if (arr !== 'float') this.wake();
    this.sync(true);
  }
  // a new drop: worked out first out of sight (trying another way if one would end on its edge), then played live from
  // the same start: the simulation runs the same way twice, so it ends as checked
  drop() { this.drops++; this.arrange('pile', this.count, { settle: true }); this.arrange('pile', this.count, { settle: false }); }
  wake() { this.awake = true; this.last = 0; this.still = 0; this.freeSince = performance.now(); }
  // a gel pack doesn't stand on its edge or lean steeply: it slumps onto a face. Turned towards lying flat (whichever face is
  // nearer down) once it has slowed, if it is tilted more than about 21° (lying across others it never tilts more than about 13°)
  slump() {
    if (this.world.gravity.y === 0) return;
    for (let i = 0; i < this.count; i++) {
      const b = this.bodies[i];
      if ((this.drag && this.drag.i === i) || b.sleepState === CANNON.Body.SLEEPING || b.velocity.lengthSquared() > 225) continue;
      if (this.encl?.inside?.(b.position.x, b.position.y, b.position.z)) continue;   // (in the bag they may lean on its walls)
      const q = b.quaternion, ezx = 2 * (q.x * q.z + q.y * q.w), ezy = 2 * (q.y * q.z - q.x * q.w), ezz = 1 - 2 * (q.x * q.x + q.y * q.y);
      if (Math.abs(ezy) > 0.93) continue;
      // which way: onto the face nearer down; but standing near upright, away from the sachet nearest it (two leaning
      // on each other, each turned into the other, stood like a house of cards)
      let s = ezy >= 0 ? 1 : -1;
      if (Math.abs(ezy) < 0.5) {
        let near = null, dn = 36;
        for (let o = 0; o < this.count; o++) { if (o === i) continue; const c = this.bodies[o].position, d2 = (c.x - b.position.x) ** 2 + (c.z - b.position.z) ** 2; if (d2 < dn) { dn = d2; near = c; } }
        if (near) { const ax = b.position.x - near.x, az = b.position.z - near.z, dot = ezx * ax + ezz * az; if (Math.abs(dot) > 1e-3) s = dot > 0 ? -1 : 1; }
      }
      // (stuck that way, wedged, it gives more and more, as a soft pack slowly squeezes out: up to 5x over 1.5 s)
      const k = (420 * (0.93 - Math.abs(ezy)) + 60) * (1 + 4 * Math.min(1, (this.steepT || 0) / 1.5));
      b.torque.x += -ezz * s * k; b.torque.z += ezx * s * k;
    }
  }
  tick() {
    this.slump(); this.hold(); this.world.step(STEP);
    // a light, flat sachet falls no faster than about 1.8 m/s (the air holds it back): and nothing thin is ever skipped through
    for (const b of this.active()) { const v2 = b.velocity.lengthSquared(); if (v2 > 32400) b.velocity.scale(180 / Math.sqrt(v2), b.velocity); }
    // (while one is held, the others are only ever nudged by the hand, never flicked: one drawn out from under them
    // squeezes their soft contacts, which would let go all at once)
    if (this.drag) for (const [i, b] of this.active().entries()) {
      if (i === this.drag.i) continue;
      const v = b.velocity, h = Math.hypot(v.x, v.z); if (h > 28) { v.x *= 28 / h; v.z *= 28 / h; } if (v.y > 20) v.y = 20;   // (falling, they fall)
      const w = b.angularVelocity.length(); if (w > 4) b.angularVelocity.scale(4 / w, b.angularVelocity);
    }
    this.steepT = this.steep() ? (this.steepT || 0) + STEP : 0;
  }
  steep() { return this.world.gravity.y !== 0 && this.active().some((b) => { const q = b.quaternion; return !this.encl?.inside?.(b.position.x, b.position.y, b.position.z) && Math.abs(2 * (q.y * q.z - q.x * q.w)) < 0.93; }); }
  sane() { return this.active().every((b) => Math.abs(b.position.x) < 80 && b.position.y > -5 && b.position.y < 80 && Math.abs(b.position.z) < 80 && b.velocity.lengthSquared() < 4e6); }
  settle() {
    for (let k = 0; k < 2160; k++) { this.tick(); if (k > 120 && this.active().every((b) => b.sleepState === CANNON.Body.SLEEPING)) { if (!this.steep()) break; for (const b of this.active()) b.wakeUp(); } }
    if (!this.sane() || (this.arr === 'pile' && this.steep() && (this.retry = (this.retry || 0) + 1) < 6)) { this.drops++; return this.arrange(this.arr, this.count, { settle: true }); }
    this.retry = 0;
    this.rest();
  }
  rest() { for (const b of this.active()) { b.velocity.setZero(); b.angularVelocity.setZero(); b.sleep(); } this.awake = false; this.last = 0; this.still = 0; }

  // ---------------------------------------------------------------- the bend
  // each sachet's stations as boxes where they are (bent), for the ones above to lie on and for the contact shading
  stationBoxes(i) {
    const b = this.bodies[i], B = this.bend[i], q = new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    const ax = [new THREE.Vector3(1, 0, 0).applyQuaternion(q), new THREE.Vector3(0, 1, 0).applyQuaternion(q), new THREE.Vector3(0, 0, 1).applyQuaternion(q)];
    const out = [];
    for (let j = 0; j < NS; j++) {
      const c = ax[1].clone().multiplyScalar(stY(j)).add(b.position).addScaledVector(B.d, B.v[j]);
      out.push({ c, ax, h: [ACROSS[j].hw, DS / 2, ACROSS[j].th] });
    }
    return out;
  }
  // the top of whatever is under (x, z) in this frame: the floor, a device, another sachet (not skip)
  surfaceBelow(x, z, skip = -1) {
    let top = 0;
    const boxes = this.obs.slice();
    for (let k = 0; k < this.count; k++) if (k !== skip) boxes.push(...this.stationBoxes(k));
    for (const o of boxes) {
      const px = x - o.c.x, py = 300 - o.c.y, pz = z - o.c.z;
      let t0 = 0, t1 = 1e9, hit = true;
      for (let k = 0; k < 3; k++) {
        const a = o.ax[k], p = px * a.x + py * a.y + pz * a.z, v = -a.y, h2 = o.h[k];
        if (Math.abs(v) < 1e-9) { if (Math.abs(p) > h2) { hit = false; break; } continue; }
        let ta = (-h2 - p) / v, tb = (h2 - p) / v; if (ta > tb) { const t = ta; ta = tb; tb = t; }
        if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) { hit = false; break; }
      }
      if (hit) top = Math.max(top, 300 - t0);
    }
    return top;
  }
  // where a ray (this frame) first meets anything here: the floor, a device, a sachet (not skip). null if nothing
  rayHit(o, d, skip = -1) {
    let best = d.y < -1e-6 ? -o.y / d.y : Infinity;
    const boxes = this.obs.slice();
    for (let k = 0; k < this.count; k++) if (k !== skip) boxes.push(...this.stationBoxes(k));
    for (const b of boxes) {
      const px = o.x - b.c.x, py = o.y - b.c.y, pz = o.z - b.c.z;
      let t0 = 0, t1 = best, hit = true;
      for (let k = 0; k < 3; k++) {
        const a = b.ax[k], p = px * a.x + py * a.y + pz * a.z, v = d.x * a.x + d.y * a.y + d.z * a.z, h2 = b.h[k];
        if (Math.abs(v) < 1e-9) { if (Math.abs(p) > h2) { hit = false; break; } continue; }
        let ta = (-h2 - p) / v, tb = (h2 - p) / v; if (ta > tb) { const t = ta; ta = tb; tb = t; }
        if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) { hit = false; break; }
      }
      if (hit && t0 < best) best = t0;
    }
    return Number.isFinite(best) ? o.clone().addScaledVector(d, best) : null;
  }
  // how high a held sachet must be carried, to its target (x, z) from where it is: over everything under its footprint
  // (its length and width as it is turned now) there and along the way; at the open mouth, lined up, that is the inside
  clearance(i, tx, tz) {
    const q = this.bodies[i].quaternion, ax = 2 * (q.x * q.y - q.z * q.w), az = 2 * (q.y * q.z + q.x * q.w), l = Math.hypot(ax, az) || 1;
    const ux = ax / l, uz = az / l, f = Math.min(1, l), half = 6.6 * f + 0.4;   // (hanging steeply, it covers less)
    const foot = (cx, cz) => { let top = 0; for (const s of [-1, -0.5, 0, 0.5, 1]) for (const w of [-1.7, 0, 1.7]) top = Math.max(top, this.surfaceBelow(cx + ux * s * half - uz * w, cz + uz * s * half + ux * w, i)); return top; };
    const b = this.bodies[i].position;
    let need = foot(tx, tz);
    for (let k = 1; k < 6; k++) need = Math.max(need, foot(b.x + (tx - b.x) * (k / 6), b.z + (tz - b.z) * (k / 6)));
    return need;
  }
  lowOf(i) { const s = this.sachets[i]; s.updateMatrix(); let low = Infinity; for (const m of s.children) low = Math.min(low, m.geometry.boundingBox.clone().applyMatrix4(s.matrix).min.y); return low; }
  // the device boxes near a sachet (within reach of it)
  obsNear(i, reach = 9) { const p = this.bodies[i].position; return this.obs.filter((o) => o.c.distanceTo(new THREE.Vector3(p.x, p.y, p.z)) < reach + Math.hypot(...o.h)); }
  // how far each station can sag (along d) before it touches the floor or a sachet already worked out
  drape(i, others, sweeps) {
    const b = this.bodies[i], B = this.bend[i], q = new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    const ex = new THREE.Vector3(1, 0, 0).applyQuaternion(q), ey = new THREE.Vector3(0, 1, 0).applyQuaternion(q), ez = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const down = ez.y > 0 ? -1 : 1;                     // its downward face: the back (-z) when its front is up
    const d = ez.clone().multiplyScalar(down), g = -d.y;  // (g: how much of its weight bends it: 1 lying flat, 0 on edge)
    B.d.copy(d); B.s = down;
    if (this.world.gravity.y === 0 || g < 0.25) { B.free.fill(9); if (B.on) { B.u.fill(0); B.on = false; } return; }
    // held: it droops softly either side of the fingers (more the farther from them), and jiggles as the hand moves
    if (this.drag && this.drag.i === i) {
      B.free.fill(9);
      const yg = this.drag.local.y, A = 0.5 * g * Math.max(0, this.drag.amp);
      for (let j = 0; j < NS; j++) { const x = Math.abs(stY(j) - yg) / 7, x2 = x * x; B.u[j] = (A * 1.5 * x2) / (1 + 0.5 * x2); }
      B.on = true; return;
    }
    const P = new THREE.Vector3();
    let minFree = Infinity;
    for (let j = 0; j < NS; j++) {
      let f = 1.8;   // (at most: a gel pack bridging a gap sags, but not into a hammock)
      for (const [x, h] of ACROSS[j].pts) {
        P.copy(b.position).addScaledVector(ex, x).addScaledVector(ey, stY(j)).addScaledVector(ez, down * h);
        if (d.y < -0.05) f = Math.min(f, Math.max(0, P.y / -d.y));   // the floor
        for (const o of others) {
          // the ray along d against the station box (slabs)
          const rx = P.x - o.c.x, ry = P.y - o.c.y, rz = P.z - o.c.z;
          const rr = f + (o.r || 2.6); if (rx * rx + ry * ry + rz * rz > rr * rr) continue;
          let t0 = 0, t1 = f, hit = true;
          for (let k = 0; k < 3; k++) {
            const a = o.ax[k], p = rx * a.x + ry * a.y + rz * a.z, v = d.x * a.x + d.y * a.y + d.z * a.z, h2 = o.h[k];
            if (Math.abs(v) < 1e-9) { if (Math.abs(p) > h2) { hit = false; break; } continue; }
            let ta = (-h2 - p) / v, tb = (h2 - p) / v; if (ta > tb) { const t = ta; ta = tb; tb = t; }
            if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) { hit = false; break; }
          }
          if (hit) f = Math.min(f, t0);
        }
      }
      B.free[j] = f; minFree = Math.min(minFree, f);
    }
    // touching nothing (held, or falling): straight
    if (minFree > (B.on ? 0.4 : 0.25)) { if (B.on) { B.u.fill(0); B.on = false; } return; }   // (resting on its seals' plates, 2 mm proud of the seals, reads 0.2; a little give either way, so it doesn't flick between)
    // the sag: least bending energy under its weight, never past what's free below (projected Gauss-Seidel, SOR)
    const c = (g * DS ** 4) / STIFF, u = B.u, free = B.free;
    for (let j = 0; j < NS; j++) if (u[j] > free[j]) u[j] = free[j];
    for (let it = 0; it < sweeps; it++) {
      for (let j = 0; j < NS; j++) {
        const M = BAND[j]; let s = c;
        for (let k = -2; k <= 2; k++) if (k && j + k >= 0 && j + k < NS) s -= M[k + 2] * u[j + k];
        const v = u[j] + 1.7 * (s / M[2] - u[j]);
        u[j] = v < 0 ? 0 : v > free[j] ? free[j] : v;
      }
    }
    B.on = true;
  }
  // the bend applied to a sachet's meshes (its own frame: its faces moved along their normal, their normals tipped)
  bendMesh(i) {
    const B = this.bend[i], u = B.v, s = B.s, fr = B.free, pr = B.press, ZC = 0.19;
    for (const S of this.skins[i]) {
      const P = S.geo.attributes.position.array, N = S.geo.attributes.normal.array, R0 = S.rest, N0 = S.restN, n = P.length / 3;
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (let v = 0; v < n; v++) {
        const j = S.st[v], f = S.fr[v], uj = u[j] * (1 - f) + u[j + 1] * f;
        // the slope (d(offset)/dy: stations run down the length)
        const sl = (-s * (u[j + 1] - u[j])) / DS;
        // the gel gives: where it rests on something its underside flattens and its top swells a little; where another lies
        // on it, its top is pressed in
        let z = R0[3 * v + 2];
        const az = Math.abs(z);
        if (az > 0.1) {
          const ct = 1 - Math.min(1, (fr[j] * (1 - f) + fr[j + 1] * f) / 0.05), pj = pr[j] * (1 - f) + pr[j + 1] * f;
          if (z * s > 0) { if (ct > 0 && az > ZC) z = Math.sign(z) * (ZC + (az - ZC) * (1 - 0.75 * ct)); }
          else z = Math.sign(z) * (az + 0.45 * Math.max(0, az - ZC) * ct - pj * 0.42 * Math.max(0, az - 0.06));
        }
        const X = R0[3 * v], Y = R0[3 * v + 1], Z = z + s * uj;
        P[3 * v] = X; P[3 * v + 1] = Y; P[3 * v + 2] = Z;
        if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; if (Z < z0) z0 = Z; if (Z > z1) z1 = Z;
        const cs = 1 / Math.sqrt(1 + sl * sl), sn = sl * cs, ny = N0[3 * v + 1], nz = N0[3 * v + 2];
        N[3 * v] = N0[3 * v]; N[3 * v + 1] = ny * cs - nz * sn; N[3 * v + 2] = ny * sn + nz * cs;
      }
      S.geo.attributes.position.needsUpdate = true; S.geo.attributes.normal.needsUpdate = true;
      const bb = S.geo.boundingBox; bb.min.set(x0, y0, z0); bb.max.set(x1, y1, z1);   // (exact: the floor is set by it)
      if (!S.geo.boundingSphere) S.geo.boundingSphere = new THREE.Sphere();
      bb.getBoundingSphere(S.geo.boundingSphere);
    }
  }
  // the meshes put where the bodies are, bent (lowest first: each lies on those under it); at rest, contact shading too
  // dt: the time since the last frame, over which the shown bend eases towards the worked-out one (0: shown at once)
  sync(atRest = !this.awake && !this.drag, dt = 0) {
    const order = this.active().map((b, i) => i).sort((a, b) => this.bodies[a].position.y - this.bodies[b].position.y), done = [], redo = new Set();
    for (const i of order) {
      const b = this.bodies[i], s = this.sachets[i];
      s.position.set(b.position.x, b.position.y, b.position.z); s.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      const moving = b.sleepState !== CANNON.Body.SLEEPING || atRest || this.bend[i].shown < 0 || this.bend[i].easing;
      if (moving) {
        const B = this.bend[i];
        this.drape(i, done.flat().concat(this.obsNear(i)), atRest ? 1400 : 220);
        // (shown eased, a soft pack settling into its shape rather than snapping to it; never into what is under it)
        const held = this.drag?.i === i, a = atRest || !dt ? 1 : 1 - Math.exp(-dt / (held ? 0.05 : 0.11));
        let ch = false;
        for (let j = 0; j < NS; j++) {
          let v = B.v[j] + (B.u[j] - B.v[j]) * a; if (v > B.free[j]) v = B.free[j]; if (Math.abs(v - B.u[j]) < 1e-4) v = B.u[j];
          if (Math.abs(v - B.v[j]) > 1e-4) ch = true; B.v[j] = v;
        }
        B.easing = ch;
        if (ch || B.shown < 0) redo.add(i);
      }
      done.push(this.stationBoxes(i));
    }
    // how hard each is pressed by the ones lying on it (its top face within 2 mm of another)
    const all = order.map((i, k) => [i, done[k]]);
    for (const i of order) {
      const B = this.bend[i], b = this.bodies[i], q = new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      const ey = new THREE.Vector3(0, 1, 0).applyQuaternion(q), up = B.d.clone().negate(), P = new THREE.Vector3();
      const others = all.filter(([k]) => k !== i).flatMap(([, bx]) => bx);
      let ch = false;
      for (let j = 0; j < NS; j++) {
        let t = 0.2;
        if (this.world.gravity.y !== 0 && others.length) {
          P.copy(b.position).addScaledVector(ey, stY(j)).addScaledVector(B.d, B.v[j]).addScaledVector(up, ACROSS[j].th);
          for (const o of others) {
            const rx = P.x - o.c.x, ry = P.y - o.c.y, rz = P.z - o.c.z;
            if (rx * rx + ry * ry + rz * rz > 9) continue;
            let t0 = 0, t1 = t, hit = true;
            for (let k = 0; k < 3; k++) {
              const a = o.ax[k], p = rx * a.x + ry * a.y + rz * a.z, v = up.x * a.x + up.y * a.y + up.z * a.z, h2 = o.h[k];
              if (Math.abs(v) < 1e-9) { if (Math.abs(p) > h2) { hit = false; break; } continue; }
              let ta = (-h2 - p) / v, tb = (h2 - p) / v; if (ta > tb) { const tt = ta; ta = tb; tb = tt; }
              if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) { hit = false; break; }
            }
            if (hit) t = Math.min(t, t0);
          }
        }
        const pj = 1 - t / 0.2;
        if (Math.abs(pj - B.press[j]) > 0.02) ch = true;
        B.press[j] = pj;
      }
      if (ch) redo.add(i);
    }
    for (const i of redo) { this.bendMesh(i); this.bend[i].shown = 1; }
    const box = this.box.makeEmpty();
    for (let i = 0; i < this.count; i++) { this.sachets[i].updateMatrixWorld(true); for (const m of this.sachets[i].children) box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrix.clone().premultiply(this.sachets[i].matrix))); }
    if (atRest) this.contactShade();
    else { const mv = this.active().map((b, i) => (b.sleepState !== CANNON.Body.SLEEPING || this.drag?.i === i ? i : -1)).filter((i) => i >= 0); if (mv.length) this.contactShade(mv); }
  }
  // contact shading: how near each point comes to the other sachets (as they lie, bent) and the floor: the light that
  // can't get in there. Worked out at rest; off while they move
  contactShade(only = null) {   // (only: those sachets, the cheap way: floor, devices and the bag's light, not each other)
    // each other sachet in its own frame: a point's place along it gives the few stations near it straight away
    const fr = [];
    for (let i = 0; i < this.count; i++) {
      const b = this.bodies[i], q = new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w), e = new THREE.Matrix4().makeRotationFromQuaternion(q).elements;
      fr.push({ p: b.position, e, s: this.bend[i].s, u: this.bend[i].v });
    }
    const floorOn = this.world.gravity.y !== 0, E = this.encl, em = E ? E.m.elements : null;
    for (let i = 0; i < this.count; i++) {
      if (only && !only.includes(i)) continue;
      const mw = _m.compose(this.sachets[i].position, this.sachets[i].quaternion, new THREE.Vector3(1, 1, 1)), e = mw.elements;
      const others = only ? [] : fr.filter((_, k) => k !== i);
      const obs = only ? [] : this.obsNear(i, 8.5);   // (moving: the floor and the bag's light only, coarser)
      const shade = (P, v) => {
        const X = P[3 * v], Y = P[3 * v + 1], Z = P[3 * v + 2];
        const x = e[0] * X + e[4] * Y + e[8] * Z + e[12], y = e[1] * X + e[5] * Y + e[9] * Z + e[13], z = e[2] * X + e[6] * Y + e[10] * Z + e[14];
        let ao = 1;
        if (floorOn && y < 0.5) ao *= 1 - 0.42 * Math.exp(-Math.max(0, y) / 0.1);
        for (const o of others) {
          const dx = x - o.p.x, dy = y - o.p.y, dz = z - o.p.z, R = o.e;
          const lx = R[0] * dx + R[1] * dy + R[2] * dz, ly = R[4] * dx + R[5] * dy + R[6] * dz, lz = R[8] * dx + R[9] * dy + R[10] * dz;
          if (Math.abs(lx) > 2.6 || Math.abs(ly) > SACHET.L / 2 + 0.6 || Math.abs(lz) > 1.2) continue;
          const j0 = Math.round((SACHET.L / 2 - ly) / DS);
          for (let j = Math.max(0, j0 - 2); j <= Math.min(NS - 1, j0 + 2); j++) {
            const A2 = ACROSS[j], cz = o.u ? o.s * o.u[j] : 0;
            const a = Math.abs(lx) - A2.hw, b = Math.abs(ly - stY(j)) - DS / 2, c = Math.abs(lz - cz) - A2.th;
            const d = Math.hypot(Math.max(a, 0), Math.max(b, 0), Math.max(c, 0));
            if (d < 0.6) ao *= 1 - 0.2 * Math.exp(-d / 0.14);   // (each station a little; the ones about it add up)
          }
        }
        for (const o of obs) {   // a device's side or top close by
          const dx = x - o.c.x, dy = y - o.c.y, dz = z - o.c.z;
          if (dx * dx + dy * dy + dz * dz > (o.r + 1.2) * (o.r + 1.2)) continue;
          const a = Math.abs(dx * o.ax[0].x + dy * o.ax[0].y + dz * o.ax[0].z) - o.h[0], b = Math.abs(dx * o.ax[1].x + dy * o.ax[1].y + dz * o.ax[1].z) - o.h[1], c = Math.abs(dx * o.ax[2].x + dy * o.ax[2].y + dz * o.ax[2].z) - o.h[2];
          const d = Math.hypot(Math.max(a, 0), Math.max(b, 0), Math.max(c, 0));
          if (d < 1.2) ao *= 1 - 0.38 * Math.exp(-d / 0.3);
        }
        if (E) {   // in the bag: only the light that gets in through its mouth
          const bx = em[0] * x + em[4] * y + em[8] * z + em[12], by = em[1] * x + em[5] * y + em[9] * z + em[13], bz = em[2] * x + em[6] * y + em[10] * z + em[14];
          ao *= E.light(bx, by, bz);
        }
        return Math.max(0.12, ao);
      };
      for (const S of this.skins[i]) {
        const P = S.geo.attributes.position.array, A = S.geo.attributes.aAO.array, n = P.length / 3, gr = S.grid;
        if (!gr) { for (let v = 0; v < n; v++) A[v] = shade(P, v); }
        else {
          // the front and back grids: every st-th row and column (it is smooth), filled in between; the edge round them all
          const st = only ? 4 : 2, sel = (n2) => { const o = []; for (let k = 0; k < n2; k += st) o.push(k); if (o[o.length - 1] !== n2 - 1) o.push(n2 - 1); return o; };
          const R = sel(gr.nr), C = sel(gr.nc), nn = gr.nr * gr.nc;
          for (let f = 0; f < 2; f++) {
            const o = f * nn;
            for (const r of R) for (const c of C) A[o + r * gr.nc + c] = shade(P, o + r * gr.nc + c);
            for (let ri = 0; ri < R.length; ri++) for (let ci = 0; ci < C.length; ci++) {   // the cells between
              const r0 = R[ri], r1 = R[Math.min(ri + 1, R.length - 1)], c0 = C[ci], c1 = C[Math.min(ci + 1, C.length - 1)];
              const a00 = A[o + r0 * gr.nc + c0], a01 = A[o + r0 * gr.nc + c1], a10 = A[o + r1 * gr.nc + c0], a11 = A[o + r1 * gr.nc + c1];
              for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
                if ((r === r0 || r === r1) && (c === c0 || c === c1)) continue;
                const tr = r1 > r0 ? (r - r0) / (r1 - r0) : 0, tc = c1 > c0 ? (c - c0) / (c1 - c0) : 0;
                A[o + r * gr.nc + c] = (a00 * (1 - tc) + a01 * tc) * (1 - tr) + (a10 * (1 - tc) + a11 * tc) * tr;
              }
            }
          }
          for (let v = 2 * nn; v < n; v++) A[v] = shade(P, v);
        }
        S.geo.attributes.aAO.needsUpdate = true;
      }
    }
    this.LM.aoK.value = 1;
  }
  bounds() { return this.box.clone(); }
  // a frame: the simulation stepped by the time since the last (at most 1/20 s of it). true while anything moves
  step(now = performance.now()) {
    const dt = this.last ? Math.max(0, Math.min(0.05, (now - this.last) / 1000)) : 1 / 60;   // (never backwards)
    this.last = now;
    if (!this.awake && !this.drag) return false;
    this.acc += dt;
    let n = 0;
    while (this.acc >= STEP && n < 20) { this.tick(); this.acc -= STEP; n++; }
    if (this.acc > STEP) this.acc = 0;
    if (!this.sane()) { this.endDrag(false); this.drops++; this.arrange(this.arr, this.count, { settle: true }); return true; }
    // at rest: nothing faster than about a centimetre a second for a few frames (stacked boxes never quite stop
    // trembling), or 5 s after letting go: put to sleep where they are, their bend and contact shading finished
    if (this.drag) this.freeSince = now;
    const moving = this.drag || this.active().some((b) => b.sleepState !== CANNON.Body.SLEEPING && (b.velocity.lengthSquared() > 0.6 || b.angularVelocity.lengthSquared() > 0.01));
    this.still = moving ? 0 : (this.still || 0) + 1;
    if (this.still > 20 && this.steep()) { this.still = 0; for (const b of this.active()) b.wakeUp(); }   // (one still on its edge: it slumps first)
    if (this.still > 20 || (!this.drag && now - (this.freeSince || now) > (this.steep() ? 8000 : 5000))) { this.rest(); this.sync(true); return true; }
    this.sync(false, dt);
    return true;
  }
  // ---------------------------------------------------------------- the pointer
  pick(ray) {
    const hits = ray.intersectObjects(this.sachets.filter((s) => s.visible), true);
    if (!hits.length) return null;
    for (let o = hits[0].object; o; o = o.parent) { const i = this.sachets.indexOf(o); if (i >= 0) return { i, point: hits[0].point.clone() }; }
    return null;
  }
  // hold a sachet at a point on it, as fingers would: that point follows the hand smoothly (eased, never yanked), and
  // the sachet is brought gently level (floating: kept as it was taken), tipping a little as it is moved and drooping
  // either side of the fingers. Scroll turns it, eased too. Nothing is ever moved by jumps, so it shoves the others softly
  startDrag({ i, point }) {
    this.endDrag(false);
    const b = this.bodies[i];
    const l = b.quaternion.inverse().vmult(new CANNON.Vec3(point.x - b.position.x, point.y - b.position.y, point.z - b.position.z));
    const q = new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    const ey = new THREE.Vector3(0, 1, 0).applyQuaternion(q), ex = new THREE.Vector3(1, 0, 0).applyQuaternion(q), ez = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    // its length's heading on the floor (stood on end, its width's turned a quarter)
    const yaw = Math.hypot(ey.x, ey.z) > 0.2 ? Math.atan2(ey.x, ey.z) : Math.atan2(ex.x, ex.z) - Math.PI / 2;
    this.drag = { i, local: new THREE.Vector3(l.x, l.y, l.z), goal: new THREE.Vector3(point.x, point.y, point.z), pivot: new THREE.Vector3(point.x, point.y, point.z),
      face: ez.y >= 0 ? 1 : -1, yaw, turn: 0, cap: 22, q0: q.clone(), hv: new THREE.Vector3(), amp: 0, va: 0, ay: 0, vy: b.velocity.y };
    b.angularDamping = 0.6; b.linearDamping = 0.2; b.allowSleep = false; b.material = this.heldMat; b.wakeUp();
    for (const o of this.active()) o.wakeUp();
    this.wake();
  }
  dragTo(point) { if (!this.drag) return; this.drag.goal.set(point.x, point.y, point.z); for (const o of this.active()) o.wakeUp(); }
  turn(rad) { if (this.drag) { this.drag.turn += rad; this.bodies[this.drag.i].wakeUp(); } }
  // each step: the held one steered (its velocities eased towards what brings it where it should be)
  hold() {
    const D = this.drag; if (!D) return;
    const b = this.bodies[D.i], floating = this.world.gravity.y === 0;
    const q = new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    // where it should be: the held point at the hand (as it is turned now, so that point stays under the pointer)
    const at = D.local.clone().applyQuaternion(q).add(new THREE.Vector3(b.position.x, b.position.y, b.position.z));
    const err = D.goal.clone().sub(at);
    // (at most about a metre a second; but touching another sachet, slowly, so one drawn out from under the others or
    // pushed into them moves them gently instead of flicking them off)
    const touching = this.world.contacts.some((c) => (c.bi === b && c.bj !== b && this.bodies.includes(c.bj)) || (c.bj === b && this.bodies.includes(c.bi)));
    D.cap += ((touching ? 40 : 95) - D.cap) * (touching ? 0.2 : 0.01);
    const want = err.multiplyScalar(1 / 0.075), sp = want.length(); if (sp > D.cap) want.multiplyScalar(D.cap / sp);
    const k = 0.6;   // (firm: the many contact points' friction adds up, and a weaker hold stalled under the others)
    b.velocity.x += (want.x - b.velocity.x) * k; b.velocity.y += (want.y - b.velocity.y) * k; b.velocity.z += (want.z - b.velocity.z) * k;
    if (!floating) b.force.y += b.mass * G;   // (the hand holds its weight)
    // how it should be turned
    let qt;
    if (floating) qt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), D.turn).multiply(D.q0);
    else {
      const yaw = D.yaw + D.turn, ey = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), ez = new THREE.Vector3(0, D.face, 0), ex = ey.clone().cross(ez);
      qt = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, ey, ez));
      // tipped a little as it is moved (its leading edge lifting, as a held soft pack does), the hand's speed smoothed
      D.hv.x += (b.velocity.x - D.hv.x) * 0.02; D.hv.z += (b.velocity.z - D.hv.z) * 0.02;
      const hs = Math.hypot(D.hv.x, D.hv.z);
      if (hs > 0.5) qt.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(-D.hv.z / hs, 0, D.hv.x / hs), Math.min(0.13, hs / 700)));
      // the droop jiggling with the hand's ups and downs (a soft spring, a little bounce)
      const ay = (b.velocity.y - D.vy) / STEP; D.vy = b.velocity.y; D.ay += (ay - D.ay) * 0.04;
      const tgt = 1 + Math.max(-0.7, Math.min(1.2, D.ay / G)), w = 2 * Math.PI * 2.2;
      D.va += (w * w * (tgt - D.amp) - 2 * 0.42 * w * D.va) * STEP; D.amp += D.va * STEP;
    }
    const e = qt.multiply(q.clone().invert()); if (e.w < 0) { e.x = -e.x; e.y = -e.y; e.z = -e.z; e.w = -e.w; }
    const ang = 2 * Math.acos(Math.min(1, e.w)), sn = Math.sqrt(Math.max(0, 1 - e.w * e.w));
    const wv = new THREE.Vector3(); if (sn > 1e-6) wv.set(e.x / sn, e.y / sn, e.z / sn).multiplyScalar(Math.min(5, ang / 0.14));
    const ka = 0.12;
    b.angularVelocity.x += (wv.x - b.angularVelocity.x) * ka; b.angularVelocity.y += (wv.y - b.angularVelocity.y) * ka; b.angularVelocity.z += (wv.z - b.angularVelocity.z) * ka;
    D.pivot.copy(at);
  }
  endDrag(wake = true) {
    if (!this.drag) return;
    const b = this.bodies[this.drag.i];
    // (let go gently: it leaves the hand at no more than a soft toss, hardly turning)
    const v = b.velocity.length(); if (v > 45) b.velocity.scale(45 / v, b.velocity);
    b.angularVelocity.scale(0.3, b.angularVelocity); b.allowSleep = true; b.material = this.foil;
    const floating = this.world.gravity.y === 0;
    b.angularDamping = floating ? 0.9 : 0.42; b.linearDamping = floating ? 0.85 : 0.16;
    this.drag = null;
    if (wake) { this.wake(); for (const o of this.active()) o.wakeUp(); }
  }
  save() { return { count: this.count, arr: this.arr, gy: this.world.gravity.y, poses: this.bodies.map((b) => [b.position.clone(), b.quaternion.clone()]) }; }
  restore(s) {
    this.endDrag(false);
    this.count = s.count; this.arr = s.arr; this.setGravity(s.gy !== 0);
    for (let i = 0; i < MAX; i++) {
      const b = this.bodies[i], on = i < s.count, inW = this.world.bodies.includes(b);
      if (on && !inW) this.world.addBody(b); if (!on && inW) this.world.removeBody(b);
      this.sachets[i].visible = on;
      b.position.copy(s.poses[i][0]); b.quaternion.copy(s.poses[i][1]); b.velocity.setZero(); b.angularVelocity.setZero();
    }
    this.rest(); this.sync(true);
  }
  // a drop worked out ahead at a fixed step and kept, so a video's frames play it back exactly
  record(dur) {
    const was = this.save(), n = this.count;
    let frames, end;
    // (a fall that leaves one on its edge is tried again another way: none ends standing)
    for (let tries = 0; tries < 10; tries++) {
      const R = rng(4242 + tries * 13);
      frames = [];
      this.setGravity(true);
      for (let i = 0; i < n; i++) this.place(i, [(R() - 0.5) * 3, 9 + i * 5, (R() - 0.5) * 3], [-90 * DEG + (R() - 0.5) * 30 * DEG, R() * Math.PI * 2, (R() - 0.5) * 26 * DEG]);
      const steps = Math.ceil(dur / STEP);
      for (let k = 0; k <= steps; k++) {
        if (k % 3 === 0) frames.push(this.active().map((b) => [b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w]));
        this.tick();
      }
      end = { ...this.save(), arr: 'pile' };
      if (this.sane() && !this.steep()) break;
    }
    this.restore(was);
    return { frames, end, at: (t) => frames[Math.min(frames.length - 1, Math.max(0, Math.round(t * (frames.length - 1))))] };
  }
  // one recorded frame shown (bodies set to it, the meshes bent; the contact shading only on the last)
  showFrame(pose, last = false) {
    this.active().forEach((b, k) => { const p = pose[k]; b.position.set(p[0], p[1], p[2]); b.quaternion.set(p[3], p[4], p[5], p[6]); b.wakeUp(); });
    this.sync(last);
  }
}
