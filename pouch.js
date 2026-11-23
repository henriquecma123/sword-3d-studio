// The Sword bands' drawstring pouch (offline). Units: centimetres. Frame: x across, y up, z to the front; its base on
// the floor, centred.
// - A pouch of black polyester twill, 17 x 23 cm, sewn up both sides and across the bottom, gathered at the top by a
//   drawstring in a 2 cm channel, the cord leaving at the top right and hanging in a knot (as in the product photo).
// - Physics: the pouch is the bands' container. Its walls (POUCH, below) are contacts in the band simulation
//   (bands.js, pouchContacts): bands inside stay inside, bands outside stay out, and they can be pulled out over the
//   top. The cloth then takes its shape from what is in it: each frame the bands' surfaces are gathered into a depth
//   map, front and back, and the sheets drape over them (a loosely filled pouch: flat where it is empty, bulging round
//   the bands, gathered and pleated at the neck).
// - The logo (the 2026 logo, white ink) is printed on both faces, centred, low on the pouch, reading right way round
//   from each side.
import * as THREE from 'three';

export const POUCH = {
  H: 24,          // height of the gathered top over the floor (the packed bands stand 5 cm out of it: more, and the free
                  // ends buckle over: a 5 cm latex strip is about as long as stands under its own weight)
  hw: 8.4,        // inner half-width (the walls the bands meet) along the body
  hwTop: 8.0,     // ... at the gathered neck
  hd: 1.05,        // front and back: packed, the cloth holds the folded bands flat (else a 24 cm latex strip buckles)
  pack: 0.82,      // the folded bands' half-thickness when packed (the fold's radius)
  neck: 4,        // the gathering runs over the top 4 cm
  cloth: 0.12,    // the cloth's thickness and give (its surface sits this far out of the bands' surfaces)
  logo: { w: 7.0, y: 5.2 },   // the logo's width and the height of its centre
};
// how far the cloth stands out (front or back) at a height, for what lies against it from outside
POUCH.clothZ = (y) => 2.0 + 1.4 * smooth01((POUCH.H - 0.5 - y) / 13);   // (at the neck too: its gathers stand 2 cm out)
export const pouchHW = (y) => POUCH.hw + (POUCH.hwTop - POUCH.hw) * smooth01((y - (POUCH.H - POUCH.neck)) / POUCH.neck);
const smooth01 = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

const NX = 120, NY = 110;            // cloth grid, per face
const GX = 40, GY = 56;            // the contents' depth map
const X0 = -10.6, X1 = 10.6, Y1 = POUCH.H + 1.5;
const SEAM = 1.2;
const CX = 40, CY = 52;             // the cloth simulation's grid, per panel
const WR = 21.0, HR = 24.6;         // each panel laid flat (cm): 17 across plus what its fullness takes up; 24 tall plus 1 turned under
const DXR = WR / CX, DYR = HR / CY, CHAN = 2.1;   // (CHAN: the drawstring channel, the top 2.1 cm)
const cid = (f, i, j) => f * (CX + 1) * (CY + 1) + j * (CX + 1) + i;
const yr = (j) => POUCH.H - HR + j * DYR;   // a row's height on the flat cloth (the top at the pouch's height)   // the cloth rounds in to the side seams over their last 1.2 cm (a pillow's edge, not a wall)

// ---------------------------------------------------------------- materials
const TWILL_GLSL = `
uniform sampler2D uLogo; uniform vec4 uLogoRect; uniform float uInk; uniform float uH;
// the channel's lockstitch: black thread in 3 mm dashes, 2 mm below its seam crease, a touch glossier than the cloth
float stitch( vec3 p ) {
  float row = exp( - pow( ( p.y - ( uH - 2.28 ) ) / 0.028, 2.0 ) );
  float dash = smoothstep( 0.08, 0.2, fract( p.x / 0.32 ) ) * ( 1.0 - smoothstep( 0.7, 0.82, fract( p.x / 0.32 ) ) );
  return row * dash;
}
varying vec3 vP; varying float vSide;
float pHash( vec2 p ) { p = fract( p * vec2( 0.1031, 0.1030 ) ); p += dot( p, p.yx + 33.33 ); return fract( ( p.x + p.y ) * p.x ); }
float pNoise( vec2 x ) { vec2 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( pHash( i ), pHash( i + vec2( 1, 0 ) ), f.x ), mix( pHash( i + vec2( 0, 1 ) ), pHash( i + vec2( 1, 1 ) ), f.x ), f.y ); }
// the twill: diagonal wales (about 22 per cm), their phase wandering a little and their height varying yarn by yarn,
// as a real weave does (a perfectly even one shimmers in moire bands)
float twill( vec2 q, out float fade ) {
  float px = length( fwidth( q ) ) * 14.0;
  fade = 1.0 - smoothstep( 0.3, 0.75, px );
  float ph = ( q.x * 0.7071 + q.y * 0.7071 ) * 14.0 * 6.2831853 + 1.6 * pNoise( q * 2.0 );
  float yarn = 0.55 + 0.9 * pNoise( vec2( ( q.x - q.y ) * 20.0, ( q.x + q.y ) * 2.0 ) );
  return sin( ph ) * yarn;
}
`;
function clothMaterial(logoTex) {
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color().setRGB(0.0085, 0.0085, 0.0092, THREE.LinearSRGBColorSpace),
    roughness: 0.78, metalness: 0, sheen: 1, sheenRoughness: 0.38, specularIntensity: 0.35, side: THREE.DoubleSide,
  });
  m.sheenColor.setRGB(0.12, 0.12, 0.125, THREE.LinearSRGBColorSpace);
  const L = POUCH.logo, aspect = 3072 / 796;
  const U = { uH: { value: POUCH.H }, uLogo: { value: logoTex }, uLogoRect: { value: new THREE.Vector4(0, L.y, L.w, L.w / aspect) }, uInk: { value: 0.72 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float side;\nattribute vec2 rest;\nvarying vec3 vP;\nvarying float vSide;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvP = vec3( rest, 0.0 ); vSide = side;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + TWILL_GLSL)
      // the logo: on the outer face of each sheet, reading the right way from its own side (the back's x mirrored)
      .replace('#include <map_fragment>', `#include <map_fragment>
  vec2 lUv = vec2( ( vSide * vP.x - uLogoRect.x ) / uLogoRect.z + 0.5, ( vP.y - uLogoRect.y ) / uLogoRect.w + 0.5 );
  float lIn = step( 0.0, lUv.x ) * step( lUv.x, 1.0 ) * step( 0.0, lUv.y ) * step( lUv.y, 1.0 ) * ( gl_FrontFacing ? 1.0 : 0.0 );
  float ink = lIn * texture2D( uLogo, clamp( lUv, 0.0, 1.0 ) ).r;
  {
    // the weave in the colour: the twill's diagonal wales a touch lighter than the grooves, and a faint unevenness of
    // the yarn (fading out with the ribs when finer than a pixel)
    float fadeC; float tw = twill( vP.xy + vec2( vSide * 0.37, 0.0 ), fadeC );
    // heathered: the black yarn is not quite even, in soft blotches of a few millimetres and finer flecks
    float mott = ( pNoise( vP.xy * 1.6 + vSide * 7.0 ) - 0.5 ) * 0.2 + ( pNoise( vP.xy * 7.0 ) - 0.5 ) * 0.18 + ( pNoise( vP.xy * 30.0 ) - 0.5 ) * 0.3;
    diffuseColor.rgb *= ( 1.0 + mott ) * ( 1.0 + 0.45 * tw * fadeC );
  }
  float st = stitch( vP ) * ( gl_FrontFacing ? 1.0 : 0.0 );
  diffuseColor.rgb *= 1.0 + 0.6 * st;
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( uInk ), ink );`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = mix( roughnessFactor, 0.48, ink );\n\troughnessFactor = mix( roughnessFactor, 0.45, stitch( vP ) );')
      // the twill: fine diagonal ribs (about 13 per cm) in the normal, fading out once finer than a pixel; the inside
      // face a shade darker (it sees little light)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    float fade; float tw2 = twill( vP.xy + vec2( vSide * 0.37, 0.0 ), fade );
    float hgt = tw2 * 0.005 * fade * ( 1.0 - ink ) + stitch( vP ) * 0.02;   // the thread stands proud of the weave
    vec3 dpx = dFdx( - vViewPosition ), dpy = dFdy( - vViewPosition );
    float dhx = dFdx( hgt ), dhy = dFdy( hgt );
    vec3 r1 = cross( dpy, normal ), r2 = cross( normal, dpx );
    float det = dot( dpx, r1 );
    normal = normalize( abs( det ) * normal - sign( det ) * ( dhx * r1 + dhy * r2 ) );
  }`)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n\tif ( ! gl_FrontFacing ) { reflectedLight.indirectDiffuse *= 0.35; reflectedLight.indirectSpecular *= 0.35; }');
  };
  m.customProgramCacheKey = () => 'sword-pouch-6';
  return m;
}
function cordMaterial() {
  const m = new THREE.MeshPhysicalMaterial({ color: new THREE.Color().setRGB(0.012, 0.012, 0.013, THREE.LinearSRGBColorSpace), roughness: 0.7, sheen: 0.8, sheenRoughness: 0.5 });
  m.sheenColor.setRGB(0.25, 0.25, 0.26, THREE.LinearSRGBColorSpace);
  // braided: a herringbone of ridges round and along the cord (uv: along, round)
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vCu;').replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvCu = uv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vCu;').replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    float a = vCu.x * 420.0, r = vCu.y * 6.2831853 * 4.0;
    float hgt = ( abs( fract( ( a + r ) / 6.2831853 ) - 0.5 ) + abs( fract( ( a - r ) / 6.2831853 ) - 0.5 ) ) * 0.02;
    vec3 dpx = dFdx( - vViewPosition ), dpy = dFdy( - vViewPosition );
    float dhx = dFdx( hgt ), dhy = dFdy( hgt );
    vec3 r1 = cross( dpy, normal ), r2 = cross( normal, dpx );
    float det = dot( dpx, r1 );
    normal = normalize( abs( det ) * normal - sign( det ) * ( dhx * r1 + dhy * r2 ) );
  }`);
  };
  m.customProgramCacheKey = () => 'sword-pouch-cord-1';
  return m;
}

