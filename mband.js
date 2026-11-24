// Sword M-Band: a woven strap with the sensor pod, a loop buckle (the ring) at one end and a hook-and-loop tip with an
// end bar at the other. Built in code from the five product photos (M-band/). Units: centimetres.
// Measured on the flat top photo, in strap widths W (2.5 cm):
// - the strap is 12.4 W long, from the ring's bar to the end bar;
// - the pod is 1.88 W x 1.23 W, its centre 1.74 W from the ring, under the strap (face B); a white light slit on one
//   long side; on its other face a raised panel with two white dots, two red optical windows and a round disc;
// - the ring 0.35 W x 1.2 W, its bar 0.1 W thick; the end bar 0.15 W x 1.07 W;
// - the tip's fine weave starts 10.5 W along; its four hook patches (face A) are 0.27 W x 0.81 W, 0.45 W apart.
// Poses: worn (closed in a loop, as in the three-quarter and front photos: the free end goes through the ring, folds
// back and lies on the outside, its hook patches on the strap), flat (face A up, the pod under it, as in the top
// photos) and sensor (turned over: the pod on top, its sensors up, as in the bottom photo).
// Local frame: the strap lies in the xy plane, its width along z. Flat poses run along +x on the floor (y = 0).
import * as THREE from 'three';
import { weaveTextures, edgeTextures, tipTextures, sensorTextures } from './mband-weave.js';

const W = 2.5;
export const MBAND = {
  W, t: 0.17, L: 12.4 * W,
  pod: { L: 1.88 * W, W: 1.23 * W, T: 0.8, dome: 0.07, n: 4.5, mt: 3.8, mb: 5, bend: 25, at: 1.74 * W, plate: { L: 2.95, W: 1.3, T: 0.05 } },
  ring: { L: 0.35 * W, W: 1.2 * W, r: 0.125 },
  bar: { L: 0.15 * W, W: 1.07 * W, T: 0.36 },
  tip: { from: 10.5 * W, patches: [10.78, 11.23, 11.68, 12.11].map((k) => k * W), pw: 0.27 * W, ph: 0.81 * W },
  loop: { a: 3.7, p: 2.3 },   // worn: the inner layer's superellipse (half height, exponent); its depth makes the tip end at the top
};
// the braided edge starts where the face rises into the cord: |k| > EDGE_K of the face's half width (strapGeometry)
const EDGE_K = 0.92, EDGE_B = 0.9 * (W / 2 - MBAND.t / 2), EDGE_TO = W / 2 - MBAND.t / 2 + 1.3 * MBAND.t / 2;
const COLORS = { pod: '#5b5c61', plate: '#5b5c61', ring: '#606166' };

// ---------------------------------------------------------------- shapes
// smooth normals, and the winding turned so the faces point out (checked against the normals)
function finish(pos, uv, idx, normals) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  if (normals) g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); else g.computeVertexNormals();
  // the winding: compare a few triangles' own normals with the vertex normals (outward), flip the order if they disagree
  const P = g.attributes.position.array, Nn = g.attributes.normal.array; let agree = 0;
  for (let t = 0; t < idx.length; t += 3 * Math.max(1, Math.floor(idx.length / 300))) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
    const e1 = [P[3 * b] - P[3 * a], P[3 * b + 1] - P[3 * a + 1], P[3 * b + 2] - P[3 * a + 2]], e2 = [P[3 * c] - P[3 * a], P[3 * c + 1] - P[3 * a + 1], P[3 * c + 2] - P[3 * a + 2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    agree += Math.sign(n[0] * Nn[3 * a] + n[1] * Nn[3 * a + 1] + n[2] * Nn[3 * a + 2]);
  }
  if (agree < 0 && normals) { for (let t = 0; t < idx.length; t += 3) { const x = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = x; } g.setIndex(idx); }
  return g;
}

