// Sword resistance bands (mini loop bands): Light, Medium, Heavy. Units: centimetres, grams, seconds.
// - Each band is a closed latex loop, 60 cm round, 5 cm wide; Light 1.2 mm, Medium 1.5 mm, Heavy 1.8 mm thick (as
//   firm mini bands are: they hold round, open loops and folds).
// - Physics: each band is a Cosserat ribbon (a rod with a flat, rigid cross-section) solved with XPBD in small steps.
//   Its stiffnesses come from the material: latex, E = 1.2 MPa, 1.0 g/cm3. It stretches along its length (E A),
//   bends easily out of its plane (E w t^3 / 12), hardly at all within it (E t w^3 / 12), and twists (G w t^3 / 3).
//   Its rest shape is a relaxed oval (bands keep a little of the flat shape they are packed in).
// - Contacts: the floor, the hooks (rods the bands hang over) and the bands themselves (each other, and each band's
//   own strands), all with friction. Clips hold a point of a band, its position and its angle, like fingers.
// - Prints: "Light ●○○", "Medium ●●○", "Heavy ●●●" and the Sword symbol, on opposite sides of each band (the
//   one picked faces the camera).
import * as THREE from 'three';

export const BAND = { C: 60, W: 5, N: 150 };          // circumference, width (cm), segments
// color: the latex's own (diffuse) colour, measured on the product photo's lit faces and folds; through: the colour a
// pass through the band leaves of the light (the latex is translucent: inside a fold it glows deep red, gold, blue)
export const BANDS = {
  light:  { name: 'Light',  dots: 1, color: '#51b6e7', through: '#0a5fd8', t: 0.12 },
  medium: { name: 'Medium', dots: 2, color: '#fecb0a', through: '#f59a00', t: 0.15 },
  heavy:  { name: 'Heavy',  dots: 3, color: '#f8b1b9', through: '#e0122c', t: 0.18 },
};
export const BAND_ORDER = ['heavy', 'light', 'medium'];
const E = 1.2e7, G_MOD = E / 3, RHO = 1.0, GRAV = 981, BEND_DAMP = 0.0015;  // dyn/cm2, g/cm3, cm/s2
const REST_ASPECT = 0.3;                                 // the relaxed oval: short over long axis
const HOOK_R = 0.9;                                      // hook radius, cm: a studio dowel (the band wraps it smoothly)
const MU_FLOOR = 0.9, MU_HOOK = 0.6, MU_BAND = 0.5;      // latex grips
const SUB = 3;                                           // render stations per segment
// the segments' turning inertia, x10: with their true (tiny) inertia the bending and shear constraints pump energy
// into the rotations; heavier rotations are stable and change only how fast a twist swings, not the shapes
const ROT_INERTIA = 10;
// the cross-section: FACE vertices across each face, RIM between them round each edge. The edges are cut flat, as
// mini bands are cut from a latex sheet, their corners eased (EDGE_R of the half thickness), so the band's thickness
// shows as a narrow face along each edge (fine enough that
// the photo render's light does not catch facets on the edges: a sawtooth with too few)
const FACE = 5, RIM = 7, RING = 2 * (FACE + RIM), EDGE_R = 0.45;
const IMPERFECT = { bend: 0.03, twist: 0.002 };   /* more twist tips standing bands over */          // the bands' unevenness: curvature (1/cm), twist (rad/cm) at harmonic 1

// ---------------------------------------------------------------- small vector / quaternion helpers (arrays)
function seededRandom(text) {   // mulberry32, seeded from a string
  let a = 0; for (const ch of text) a = (Math.imul(a ^ ch.charCodeAt(0), 2654435761) + 0x9e3779b9) | 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const qmul = (a, b, o = [0, 0, 0, 1]) => {
  const ax = a[0], ay = a[1], az = a[2], aw = a[3], bx = b[0], by = b[1], bz = b[2], bw = b[3];
  o[0] = aw * bx + bw * ax + ay * bz - az * by; o[1] = aw * by + bw * ay + az * bx - ax * bz;
  o[2] = aw * bz + bw * az + ax * by - ay * bx; o[3] = aw * bw - ax * bx - ay * by - az * bz; return o;
};
const hyp2 = (a, b) => Math.sqrt(a * a + b * b), hyp3 = (a, b, c) => Math.sqrt(a * a + b * b + c * c);   // (faster than Math.hypot in Safari)
function frameOf(q, o, k) {   // columns d1, d2, d3 of q[k..k+3] into o[0..8]
  const x = q[k], y = q[k + 1], z = q[k + 2], w = q[k + 3];
  o[0] = 1 - 2 * (y * y + z * z); o[1] = 2 * (x * y + z * w); o[2] = 2 * (x * z - y * w);
  o[3] = 2 * (x * y - z * w); o[4] = 1 - 2 * (x * x + z * z); o[5] = 2 * (y * z + x * w);
  o[6] = 2 * (x * z + y * w); o[7] = 2 * (y * z - x * w); o[8] = 1 - 2 * (x * x + y * y);
  return o;
}
function quatFromFrame(d1, d2, d3) {
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...d1), new THREE.Vector3(...d2), new THREE.Vector3(...d3));
  const q = new THREE.Quaternion().setFromRotationMatrix(m); return [q.x, q.y, q.z, q.w];
}
const smooth01 = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
function rotateQ(q, k, dx, dy, dz) {   // q <- normalize(q + 1/2 [d, 0] q): a small world rotation d
  const x = q[k], y = q[k + 1], z = q[k + 2], w = q[k + 3];
  const nx = x + 0.5 * (w * dx + dy * z - dz * y), ny = y + 0.5 * (w * dy + dz * x - dx * z);
  const nz = z + 0.5 * (w * dz + dx * y - dy * x), nw = w - 0.5 * (dx * x + dy * y + dz * z);
  const l = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw);
  q[k] = nx * l; q[k + 1] = ny * l; q[k + 2] = nz * l; q[k + 3] = nw * l;
}

// ---------------------------------------------------------------- rest shapes (in the band's plane: X along, Y across)
// a closed curve sampled evenly by arc length: points, outward normals
function sampleClosed(fn, n, fine = 6000) {
  const P = []; let L = 0; const acc = [0];
  for (let i = 0; i <= fine; i++) P.push(fn((i / fine) * Math.PI * 2));
  for (let i = 1; i <= fine; i++) { L += hyp2(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); acc.push(L); }
  const out = []; let j = 0;
  for (let k = 0; k < n; k++) {
    const s = (k / n) * L; while (acc[j + 1] < s) j++;
    const f = (s - acc[j]) / (acc[j + 1] - acc[j] || 1);
    out.push([P[j][0] + (P[j + 1][0] - P[j][0]) * f, P[j][1] + (P[j + 1][1] - P[j][1]) * f]);
  }
  return { pts: out, L };
}
function ellipseLoop(n, C, aspect) {
  const e = sampleClosed((t) => [Math.cos(t), aspect * Math.sin(t)], n);
  const k = C / e.L; return e.pts.map(([x, y]) => [x * k, y * k]);
}
function stadiumLoop(n, C, re) {   // flattened: two straight layers 2 re apart joined by half circles
  const Ls = (C - 2 * Math.PI * re) / 2;
  const seg = (s) => {   // arc length s from the bottom middle, anticlockwise
    s = ((s % C) + C) % C;
    if (s < Ls / 2) return [s, -re];
    s -= Ls / 2; if (s < Math.PI * re) { const a = -Math.PI / 2 + s / re; return [Ls / 2 + re * Math.cos(a), re * Math.sin(a)]; }
    s -= Math.PI * re; if (s < Ls) return [Ls / 2 - s, re];
    s -= Ls; if (s < Math.PI * re) { const a = Math.PI / 2 + s / re; return [-Ls / 2 + re * Math.cos(a), re * Math.sin(a)]; }
    s -= Math.PI * re; return [-Ls / 2 + s, -re];
  };
  const out = []; for (let k = 0; k < n; k++) out.push(seg((k / n) * C)); return out;
}
// node positions and segment frames of a planar loop (X, Y in its plane, Z across the band), placed by a matrix
function placeLoop(pts2, mat) {
  const n = pts2.length, x = [], q = [];
  let cx = 0, cy = 0; for (const p of pts2) { cx += p[0] / n; cy += p[1] / n; }
  const V = (a) => new THREE.Vector3(...a).applyMatrix4(mat);
  const R = new THREE.Matrix4().extractRotation(mat);
  const D = (a) => new THREE.Vector3(...a).applyMatrix4(R).normalize();
  for (let i = 0; i < n; i++) x.push(V([pts2[i][0], pts2[i][1], 0]).toArray());
  for (let i = 0; i < n; i++) {
    const a = pts2[i], b = pts2[(i + 1) % n];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.sqrt(tx * tx + ty * ty); tx /= tl; ty /= tl;
    // outward normal in the plane: the side away from the loop's centre
    let nx = ty, ny = -tx; const mx = (a[0] + b[0]) / 2 - cx, my = (a[1] + b[1]) / 2 - cy;
    if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
    const d3 = D([tx, ty, 0]), d2 = D([nx, ny, 0]), d1 = new THREE.Vector3().crossVectors(d2, d3);
    q.push(quatFromFrame(d1.toArray(), d2.toArray(), d3.toArray()));
  }
  return { x, q };
}

// a cyclic tridiagonal system: lo[i] x[i-1] + di[i] x[i] + up[i] x[i+1] = r[i], indices mod n (Sherman-Morrison)
function cyclicTridiag(lo, di, up, r, S) {
  const n = di.length, { y, z, cp, dp } = S;
  const thomas = (bb0, bbn, rhs, out) => {   // the plain tridiagonal part, with its first / last diagonals changed
    let b0 = di[0] + bb0; cp[0] = up[0] / b0; dp[0] = rhs(0) / b0;
    for (let i = 1; i < n; i++) {
      const bi = di[i] + (i === n - 1 ? bbn : 0), m = bi - lo[i] * cp[i - 1];
      cp[i] = up[i] / m; dp[i] = (rhs(i) - lo[i] * dp[i - 1]) / m;
    }
    out[n - 1] = dp[n - 1]; for (let i = n - 2; i >= 0; i--) out[i] = dp[i] - cp[i] * out[i + 1];
    return out;
  };
  const alpha = up[n - 1], beta = lo[0];
  if (alpha === 0 && beta === 0) return thomas(0, 0, (i) => r[i], y);
  const gamma = -di[0];
  thomas(-gamma, -alpha * beta / gamma, (i) => r[i], y);
  thomas(-gamma, -alpha * beta / gamma, (i) => (i === 0 ? gamma : i === n - 1 ? alpha : 0), z);
  const fac = (y[0] + beta * y[n - 1] / gamma) / (1 + z[0] + beta * z[n - 1] / gamma);
  for (let i = 0; i < n; i++) y[i] -= fac * z[i];
  return y;
}

// ---------------------------------------------------------------- one band
class Band {
  constructor(key) {
    const S = BANDS[key], n = BAND.N;
    Object.assign(this, { key, spec: S, n, t: S.t, W: BAND.W, l0: BAND.C / n });
    this.x = new Float64Array(3 * n); this.xp = new Float64Array(3 * n); this.v = new Float64Array(3 * n);
    this.q = new Float64Array(4 * n); this.qp = new Float64Array(4 * n); this.om = new Float64Array(3 * n);
    this.iw = new Float64Array(n); this.iwr = new Float64Array(n); this.pin = new Uint8Array(n); this.fc = new Float64Array(n);
    this.hc = new Float64Array(3 * n); this.hcOn = new Uint8Array(n);   // nodes pressed on a hook, and its normal there
    this.hcPush = new Float64Array(n);                                   // how hard (cm this substep): for its friction
    this.hk = new Int16Array(n).fill(-1);                                // which hook
    this.rest = new Float64Array(4 * n); this.lamS = new Float64Array(3 * n); this.lamB = new Float64Array(3 * n);
    const A = this.W * this.t, m = RHO * A * this.l0;
    this.m = m; this.iw.fill(1 / m); this.iwr.fill(12 / (ROT_INERTIA * m * this.W * this.W));
    this.aS = this.l0 / (E * A);
    // a wide strip twisted has to stretch its edges (they run further round than its middle): its twist stiffness
    // grows with the twist, by KT tau^2 (tau: twist per cm). From the edge strain (tau y)^2 / 2 across the width
    // (capped at 60 times: at 150 a pile of bands on the floor could buzz and never come to rest)
    this.KT = (27 * this.W ** 4) / (160 * this.t ** 2);
    // bending about d1 (out of the band's plane), about d2 (within it), twist about d3
    this.aB = [this.l0 / (4 * E * this.W * this.t ** 3 / 12), this.l0 / (4 * E * this.t * this.W ** 3 / 12), this.l0 / (4 * G_MOD * this.W * this.t ** 3 / 3)];
    this.setRest(ellipseLoop(n, BAND.C, REST_ASPECT), true);
  }
  // the shape the band springs back to (its rest curvature: Darboux quaternions between segments), from a planar loop;
  // uneven: with the small waves of curvature and twist that real bands have (below)
  setRest(pts2, uneven) {
    const n = this.n, key = this.key;
    const rest = placeLoop(pts2, new THREE.Matrix4());
    const tmp = [0, 0, 0, 1], t2 = [0, 0, 0, 1];
    // no real band is perfectly even: a little curvature and twist is left in it from moulding and packing, in long,
    // gentle waves round the loop (harmonics 2-6 of its length, so they close on themselves). Seeded per band, so a
    // preset always comes out the same. Hung or stretched, tension pulls most of it out; floating, it shows.
    // Their pull grows with the stiffness (t^3) and the band's weight only with t, so the waves shrink as (0.7 mm / t)^2
    // for thicker bands: the same unevenness for its weight (more, and the thick standing bands tip over).
    const rnd = seededRandom(key), waves = [], sc = Math.min(1, (0.07 / this.t) ** 2);
    if (uneven) for (let k = 2; k <= 6; k++) waves.push({ k, kap: (rnd() * 2 - 1) * sc * IMPERFECT.bend / k ** 0.7, tw: (rnd() * 2 - 1) * sc * IMPERFECT.twist / k ** 0.7, p1: rnd() * 2 * Math.PI, p2: rnd() * 2 * Math.PI });
    for (let i = 0; i < n; i++) {
      const a = rest.q[i], b = rest.q[(i + 1) % n];
      qmul([-a[0], -a[1], -a[2], a[3]], b, tmp);
      const s = (i + 1) * this.l0; let kap = 0, tw = 0;
      for (const w of waves) { kap += w.kap * Math.sin((2 * Math.PI * w.k * s) / BAND.C + w.p1); tw += w.tw * Math.sin((2 * Math.PI * w.k * s) / BAND.C + w.p2); }
      const hb = 0.5 * kap * this.l0, ht = 0.5 * tw * this.l0;   // about d1 (the soft bend), about d3 (twist)
      qmul(tmp, [Math.sin(hb), 0, 0, Math.cos(hb)], t2); qmul(t2, [0, 0, Math.sin(ht), Math.cos(ht)], tmp);
      this.rest.set(tmp, 4 * i);
    }
  }
  set(shape) {   // { x: [[..]], q: [[..]] }
    for (let i = 0; i < this.n; i++) { this.x.set(shape.x[i], 3 * i); this.q.set(shape.q[i], 4 * i); }
    this.xp.set(this.x); this.qp.set(this.q); this.v.fill(0); this.om.fill(0);
  }
  center() { let x = 0, y = 0, z = 0; for (let i = 0; i < this.n; i++) { x += this.x[3 * i]; y += this.x[3 * i + 1]; z += this.x[3 * i + 2]; } return [x / this.n, y / this.n, z / this.n]; }
  minY() { let m = Infinity; for (let i = 0; i < this.n; i++) m = Math.min(m, this.x[3 * i + 1]); return m - this.W / 2; }
}

