// Sword packaging box, 10 x 10 x 4.5 cm, built to match the packaging mockup (box/mockup.jpg). Units: centimetres.
// - Size and proportions from the mockup's solved camera (box/fitcam.py): the lid is square, as the QR on the back
//   is; the depth is 4.5 cm.
// - A full-depth lid over a white base: every edge is folded board with a 0.4 mm round; the bottom shows the lid's
//   white turn-in as a thin rim, a dark hairline gap, then the base's slightly recessed bottom. The lid's top corners
//   carry the small dark pinch where the board's folds meet.
// - Artwork: one atlas (box-art.jpg, box/make_atlas.py): the print blueprint's gradients (Packaging-sword-box-
//   Gradient.pdf, box/blueprint.py), the 2026 logo, the symbol, the back's Figtree text, the app QR and the label box.
//   Each face's colour is toned so the studio's render from the mockup's camera matches the mockup (box/calibrate.py).
// - A soft-touch matte board, the logo and symbols softly embossed under a gloss UV varnish (box-varnish.png), and
//   only a faint grain.
// Local frame: x across the lid (the logo reads along +x), y up (the lid), z towards the front (the face below the
// logo, with the symbol); centred on the box.
import * as THREE from 'three';

const base = new URL('./', import.meta.url);
const loadImg = (name) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = new URL(name, base).href; });
const [artImg, varnishImg] = await Promise.all([loadImg('box-art.jpg'), loadImg('box-varnish.png')]);

export const BOX = { W: 10, D: 10, H: 4.5 };
const R = 0.06;         // fold radius of every outer edge: a folded board edge, round enough to catch the light
const RIM = 0.07;       // board thickness: the white rim round the bottom (just wider than the fold)
const GAP = 0.01;       // between the lid's walls and the base: the dark hairline inside the rim
const RECESS = 0.012;   // the base's bottom sits this far inside the rim
const RB = 0.012;       // the base's own edge round
const GROOVE = 0.25;    // depth of the hairline gap (closed off inside)
const K = 5;            // segments per half fold (45 degrees)
// the folds' fine detail, as in the mockup's close-ups (shading factors on the ambient light):
// the lid's top folds start with a fine crease on both faces and catch a bright line along the fold;
// the bottom folds, round the white turn-in, read as a darker line
const CREASE = 0.72, CREASE_W = 0.014, TOP_FOLD = 1.12, BOTTOM_FOLD = 0.8;
// atlas (box/atlas.json): each face as seen from outside with the lid up; x, y of its top-left corner and w, h, cm
const ATLAS = 21.2;
const LAYOUT = { top: [0.3, 0.3, 10, 10], bottom: [10.9, 0.3, 10, 10], front: [0.3, 10.9, 10, 4.5], back: [10.9, 10.9, 10, 4.5], right: [0.3, 16.0, 10, 4.5], left: [10.9, 16.0, 10, 4.5] };
const PAPER_AT = ['bottom', 7.5, 3.0];   // a blank spot of the back's white board
export const GRAIN = { cell: 0.009, amp: 0.016 };   // cm per noise texel; sRGB amplitude (x the noise's range of +-0.5 x 6): barely there
// the logo and symbols: softly embossed, raised outwards, under a gloss UV varnish that also covers their rounded
// shoulders. height: the rise, cm; soft: the shoulder's softness, cm (baked into box-varnish.png by box/make_atlas.py,
// EMBOSS_SOFT: change both together)
export const EMBOSS = { height: 0.01, soft: 0.012 };

const hx = BOX.W / 2, hy = BOX.H / 2, hz = BOX.D / 2;
const atlasUV = (face, u, v) => { const [ox, oy] = LAYOUT[face]; return [(ox + u) / ATLAS, 1 - (oy + v) / ATLAS]; };
const PAPER_UV = atlasUV(PAPER_AT[0], PAPER_AT[1], PAPER_AT[2]);
// face-local print coordinates (cm from the face's top-left corner, seen from outside, lid up)
const FACE_UV = {
  // the back's print reads upright with the box's back face (the red one) at its top
  top: (p) => [p.x + hx, p.z + hz], bottom: (p) => [hx - p.x, hz + p.z],
  front: (p) => [p.x + hx, hy - p.y], back: (p) => [hx - p.x, hy - p.y],
  right: (p) => [hz - p.z, hy - p.y], left: (p) => [p.z + hz, hy - p.y],
};