// smooth shapes for the moulded parts. A flat face meeting a quarter-circle edge shows a seam in the
// shading and the reflections, where the curvature jumps; moulded parts round off with continuous curvature, as a
// superellipse (|x/a|^n + |y/b|^n = 1) does
const spow = (v, e) => Math.sign(v) * Math.abs(v) ** e;
function evenly(f, N, closed) {   // N points along the curve f(t), t in [0, 1], spaced evenly by length
  const S = 4000, P = [], cum = [0];
  for (let i = 0; i <= S; i++) P.push(f(i / S));
  for (let i = 1; i <= S; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const out = [], Lc = cum[S], M = closed ? N : N - 1; let k = 0;
  for (let i = 0; i < N; i++) {
    const d = (i / M) * Lc; while (k < S - 1 && cum[k + 1] < d) k++;
    const w = (d - cum[k]) / (cum[k + 1] - cum[k] || 1); out.push([P[k][0] + (P[k + 1][0] - P[k][0]) * w, P[k][1] + (P[k + 1][1] - P[k][1]) * w]);
  }
  return out;
}
// the top of a superSlab at (x, z) (its height over the slab's centre)
function superTop(x, z, a, b, c, n, mt, dome) {
  const r = Math.min(1, (Math.abs(x / a) ** n + Math.abs(z / b) ** n) ** (1 / n)), y0 = c * (1 - r ** mt) ** (1 / mt);
  return y0 + dome * (1 - r * r) * (y0 / c) ** 2;
}
// a superellipsoid slab: footprint half sizes a (x) by b (z), exponent n; profile from its widest line to the top an
// exponent mt superellipse, to the bottom mb; c half thick; the top domed up by `dome` in the middle. UVs: the
// footprint, 0..1
function superSlab(a, b, c, n, mt, mb = mt, dome = 0, U = 220, V = 110) {
  const R = (a + b) / 2;
  const foot = evenly((t) => { const th = 2 * Math.PI * t; return [a * spow(Math.cos(th), 2 / n), b * spow(Math.sin(th), 2 / n)]; }, U, true);
  const prof = evenly((t) => { const ph = -Math.PI / 2 + Math.PI * t, m = ph < 0 ? mb : mt; return [R * spow(Math.cos(ph), 2 / m), c * spow(Math.sin(ph), 2 / m)]; }, V + 1, false);
  const pos = [], uv = [], idx = [];
  for (const [rr, y0] of prof) {
    const r = Math.max(0, rr / R), y = y0 + (y0 > 0 ? dome * (1 - r * r) * (y0 / c) ** 2 : 0);
    for (const [x, z] of foot) { pos.push(x * r, y, z * r); uv.push((x * r) / (2 * a) + 0.5, (z * r) / (2 * b) + 0.5); }
  }
  for (let j = 0; j < V; j++) for (let i = 0; i < U; i++) { const p = j * U + i, q = j * U + ((i + 1) % U); idx.push(p, q, p + U, q, q + U, p + U); }
  return outward(pos, uv, idx);
}
// a tube of radius r round a superellipse (half sizes hx by hz, exponent n) in the xz plane: the ring
function superRing(hx, hz, n, r, U = 200, S = 22) {
  const path = evenly((t) => { const th = 2 * Math.PI * t; return [hx * spow(Math.cos(th), 2 / n), hz * spow(Math.sin(th), 2 / n)]; }, U, true);
  const pos = [], uv = [], idx = [], nor = [];
  for (let i = 0; i < U; i++) {
    const [x, z] = path[i], [x1, z1] = path[(i + 1) % U], [x0, z0] = path[(i - 1 + U) % U];
    let tx = x1 - x0, tz = z1 - z0; const l = Math.hypot(tx, tz); tx /= l; tz /= l;
    const nx = tz, nz = -tx;   // in the plane, square to the path
    for (let j = 0; j < S; j++) {
      const a = (j / S) * 2 * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
      pos.push(x + r * ca * nx, r * sa, z + r * ca * nz); nor.push(ca * nx, sa, ca * nz); uv.push(0, 0);
    }
  }
  for (let i = 0; i < U; i++) for (let j = 0; j < S; j++) {
    const a = i * S + j, b = i * S + ((j + 1) % S), c = ((i + 1) % U) * S + j, d = ((i + 1) % U) * S + ((j + 1) % S); idx.push(a, b, c, b, d, c);
  }
  return outward(pos, uv, idx, nor);
}
// the triangles wound to face out (along the given normals, or away from the centre of a convex shape), and smooth
// normals (the given ones, or computed)
function outward(pos, uv, idx, nor = null) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  let agree = 0;
  for (let t = 0; t < idx.length; t += 3 * Math.max(1, Math.floor(idx.length / 900))) {
    const P = [0, 1, 2].map((k) => [pos[3 * idx[t + k]], pos[3 * idx[t + k] + 1], pos[3 * idx[t + k] + 2]]);
    const e1 = P[1].map((v, k) => v - P[0][k]), e2 = P[2].map((v, k) => v - P[0][k]);
    const nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const o = nor ? [nor[3 * idx[t]], nor[3 * idx[t] + 1], nor[3 * idx[t] + 2]] : P[0].map((v, k) => (v + P[1][k] + P[2][k]) / 3);
    agree += Math.sign(nn[0] * o[0] + nn[1] * o[1] + nn[2] * o[2]);
  }
  if (agree < 0) for (let t = 0; t < idx.length; t += 3) { const x = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = x; }
  g.setIndex(idx);
  if (nor) g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); else g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- the strap's path for each pose