// ---------------------------------------------------------------- the pouch
export class Pouch {
  constructor() {
    this.group = new THREE.Group(); this.group.name = 'band-pouch';
    const logo = new THREE.TextureLoader().load(new URL('./assets/yoga-block-logo.png', import.meta.url).href);
    logo.colorSpace = THREE.NoColorSpace; logo.anisotropy = 8;
    this.mat = clothMaterial(logo);
    // two sheets (front, back), each NX x NY, plus a strip closing the bottom between them
    const nv = 2 * (NX + 1) * (NY + 1);
    this.pos = new Float32Array(3 * nv);
    const side = new Float32Array(nv), idx = [];
    const id = (f, i, j) => f * (NX + 1) * (NY + 1) + j * (NX + 1) + i;
    for (let f = 0; f < 2; f++) for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) side[id(f, i, j)] = f === 0 ? 1 : -1;
    for (let f = 0; f < 2; f++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const a = id(f, i, j), b = id(f, i + 1, j), c = id(f, i + 1, j + 1), d = id(f, i, j + 1);
      if (f === 0) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);   // outer faces front-facing
    }
    for (let i = 0; i < NX; i++) { const a = id(0, i, 0), b = id(0, i + 1, 0), c = id(1, i + 1, 0), d = id(1, i, 0); idx.push(a, d, c, a, c, b); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('side', new THREE.BufferAttribute(side, 1));
    g.setAttribute('rest', new THREE.BufferAttribute(new Float32Array(2 * nv), 2));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(3 * nv), 3));
    g.setIndex(idx);
    this.geometry = g;
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.name = 'pouch-cloth';
    this.group.add(this.mesh);
    this.front = new Float32Array(GX * GY); this.back = new Float32Array(GX * GY); this.outF = new Float32Array(GX * GY); this.outB = new Float32Array(GX * GY); this.tmp = new Float32Array(GX * GY);
    this.cordMat = cordMaterial();
    this.cordGroup = new THREE.Group(); this.group.add(this.cordGroup);
    this.settle(null, 400);   // (once: from the shape model to a settled cloth)
  }

  // the cloth's own resting depth (a loosely filled pouch): nothing at the side seams and the bottom seam, a soft fullness
  // in the body, and a little more at the gathered neck, where the cloth bunches
  // the cloth's outline (half-width by height) and its own fullness: a well-filled pouch, as in the product photo. Its
  // body is a soft pillow about 6 cm thick, its sides bowing out, its base rounded off at the corners; above, the
  // drawstring gathers it in to the bands' width
  halfWidth(y) {
    const H = POUCH.H, body = smooth01((H - 1.0 - y) / 10);            // 1 on the body, easing in to the gathered neck
    const neckW = 8.4 + (pouchHW(y) - POUCH.hwTop) * 0.5, bodyW = POUCH.hw + 0.6;   // the neck drawn in round the bands
    const w = neckW + (bodyW - neckW) * body - 0.9 * (1 - smooth01(y / 3.2)) ** 2;     // the rounded base corners
    // the drawstring pulled shut (this.close 0..1, as the bands go in): the top gathers in to a small puckered knot
    // drawn in: the hem (its top 2 cm) gathers to a narrower width, and the cloth between the contents' top and the hem
    // slopes up to it in a soft dome (rounding over the shoulders); nothing narrows below the contents
    const k = this.closeAt(y);
    let bx = 0;   // the bands' reach here (smoothed, interpolated between rows: no steps down the side)
    if (this.xExt) { const fy = Math.min(GY - 1.001, Math.max(0, (y / Y1) * (GY - 1))), j = Math.floor(fy), a = fy - j; bx = this.xExt[j] * (1 - a) + this.xExt[j + 1] * a; }
    return Math.max(w * (1 - 0.55 * k), bx > 0.05 ? bx + SEAM : 0);   // (never closer to a band than its seam's pinch)
  }
  // how far the drawstring draws the cloth in at a height (0..1): c at the hem, easing down to 0 at the contents' top
  closeAt(y) {
    const c = this.close || 0; if (!c) return 0;
    // over the top 10 cm: easing in from the body, levelling into the hem (its top 1.2 cm); the contents are squeezed
    // in with it (bands.js)
    const H = POUCH.H;
    return c * smooth01((y - (H - 10)) / 8.8);
  }
  // what a filled pouch holds the cloth out to (soft): round in section, meeting the seams at an angle, full low down
  fill(u, y) {
    if (Math.abs(u) >= 1) return 0;
    const H = POUCH.H, yb = Math.min(1, y / 2.2), up = Math.sqrt(Math.max(0, 1 - (1 - yb) ** 2));
    const body = smooth01((H - 1.5 - y) / 12), low = smooth01((12 - y) / 10), held = smooth01(((this.top ?? H) + 1.0 - y) / 3.5);
    return held * Math.pow(1 - u * u, 0.6) * up * (1.2 + 2.6 * body + 0.6 * low) * (1 - 0.5 * this.closeAt(y));
  }
  base(u, y) {
    // a well-filled pouch: round in section (full almost to the seams), 4.3 cm out at its fullest, low in the body; its
    // base sits wide on the floor (the contents push the bottom seam out into a flat, rounded footprint)
    const H = POUCH.H, across = Math.pow(Math.max(0, 1 - Math.abs(u) ** 2.6), 0.6);   // full in the middle, rounding in to the seams
    // the bottom: a seam the two sides meet at, rounded off by what is in it (the pouch sits on that curve)
    const yb = Math.min(1, y / 1.6), up = Math.sqrt(Math.max(0, 1 - (1 - yb) ** 2));
    const body = smooth01((H - 0.5 - y) / 13), low = smooth01((13 - y) / 10);
    return across * up * (1.7 + 2.1 * body + 0.5 * low) * (1 - 0.5 * this.closeAt(y));   // full up to the neck (closed: drawn flat)
  }

  // gather the bands into the depth maps: every node, and the two edges of its band, front (+z) and back (-z)
  sample(world) {
    const F = this.front, B = this.back; F.fill(0); B.fill(0);
    const OF = this.outF, OB = this.outB; OF.fill(1e3); OB.fill(1e3);
    let top = 0;   // how high what is in the pouch reaches
    const RC = (this.rimCap ??= new Float32Array(2 * GX)); RC.fill(1e3);   // (front, then back)   // under a band lying over the rim, how high the rim may be
    const rimC = [];
    const XE = (this.xExt ??= new Float32Array(GY)); XE.fill(0);
    if (!world) return;
    const cl = POUCH.cloth, fr = new Float64Array(9);
    for (const b of world.bands) {
      const n = b.n, hw = b.W / 2;
      for (let s = 0; s < n; s++) {
        const x = b.x, a = 3 * s, c = 3 * ((s + 1) % n);
        const mx = 0.5 * (x[a] + x[c]), my = 0.5 * (x[a + 1] + x[c + 1]), mz = 0.5 * (x[a + 2] + x[c + 2]);
        if (my > POUCH.H + 0.3 + hw) continue;   // only what is in the pouch shapes it (the open tops above do not)
        frameOf(b.q, fr, 4 * s);
        // a free part still in the neck (rising through the opening) fills the cloth like what is held; one lying on the
        // outside presses the cloth in under it
        const inNeck = my < POUCH.H + 0.3 && Math.abs(mx) < pouchHW(my) + 0.3 && Math.abs(mz) < POUCH.hd + 0.8;
        if (b.hold && !(b.hold[s] && b.hold[(s + 1) % n]) && !inNeck) {
          for (let k = -4; k <= 4; k++) {   // (point by point: a band tilted over the rim may dip an edge below it)
            const u = (k / 4) * hw, px = mx + u * fr[0], py = my + u * fr[1], pz = mz + u * fr[2];
            if (py > POUCH.H + 0.5) continue;
            const gi = Math.round(((px - X0) / (X1 - X0)) * (GX - 1)), gj = Math.round((py / Y1) * (GY - 1));
            if (gi < 0 || gi >= GX || gj < 0 || gj >= GY) continue;
            const g = gj * GX + gi, ext = Math.abs(fr[5]) * b.t / 2 + b.t / 2 + 0.06;
            if (pz > 0) { if (pz - ext < OF[g]) OF[g] = pz - ext; } else if (-pz - ext < OB[g]) OB[g] = -pz - ext;
            // over the rim, close to it (not hanging out in front lower down): the rim gives under it
            if (py > POUCH.H - 2.5) rimC.push(gi, px, py - Math.abs(fr[4]) * b.t / 2 - 0.12, pz);
          }
          continue;
        }
        if (my > POUCH.H + 0.3) continue;
        for (let k = -4; k <= 4; k++) {
          const u = (k / 4) * hw, px = mx + u * fr[0], py = my + u * fr[1], pz = mz + u * fr[2];
          const gi = Math.round(((px - X0) / (X1 - X0)) * (GX - 1)), gj = Math.round((py / Y1) * (GY - 1));
          if (gi < 0 || gi >= GX || gj < 0 || gj >= GY) continue;
          // the surface over the band at this point: its thickness, how it lies (a face turned to the front is
          // thinner there than an edge), and the cloth
          const ext = Math.abs(fr[5]) * b.t / 2 + cl;
          const g = gj * GX + gi;
          if (Math.abs(px) + b.t > XE[gj]) XE[gj] = Math.abs(px) + b.t;
          if (py > top) top = py;
          if (pz + ext > F[g]) F[g] = pz + ext;
          if (-pz + ext > B[g]) B[g] = -pz + ext;
        }
      }
    }
    this.top = world ? top : POUCH.H - 3;
    { const XS = XE.slice(), dr = 0.35;
      for (let j = 1; j < GY; j++) XE[j] = Math.max(XE[j], XE[j - 1] - dr);
      for (let j = GY - 2; j >= 0; j--) XE[j] = Math.max(XE[j], XE[j + 1] - dr);
      for (let k = 0; k < 3; k++) { XS.set(XE); for (let j = 0; j < GY; j++) XE[j] = 0.25 * XS[Math.max(0, j - 1)] + 0.5 * XS[j] + 0.25 * XS[Math.min(GY - 1, j + 1)]; }
      for (let j = 0; j < GY; j++) if (j * Y1 / (GY - 1) > POUCH.H + 0.3) XE[j] = 0; }
    // the drape: the bands' surfaces widened a little, then a smooth average over about 2 cm laid over them (never
    // below them), so the cloth runs in soft curves from band to band rather than in steps
    for (const M of [F, B]) {
      this.dilate(M); this.drape(M); const raw = M.slice();
      for (let k = 0; k < 6; k++) this.average(M);
      for (let g = 0; g < M.length; g++) M[g] = Math.max(M[g], raw[g]);
      this.average(M);
    }
    // the outer limits: the cloth dented in a soft hollow round what lies on it (rising again within about 1.5 cm)
    for (const O of [OF, OB]) {
      this.dilate(O, true); this.drape(O, true);
      for (let g = 0; g < O.length; g++) O[g] = Math.min(O[g], 8);   // (8 cm: no limit, as deep as the cloth ever stands)
      for (let k = 0; k < 2; k++) this.average(O);
    }
    // how far out each side seam must keep, row by row: past the bands' edge by as much as the cloth stands out over it
    // there, the widest of the rows round it, smoothed (a seam runs straight past the bands' ripples)
    { const SC = (this.seamCl ??= new Float32Array(2 * GY)); SC.fill(0);
      for (let side = 0; side < 2; side++) { const sx = side ? 1 : -1, o = side * GY;
        for (let j = 0; j < GY; j++) { const e = XE[j]; if (e <= 0.05) continue; const y = (j / (GY - 1)) * Y1;
          SC[o + j] = e + 0.3 + 0.9 * Math.max(this.at(F, sx * e, y), this.at(B, sx * e, y)) }
        const T = SC.slice(o, o + GY);
        for (let j = 0; j < GY; j++) { let m = 0; for (let d = -12; d <= 12; d++) { const jj = j + d; if (jj >= 0 && jj < GY && T[jj] > m) m = T[jj]; } SC[o + j] = m; }
        for (let k = 0; k < 3; k++) { T.set(SC.subarray(o, o + GY)); for (let j = 0; j < GY; j++) SC[o + j] = Math.max(T[j], 0.25 * T[Math.max(0, j - 1)] + 0.5 * T[j] + 0.25 * T[Math.min(GY - 1, j + 1)]); }
        // (none above what is in the pouch: there the drawstring has the cloth)
        for (let j = 0; j < GY; j++) SC[o + j] *= smooth01((this.top + 1.5 - (j / (GY - 1)) * Y1) / 1.5);
      } }
    // (only where the band crosses the rim itself: as close to it as the cloth stands out there, not hanging lower down)
    for (let q = 0; q < rimC.length; q += 4) { const px = rimC[q + 1], pz = rimC[q + 3], d = this.at(pz > 0 ? F : B, px, POUCH.H - 0.5);
      const g = rimC[q] + (pz > 0 ? 0 : GX);
      if (Math.abs(pz) < Math.max(d, 0.6) + 0.9 && rimC[q + 2] < RC[g]) RC[g] = rimC[q + 2]; }
    for (const o of [0, GX]) {   // (sagging in a soft dip, not a notch)
      for (let i = 1; i < GX; i++) RC[o + i] = Math.min(RC[o + i], RC[o + i - 1] + 0.35);
      for (let i = GX - 2; i >= 0; i--) RC[o + i] = Math.min(RC[o + i], RC[o + i + 1] + 0.35); }
  }
  dilate(M, low) {   // (low: the lowest of the neighbours, for the outer limits)
    const T = this.tmp; T.set(M);
    for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
      let m = T[j * GX + i];
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= GX || jj >= GY) continue;
        const v = T[jj * GX + ii]; if (low ? v < m : v > m) m = v;
      }
      M[j * GX + i] = m;
    }
  }
  // cloth can't fall away steeply from what pushes it: from every cell the surface may drop at most about 1 cm per
  // 1.5 cm going away (up, down or sideways), so a band's foot on the floor lifts the cloth above it in a soft slope
  // rather than a ledge
  drape(M, low) {   // (low: the outer limits, rising again away from what presses: the same slopes, upside down)
    const sy = 0.3, sx = 0.22, sg = low ? -1 : 1;   // per cell (0.45 cm tall, 0.54 cm wide)
    const lim = (g, v) => (low ? Math.min(M[g], v) : Math.max(M[g], v));
    for (let i = 0; i < GX; i++) {
      for (let j = 1; j < GY; j++) M[j * GX + i] = lim(j * GX + i, M[(j - 1) * GX + i] - sg * sy);
      for (let j = GY - 2; j >= 0; j--) M[j * GX + i] = lim(j * GX + i, M[(j + 1) * GX + i] - sg * sy);
    }
    for (let j = 0; j < GY; j++) {
      for (let i = 1; i < GX; i++) M[j * GX + i] = lim(j * GX + i, M[j * GX + i - 1] - sg * sx);
      for (let i = GX - 2; i >= 0; i--) M[j * GX + i] = lim(j * GX + i, M[j * GX + i + 1] - sg * sx);
    }
  }
  average(M) {
    const T = this.tmp; T.set(M);
    for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
      let s = 0, w = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= GX || jj >= GY) continue;
        const k = di === 0 && dj === 0 ? 2 : 1; s += k * T[jj * GX + ii]; w += k;
      }
      M[j * GX + i] = s / w;
    }
  }
  blur(M) {   // a soft drape: each cell eased towards the highest of its neighbours' average and its own value
    const T = this.tmp; T.set(M);
    for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
      let s = 0, w = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= GX || jj >= GY) continue;
        const k = di === 0 && dj === 0 ? 2 : 1; s += k * T[jj * GX + ii]; w += k;
      }
      M[j * GX + i] = Math.max(T[j * GX + i], s / w);   // never below a band: the cloth covers what it holds
    }
  }
  at(M, x, y) {   // bilinear
    const fx = Math.min(GX - 1.001, Math.max(0, ((x - X0) / (X1 - X0)) * (GX - 1))), fy = Math.min(GY - 1.001, Math.max(0, (y / Y1) * (GY - 1)));
    const i = Math.floor(fx), j = Math.floor(fy), a = fx - i, c = fy - j;
    return (M[j * GX + i] * (1 - a) + M[j * GX + i + 1] * a) * (1 - c) + (M[(j + 1) * GX + i] * (1 - a) + M[(j + 1) * GX + i + 1] * a) * c;
  }

  // ---------------------------------------------------------------- the cloth, simulated
  // Two panels of twill, each laid flat WR x HR, sewn together up both sides and across the bottom (their seam points
  // shared), the top 2.1 cm a channel gathered on the drawstring. A position-based cloth: stretch, shear and bending
  // springs; the contents (the bands, as depth maps, front and back) hard under it; a soft fullness (what a filled pouch
  // holds out); free band ends lying on it press it in; the floor under it. It carries on from where it was, so moving
  // the slider the cloth slides and settles, it doesn't jump.
  initSim() {
    const np = 2 * (CX + 1) * (CY + 1);
    this.X = new Float32Array(3 * np); this.Xp = new Float32Array(3 * np);
    const H = POUCH.H, ca = [], cb = [], kk = [], cxs = [], cys = [];
    const add = (a, b, k, cx, cy) => { ca.push(a); cb.push(b); kk.push(k); cxs.push(cx); cys.push(cy); };
    for (let f = 0; f < 2; f++) {
      for (let j = 0; j <= CY; j++) for (let i = 0; i <= CX; i++) {
        const a = cid(f, i, j), chan = yr(j) > H - CHAN - 1e-6;
        if (i < CX) add(a, cid(f, i + 1, j), 1, 1, 0);
        if (j < CY) add(a, cid(f, i, j + 1), 1, 0, 1);
        if (i < CX && j < CY) { add(a, cid(f, i + 1, j + 1), 0.5, 1, 1); add(cid(f, i + 1, j), cid(f, i, j + 1), 0.5, -1, 1); }
        if (i < CX - 1) add(a, cid(f, i + 2, j), chan ? 0.28 : 0.1, 2, 0);   // bending (the channel's gathers fold freely)
        if (j < CY - 1) add(a, cid(f, i, j + 2), i <= 1 || i >= CX - 1 ? 0.6 : 0.12, 0, 2);   // (the side seams, sewn double, stiffer)
      }
    }
    // the cord in the channel: along each of its rows, points 3 apart may be at most 3 cells x the gather apart (the cloth
    // keeps its length between them, so it ruffles)
    const ga = [], gb = [];
    const gs = [], gj = [];
    for (let f = 0; f < 2; f++) for (let j = 0; j <= CY; j++) if (yr(j) > H - CHAN - 1e-6) for (let i = 0; i < CX; i++) {
      const sp = 3 + ((i * 7 + f * 3) % 5 === 0 ? 1 : 0); if (i + sp > CX) continue;   // (uneven: spans of 3 and 4 cells)
      ga.push(cid(f, i, j)); gb.push(cid(f, i + sp, j)); gs.push(sp * (1 + 0.12 * Math.sin(i * 2.3 + f * 1.7 + 0.4))); gj.push(j);
    }
    // (round the seams, front to back, as the cord goes on round)
    for (let j = 0; j <= CY; j++) if (yr(j) > H - CHAN - 1e-6) for (const i1 of [3, CX - 3]) { ga.push(cid(0, i1, j)); gb.push(cid(1, i1, j)); gs.push(6); gj.push(j); }
    this.gA = Int32Array.from(ga); this.gB = Int32Array.from(gb); this.gS = Float32Array.from(gs); this.gJ = Int16Array.from(gj); this.gR = new Float32Array(ga.length);
    this.cA = Int32Array.from(ca); this.cB = Int32Array.from(cb); this.cK = Float32Array.from(kk); this.cX = Int8Array.from(cxs); this.cY = Int8Array.from(cys);
    this.cR = new Float32Array(ca.length);
    // to start: the panels round the contents, as the shape model had them
    for (let f = 0; f < 2; f++) for (let j = 0; j <= CY; j++) for (let i = 0; i <= CX; i++) {
      const k = 3 * cid(f, i, j), u = -1 + (2 * i) / CX, y0 = yr(j), s = f ? -1 : 1;
      const y = Math.max(0.02, y0), hw = this.halfWidth(y);
      this.X[k] = u * hw; this.X[k + 1] = y;
      this.X[k + 2] = (i === 0 || i === CX || j === 0) ? 0 : s * Math.max(0.03, this.base(u, y), this.at(f ? this.back : this.front, u * hw, y));
    }
    this.Xp.set(this.X);
    this.gather = -1; this.quiet = 0; this.moving = true;
    // the render grid's Catmull-Rom weights onto the simulation grid (separable), and each render vertex's place on the
    // flat cloth (the weave, the stitching and the logo are printed in it, so they follow every fold)
    const cr = (n, m) => { const W = []; for (let r = 0; r <= n; r++) { const t = (r / n) * m, i0 = Math.min(m - 1, Math.floor(t)), a = t - i0;
      const w = [(-a * a * a + 2 * a * a - a) / 2, (3 * a * a * a - 5 * a * a + 2) / 2, (-3 * a * a * a + 4 * a * a + a) / 2, (a * a * a - a * a) / 2];
      W.push([[0, 1, 2, 3].map((q) => Math.min(m, Math.max(0, i0 - 1 + q))), w]); } return W; };
    this.wI = cr(NX, CX); this.wJ = cr(NY, CY);
    const rest = this.geometry.attributes.rest.array;
    for (let f = 0; f < 2; f++) for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
      const v = f * (NX + 1) * (NY + 1) + j * (NX + 1) + i;
      rest[2 * v] = -WR / 2 + (i / NX) * WR; rest[2 * v + 1] = H - HR + (j / NY) * HR;
    }
    this.geometry.attributes.rest.needsUpdate = true;
  }
  // the drawstring's pull: the channel's rows gathered to the width the hem goes round (the contents, or the cord drawn
  // in further as the bands go below the neck)
  setGather() {
    // (the cord round the bands' bundle, tied loosely; with nothing to go round, drawn in as far as it is pulled)
    const H = POUCH.H, XE = this.xExt, j0 = Math.round(((H - 0.5) / Y1) * (GY - 1)), xeTop = XE ? XE[j0] : 0;
    const hemHW = Math.max(xeTop + 0.5, 7.6);
    // drawn in as the bands go below the neck: the cord ring shrinks to about 11 cm round (a hole some 3 cm across)
    const tight = Math.min(1, (this.close || 0) / 0.5), gOpen = (2 * hemHW * 1.05) / WR;
    const inNeck = (this.top ?? 0) > H - 0.5, gT = inNeck ? Math.max(0.4, (2 * (xeTop + 0.5) * 1.05) / WR) : 0.4;   // (round what is still in the neck)
    const g = Math.min(1, Math.max(0.4, gOpen + (Math.min(gOpen, gT) - gOpen) * smooth01(tight)));
    this.tight = tight;
    if (Math.abs(g - this.gather) < 1e-4 && Math.abs(tight - (this._tg ?? -1)) < 1e-4) return;
    this._tg = tight;
    this.gather = g;
    for (let c = 0; c < this.cA.length; c++) this.cR[c] = Math.hypot(this.cX[c] * DXR, this.cY[c] * DYR);
    for (let c = 0; c < this.gA.length; c++) this.gR[c] = this.gS[c] * DXR * g;
    this.quiet = 0; this.moving = true;
  }
  substep(iters) {
    const X = this.X, Xp = this.Xp, n = X.length / 3, H = POUCH.H;
    let mv = 0;
    for (let p = 0; p < n; p++) {   // verlet, damped (cloth in air is slow), with a light gravity
      const k = 3 * p;
      for (let d = 0; d < 3; d++) { const v = (X[k + d] - Xp[k + d]) * 0.86; Xp[k + d] = X[k + d]; X[k + d] += v; }
      X[k + 1] -= 0.02;
    }
    const A = this.cA, B = this.cB, R = this.cR, K = this.cK, nc = A.length;
    for (let it = 0; it < iters; it++) {
      for (let c = 0; c < nc; c++) {
        const a = 3 * A[c], b = 3 * B[c];
        const dx = X[b] - X[a], dy = X[b + 1] - X[a + 1], dz = X[b + 2] - X[a + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < 1e-7) continue;
        const s = (0.5 * K[c] * (d - R[c])) / d;
        X[a] += dx * s; X[a + 1] += dy * s; X[a + 2] += dz * s; X[b] -= dx * s; X[b + 1] -= dy * s; X[b + 2] -= dz * s;
      }
      const GA = this.gA, GB = this.gB, GR = this.gR;
      for (let c = 0; c < GA.length; c++) {   // the cord: only ever pulling in
        const a = 3 * GA[c], b = 3 * GB[c];
        const dx = X[b] - X[a], dy = X[b + 1] - X[a + 1], dz = X[b + 2] - X[a + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d <= GR[c]) continue;
        const s = (0.5 * 0.8 * (d - GR[c])) / d;
        X[a] += dx * s; X[a + 1] += dy * s; X[a + 2] += dz * s; X[b] -= dx * s; X[b + 1] -= dy * s; X[b + 2] -= dz * s;
      }
      this.collide(it === iters - 1);
    }
    for (let p = 0; p < n; p++) { const k = 3 * p; const v = Math.abs(X[k] - Xp[k]) + Math.abs(X[k + 1] - Xp[k + 1]) + Math.abs(X[k + 2] - Xp[k + 2]); if (v > mv) mv = v; }
    return mv;
  }
  collide() {
    const X = this.X, H = POUCH.H, XE = this.xExt;
    const RW = this._rw ??= new Float32Array(CY + 1);   // each row's half-width now (its seams)
    for (let j = 0; j <= CY; j++) RW[j] = Math.max(0.5, 0.5 * (Math.abs(X[3 * cid(0, 0, j)]) + Math.abs(X[3 * cid(0, CX, j)])));
    { const T = RW.slice(); for (let j = 0; j <= CY; j++) { let sm = 0, w = 0; for (let d = -4; d <= 4; d++) { const jj = j + d; if (jj < 0 || jj > CY) continue; sm += T[jj]; w++; } RW[j] = sm / w; } }
    for (let f = 0; f < 2; f++) {
      const s = f ? -1 : 1, M = f ? this.back : this.front, O = f ? this.outB : this.outF;
      for (let j = 0; j <= CY; j++) for (let i = 0; i <= CX; i++) {
        const k = 3 * cid(f, i, j); let x = X[k], y = X[k + 1];
        if (y < 0.03) { y = 0.03; X[k + 1] = 0.03; const kp = k; X[kp] = this.Xp[kp] + 0.3 * (X[kp] - this.Xp[kp]); X[kp + 2] = this.Xp[kp + 2] + 0.3 * (X[kp + 2] - this.Xp[kp + 2]); x = X[k]; }
        if (j === CY) X[k + 1] += 0.35 * (H - y);
        if (yr(j) < 0.3 && y > 0.03) { X[k + 1] += 0.3 * (0.03 - y); y = X[k + 1]; }   // the bottom, turned under, lies on the floor   // the hem, held up round the contents (by them, and the cord)
        if (yr(j) > H - CHAN - 1e-6 && this.rimCap) {   // ... but it gives under a band lying over it
          const fx = Math.min(GX - 1.001, Math.max(0, ((x - X0) / (X1 - X0)) * (GX - 1))), ii = Math.floor(fx), a = fx - ii;
          const o = f * GX, cap = this.rimCap[o + ii] * (1 - a) + this.rimCap[o + ii + 1] * a - (H - yr(j));
          if (X[k + 1] > cap) { X[k + 1] = Math.max(cap, 0.5); y = X[k + 1]; }
        }
        const seam = i === 0 || i === CX || j === 0;
        if (seam) {   // the seams keep outside the bands' edges
          if (this.seamCl && (i === 0 || i === CX) && yr(j) > 0.6) {   // (not the corners' own turn-under: pushed out, they curl up)
 const fy = Math.min(GY - 1.001, Math.max(0, (y / Y1) * (GY - 1))), jj = Math.floor(fy), a = fy - jj;
            const sx = i ? 1 : -1, o = i ? GY : 0, cl = this.seamCl[o + jj] * (1 - a) + this.seamCl[o + jj + 1] * a;
            if (cl > 0 && sx * x < cl) X[k] = sx * cl; }
          continue;
        }
        let o = s * X[k + 2];
        const pil = this.fill(x / RW[j], y);
        if (o < pil) o += 0.22 * (pil - o);   // the fullness: soft, it gives into folds
        const cont = this.at(M, x, y);
        if (o < cont) o = cont;               // what is in it: hard
        const lim = this.at(O, x, y);
        if (o > lim) o = Math.max(lim, cont + 0.02);
        if (o < 0.03) o = 0.03;               // the panels never pass each other
        X[k + 2] = s * o;
      }
    }
    // the bottom tucked under the pouch, its corners rounded in: below 2 cm the cloth may not reach out past the sides
    // just above it (nor, lying on the floor, past the front and back above it); the spare cloth folds in, not out into
    // a flat skirt with a pointed corner
    { let jr = 0; while (jr < CY && yr(jr) < 2.2) jr++;
      for (let f = 0; f < 2; f++) for (let j = 0; j < jr; j++) { const t = Math.max(0, yr(j)) / 2.2, ca = 0.25 + 0.75 * Math.sqrt(t * (2 - t));
        for (let i = 0; i <= CX; i++) { const k = 3 * cid(f, i, j), kr = 3 * cid(f, i, jr), kre = 3 * cid(f, i < CX / 2 ? 0 : CX, jr);
          const xm = Math.abs(X[kre]) - (1 - ca) * 1.6;   // (the corner rounded off, as a filled pouch's is)
          if (Math.abs(X[k]) > xm) X[k] = Math.sign(X[k]) * xm;
          const zm = Math.abs(X[kr + 2]) * (0.55 + 0.45 * ca) + 0.05;
          if (Math.abs(X[k + 2]) > zm) X[k + 2] = Math.sign(X[k + 2]) * zm; } } }
    // the drawn-in mouth: the channel rows round an oval as long as the cord (the gathers hold the hole open, round)
    if ((this.tight || 0) > 0.01) {
      const L = 2 * WR * this.gather, r = L / (2 * Math.PI), a = r * 1.25, b = r * 0.72, kq = 0.25 * smooth01(this.tight);
      for (let f = 0; f < 2; f++) for (let j = 0; j <= CY; j++) { if (yr(j) <= H - CHAN - 1e-6) continue;
        for (let i = 0; i <= CX; i++) { const k = 3 * cid(f, i, j), x = X[k], z = X[k + 2];
          const th = Math.atan2(z / b, x / a), tx = a * Math.cos(th), tz = b * Math.sin(th);
          X[k] += kq * (tx - x); X[k + 2] += kq * (tz - z); } }
    }
    // the seams: the two panels' points are one
    const sew = (a, b) => { a *= 3; b *= 3; for (let d = 0; d < 3; d++) { const m = 0.5 * (X[a + d] + X[b + d]); X[a + d] = m; X[b + d] = m; } };
    for (let j = 0; j <= CY; j++) { sew(cid(0, 0, j), cid(1, 0, j)); sew(cid(0, CX, j), cid(1, CX, j)); }
    for (let i = 1; i < CX; i++) sew(cid(0, i, 0), cid(1, i, 0));
  }
  // the panels' outline (half-width by height), measured off the seams
  outline(y, side = 0) {   // (side: -1 the left seam, 1 the right, 0 the wider)
    const X = this.X; if (!X) return this.halfWidth(y);
    let best = 0, bd = 1e9;
    for (let j = 0; j < CY; j++) {
      const a = 3 * cid(0, 0, j), b = 3 * cid(0, 0, j + 1), ya = X[a + 1], yb = X[b + 1];
      if ((y - ya) * (y - yb) <= 0 && Math.abs(yb - ya) > 1e-6) {
        const t = (y - ya) / (yb - ya), l = Math.abs(X[a] + (X[b] - X[a]) * t);
        const a2 = 3 * cid(0, CX, j), b2 = 3 * cid(0, CX, j + 1), r = Math.abs(X[a2] + (X[b2] - X[a2]) * t);
        return side < 0 ? l : side > 0 ? r : Math.max(l, r);
      }
      const d = Math.abs(y - ya); if (d < bd) { bd = d; best = Math.max(Math.abs(X[a]), Math.abs(X[3 * cid(0, CX, j)])); }
    }
    return best;
  }

  // a step: the contents read again (unless they haven't moved), the cloth stepped on, the mesh redrawn
  update(world, still = false) {
    if (!still) this.sample(world);
    if (!this.X) this.initSim();
    this.setGather();
    const mv = this.substep(6);
    this.quiet = mv < 0.01 ? this.quiet + 1 : 0;
    if (!still) this.age = 0; else this.age = (this.age || 0) + 1;
    this.moving = this.quiet < 6 && this.age < 150;
    this.draw();
  }
  // settle for up to `ms` (after the bands are placed), then draw
  settle(world, ms) {
    this.sample(world); if (!this.X) this.initSim(); this.setGather();
    const t0 = performance.now(); let n = 0;
    while (performance.now() - t0 < ms) { const mv = this.substep(6); n++; this.quiet = mv < 0.01 ? this.quiet + 1 : 0; if (this.quiet >= 6) break; }
    this.age = 0; this.moving = this.quiet < 6;
    this.draw();
  }
  draw() {
    const P = this.pos, X = this.X, H = POUCH.H, WI = this.wI, WJ = this.wJ, rest = this.geometry.attributes.rest.array;
    const T = this._rowTmp ??= new Float32Array(3 * (CX + 1));
    for (let f = 0; f < 2; f++) {
      const s = f ? -1 : 1;
      for (let j = 0; j <= NY; j++) {
        const [js, jw] = WJ[j];
        for (let i = 0; i <= CX; i++) { let x = 0, y = 0, z = 0; for (let q = 0; q < 4; q++) { const k = 3 * cid(f, i, js[q]); x += jw[q] * X[k]; y += jw[q] * X[k + 1]; z += jw[q] * X[k + 2]; } T[3 * i] = x; T[3 * i + 1] = y; T[3 * i + 2] = z; }
        for (let i = 0; i <= NX; i++) {
          const [is, iw] = WI[i]; let x = 0, y = 0, z = 0;
          for (let q = 0; q < 4; q++) { const k = 3 * is[q]; x += iw[q] * T[k]; y += iw[q] * T[k + 1]; z += iw[q] * T[k + 2]; }
          const v = f * (NX + 1) * (NY + 1) + j * (NX + 1) + i, xr = rest[2 * v], yrr = rest[2 * v + 1];
          // sewn detail, in the cloth: the seam under the channel, the channel puffed round the cord, the hem's rolled lip
          const edge = smooth01((WR / 2 - Math.abs(xr)) / 1.0);
          const lip = smooth01((yrr - (H - 0.3)) / 0.3);
          const w = (1 - (this.tight || 0)) * (0.2 * Math.exp(-(((yrr - (H - 1.05)) / 0.55) ** 2)) - 0.12 * Math.exp(-(((yrr - (H - 2.1)) / 0.07) ** 2)) - 0.2 * lip * lip) * edge;
          const k = 3 * v; P[k] = x; P[k + 1] = Math.max(0, y); P[k + 2] = (i === 0 || i === NX || j === 0) ? z : z + s * w;
          if (!(i === 0 || i === NX || j === 0)) {   // the drawn surface (smoothed between the simulated points) kept over the contents and under what lies on it
            let o = s * P[k + 2]; const cont = this.at(f ? this.back : this.front, x, y), lim = this.at(f ? this.outB : this.outF, x, y);
            if (o > lim) o = Math.max(lim, cont + 0.02); if (o < cont + 0.02 && cont > 0) o = cont + 0.02; if (o < 0.015) o = 0.015;
            P[k + 2] = s * o;
          }
        }
      }
    }
    // the surface, front, as a height field (the cord is laid on it)
    // the gathers drawn soft: across the channel (and the band of cloth just under it) each point eased towards its
    // neighbours' average (Catmull-Rom over a sharp fold overshoots into spikes)
    if ((this.tight || 0) > 0.01) for (let f = 0; f < 2; f++) { const o = f * (NX + 1) * (NY + 1), row = this._smRow ??= new Float32Array(3 * (NX + 1));
      for (let j = Math.floor(NY * (1 - 6 / HR)); j <= NY; j++) { const np = j > NY * (1 - 2.4 / HR) ? 6 : 3; for (let pass = 0; pass < np; pass++) {
        for (let i = 0; i <= NX; i++) { const k = 3 * (o + j * (NX + 1) + i); row[3 * i] = P[k]; row[3 * i + 1] = P[k + 1]; row[3 * i + 2] = P[k + 2]; }
        for (let i = 1; i < NX; i++) { const k = 3 * (o + j * (NX + 1) + i); for (let d = 0; d < 3; d++) P[k + d] = 0.5 * row[3 * i + d] + 0.25 * (row[3 * (i - 1) + d] + row[3 * (i + 1) + d]); } } } }
    // drawn in, the gathers kept soft: round the neck, each point's distance out from the middle (on the cord's oval)
    // eased towards its neighbours', its direction kept, so the ruffles are shallower and rounder without the neck
    // shrinking (the coarse simulation folds the cloth in a few deep pleats where cloth makes many small ones)
    if ((this.tight || 0) > 0.01) {
      const L = 2 * WR * this.gather, r0 = L / (2 * Math.PI), ea = r0 * 1.25, eb = r0 * 0.72, rho = this._rho ??= new Float32Array(NX + 1), th = this._th ??= new Float32Array(NX + 1), tmp = this._rt ??= new Float32Array(NX + 1);
      for (let f = 0; f < 2; f++) { const o = f * (NX + 1) * (NY + 1);
        for (let j = Math.floor(NY * (1 - 5 / HR)); j <= NY; j++) {
          const yv = H - HR + (j / NY) * HR, wr = smooth01((yv - (H - CHAN - 2.5)) / 2.5) * smooth01(this.tight); if (wr <= 0) continue;
          for (let i = 0; i <= NX; i++) { const k = 3 * (o + j * (NX + 1) + i); rho[i] = Math.hypot(P[k] / ea, P[k + 2] / eb); th[i] = Math.atan2(P[k + 2] / eb, P[k] / ea); }
          for (let i = 1; i <= NX; i++) { while (th[i] - th[i - 1] > Math.PI) th[i] -= 2 * Math.PI; while (th[i] - th[i - 1] < -Math.PI) th[i] += 2 * Math.PI; }   // (unwrapped)
          const t0 = th.slice();
          for (let pass = 0; pass < 16; pass++) { tmp.set(rho); for (let i = 1; i < NX; i++) rho[i] = 0.5 * tmp[i] + 0.25 * (tmp[i - 1] + tmp[i + 1]);
            tmp.set(th); for (let i = 1; i < NX; i++) th[i] = 0.5 * tmp[i] + 0.25 * (tmp[i - 1] + tmp[i + 1]); }   // (and round the neck: no pleat folded back over its neighbour)
          // above the cord the hem's frill flares out a little, as gathered cloth does over a drawstring
          const flare = 1 + 0.3 * smooth01((yv - (H - 1.0)) / 1.0) * smooth01(this.tight);
          for (let i = 1; i < NX; i++) { const k = 3 * (o + j * (NX + 1) + i), r1 = Math.hypot(P[k] / ea, P[k + 2] / eb), rn = (r1 + wr * (rho[i] - r1)) * flare, tn = t0[i] + wr * (th[i] - t0[i]);
            P[k] = ea * rn * Math.cos(tn); P[k + 2] = eb * rn * Math.sin(tn); }
        } }
    }
    // (and the back's, for checks)
    const SF = this.surf ??= new Float32Array(GX * GY), SB = this.surfB ??= new Float32Array(GX * GY); SF.fill(0); SB.fill(0);
    for (let f = 0; f < 2; f++) { const M = f ? SB : SF, sg = f ? -1 : 1, o = f * (NX + 1) * (NY + 1);
      for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) { const k = 3 * (o + j * (NX + 1) + i);
        const gi = Math.round(((P[k] - X0) / (X1 - X0)) * (GX - 1)), gj = Math.round((P[k + 1] / Y1) * (GY - 1));
        if (gi >= 0 && gi < GX && gj >= 0 && gj < GY && sg * P[k + 2] > M[gj * GX + gi]) M[gj * GX + gi] = sg * P[k + 2]; } }
    this.geometry.attributes.position.needsUpdate = true;
    const sk = 3 * cid(0, CX, CY - 2), sig = Math.round(this.surfaceAt(8, H - 4, 0) * 10) + ':' + Math.round(this.outline(H - 0.6) * 10) + ':' + (this.close || 0) + ':' + Math.round(X[sk] * 5) + ':' + Math.round(X[sk + 2] * 5);
    if (sig !== this._cordSig) { this._cordSig = sig; this.buildCord(); }
    this.gridNormals();
    this.geometry.computeBoundingBox(); this.geometry.computeBoundingSphere();
  }
  // normals straight off the grid (central differences; a tenth of the cost of the general routine)
  gridNormals() {
    const P = this.pos, N = this.geometry.attributes.normal.array, row = NX + 1;
    for (let f = 0; f < 2; f++) { const s = f ? -1 : 1, o = f * row * (NY + 1);
      for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
        const l = 3 * (o + j * row + Math.max(0, i - 1)), r = 3 * (o + j * row + Math.min(NX, i + 1));
        const d = 3 * (o + Math.max(0, j - 1) * row + i), u = 3 * (o + Math.min(NY, j + 1) * row + i);
        const ax = P[r] - P[l], ay = P[r + 1] - P[l + 1], az = P[r + 2] - P[l + 2], bx = P[u] - P[d], by = P[u + 1] - P[d + 1], bz = P[u + 2] - P[d + 2];
        let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; const L = s / (Math.hypot(nx, ny, nz) || 1);
        const k = 3 * (o + j * row + i); N[k] = nx * L; N[k + 1] = ny * L; N[k + 2] = nz * L;
      } }
    // the seams drawn round, not as a slit: the two panels' normals there shared (where the neck is drawn in, all the way
    // down the gathered part; elsewhere only half way)
    const row2 = NX + 1, ob = row2 * (NY + 1), tg = this.tight || 0;
    for (let j = 0; j <= NY; j++) { const yv = P[3 * (j * row2) + 1], k2 = yv > POUCH.H - 6 ? 0.5 + 0.5 * tg : 0.5;
      for (const i of [0, NX]) { const a = 3 * (j * row2 + i), b = 3 * (ob + j * row2 + i);
        for (let d = 0; d < 3; d++) { const m = 0.5 * (N[a + d] + N[b + d]); N[a + d] += k2 * (m - N[a + d]); N[b + d] += k2 * (m - N[b + d]); } } }
    this.geometry.attributes.normal.needsUpdate = true;
  }
  surfaceAt(x, y, f = 0) { const M = f ? this.surfB : this.surf; return M ? this.at(M, x, y) : 0; }

  // the drawstring: out of the channel at the top right, over the edge and down to a knot, its two ends hanging
  buildCord() {
    for (const o of [...this.cordGroup.children]) { o.geometry.dispose(); this.cordGroup.remove(o); }
    const H = POUCH.H, r = 0.2;
    const side = (y, dx = 0, z = 0.25) => { const x = this.outline(y, 1) + r + 0.03 + dx; return [x, y, Math.max(z, this.surfaceAt(x - r, y) + 0.05)]; };   // against the seam
    // out of the channel at the right seam: it starts inside the cloth (the channel), so its end never shows
    let jc = CY; while (jc > 0 && yr(jc) > H - 1.0) jc--;
    const sk = 3 * cid(0, CX, jc), sx = this.X ? this.X[sk] : this.outline(H - 1.0, 1), sy = this.X ? this.X[sk + 1] : H - 1.0, sz = this.X ? this.X[sk + 2] : 0;
    // the knot: the cord runs into it, and both tails come out of it (their ends hidden in it, not cut short above it)
    const K = side(H - 8.0, 0.32, 0.4);
    const path = new THREE.CatmullRomCurve3([
      [sx - 1.0, sy, sz], [sx - 0.2, sy - 0.05, sz + 0.1], [sx + r + 0.08, sy - 0.4, sz + 0.2], side(sy - 1.4, 0.05, 0.3), side(H - 4.0, 0, 0.3), side(H - 6.0, 0, 0.25), side(H - 7.4, 0.15, 0.3), K,
    ].map((p) => new THREE.Vector3(...p)));
    const cord = new THREE.Mesh(new THREE.TubeGeometry(path, 96, r, 12, false), this.cordMat);
    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.3, 0.2, 128, 16, 2, 3), this.cordMat);
    knot.position.set(...K); knot.rotation.set(0.35, 0.25, 0.6);
    const tails = [[K, side(H - 8.7, 0.18, 0.3), side(H - 9.7, 0.12), side(H - 10.8, 0.1)], [K, side(H - 8.75, 0.5, 0.2), side(H - 9.6, 0.68, 0.12), side(H - 10.4, 0.75, 0.15)]]
      .map((t) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(t.map((p) => new THREE.Vector3(...p))), 24, r, 12, false), this.cordMat));
    const ends = tails.map((t, k) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), this.cordMat); e.position.copy(t.geometry.parameters.path.getPoint(1)); return e; });
    for (const o of [cord, knot, ...tails, ...ends]) { o.castShadow = true; o.receiveShadow = true; this.cordGroup.add(o); }
  }
  bounds() { return new THREE.Box3(new THREE.Vector3(-POUCH.hw - 3, 0, -3.6), new THREE.Vector3(POUCH.hw + 3.2, POUCH.H, 3.6)); }
}

function frameOf(q, o, k) {
  const x = q[k], y = q[k + 1], z = q[k + 2], w = q[k + 3];
  o[0] = 1 - 2 * (y * y + z * z); o[1] = 2 * (x * y + z * w); o[2] = 2 * (x * z - y * w);
  o[3] = 2 * (x * y - z * w); o[4] = 1 - 2 * (x * x + z * z); o[5] = 2 * (y * z + x * w);
  o[6] = 2 * (x * z + y * w); o[7] = 2 * (y * z - x * w); o[8] = 1 - 2 * (x * x + y * y);
  return o;
}