// ---------------------------------------------------------------- the world: bands, hooks, clips, floor
export class BandWorld {
  constructor() {
    this.bands = []; this.hooks = []; this.clips = [];
    this.gravity = 1; this.floorY = 0; this.substeps = 16; this.calm = 0; this.awake = true;
    this.damping = 2.2;   // per second: air and the latex's own losses (a hung band swings for a couple of seconds)
    this.pairs = []; this._f = new Float64Array(9); this._g = new Float64Array(9);
  }
  band(key) { return this.bands.find((b) => b.key === key); }
  addBand(key, shape) { const b = new Band(key); b.set(shape); this.bands.push(b); this.wake(); return b; }
  clear() { this.bands = []; this.hooks = []; this.clips = []; this.pairs = []; this.wake(); }
  wake() { this.awake = true; this.calm = 0; this.still = 0; this.held = -1; this.age = 0; }

  // a clip holds segment `seg` of a band at position p (3) and orientation q (4): fingers pinching the band
  addClip(band, seg, p, q, temp = false) {
    const c = { band, seg, p: [...p], q: [...q], temp, tween: null };
    this.clips.push(c); this.wake(); return c;
  }
  removeClip(c) { this.clips = this.clips.filter((k) => k !== c); this.wake(); }
  addHook(a, b) { const h = { a: [...a], b: [...b], r: HOOK_R }; this.hooks.push(h); this.wake(); return h; }
  removeHook(h) { this.hooks = this.hooks.filter((k) => k !== h); this.wake(); }

