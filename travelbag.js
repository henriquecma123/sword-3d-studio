// Sword travel bag (Women's Health): Bloom's reward travel bag (Figma "11. Project R (Legacy improvements)", node
// 3793:57886 "reward-lg-travel-bag"), rebranded with the Sword logo where it carries Bloom's. Built in code from the
// node's product photo (ref/raw_image_1.png): an off-white faux-leather wash bag, sewn as a real one is: a front and a
// back panel, each pillowed out, joined by a gusset strip running round the ends and the top (it bulges past the seams),
// piping in both seams; a metal zip along the gusset's middle, from low on one end over the top to low on the other,
// its slider and long pull tab resting at the right end's foot; a stitched strip closing the ends below the zip.
// What makes it read as real rather than modelled: the leather puckers a little along every seam (the stitching gathers
// it), the gusset folds where it bends round the top corners, the panels are never quite even, the creases and seams
// are shaded darker (soft occlusion, baked into the vertices), the leather has a pebbled grain that breaks up its
// satin sheen, and the logo is a glossier print on it.
// Units: centimetres. Local frame: x along the bag, y up, z towards its front (the logo side); centred, resting on the floor.
import * as THREE from 'three';

const base = new URL('./', import.meta.url);
const loadImg = (name) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = new URL(name, base).href; });
const logoImg = await loadImg('assets/sword-logo-mono.svg');
const LOGO_AR = 285 / 69.5205;   // the SVG's viewBox

// sizes (cm), from the photo (its camera: about 19 degrees to the right of front on, 8 above; solved from where the
// right end's zip and silhouette fall beside the front seam)
export const BAG = {
  W: 24, H: 13.8, D: 9,                       // the panels' outline (1.74 : 1, as in the photo) and the gusset's width between the seams
  Rc: 1.3, Rcrest: 3.4,                       // the outline's corner radius; the gusset crest's (its top corners roll over broadly)
  bow: 0.28,                                  // its ends bowing out at mid-height (a filled bag)
  sag: 0.15,                                  // its top dipping in the middle
  pinch: { x: -1.3, d: 0.08, w: 1.4 },        // and a small pinch in the top seam, left of the middle (the photo's)
  puff: 1.05,                                 // the front and back panels' pillowing
  bulge: { end: 0.95, top: 0.75, bottom: 0.4 },   // the gusset's, past the seams, in its middle (underneath: flat, the seams lifted off the floor)
  pucker: 0.03,                               // the leather gathered along the seams by the stitching (its ripples' height)
  folds: 0.09,                                // the gusset's folds where it bends round the top corners
  pipe: 0.1,                                  // the piping's radius
  zip: { w: 0.6, low: 5.4 },                  // the teeth's width; how high its ends are (the slider's foot)
  band: 4.8,                                  // the end strips' top edge, stitched over the gusset
  logo: { w: 5.0, x: 0, y: 0 },               // the Sword logo, on the front and the back panels: width, its middle's offset from the panel's (centred)
  color: '#e2e1db',                           // off-white faux leather, near neutral (the photo's; the studio's tone mapping warms a creamier one to yellow)
};
const a = BAG.W / 2, b = BAG.H / 2, c = BAG.D / 2;
const sq = (x) => x * x, clamp = (x, l, h) => Math.max(l, Math.min(h, x));
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------------------------------------ noise
// value noise and its sum over octaves (in about -1..1), for the leather's unevenness, folds and puckering
const hash3 = (x, y, z) => { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), u = smooth(0, 1, x - xi), v = smooth(0, 1, y - yi), w = smooth(0, 1, z - zi);
  const L = (p, q, t) => p + (q - p) * t, h = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  return 2 * L(L(L(h(0, 0, 0), h(1, 0, 0), u), L(h(0, 1, 0), h(1, 1, 0), u), v), L(L(h(0, 0, 1), h(1, 0, 1), u), L(h(0, 1, 1), h(1, 1, 1), u), v), w) - 1;
}
const fbm = (x, y, z, oct = 3) => { let s = 0, amp = 1, f = 1, n = 0; for (let i = 0; i < oct; i++) { s += amp * vnoise(x * f, y * f, z * f); n += amp; amp *= 0.5; f *= 2.03; } return s / n; };
// the puckering along a seam, by length along it (each seam its own): ripples about 1.7 cm apart, uneven in phase and height
const pucker = (s, seed) => Math.sin((2 * Math.PI * s) / 1.7 + 2.6 * fbm(s * 0.3, seed, 0.5, 2)) * clamp(0.55 + 0.9 * fbm(s * 0.45, seed + 5.3, 1.7, 2), 0.15, 1);
// how much a point at distance d (cm) from a seam takes of its puckering: none on the stitch line, most 0.3 cm off it,
// little past a centimetre
const puckW = (d) => { const t = Math.max(0, d) / 0.3; return t * Math.exp(1 - t) * Math.exp(-sq(Math.max(0, d) / 1.2)); };
// soft occlusion in a seam's crease, by distance from it
const creaseAO = (d) => 1 - 0.3 * Math.exp(-Math.max(0, d) / 0.28) - 0.08 * Math.exp(-Math.max(0, d) / 1.1);

// ------------------------------------------------------------------------------------------------ the seams' outline
// four sides between the corners' middles, counter-clockwise from the right end: right (bottom-right corner to top-
// right), top, left, bottom. Each sampled densely on the rounded rectangle, bowed and sagged, then evenly by length.
function deform(x, y) {
  x += Math.sign(x) * BAG.bow * Math.max(0, 1 - sq(y / b));
  let dip = 0;
  if (y > 0) dip = smooth(0.15 * b, b, y) * (BAG.sag * Math.exp(-sq(x / (0.3 * BAG.W))) + BAG.pinch.d * Math.exp(-sq((x - BAG.pinch.x) / BAG.pinch.w)));
  return [x, y - dip, dip];   // (the dip kept: the gusset's crest is lifted back most of it, the zip running straighter than the seams)
}
function resample(pts, n) {
  const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const tot = L[L.length - 1], out = []; let j = 0;
  for (let k = 0; k < n; k++) {
    const sv = (tot * k) / (n - 1); while (j < L.length - 2 && L[j + 1] < sv) j++;
    const f = (sv - L[j]) / Math.max(1e-9, L[j + 1] - L[j]);
    out.push(pts[j].map((q, k2) => q + (pts[j + 1][k2] - q) * f));
  }
  return out;
}
function side(k, n, Rs = [BAG.Rc, BAG.Rc, BAG.Rc, BAG.Rc]) {   // (the corners' radii: bottom right, top right, top left, bottom left)
  const CORNERS = [[a - Rs[0], -b + Rs[0]], [a - Rs[1], b - Rs[1]], [-a + Rs[2], b - Rs[2]], [-a + Rs[3], -b + Rs[3]]];
  const C0 = CORNERS[k], C1 = CORNERS[(k + 1) % 4], R0 = Rs[k], R1 = Rs[(k + 1) % 4], m = (Math.PI / 2) * k, pts = [];
  for (let i = 0; i <= 60; i++) { const t = m - Math.PI / 4 + (Math.PI / 4) * (i / 60); pts.push([C0[0] + R0 * Math.cos(t), C0[1] + R0 * Math.sin(t)]); }
  const A = [C0[0] + R0 * Math.cos(m), C0[1] + R0 * Math.sin(m)], B2 = [C1[0] + R1 * Math.cos(m), C1[1] + R1 * Math.sin(m)];
  for (let i = 1; i < 400; i++) pts.push([A[0] + ((B2[0] - A[0]) * i) / 400, A[1] + ((B2[1] - A[1]) * i) / 400]);
  for (let i = 0; i <= 60; i++) { const t = m + (Math.PI / 4) * (i / 60); pts.push([C1[0] + R1 * Math.cos(t), C1[1] + R1 * Math.sin(t)]); }
  return resample(pts.map(([x, y]) => deform(x, y)), n);
}
const NS = { end: 90, long: 170 };
const SIDES = [0, 1, 2, 3].map((k) => side(k, k % 2 ? NS.long : NS.end));
// the gusset's crest runs round wider top corners than the seams (the photo: they roll over broadly)
const CREST = [0, 1, 2, 3].map((k) => side(k, k % 2 ? NS.long : NS.end, [BAG.Rc, BAG.Rcrest, BAG.Rcrest, BAG.Rc]));   // (the bottom's stay: it rests flat)
// the closed loops (each side's last point is the next one's first: dropped), with outward normals and the gusset's bulge
const loopOf = (sides) => { const L = []; for (const s of sides) for (let i = 0; i < s.length - 1; i++) L.push(s[i]); return L; };
const normalsOf = (L) => L.map((_, i) => { const pa = L[(i - 1 + L.length) % L.length], pb = L[(i + 1) % L.length], tx = pb[0] - pa[0], ty = pb[1] - pa[1], l = Math.hypot(tx, ty) || 1; return [ty / l, -tx / l]; });
const L1 = loopOf(SIDES), L2 = loopOf(CREST), N1 = normalsOf(L1), N2 = normalsOf(L2);
const LOOP = L1.map((p, i) => ({ p, n: N1[i], p2: L2[i], n2: N2[i] }));
// each side's length and where it starts along the loop (for the seams' puckering)
const SIDE_LEN = SIDES.map((s) => { let L = 0; for (let i = 1; i < s.length; i++) L += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]); return L; });
const SIDE_S0 = SIDE_LEN.map((_, k) => SIDE_LEN.slice(0, k).reduce((p, q) => p + q, 0));
{ let sAcc = 0; for (let i = 0; i < LOOP.length; i++) { if (i) sAcc += Math.hypot(LOOP[i].p[0] - LOOP[i - 1].p[0], LOOP[i].p[1] - LOOP[i - 1].p[1]); LOOP[i].s = sAcc; } }
for (let i = 0; i < LOOP.length; i++) {
  const o = LOOP[i], n = o.n;
  o.B = BAG.bulge.end * n[0] * n[0] + (n[1] > 0 ? BAG.bulge.top : BAG.bulge.bottom) * n[1] * n[1];
  o.k = 2 + 4 * sq(Math.max(0, -n[1]));   // the gusset's profile: round on the ends and top, flat underneath
  o.zip = smooth(-b + BAG.zip.low - 0.25, -b + BAG.zip.low + 0.25, o.p[1]);   // along the zip (sunk a little there)
  o.strip = (1 - smooth(-b + BAG.band - 0.06, -b + BAG.band + 0.06, o.p[1])) * n[0] * n[0];   // under the end strips (a layer over the gusset)
  // the top corners: the gusset bends round them and folds (most at a corner's middle, none on the top or the ends)
  const ph = Math.atan2(o.n2[1], o.n2[0]);
  o.corner = o.n2[1] > 0 ? sq(Math.sin(2 * ph)) : 0;
}