// dense polyline [[x, y]...] -> stations every ds up to length L: position, tangent, face A's normal (sign: +1 = to the
// left of the way it runs), arc length
function stations(pts, L, ds, sign) {
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const at = (s) => { let i = 1; while (i < cum.length - 1 && cum[i] < s) i++; const f = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1); return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f]; };
  const n = Math.ceil(L / ds), out = { s: [], x: [], y: [], tx: [], ty: [], nx: [], ny: [] };
  for (let k = 0; k <= n; k++) {
    const s = Math.min(L, k * ds), p = at(s), a = at(Math.max(0, s - 0.02)), b = at(Math.min(cum.at(-1), s + 0.02));
    let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    out.s.push(s); out.x.push(p[0]); out.y.push(p[1]); out.tx.push(tx); out.ty.push(ty); out.nx.push(-ty * sign); out.ny.push(tx * sign);
  }
  out.frame = (s) => {   // position, tangent and face A's normal at arc length s (interpolated)
    const f = Math.min(out.s.length - 1.001, Math.max(0, s / ds)), i = Math.floor(f), w = f - i, j = i + 1;
    const lerp = (A) => A[i] + (A[j] - A[i]) * w, T = new THREE.Vector2(lerp(out.tx), lerp(out.ty)).normalize();
    return { p: new THREE.Vector3(lerp(out.x), lerp(out.y), 0), t: new THREE.Vector3(T.x, T.y, 0), n: new THREE.Vector3(-T.y * sign, T.x * sign, 0) };
  };
  return out;
}
let podDepth = MBAND.pod.T + MBAND.pod.dome + MBAND.pod.plate.T;   // strap side to its lowest point, lying sensors down (set when built)
const podHeight = () => podDepth;
// lying flat along +x, the ring at x = 0. Face A up (the pod under the strap, which rides over it and comes down to the
// floor on both sides) or turned over (sensor: flat on the floor, the pod on top)
function flatPath(sensorUp) {
  const { L, t, pod } = MBAND, ht = t / 2;
  if (sensorUp) return stations([[0, ht], [L + 1, ht]], L, 0.06, -1);
  // (the short end to the ring droops a little; on the tip side the strap comes down to the floor over 5 cm, as in the
  // flat three-quarter photo)
  const top = podHeight(), flatHalf = pod.L / 2 - pod.re;
  const prof = (xp) => { const P = []; for (let x = 0; x <= L + 2; x += 0.01) { const D = x < xp ? 3.2 : 5.0, d = Math.abs(x - xp) - flatHalf; P.push([x, ht + top * (d <= 0 ? 1 : d < D ? 0.5 * (1 + Math.cos((Math.PI * d) / D)) : 0)]); } return P; };
  let xp = pod.at;   // the pod's place on the floor, so that its centre is pod.at along the strap
  for (let it = 0; it < 4; it++) { const P = prof(xp); let s = 0; for (let i = 1; i < P.length && P[i][0] <= xp; i++) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); xp += pod.at - s; }
  return stations(prof(xp), L, 0.06, 1);
}
// closed as if worn (the front and three-quarter photos): the ring at the bottom; from it the strap runs up one side
// (the pod inside it, half way up), over the top, down the other side, through the ring and round its far bar, then
// back up that side on the outside, lying on the inner layer, to the tip at the top. The loop is a superellipse, as tall as in the
// photo; its depth is what makes the tip end at the top
function superOval(a, b, p) {
  const P = []; for (let i = 0; i <= 4000; i++) {   // from the bottom, anticlockwise (towards +x first)
    const th = -Math.PI / 2 + (i / 4000) * 2 * Math.PI, c = Math.cos(th), s = Math.sin(th);
    P.push([b * Math.sign(c) * Math.abs(c) ** (2 / p), a * Math.sign(s) * Math.abs(s) ** (2 / p)]);
  }
  const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  return { P, cum, Lo: cum.at(-1) };
}
function wornPath() {
  const { L, t, ring, loop } = MBAND, ht = t / 2, R = ring.r + ht, gap = ring.L / 2 - ring.r;
  // strap used: round bar A, the inner layer (all but the ring's opening), round bar B, and the outer layer from the
  // ring to the top: about 1.5 loops. Solve the depth for that
  const want = (L - Math.PI * R + 3 * gap - 0.15) / 1.5;
  let lo = 1.5, hi = 4.5; for (let it = 0; it < 30; it++) { const m = (lo + hi) / 2; if (superOval(loop.a, m, loop.p).Lo < want) lo = m; else hi = m; }
  const { P: oval, cum, Lo } = superOval(loop.a, (lo + hi) / 2, loop.p);
  const O = (sg) => {   // point, outward normal and tangent at arc length sg (wraps)
    sg = ((sg % Lo) + Lo) % Lo; let a = 0, b = cum.length - 1; while (b - a > 1) { const m = (a + b) >> 1; if (cum[m] < sg) a = m; else b = m; }
    const f = (sg - cum[a]) / (cum[b] - cum[a] || 1), p = [oval[a][0] + (oval[b][0] - oval[a][0]) * f, oval[a][1] + (oval[b][1] - oval[a][1]) * f];
    const tx = oval[b][0] - oval[a][0], ty = oval[b][1] - oval[a][1], l = Math.hypot(tx, ty) || 1;
    return { p, n: [ty / l, -tx / l], t: [tx / l, ty / l] };
  };
  const sA = gap, sB = -gap, pts = [];   // the ring's bars: A (the strap is sewn round it) and B (the free end folds round it)
  const wrap = (o, start, dir) => {      // half way round a bar: from the bar's outside (start 0) or its underside (start 1)
    const C = [o.p[0] + o.n[0] * R, o.p[1] + o.n[1] * R];
    for (let k = 0; k <= 60; k++) { const ps = (k / 60) * Math.PI; const cn = start ? -Math.cos(ps) : Math.cos(ps), ct = dir * Math.sin(ps); pts.push([C[0] + R * (cn * o.n[0] + ct * o.t[0]), C[1] + R * (cn * o.n[1] + ct * o.t[1])]); }
  };
  // the strap's sewn end: tucked into bar A, where the stitching hides it (its cut end inside the bar, so its open
  // edge never shows under the ring). It spirals in over the 70 degrees before the wrap, from the bar's surface to its
  // middle: the strap's faces and its edge cords (1.3 x half its thickness) end within the bar's radius
  { const o = O(sA), C = [o.p[0] + o.n[0] * R, o.p[1] + o.n[1] * R], N = 40, A0 = 1.2;
    for (let k = 0; k < N; k++) { const ps = -A0 * (1 - k / N), r = R * (0.05 + 0.95 * smoothstep(-A0, 0, ps)), cn = Math.cos(ps), ct = -Math.sin(ps);
      pts.push([C[0] + r * (cn * o.n[0] + ct * o.t[0]), C[1] + r * (cn * o.n[1] + ct * o.t[1])]); } }
  let tuckLen = 0; for (let i = 1; i < pts.length; i++) tuckLen += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  wrap(O(sA), 0, -1);                                                     // round bar A, through the ring's opening
  tuckLen += Math.hypot(pts[pts.length - 61][0] - pts[pts.length - 62][0], pts[pts.length - 61][1] - pts[pts.length - 62][1]);   // the step into the wrap
  for (let sg = sA + 0.01; sg <= sB + Lo; sg += 0.01) pts.push(O(sg).p);  // the inner layer, once round
  wrap(O(sB), 1, 1);                                                      // up through the opening, over bar B
  for (let d = 0.01; d <= 16; d += 0.01) {                                // down onto the inner layer, and up the near side
    const o = O(sB - d), off = t + (2 * R - t) * (1 - smoothstep(0, 1.2, d)); pts.push([o.p[0] + o.n[0] * off, o.p[1] + o.n[1] * off]);
  }
  // wound clockwise as seen from +z (built anticlockwise, then mirrored in x): seen from the front left, the pod's side
  // is on the left and the folded-back end on the right, its light slit towards you, as in the three-quarter photo
  const st = stations(pts.map(([x, y]) => [-x, y]), L + Math.PI * R + tuckLen, 0.06, 1), o = O(0);
  st.ring = { p: [-o.p[0], o.p[1]], n: [-o.n[0], o.n[1]], t: [-o.t[0], o.t[1]] };
  st.start = Math.PI * R + tuckLen;   // where the strap's measured length starts (after the tuck and bar A)
  return st;
}
const smoothstep = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };

// the strap's mesh: stations along the path, each a flat section with round edges (face A on the normal's side). UVs in
// cm: u along the strap, v across (-W/2..W/2). Group 0: the main weave; group 1: the tip's face A (fine weave, patches)
function strapGeometry(st, tipFrom, s0 = 0, podS = null) {
  // the pod's contact shadow on the face it sits on (face B) and on the edges under it: little light reaches the strap
  // under the pod's rim, more and more away from it (a rounded rectangle's distance, cm)
  const { pod } = MBAND, hl = pod.L / 2, hp = pod.W / 2, rc = 0.55;
  const under = (s, b) => { const qx = Math.abs(s - podS) - hl + rc, qy = Math.abs(b) - hp + rc; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rc; };
  const { W: Wd, t } = MBAND, hw = Wd / 2, ht = t / 2, hi = hw - ht;
  // across: face A, the +b edge, face B, the -b edge. The edges are a round braided cord (the photos), a little thicker
  // than the strap: the faces rise into it over their last 0.9 mm
  const B = [-1, -0.98, -0.96, -0.93, -0.9, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 0.9, 0.93, 0.96, 0.98, 1], sec = [], NA = B.length, bead = 1.3;
  const lift = (k) => 1 + (bead - 1) * smoothstep(0.92, 1, Math.abs(k));
  // (zone: 0 the woven face, 1 the braided edge)
  for (const k of B) sec.push([k * hi, ht * lift(k), 0, 1, 1, Math.abs(k) > EDGE_K ? 1 : 0]);           // face A
  for (let i = 1; i < 8; i++) { const a = Math.PI / 2 - (i / 8) * Math.PI; sec.push([hi + bead * ht * Math.cos(a), bead * ht * Math.sin(a), Math.cos(a), Math.sin(a), 0.9, 1]); }
  for (const k of [...B].reverse()) sec.push([k * hi, -ht * lift(k), 0, -1, 1, Math.abs(k) > EDGE_K ? 1 : 0]);   // face B
  for (let i = 1; i < 8; i++) { const a = -Math.PI / 2 - (i / 8) * Math.PI; sec.push([-hi + bead * ht * Math.cos(a), bead * ht * Math.sin(a), Math.cos(a), Math.sin(a), 0.9, 1]); }
  const S = sec.length, n = st.s.length, pos = [], nor = [], uv = [], col = [];
  for (let i = 0; i < n; i++) for (const [b, h, nb, nh, c] of sec) {
    pos.push(st.x[i] + st.nx[i] * h, st.y[i] + st.ny[i] * h, b);
    const l = Math.hypot(nb, nh); nor.push((st.nx[i] * nh) / l, (st.ny[i] * nh) / l, nb / l);
    let k = c;
    if (podS !== null && (nh < 0 || nb !== 0)) { const d = under(st.s[i], b); k *= d < 0 ? 0.5 : 0.5 + 0.5 * smoothstep(0, 0.55, d); }
    uv.push(st.s[i] - s0, b); col.push(k, k, k);
  }
  const main = [], tip = [], edge = [];
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < S; j++) {
    const a = i * S + j, b = i * S + ((j + 1) % S), c = a + S, d = b + S;
    (sec[j][5] || sec[(j + 1) % S][5] ? edge : j < NA - 1 && st.s[i] >= tipFrom ? tip : main).push(a, b, c, b, d, c);
  }
  const g = finish(pos, uv, [...main, ...tip, ...edge], nor);
  g.computeVertexNormals();   // (the winding checked against the section's own normals; these follow the cord's swell)
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.addGroup(0, main.length, 0); g.addGroup(main.length, tip.length, 1); g.addGroup(main.length + tip.length, edge.length, 2);
  return g;
}