  // ---------------------------------------------------------------- stepping
  step(dt = 1 / 60) {
    if (!this.awake) return false;
    for (const c of this.clips) if (c.tween) {   // a clip easing to a new position / angle
      const T = c.tween; T.k = Math.min(1, T.k + dt / T.dur); const e = T.k * T.k * (3 - 2 * T.k);
      for (let i = 0; i < 3; i++) c.p[i] = T.p0[i] + (T.p1[i] - T.p0[i]) * e;
      const qa = new THREE.Quaternion(...T.q0).slerp(new THREE.Quaternion(...T.q1), e); c.q = [qa.x, qa.y, qa.z, qa.w];
      if (T.k >= 1) c.tween = null;
    }
    for (const h of this.hooks) if (h.tween) {
      const T = h.tween; T.k = Math.min(1, T.k + dt / T.dur); const e = T.k * T.k * (3 - 2 * T.k);
      for (let i = 0; i < 3; i++) { h.a[i] = T.a0[i] + (T.a1[i] - T.a0[i]) * e; h.b[i] = T.b0[i] + (T.b1[i] - T.b0[i]) * e; }
      if (T.k >= 1) h.tween = null;
    }
    this.applyPins();
    this.broadphase();
    for (const b of this.bands) { (b._x0 ??= new Float64Array(b.x.length)).set(b.x); (b._q0 ??= new Float64Array(b.q.length)).set(b.q); }
    const h = dt / this.substeps, S = this.substeps;
    // calming down: from 3 s after the last touch (wake: a drag, a turn, a preset) the air thickens a little, up to 12
    // more per second by 7 s, and at 9 s whatever still moves is put to rest. Real bands come to rest within seconds;
    // here a band crumpled on itself could feed its own contacts and spin, or drift off, for ever (and with it the
    // simulation and the floor's live shadow never stopped)
    this.age = (this.age || 0) + dt;
    this.extraDamp = 12 * smooth01((this.age - 3) / 4);
    for (const k of this.hooks) { k.fa = k.ca ?? [...k.a]; k.fb = k.cb ?? [...k.b]; k.ca = [...k.a]; k.cb = [...k.b]; }
    for (const c of this.clips) { c.fp = c.cp ?? [...c.p]; c.cp = [...c.p]; }
    for (let s = 0; s < S; s++) {
      const t = (s + 1) / S;
      for (const k of this.hooks) {
        k.pa = k.fa.map((v, i) => v + (k.ca[i] - v) * t); k.pb = k.fb.map((v, i) => v + (k.cb[i] - v) * t);
        k.dv = k.fa.map((v, i) => (k.ca[i] - v) / S);
      }
      for (const c of this.clips) c.sp = c.fp.map((v, i) => v + (c.cp[i] - v) * t);
      this.substep(h);
    }
    // a safety net: should a band ever blow up (a value gone infinite or NaN, after some wild drag), it goes back to
    // where it was at the frame's start, at rest, rather than vanishing and taking the floor shadow with it
    for (const b of this.bands) {
      let sum = 0; for (let i = 0; i < b.x.length; i++) sum += b.x[i]; for (let i = 0; i < b.q.length; i++) sum += b.q[i];
      if (!Number.isFinite(sum)) { b.x.set(b._x0); b.xp.set(b._x0); b.q.set(b._q0); b.qp.set(b._q0); b.v.fill(0); b.om.fill(0); b.lamS.fill(0); b.lamB.fill(0); }
    }
    // asleep once nothing has moved more than 0.06 mm a frame for a third of a second (resting contacts tremble by
    // well under a millimetre a second; sleeping stops that and lets the floor shadow finish)
    let dmax = 0;
    for (const b of this.bands) for (let i = 0; i < b.x.length; i++) dmax = Math.max(dmax, Math.abs(b.x[i] - b._x0[i]));
    const busy = this.clips.some((c) => c.tween || c.temp) || this.hooks.some((k) => k.tween);
    this.calm = dmax < 0.006 && !busy ? this.calm + 1 : 0;
    this.still = dmax < 0.02 && !busy ? (this.still || 0) + 1 : 0;   // or nearly still for two seconds
    // or gone nowhere: every node within 0.5 mm of where it was two thirds of a second ago, but for a few (1.5%) within
    // 3 mm. Bands resting on bands, or on a band on the floor, tremble in place by a fraction of a millimetre, and a
    // tight curl can buzz by a millimetre, never quite still: that is at rest. (Two passes of the band contacts calm
    // them too, at twice the cost: 30 ms a frame for three bands.)
    let far = busy || !(this.held >= 0), loose = 0;
    const few = Math.max(4, Math.floor(0.015 * this.bands.reduce((s, b) => s + b.n, 0)));
    if (!far) for (const b of this.bands) {
      const A = b.anchor, x = b.x; if (!A) { far = true; break; }
      for (let i = 0; i < x.length && !far; i += 3) {
        const e0 = x[i] - A[i], e1 = x[i + 1] - A[i + 1], e2 = x[i + 2] - A[i + 2], d2 = e0 * e0 + e1 * e1 + e2 * e2;
        if (d2 > 2.5e-3) far = d2 > 0.09 || ++loose > few;
      }
      if (far) break;
    }
    if (far) { for (const b of this.bands) (b.anchor ??= new Float64Array(b.x.length)).set(b.x); this.held = 0; } else this.held++;
    if (this.calm > 20 || this.still > 120 || this.held >= 40 || (this.age > 9 && !busy)) { this.awake = false; this.still = 0; this.held = -1; for (const b of this.bands) { b.v.fill(0); b.om.fill(0); } }
    this.moved = dmax;
    return true;
  }
  applyPins() {   // the masses of clipped nodes and segments
    for (const b of this.bands) { b.iw.fill(1 / b.m); b.iwr.fill(12 / (ROT_INERTIA * b.m * b.W * b.W)); b.pin.fill(0); }
    for (const c of this.clips) { const b = c.band, n = b.n; b.iw[c.seg] = 0; b.iw[(c.seg + 1) % n] = 0; b.iwr[c.seg] = 0; b.pin[c.seg] = 1; }
  }
  substep(h) {
    this.flip = !this.flip;
    const g = GRAV * this.gravity, xd = this.extraDamp || 0, damp = Math.exp(-(this.damping + xd) * h), dampW = Math.exp(-(4 + xd) * h);
    for (const b of this.bands) {
      const { n, x, xp, v, q, qp, om, iw, iwr } = b;
      xp.set(x); qp.set(q);
      for (let i = 0; i < n; i++) {
        if (iw[i] > 0) { v[3 * i + 1] -= g * h; for (let k = 0; k < 3; k++) { v[3 * i + k] *= damp; x[3 * i + k] += v[3 * i + k] * h; } }
        if (iwr[i] > 0) { for (let k = 0; k < 3; k++) om[3 * i + k] *= dampW; rotateQ(q, 4 * i, om[3 * i] * h, om[3 * i + 1] * h, om[3 * i + 2] * h); }
      }
      b.lamS.fill(0); b.lamB.fill(0);
    }
    // clips follow their targets (kinematic)
    for (const c of this.clips) {
      const b = c.band, n = b.n, a = c.seg, e = (a + 1) % n, f = frameOf(c.q, this._f, 0), L = b.l0 / 2;
      const cp = c.sp || c.p;
      for (let k = 0; k < 3; k++) { b.x[3 * a + k] = cp[k] - f[6 + k] * L; b.x[3 * e + k] = cp[k] + f[6 + k] * L; }
      b.q.set(c.q, 4 * a);
    }
    for (const b of this.bands) { this.bend(b, h); this.stretch(b, h); }
    // the loop's length and the hooks / floor pull against each other (a stretched band round a hook): alternate them
    // a few times, the length's multipliers carried through, and end on the contacts so nothing is left inside a hook
    for (const b of this.bands) { b.hcOn.fill(0); b.hcPush.fill(0); b.hk.fill(-1); }
    for (let it = 0; it < 3; it++) {
      this.contacts();
      for (const b of this.bands) this.stretchDirect(b, h, it === 0 ? 2 : 1, it === 0);
    }
    this.contacts();
    this.hookGrip();
    this.bandContacts();
    this.floorGrip();
    for (const b of this.bands) {
      const { n, x, xp, v, q, qp, om, iw, iwr, fc } = b;
      for (let i = 0; i < n; i++) {
        for (let k = 0; k < 3; k++) v[3 * i + k] = iw[i] > 0 ? (x[3 * i + k] - xp[3 * i + k]) / h : 0;
        if (fc[i] > 0) { if (v[3 * i + 1] > 0) v[3 * i + 1] = 0; fc[i] = 0; }   // on the floor: no bounce
        if (iwr[i] > 0) {
          // angular velocity from the change of orientation: 2 Im(q conj(qp)) / h
          const o = qmul([q[4 * i], q[4 * i + 1], q[4 * i + 2], q[4 * i + 3]], [-qp[4 * i], -qp[4 * i + 1], -qp[4 * i + 2], qp[4 * i + 3]]);
          const sg = o[3] < 0 ? -2 / h : 2 / h;
          om[3 * i] = o[0] * sg; om[3 * i + 1] = o[1] * sg; om[3 * i + 2] = o[2] * sg;
        } else om[3 * i] = om[3 * i + 1] = om[3 * i + 2] = 0;
      }
    }
    this.contactVelocities(h);
    this.hookFriction(h);
    this.axialDamping();
  }
  // the floor's Coulomb friction, at the positions: each node on the floor slid this substep by d; up to mu x the
  // floor's push it is taken back (it sticks), beyond that by mu x the push (it slides). As a velocity change instead,
  // every substep's own corrections (a band's pull against its folds, the weight of a band on top) still moved the
  // nodes a little before it acted, and a pile of bands crept round on the floor without ever coming to rest
  floorGrip() {
    for (const b of this.bands) for (let i = 0; i < b.n; i++) {
      if (!(b.fc[i] > 0) || b.iw[i] === 0) continue;
      const dx = b.x[3 * i] - b.xp[3 * i], dz = b.x[3 * i + 2] - b.xp[3 * i + 2], L = Math.sqrt(dx * dx + dz * dz); if (L < 1e-12) continue;
      const k = Math.min(L, MU_FLOOR * b.fc[i]) / L; b.x[3 * i] -= dx * k; b.x[3 * i + 2] -= dz * k;
    }
  }
  // a band pressed on a hook does not slide along the hook's axis (the latex grips; nothing pushes it sideways but
  // rounding): that part of its move this substep, relative to the hook, is taken back
  hookGrip() {
    for (const b of this.bands) for (let i = 0; i < b.n; i++) {
      if (!(b.hcPush[i] > 0) || b.hk[i] < 0 || b.iw[i] === 0) continue;
      const k = this.hooks[b.hk[i]], A = k.pa || k.a, B = k.pb || k.b, ex = B[0] - A[0], ey = B[1] - A[1], ez = B[2] - A[2], eL = Math.sqrt(ex * ex + ey * ey + ez * ez);
      const ax = ex / eL, ay = ey / eL, az = ez / eL, dv = k.dv || [0, 0, 0];
      const d = (b.x[3 * i] - b.xp[3 * i] - dv[0]) * ax + (b.x[3 * i + 1] - b.xp[3 * i + 1] - dv[1]) * ay + (b.x[3 * i + 2] - b.xp[3 * i + 2] - dv[2]) * az;
      b.x[3 * i] -= d * ax; b.x[3 * i + 1] -= d * ay; b.x[3 * i + 2] -= d * az;
    }
  }
  // round a hook, Coulomb friction on the velocity (mu x the hook's push), relative to the hook: a band slides over a
  // hook only when the pull on one side beats the grip
  hookFriction(h) {
    for (const b of this.bands) for (let i = 0; i < b.n; i++) {
      if (!(b.hcPush[i] > 0) || b.hk[i] < 0 || b.iw[i] === 0) continue;
      const k = this.hooks[b.hk[i]], dv = k.dv || [0, 0, 0], nx = b.hc[3 * i], ny = b.hc[3 * i + 1], nz = b.hc[3 * i + 2];
      let vx = b.v[3 * i] - dv[0] / h, vy = b.v[3 * i + 1] - dv[1] / h, vz = b.v[3 * i + 2] - dv[2] / h;
      const vn = vx * nx + vy * ny + vz * nz;
      if (vn < 0) { b.v[3 * i] -= vn * nx; b.v[3 * i + 1] -= vn * ny; b.v[3 * i + 2] -= vn * nz; vx -= vn * nx; vy -= vn * ny; vz -= vn * nz; }
      else { vx -= vn * nx; vy -= vn * ny; vz -= vn * nz; }
      const vt = Math.sqrt(vx * vx + vy * vy + vz * vz); if (vt < 1e-9) continue;
      const cut = Math.min(vt, (MU_HOOK * b.hcPush[i]) / h) / vt;
      b.v[3 * i] -= vx * cut; b.v[3 * i + 1] -= vy * cut; b.v[3 * i + 2] -= vz * cut;
    }
  }
  // latex is viscoelastic: it damps its own stretching quickly. Damp each segment's rate of stretch (the relative
  // velocity of its ends along it), which stops the band ringing like a spring without slowing its swing or fall
  axialDamping(k = 0.35) {
    for (const b of this.bands) {
      const { n, x, v, iw } = b;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, wa = iw[i], wb = iw[j], W = wa + wb; if (W === 0) continue;
        let tx = x[3 * j] - x[3 * i], ty = x[3 * j + 1] - x[3 * i + 1], tz = x[3 * j + 2] - x[3 * i + 2]; const L = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1; tx /= L; ty /= L; tz /= L;
        const vr = (v[3 * j] - v[3 * i]) * tx + (v[3 * j + 1] - v[3 * i + 1]) * ty + (v[3 * j + 2] - v[3 * i + 2]) * tz, d = (k * vr) / W;
        v[3 * i] += wa * d * tx; v[3 * i + 1] += wa * d * ty; v[3 * i + 2] += wa * d * tz;
        v[3 * j] -= wb * d * tx; v[3 * j + 1] -= wb * d * ty; v[3 * j + 2] -= wb * d * tz;
      }
    }
  }
  // band against band, at the velocities: no bounce apart, and friction (mu x the push), shared by the two segments'
  // nodes by their inverse masses
  contactVelocities(h) {
    const L = this.bc || [];
    for (let k = 0; k < L.length; k += 8) {
      const b1 = L[k], s1 = L[k + 1], b2 = L[k + 2], s2 = L[k + 3], nx = L[k + 4], ny = L[k + 5], nz = L[k + 6], push = L[k + 7];
      const a1 = s1, c1 = (s1 + 1) % b1.n, a2 = s2, c2 = (s2 + 1) % b2.n;
      const w1 = 0.5 * (b1.iw[a1] + b1.iw[c1]), w2 = 0.5 * (b2.iw[a2] + b2.iw[c2]), W = w1 + w2;
      if (W <= 0) continue;
      const rv = this._rv ??= [0, 0, 0];
      for (let i = 0; i < 3; i++) rv[i] = 0.5 * (b1.v[3 * a1 + i] + b1.v[3 * c1 + i]) - 0.5 * (b2.v[3 * a2 + i] + b2.v[3 * c2 + i]);
      let vn = rv[0] * nx + rv[1] * ny + rv[2] * nz;
      const dv = [0, 0, 0];
      if (vn > 0) { dv[0] -= vn * nx; dv[1] -= vn * ny; dv[2] -= vn * nz; vn = 0; }
      const tx = rv[0] - (rv[0] * nx + rv[1] * ny + rv[2] * nz) * nx, ty = rv[1] - (rv[0] * nx + rv[1] * ny + rv[2] * nz) * ny, tz = rv[2] - (rv[0] * nx + rv[1] * ny + rv[2] * nz) * nz;
      const vt = Math.sqrt(tx * tx + ty * ty + tz * tz), cut = Math.min(vt, (MU_BAND * push) / h);
      if (vt > 1e-9) { dv[0] -= (tx / vt) * cut; dv[1] -= (ty / vt) * cut; dv[2] -= (tz / vt) * cut; }
      for (let i = 0; i < 3; i++) {
        const d1 = (dv[i] * w1) / W, d2 = (dv[i] * w2) / W;
        if (b1.iw[a1]) b1.v[3 * a1 + i] += d1; if (b1.iw[c1]) b1.v[3 * c1 + i] += d1;
        if (b2.iw[a2]) b2.v[3 * a2 + i] -= d2; if (b2.iw[c2]) b2.v[3 * c2 + i] -= d2;
      }
    }
  }
  // stretch and shear: (x_b - x_a) - l d3 = 0, compliance l / (E A)
  // Swept both ways each substep (a fixed order drifts the band one way; one sweep, alternating each substep, left a
  // pile of thick bands shaking between two answers, every other substep, and never asleep)
  stretch(b, h) {
    const { n, x, q, iw, iwr, lamS, l0 } = b, at = b.aS / (h * h), f = this._f;
    for (let jj = 0; jj < 2 * n; jj++) {
      const ii = jj % n, rev = (jj >= n) !== this.flip, i = rev ? n - 1 - ii : ii;
      const a = i, c = (i + 1) % n, wa = iw[a], wb = iw[c], wr = iwr[i];
      if (wa + wb + wr === 0) continue;
      frameOf(q, f, 4 * i);
      const d3x = f[6], d3y = f[7], d3z = f[8];
      const rx = x[3 * c] - x[3 * a] - l0 * d3x + at * lamS[3 * i];
      const ry = x[3 * c + 1] - x[3 * a + 1] - l0 * d3y + at * lamS[3 * i + 1];
      const rz = x[3 * c + 2] - x[3 * a + 2] - l0 * d3z + at * lamS[3 * i + 2];
      const rp = rx * d3x + ry * d3y + rz * d3z;
      const kp = 1 / (wa + wb + at), kq = 1 / (wa + wb + l0 * l0 * wr + at);
      const dx = -(rp * d3x * kp + (rx - rp * d3x) * kq), dy = -(rp * d3y * kp + (ry - rp * d3y) * kq), dz = -(rp * d3z * kp + (rz - rp * d3z) * kq);
      lamS[3 * i] += dx; lamS[3 * i + 1] += dy; lamS[3 * i + 2] += dz;
      x[3 * a] -= wa * dx; x[3 * a + 1] -= wa * dy; x[3 * a + 2] -= wa * dz;
      x[3 * c] += wb * dx; x[3 * c + 1] += wb * dy; x[3 * c + 2] += wb * dz;
      if (wr > 0) {   // d theta = wr l (dl x d3)
        const k = wr * l0;
        rotateQ(q, 4 * i, k * (dy * d3z - dz * d3y), k * (dz * d3x - dx * d3z), k * (dx * d3y - dy * d3x));
      }
    }
  }
  // the loop's length, solved at once: every segment's |x_b - x_a| = l with compliance l / (E A), coupled through
  // their shared nodes (a cyclic tridiagonal system, solved exactly). Link-by-link solving leaves long hanging strands
  // far too stretchy; this keeps the stretch physical (a hanging band stretches by a fraction of a percent)
  stretchDirect(b, h, iters = 2, reset = true) {
    const { n, x, iw, l0, hc, hcOn } = b, at = b.aS / (h * h);
    const S = b._sd ??= { nv: new Float64Array(3 * n), C: new Float64Array(n), lo: new Float64Array(n), di: new Float64Array(n), up: new Float64Array(n), rhs: new Float64Array(n), lam: new Float64Array(n), fx: new Uint8Array(n), y: new Float64Array(n), z: new Float64Array(n), cp: new Float64Array(n), dp: new Float64Array(n) };
    const { nv, C, lo, di, up, rhs, lam, fx } = S;
    for (let i = 0; i < n; i++) fx[i] = iw[i] + iw[(i + 1) % n] === 0 ? 1 : 0;   // both ends held: nothing to solve
    if (reset) lam.fill(0);
    // a . W_k . c: node k's inverse mass between two directions; a node pressed on a hook cannot move into it, so its
    // mass there is infinite (the solve then shares the shortening out round the hook, as on a real peg)
    const wdot = (k, ax, ay, az, cx, cy, cz) => {
      const w = iw[k]; if (w === 0) return 0;
      let d = ax * cx + ay * cy + az * cz;
      if (hcOn[k]) { const mx = hc[3 * k], my = hc[3 * k + 1], mz = hc[3 * k + 2]; d -= (ax * mx + ay * my + az * mz) * (cx * mx + cy * my + cz * mz); }
      return w * d;
    };
    for (let it = 0; it < iters; it++) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, ex = x[3 * j] - x[3 * i], ey = x[3 * j + 1] - x[3 * i + 1], ez = x[3 * j + 2] - x[3 * i + 2], L = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1e-9;
        nv[3 * i] = ex / L; nv[3 * i + 1] = ey / L; nv[3 * i + 2] = ez / L; C[i] = L - l0;
      }
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, p = (i - 1 + n) % n, fixed = fx[i];
        const ax = nv[3 * i], ay = nv[3 * i + 1], az = nv[3 * i + 2];
        // (floored: a segment square to the hook at both ends would otherwise have almost no give and blow up)
        di[i] = fixed ? 1 : Math.max(wdot(i, ax, ay, az, ax, ay, az) + wdot(j, ax, ay, az, ax, ay, az), 0.15 * (iw[i] + iw[j])) + at;
        // couplings through the shared nodes: constraint i and i+1 share node i+1; i and i-1 share node i
        // (none to or from a held segment)
        up[i] = fixed || fx[j] ? 0 : -wdot(j, ax, ay, az, nv[3 * j], nv[3 * j + 1], nv[3 * j + 2]);
        lo[i] = fixed || fx[p] ? 0 : -wdot(i, nv[3 * p], nv[3 * p + 1], nv[3 * p + 2], ax, ay, az);
        rhs[i] = fixed ? 0 : -(C[i] + at * lam[i]);
      }
      const dl = cyclicTridiag(lo, di, up, rhs, S);
      for (let i = 0; i < n; i++) lam[i] += dl[i];
      for (let i = 0; i < n; i++) {
        if (iw[i] === 0) continue;
        const p = (i - 1 + n) % n, w = iw[i];
        let dx = w * (nv[3 * p] * dl[p] - nv[3 * i] * dl[i]), dy = w * (nv[3 * p + 1] * dl[p] - nv[3 * i + 1] * dl[i]), dz = w * (nv[3 * p + 2] * dl[p] - nv[3 * i + 2] * dl[i]);
        // under tension the band is stiff sideways too (geometric stiffness, which this linear step leaves out): each
        // segment's tension T resists moves square to it, so the move is (I + w sum T/l (I - n n^T))^-1 times the
        // raw move. Without it a taut band overshoots and kinks; done per segment, it keeps a bend round a hook free
        // to tighten
        const kp = (w * Math.abs(lam[p])) / l0, ki = (w * Math.abs(lam[i])) / l0;
        if (kp + ki > 1e-6) {
          const ax = nv[3 * p], ay = nv[3 * p + 1], az = nv[3 * p + 2], bx = nv[3 * i], by = nv[3 * i + 1], bz = nv[3 * i + 2];
          const m00 = 1 + kp * (1 - ax * ax) + ki * (1 - bx * bx), m11 = 1 + kp * (1 - ay * ay) + ki * (1 - by * by), m22 = 1 + kp * (1 - az * az) + ki * (1 - bz * bz);
          const m01 = -kp * ax * ay - ki * bx * by, m02 = -kp * ax * az - ki * bx * bz, m12 = -kp * ay * az - ki * by * bz;
          const c00 = m11 * m22 - m12 * m12, c01 = m02 * m12 - m01 * m22, c02 = m01 * m12 - m02 * m11;
          const det = m00 * c00 + m01 * c01 + m02 * c02;
          const c11 = m00 * m22 - m02 * m02, c12 = m01 * m02 - m00 * m12, c22 = m00 * m11 - m01 * m01;
          const rx = (c00 * dx + c01 * dy + c02 * dz) / det, ry = (c01 * dx + c11 * dy + c12 * dz) / det, rz = (c02 * dx + c12 * dy + c22 * dz) / det;
          dx = rx; dy = ry; dz = rz;
        }
        if (hcOn[i]) {   // pressed on a hook: it can slide on it or leave it, not go into it (that push is the hook's reaction)
          const mx = hc[3 * i], my = hc[3 * i + 1], mz = hc[3 * i + 2], d = dx * mx + dy * my + dz * mz;
          if (d < 0) { dx -= d * mx; dy -= d * my; dz -= d * mz; b.hcPush[i] -= d; }
        }
        x[3 * i] += dx; x[3 * i + 1] += dy; x[3 * i + 2] += dz;
      }
    }
  }
  // bend and twist: Im(conj(q_i) q_j) - Im(rest), per axis of segment i's frame, compliance l / (4 E I)
  // latex damps its own bending and twisting: a Rayleigh damping in the constraint itself (XPBD's damped form, the
  // bend's change over the substep resisted with gamma = r / h). Its time r = 1.5 ms damps short ripples and kinks
  // (a 2 cm crinkle is overdamped) and leaves the band's long swing and fall alone. (A pass damping neighbouring
  // segments' spins instead fought the stiff twist and kept the heavy band buzzing on the floor)
  bend(b, h) {
    const { n, q, qp, iwr, lamB, rest, aB } = b, f = this._f, ih2 = 1 / (h * h), rev = this.flip, gam = BEND_DAMP / h;
    for (let ii = 0; ii < n; ii++) {
      const i = rev ? n - 1 - ii : ii;
      const j = (i + 1) % n, wi = iwr[i], wj = iwr[j];
      if (wi + wj === 0) continue;
      const ax = q[4 * i], ay = q[4 * i + 1], az = q[4 * i + 2], aw = q[4 * i + 3];
      const bx = q[4 * j], by = q[4 * j + 1], bz = q[4 * j + 2], bw = q[4 * j + 3];
      // omega = conj(a) b
      let ox = aw * bx - bw * ax - ay * bz + az * by, oy = aw * by - bw * ay - az * bx + ax * bz;
      let oz = aw * bz - bw * az - ax * by + ay * bx, ow = aw * bw + ax * bx + ay * by + az * bz;
      const r = 4 * i; let rx = rest[r], ry = rest[r + 1], rz = rest[r + 2], rw = rest[r + 3];
      if (ox * rx + oy * ry + oz * rz + ow * rw < 0) { rx = -rx; ry = -ry; rz = -rz; rw = -rw; }
      const C = [ox - rx, oy - ry, oz - rz], W = 0.25 * (wi + wj), dl = [0, 0, 0];
      // the same at the substep's start (for the damping)
      const px = qp[4 * i], py = qp[4 * i + 1], pz = qp[4 * i + 2], pw = qp[4 * i + 3];
      const sx = qp[4 * j], sy = qp[4 * j + 1], sz = qp[4 * j + 2], sw = qp[4 * j + 3];
      let gx = pw * sx - sw * px - py * sz + pz * sy, gy = pw * sy - sw * py - pz * sx + px * sz;
      let gz = pw * sz - sw * pz - px * sy + py * sx; const gw = pw * sw + px * sx + py * sy + pz * sz;
      if (gx * ox + gy * oy + gz * oz + gw * ow < 0) { gx = -gx; gy = -gy; gz = -gz; }
      const dC = [ox - gx, oy - gy, oz - gz];
      // (without the twist's stiffening a band twisted by a turned hook crinkled, and one dropped coiled up like string)
      const tau = (2 * C[2]) / b.l0, kt = Math.min(60, 1 + b.KT * tau * tau);
      for (let k = 0; k < 3; k++) {
        const at = (k === 2 ? aB[k] / kt : aB[k]) * ih2;
        dl[k] = -(C[k] + at * lamB[3 * i + k] + gam * dC[k]) / ((1 + gam) * W + at);
        lamB[3 * i + k] += dl[k];
      }
      // world update: d theta_j = 1/2 wj R_i (w dl + v x dl), d theta_i = -1/2 wi R_i (w dl + v x dl)
      const mx = ow * dl[0] + (oy * dl[2] - oz * dl[1]), my = ow * dl[1] + (oz * dl[0] - ox * dl[2]), mz = ow * dl[2] + (ox * dl[1] - oy * dl[0]);
      frameOf(q, f, 4 * i);
      const Wx = f[0] * mx + f[3] * my + f[6] * mz, Wy = f[1] * mx + f[4] * my + f[7] * mz, Wz = f[2] * mx + f[5] * my + f[8] * mz;
      if (wj > 0) rotateQ(q, 4 * j, 0.5 * wj * Wx, 0.5 * wj * Wy, 0.5 * wj * Wz);
      if (wi > 0) rotateQ(q, 4 * i, -0.5 * wi * Wx, -0.5 * wi * Wy, -0.5 * wi * Wz);
    }
  }

  // ---------------------------------------------------------------- contacts
  // a point of segment s at offset u across the band (world), now and one substep ago
  pointOf(b, s, u, out, prev = false) {
    const x = prev ? b.xp : b.x, f = frameOf(prev ? b.qp : b.q, this._g, 4 * s), a = s, c = (s + 1) % b.n;
    for (let k = 0; k < 3; k++) out[k] = 0.5 * (x[3 * a + k] + x[3 * c + k]) + u * f[k];
    return out;
  }
  // move a point of segment s (offset r from its centre) by -C along n, sharing it between the segment's two nodes
  // and its rotation (its effective inverse mass at that point)
  pointWeight(b, s, r, n) {
    const a = s, c = (s + 1) % b.n, cx = r[1] * n[2] - r[2] * n[1], cy = r[2] * n[0] - r[0] * n[2], cz = r[0] * n[1] - r[1] * n[0];
    return 0.5 * (b.iw[a] + b.iw[c]) + b.iwr[s] * (cx * cx + cy * cy + cz * cz);
  }
  pushPoint(b, s, r, n, lam) {
    const a = s, c = (s + 1) % b.n, wa = b.iw[a], wc = b.iw[c], wr = b.iwr[s];
    for (let k = 0; k < 3; k++) { b.x[3 * a + k] += wa * lam * n[k]; b.x[3 * c + k] += wc * lam * n[k]; }
    if (wr > 0) {
      const cx = r[1] * n[2] - r[2] * n[1], cy = r[2] * n[0] - r[0] * n[2], cz = r[0] * n[1] - r[1] * n[0];
      rotateQ(b.q, 4 * s, wr * lam * cx, wr * lam * cy, wr * lam * cz);
    }
  }
  // friction: undo the point's sliding along the surface this substep, up to mu x the push it got
  friction(b, s, u, r, n, pushed, mu, other) {
    const p = this.pointOf(b, s, u, [0, 0, 0]), pp = this.pointOf(b, s, u, [0, 0, 0], true);
    let dx = p[0] - pp[0], dy = p[1] - pp[1], dz = p[2] - pp[2];
    if (other) { dx -= other[0]; dy -= other[1]; dz -= other[2]; }
    const dn = dx * n[0] + dy * n[1] + dz * n[2];
    dx -= dn * n[0]; dy -= dn * n[1]; dz -= dn * n[2];
    const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (L < 1e-9) return;
    const tdir = [dx / L, dy / L, dz / L], cut = L < mu * pushed ? L : mu * pushed;
    const W = this.pointWeight(b, s, r, tdir);
    if (W > 0) this.pushPoint(b, s, r, tdir, -cut / W);
  }
  // Three parts, each its own function: Safari's engine optimised the one big function while a preset had no hooks
  // (the Loops) and then, with hooks, kept leaving its optimised code: 14 times slower, the whole simulation 4 times
  contacts() {
    for (const b of this.bands) {
      // only the hooks near this band (a box round it): each band hangs on two, and testing every node against all
      // six cost a third of the simulation's time
      const hooks = this.hooksNear(b);
      this.floorContacts(b);
      if (hooks.length) { this.hookContacts(b, hooks); this.hookChords(b, hooks); }
    }
  }
  floorContacts(b) {
    const r = this._cr ??= [0, 0, 0], n = this._cn ??= [0, 0, 0], f = this._f;
    const hw = b.W / 2 - b.t / 2, U = this.flip ? [hw, hw / 2, 0, -hw / 2, -hw] : [-hw, -hw / 2, 0, hw / 2, hw];
    for (let ss = 0; ss < b.n; ss++) {
      const s = this.flip ? b.n - 1 - ss : ss;
      if (b.pin[s]) continue;
      // well above the floor (its nodes higher than the band's half-width reaches): nothing to do. Floating, that is
      // every segment, and the five points' tests below were half of a frame's simulation time
      const s2 = (s + 1) % b.n;
      if (Math.min(b.x[3 * s + 1], b.x[3 * s2 + 1]) - b.W / 2 - b.t > this.floorY) continue;
      // the segment's frame and middle, worked out again only after a push has moved it
      frameOf(b.q, f, 4 * s);
      let my = 0.5 * (b.x[3 * s + 1] + b.x[3 * s2 + 1]), fresh = true, floorPush = 0;
      for (let ui = 0; ui < 5; ui++) {
        const u = U[ui];
        if (!fresh) { frameOf(b.q, f, 4 * s); my = 0.5 * (b.x[3 * s + 1] + b.x[3 * s2 + 1]); fresh = true; }
        // the floor
        const C = my + u * f[1] - this.floorY - b.t / 2;
        if (C < 0) {
          r[0] = u * f[0]; r[1] = u * f[1]; r[2] = u * f[2];
          n[0] = 0; n[1] = 1; n[2] = 0;
          const W = this.pointWeight(b, s, r, n);
          if (W > 0) { this.pushPoint(b, s, r, n, -C / W); floorPush -= C; fresh = false; }
        }
      }
      // how hard the floor pushed this substep, summed over every pass (its friction, floorGrip, is in proportion;
      // counting only the last pass, after the first had taken most of the weight, left bands in a pile sliding)
      if (floorPush > 0) { const c = (s + 1) % b.n; b.fc[s] += 0.5 * floorPush; b.fc[c] += 0.5 * floorPush; }
    }
  }
  hookContacts(b, hooks) {
    // the hooks act on the nodes (the length solve's own unknowns, so the two settle together round a hook): each
    // node is kept a band's half-thickness outside the rod, on the side it was a substep ago (a stretched band is
    // pulled hard against a hook and must not slip through it), with friction relative to the hook's motion
    for (let i = 0; i < b.n; i++) {
      if (b.iw[i] === 0) continue;
      for (const k of hooks) {
        const A = k.pa || k.a, B = k.pb || k.b, ex = B[0] - A[0], ey = B[1] - A[1], ez = B[2] - A[2], el = ex * ex + ey * ey + ez * ez, eL = Math.sqrt(el);
        const px = b.x[3 * i], py = b.x[3 * i + 1], pz = b.x[3 * i + 2];
        const tt = ((px - A[0]) * ex + (py - A[1]) * ey + (pz - A[2]) * ez) / el;
        if (tt < -0.02 || tt > 1.02) continue;
        const cx = A[0] + ex * tt, cy = A[1] + ey * tt, cz = A[2] + ez * tt;
        const dx = px - cx, dy = py - cy, dz = pz - cz;
        if (dx * dx + dy * dy + dz * dz > (k.r + 4) * (k.r + 4)) continue;
        const FA = k.fa || A, ax = ex / eL, ay = ey / eL, az = ez / eL;
        let qx = b.xp[3 * i] - FA[0], qy = b.xp[3 * i + 1] - FA[1], qz = b.xp[3 * i + 2] - FA[2];
        const qa = qx * ax + qy * ay + qz * az; qx -= qa * ax; qy -= qa * ay; qz -= qa * az;
        const ql = Math.sqrt(qx * qx + qy * qy + qz * qz); if (ql < 1e-6) continue;
        const nx = qx / ql, ny = qy / ql, nz = qz / ql, C = dx * nx + dy * ny + dz * nz - k.r - b.t / 2;
        if (C >= 0.03) continue;
        // the hooks have stops at their ends, as a studio rig's would: a band on one cannot slide off its end
        const room = Math.min(0.5, (b.W / 2 + 0.25) / eL), over = tt < room ? room - tt : tt > 1 - room ? 1 - room - tt : 0;
        if (over !== 0) { b.x[3 * i] += ax * over * eL; b.x[3 * i + 1] += ay * over * eL; b.x[3 * i + 2] += az * over * eL; }
        b.hcOn[i] = 1; b.hc[3 * i] = nx; b.hc[3 * i + 1] = ny; b.hc[3 * i + 2] = nz;   // the length solve slides it on the rod
        if (C < 0) { b.x[3 * i] -= C * nx; b.x[3 * i + 1] -= C * ny; b.x[3 * i + 2] -= C * nz; b.hcPush[i] -= C; }
        b.hk[i] = k.id;
      }
    }
  }
  hookChords(b, hooks) {
    // and no segment cuts through a hook between its two nodes (a taut band's chord over a thin rod): its middle is
    // kept outside too, by moving both its nodes out
    for (let i = 0; i < b.n; i++) {
      const j = (i + 1) % b.n, wa = b.iw[i], wb = b.iw[j]; if (wa + wb === 0) continue;
      const mx = 0.5 * (b.x[3 * i] + b.x[3 * j]), my = 0.5 * (b.x[3 * i + 1] + b.x[3 * j + 1]), mz = 0.5 * (b.x[3 * i + 2] + b.x[3 * j + 2]);
      for (const k of hooks) {
        const A = k.pa || k.a, B = k.pb || k.b, ex = B[0] - A[0], ey = B[1] - A[1], ez = B[2] - A[2], el = ex * ex + ey * ey + ez * ez;
        const tt = ((mx - A[0]) * ex + (my - A[1]) * ey + (mz - A[2]) * ez) / el; if (tt < 0 || tt > 1) continue;
        const dx = mx - (A[0] + ex * tt), dy = my - (A[1] + ey * tt), dz = mz - (A[2] + ez * tt), d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const C = d - k.r; if (C >= 0 || d < 1e-6) continue;
        // out along the side its nodes are on (their mean direction from the axis)
        const W = 0.5 * (wa + wb), lam = -C / W, nx = dx / d, ny = dy / d, nz = dz / d;
        b.x[3 * i] += wa * lam * nx; b.x[3 * i + 1] += wa * lam * ny; b.x[3 * i + 2] += wa * lam * nz;
        b.x[3 * j] += wb * lam * nx; b.x[3 * j + 1] += wb * lam * ny; b.x[3 * j + 2] += wb * lam * nz;
      }
    }
  }
  hooksNear(b) {
    const hs = this.hooks; if (!hs.length) return hs;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity; const x = b.x;
    for (let i = 0; i < x.length; i += 3) {
      const a = x[i], c = x[i + 1], e = x[i + 2];
      if (a < x0) x0 = a; if (a > x1) x1 = a; if (c < y0) y0 = c; if (c > y1) y1 = c; if (e < z0) z0 = e; if (e > z1) z1 = e;
    }
    const out = (b._near ||= []); out.length = 0;
    for (let k = 0; k < hs.length; k++) {
      const h = hs[k], A = h.pa || h.a, B = h.pb || h.b, m = h.r + 4; h.id = k;
      if (Math.min(A[0], B[0]) - m > x1 || Math.max(A[0], B[0]) + m < x0) continue;
      if (Math.min(A[1], B[1]) - m > y1 || Math.max(A[1], B[1]) + m < y0) continue;
      if (Math.min(A[2], B[2]) - m > z1 || Math.max(A[2], B[2]) + m < z0) continue;
      out.push(h);
    }
    return out;
  }
  slide(b, s, n, limit, other) {
    const a = s, c = (s + 1) % b.n, wa = b.iw[a], wc = b.iw[c], W = 0.5 * (wa + wc);
    if (W <= 0) return;
    let dx = 0.5 * (b.x[3 * a] + b.x[3 * c] - b.xp[3 * a] - b.xp[3 * c]);
    let dy = 0.5 * (b.x[3 * a + 1] + b.x[3 * c + 1] - b.xp[3 * a + 1] - b.xp[3 * c + 1]);
    let dz = 0.5 * (b.x[3 * a + 2] + b.x[3 * c + 2] - b.xp[3 * a + 2] - b.xp[3 * c + 2]);
    if (other) { dx -= other[0]; dy -= other[1]; dz -= other[2]; }
    const dn = dx * n[0] + dy * n[1] + dz * n[2];
    dx -= dn * n[0]; dy -= dn * n[1]; dz -= dn * n[2];
    const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (L < 1e-12) return;
    const cut = Math.min(L, limit), lam = -cut / (L * W);
    for (let k = 0; k < 3; k++) { const d = [dx, dy, dz][k] * lam; b.x[3 * a + k] += wa * d; b.x[3 * c + k] += wc * d; }
  }
  // once a step: segment pairs close enough to touch (each band against itself and the others)
  broadphase() {
    const R = BAND.W + 0.6, R2 = R * R, cell = R, grid = new Map(), f = this._f, g = this._g;
    const K = (i, j, k) => (i + 512) * 1048576 + (j + 512) * 1024 + (k + 512);
    for (const b of this.bands) {
      b.cc ??= new Float64Array(3 * b.n);
      for (let s = 0; s < b.n; s++) {
        const c = (s + 1) % b.n;
        for (let k = 0; k < 3; k++) b.cc[3 * s + k] = 0.5 * (b.x[3 * s + k] + b.x[3 * c + k]);
        const key = K(Math.floor(b.cc[3 * s] / cell), Math.floor(b.cc[3 * s + 1] / cell), Math.floor(b.cc[3 * s + 2] / cell));
        let L = grid.get(key); if (!L) grid.set(key, (L = [])); L.push(b, s);
      }
    }
    const pairs = [];
    for (const A of this.bands) for (let s = 0; s < A.n; s++) {
      const ax = A.cc[3 * s], ay = A.cc[3 * s + 1], az = A.cc[3 * s + 2];
      const ci = Math.floor(ax / cell), cj = Math.floor(ay / cell), ck = Math.floor(az / cell);
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (let dk = -1; dk <= 1; dk++) {
        const L = grid.get(K(ci + di, cj + dj, ck + dk)); if (!L) continue;
        for (let m = 0; m < L.length; m += 2) {
          const B = L[m], t = L[m + 1];
          if (B === A) { if (t <= s) continue; const d = t - s, dd = Math.min(d, A.n - d); if (dd <= 7) continue; }
          else if (B.key < A.key) continue;
          const dx = B.cc[3 * t] - ax, dy = B.cc[3 * t + 1] - ay, dz = B.cc[3 * t + 2] - az;
          if (dx * dx + dy * dy + dz * dz > R2) continue;
          if (this.near(A, s, B, t, f, g) || this.near(B, t, A, s, f, g)) pairs.push(A, s, B, t);
        }
      }
    }
    this.pairs = pairs;
  }
  // does an edge or the middle of segment s of A lie over segment t of B's patch, within a margin?
  near(A, s, B, t, f, g) {
    frameOf(B.q, f, 4 * t); frameOf(A.q, g, 4 * s);
    const hw = A.W / 2, bx = B.cc[3 * t], by = B.cc[3 * t + 1], bz = B.cc[3 * t + 2];
    for (let k = -1; k <= 1; k++) {
      const px = A.cc[3 * s] + k * hw * g[0] - bx, py = A.cc[3 * s + 1] + k * hw * g[1] - by, pz = A.cc[3 * s + 2] + k * hw * g[2] - bz;
      const pu = px * f[0] + py * f[1] + pz * f[2], pv = px * f[6] + py * f[7] + pz * f[8], ph = px * f[3] + py * f[4] + pz * f[5];
      if (Math.abs(pu) < B.W / 2 + 0.4 && Math.abs(pv) < B.l0 / 2 + 0.4 && Math.abs(ph) < 0.8) return true;
    }
    return false;
  }
  bandContacts() {
    this.bc = [];
    const P = this.pairs, np = P.length;
    for (const b of this.bands) {   // each segment's centre and normal a substep ago: which side a point was on
      b.cp ??= new Float64Array(3 * b.n); b.np ??= new Float64Array(3 * b.n);
      for (let s = 0; s < b.n; s++) {
        const c = (s + 1) % b.n, x = b.qp[4 * s], y = b.qp[4 * s + 1], z = b.qp[4 * s + 2], w = b.qp[4 * s + 3];
        for (let k = 0; k < 3; k++) b.cp[3 * s + k] = 0.5 * (b.xp[3 * s + k] + b.xp[3 * c + k]);
        b.np[3 * s] = 2 * (x * y - z * w); b.np[3 * s + 1] = 1 - 2 * (x * x + z * z); b.np[3 * s + 2] = 2 * (y * z + x * w);
      }
    }
    // in the same order every substep: alternating it, a pile of bands settled on two answers, every other substep
    for (let m = 0; m < np; m += 4) { this.patchTest(P[m], P[m + 1], P[m + 2], P[m + 3]); this.patchTest(P[m + 2], P[m + 3], P[m], P[m + 1]); }
  }
  // the edges and middle of segment s1 of band b1 against the patch of segment s2 of band b2: pushed apart along the
  // patch's normal, to the side they were on, by their effective inverse masses
  patchTest(b1, s1, b2, s2) {
    const f = this._f, g = this._g, r1 = this._r1 ??= [0, 0, 0], r2 = this._r2 ??= [0, 0, 0], n = this._n ??= [0, 0, 0], m = this._m ??= [0, 0, 0];
    const gap = (b1.t + b2.t) / 2 + 0.03, hw1 = b1.W / 2 - b1.t / 2, n2 = b2.n, n1 = b1.n;
    frameOf(b2.q, f, 4 * s2); frameOf(b1.q, g, 4 * s1);
    const e2 = (s2 + 1) % n2, e1 = (s1 + 1) % n1;
    const c2x = 0.5 * (b2.x[3 * s2] + b2.x[3 * e2]), c2y = 0.5 * (b2.x[3 * s2 + 1] + b2.x[3 * e2 + 1]), c2z = 0.5 * (b2.x[3 * s2 + 2] + b2.x[3 * e2 + 2]);
    const c1x = 0.5 * (b1.x[3 * s1] + b1.x[3 * e1]), c1y = 0.5 * (b1.x[3 * s1 + 1] + b1.x[3 * e1 + 1]), c1z = 0.5 * (b1.x[3 * s1 + 2] + b1.x[3 * e1 + 2]);
    const p1x = 0.5 * (b1.xp[3 * s1] + b1.xp[3 * e1]), p1y = 0.5 * (b1.xp[3 * s1 + 1] + b1.xp[3 * e1 + 1]), p1z = 0.5 * (b1.xp[3 * s1 + 2] + b1.xp[3 * e1 + 2]);
    const qx = b1.qp[4 * s1], qy = b1.qp[4 * s1 + 1], qz = b1.qp[4 * s1 + 2], qw = b1.qp[4 * s1 + 3];
    const g0p = 1 - 2 * (qy * qy + qz * qz), g1p = 2 * (qx * qy + qz * qw), g2p = 2 * (qx * qz - qy * qw);   // d1 a substep ago
    const cpx = b2.cp[3 * s2], cpy = b2.cp[3 * s2 + 1], cpz = b2.cp[3 * s2 + 2], npx = b2.np[3 * s2], npy = b2.np[3 * s2 + 1], npz = b2.np[3 * s2 + 2];
    for (let k = -1; k <= 1; k++) {
      const u = k * hw1;
      const px = c1x + u * g[0] - c2x, py = c1y + u * g[1] - c2y, pz = c1z + u * g[2] - c2z;
      const pu = px * f[0] + py * f[1] + pz * f[2];
      if (Math.abs(pu) > b2.W / 2) continue;
      const pv = px * f[6] + py * f[7] + pz * f[8];
      if (Math.abs(pv) > b2.l0 * 0.5 + 0.02) continue;
      const ph = px * f[3] + py * f[4] + pz * f[5];
      if (Math.abs(ph) > gap + 0.8) continue;
      const hp = (p1x + u * g0p - cpx) * npx + (p1y + u * g1p - cpy) * npy + (p1z + u * g2p - cpz) * npz;
      const side = hp >= 0 ? 1 : -1, C = side * ph - gap;
      if (C >= 0) continue;
      n[0] = side * f[3]; n[1] = side * f[4]; n[2] = side * f[5];
      r1[0] = u * g[0]; r1[1] = u * g[1]; r1[2] = u * g[2];
      r2[0] = px - ph * f[3]; r2[1] = py - ph * f[4]; r2[2] = pz - ph * f[5];
      const W = this.pointWeight(b1, s1, r1, n) + this.pointWeight(b2, s2, r2, n);
      if (W <= 0) continue;
      const lam = -C / W;
      this.pushPoint(b1, s1, r1, n, lam);
      m[0] = -n[0]; m[1] = -n[1]; m[2] = -n[2];
      this.pushPoint(b2, s2, r2, m, lam);
      this.bc.push(b1, s1, b2, s2, n[0], n[1], n[2], -C);
    }
  }

  // ---------------------------------------------------------------- queries
  bounds() {
    const bb = new THREE.Box3();
    for (const b of this.bands) for (let i = 0; i < b.n; i++) bb.expandByPoint(new THREE.Vector3(b.x[3 * i], b.x[3 * i + 1], b.x[3 * i + 2]));
    return bb.expandByScalar(BAND.W / 2);
  }
  segFrame(b, s) { const f = frameOf(b.q, new Float64Array(9), 4 * s); return { d1: [f[0], f[1], f[2]], d2: [f[3], f[4], f[5]], d3: [f[6], f[7], f[8]] }; }
  segCenter(b, s) { return this.pointOf(b, s, 0, [0, 0, 0]); }
}

