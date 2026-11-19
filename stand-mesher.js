// Stand mesher: signed distance field -> surface nets, with baked SDF ambient occlusion.
// Pure JS (no three.js) so it can run inside a Web Worker.
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);
function sdRB2(px, py, bx, by, r) {
  const qx = Math.abs(px) - bx + r, qy = Math.abs(py) - by + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
const STAND = { halfX: 4.7, halfZ: 4.45, towerHalf: 1.35, towerH: 2.35, slotHalf: 0.56, slotFloor: 0.3, plateIn: 0.85, plateOut: 0.45, planR: 0.9 };

function standProfile(y, z) {
  const S = STAND, az = Math.abs(z);
  const slope = az < S.towerHalf ? 0 : (S.plateIn - S.plateOut) / (S.halfZ - S.towerHalf);
  const h = S.plateIn - slope * Math.max(az - S.towerHalf, 0);
  let plate = smax(-y, (y - h) / Math.sqrt(1 + slope * slope), 0.14);
  plate = smax(plate, az - S.halfZ, 0.14);
  const tower = sdRB2(z, y - S.towerH / 2, S.towerHalf, S.towerH / 2, 0.34);
  let d = smin(plate, tower, 0.75);
  const slot = sdRB2(z, y - (S.slotFloor + 3), S.slotHalf, 3, 0.24);
  d = smax(d, -slot, 0.13);
  // the soft tower/plate blend bulges below the floor; cut it back to a flat base at y = 0
  return smax(d, -y, 0.08);
}
function standSDF(x, y, z) {
  return smax(standProfile(y, z), sdRB2(x, z, STAND.halfX, STAND.halfZ, STAND.planR), 0.14);
}
let DIM = null;
function tabletBoxSDF(x, y, z) {
  const { W, H, T } = DIM;
  const qx = Math.abs(x) - W / 2 + 0.3, qy = Math.abs(y - (STAND.slotFloor + H / 2)) - H / 2 + 0.3, qz = Math.abs(z) - T / 2 + 0.3;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
  return Math.hypot(ox, oy, oz) + Math.min(Math.max(qx, qy, qz), 0) - 0.3;
}

export function meshStand(dim) {
  DIM = dim;
  const step = 0.05;
  const x0 = -STAND.halfX - 0.2, y0 = -0.3, z0 = -STAND.halfZ - 0.2;
  const nx = Math.ceil((2 * STAND.halfX + 0.4) / step) + 1;
  const ny = Math.ceil((STAND.towerH + 0.5) / step) + 1;
  const nz = Math.ceil((2 * STAND.halfZ + 0.4) / step) + 1;
  // profile depends on (y,z) only; plan on (x,z)
  const prof = new Float32Array(ny * nz);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) prof[j + ny * k] = standProfile(y0 + j * step, z0 + k * step);
  const F = new Float32Array(nx * ny * nz);
  const id = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const plan = sdRB2(x0 + i * step, z0 + k * step, STAND.halfX, STAND.halfZ, STAND.planR);
    for (let j = 0; j < ny; j++) F[id(i, j, k)] = smax(prof[j + ny * k], plan, 0.14);
  }
  const cx = nx - 1, cy = ny - 1;
  const cid = (i, j, k) => i + cx * (j + cy * k);
  const cellV = new Int32Array(cx * cy * (nz - 1)).fill(-1);
  const pos = [], nor = [], col = [], ao = [];
  const e = 0.004;
  const grad = (x, y, z) => {
    const gx = standSDF(x + e, y, z) - standSDF(x - e, y, z);
    const gy = standSDF(x, y + e, z) - standSDF(x, y - e, z);
    const gz = standSDF(x, y, z + e) - standSDF(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    return [gx / l, gy / l, gz / l];
  };
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const corner = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      const v = F[id(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))];
      corner[c] = v; if (v < 0) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, cnt = 0;
    for (const [a, b] of EDGES) {
      const va = corner[a], vb = corner[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      sx += (a & 1) + t * ((b & 1) - (a & 1));
      sy += ((a >> 1) & 1) + t * (((b >> 1) & 1) - ((a >> 1) & 1));
      sz += ((a >> 2) & 1) + t * (((b >> 2) & 1) - ((a >> 2) & 1));
      cnt++;
    }
    let px = x0 + (i + sx / cnt) * step, py = y0 + (j + sy / cnt) * step, pz = z0 + (k + sz / cnt) * step;
    for (let it = 0; it < 4; it++) {
      const d = standSDF(px, py, pz); const g = grad(px, py, pz);
      px -= d * g[0]; py -= d * g[1]; pz -= d * g[2];
    }
    const n = grad(px, py, pz);
    cellV[cid(i, j, k)] = pos.length / 3;
    pos.push(px, py, pz); nor.push(n[0], n[1], n[2]);
    // slot liner is a slightly darker grey
    const inSlot = Math.abs(pz) < STAND.slotHalf - 0.02 && py > STAND.slotFloor - 0.05 && py < STAND.towerH - 0.12 ? 1 : 0;
    const c = inSlot ? 0.62 : 1.0;
    col.push(c, c, c);
    // SDF ambient occlusion against stand + tablet
    let occ = 0, sca = 1;
    for (let s = 1; s <= 6; s++) {
      const hh = 0.06 + 0.28 * s * s / 6;
      const qx = px + n[0] * hh, qy = py + n[1] * hh, qz = pz + n[2] * hh;
      const dd = Math.min(standSDF(qx, qy, qz), tabletBoxSDF(qx, qy, qz));
      occ += Math.max(hh - dd, 0) * sca; sca *= 0.72;
    }
    ao.push(Math.max(0.25, Math.min(1, 1 - 0.55 * occ)));
  }
  const idx = [];
  const quad = (a, b, c, d) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; idx.push(a, b, c, a, c, d); };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const inside = F[id(i, j, k)] < 0;
    if (inside !== (F[id(i + 1, j, k)] < 0)) quad(cellV[cid(i, j - 1, k - 1)], cellV[cid(i, j, k - 1)], cellV[cid(i, j, k)], cellV[cid(i, j - 1, k)]);
    if (inside !== (F[id(i, j + 1, k)] < 0)) quad(cellV[cid(i - 1, j, k - 1)], cellV[cid(i, j, k - 1)], cellV[cid(i, j, k)], cellV[cid(i - 1, j, k)]);
    if (inside !== (F[id(i, j, k + 1)] < 0)) quad(cellV[cid(i - 1, j - 1, k)], cellV[cid(i, j - 1, k)], cellV[cid(i, j, k)], cellV[cid(i - 1, j, k)]);
  }
  const P = new Float32Array(pos), N = new Float32Array(nor);
  const ix = new Uint32Array(idx);
  // per-triangle orientation fix
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
    const nx_ = N[a] + N[b] + N[c], ny_ = N[a + 1] + N[b + 1] + N[c + 1], nz_ = N[a + 2] + N[b + 2] + N[c + 2];
    if (gx * nx_ + gy * ny_ + gz * nz_ < 0) { const tmp = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = tmp; }
  }
  return { pos: P, nor: N, col: new Float32Array(col), ao: new Float32Array(ao), idx: ix };
}