// ------------------------------------------------------------------------------------------------ the surfaces
// the gusset across its width (w from -1 at the back seam to 1 at the front): it leaves each seam steeply, rounds out
// to its bulge in the middle (flat underneath), and sinks a little along the zip; gathered along both seams, folded
// round the top corners, never quite even
const prof = (w, k = 2) => Math.max(0, 1 - Math.pow(Math.abs(w), k));
const sink = (w) => 0.03 * Math.exp(-sq((w * c) / 0.5));
function gusDetail(o, w) {   // the gusset's displacement off its smooth shape (cm, outward)
  const dSeam = (1 - Math.abs(w)) * c, f = prof(w);
  const pk = BAG.pucker * puckW(dSeam) * pucker(o.s, w > 0 ? 11.3 : 23.9);
  const fold = BAG.folds * o.corner * Math.pow(f, 0.6) * Math.sin((2 * Math.PI * o.s) / 2.3 + 1.7 + 2 * fbm(w * 0.6, o.s * 0.2, 4.1, 2));
  const und = 0.06 * f * fbm(o.p[0] / 5, o.p[1] / 5, w * 0.9 + 9.1, 3) * (1 - 0.8 * sq(Math.max(0, -o.n[1])));   // (not underneath: it rests on the floor)
  return pk + fold + und;
}
const gusAt = (o, w, lift = 0) => {
  const f = prof(w, o.k), h = (o.B + 0.85 * o.p[2]) * f - o.zip * sink(w) + 0.08 * o.strip * Math.min(1, 4 * f) + gusDetail(o, w) + lift;
  const fc = prof(w), px = o.p[0] + (o.p2[0] - o.p[0]) * fc, py = o.p[1] + (o.p2[1] - o.p[1]) * fc;   // from the seam's outline to the crest's
  let nx = o.n[0] + (o.n2[0] - o.n[0]) * fc, ny = o.n[1] + (o.n2[1] - o.n[1]) * fc; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
  return [px + nx * h, py + ny * h, w * c];
};
// its soft occlusion: dark in the seams' creases and along the zip's channel, the puckers and folds shaded with their
// relief
function gusAO(o, w) {
  let ao = creaseAO((1 - Math.abs(w)) * c * 1.1);
  if (o.zip > 0) ao *= 1 - 0.28 * o.zip * Math.exp(-Math.max(0, Math.abs(w) * c - (BAG.zip.w / 2 + 0.12)) / 0.16);
  ao += 1.4 * gusDetail(o, w) * (1 - 0.6 * prof(w));
  return clamp(ao, 0.5, 1);
}
// rows across the gusset, closer together near the seams (where it turns fastest)
const WROWS = 48, wRow = (j) => Math.sin((Math.PI / 2) * (-1 + (2 * j) / WROWS));

// a panel: a Coons patch inside the outline (its four sides as the patch's borders), pillowed: flat-ish in the middle,
// fuller low down (what's in it settles), rolling into the seam at its edges; puckered along the seams, a soft valley
// under the top seam, a few creases where the photo has them, faint unevenness (z sign: 1 front, -1 back)
const at = (crv, u) => { const f = clamp(u, 0, 1) * (crv.length - 1), i = Math.min(crv.length - 2, Math.floor(f)), t = f - i; return [crv[i][0] + (crv[i + 1][0] - crv[i][0]) * t, crv[i][1] + (crv[i + 1][1] - crv[i][1]) * t]; };
const CB = SIDES[3], CT = SIDES[1].slice().reverse(), CL = SIDES[2].slice().reverse(), CR = SIDES[0];
function coons(u, v) {
  const b0 = at(CB, u), t0 = at(CT, u), l0 = at(CL, v), r0 = at(CR, v), P00 = CB[0], P10 = CB[CB.length - 1], P01 = CT[0], P11 = CT[CT.length - 1];
  return [0, 1].map((k) => (1 - v) * b0[k] + v * t0[k] + (1 - u) * l0[k] + u * r0[k] - ((1 - u) * (1 - v) * P00[k] + u * (1 - v) * P10[k] + (1 - u) * v * P01[k] + u * v * P11[k]));
}
const pil = (U, m) => Math.pow(Math.max(0, 1 - Math.pow(Math.abs(U), m)), 0.6);
function panelAt(u, v, zs) {
  const [x, y] = coons(u, v), X = x * zs;
  const d = pil(2 * u - 1, 2.6) * pil(2 * v - 1, 1.8) * (1 + 0.12 * clamp(-y / b, -1, 1));
  const fold = (q, w) => Math.exp(-sq(q / w));
  const crease = 0.05 * fold(y - (b - 1.3), 0.9) * fold(X - BAG.pinch.x, 1.2)                       // under the top seam's pinch
               + 0.035 * fold(y - (b - 1.6), 0.8) * pil(2 * u - 1, 4)                               // a soft valley under the whole top seam
               + 0.035 * fold((X - (a - 3.4)) * 0.94 - (y + 1.4) * 0.34, 0.9) * fold(y + 1.4, 3.0)   // a soft fold by the right end
               + 0.025 * fold(X + (a - 2.8), 1.0) * fold(y - 0.6, 2.6);                             // a softer one by the left
  // the four seams: each one's nearest point (the patch's border at the same parameter) and its length along the loop
  const ss = [[at(CR, v), SIDE_S0[0] + v * SIDE_LEN[0]], [at(CT, u), SIDE_S0[1] + (1 - u) * SIDE_LEN[1]], [at(CL, v), SIDE_S0[2] + (1 - v) * SIDE_LEN[2]], [at(CB, u), SIDE_S0[3] + u * SIDE_LEN[3]]];
  let pk = 0, e = 0; const dks = [];
  for (const [q, s] of ss) { const dk = Math.hypot(x - q[0], y - q[1]); dks.push(dk); pk += puckW(dk) * pucker(s, zs > 0 ? 11.3 : 23.9); e += Math.exp(-dk / 0.15); }
  const dSeam = -0.15 * Math.log(e || 1e-12);   // (the nearest seam's distance, smoothly)
  const und = 0.07 * Math.sqrt(d) * fbm(X / 5.5, y / 5.5, zs * 3.7 + 0.4, 3);
  const detail = BAG.pucker * pk + und;
  const p = [x, y, zs * (c + BAG.puff * d - crease * Math.sqrt(d) + detail)];
  p.ao = clamp(creaseAO(dSeam) - 1.6 * crease * Math.sqrt(d) + 1.4 * BAG.pucker * pk + 0.8 * und, 0.5, 1);
  p.meta = { zs, s: [ss[0][1], ss[1][1], ss[2][1]], d: dks.slice(0, 3) };   // (its seams with the zip, for the opening)
  return p;
}
const panelRow = (k, n) => 0.5 + 0.5 * Math.sin((Math.PI / 2) * (-1 + (2 * k) / n));   // rows closer near the seams