// ---------------------------------------------------------------- shapes for the presets
// planar rest oval / flattened loop, oriented by a rotation and placed at a point
export function restOval() { return ellipseLoop(BAND.N, BAND.C, REST_ASPECT); }
// lying flat, a loop's folds are as round as its stiffness against its own weight makes them: the bending length
// (E t^2 / 12 rho g)^(1/3) is 2.0 cm for Light, 2.3 Medium, 2.6 Heavy; the folds start at 0.6 of it (radius) and
// settle from there (starting tighter, the floor's friction held them too flat: low folds, unlike the photo's)
export const foldRadius = (t) => 0.6 * Math.cbrt((E * t * t) / (12 * RHO * GRAV));
export function flatLoop(t = 0.07) { return stadiumLoop(BAND.N, BAND.C, foldRadius(t)); }
// floating, as in the brand's render: open loops, each a little irregular, as a soft latex loop sits when let go. A
// rounded oval (a superellipse, p) with a waist, a bend (C) or an S along it, or one strand bowed in; one per band, so
// they don't look alike. In the units of the half length; scaled to the band's 60 cm.
const LOOPS = {
  heavy:  { aspect: 0.30, p: 2.3, waist: 0.45, bow: 0, bend: 0.05, s: 0 },
  light:  { aspect: 0.31, p: 2.4, waist: 0.15, bow: 0, bend: 0, s: 0.11 },
  medium: { aspect: 0.33, p: 2.4, waist: 0, bow: 0.4, bend: 0, s: -0.04 },
};
// standing on a surface: each band in its own soft, organic outline, as a loop stands when set down (the yellow
// one with a waist, a bean, a soft S), not three even ovals. bowB: the back strand bowed in; swell: one end fuller
// than the other; bowAt: where along the band the bow sits. In the plane, -Y is the front strand (to the camera).
const STANDS = {
  heavy:  { aspect: 0.32, p: 2.2, waist: 0.3, bow: 0, bend: 0.03, s: 0.1, swell: 0.15 },
  light:  { aspect: 0.34, p: 2.2, waist: 0.08, bow: 0.5, bowAt: 0.2, bend: 0.07, s: 0, swell: -0.1 },
  medium: { aspect: 0.37, p: 2.1, waist: 0.4, bow: 0.1, bowB: 0.2, bend: 0, s: 0, swell: 0.06 },
};
function organicLoop(L, n) {
  const at = L.bowAt ?? 0.1;
  const e = sampleClosed((t) => {
    const c = Math.cos(t), sn = Math.sin(t), u = Math.sign(c) * Math.abs(c) ** (2 / L.p);
    let y = L.aspect * Math.sign(sn) * Math.abs(sn) ** (2 / L.p);
    y *= 1 - L.waist * Math.exp(-(u * u) / 0.2);
    y *= 1 + (L.swell || 0) * u;
    y *= 1 - (y < 0 ? L.bow : L.bowB || 0) * Math.exp(-((u - at) ** 2) / 0.15);
    return [u, y + L.bend * (1 - u * u) + L.s * Math.sin(Math.PI * u)];
  }, n);
  const k = BAND.C / e.L; return e.pts.map(([x, y]) => [x * k, y * k]);
}
export function brandLoop(key, n = BAND.N) { return organicLoop(LOOPS[key], n); }
export function standLoop(key, n = BAND.N) { return organicLoop(STANDS[key], n); }
export function shapeAt(pts2, rot, pos) { return placeLoop(pts2, new THREE.Matrix4().compose(new THREE.Vector3(...pos), rot, new THREE.Vector3(1, 1, 1))); }
export const REST = { a: () => { const p = restOval(); return Math.max(...p.map((v) => v[0])); }, b: () => { const p = restOval(); return Math.max(...p.map((v) => v[1])); } };
export { HOOK_R };