// ---------------------------------------------------------------- materials, model, poses
// soft-touch plastic, as moulded: a fine grain (relief from 3D noise in the part's own space, so it neither stretches
// over the curved sides nor slides as the view moves; faded out where it is finer than a pixel, a little more roughness
// standing in for it) and a gentle unevenness in the sheen across the part
const NOISE_GLSL = `
float mbHash( vec3 p ) { p = fract( p * 0.1031 ); p += dot( p, p.zyx + 31.32 ); return fract( ( p.x + p.y ) * p.z ); }
float mbNoise( vec3 x ) {
  vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( mbHash( i ), mbHash( i + vec3( 1.0, 0.0, 0.0 ) ), f.x ), mix( mbHash( i + vec3( 0.0, 1.0, 0.0 ) ), mbHash( i + vec3( 1.0, 1.0, 0.0 ) ), f.x ), f.y ),
              mix( mix( mbHash( i + vec3( 0.0, 0.0, 1.0 ) ), mbHash( i + vec3( 1.0, 0.0, 1.0 ) ), f.x ), mix( mbHash( i + vec3( 0.0, 1.0, 1.0 ) ), mbHash( i + 1.0 ), f.x ), f.y ), f.z );
}
vec3 mbBump( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir ) {
  vec3 sx = normalize( dFdx( surf_pos ) ), sy = normalize( dFdy( surf_pos ) ), R1 = cross( sy, surf_norm ), R2 = cross( surf_norm, sx );
  float det = dot( sx, R1 ) * faceDir; vec3 grad = sign( det ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
  return normalize( abs( det ) * surf_norm - grad );
}`;
function softTouch(mat, grain, freq = 120) {   // grain: its height, cm; freq: grains per cm
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uGrain = { value: grain }; sh.uniforms.uGrainF = { value: freq };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;\nuniform float uGrain;\nuniform float uGrainF;\n' + NOISE_GLSL)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  float mbPx = length( fwidth( vObj ) ) * uGrainF;
  roughnessFactor = clamp( roughnessFactor * ( 1.0 + 0.18 * ( mbNoise( vObj * 1.6 ) - 0.5 ) ) + 0.05 * smoothstep( 0.4, 1.3, mbPx ), 0.0, 1.0 );`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    // the grain's height, uGrain cm at most; its slope per cm along the screen's x and y (so the same at any size)
    vec3 gp = vObj * uGrainF, sp = - vViewPosition;
    float gh = ( 0.6 * mbNoise( gp ) + 0.4 * mbNoise( gp * 2.3 + 7.1 ) ) * uGrain * ( 1.0 - smoothstep( 0.4, 1.3, length( fwidth( vObj ) ) * uGrainF ) );
    vec2 dH = vec2( dFdx( gh ) / max( length( dFdx( sp ) ), 1e-7 ), dFdy( gh ) / max( length( dFdy( sp ) ), 1e-7 ) );
    normal = mbBump( sp, normal, dH, faceDirection );
  }`);
  };
  mat.customProgramCacheKey = () => `mband-softtouch-${grain}`;
  return mat;
}