// a grid mesh from a point function; normals from the grid itself, turned outward (out(p, n) > 0); an optional grey
// per vertex (its occlusion)
function gridGeo(nu, nv, P, out, uvOf, wrapU = false, aoOf = null) {
  const cols = wrapU ? nu : nu + 1, pts = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i < cols; i++) pts.push(P(i, j));
  const pos = [], nrm = [], uv = [], col = [], idx = [], get = (i, j) => pts[j * cols + i];
  for (let j = 0; j <= nv; j++) for (let i = 0; i < cols; i++) {
    const p = get(i, j);
    const ia = wrapU ? (i - 1 + cols) % cols : Math.max(0, i - 1), ib = wrapU ? (i + 1) % cols : Math.min(cols - 1, i + 1);
    const ja = Math.max(0, j - 1), jb = Math.min(nv, j + 1);
    const U = [0, 1, 2].map((k) => get(ib, j)[k] - get(ia, j)[k]), V = [0, 1, 2].map((k) => get(i, jb)[k] - get(i, ja)[k]);
    let n = [U[1] * V[2] - U[2] * V[1], U[2] * V[0] - U[0] * V[2], U[0] * V[1] - U[1] * V[0]];
    const ln = Math.hypot(...n) || 1; n = n.map((q) => q / ln);
    if (out(p, n, i, j) < 0) n = n.map((q) => -q);
    pos.push(p[0], p[1], p[2]); nrm.push(...n); uv.push(...uvOf(p, i, j));
    if (aoOf) { const g = aoOf(p, i, j); col.push(g, g, g); }
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const i2 = wrapU ? (i + 1) % cols : i + 1, A = j * cols + i, B2 = j * cols + i2, C = (j + 1) * cols + i2, D = (j + 1) * cols + i;
    idx.push(A, B2, C, A, C, D);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  if (aoOf) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  windOut(g); return g;
}
// a grid surface that moves (the zip opening): its rest points from P once (each may carry a `meta` for the mover),
// then moved by move(meta) -> [dx, dy, dz] or null, its normals re-taken from the grid each time and turned outward by
// out(nx, ny, nz, meta). Row j is not joined to row j + 1 where cut(j) (the zip's two lips)
function liveGrid({ nu, nv, wrapU = false, P, out, uvOf = () => [0.5, 0.5], aoOf = null, cut = () => false }) {
  const cols = wrapU ? nu : nu + 1, rows = nv + 1, n = cols * rows, base = new Float32Array(n * 3), meta = new Array(n);
  const uv = new Float32Array(n * 2), col = aoOf ? new Float32Array(n * 3) : null;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const k = j * cols + i, p = P(i, j); base[3 * k] = p[0]; base[3 * k + 1] = p[1]; base[3 * k + 2] = p[2]; meta[k] = p.meta;
    const t = uvOf(p, i, j); uv[2 * k] = t[0]; uv[2 * k + 1] = t[1];
    if (col) { const g = aoOf(p, i, j); col[3 * k] = col[3 * k + 1] = col[3 * k + 2] = g; }
  }
  const pos = new Float32Array(base), nrm = new Float32Array(n * 3), idx = [];
  for (let j = 0; j < rows - 1; j++) {
    if (cut(j)) continue;
    for (let i = 0; i < nu; i++) { const i2 = wrapU ? (i + 1) % cols : i + 1, A = j * cols + i, B2 = j * cols + i2, C = (j + 1) * cols + i2, D = (j + 1) * cols + i; idx.push(A, B2, C, A, C, D); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const inner = new Float32Array(n); g.setAttribute('aInner', new THREE.BufferAttribute(inner, 1));
  g.setIndex(idx);
  const normals = () => {
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const ia = wrapU ? (i - 1 + cols) % cols : Math.max(0, i - 1), ib = wrapU ? (i + 1) % cols : Math.min(cols - 1, i + 1);
      const ja = j > 0 && !cut(j - 1) ? j - 1 : j, jb = j < rows - 1 && !cut(j) ? j + 1 : j;
      const a1 = 3 * (j * cols + ia), b1 = 3 * (j * cols + ib), a2 = 3 * (ja * cols + i), b2 = 3 * (jb * cols + i);
      const Ux = pos[b1] - pos[a1], Uy = pos[b1 + 1] - pos[a1 + 1], Uz = pos[b1 + 2] - pos[a1 + 2], Vx = pos[b2] - pos[a2], Vy = pos[b2 + 1] - pos[a2 + 1], Vz = pos[b2 + 2] - pos[a2 + 2];
      let nx = Uy * Vz - Uz * Vy, ny = Uz * Vx - Ux * Vz, nz = Ux * Vy - Uy * Vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      const k = j * cols + i;
      if (out(nx, ny, nz, meta[k]) < 0) { nx = -nx; ny = -ny; nz = -nz; }
      nrm[3 * k] = nx; nrm[3 * k + 1] = ny; nrm[3 * k + 2] = nz;
    }
  };
  normals(); windOut(g); g.computeBoundingSphere(); g.computeBoundingBox();
  const update = (move, innerOf = null) => {
    if (innerOf) { for (let k = 0; k < n; k++) inner[k] = innerOf(meta[k]); g.attributes.aInner.needsUpdate = true; }
    for (let k = 0; k < n; k++) {
      const d = move ? move(meta[k]) : null;
      pos[3 * k] = base[3 * k] + (d ? d[0] : 0); pos[3 * k + 1] = base[3 * k + 1] + (d ? d[1] : 0); pos[3 * k + 2] = base[3 * k + 2] + (d ? d[2] : 0);
    }
    normals(); g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true; g.computeBoundingSphere(); g.computeBoundingBox();
  };
  return { geo: g, base, meta, update, normal: new Float32Array(nrm), nu, nv, wrapU, cut, cols, out };
}
function windOut(g) {   // every triangle wound to face its vertices' normals
  const P = g.attributes.position, N = g.attributes.normal, ix = g.index.array, v = (A, i) => [A.getX(i), A.getY(i), A.getZ(i)];
  for (let k = 0; k < ix.length; k += 3) {
    const A = v(P, ix[k]), B2 = v(P, ix[k + 1]), C = v(P, ix[k + 2]);
    const u = [B2[0] - A[0], B2[1] - A[1], B2[2] - A[2]], w = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const cr = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    let d = 0; for (const i of [ix[k], ix[k + 1], ix[k + 2]]) d += cr[0] * N.getX(i) + cr[1] * N.getY(i) + cr[2] * N.getZ(i);
    if (d < 0) { const t = ix[k + 1]; ix[k + 1] = ix[k + 2]; ix[k + 2] = t; }
  }
}
const mergeGeos = (gs) => {
  const pos = [], nrm = [], uv = [], col = [], idx = [], withCol = gs.every((g) => g.attributes.color); let off = 0;
  for (const g of gs) {
    const gi = g.index ? g : null, n = g.attributes.position.count;
    for (let i = 0; i < n * 3; i++) { pos.push(g.attributes.position.array[i]); nrm.push(g.attributes.normal.array[i]); if (withCol) col.push(g.attributes.color.array[i]); }
    for (let i = 0; i < n * 2; i++) uv.push(g.attributes.uv.array[i]);
    if (gi) for (const i of g.index.array) idx.push(i + off); else for (let i = 0; i < n; i++) idx.push(i + off);
    off += n;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  m.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); if (withCol) m.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  m.setIndex(idx); return m;
};
// a tube along a path of points (closed or not); its rings square to the path, 'up' towards hint(p, i) (default:
// outward); optionally a grey per vertex from its ring and direction (its occlusion)
function tube(pts, radius, closed, seg = 14, hint = (p) => p, aoOf = null) {
  const n = pts.length, pos = [], nrm = [], col = [], idx = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i], pa = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], pb = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const T = new THREE.Vector3(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]).normalize();
    let up = new THREE.Vector3(...hint(p, i)).normalize(); up = up.sub(T.clone().multiplyScalar(up.dot(T))).normalize();
    const sd = new THREE.Vector3().crossVectors(T, up);
    for (let k = 0; k < seg; k++) {
      const ang = (2 * Math.PI * k) / seg, d = up.clone().multiplyScalar(Math.cos(ang)).add(sd.clone().multiplyScalar(Math.sin(ang)));
      pos.push(p[0] + d.x * radius, p[1] + d.y * radius, p[2] + d.z * radius); nrm.push(d.x, d.y, d.z);
      if (aoOf) { const g = aoOf(i, Math.cos(ang)); col.push(g, g, g); }
    }
  }
  const rings = closed ? n : n - 1;
  for (let i = 0; i < rings; i++) for (let k = 0; k < seg; k++) {
    const i2 = (i + 1) % n, k2 = (k + 1) % seg;
    idx.push(i * seg + k, i2 * seg + k, i2 * seg + k2, i * seg + k, i2 * seg + k2, i * seg + k2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0.5), 2)); g.setIndex(idx);
  if (aoOf) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  windOut(g); return g;
}
function roundedBoxGeo(w, h, d, rr, seg = [6, 6, 4]) {   // a small rounded block
  const g = new THREE.BoxGeometry(w, h, d, ...seg), p = g.attributes.position, v = new THREE.Vector3();
  const hx = w / 2 - rr, hy = h / 2 - rr, hz = d / 2 - rr;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const m = new THREE.Vector3(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
    const dd = v.clone().sub(m); if (dd.lengthSq() > 0) dd.setLength(rr); p.setXYZ(i, m.x + dd.x, m.y + dd.y, m.z + dd.z);
  }
  g.computeVertexNormals(); return g;
}
// a rounded rectangle path (for the pull's outline and its holes)
function roundRect(sh, x0, y0, x1, y1, r) {
  sh.moveTo(x0 + r, y0); sh.lineTo(x1 - r, y0); sh.quadraticCurveTo(x1, y0, x1, y0 + r); sh.lineTo(x1, y1 - r); sh.quadraticCurveTo(x1, y1, x1 - r, y1);
  sh.lineTo(x0 + r, y1); sh.quadraticCurveTo(x0, y1, x0, y1 - r); sh.lineTo(x0, y0 + r); sh.quadraticCurveTo(x0, y0, x0 + r, y0);
  return sh;
}
// smooth normals across edges flatter than `angle` degrees, sharp across steeper ones (a stamped or cast part: its faces
// flat, its bevels rounded and catching the light); non-indexed out
function creased(g, angle = 25) {
  g = g.index ? g.toNonIndexed() : g;
  const P = g.attributes.position, n = P.count, cosA = Math.cos((angle * Math.PI) / 180), fn = [], map = new Map();
  const key = (i) => `${Math.round(P.getX(i) * 2e4)},${Math.round(P.getY(i) * 2e4)},${Math.round(P.getZ(i) * 2e4)}`;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  for (let t = 0; t < n / 3; t++) {
    A.fromBufferAttribute(P, 3 * t); B.fromBufferAttribute(P, 3 * t + 1); C.fromBufferAttribute(P, 3 * t + 2);
    const f = new THREE.Vector3().subVectors(C, B).cross(new THREE.Vector3().subVectors(A, B));
    fn.push({ f, u: f.clone().normalize() });
    for (let k = 0; k < 3; k++) { const kk = key(3 * t + k); let l = map.get(kk); if (!l) map.set(kk, (l = [])); l.push(t); }
  }
  const nrm = new Float32Array(n * 3), sum = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const me = fn[Math.floor(i / 3)].u; sum.set(0, 0, 0);
    for (const t of map.get(key(i))) if (fn[t].u.dot(me) > cosA) sum.add(fn[t].f);
    if (sum.lengthSq() === 0) sum.copy(me);
    sum.normalize(); nrm[3 * i] = sum.x; nrm[3 * i + 1] = sum.y; nrm[3 * i + 2] = sum.z;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}