// ---------------------------------------------------------------- print
const INK = '#26252b';
// Every band carries both prints, as the real ones do: the strength on one side, the symbol on the other, half the
// loop apart (on the opposite strand). The texture holds both: `front`, the one that faces the camera, in its left
// half, the other in its right half (each LP cm long)
export async function printTexture(key, front, maxAniso) {
  const PX = 120, LP = 14, Wc = Math.round(LP * PX), Hc = Math.round(BAND.W * PX);
  try { await document.fonts.load(`600 ${Math.round(1.3 * PX)}px Figtree`); } catch { /* the fallback font */ }
  const c = document.createElement('canvas'); c.width = 2 * Wc; c.height = Hc;
  const g = c.getContext('2d');
  g.fillStyle = INK; g.strokeStyle = INK;   // ink only, on a clear ground: the latex's colour is the material's
  drawPrint(g, key, front, PX, Wc, Hc);
  g.translate(Wc, 0); drawPrint(g, key, front === 'symbol' ? 'label' : 'symbol', PX, Wc, Hc);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.userData = { LP };
  return t;
}
function drawPrint(g, key, kind, PX, Wc, Hc) {
  const S = BANDS[key];
  if (kind === 'symbol') {
    // the 2026 symbol: a ring (inner radius 0.639 of the outer) over a dot (0.662 of the ring), 1.75 cm tall (its
    // ring 1 cm across, measured on the product photo)
    const H = 1.75 * PX, k = H / 128.5, cx = Wc / 2, top = Hc / 2 - H / 2;
    const ry = top + 36.127 * k, dy = ry + 68.43 * k;
    g.beginPath(); g.arc(cx, ry, 36.127 * k, 0, Math.PI * 2); g.arc(cx, ry, 23.097 * k, 0, Math.PI * 2, true); g.fill();
    g.beginPath(); g.arc(cx, dy, 23.92 * k, 0, Math.PI * 2); g.fill();
  } else {
    // "Light ●○○": the name, then three dots, filled for the strength; centred on the print
    const fs = 1.25 * PX, D = 0.78 * PX, pitch = 1.04 * PX, gap = 0.62 * PX;
    g.font = `600 ${fs}px Figtree, sans-serif`; g.textBaseline = 'alphabetic';
    const tw = g.measureText(S.name).width, total = tw + gap + pitch * 2 + D;
    let x = Wc / 2 - total / 2; const base = Hc / 2 + fs * 0.35;
    g.fillText(S.name, x, base);
    x += tw + gap + D / 2; const cy = Hc / 2;
    for (let i = 0; i < 3; i++) {
      g.beginPath(); g.arc(x + i * pitch, cy, i < S.dots ? D / 2 : D / 2 - 0.045 * PX, 0, Math.PI * 2);
      if (i < S.dots) g.fill(); else { g.lineWidth = 0.09 * PX; g.stroke(); }
    }
  }
}

