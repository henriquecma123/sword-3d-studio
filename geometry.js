// Procedural geometry for the Thrive Pad and its stand.
// Units: centimetres. Dimensions measured from the 5760px reference renders
// (127.5 px / cm on the straight-on front view).
import * as THREE from 'three';

export const DIM = {
  W: 26.0,            // tablet width
  H: 18.68,           // tablet height
  T: 0.92,            // tablet thickness
  R: 1.55,            // outline corner radius: generous, soft product corners
  N: 2.4,             // superellipse exponent: continuous-curvature corners that ease into the straight edges
  // round-overs (z = depth along the thickness, d = inset into the outline, n = superellipse exponent).
  // n > 2 gives curvature-continuous blends: highlights fade into the flats instead of stopping at a line.
  back: { z: 0.36, d: 0.6, n: 2.5 },   // back shell curves away underneath in a long, pillow-soft sweep
  front: { z: 0.26, d: 0.2, n: 2.5 },  // soft front edge; width is capped so the glass corners stay inside the flat front face
  partZ: 0.68,        // parting line (from back)
  glass: { left: 0.305, right: 0.305, top: 1.69, bottom: 0.31, r: 1.25 },
  // glass corners run concentric with the outline; the hole (glass + lip) clears the flat front face by 0.07 everywhere
  display: { w: 23.35, h: 14.64 },
  cap: { cx: 8.18, halfW: 2.40, front: 1.36, back: 1.55 },
  pill: { cx: 8.20, cyFromTop: 0.735, w: 4.43, h: 0.91 },
  lenses: [6.64, 9.75],
  lensR: 0.35,
  stand: { slotFloor: 0.3 },
};

// ---------- rounded rectangle contours ----------
// n = 2: circular corners; n > 2: superellipse ("continuous") corners
export function rrContour(w, h, r, segs, n = 2) {
  const pts = [];
  const cx = w / 2 - r, cy = h / 2 - r;
  const corners = [[cx, cy, 0], [-cx, cy, 0.5 * Math.PI], [-cx, -cy, Math.PI], [cx, -cy, 1.5 * Math.PI]];
  const e = 2 / n, f = 2 - 2 / n;
  for (const [ox, oy, a0] of corners) {
    for (let s = 0; s <= segs; s++) {
      const a = a0 + (s / segs) * Math.PI / 2;
      const c = Math.cos(a), sn = Math.sin(a);
      const nx = Math.sign(c) * Math.abs(c) ** f, ny = Math.sign(sn) * Math.abs(sn) ** f, l = Math.hypot(nx, ny) || 1;
      pts.push({ x: ox + r * Math.sign(c) * Math.abs(c) ** e, y: oy + r * Math.sign(sn) * Math.abs(sn) ** e, nx: nx / l, ny: ny / l });
    }
  }
  return pts;
}

export function shapeFromPts(pts, ShapeClass = THREE.Shape) {
  const s = new ShapeClass();
  s.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i].x, pts[i].y);
  s.closePath();
  return s;
}