// a superellipsoid: a rounded block, its half sizes a (x), b (y), cz (z); e1 its roundness up and down, e2 round its
// sides (near 0 boxy, 1 round); `shape(p)` bends its points before its normals are taken (smooth, outward)
function superGeo(a, b, cz, e1, e2, nu = 10, nv = 28, shape = null) {
  const sp = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e), pos = [], idx = [];
  for (let i = 0; i <= nu; i++) {
    const u = -Math.PI / 2 + (Math.PI * i) / nu, cu = Math.cos(u), su = Math.sin(u);
    for (let j = 0; j < nv; j++) {
      const v = -Math.PI + (2 * Math.PI * j) / nv, p = [a * sp(cu, e1) * sp(Math.cos(v), e2), b * sp(su, e1), cz * sp(cu, e1) * sp(Math.sin(v), e2)];
      pos.push(...(shape ? shape(p) : p));
    }
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const j2 = (j + 1) % nv, A = i * nv + j, B2 = i * nv + j2, C = (i + 1) * nv + j2, D = (i + 1) * nv + j; idx.push(A, B2, C, A, C, D); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.computeVertexNormals();
  const k = Math.floor(nu / 2) * nv + nv / 2;   // (a point on its +x side, v = 0: its normal must point out along +x)
  if (g.attributes.normal.getX(k) < 0) { const ix = g.index.array; for (let t = 0; t < ix.length; t += 3) { const q = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = q; } g.computeVertexNormals(); }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  return g;
}
// a zip tooth (a no. 5 metal zip): a small stamped block, flat on top with its edges rounded (normals exact, so its
// highlights run clean along them), seen from above a rounded rectangle, its head (reaching over the chain's middle
// between two of the other row's) narrower. x along the chain, y up (foot at -0.03, top at 0.04), its head towards +z
// Its crown has the small cup a real tooth has near its head (where the other row's tooth sits), its leg a faint
// crimp line where it is clamped on the tape
function toothGeo() {
  const w = 0.15, h = 0.07, d = 0.31, rr = 0.03, g = new THREE.BoxGeometry(w, h, d, 8, 4, 18), P = g.attributes.position, N = g.attributes.normal, v = new THREE.Vector3();
  const hx = w / 2 - rr, hy = h / 2 - rr, hz = d / 2 - rr, cup = { z: 0.075, rx: 0.036, rz: 0.045, d: 0.005 }, crimp = { z: -0.085, w: 0.012, d: 0.005 };
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i);
    const m = new THREE.Vector3(clamp(v.x, -hx, hx), clamp(v.y, -hy, hy), clamp(v.z, -hz, hz)), dd = v.clone().sub(m);
    if (dd.lengthSq() > 1e-12) { dd.normalize(); N.setXYZ(i, dd.x, dd.y, dd.z); dd.multiplyScalar(rr); }
    const p = m.add(dd), head = smooth(-0.02, d / 2, p.z);
    let y = p.y + 0.005;
    if (N.getY(i) > 0.999) {   // on the crown: the cup and the crimp line, their normals from their slopes
      const e1 = Math.exp(-sq(p.x / cup.rx) - sq((p.z - cup.z) / cup.rz)), e2 = Math.exp(-sq((p.z - crimp.z) / crimp.w));
      y -= cup.d * e1 + crimp.d * e2;
      const gx = cup.d * e1 * (2 * p.x / sq(cup.rx)), gz = cup.d * e1 * (2 * (p.z - cup.z) / sq(cup.rz)) + crimp.d * e2 * (2 * (p.z - crimp.z) / sq(crimp.w));
      const l = Math.hypot(gx, 1, gz); N.setXYZ(i, gx / l, 1 / l, gz / l);
    }
    P.setXYZ(i, p.x * (1 - 0.3 * head * head), y, p.z);
  }
  return g;
}
// the slider: a pressed body, its shoulders at its foot (where the rows part) narrowing to its neck at its head (where
// they run in closed), its outer face crowned, its edges rounded; its inner face at x = 0, its outer about 0.38,
// centred along y, across z
function sliderBodyGeo() {
  const b = 0.65;
  const body = superGeo(0.17, b, 0.46, 0.22, 0.22, 36, 64, ([x, y, z]) => {
    const t = (y / b + 1) / 2, w = 1 - 0.36 * t;   // (narrower towards its head)
    const zz = z * w, crown = x > 0 ? 0.13 * Math.max(0, 1 - sq(z / 0.46)) * (0.75 + 0.25 * Math.max(0, 1 - sq(y / b))) * smooth(0.0, 0.17, x) : 0;
    return [x + 0.17 + crown, y, zz];
  });
  // its flanges: the sides turned down round the chain to the tape, following the body's taper
  const flanges = [-1, 1].map((sd) => superGeo(0.11, 0.6, 0.035, 0.3, 0.3, 12, 20, ([x, y, z]) => {
    const t = (y / 0.6 + 1) / 2, half = 0.46 * (1 - 0.36 * t) - 0.04;
    return [x + 0.02, y, sd * half + z];
  }));
  return mergeGeos([body, ...flanges]);
}
// its bridge: a wire arch standing off the outer face near the foot, across it (the pull's head curls round its top)
function bridgeGeo() {
  const pts = [[-0.02, -0.23], [0.11, -0.23], [0.18, -0.15], [0.19, 0], [0.18, 0.15], [0.11, 0.23], [-0.02, 0.23]].map(([x, z]) => new THREE.Vector3(x, 0, z));
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 40, 0.042, 14, false);
}
// the pull tab: a plate with a narrow neck under its head, flaring to the tab, rounded at its foot, a slot near its foot
// cut through; its head rolled round the slider's bridge. In its own frame: across x, hanging down y from the curl's
// start at the origin, its thickness along z; the bridge's wire at (0, 0, PULL_R)
const PULL_R = 0.085;
function pullGeo() {
  const nk = 0.17, w = 0.39, L = 3.3, t = 0.08, sh = new THREE.Shape();   // (a straight tab with short shoulders under its head, as in the photo)
  sh.moveTo(-nk, 0); sh.lineTo(nk, 0); sh.lineTo(nk, -0.1); sh.quadraticCurveTo(nk, -0.2, (nk + w) / 2, -0.27); sh.quadraticCurveTo(w, -0.33, w, -0.46);
  sh.lineTo(w, -L + 0.2); sh.quadraticCurveTo(w, -L, w - 0.2, -L); sh.lineTo(-w + 0.2, -L); sh.quadraticCurveTo(-w, -L, -w, -L + 0.2);
  sh.lineTo(-w, -0.46); sh.quadraticCurveTo(-w, -0.33, -(nk + w) / 2, -0.27); sh.quadraticCurveTo(-nk, -0.2, -nk, -0.1); sh.lineTo(-nk, 0);
  sh.holes.push(roundRect(new THREE.Path(), -0.12, -L + 0.32, 0.12, -L + 1.6, 0.11));
  const plate = new THREE.ExtrudeGeometry(sh, { depth: t - 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 6, curveSegments: 14 });
  plate.translate(0, -0.005, -(t - 0.04) / 2);
  // the curl: the plate's section swept 240 degrees round the wire, up over it and down its outer side
  const cs = new THREE.Shape();
  cs.absarc(PULL_R, 0, PULL_R + t / 2, Math.PI, -Math.PI / 3, true);
  cs.absarc(PULL_R, 0, PULL_R - t / 2, -Math.PI / 3, Math.PI, false);
  const curl = new THREE.ExtrudeGeometry(cs, { depth: 2 * nk - 0.03, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 2, curveSegments: 20 });
  curl.translate(0, 0, -(2 * nk - 0.03) / 2); curl.rotateY(-Math.PI / 2);
  return mergeGeos([creased(plate, 10), creased(curl, 16)]);   // (the plate's faces kept flat: its fine bevel facets need no smoothing)
}
// a bottom stop: a small clamp crimped over each tape's edge where the teeth end (x along the chain, y up, z across)
function stopGeo() { return superGeo(0.07, 0.045, 0.13, 0.45, 0.35, 10, 28, ([x, y, z]) => [x * (1 - 0.15 * smooth(0, 0.13, z)), y < 0 ? y * 0.5 : y, z]); }