// ---------------------------------------------------------------- render meshes
// the latex, as in photos of real bands: satin, its highlights broad and soft and broken up by the surface's waves
// (latexSurface), its gloss a little uneven. It is thin and translucent, so light falling on one face comes out of the
// other coloured by the latex (`through`): inside a loop the shade turns a deeper pink, gold or blue rather than grey.
// Cheap: one more look-up of the environment per pixel.
// The print is ink over the latex: the texture's alpha, on the outer face only (outside 0-1 its uv runs round the
// edges and the inner face, so no texture edge is ever stretched over a thin edge).
const INK_LINEAR = '0.019, 0.018, 0.024';   // #26252b
// value noise in the band's surface coordinates, and a bump from a height's screen-space slope
const LATEX_GLSL = `
float lxHash( vec3 p ) { p = fract( p * 0.1031 ); p += dot( p, p.zyx + 31.32 ); return fract( ( p.x + p.y ) * p.z ); }
float lxNoise( vec3 x ) {
	vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( mix( lxHash( i ), lxHash( i + vec3( 1.0, 0.0, 0.0 ) ), f.x ), mix( lxHash( i + vec3( 0.0, 1.0, 0.0 ) ), lxHash( i + vec3( 1.0, 1.0, 0.0 ) ), f.x ), f.y ),
	            mix( mix( lxHash( i + vec3( 0.0, 0.0, 1.0 ) ), lxHash( i + vec3( 1.0, 0.0, 1.0 ) ), f.x ), mix( lxHash( i + vec3( 0.0, 1.0, 1.0 ) ), lxHash( i + 1.0 ), f.x ), f.y ), f.z );
}
vec3 lxBump( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir ) {
	vec3 sx = normalize( dFdx( surf_pos ) ), sy = normalize( dFdy( surf_pos ) ), R1 = cross( sy, surf_norm ), R2 = cross( surf_norm, sx );
	float det = dot( sx, R1 ) * faceDir; vec3 grad = sign( det ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
	return normalize( abs( det ) * surf_norm - grad );
}`;
export function bandMaterial(map, key) {
  const S = BANDS[key];
  // satin latex: a soft gloss, a faint rubbery sheen at grazing angles
  const m = new THREE.MeshPhysicalMaterial({ map, color: new THREE.Color(S.color), roughness: 0.42, metalness: 0, ior: 1.52,
    specularIntensity: 0.9, sheen: 0.14, sheenRoughness: 0.55, sheenColor: new THREE.Color(0xffffff) });
  const through = new THREE.Color(S.through), trans = 0.5 - 2 * S.t;   // thinner bands let more through (0.34 Light .. 0.26 Heavy)
  // the mesh's 'ao' attribute: how much of the room each point sees (the inside of a loop sees the band itself);
  // 'aoBack': the same for the other face at that point, whose light comes through
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uThrough = { value: new THREE.Vector3(through.r, through.g, through.b).multiplyScalar(trans) };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float ao;\nattribute float aoBack;\nattribute float rough;\nattribute vec3 sp;\nvarying float vAO;\nvarying float vAOBack;\nvarying float vRough;\nvarying vec3 vSp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvAO = ao; vAOBack = aoBack; vRough = rough; vSp = sp;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vAO;\nvarying float vAOBack;\nvarying float vRough;\nvarying vec3 vSp;\nuniform vec3 uThrough;\n' + LATEX_GLSL)
      // the gloss: the surface's own variation (vRough), a slower unevenness, and a touch more where the grain is too
      // fine to draw
      .replace('#include <roughnessmap_fragment>', `float lxPx = length( fwidth( vSp ) ) * 70.0;
	float roughnessFactor = clamp( roughness * vRough * ( 1.0 + 0.16 * ( lxNoise( vSp * 0.9 + 3.0 ) - 0.5 ) ) + 0.04 * smoothstep( 0.4, 1.3, lxPx ), 0.0, 1.0 );`)
      // the latex's fine grain, as moulded: a relief a micrometre or two deep (its slope the same at any size), fixed to
      // the band (its arc length and its place across), so it bends with it; faded out where finer than a pixel
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
	{
		float gh = ( 0.6 * lxNoise( vSp * 70.0 ) + 0.4 * lxNoise( vSp * 160.0 + 11.0 ) ) * 0.00016 * ( 1.0 - smoothstep( 0.4, 1.3, lxPx ) );
		vec3 sp3 = - vViewPosition;
		vec2 dH = vec2( dFdx( gh ) / max( length( dFdx( sp3 ) ), 1e-7 ), dFdy( gh ) / max( length( dFdy( sp3 ) ), 1e-7 ) );
		normal = lxBump( sp3, normal, dH, faceDirection );
	}`)
      .replace('#include <map_fragment>', `
	// a faint unevenness in the dyed latex's colour
	diffuseColor.rgb *= 1.0 + 0.045 * ( lxNoise( vSp * 0.55 + 7.0 ) - 0.5 );
	float inkA = 0.0;
	#ifdef USE_MAP
		inkA = texture2D( map, vMapUv ).a * step( 0.0, vMapUv.x ) * step( vMapUv.x, 1.0 ) * step( 0.0, vMapUv.y ) * step( vMapUv.y, 1.0 );
		// where the uv jumps (between the two prints' halves, round the far side of each), in a clear margin: no ink,
		// or the jump's sliver would squeeze the whole texture into a faint line
		inkA *= 1.0 - smoothstep( 0.03, 0.06, fwidth( vMapUv.x ) );
		diffuseColor.rgb = mix( diffuseColor.rgb, vec3( ${INK_LINEAR} ), inkA );
	#endif`)
      .replace('#include <aomap_fragment>', `
	{
		// light bounced inside the loop takes on the band's colour (multi-bounce ambient occlusion)
		vec3 alb = diffuseColor.rgb, a = 2.0404 * alb - 0.3324, b = -4.7951 * alb + 0.6417, c = 2.7552 * alb + 0.6903;
		vec3 occ = max( vec3( vAO ), ( ( vAO * a + b ) * vAO + c ) * vAO );
		reflectedLight.indirectDiffuse *= occ;
		reflectedLight.indirectSpecular *= vAO;
		reflectedLight.directDiffuse *= mix( 1.0, vAO, 0.35 );
		#ifdef USE_ENVMAP
			// the light on the other face, through the latex (the ink blocks it)
			reflectedLight.indirectDiffuse += getIBLIrradiance( - geometryNormal ) * vAOBack * RECIPROCAL_PI * uThrough * ( 1.0 - inkA );
			// a cut edge (vSp.z past 13.5): light scattered along inside the latex comes out of it, so it shows lighter,
			// as the band's thickness does in photos
			float lxEdge = step( 13.5, vSp.z );
			reflectedLight.indirectDiffuse += lxEdge * 0.42 * ( getIBLIrradiance( geometryNormal ) * 0.5 + getIBLIrradiance( vec3( 0.0, 1.0, 0.0 ) ) * 0.5 ) * RECIPROCAL_PI * alb;
		#endif
	}`);
  };
  m.customProgramCacheKey = () => 'sword-band-5';
  return m;
}

// the latex's surface: no real band is optically flat. Long, shallow waves along it and a faint cupping across it
// (slopes of a few hundredths: from moulding and packing) break its sheen into the soft, uneven streaks seen in
// photos of real bands, and its gloss varies a little from place to place. Both are fixed to the band (by arc length
// and across), seeded per band; worked out once, no textures. slope: dh/ds, dh/du per vertex (faces only); rough: a
// factor on the roughness.
function latexSurface(key, stations, l0) {
  const rnd = seededRandom(key + ':surface'), ph = () => rnd() * 2 * Math.PI, C = BAND.C;
  const along = [[1.9, 0.010], [3.1, 0.016], [4.7, 0.020], [7.5, 0.018]].map(([lam, m]) => ({ k: 2 * Math.PI / lam, m, p: ph() }));
  const cup = [[9.0, 0.035], [3.4, 0.015]].map(([lam, m]) => ({ k: 2 * Math.PI / lam, m, p: ph() }));
  const gloss = [[6.3, 0.07], [2.6, 0.05]].map(([lam, m]) => ({ k: 2 * Math.PI / lam, m, p: ph(), q: ph() }));
  const slope = new Float32Array(stations * RING * 2), rough = new Float32Array(stations * RING).fill(1), sp = new Float32Array(stations * RING * 3);
  for (let st = 0; st < stations; st++) {
    const sArc = (st / SUB) * l0;
    // waves whose wavelengths fit the loop exactly, so they close on themselves
    const fit = (w) => (2 * Math.PI * Math.max(1, Math.round((C * w.k) / (2 * Math.PI)))) / C;
    let a = 0, c = 0; for (const w of along) a += w.m * Math.cos(fit(w) * sArc + w.p); for (const w of cup) c += w.m * Math.sin(fit(w) * sArc + w.p);
    for (let r = 0; r < RING; r++) {
      const v = st * RING + r;
      let un = null;   // across the face, -1..1
      if (r < FACE) un = -1 + (2 * r) / (FACE - 1);
      else if (r >= FACE + RIM && r < 2 * FACE + RIM) un = 1 - (2 * (r - FACE - RIM)) / (FACE - 1);
      if (un !== null) { slope[2 * v] = a; slope[2 * v + 1] = c * un; }
      let g = 1; for (const w of gloss) g += w.m * Math.sin(fit(w) * sArc + w.p + 1.7 * (un ?? 0) + w.q * (r >= FACE + RIM ? 1 : 0));
      // the cut edges a little more matte than the moulded faces
      rough[v] = un === null ? g * 1.22 : g;
      // where it is on the band (cm): round the loop (on a circle as long as the band, so the grain has no seam where
      // the loop closes) and across (face A, face B and the edges apart, so their grain differs)
      const th = (2 * Math.PI * sArc) / C, Rl = C / (2 * Math.PI);
      sp[3 * v] = Rl * Math.cos(th); sp[3 * v + 1] = Rl * Math.sin(th); sp[3 * v + 2] = un !== null ? un * (BAND.W / 2) + (r < FACE ? 0 : 7) : 14 + r * 0.04;
    }
  }
  return { slope, rough, sp };
}

export class BandMesh {
  constructor(band, material) {
    this.band = band;
    const st = band.n * SUB, nv = st * RING;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(nv * 3); this.nor = new Float32Array(nv * 3); this.uv = new Float32Array(nv * 2); this.ao = new Float32Array(nv).fill(1); this.aoB = new Float32Array(nv).fill(1);
    const surf = latexSurface(band.key, st, band.l0); this.slope = surf.slope;
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2));
    g.setAttribute('ao', new THREE.BufferAttribute(this.ao, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aoBack', new THREE.BufferAttribute(this.aoB, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('rough', new THREE.BufferAttribute(surf.rough, 1));
    g.setAttribute('sp', new THREE.BufferAttribute(surf.sp, 3));
    const idx = [];
    for (let i = 0; i < st; i++) {
      const j = (i + 1) % st;
      for (let k = 0; k < RING; k++) {
        const k2 = (k + 1) % RING, a = i * RING + k, b = j * RING + k, c = j * RING + k2, d = i * RING + k2;
        idx.push(a, b, d, b, c, d);   // wound so the outside faces out: (d1 x ... ) d3 x d1 = d2
      }
    }
    g.setIndex(idx);
    this.geometry = g;
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.name = `band-${band.key}`; this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
    this.stations = st;
    this.printCenter = 0;   // arc length of the front print's centre (the other is half the loop away)
  }
  // spread the nodes' AO (outer -, 0, + and inner -, 0, +) over the ring of every station
  spreadAO() {
    const A = this.aoNode, n = this.band.n, ao = this.ao, aoB = this.aoB; if (!A) return;
    const face = (i, side, u) => { const k = (u + 1) * 1; const k0 = Math.min(1, Math.floor(k)), t = k - k0; return A[6 * i + 3 * side + k0] * (1 - t) + A[6 * i + 3 * side + k0 + 1] * t; };
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      for (let sub = 0; sub < SUB; sub++) {
        const t = sub / SUB, st = i * SUB + sub;
        for (let r = 0; r < RING; r++) {
          let v, w;   // this face's, and the other face's at the same point (its light comes through)
          if (r < FACE) { const u = -1 + (2 * r) / (FACE - 1); v = face(i, 0, u) * (1 - t) + face(j, 0, u) * t; w = face(i, 1, u) * (1 - t) + face(j, 1, u) * t; }
          else if (r < FACE + RIM) { const e = Math.max(A[6 * i + 2], A[6 * i + 5]), e2 = Math.max(A[6 * j + 2], A[6 * j + 5]); v = w = e * (1 - t) + e2 * t; }   // an edge sticks out: it sees as much as the more open face
          else if (r < 2 * FACE + RIM) { const u = 1 - (2 * (r - FACE - RIM)) / (FACE - 1); v = face(i, 1, u) * (1 - t) + face(j, 1, u) * t; w = face(i, 0, u) * (1 - t) + face(j, 0, u) * t; }
          else { const e = Math.max(A[6 * i], A[6 * i + 3]), e2 = Math.max(A[6 * j], A[6 * j + 3]); v = w = e * (1 - t) + e2 * t; }
          ao[st * RING + r] = v; aoB[st * RING + r] = w;
        }
      }
    }
    this.geometry.attributes.ao.needsUpdate = true; this.geometry.attributes.aoBack.needsUpdate = true;
  }
  // node frames (the mean of the two segments meeting there), Catmull-Rom between nodes
  update() {
    const b = this.band, n = b.n, { x, q } = b, f = new Float64Array(9), mq = new Float64Array(4);
    const NX = new Float64Array(3 * n), D1 = new Float64Array(3 * n), D2 = new Float64Array(3 * n);
    for (let i = 0; i < n; i++) {
      const pi = (i - 1 + n) % n;
      let ax = q[4 * pi], ay = q[4 * pi + 1], az = q[4 * pi + 2], aw = q[4 * pi + 3];
      const bx = q[4 * i], by = q[4 * i + 1], bz = q[4 * i + 2], bw = q[4 * i + 3];
      if (ax * bx + ay * by + az * bz + aw * bw < 0) { ax = -ax; ay = -ay; az = -az; aw = -aw; }
      const mx = ax + bx, my = ay + by, mz = az + bz, mw = aw + bw, l = 1 / Math.sqrt(mx * mx + my * my + mz * mz + mw * mw);
      mq[0] = mx * l; mq[1] = my * l; mq[2] = mz * l; mq[3] = mw * l; frameOf(mq, f, 0);
      D1[3 * i] = f[0]; D1[3 * i + 1] = f[1]; D1[3 * i + 2] = f[2]; D2[3 * i] = f[3]; D2[3 * i + 1] = f[4]; D2[3 * i + 2] = f[5];
      NX[3 * i] = x[3 * i]; NX[3 * i + 1] = x[3 * i + 1]; NX[3 * i + 2] = x[3 * i + 2];
    }
    const { pos, nor, uv } = this, t2 = b.t / 2, rc = EDGE_R * t2, hw = b.W / 2 - rc, hs = t2 - rc, LP = this.lp || 14;
    const ring = [];   // (u across, h normal-wise, nu, nh, face) of the cross-section, round the loop
    // each edge: the corner from the face eased round (60, 30, 0 degrees), the flat cut face, the other corner
    const corner = (su, sh, a) => [su * (hw + rc * Math.cos(a)), sh * hs + rc * Math.sin(a) * (sh || 1), su * Math.cos(a), Math.sin(a) * (sh || 1), 0];
    const edge = (su, down) => {   // su: +1 the +u edge, -1 the -u one; down: from face A (+h) to face B (-h)
      const D = Math.PI / 180, pts = [];
      for (const a of [60, 30, 0]) pts.push(corner(su, 1, a * D));
      pts.push([su * (b.W / 2), 0, su, 0, 0]);
      for (const a of [0, 30, 60]) pts.push(corner(su, -1, a * D));
      return down ? pts : pts.reverse();
    };
    for (let k = 0; k < FACE; k++) ring.push([-hw + (k / (FACE - 1)) * 2 * hw, t2, 0, 1, 1]);
    ring.push(...edge(1, true));
    for (let k = 0; k < FACE; k++) ring.push([hw - (k / (FACE - 1)) * 2 * hw, -t2, 0, -1, 0]);
    ring.push(...edge(-1, false));
    const P = [0, 0, 0], A1 = [0, 0, 0], A2 = [0, 0, 0], RF = new Float64Array(RING * 4);
    for (let r = 0; r < RING; r++) for (let k = 0; k < 4; k++) RF[4 * r + k] = ring[r][k];
    for (let i = 0; i < n; i++) {
      const i0 = (i - 1 + n) % n, i2 = (i + 1) % n, i3 = (i + 2) % n;
      for (let sub = 0; sub < SUB; sub++) {
        const t = sub / SUB, tt = t * t, ttt = tt * t;
        const w0 = -0.5 * ttt + tt - 0.5 * t, w1 = 1.5 * ttt - 2.5 * tt + 1, w2 = -1.5 * ttt + 2 * tt + 0.5 * t, w3 = 0.5 * ttt - 0.5 * tt;
        for (let k = 0; k < 3; k++) {
          P[k] = w0 * NX[3 * i0 + k] + w1 * NX[3 * i + k] + w2 * NX[3 * i2 + k] + w3 * NX[3 * i3 + k];
          A1[k] = D1[3 * i + k] * (1 - t) + D1[3 * i2 + k] * t; A2[k] = D2[3 * i + k] * (1 - t) + D2[3 * i2 + k] * t;
        }
        // orthonormalise d2 against d1
        let l = Math.sqrt(A1[0] * A1[0] + A1[1] * A1[1] + A1[2] * A1[2]); for (let k = 0; k < 3; k++) A1[k] /= l;
        const dd = A1[0] * A2[0] + A1[1] * A2[1] + A1[2] * A2[2]; for (let k = 0; k < 3; k++) A2[k] -= dd * A1[k];
        l = Math.sqrt(A2[0] * A2[0] + A2[1] * A2[1] + A2[2] * A2[2]); for (let k = 0; k < 3; k++) A2[k] /= l;
        const st = i * SUB + sub, s = (i + t) * b.l0;
        let ds = s - this.printCenter; ds = ((ds % BAND.C) + BAND.C * 1.5) % BAND.C - BAND.C / 2;
        // the front print within a quarter of the loop of its centre, the other print on the far half, centred half the
        // loop away: each in its half of the texture (clamped short of the middle, where both halves are clear)
        const back = Math.abs(ds) > BAND.C / 4, fl = (back ? this.printFlipBack : this.printFlip) ? -1 : 1;
        const dp = back ? ds - Math.sign(ds) * (BAND.C / 2) : ds;
        const px = back ? Math.min(0.999, Math.max(0.501, 0.75 + (fl * dp) / (2 * LP))) : Math.min(0.499, Math.max(0.001, 0.25 + (fl * dp) / (2 * LP)));
        // along the band (d1 x d2), for the surface's waves
        const T0 = A1[1] * A2[2] - A1[2] * A2[1], T1 = A1[2] * A2[0] - A1[0] * A2[2], T2 = A1[0] * A2[1] - A1[1] * A2[0];
        writeRing(pos, nor, uv, this.slope, RF, st, P[0], P[1], P[2], A1[0], A1[1], A1[2], A2[0], A2[1], A2[2], T0, T1, T2, px, fl, b.W, hw);
      }
    }
    const g = this.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true; g.attributes.uv.needsUpdate = true;
    g.computeBoundingBox(); g.computeBoundingSphere();
  }
}