// the strap's loops seen at an angle (the arcs: the material's own maps) or square on (the dashes, B): each pixel blends
// the two by how squarely it faces the camera
function viewBlend(mat, B) {
  const both = (chunk, name, uv) => THREE.ShaderChunk[chunk].replaceAll(`texture2D( ${name}, ${uv} )`, `mix( texture2D( ${name}, ${uv} ), texture2D( ${name}2, ${uv} ), mbSq )`);
  mat.onBeforeCompile = (sh) => {
    for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'anisotropyMap']) sh.uniforms[k + '2'] = { value: B[k] };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D map2, normalMap2, roughnessMap2, aoMap2, anisotropyMap2;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  float mbSq = smoothstep( 0.88, 0.985, abs( dot( normalize( vViewPosition ), normalize( vNormal ) ) ) );')
      .replace('#include <map_fragment>', both('map_fragment', 'map', 'vMapUv'))
      .replace('#include <normal_fragment_maps>', both('normal_fragment_maps', 'normalMap', 'vNormalMapUv'))
      .replace('#include <roughnessmap_fragment>', both('roughnessmap_fragment', 'roughnessMap', 'vRoughnessMapUv'))
      .replace('#include <aomap_fragment>', both('aomap_fragment', 'aoMap', 'vAoMapUv'))
      .replace('#include <lights_physical_fragment>', both('lights_physical_fragment', 'anisotropyMap', 'vAnisotropyMapUv'));
  };
  mat.customProgramCacheKey = () => 'mband-weave-blend';
  return mat;
}