// ------------------------------------------------------------------------------------------------ materials
const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
const GRAIN = /* glsl */`
float tbHash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float tbNoise( vec3 x ) { vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( tbHash( i ), tbHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( tbHash( i + vec3( 0, 1, 0 ) ), tbHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( tbHash( i + vec3( 0, 0, 1 ) ), tbHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( tbHash( i + vec3( 0, 1, 1 ) ), tbHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z ); }
vec3 tbHash3( vec3 p ) { p = vec3( dot( p, vec3( 127.1, 311.7, 74.7 ) ), dot( p, vec3( 269.5, 183.3, 246.1 ) ), dot( p, vec3( 113.5, 271.9, 124.6 ) ) ); return fract( sin( p ) * 43758.5453123 ); }
// the distances to the nearest two cell centres (the pebbles of the grain: their borders are the creases between them)
vec2 tbCells( vec3 x ) {
  vec3 i = floor( x ), f = fract( x ); float d1 = 8.0, d2 = 8.0;
  for ( int k = - 1; k <= 1; k ++ ) for ( int j = - 1; j <= 1; j ++ ) for ( int l = - 1; l <= 1; l ++ ) {
    vec3 g = vec3( float( l ), float( j ), float( k ) ), r = g + tbHash3( i + g ) - f; float d = dot( r, r );
    if ( d < d1 ) { d2 = d1; d1 = d; } else if ( d < d2 ) { d2 = d; }
  }
  return vec2( sqrt( d1 ), sqrt( d2 ) );
}
vec3 tbBump( vec3 sp, vec3 nrm, float hgt, float faceDir ) {
  vec3 sx = dFdx( sp ), sy = dFdy( sp ), R1 = cross( sy, nrm ), R2 = cross( nrm, sx );
  float det = dot( sx, R1 ) * faceDir; vec3 grad = sign( det ) * ( dFdx( hgt ) * R1 + dFdy( hgt ) * R2 );
  return normalize( abs( det ) * nrm - grad );
}`;
// faux leather: a fine pebbled grain (irregular cells about 0.7 mm across, their creases a little rougher and darker; faded
// once finer than a pixel), a finer tooth, faint broad unevenness in its relief, its sheen and its tone; where the front's
// logo is printed, a smoother, glossier ink standing a hair proud of the leather
// With `inside`, its back faces are the bag's lining (a pale satin nylon): seen through the open zip, lit only softly by
// what comes in at the mouth (aInner, set as it opens: bright by an open mouth, falling off deeper in), never by the
// studio's direct lights and their hard shadows (inside a pouch the light is soft and comes through the opening)
const LINING = new THREE.Color('#e4e2de').convertSRGBToLinear();
function leather(params, key, inside = false) {
  const m = new THREE.MeshPhysicalMaterial({ ...params, side: inside ? THREE.DoubleSide : THREE.FrontSide });
  if (inside) m.shadowSide = THREE.BackSide;   // (its shadows cast as before, from its far side: no acne on the leather)
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\nvarying vec3 vTB;${inside ? '\nattribute float aInner;\nvarying float vInner;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvTB = position;${inside ? '\nvInner = aInner;' : ''}`);
    if (inside) sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vInner;')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  if ( ! gl_FrontFacing ) {
    reflectedLight.directDiffuse *= 0.0; reflectedLight.directSpecular *= 0.0; reflectedLight.indirectSpecular *= vInner;
    #ifdef USE_SHEEN
      sheenSpecularDirect *= 0.0; sheenSpecularIndirect *= vInner;
    #endif
  }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vTB;\n${GRAIN}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  float tbFw = length( fwidth( vTB ) );
  vec3 tbP = vTB * 15.0 + vec3( tbNoise( vTB * 2.1 ), tbNoise( vTB * 2.1 + 5.2 ), tbNoise( vTB * 2.1 + 9.7 ) ) * 0.9;
  vec2 tbC = tbCells( tbP ), tbC2 = tbCells( tbP * 2.3 + 17.0 );
  float tbPeb = 0.7 * smoothstep( 0.0, 0.42, tbC.y - tbC.x ) * ( 1.0 - 0.45 * tbC.x ) + 0.3 * smoothstep( 0.0, 0.4, tbC2.y - tbC2.x );   // (soft, rounded pebbles of two sizes)
  float tbFade = 1.0 - smoothstep( 0.3, 0.95, tbFw * 15.0 );
  float tbInk = 0.0;
  #ifdef USE_MAP
    tbInk = 1.0 - smoothstep( 0.06, 0.3, dot( sampledDiffuseColor.rgb, vec3( 0.3333 ) ) );
  #endif
  float tbH = ( ( tbPeb - 0.5 ) * 0.0011 * tbFade + ( tbNoise( vTB * 90.0 + 3.1 ) - 0.5 ) * 0.0004 * ( 1.0 - smoothstep( 0.3, 1.0, tbFw * 90.0 ) ) ) * ( 1.0 - tbInk )
            + ( tbNoise( vTB * 0.7 + 7.0 ) - 0.5 ) * 0.01 + tbInk * 0.0014;
  roughnessFactor = clamp( roughnessFactor + ( 1.0 - tbPeb ) * 0.05 * tbFade + ( tbNoise( vTB * 0.9 + 2.0 ) - 0.5 ) * 0.1, 0.05, 1.0 );
  roughnessFactor = mix( roughnessFactor, 0.3, tbInk );
  diffuseColor.rgb *= mix( 1.0, 0.98 + 0.02 * tbPeb, tbFade * ( 1.0 - tbInk ) ) * ( 1.0 + ( tbNoise( vTB * 0.3 + 1.7 ) - 0.5 ) * 0.03 );${inside ? `
  if ( ! gl_FrontFacing ) { diffuseColor.rgb = vec3( ${LINING.r.toFixed(4)}, ${LINING.g.toFixed(4)}, ${LINING.b.toFixed(4)} ) * vInner * 2.2; roughnessFactor = 0.55; tbH *= 0.2; }` : ''}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  normal = tbBump( - vViewPosition, normal, tbH, faceDirection );`);
  };
  m.customProgramCacheKey = () => 'travelbag3-' + key + (inside ? '-in' : '');
  return m;
}
// the panels' print: the bag's colour with the Sword logo in black, centred (where Bloom's logo is on the front; the
// back carries it too)
function frontTexture(maxAniso) {
  const cw = 4096, ch = Math.round((cw * BAG.H) / BAG.W), cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const g = cv.getContext('2d'); g.fillStyle = BAG.color; g.fillRect(0, 0, cw, ch);
  if (logoImg) {
    const lw = (BAG.logo.w / BAG.W) * cw, lh = lw / LOGO_AR, ink = document.createElement('canvas'); ink.width = Math.ceil(lw); ink.height = Math.ceil(lh);
    const k = ink.getContext('2d'); k.drawImage(logoImg, 0, 0, lw, lh); k.globalCompositeOperation = 'source-in'; k.fillStyle = '#141414'; k.fillRect(0, 0, ink.width, ink.height);
    const yMid = ch / 2 - (BAG.logo.y / BAG.H) * ch;   // (canvas y runs down)
    g.drawImage(ink, cw / 2 + (BAG.logo.x / BAG.W) * cw - lw / 2, yMid - lh / 2);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; return t;
}
// what the metal mirrors: polished nickel looks like metal by the contrast of what it reflects, and the studio's room is
// soft and even (the slider and teeth came out flat, the leather's own colour). So the metal has its own small studio,
// in true light levels (high dynamic range: its lamps many times brighter than its walls, so their reflections burn
// white and the rest falls dark, as polished metal does): an overhead scrim, a dim ceiling, a dark band round the
// horizon (the edges' dark lines), a pale floor, a big softbox above in front, strip lights to the right and the left
// (the slider and the left end's stops face them) and a window band behind. Across the map u = 0.5 looks along +x (the
// bag's right end), 0.75 its front (+z), 0.25 behind, 0 and 1 its left; v runs down from the top
function metalEnvTexture() {
  const W = 512, H = 256, d = new Float32Array(W * H * 4), lerp = (p, q, t) => p + (q - p) * t;
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1);
    const bg = v < 0.44 ? lerp(0.3, 0.13, v / 0.44) : v < 0.5 ? lerp(0.13, 0.045, (v - 0.44) / 0.06) : lerp(0.1, 0.6, Math.pow((v - 0.5) / 0.5, 0.7));
    for (let x = 0; x < W; x++) { const k = 4 * ((H - 1 - y) * W + x); d[k] = bg; d[k + 1] = bg * 0.985; d[k + 2] = bg * 0.955; d[k + 3] = 1; }
  }
  const lamp = (u0, u1, v0, v1, I, f) => {
    for (let y = 0; y < H; y++) {
      const v = y / (H - 1), fv = smooth(v0 - f, v0 + f, v) * (1 - smooth(v1 - f, v1 + f, v)); if (fv <= 0) continue;
      for (let x = 0; x < W; x++) {
        const u = x / (W - 1), fu = smooth(u0 - f, u0 + f, u) * (1 - smooth(u1 - f, u1 + f, u)); if (fu <= 0) continue;
        const k = 4 * ((H - 1 - y) * W + x), e = I * fu * fv; d[k] += e; d[k + 1] += e; d[k + 2] += e * 0.97;
      }
    }
  };
  lamp(-0.1, 1.1, -0.1, 0.08, 1.4, 0.03);        // the overhead scrim
  lamp(0.56, 0.94, 0.03, 0.27, 7, 0.015);        // the big softbox, above and in front
  lamp(0.515, 0.545, 0.14, 0.66, 6, 0.005);      // a strip light to the right
  lamp(0.43, 0.447, 0.22, 0.58, 2.2, 0.004);     // and a dimmer one beside it
  lamp(-0.02, 0.012, 0.14, 0.66, 6, 0.005); lamp(0.988, 1.02, 0.14, 0.66, 6, 0.005);   // a strip light to the left (the map wraps)
  lamp(0.17, 0.33, 0.4, 0.48, 2.5, 0.015);       // a window band behind
  const half = new Uint16Array(d.length); for (let k = 0; k < d.length; k++) half[k] = THREE.DataUtils.toHalfFloat(d[k]);
  const t = new THREE.DataTexture(half, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
  t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.LinearSRGBColorSpace; t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
}
// polished nickel: its true colour (a warm grey: nickel's reflectance, about 0.66 / 0.61 / 0.53 of the light), mirroring
// its own studio, and never quite evenly polished: its roughness wanders a little over its surface (soft smears and the
// faintest polishing marks), so its highlights break up as real plated metal's do
function nickel(params, key) {
  const m = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.66, 0.61, 0.53), metalness: 1, ...params });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vNi;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvNi = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vNi;\n${GRAIN}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = clamp( roughnessFactor * ( 0.85 + 0.3 * tbNoise( vNi * 7.0 + 2.0 ) ) + 0.03 * smoothstep( 0.6, 0.9, tbNoise( vNi * vec3( 160.0, 9.0, 160.0 ) ) ), 0.04, 1.0 );`);
  };
  m.customProgramCacheKey = () => 'travelbag-nickel-' + key;
  return m;
}
export function createTravelBagMaterials(maxAniso = 8) {
  const M = {};
  // satin faux leather: soft, broad highlights (its grain breaks them up), a little sheen at grazing angles
  const pu = { color: lin(BAG.color), roughness: 0.5, metalness: 0, sheen: 0.35, sheenRoughness: 0.45, sheenColor: lin('#ffffff'), specularIntensity: 0.55, vertexColors: true };
  M.body = leather(pu, 'body', true);
  M.front = leather({ ...pu, color: new THREE.Color(1, 1, 1), map: frontTexture(maxAniso) }, 'front', true);
  M.piping = leather({ ...pu, roughness: 0.46 }, 'piping');
  M.tape = new THREE.MeshPhysicalMaterial({ color: lin('#7a7369'), roughness: 0.85, sheen: 0.5, sheenColor: lin('#9a958d') });   // the zip's woven tape, between the teeth
  const metalEnv = metalEnvTexture();
  M.teeth = nickel({ roughness: 0.17, vertexColors: true, envMap: metalEnv, envMapIntensity: 1 }, 'teeth');   // the teeth (each a touch different, darker at its foot)
  M.metal = nickel({ roughness: 0.13, envMap: metalEnv, envMapIntensity: 1 }, 'parts');   // the slider, its bridge, its pull and the stops
  M.edge = new THREE.MeshPhysicalMaterial({ color: lin('#8a8378'), roughness: 0.8 });   // the tape's edge, sewn in with the lining
  M.stitch = leather({ ...pu, color: lin('#e9e6df'), roughness: 0.75, sheen: 0.2 }, 'stitch');   // the thread, tone on tone, sunk into its holes at each end
  return M;
}