// one station's ring of vertices: position, normal (a face: the normal of the waved sheet, both faces waving
// together) and the print's uv (on the outer face, the print; round the edges it carries on just outside 0-1 across,
// and on the inner face it is moved off the print (x + 3), so it changes smoothly everywhere and the print shows on
// the outer face only). Its own small function of plain numbers: inside BandMesh.update, Safari's engine ran this
// loop eleven times slower than Chrome's
function writeRing(pos, nor, uv, slope, RF, st, Px, Py, Pz, a1x, a1y, a1z, a2x, a2y, a2z, T0, T1, T2, px, fl, W, hw) {
  for (let r = 0; r < RING; r++) {
    const u = RF[4 * r], hh = RF[4 * r + 1], nu = RF[4 * r + 2], nh = RF[4 * r + 3], v = st * RING + r, a = slope[2 * v], c = slope[2 * v + 1];
    pos[3 * v] = Px + u * a1x + hh * a2x; pos[3 * v + 1] = Py + u * a1y + hh * a2y; pos[3 * v + 2] = Pz + u * a1z + hh * a2z;
    if (a === 0 && c === 0) { nor[3 * v] = nu * a1x + nh * a2x; nor[3 * v + 1] = nu * a1y + nh * a2y; nor[3 * v + 2] = nu * a1z + nh * a2z; }
    else {
      const n0 = nh * (a2x - a * T0 - c * a1x), n1 = nh * (a2y - a * T1 - c * a1y), n2 = nh * (a2z - a * T2 - c * a1z), nl = 1 / Math.sqrt(n0 * n0 + n1 * n1 + n2 * n2);
      nor[3 * v] = n0 * nl; nor[3 * v + 1] = n1 * nl; nor[3 * v + 2] = n2 * nl;
    }
    if (r < FACE) { uv[2 * v] = px; uv[2 * v + 1] = 0.5 + (fl * u) / W; }
    else if (r < FACE + RIM) { uv[2 * v] = px; uv[2 * v + 1] = 0.5 + fl * 0.6; }
    else if (r < 2 * FACE + RIM) { uv[2 * v] = px + 3; uv[2 * v + 1] = 0.5 + fl * 0.6 * (u / hw); }
    else { uv[2 * v] = px; uv[2 * v + 1] = 0.5 - fl * 0.6; }
  }
}

// ---------------------------------------------------------------- ambient occlusion
// how much of the room each point of a band sees: discs over every band's surface (Bunnell's method, one pass), so
// the inside of a loop and strands facing each other darken and take on the band's colour, as in the photos.
// Worked out at the nodes (both faces, both edges and the middle) and spread over the mesh.
export function bandAO(meshes, coarse = false) {
  const discs = [], f = new Float64Array(9), step = coarse ? 3 : 2;
  for (const M of meshes) {
    const b = M.band;
    for (let s = 0; s < b.n; s += step) {
      frameOf(b.q, f, 4 * s);
      const e = (s + 1) % b.n, c = [0.5 * (b.x[3 * s] + b.x[3 * e]), 0.5 * (b.x[3 * s + 1] + b.x[3 * e + 1]), 0.5 * (b.x[3 * s + 2] + b.x[3 * e + 2])];
      for (const u of [-1.67, 0, 1.67]) discs.push(c[0] + u * f[0], c[1] + u * f[1], c[2] + u * f[2], f[3], f[4], f[5], (step * b.l0) * (b.W / 3));
    }
  }
  const D = discs, nd = D.length;
  for (const M of meshes) {
    const b = M.band, n = b.n, A = M.aoNode ??= new Float32Array(n * 6);   // node: outer -,0,+ ; inner -,0,+
    for (let i = 0; i < n; i++) {
      frameOf(b.q, f, 4 * i);
      for (let side = 0; side < 2; side++) for (let k = 0; k < 3; k++) {
        const u = (k - 1) * (b.W / 2 - 0.3), sg = side ? -1 : 1;
        const nx = sg * f[3], ny = sg * f[4], nz = sg * f[5];
        const px = b.x[3 * i] + u * f[0] + nx * 0.05, py = b.x[3 * i + 1] + u * f[1] + ny * 0.05, pz = b.x[3 * i + 2] + u * f[2] + nz * 0.05;
        let occ = 0;
        for (let d = 0; d < nd; d += 7) {
          const dx = D[d] - px, dy = D[d + 1] - py, dz = D[d + 2] - pz, d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < 0.5) continue;   // its own patch
          const dl = Math.sqrt(d2), cr = (nx * dx + ny * dy + nz * dz) / dl;
          if (cr <= 0) continue;
          const ce = Math.abs(D[d + 3] * dx + D[d + 4] * dy + D[d + 5] * dz) / dl;   // a thin band shades from either side
          occ += (D[d + 6] * cr * Math.max(ce, 0.2)) / (Math.PI * d2 + D[d + 6]);
        }
        A[6 * i + 3 * side + k] = Math.max(0.22, 1 - 0.95 * Math.min(1, occ));
      }
    }
    M.spreadAO();
  }
}

// ---------------------------------------------------------------- the studio's bands: presets, meshes, pins, dragging
const basis = (X, Y, Z) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...X), new THREE.Vector3(...Y), new THREE.Vector3(...Z)));
const VERTICAL = basis([0, 1, 0], [0, 0, 1], [1, 0, 0]);     // long axis up, faces to the front and back
const ACROSS = basis([1, 0, 0], [0, 0, -1], [0, 1, 0]);      // long axis left-right, faces to the front and back
const LYING = new THREE.Quaternion();                         // flattened loop: its layers flat on the floor
const STANDING = basis([1, 0, 0], [0, 0, -1], [0, 1, 0]);     // the oval on its edge, round a vertical axis
// slots for 1-3 bands, in the order heavy (pink), light (blue), medium (yellow): as in the brand's floating render
const SLOTS = {
  // as in the brand's render: pink to the left, blue high, yellow low on the right. tilt: of the long axis in the
  // picture (+: its top to the left); yaw: the turn about the long axis that shows the loop open (its sign, which strand
  // is in front)
  loops: [[{ x: 0, y: 0, tilt: -14, yaw: -38 }], [{ x: -8, y: -4, tilt: 10, yaw: -32 }, { x: 8, y: 5, tilt: -24, yaw: -40 }],
    [{ x: -9, y: 0, z: 0, tilt: 10, yaw: -35 }, { x: 4, y: 15, z: -3, tilt: -27, yaw: -42 }, { x: 7.5, y: -12, z: 3, tilt: -10, yaw: -40 }]],
  hang: [[{ x: 0, yaw: 50 }], [{ x: -7, yaw: -45 }, { x: 7, yaw: 45 }], [{ x: -13, yaw: -45 }, { x: 0, yaw: 50 }, { x: 13, yaw: 45 }]],
  flat: [[{ z: 0 }], [{ z: 3.4, x: -1 }, { z: -3.4, x: 1.5 }], [{ z: 6.6, x: -1.5 }, { z: 0.2, x: 1 }, { z: -6.4, x: 3 }]],
  // standing: each in its own outline (about 26 x 8-10 cm), clear of each other, one behind the other as in the product shot
  standing: [[{ x: 0, z: 0 }], [{ x: 3, z: -5.5 }, { x: -3, z: 5.5 }], [{ x: 5, z: -11, yaw: -6 }, { x: -3, z: 0, yaw: 3 }, { x: 4, z: 11, yaw: -4 }]],
};