// ---------------------------------------------------------------- the mockup's scene (box/pose.py)
// The mockup's boxes (front: the one the studio floats; back: the one that showed the back, for checking only), the
// floor 10.8 cm under them (from their soft shadow), and the mockup's camera: 9.194 degrees high, from 14 degrees
// above. Positions in cm (floor at y = 0), rotations as quaternions.
export const BOX_SCENE = {
  fovV: 9.1945, el: 14.0, key: [60.0, 60.0],
  camera: [0.0, 45.51655, 143.70271], target: [0.0, 9.68743, 0.0],
  front: { q: [0.43625, -0.25603, 0.16205, 0.84728], p: [3.48145, 13.6461, 4.47603] },   // lid towards the camera
  back: { q: [0.87504, -0.11799, -0.244, -0.40106], p: [-4.99263, 7.88223, -4.85686] },    // upside down, showing the back
};

// ---------------------------------------------------------------- geometry
// A rounded box is a cube's surface pushed onto the offset of a smaller box: p -> c + r n, c = clamp(p, inner),
// n = (p - c) / |p - c|. The normals are exact, and the folds' grid is spaced evenly in angle.
function zone(h, r) { const z = []; for (let k = 0; k <= K; k++) z.push(h - r + r * Math.tan((Math.PI / 4) * (k / K))); return z; }
function axis(h, r, extra = []) {
  const up = zone(h, r);
  const vals = [...up.map((v) => -v), ...up, ...extra].sort((a, b) => a - b);
  return vals.filter((v, i) => i === 0 || v - vals[i - 1] > 1e-6);
}
function roundOnto(p, lo, hi, r) {   // lo/hi: the inner box's corners
  const c = new THREE.Vector3(Math.min(Math.max(p.x, lo.x), hi.x), Math.min(Math.max(p.y, lo.y), hi.y), Math.min(Math.max(p.z, lo.z), hi.z));
  const n = p.clone().sub(c).normalize();
  return { p: c.addScaledVector(n, r), n };
}

class Builder {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.ao = []; this.idx = []; }
  // grid over (a, b): vert(a, b) -> { p, n, uv, ao } ; keep(ia, ib) decides which cells exist
  grid(as, bs, vert, keep = () => true) {
    const id = [];
    for (let j = 0; j < bs.length; j++) for (let i = 0; i < as.length; i++) {
      const v = vert(as[i], bs[j]);
      id.push(this.pos.length / 3);
      this.pos.push(v.p.x, v.p.y, v.p.z); this.nor.push(v.n.x, v.n.y, v.n.z); this.uv.push(...v.uv); this.ao.push(v.ao);
    }
    const at = (i, j) => id[j * as.length + i];
    for (let j = 0; j < bs.length - 1; j++) for (let i = 0; i < as.length - 1; i++) {
      if (!keep(i, j)) continue;
      this.quad(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
    }
  }
  quad(a, b, c, d) {   // wound to face along the vertices' normals
    const P = (k) => new THREE.Vector3(this.pos[k * 3], this.pos[k * 3 + 1], this.pos[k * 3 + 2]);
    const N = (k) => new THREE.Vector3(this.nor[k * 3], this.nor[k * 3 + 1], this.nor[k * 3 + 2]);
    const f = new THREE.Vector3().crossVectors(P(c).sub(P(a)), P(d).sub(P(b)));
    const n = N(a).add(N(b)).add(N(c)).add(N(d));
    if (f.dot(n) >= 0) this.idx.push(a, b, c, a, c, d); else this.idx.push(a, c, b, a, d, c);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('ao', new THREE.Float32BufferAttribute(this.ao, 1));
    g.setIndex(this.idx);
    return g;
  }
}

const smooth = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };

function buildBoxGeometry() {
  const B = new Builder();
  const lo = new THREE.Vector3(-hx + R, -hy + R, -hz + R), hi = new THREE.Vector3(hx - R, hy - R, hz - R);
  // the pinch at the lid's four top corners: a small dark spot where the folds meet
  const apex = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) apex.push(new THREE.Vector3(sx * (hx - R), hy - R, sz * (hz - R)).addScaledVector(new THREE.Vector3(sx, 1, sz).normalize(), R));
  const pinch = (p) => apex.reduce((a, q) => a * (1 - 0.55 * Math.exp(-(p.distanceToSquared(q)) / (0.035 * 0.035))), 1);
  const near = (a, b) => Math.abs(a - b) < 1e-7;
  const shell = (face, p0) => {
    const { p, n } = roundOnto(p0, lo, hi, R);
    let ao = pinch(p);
    const ax = Math.abs(p0.x), az = Math.abs(p0.z);
    if (face === 'top') {
      if (near(ax, hx - R) || near(az, hz - R)) ao *= CREASE;
      if (near(ax, hx) || near(az, hz)) ao *= TOP_FOLD;
    } else {
      if (near(p0.y, hy - R)) ao *= CREASE;
      if (near(p0.y, hy)) ao *= TOP_FOLD;
      if (near(p0.y, -hy)) ao *= BOTTOM_FOLD;
    }
    return { p, n, uv: atlasUV(face, ...FACE_UV[face](p)), ao };
  };
  // extra grid lines just outside the creases keep them fine
  const X = axis(hx, R), Y = axis(hy, R, [hy - R - CREASE_W]), Z = axis(hz, R);
  const XT = axis(hx, R, [-(hx - R - CREASE_W), hx - R - CREASE_W]), ZT = axis(hz, R, [-(hz - R - CREASE_W), hz - R - CREASE_W]);
  B.grid(XT, ZT, (x, z) => shell('top', new THREE.Vector3(x, hy, z)));
  B.grid(Z, Y, (z, y) => shell('right', new THREE.Vector3(hx, y, z)));
  B.grid(Z, Y, (z, y) => shell('left', new THREE.Vector3(-hx, y, z)));
  B.grid(X, Y, (x, y) => shell('front', new THREE.Vector3(x, y, hz)));
  B.grid(X, Y, (x, y) => shell('back', new THREE.Vector3(x, y, -hz)));
  // bottom: the lid's white turn-in, a rim of board thickness round the opening
  const ix = hx - RIM, iz = hz - RIM;
  const XB = axis(hx, R, [-ix, ix]), ZB = axis(hz, R, [-iz, iz]);
  B.grid(XB, ZB, (x, z) => {
    const { p, n } = roundOnto(new THREE.Vector3(x, -hy, z), lo, hi, R);
    const inner = Math.min(Math.abs(Math.abs(x) - ix), Math.abs(Math.abs(z) - iz));
    const onRim = Math.abs(x) >= ix - 1e-9 || Math.abs(z) >= iz - 1e-9;
    const fold = near(Math.abs(x), hx) || near(Math.abs(z), hz) ? BOTTOM_FOLD : 1;
    return { p, n, uv: PAPER_UV, ao: fold * (onRim ? 0.72 + 0.28 * smooth(0, 0.025, inner) : 1) };
  }, (i, j) => !(Math.abs(XB[i] + XB[i + 1]) / 2 < ix && Math.abs(ZB[j] + ZB[j + 1]) / 2 < iz));
  // the gap: the lid wall's inner face going up from the rim, the base's side facing it, and a floor that closes it
  const bx = ix - GAP, bz = iz - GAP, yb = -hy + RECESS, yTop = -hy + GROOVE;
  const rows = [0, 0.02, 0.06, 0.12, 1].map((t) => -hy + t * GROOVE);
  const wallAO = (y) => 0.32 - 0.28 * smooth(-hy, -hy + 0.06, y);
  for (const [sx, sz, len, u] of [[1, 0, iz, 'z'], [-1, 0, iz, 'z'], [0, 1, ix, 'x'], [0, -1, ix, 'x']]) {
    const n = new THREE.Vector3(-sx, 0, -sz);   // faces into the gap
    B.grid([-len, len], rows, (s, y) => ({ p: sx ? new THREE.Vector3(sx * ix, y, s) : new THREE.Vector3(s, y, sz * iz), n, uv: PAPER_UV, ao: wallAO(y) }));
    // floor strip between the two walls
    B.grid([-len, len], [0, 1], (s, t) => {
      const w = sx ? new THREE.Vector3(sx * (ix - t * GAP), yTop, s) : new THREE.Vector3(s, yTop, sz * (iz - t * GAP));
      return { p: w, n: new THREE.Vector3(0, -1, 0), uv: PAPER_UV, ao: 0.05 };
    });
  }
  // the base: a rounded tray whose bottom carries the back's print, slightly inside the rim
  const loB = new THREE.Vector3(-bx + RB, yb + RB, -bz + RB), hiB = new THREE.Vector3(bx - RB, yTop + 1, bz - RB);
  const XI = axis(bx, RB), ZI = axis(bz, RB);
  const YI = [...zone(0, RB).map((v) => yb - v).reverse(), yTop].filter((v, i, a) => i === 0 || v - a[i - 1] > 1e-6);
  const baseV = (p0) => {
    const { p, n } = roundOnto(p0, loB, hiB, RB);
    const flat = n.y < -0.999;
    return { p, n, uv: flat ? atlasUV('bottom', ...FACE_UV.bottom(p)) : PAPER_UV, ao: flat ? 1 : 0.5 - 0.45 * smooth(yb + RB, yb + RB + 0.06, p.y) };
  };
  B.grid(XI, ZI, (x, z) => baseV(new THREE.Vector3(x, yb, z)));
  B.grid(ZI, YI, (z, y) => baseV(new THREE.Vector3(bx, y, z)));
  B.grid(ZI, YI, (z, y) => baseV(new THREE.Vector3(-bx, y, z)));
  B.grid(XI, YI, (x, y) => baseV(new THREE.Vector3(x, y, bz)));
  B.grid(XI, YI, (x, y) => baseV(new THREE.Vector3(x, y, -bz)));
  return B.geometry();
}