// Sweep a rounded-rect outline along a side profile.
// rings: [{ z, d (inset), nr (outward normal comp), nz }]
export function loft(w, h, r, segs, rings, ox = 0, oy = 0, exp = 2) {
  const n = 4 * (segs + 1);
  const pos = [], nor = [], uv = [], idx = [];
  for (const ring of rings) {
    const c = rrContour(w - 2 * ring.d, h - 2 * ring.d, Math.max(r - ring.d, 1e-4), segs, exp);
    let s = 0;
    for (let j = 0; j < n; j++) {
      const p = c[j];
      if (j > 0) s += Math.hypot(p.x - c[j - 1].x, p.y - c[j - 1].y);
      pos.push(p.x + ox, p.y + oy, ring.z);
      const nx = p.nx * ring.nr, ny = p.ny * ring.nr, nz = ring.nz;
      const l = Math.hypot(nx, ny, nz) || 1;
      nor.push(nx / l, ny / l, nz / l);
      uv.push(s, ring.z);
    }
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < n; j++) {
      const a = i * n + j, b = i * n + ((j + 1) % n), c = (i + 1) * n + j, d = (i + 1) * n + ((j + 1) % n);
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  orientToNormals(g);
  return g;
}

// Make triangle winding agree with the supplied vertex normals.
export function orientToNormals(g) {
  const p = g.attributes.position.array, nm = g.attributes.normal.array, ix = g.index.array;
  let vote = 0;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3();
  for (let t = 0; t < ix.length; t += 3) {
    A.fromArray(p, ix[t] * 3); B.fromArray(p, ix[t + 1] * 3); C.fromArray(p, ix[t + 2] * 3);
    N.subVectors(B, A).cross(C.sub(A));
    const l = N.length();
    if (l < 1e-10) continue;
    vote += Math.sign(N.x * nm[ix[t] * 3] + N.y * nm[ix[t] * 3 + 1] + N.z * nm[ix[t] * 3 + 2]);
  }
  if (vote < 0) for (let t = 0; t < ix.length; t += 3) { const tmp = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = tmp; }
}

export function arc(rings, cz, cd, rad, a0, a1, steps, fn) {
  for (let s = 0; s <= steps; s++) rings.push(fn(a0 + (a1 - a0) * (s / steps), cz, cd, rad));
}

// ---------- procedural textures ----------
function noiseTexture(size = 512, seed = 7) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // two octaves: fine grain + soft mottling
  const coarse = new Float32Array(64 * 64).map(() => rnd());
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const cx = (x / size) * 64, cy = (y / size) * 64;
    const x0 = Math.floor(cx) % 64, y0 = Math.floor(cy) % 64, x1 = (x0 + 1) % 64, y1 = (y0 + 1) % 64;
    const fx = cx - Math.floor(cx), fy = cy - Math.floor(cy);
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const v = (coarse[y0 * 64 + x0] * (1 - sx) + coarse[y0 * 64 + x1] * sx) * (1 - sy) +
              (coarse[y1 * 64 + x0] * (1 - sx) + coarse[y1 * 64 + x1] * sx) * sy;
    const val = 0.5 + (rnd() - 0.5) * 0.55 + (v - 0.5) * 0.35;
    const o = (y * size + x) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.max(0, Math.min(255, val * 255));
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 3, 1 / 3);     // one tile per 3 cm
  t.anisotropy = 8;
  return t;
}

function logoTexture() {
  // baked from tools/textures.js so the wordmark looks identical on every OS
  const t = new THREE.TextureLoader().load(new URL('./assets/logo.png', import.meta.url).href);
  t.anisotropy = 8;
  return t;
}

// ---------- materials ----------
export function createMaterials() {
  const grain = noiseTexture();
  // soft-touch satin polycarbonate: smooth, broad gentle highlights, a faint velvety sheen at grazing angles
  const white = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#f2f2f0'),
    roughness: 0.58,
    bumpMap: grain,
    bumpScale: 0.008,
    clearcoat: 0.06,
    clearcoatRoughness: 0.65,
    specularIntensity: 0.36,
    sheen: 0.45,
    sheenRoughness: 0.8,
    sheenColor: new THREE.Color('#ffffff'),
  });
  white.userData.grain = grain;
  // camera cap mask (wraps over the top edge from front to back)
  const capUniforms = {
    uPink: { value: new THREE.Color('#ea7d85') },
    uCap: { value: new THREE.Vector4(DIM.cap.cx, DIM.cap.halfW, DIM.cap.front, DIM.cap.back) },
    uTopY: { value: DIM.H / 2 },
    uMidZ: { value: DIM.T / 2 },
  };
  white.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, capUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vLocal;