export function createMBandMaterials(maxAniso) {
  const { L, tip, pod } = MBAND, len = L - tip.from;
  const weave = weaveTextures(maxAniso, 2 * EDGE_B), square = weaveTextures(maxAniso, 2 * EDGE_B, true), edgeT = edgeTextures(maxAniso, W, EDGE_B, EDGE_TO);
  const tipT = tipTextures(maxAniso, W, len, tip.patches.map((p) => p - tip.from), tip.pw, tip.ph);
  for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'anisotropyMap']) {
    for (const T of [weave, square]) { T[k].repeat.set(1 / weave.TA, 1 / weave.TC); T[k].offset.set(0, EDGE_B / weave.TC); }
    edgeT[k].repeat.set(1 / edgeT.TA, 1 / edgeT.span); edgeT[k].offset.set(0, EDGE_TO / edgeT.span);
    tipT[k].repeat.set(1 / len, 1 / W); tipT[k].offset.set(-tip.from / len, 0.5);
  }
  // polyester yarn: glossy, its highlights drawn out along the fibres (anisotropy along the strap), the gaps between the
  // yarns in shadow (ambient occlusion: the studio's light is mostly its environment), a faint fibre sheen at grazing
  const fabric = (T) => new THREE.MeshPhysicalMaterial({ map: T.map, normalMap: T.normalMap, roughnessMap: T.roughnessMap, roughness: 1, metalness: 0,
    aoMap: T.aoMap, aoMapIntensity: 1, anisotropyMap: T.anisotropyMap, anisotropy: 0.4, specularIntensity: 0.65, ior: 1.5,
    vertexColors: true, sheen: 0.15, sheenRoughness: 0.35, sheenColor: new THREE.Color('#b8bbc2') });
  // the pod, ring and end bar: satin soft-touch plastic (its broad highlights broken up by the grain, a soft sheen at
  // grazing angles, as on rubbery coatings)
  const plastic = (hex, roughness, grain, shaded) => softTouch(new THREE.MeshPhysicalMaterial({ color: new THREE.Color(hex), roughness, metalness: 0,
    specularIntensity: 0.5, ior: 1.5, clearcoat: 0.12, clearcoatRoughness: 0.35, sheen: 0.22, sheenRoughness: 0.5, sheenColor: new THREE.Color('#8e9096'), vertexColors: shaded }), grain);   // a satin coat: a soft, broad highlight along the curves, as in the photos
  // the sensor panel: the same plastic, its windows and disc glass (a clear coat over the deep red and black under it),
  // set into it; the dots glowing faintly
  const S = sensorTextures(maxAniso, pod.plate.L, pod.plate.W, COLORS.plate);
  const plate = softTouch(new THREE.MeshPhysicalMaterial({ map: S.map, roughnessMap: S.roughnessMap, roughness: 1, metalness: 0, specularIntensity: 0.6, ior: 1.5,
    normalMap: S.normalMap, clearcoat: 1, clearcoatMap: S.clearcoatMap, clearcoatRoughness: 0.04, emissive: new THREE.Color('#ffffff'), emissiveMap: S.emissiveMap, emissiveIntensity: 0.22,
    sheen: 0.25, sheenRoughness: 0.55, sheenColor: new THREE.Color('#8e9096') }), 0.00014);
  return {
    strap: viewBlend(fabric(weave), square), tip: fabric(tipT), edge: fabric(edgeT), pod: plastic(COLORS.pod, 0.46, 0.00022, true), ring: plastic(COLORS.ring, 0.4, 0.00016, false), plate,
    led: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0.3 }),
  };
}