export class BandsRig {
  constructor(maxAniso) {
    this.world = new BandWorld();
    this.group = new THREE.Group(); this.group.name = 'sword-bands';   // band meshes and hooks shown in the image
    this.helpers = new THREE.Group(); this.helpers.name = 'band-pins'; // pin handles: on screen, never in the image
    this.showAids = true;
    this.maxAniso = maxAniso;
    this.opts = { on: { heavy: true, light: true, medium: true }, pos: 'surface', shape: 'loops', lay: 'flat', gravity: false, print: 'label', showHooks: false, lift: 10 };
    this.meshes = []; this.tex = {}; this.mats = {}; this.drag = null; this.frame = 0; this.aoDirty = true;
    this.pinMat = new THREE.MeshBasicMaterial({ color: 0xff7e7e, depthTest: false, transparent: true, opacity: 0.95 });
    this.pinRing = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.95 });
    this.hookGhost = new THREE.MeshBasicMaterial({ color: 0x4a89e8, transparent: true, opacity: 0.45, depthWrite: false });
    this.hookMat = new THREE.MeshPhysicalMaterial({ color: 0x2b2b2e, metalness: 0.9, roughness: 0.32 });
  }
  async init() {
    for (const k of Object.keys(BANDS)) {
      this.tex[k] = { label: await printTexture(k, 'label', this.maxAniso), symbol: await printTexture(k, 'symbol', this.maxAniso) };
      this.mats[k] = bandMaterial(this.tex[k].label, k);
    }
  }
  keys() { return BAND_ORDER.filter((k) => this.opts.on[k]); }
  // ------------------------------------------------ building a preset
  setup() {
    const W = this.world, o = this.opts;
    W.clear(); W.gravity = o.pos === 'floating' && !o.gravity ? 0 : 1; W.floorY = 0;
    for (const M of this.meshes) this.group.remove(M.mesh);
    this.meshes = [];
    const keys = this.keys(), kind = o.pos === 'surface' ? o.lay : o.shape;
    const slots = SLOTS[kind === 'stretch' ? 'hang' : kind][keys.length - 1];
    const pts = restOval(), a = Math.max(...pts.map((p) => p[0]));
    keys.forEach((key, i) => {
      const S = slots[i], t = BANDS[key].t, z = new THREE.Vector3(0, 0, 1);
      let b;
      if (kind === 'flat') {
        b = W.addBand(key, shapeAt(flatLoop(t), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (S.yaw || (i - 1) * 2.5) * Math.PI / 180), [S.x || 0, foldRadius(t) + t / 2 + 0.03 + i * 0.002, S.z || 0]));
      } else if (kind === 'standing') {
        // in its own organic outline, which it keeps (and springs back to when let go)
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (S.yaw || 0) * Math.PI / 180).multiply(STANDING);
        const shape = standLoop(key);
        b = W.addBand(key, shapeAt(shape, q, [S.x || 0, BAND.W / 2 + 0.02, S.z || 0]));
        b.setRest(shape, false);
      } else if (kind === 'stretch' || kind === 'hang') {
        // hung over a hook; stretched: a second hook through the bottom of the loop pulls it down 8 cm
        const x0 = S.x || 0, y = 25, top = y + a - HOOK_R - t / 2 - 0.02, z0 = (i - 1) * 0.6, yw = (S.yaw || 0) * Math.PI / 180;
        b = W.addBand(key, shapeAt(pts, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yw).multiply(VERTICAL), [x0, y, z0]));
        const hx = 4.5 * Math.cos(yw), hz = -4.5 * Math.sin(yw);
        W.addHook([x0 - hx, top, z0 - hz], [x0 + hx, top, z0 + hz]);
        if (kind === 'stretch') {
          const bot = y - a + HOOK_R + t / 2 + 0.02, hk = W.addHook([x0 - hx, bot, z0 - hz], [x0 + hx, bot, z0 + hz]);
          hk.tween = { k: 0, dur: 1.6, a0: [...hk.a], b0: [...hk.b], a1: [x0 - hx, bot - 8, z0 - hz], b1: [x0 + hx, bot - 8, z0 + hz] };
        }
      } else {   // loops: the long axis up, tilted in the picture, each band in its own open shape, which it keeps
        const tilt = new THREE.Quaternion().setFromAxisAngle(z, (S.tilt || 0) * Math.PI / 180);
        const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (S.yaw || 0) * Math.PI / 180);
        const ctr = new THREE.Vector3(S.x || 0, 22 + (S.y || 0), S.z ?? (i - 1) * 2.5), shape = brandLoop(key);
        b = W.addBand(key, shapeAt(shape, tilt.clone().multiply(yaw).multiply(VERTICAL), ctr.toArray()));
        b.setRest(shape, false);
      }
      const M = new BandMesh(b, this.mats[key]);
      M.lp = this.tex[key].label.userData.LP;
      // the print sits on the strand facing the camera, half way up
      M.printCenter = this.printSpot(b, kind);
      this.meshes.push(M); this.group.add(M.mesh);
    });
    this.applyPrint();
    // the floating presets start with their lowest point at the chosen height over the floor (clear of it from the
    // first step), and keep it there while they form
    if (o.pos === 'floating') { const low = Math.min(...W.bands.map((b) => b.minY())); if (Number.isFinite(low)) this.shift(0, o.lift - low, 0); }
    this.settleHeight = o.pos === 'floating'; this.frame = 0;
    this.syncHooks(); this.updateMeshes(); this.aoDirty = true;
    W.wake();
  }
  // whether the print, at its spot, would read right to left (or upside down) from the camera: then it turns half a
  // turn on the band (the text's run goes along the band; its up is the band's d1 edge)
  readsBackwards(M, back = false, camera = this.camera) {
    const b = M.band, at = back ? M.printCenter + BAND.C / 2 : M.printCenter, s = Math.floor(at / b.l0) % b.n;
    const f = this.world.segFrame(b, s), c = this.world.segCenter(b, s);
    let cam = camera;
    if (back) {   // the back print is read from behind: the camera orbited half a turn round the band's centre
      const o = new THREE.Vector3(...b.center()), v = cam.position.clone().sub(o);
      cam = cam.clone(); cam.position.set(o.x - v.x, cam.position.y, o.z - v.z); cam.lookAt(o); cam.updateMatrixWorld();
    }
    const P = new THREE.Vector3(...c), run = P.clone().add(new THREE.Vector3(...f.d3)).project(cam), o = P.clone().project(cam);
    const rx = run.x - o.x, ry = run.y - o.y;
    // across the screen it reads left to right; up the screen it reads from the bottom, as on the brand's render
    return Math.abs(rx) >= Math.abs(ry) ? rx < 0 : ry < 0;
  }
  // where along the band its outer face looks most squarely at the camera, away from the folds and the clips (a
  // straight-ish, well-lit run of the strand), so the print reads
  // and in sight: not behind another band (or the band's own far strand), as a print on a band at the back would be
  facingSpot(b, camera) {
    const W = this.world, cam = camera.position, n = b.n;
    const held = new Set(W.clips.filter((c) => c.band === b).map((c) => c.seg)), hid = this.hiddenFrom(b, cam);
    let best = 0, bv = -Infinity;
    for (let s = 0; s < n; s++) {
      let score = 0, ok = true;
      for (let k = -8; k <= 8; k += 2) {   // the print is about 7 cm long: its whole run should face the camera
        const t = (s + k + n) % n; if (held.has(t)) { ok = false; break; }
        const f = W.segFrame(b, t), c = W.segCenter(b, t);
        const vx = cam.x - c[0], vy = cam.y - c[1], vz = cam.z - c[2], vl = Math.sqrt(vx * vx + vy * vy + vz * vz);
        score += (f.d2[0] * vx + f.d2[1] * vy + f.d2[2] * vz) / vl;
        const g = W.segFrame(b, (t + 1) % n);   // and lies on a straight run (no fold)
        score -= 3 * (1 - (f.d3[0] * g.d3[0] + f.d3[1] * g.d3[1] + f.d3[2] * g.d3[2])) * 20;
      }
      // in sight from end to end (the longest print, "Medium ●●○", is 8 cm)
      for (let k = -10; k <= 10; k += 2) score -= 1.5 * hid[(s + k + n) % n];
      // and, all else equal, half way along the band (on a band lying flat the whole top faces up alike)
      const c = W.segCenter(b, s), o = b.center(), rel = [c[0] - o[0], c[1] - o[1], c[2] - o[2]], f0 = W.segFrame(b, s);
      score -= 0.02 * hyp3(rel[0] - f0.d2[0] * (rel[0] * f0.d2[0] + rel[1] * f0.d2[1] + rel[2] * f0.d2[2]), rel[1] - f0.d2[1] * (rel[0] * f0.d2[0] + rel[1] * f0.d2[1] + rel[2] * f0.d2[2]), rel[2] - f0.d2[2] * (rel[0] * f0.d2[0] + rel[1] * f0.d2[1] + rel[2] * f0.d2[2]));
      if (ok && score > bv) { bv = score; best = s; }
    }
    return (best + 0.5) * b.l0;
  }
  // for each segment of band b: at how many of three heights across it (the print's middle, and 1 cm above and
  // below: its letters are 1.25 cm) the line from the camera meets a band first (0-3). Each band segment is a small
  // flat patch.
  hiddenFrom(b, cam) {
    const W = this.world, P = [], f = new Float64Array(9), c = [0, 0, 0];
    for (const o of W.bands) for (let s = 0; s < o.n; s++) { W.pointOf(o, s, 0, c); frameOf(o.q, f, 4 * s); P.push(o === b ? s : -1, c[0], c[1], c[2], ...f, o.W / 2, o.l0 / 2 + 0.02); }
    const hid = new Uint8Array(b.n), m = P.length / 15, px = cam.x, py = cam.y, pz = cam.z;
    for (let t = 0; t < b.n; t++) {
      W.pointOf(b, t, 0, c); frameOf(b.q, f, 4 * t);
      for (const u of [-1, 0, 1]) {
        const dx = c[0] + u * f[0] - px, dy = c[1] + u * f[1] - py, dz = c[2] + u * f[2] - pz, end = 1 - 0.3 / hyp3(dx, dy, dz);
        for (let j = 0; j < m; j++) {
          const k = 15 * j, own = P[k];
          if (own >= 0) { const d = Math.abs(own - t); if (Math.min(d, b.n - d) <= 4) continue; }   // its own neighbours
          const den = dx * P[k + 7] + dy * P[k + 8] + dz * P[k + 9];
          if (Math.abs(den) < 1e-9) continue;
          const l = ((P[k + 1] - px) * P[k + 7] + (P[k + 2] - py) * P[k + 8] + (P[k + 3] - pz) * P[k + 9]) / den;
          if (l <= 0 || l >= end) continue;
          const hx = px + l * dx - P[k + 1], hy = py + l * dy - P[k + 2], hz = pz + l * dz - P[k + 3];
          if (Math.abs(hx * P[k + 4] + hy * P[k + 5] + hz * P[k + 6]) > P[k + 13]) continue;
          if (Math.abs(hx * P[k + 10] + hy * P[k + 11] + hz * P[k + 12]) > P[k + 14]) continue;
          hid[t]++; break;
        }
      }
    }
    return hid;
  }
  // turn each band's print to a camera (as you would, setting up the shot). The studio calls it once, as a preset is
  // built, with the camera the preset will be framed with: from then on each print stays where it is on its band and
  // moves only with it (turning them again once the bands had settled, or when the view was framed, made them jump)
  aimPrints(camera = this.camera) {
    if (!camera) return;
    for (const M of this.meshes) { M.printCenter = this.facingSpot(M.band, camera); M.printFlip = this.readsBackwards(M, false, camera); M.printFlipBack = this.readsBackwards(M, true, camera); }
    this.updateMeshes();
  }
  // arc length of the point of the loop nearest the camera side, half way along: where the print faces us
  printSpot(b, kind) {
    let best = 0, bv = -Infinity; const W = this.world;
    for (let s = 0; s < b.n; s++) {
      const f = W.segFrame(b, s), c = W.segCenter(b, s);
      const v = kind === 'flat' ? f.d2[1] * 10 - Math.abs(c[0] - b.center()[0]) : kind === 'standing' ? f.d2[2] * 10 - Math.abs(c[0] - b.center()[0]) : f.d2[2] * 10 - Math.abs(c[1] - b.center()[1]) * 0.5;
      if (v > bv) { bv = v; best = s; }
    }
    return (best + 0.5) * b.l0;
  }
  applyPrint() { for (const M of this.meshes) { const m = this.mats[M.band.key]; m.map = this.tex[M.band.key][this.opts.print]; m.needsUpdate = true; } }
  // ------------------------------------------------ hooks drawn in the image, and the pin handles
  syncHooks() {
    for (const o of [...this.group.children]) if (o.userData.hook) this.group.remove(o);
    this.helpers.clear();
    for (const h of this.world.hooks) {
      const a = new THREE.Vector3(...h.a), b = new THREE.Vector3(...h.b), len = a.distanceTo(b);
      const geo = new THREE.CylinderGeometry(h.r, h.r, len + 1.2, 24, 1);
      const m = new THREE.Mesh(geo, this.opts.showHooks ? this.hookMat : this.hookGhost);
      m.userData = { hook: h }; m.castShadow = this.opts.showHooks; m.visible = this.opts.showHooks || this.showAids;
      this.placeRod(m, h); this.group.add(m);
      const handle = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 12), this.pinMat);
      handle.userData = { pin: { hook: h } }; handle.renderOrder = 10; this.helpers.add(handle);
    }
    for (const c of this.world.clips) {
      if (c.temp) continue;
      const handle = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 12), this.pinMat);
      handle.userData = { pin: { clip: c } }; handle.renderOrder = 10; this.helpers.add(handle);
    }
    this.placeHandles();
  }
  placeRod(m, h) {
    const a = new THREE.Vector3(...h.a), b = new THREE.Vector3(...h.b);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  }
  placeHandles() {
    for (const o of this.group.children) if (o.userData.hook) this.placeRod(o, o.userData.hook);
    for (const o of this.helpers.children) {
      const P = o.userData.pin;
      if (P.hook) o.position.set(...P.hook.a.map((v, i) => (v + P.hook.b[i]) / 2));
      else o.position.set(...P.clip.p);
    }
  }
  // ------------------------------------------------ per frame
  step() {
    const W = this.world; if (!W.awake) return false;
    W.step(1 / 60);
    if (this.settleHeight && this.frame++ > 0) {   // keep the floating presets at their height while they form
      const low = this.lowest();
      if (Number.isFinite(low)) this.shift(0, this.opts.lift - low, 0);
      if (!W.clips.some((c) => c.tween) && !W.hooks.some((k) => k.tween) && W.calm > 5) this.settleHeight = false;
    }
    this.placeHandles();
    this.updateMeshes();
    if (!W.awake) {
      bandAO(this.meshes); this.aoDirty = false;
    }
    // (its own count: this.frame only counts while a floating preset forms, so this had run every frame, 3.4 ms of 14)
    else if ((this.aoTick = (this.aoTick || 0) + 1) % 8 === 0) bandAO(this.meshes, true);
    return true;
  }
  updateMeshes() { for (const M of this.meshes) M.update(); }
  lowest() { let m = Infinity; for (const M of this.meshes) m = Math.min(m, M.geometry.boundingBox.min.y); return m; }
  // move everything (bands, hooks, clips) rigidly
  shift(dx, dy, dz) {
    const W = this.world;
    for (const b of W.bands) for (let i = 0; i < b.n; i++) { b.x[3 * i] += dx; b.x[3 * i + 1] += dy; b.x[3 * i + 2] += dz; b.xp[3 * i] += dx; b.xp[3 * i + 1] += dy; b.xp[3 * i + 2] += dz; }
    for (const h of W.hooks) { for (const P of [h.a, h.b, h.ca, h.cb]) if (P) { P[0] += dx; P[1] += dy; P[2] += dz; } if (h.tween) for (const P of [h.tween.a0, h.tween.a1, h.tween.b0, h.tween.b1]) { P[0] += dx; P[1] += dy; P[2] += dz; } }
    for (const c of W.clips) { for (const P of [c.p, c.cp]) if (P) { P[0] += dx; P[1] += dy; P[2] += dz; } if (c.tween) for (const P of [c.tween.p0, c.tween.p1]) { P[0] += dx; P[1] += dy; P[2] += dz; } }
    this.placeHandles(); this.updateMeshes();
  }
  bounds() { const bb = new THREE.Box3(); for (const M of this.meshes) bb.union(M.geometry.boundingBox); return bb; }
  // ------------------------------------------------ pointer: pick, drag, pin
  pick(ray) {
    const hp = ray.intersectObjects(this.helpers.children, false)[0];
    if (hp) return { pin: hp.object.userData.pin, point: hp.point };
    const hb = ray.intersectObjects(this.meshes.map((M) => M.mesh), false)[0];
    if (!hb) return null;
    const M = this.meshes.find((m) => m.mesh === hb.object), st = Math.floor(hb.face.a / RING), seg = Math.floor(st / SUB) % M.band.n;
    return { band: M.band, seg, point: hb.point };
  }
  startDrag(hit, mode) {   // mode: 'pull' (grab the band), 'move' (the whole band), or a pin
    const W = this.world, p = hit.point.clone();
    if (hit.pin) {
      const P = hit.pin, ref = P.hook ? new THREE.Vector3(...P.hook.a).add(new THREE.Vector3(...P.hook.b)).multiplyScalar(0.5) : new THREE.Vector3(...P.clip.p);
      if (P.clip) P.clip.tween = null; if (P.hook) P.hook.tween = null;
      this.drag = { pin: P, from: p, ref, a0: P.hook && [...P.hook.a], b0: P.hook && [...P.hook.b], p0: P.clip && [...P.clip.p] };
    } else if (mode === 'move') {
      const b = hit.band;
      this.drag = { move: b, from: p, last: p.clone(), pins: [...W.clips.filter((c) => c.band === b), ...W.hooks.filter((h) => this.hooked(h, b))] };
    } else {
      const b = hit.band, s = hit.seg, c = W.segCenter(b, s);
      const clip = W.addClip(b, s, c, Array.from(b.q.slice(4 * s, 4 * s + 4)), true);
      this.drag = { clip, from: p, off: new THREE.Vector3(...c).sub(p) };
    }
    this.settleHeight = false; W.wake();
    return this.drag;
  }
  hooked(h, b) {   // does the hook hold this band (any of its points near it)?
    const a = new THREE.Vector3(...h.a), e = new THREE.Vector3(...h.b), L = new THREE.Line3(a, e), q = new THREE.Vector3(), P = new THREE.Vector3();
    for (let i = 0; i < b.n; i += 3) { P.set(b.x[3 * i], b.x[3 * i + 1], b.x[3 * i + 2]); L.closestPointToPoint(P, true, q); if (q.distanceTo(P) < h.r + 1) return true; }
    return false;
  }
  dragTo(p) {
    const D = this.drag; if (!D) return;
    const W = this.world, d = p.clone().sub(D.from);
    if (D.pin) {
      if (D.pin.hook) { const h = D.pin.hook; for (let i = 0; i < 3; i++) { h.a[i] = D.a0[i] + d.getComponent(i); h.b[i] = D.b0[i] + d.getComponent(i); } }
      else for (let i = 0; i < 3; i++) D.pin.clip.p[i] = D.p0[i] + d.getComponent(i);
    } else if (D.move) {
      const step = p.clone().sub(D.last); D.last.copy(p);
      if (D.pins.length) for (const P of D.pins) { for (const A of P.p ? [P.p] : [P.a, P.b]) for (let i = 0; i < 3; i++) A[i] += step.getComponent(i); }
      else { const b = D.move; for (let i = 0; i < b.n; i++) for (let k = 0; k < 3; k++) { b.x[3 * i + k] += step.getComponent(k); b.xp[3 * i + k] += step.getComponent(k); } }
    } else {
      const target = p.clone().add(D.off);
      if (target.y < this.world.floorY + 0.15) target.y = this.world.floorY + 0.15;
      D.clip.p = target.toArray();
    }
    W.wake();
  }
  // turn what is held or hovered: about the view direction, or (twist) about the band's own length / the vertical
  turn(target, angle, viewDir, twist) {
    const W = this.world;
    if (target.clip) {
      const c = target.clip, f = W.segFrame(c.band, c.seg), axis = twist ? new THREE.Vector3(...f.d3) : viewDir.clone();
      const q = new THREE.Quaternion().setFromAxisAngle(axis.normalize(), angle).multiply(new THREE.Quaternion(...c.q));
      c.q = [q.x, q.y, q.z, q.w]; c.tween = null;
    } else if (target.hook) {
      const h = target.hook, m = new THREE.Vector3(...h.a).add(new THREE.Vector3(...h.b)).multiplyScalar(0.5);
      const R = new THREE.Quaternion().setFromAxisAngle(twist ? new THREE.Vector3(0, 1, 0) : viewDir.clone().normalize(), angle);
      for (const P of [h.a, h.b]) { const v = new THREE.Vector3(...P).sub(m).applyQuaternion(R).add(m); P[0] = v.x; P[1] = v.y; P[2] = v.z; }
      h.tween = null;
    }
    W.wake();
  }
  endDrag(pin) {
    const D = this.drag; this.drag = null; if (!D) return;
    if (D.clip) { if (pin) { D.clip.temp = false; this.syncHooks(); } else this.world.removeClip(D.clip); }
    this.world.wake();
  }
  removePin(P) {
    if (P.clip) this.world.removeClip(P.clip); else this.world.removeHook(P.hook);
    this.syncHooks();
  }
  // exporting: the pin handles are hidden by the studio; the hooks too, unless they are meant to be in the image
  exportMode(on) { for (const o of this.group.children) if (o.userData.hook) o.visible = this.opts.showHooks || (!on && this.showAids); }
  // the on-screen aids: the hooks' blue stand-ins (when not in the image) and the pins' red handles. Off, the view is
  // the image (the pins can still be grabbed where they are)
  setAids(on) { this.showAids = on; this.helpers.visible = on; for (const o of this.group.children) if (o.userData.hook) o.visible = this.opts.showHooks || on; }
  setShowHooks(on) { this.opts.showHooks = on; this.syncHooks(); }
  setGravity(on) { this.opts.gravity = on; this.world.gravity = this.opts.pos === 'floating' && !on ? 0 : 1; this.world.wake(); }
}