uniform vec3 uPink; uniform vec4 uCap; uniform float uTopY; uniform float uMidZ;
float sdRB(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q,0.0)) + min(max(q.x,q.y),0.0) - r; }
float capSDF(vec3 p){
  bool front = p.z > uMidZ;
  float depth = front ? uCap.z : uCap.w;
  float r = front ? 0.36 : 0.42;   // soft, generously rounded cap corners
  vec2 c = vec2(uCap.x, uTopY + 1.0 - depth * 0.5);
  return sdRB(p.xy - c, vec2(uCap.y, 1.0 + depth * 0.5), r);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float capD = capSDF(vLocal);
float capM = 1.0 - smoothstep(-0.006, 0.006, capD);
diffuseColor.rgb = mix(diffuseColor.rgb, uPink, capM);
diffuseColor.rgb *= 1.0 - 0.55 * exp(-pow(capD / 0.009, 2.0));`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.5, capM);`);
  };
  white.customProgramCacheKey = () => 'thrive-body';

  // same soft-touch finish as the tablet body
  const standMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#f2f2f0'),
    roughness: 0.58,
    vertexColors: true,
    clearcoat: 0.06,
    clearcoatRoughness: 0.65,
    specularIntensity: 0.36,
    sheen: 0.45,
    sheenRoughness: 0.8,
    sheenColor: new THREE.Color('#ffffff'),
  });
  // baked SDF ambient occlusion stored in the `ao` attribute
  standMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float ao;\nvarying float vAO;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAO = ao;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAO;')
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
reflectedLight.indirectDiffuse *= vAO;
reflectedLight.indirectSpecular *= mix(1.0, vAO, 0.85);
reflectedLight.directDiffuse *= mix(1.0, vAO, 0.35);`);
  };
  standMat.customProgramCacheKey = () => 'thrive-stand';

  const glass = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#0d0d0e'),   // the references show a soft charcoal glass, not pure black
    roughness: 0.32,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.025,
    specularIntensity: 0.6,
  });
  // the screen and the camera pill / Dynamic Island sit a hair above the glass: depth offsets make them always win,
  // at any distance (the iPhone's screen is drawn over a full sheet of cover glass)
  const screen = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#000000'),
    emissive: new THREE.Color('#ffffff'),
    emissiveIntensity: 1,
    roughness: 0.32,
    clearcoat: 1,
    clearcoatRoughness: 0.025,
    specularIntensity: 0.6,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
  });
  const pill = new THREE.MeshPhysicalMaterial({ color: '#0a0a0b', roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.03, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const lensRing = new THREE.MeshPhysicalMaterial({ color: '#2b2c31', metalness: 0.85, roughness: 0.3 });
  const lensGlass = new THREE.MeshPhysicalMaterial({
    color: '#0a1230', metalness: 0.3, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.0,
    iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [250, 520],
  });
  const lensPupil = new THREE.MeshPhysicalMaterial({ color: '#020203', roughness: 0.15, clearcoat: 1 });
  const hole = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.8 });
  const metal = new THREE.MeshPhysicalMaterial({ color: '#d4d4d6', metalness: 1, roughness: 0.28 });
  const portInner = new THREE.MeshStandardMaterial({ color: '#0d0d0e', roughness: 0.7 });
  const portTongue = new THREE.MeshStandardMaterial({ color: '#3c3c3f', roughness: 0.5, metalness: 0.4 });
  const logo = new THREE.MeshPhysicalMaterial({
    color: '#ffffff', roughness: 0.3, alphaMap: logoTexture(), transparent: true,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false,
    clearcoat: 0.4, clearcoatRoughness: 0.2,
  });
  return { white, standMat, glass, screen, pill, lensRing, lensGlass, lensPupil, hole, metal, portInner, portTongue, logo };
}

// ---------- tablet ----------
// Local frame: x right, y up, z = 0 at the back, z = T at the screen.
export function buildTablet(M) {
  const { W, H, T, R, N, back: B, front: F, partZ: tp } = DIM;
  const group = new THREE.Group();
  group.name = 'tablet';
  const SEG = 40;

  // side profile, back -> front: back round-over, short straight band, parting groove, front round-over
  const rings = [];
  const pw = (v, k) => Math.abs(v) ** k;
  for (let i = 0; i <= 28; i++) {
    const a = (i / 28) * Math.PI / 2, s = Math.sin(a), c = Math.cos(a), e = 2 / B.n, f = 2 - e;
    rings.push({ z: B.z - B.z * pw(c, e), d: B.d - B.d * pw(s, e), nr: pw(s, f) / B.d, nz: -pw(c, f) / B.z });
  }
  const g = 0.011, gd = 0.013; // parting line groove
  rings.push({ z: tp - g, d: 0, nr: 1, nz: 0 });
  rings.push({ z: tp - g, d: 0, nr: 0.55, nz: 0.83 });
  rings.push({ z: tp - 0.003, d: gd, nr: 0.55, nz: 0.83 });
  rings.push({ z: tp - 0.003, d: gd, nr: 1, nz: 0 });
  rings.push({ z: tp + 0.003, d: gd, nr: 1, nz: 0 });
  rings.push({ z: tp + 0.003, d: gd, nr: 0.55, nz: -0.83 });
  rings.push({ z: tp + g, d: 0, nr: 0.55, nz: -0.83 });
  rings.push({ z: tp + g, d: 0, nr: 1, nz: 0 });
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI / 2, s = Math.sin(a), c = Math.cos(a), e = 2 / F.n, f = 2 - e;
    rings.push({ z: T - F.z + F.z * pw(s, e), d: F.d - F.d * pw(c, e), nr: pw(c, f) / F.d, nz: pw(s, f) / F.z });
  }
  const side = new THREE.Mesh(loft(W, H, R, SEG, rings, 0, 0, N), M.white);
  group.add(side);

  // back face
  const backShape = shapeFromPts(rrContour(W - 2 * B.d, H - 2 * B.d, R - B.d, SEG, N));
  const backGeo = new THREE.ShapeGeometry(backShape);
  backGeo.rotateY(Math.PI);
  group.add(new THREE.Mesh(backGeo, M.white));

  // glass outline
  const G = DIM.glass;
  const gw = W - G.left - G.right, gh = H - G.top - G.bottom;
  const gcx = (G.left - G.right) / 2, gcy = (G.bottom - G.top) / 2;
  const lip = 0.035;
  const frontShape = shapeFromPts(rrContour(W - 2 * F.d, H - 2 * F.d, R - F.d, SEG, N));
  const holePts = rrContour(gw + 2 * lip, gh + 2 * lip, G.r + lip, SEG, N).map((p) => ({ ...p, x: p.x + gcx, y: p.y + gcy }));
  frontShape.holes.push(shapeFromPts(holePts, THREE.Path));
  const frontGeo = new THREE.ShapeGeometry(frontShape);
  frontGeo.translate(0, 0, T);
  group.add(new THREE.Mesh(frontGeo, M.white));

  // rounded lip down into the glass recess
  const lipRings = [];
  arc(lipRings, T - lip, -lip, lip, 0, Math.PI / 2, 6, (a, cz, cd, r) => ({ z: cz + r * Math.cos(a), d: cd + r * Math.sin(a), nr: -Math.sin(a), nz: Math.cos(a) }));
  group.add(new THREE.Mesh(loft(gw, gh, G.r, SEG, lipRings, gcx, gcy, N), M.white));

  // glass border + display
  const zg = T - lip;
  const D = DIM.display;
  const borderShape = shapeFromPts(rrContour(gw, gh, G.r, SEG, N).map((p) => ({ ...p, x: p.x + gcx, y: p.y + gcy })));
  const dispHole = new THREE.Path();
  dispHole.moveTo(gcx - D.w / 2, gcy - D.h / 2); dispHole.lineTo(gcx + D.w / 2, gcy - D.h / 2);
  dispHole.lineTo(gcx + D.w / 2, gcy + D.h / 2); dispHole.lineTo(gcx - D.w / 2, gcy + D.h / 2); dispHole.closePath();
  borderShape.holes.push(dispHole);
  const borderGeo = new THREE.ShapeGeometry(borderShape);
  borderGeo.translate(0, 0, zg);
  group.add(new THREE.Mesh(borderGeo, M.glass));
  const dispGeo = new THREE.PlaneGeometry(D.w, D.h);
  dispGeo.translate(gcx, gcy, zg);
  const display = new THREE.Mesh(dispGeo, M.screen);
  display.name = 'display';
  group.add(display);

  // camera window + lenses
  const P = DIM.pill;
  const pillGeo = new THREE.ShapeGeometry(shapeFromPts(rrContour(P.w, P.h, P.h / 2 - 0.001, 20)));
  const pillY = H / 2 - P.cyFromTop;
  pillGeo.translate(P.cx, pillY, T + 0.004);
  group.add(new THREE.Mesh(pillGeo, M.pill));
  for (const lx of DIM.lenses) {
    const ring = new THREE.RingGeometry(0.2, DIM.lensR, 48); ring.translate(lx, pillY, T + 0.007);
    const glassG = new THREE.CircleGeometry(0.205, 48); glassG.translate(lx, pillY, T + 0.006);
    const pupil = new THREE.CircleGeometry(0.075, 32); pupil.translate(lx, pillY, T + 0.0065);
    group.add(new THREE.Mesh(ring, M.lensRing), new THREE.Mesh(glassG, M.lensGlass), new THREE.Mesh(pupil, M.lensPupil));
  }

  // back logo
  const logoGeo = new THREE.PlaneGeometry(5.3, 5.3 * 512 / 2120);
  logoGeo.rotateY(Math.PI);
  logoGeo.translate(0, 0.05, -0.002);
  group.add(new THREE.Mesh(logoGeo, M.logo));

  // speaker / mic holes on both sides, USB-C on the right side
  const zc = 0.47;   // middle of the straight band between the back round-over and the parting line
  for (const sx of [1, -1]) {
    for (let i = 0; i < 5; i++) {
      const dot = new THREE.CircleGeometry(0.055, 20);
      dot.rotateY(sx * Math.PI / 2);
      dot.translate(sx * (W / 2 + 0.002), -H / 2 + 1.68 + i * 0.33, zc);
      group.add(new THREE.Mesh(dot, M.hole));
    }
  }
  const portY = -H / 2 + 5.43;
  const stadium = (w, h) => shapeFromPts(rrContour(w, h, Math.min(w, h) / 2 - 0.0005, 14));
  const ringShape = stadium(0.44, 0.9);
  ringShape.holes.push(shapeFromPts(rrContour(0.31, 0.77, 0.15, 14), THREE.Path));
  const mk = (geo, mat, dx) => { geo.rotateY(Math.PI / 2); geo.translate(W / 2 + dx, portY, zc); group.add(new THREE.Mesh(geo, mat)); };
  mk(new THREE.ShapeGeometry(ringShape), M.metal, 0.003);
  mk(new THREE.ShapeGeometry(stadium(0.31, 0.77)), M.portInner, 0.0015);
  mk(new THREE.ShapeGeometry(shapeFromPts(rrContour(0.075, 0.5, 0.035, 6))), M.portTongue, 0.002);

  // top-edge buttons (power + volume), seen from the front: left side
  for (const [x0, x1] of [[-10.9, -9.9], [-8.9, -6.3]]) {
    const len = x1 - x0;
    const sh = shapeFromPts(rrContour(len, 0.3, 0.149, 8));
    const bg = new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 3 });
    bg.rotateX(-Math.PI / 2);
    bg.translate((x0 + x1) / 2, H / 2 - 0.012, zc);
    group.add(new THREE.Mesh(bg, M.white));
  }

  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return group;
}

// ---------- stand ----------
// Meshed off the main thread; falls back to inline meshing if module workers are unavailable.
async function standArrays() {
  const dim = { W: DIM.W, H: DIM.H, T: DIM.T };
  try {
    return await new Promise((resolve, reject) => {
      const w = new Worker(new URL('./stand-worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => { resolve(e.data); w.terminate(); };
      w.onerror = (e) => { reject(e); w.terminate(); };
      w.postMessage(dim);
    });
  } catch {
    const { meshStand } = await import('./stand-mesher.js');
    return meshStand(dim);
  }
}

export async function buildStand(M) {
  const r = await standArrays();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(r.pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(r.nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(r.col, 3));
  geo.setAttribute('ao', new THREE.BufferAttribute(r.ao, 1));
  geo.setIndex(new THREE.BufferAttribute(r.idx, 1));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, M.standMat);
  mesh.name = 'stand';
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}