export function buildMBand(MM) {
  const { pod, ring, bar } = MBAND, g = new THREE.Group(); g.name = 'mband';
  const strap = new THREE.Mesh(new THREE.BufferGeometry(), [MM.strap, MM.tip, MM.edge]); strap.name = 'mband-strap';
  // the pod, its strap side at y = 0, its sensors up (+y); the light slit on its -z side
  const P = new THREE.Group(); P.name = 'mband-pod';
  // its body a superellipsoid: footprint exponent n (the corners, 0.55 cm round, as in the top photo), the sensors'
  // side pillowed (mt), the strap side flatter (mb); shaded a little darker towards the strap, where little light gets
  const a = pod.L / 2, b = pod.W / 2, c = pod.T / 2, bodyG = superSlab(a, b, c, pod.n, pod.mt, pod.mb, pod.dome).translate(0, c, 0);
  { const P = bodyG.attributes.position, col = [];
    for (let i = 0; i < P.count; i++) { const k = 0.66 + 0.34 * smoothstep(0, 0.32, P.getY(i)); col.push(k, k, k); }
    bodyG.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); }
  const body = new THREE.Mesh(bodyG, MM.pod);
  // the sensor panel: a low, soft-edged panel (exponent 7 footprint) lying on the pod's dome, following it
  const pl = pod.plate, plG = superSlab(pl.L / 2, pl.W / 2, pl.T / 2, 7, 2.2, 2.2, 0, 180, 60);
  { const P = plG.attributes.position;
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), z = P.getZ(i); P.setY(i, c + superTop(x, z, a, b, c, pod.n, pod.mt, pod.dome) + P.getY(i) + pl.T / 2 - 0.012); }
    plG.computeVertexNormals(); }
  const plate = new THREE.Mesh(plG, MM.plate);
  const slit = new THREE.Mesh(superSlab(0.345, 0.05, 0.025, 5, 2, 2, 0, 72, 24).rotateX(Math.PI / 2), MM.led);
  // the pod is curved along its length, to sit on a wrist (the worn photo): its strap side round, its sensors' side
  // hollow, bent about an axis bend cm beyond the sensors' side
  const Rb = pod.bend, bendIt = (geo) => {
    const a = geo.attributes.position;
    for (let i = 0; i < a.count; i++) { const x = a.getX(i), y = a.getY(i), th = x / Rb; a.setXY(i, (Rb - y) * Math.sin(th), Rb - (Rb - y) * Math.cos(th)); }
    geo.computeVertexNormals(); geo.computeBoundingBox(); return geo;
  };
  for (const m of [body, plate]) bendIt(m.geometry);
  podDepth = Math.max(body.geometry.boundingBox.max.y, plate.geometry.boundingBox.max.y);
  P.add(body, plate, slit);
  const R = new THREE.Mesh(superRing(ring.L / 2 - ring.r, ring.W / 2 - ring.r, 6, ring.r), MM.ring); R.name = 'mband-ring';
  const E = new THREE.Mesh(superSlab(bar.L / 2, bar.W / 2, bar.T / 2, 3, 2.5, 2.5, 0, 160, 56), MM.ring); E.name = 'mband-bar';
  g.add(strap, P, R, E);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.frustumCulled = false; } });
  // (its parts kept on the group itself, not in userData: three.js deep-copies userData through JSON on every clone,
  // and the studio clones the model for its floor shadow on every pose change)
  g.parts = { strap, pod: P, ring: R, bar: E, slit };
  poseMBand(g, 'worn');
  return g;
}

// x along t, y along n (or -n), z = x cross y
function place(o, p, x, y) { const z = new THREE.Vector3().crossVectors(x, y); o.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)); o.position.copy(p); }

export function poseMBand(g, pose) {
  const { L, t, pod, ring, bar } = MBAND, ht = t / 2, { strap, pod: P, ring: R, bar: E, slit } = g.parts;
  const st = pose === 'worn' ? wornPath() : flatPath(pose === 'sensor'), s0 = st.start || 0;
  strap.geometry.dispose(); strap.geometry = strapGeometry(st, MBAND.tip.from + s0, s0, s0 + pod.at);
  const fp = st.frame(s0 + pod.at); place(P, fp.p.clone().addScaledVector(fp.n, -ht), fp.t, fp.n.clone().negate());
  // the light slit, on the pod's long side that is to the right walking from the ring with face A up (the flat photos and
  // the three-quarter photo agree; the front photo is a mirror image)
  slit.position.set(0.14, pod.T / 2, -(pod.W / 2 - 0.012));
  const fe = st.frame(s0 + L), eb = fe.p.clone().addScaledVector(fe.t, bar.L / 2 - 0.08);
  if (pose !== 'worn') eb.y = bar.T / 2;
  place(E, eb, fe.t, fe.n);
  if (pose === 'worn') {
    const o = st.ring, n = new THREE.Vector3(o.n[0], o.n[1], 0), tt = new THREE.Vector3(o.t[0], o.t[1], 0);
    place(R, new THREE.Vector3(o.p[0], o.p[1], 0).addScaledVector(n, ring.r + ht), tt, n);
  } else {
    // at the strap's end, resting on the floor (the strap comes down onto its bar)
    const f0 = st.frame(0);
    place(R, f0.p.clone().addScaledVector(f0.t, -(ring.L / 2 - ring.r)).setY(ring.r), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));
  }
  g.userData.pose = pose;
}