// ------------------------------------------------------------------------------------------------ the bag
// a loop point at height y on the right (side 0) or left (side 2) end, interpolated between its neighbours
function endPoint(right, y) {
  const lo = right ? 0 : NS.end - 1 + NS.long - 1, hi = lo + NS.end - 1;
  for (let i = lo; i < hi; i++) {
    const A = LOOP[i], B2 = LOOP[i + 1];
    if ((A.p[1] - y) * (B2.p[1] - y) <= 0) {
      const t = (y - A.p[1]) / (B2.p[1] - A.p[1] || 1), o = {};
      for (const k in A) o[k] = Array.isArray(A[k]) ? A[k].map((q, j) => q + (B2[k][j] - q) * t) : A[k] + (B2[k] - A[k]) * t;
      return { i: t < 0.5 ? i : i + 1, o };
    }
  }
  return null;
}
// ------------------------------------------------------------------------------------------------ the zip's opening
// along the zip: s from its foot on the right end (0, where it is closed for good) over the top to its foot on the left
// (ZIP.L). Closed, the slider rests at the right foot; opening, it runs towards the left foot and behind it the rows
// part: a V from its shoulders, closing again to the right foot, wider over the top than down the ends (the mouth)
const ZIP = (() => { const yZ = -b + BAG.zip.low, r0 = endPoint(true, yZ), l0 = endPoint(false, yZ); return { r0, l0, S0: r0.o.s, L: l0.o.s - r0.o.s }; })();
const OPEN = { t: 0, sc: 0.55, ssh: -0.1 }, GAPL = new Float32Array(LOOP.length);
const smin = (p, q, k = 0.35) => -k * Math.log(Math.exp(-p / k) + Math.exp(-q / k));
function gapZip(s, ny) {   // the gap between the rows' edges (cm) at s along the zip, its outward normal's y there
  if (OPEN.t <= 0 || s <= 0 || s >= ZIP.L) return 0;
  const sh = OPEN.ssh;
  if (s > sh + 0.45) return 0;
  if (s > sh) return 0.28 * (1 - (s - sh) / 0.45);   // (in the slider's Y)
  const cap = 1.6 + 4.8 * smooth(0.5, 0.95, ny);
  return Math.max(0, smin(smin(0.28 + 0.36 * (sh - s), 0.5 * s), cap)) * smooth(0, 0.03, OPEN.t);
}
function setOpenState(t) {
  OPEN.t = clamp(t, 0, 1); OPEN.sc = 0.55 + OPEN.t * (ZIP.L - 1.1); OPEN.ssh = OPEN.sc - 0.65;
  for (let i = 0; i < LOOP.length; i++) GAPL[i] = gapZip(LOOP[i].s - ZIP.S0, LOOP[i].n[1]);
}
function gapAt(sl) {   // the gap at length sl along the loop (between its points)
  if (sl <= LOOP[0].s || sl >= LOOP[LOOP.length - 1].s) return 0;
  let lo = 0, hi = LOOP.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (LOOP[m].s <= sl) lo = m; else hi = m; }
  const t = (sl - LOOP[lo].s) / (LOOP[hi].s - LOOP[lo].s || 1); return GAPL[lo] + (GAPL[hi] - GAPL[lo]) * t;
}
function loopAt(sl) {   // the loop's point at length sl along it (its fields interpolated)
  let lo = 0, hi = LOOP.length - 1;
  if (sl <= LOOP[0].s) return LOOP[0]; if (sl >= LOOP[hi].s) return LOOP[hi];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (LOOP[m].s <= sl) lo = m; else hi = m; }
  const A = LOOP[lo], B2 = LOOP[hi], t = (sl - A.s) / (B2.s - A.s || 1), o = {};
  for (const k in A) o[k] = Array.isArray(A[k]) ? A[k].map((q, j) => q + (B2[k][j] - q) * t) : A[k] + (B2[k] - A[k]) * t;
  return o;
}
// how the leather moves as it opens: each half of the gusset parts from the other (its lip by half the gap, its seam by
// a quarter), its lip sinking in a little as the mouth sags; the panels follow their top and end seams, less further in
function gusMove(o, w, side, g) {
  if (!(g > 0)) return null;
  const a = 1 - Math.abs(w), sag = 0.3 * (g / 2) * a * a;
  return [-o.n[0] * sag, -o.n[1] * sag, side * (g / 2) * (0.5 + 0.5 * a)];
}
function panelMove(m) {
  let z = 0;
  for (let k = 0; k < 3; k++) { const g = gapAt(m.s[k]); if (g > 0) z = Math.max(z, (g / 4) * Math.exp(-m.d[k] / 4)); }
  return z > 0 ? [0, 0, m.zs * z] : null;
}
const add3 = (p, d) => (d ? [p[0] + d[0], p[1] + d[1], p[2] + d[2]] : p);
const V3 = THREE.Vector3;