// ---------------------------------------------------------------- material
function grainTexture(n = 512) {
  // monochrome Gaussian noise (std 1/6 of the range), tiling; linear filtering keeps it soft when seen up close
  const data = new Uint8Array(n * n);
  let s = 0x9e3779b9;
  const rnd = () => {   // mulberry32
    s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < n * n; i++) {
    const g = Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
    data[i] = Math.max(0, Math.min(255, Math.round(127.5 + g * 42.5)));
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

// the soft-touch laminate's surface: a fine, even orange peel (blurred noise, features about 0.1 mm) that breaks up the
// highlights a little, as on the real board; it is a bump only, so the print's colour stays clean
function surfaceTexture(n = 256) {
  let s = 0x2545f491;
  const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let a = new Float32Array(n * n).map(() => rnd());
  const blur = (src, r) => {   // separable box blur, wrapping (a tile)
    const tmp = new Float32Array(n * n), out = new Float32Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let v = 0; for (let k = -r; k <= r; k++) v += src[y * n + ((x + k + n) % n)]; tmp[y * n + x] = v / (2 * r + 1); }
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let v = 0; for (let k = -r; k <= r; k++) v += tmp[((y + k + n) % n) * n + x]; out[y * n + x] = v / (2 * r + 1); }
    return out;
  };
  a = blur(blur(a, 2), 2);
  let lo = Infinity, hi = -Infinity; for (const v of a) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const data = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) { const v = Math.round(((a[i] - lo) / (hi - lo)) * 255); data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v; data[i * 4 + 3] = 255; }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(ATLAS / SURFACE_TILE, ATLAS / SURFACE_TILE);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}
const SURFACE_TILE = 0.6;   // cm per tile of the surface texture