export function buildTravelBag(M) {
  const grp = new THREE.Group(); grp.name = 'travelbag';
  const inner = new THREE.Group(); inner.position.y = b + BAG.bulge.bottom; grp.add(inner);   // (resting on the floor)
  const add = (name, geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = cast; m.receiveShadow = true; inner.add(m); return m; };
  // the panels and the gusset (cut along the zip's line into its two halves), and the lining inside them
  const NU = 200, NV = 120;
  const panel = (zs) => liveGrid({ nu: NU, nv: NV, P: (i, j) => panelAt(panelRow(i, NU), panelRow(j, NV), zs), out: (nx, ny, nz) => nz * zs,
    uvOf: (p) => [(zs * p[0]) / BAG.W + 0.5, p[1] / BAG.H + 0.5], aoOf: (p) => p.ao });   // (the back's print read from behind, not mirrored)
  const GR = WROWS + 1, gw = (j) => (j <= WROWS / 2 ? wRow(j) : wRow(j - 1)), gside = (j) => (j <= WROWS / 2 ? -1 : 1);
  const gusset = liveGrid({ nu: LOOP.length, nv: GR, wrapU: true, cut: (j) => j === WROWS / 2,
    P: (i, j) => { const w = gw(j), p = gusAt(LOOP[i], w); p.meta = { i, w, side: gside(j) }; return p; },
    out: (nx, ny, nz, m) => nx * LOOP[m.i].n[0] + ny * LOOP[m.i].n[1] + nz * m.w * c * 0.05, aoOf: (p) => gusAO(LOOP[p.meta.i], p.meta.w) });
  const front = panel(1), back = panel(-1);
  add('front', front.geo, M.front); add('body_back', back.geo, M.front); add('body', gusset.geo, M.body);   // (the Sword logo on both panels)
  // inside: each point's nearest place on the zip (length along the loop) and how far in from the mouth it is (across the
  // gusset, then down the panel), for the light that comes in as it opens
  const zs0 = ZIP.S0, zs1 = ZIP.S0 + ZIP.L, toZip = (sl) => clamp(sl, zs0, zs1);
  for (const m of gusset.meta) { const sl = LOOP[m.i].s, sn = toZip(sl); m.sNear = sn; m.dIn = Math.abs(m.w) * c * 1.1 + Math.abs(sl - sn) * 1.4; }
  for (const G of [front, back]) for (const m of G.meta) {   // (a panel: from each of its three seams with the zip; blended, so the light runs on smoothly)
    m.sN = [0, 1, 2].map((k) => toZip(m.s[k])); m.dI = [0, 1, 2].map((k) => m.d[k] + c * 1.1 + Math.abs(m.s[k] - m.sN[k]) * 1.4);
  }
  // the zip's path (its rest points)
  const { r0, l0 } = ZIP, path = [r0.o];
  for (let i = r0.i + 1; i < l0.i; i++) path.push(LOOP[i]);
  path.push(l0.o);
  const S = [0]; for (let k = 1; k < path.length; k++) S.push(S[k - 1] + Math.hypot(path[k].p[0] - path[k - 1].p[0], path[k].p[1] - path[k - 1].p[1]));
  const hw = BAG.zip.w / 2 / c;   // the teeth's half width, in w
  // the teeth: two rows of stamped metal teeth, interlocking (each row's half a pitch from the other's), each set a
  // hair differently (a real chain is never perfectly even) and darker at its foot, in the tape
  const tooth = toothGeo(), toothAO = Array.from({ length: tooth.attributes.position.count }, (_, i) => 0.5 + 0.5 * smooth(-0.03, 0.04, tooth.attributes.position.getY(i)));
  const teethGs = [], TEETH = [], mtx = new THREE.Matrix4(), jig = new THREE.Matrix4(), PITCH = 0.25;
  let vstart = 0;
  for (let sv = 0.1, k = 0; sv < ZIP.L - 0.1; sv += PITCH / 2, k++) {
    const sd = k % 2 ? 1 : -1, wz = (sd * 0.11) / c, o = loopAt(ZIP.S0 + sv), lift = 0.075 + 0.004 * (hash3(k, 3, 7) - 0.5), p0 = gusAt(o, wz, lift);
    const pa = gusAt(loopAt(ZIP.S0 + sv - 0.05), wz, lift), pb = gusAt(loopAt(ZIP.S0 + sv + 0.05), wz, lift);
    const T = new V3(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]).normalize();
    const U = new V3(o.n[0], o.n[1], 0); U.sub(T.clone().multiplyScalar(U.dot(T))).normalize();
    const Z = new V3().crossVectors(T, U).multiplyScalar(sd);   // (each tooth's head towards the middle; the basis kept right-handed)
    mtx.makeBasis(T.clone().multiplyScalar(sd), U, Z).setPosition(p0[0], p0[1], p0[2]);
    jig.makeRotationY(0.05 * (hash3(k, 11, 5) - 0.5)).premultiply(new THREE.Matrix4().makeRotationZ(0.06 * (hash3(k, 2, 13) - 0.5)));
    const g = tooth.clone().applyMatrix4(mtx.multiply(jig)), tint = 0.92 + 0.08 * hash3(k, 17, 1);
    g.setAttribute('color', new THREE.Float32BufferAttribute(toothAO.flatMap((v) => [v * tint, v * tint, v * tint]), 3));
    teethGs.push(g); TEETH.push({ start: vstart, count: g.attributes.position.count, sv, sd, wz, o }); vstart += g.attributes.position.count;
  }
  const teeth = add('zip_teeth', mergeGeos(teethGs), M.teeth, false), teethBase = teeth.geometry.attributes.position.array.slice();
  // the parts rebuilt as it opens: the piping, the zip's tape, its leather lips and the tape's sewn edge
  const live = {};
  for (const name of ['piping_front', 'piping_back']) live[name] = add(name, new THREE.BufferGeometry(), M.piping);
  for (const sd of [-1, 1]) {
    live['zip_tape' + sd] = add(sd > 0 ? 'zip_tape_front' : 'zip_tape_back', new THREE.BufferGeometry(), M.tape, false);   // (the small zip parts cast no shadows:
    live['zip_welt' + sd] = add(sd > 0 ? 'zip_welt_front' : 'zip_welt_back', new THREE.BufferGeometry(), M.piping, false); //  too fine for the shadow map, they drew hard lines)
    live['zip_edge' + sd] = add(sd > 0 ? 'zip_edge_front' : 'zip_edge_back', new THREE.BufferGeometry(), M.edge, false);
  }
  const swap = (key, geo) => { live[key].geometry.dispose(); live[key].geometry = geo; };
  // the end strips: their top edges stitched over the gusset, below the zip (they don't move)
  for (const right of [true, false]) {
    const e = endPoint(right, -b + BAG.band), s2 = endPoint(right, -b + BAG.band + 0.32);
    const ws = Array.from({ length: 81 }, (_, k) => -1 + (2 * k) / 80);
    add(right ? 'strip_right' : 'strip_left', tube(ws.map((w) => gusAt(e.o, w, 0.03)), 0.07, false, 10, () => [e.o.n[0], e.o.n[1], 0], (i, cosA) => 0.72 + 0.28 * smooth(-0.6, 0.6, cosA)), M.piping);
    const dashes = [];
    for (let z = -c + 0.45; z < c - 0.3; z += 0.36) dashes.push(tube([0, 1, 2, 3].map((q) => gusAt(s2.o, (z + q * 0.075) / c, q === 0 || q === 3 ? -0.012 : 0.006)), 0.022, false, 6, () => [s2.o.n[0], s2.o.n[1], 0], (i) => (i === 0 || i === 3 ? 0.55 : 1)));
    add(right ? 'stitches_right' : 'stitches_left', mergeGeos(dashes), M.stitch);
  }
  // the slider, its bridge and the pull (posed as it opens); the stops where the teeth end at the left end's foot
  const slider = add('zip_slider', sliderBodyGeo(), M.metal), bridge = add('zip_bridge', bridgeGeo(), M.metal), pull = add('zip_pull', pullGeo(), M.metal);
  const ln = l0.o.n, lrot = Math.atan2(ln[1], ln[0]);
  for (const sd of [-1, 1]) {
    const p = gusAt(l0.o, (sd * 0.14) / c, 0.06), st = add(sd > 0 ? 'zip_stop_front' : 'zip_stop_back', stopGeo(), M.metal);
    st.position.set(p[0], p[1] + 0.05, p[2]); st.rotation.set(0, sd > 0 ? Math.PI : 0, lrot - Math.PI / 2, 'ZYX');   // (along the chain, up out of the end, its rounder end inwards)
  }
  const basisQ = (X, Y, Z) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));

  // set the zip's opening (0 closed, 1 all the way open): move the leather, the lining, the teeth and the rebuilt
  // parts, and pose the slider and its pull where it has got to
  function setOpen(t) {
    setOpenState(t);
    const gMove = (m) => gusMove(LOOP[m.i], m.w, m.side, GAPL[m.i]);
    // the light inside: brightest by the open mouth, falling off deeper in (a fuller opening lets more in everywhere)
    const glob = smooth(0, 0.6, OPEN.t);
    const lightIn = (sn, dIn) => Math.exp(-dIn / 8) * (0.45 * glob + 0.55 * smooth(0, 3.5, gapAt(sn)));
    const innerOf = (m) => {
      if (m.sN) { let L = 0, W = 0; for (let k = 0; k < 3; k++) { const w = Math.exp(-m.dI[k] / 2); L += w * lightIn(m.sN[k], m.dI[k]); W += w; } return 0.1 + 0.9 * (L / W); }
      return 0.1 + 0.9 * lightIn(m.sNear, m.dIn);
    };
    front.update(panelMove, innerOf); back.update(panelMove, innerOf); gusset.update(gMove, innerOf);
    // the teeth: each moved with its row's lip
    const P = teeth.geometry.attributes.position.array;
    for (const T of TEETH) {
      const d = gusMove(T.o, T.wz, T.sd, gapAt(ZIP.S0 + T.sv)), e = 3 * (T.start + T.count);
      for (let k = 3 * T.start; k < e; k += 3) { P[k] = teethBase[k] + (d ? d[0] : 0); P[k + 1] = teethBase[k + 1] + (d ? d[1] : 0); P[k + 2] = teethBase[k + 2] + (d ? d[2] : 0); }
    }
    teeth.geometry.attributes.position.needsUpdate = true; teeth.geometry.computeBoundingSphere(); teeth.geometry.computeBoundingBox();
    // the piping, in the seams (which move a quarter of the gap)
    for (const zs of [1, -1]) {
      const pts = LOOP.map((o, i) => [o.p[0] + o.n[0] * 0.05, o.p[1] + o.n[1] * 0.05, zs * (c + 0.05 + GAPL[i] / 4)]);
      swap(zs > 0 ? 'piping_front' : 'piping_back', tube(pts, BAG.pipe, true, 12, (p, i) => [LOOP[i].n[0], LOOP[i].n[1], zs], (i, cosA) => 0.62 + 0.38 * smooth(-0.4, 0.8, cosA)));
    }
    // each row's tape, leather lip and sewn edge, with its lip
    const G = path.map((o, k) => gapAt(ZIP.S0 + S[k]));
    for (const sd of [-1, 1]) {
      const at2 = (k, w, lift) => add3(gusAt(path[k], w, lift), gusMove(path[k], w, sd, G[k]));
      swap('zip_tape' + sd, gridGeo(2, path.length - 1, (i, j) => { const t2 = i / 2; return at2(j, sd * (0.002 + t2 * hw), 0.02 + 0.02 * (1 - t2 * t2)); },
        (p, n, i, j) => n[0] * path[j].n[0] + n[1] * path[j].n[1], (p, i, j) => [S[j], i / 2]));
      const w1 = sd * (BAG.zip.w / 2 + 0.08) / c;
      swap('zip_welt' + sd, tube(path.map((o, k) => at2(k, w1, -0.02)), 0.07, false, 10, (p, k) => [path[k].n[0], path[k].n[1], sd * 0.6], (i, cosA) => 0.7 + 0.3 * smooth(-0.5, 0.7, cosA)));
      swap('zip_edge' + sd, gridGeo(1, path.length - 1, (i, j) => { const q = at2(j, sd * 0.002, 0.03); return i ? [q[0] - path[j].n[0] * 0.14, q[1] - path[j].n[1] * 0.14, q[2]] : q; },
        (p, n) => -sd * n[2], (p, i, j) => [S[j], i]));
    }
    // the slider rides the closed chain where it has got to: its head (narrow) towards the closed teeth
    const o = loopAt(ZIP.S0 + OPEN.sc), Q = gusAt(o, 0, 0), qa = gusAt(loopAt(ZIP.S0 + OPEN.sc - 0.08), 0, 0), qb = gusAt(loopAt(ZIP.S0 + OPEN.sc + 0.08), 0, 0);
    const Tn = new V3(qb[0] - qa[0], qb[1] - qa[1], qb[2] - qa[2]).normalize(), Nn = new V3(o.n[0], o.n[1], 0); Nn.sub(Tn.clone().multiplyScalar(Nn.dot(Tn))).normalize();
    const Zn = new V3().crossVectors(Nn, Tn), Qv = new V3(...Q), qs = basisQ(Nn, Tn, Zn);
    slider.position.copy(Qv.clone().addScaledVector(Nn, 0.06)); slider.quaternion.copy(qs);
    bridge.position.copy(Qv.clone().addScaledVector(Nn, 0.42).addScaledVector(Tn, -0.43)); bridge.quaternion.copy(qs);
    // the pull hangs from the bridge's wire and can only swing about it: it falls the way gravity takes it, but rests
    // on the leather (it can't go into it), leaning in a little where it hangs; twisted to the front on the ends
    const W = Qv.clone().addScaledVector(Nn, 0.61).addScaledVector(Tn, -0.43);
    const gt = -Tn.y, gn = -Nn.y, sT = gt >= 0 ? 1 : -1;
    // (its foot no lower than the teeth's tops; lying back over the slider, its plate clear of the slider's crown)
    let beta = Math.max(-0.125, Math.min(Math.atan2(gn, Math.abs(gt)), -0.1));
    if (sT > 0) beta = Math.max(beta, 0.13);
    const dir = Tn.clone().multiplyScalar(sT * Math.cos(beta)).addScaledVector(Nn, Math.sin(beta));
    const Yp = dir.clone().negate(), Xp = Zn.clone().sub(Yp.clone().multiplyScalar(Zn.dot(Yp))).normalize();
    let Zp = new V3().crossVectors(Xp, Yp); if (Zp.dot(Nn) < 0) { Xp.negate(); Zp.negate(); }
    const tw = -0.25 * Math.sign(Nn.x || 1) * Math.abs(Tn.y), cw = Math.cos(tw), sw = Math.sin(tw);
    const Xt = Xp.clone().multiplyScalar(cw).add(new V3().crossVectors(Yp, Xp).multiplyScalar(sw)), Zt = Zp.clone().multiplyScalar(cw).add(new V3().crossVectors(Yp, Zp).multiplyScalar(sw));
    pull.quaternion.copy(basisQ(Xt, Yp, Zt)); pull.position.copy(W.clone().addScaledVector(Zt, -PULL_R));
    grp.userData.open = OPEN.t;
  }
  grp.userData.setOpen = setOpen;
  setOpen(0);
  return grp;
}