function printMaterial(map, grain, varnish) {
  // a soft-touch matte board: a broad, soft highlight and a velvety sheen at grazing angles; little enough gloss that
  // faces seen edge-on keep their colour, as in the mockup. The logo and symbols are a UV spot varnish (the
  // blueprint): a clear gloss coat over the print.
  const print = new THREE.MeshPhysicalMaterial({ map, roughness: 0.58, metalness: 0, specularIntensity: 0.42, sheen: 0.14, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffffff),
    bumpMap: surfaceTexture(), bumpScale: 0.35,
    clearcoat: varnish ? 1 : 0, clearcoatMap: varnish, clearcoatRoughness: 0.06 });
  const uniforms = { uGrain: { value: grain }, uGrainScale: { value: ATLAS / GRAIN.cell / 512 }, uGrainAmp: { value: GRAIN.amp * 6 },
    // box-varnish.png: R the varnish; G, B the emboss's slopes along the atlas' x and down it, for a 1 cm rise, over
    // the steepest slope of a straight edge, 1 / (soft sqrt(2 pi)). In slope per atlas uv for EMBOSS.height:
    uEmboss: { value: varnish }, uEmbossScale: { value: varnish ? (EMBOSS.height / (EMBOSS.soft * Math.sqrt(2 * Math.PI))) * ATLAS : 0 } };
  print.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float ao;\nvarying float vAO;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvAO = ao;');
    const ao = THREE.ShaderChunk.aomap_fragment.replace('#ifdef USE_AOMAP', '#if 1').replace('( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0', 'vAO')
      + '\n\treflectedLight.directDiffuse *= mix( 1.0, vAO, 0.6 );\n\treflectedLight.directSpecular *= min( vAO, 1.0 );';
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vAO;
uniform sampler2D uGrain;
uniform float uGrainScale;
uniform float uGrainAmp;
uniform sampler2D uEmboss;
uniform float uEmbossScale;
// tilts the normal n by a height field's change over the next pixel across (dH.x) and down (dH.y). Unlike three's
// bump mapping, the screen's footprint is kept, so the slope is the real one (rise over run) at any distance
vec3 embossNormal( vec3 pos, vec3 n, vec2 dH, float faceDirection ) {
	vec3 dpx = dFdx( pos ), dpy = dFdy( pos );
	vec3 r1 = cross( dpy, n ), r2 = cross( n, dpx );
	float det = dot( dpx, r1 ) * faceDirection;
	return normalize( abs( det ) * n - sign( det ) * ( dH.x * r1 + dH.y * r2 ) );
}`)
      // the soft emboss: the varnish fills the laminate's fine texture; the logo rises with soft, rounded shoulders
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
	vec4 embossTex = texture2D( uEmboss, vMapUv );
	vec2 embossSlope = vec2( embossTex.g * 255.0 - 128.0, 128.0 - embossTex.b * 255.0 ) / 127.0 * uEmbossScale;   // per uv
	vec2 embossDH = vec2( dot( embossSlope, dFdx( vMapUv ) ), dot( embossSlope, dFdy( vMapUv ) ) );
	normal = embossNormal( - vViewPosition, normalize( mix( normal, nonPerturbedNormal, embossTex.r ) ), embossDH, faceDirection );`)
      .replace('#include <clearcoat_normal_fragment_maps>', `#include <clearcoat_normal_fragment_maps>
	clearcoatNormal = embossNormal( - vViewPosition, clearcoatNormal, embossDH, faceDirection );`)
      // a faint print grain, monochrome, in sRGB (it also keeps the soft gradients free of banding)
      .replace('#include <map_fragment>', `#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv, -0.6 );   // a little crisper than the default filtering
	diffuseColor *= sampledDiffuseColor;
#endif
	{
		vec3 s = sRGBTransferOETF( vec4( diffuseColor.rgb, 1.0 ) ).rgb;
		vec2 guv = vMapUv * uGrainScale;
		float g = ( texture2D( uGrain, guv ).r - 0.5 ) * uGrainAmp;
		float fade = clamp( ( 1.1 - dot( s, vec3( 0.3333 ) ) ) / 0.15, 0.0, 1.0 );
		s = clamp( s + g * fade, 0.0, 1.0 );
		diffuseColor.rgb = sRGBTransferEOTF( vec4( s, 1.0 ) ).rgb;
	}`)
      .replace('#include <aomap_fragment>', ao);
  };
  print.customProgramCacheKey = () => 'sword-box';
  return print;
}

export function createBoxMaterials(maxAniso = 8) {
  const map = new THREE.Texture(artImg || undefined);
  map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = maxAniso; map.needsUpdate = !!artImg;
  let varnish = null;
  if (varnishImg) { varnish = new THREE.Texture(varnishImg); varnish.anisotropy = maxAniso; varnish.needsUpdate = true; }
  return { print: printMaterial(map, grainTexture(), varnish) };
}

export function buildBox(B) {
  const geo = buildBoxGeometry();
  // a convex box casts no shadow on itself: no shadow map needed; the floor shadow comes from the studio's own copy
  const mesh = new THREE.Mesh(geo, B.print);
  mesh.name = 'box'; mesh.castShadow = false; mesh.receiveShadow = false;
  const group = new THREE.Group();
  group.name = 'sword-box';
  group.add(mesh);   // found by name: userData is copied as JSON when the studio clones the model for its shadow
  return group;
}
