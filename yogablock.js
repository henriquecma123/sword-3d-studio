// Sword yoga block: a block of EVA foam, built in code from the brand's renders (Yoga block/: three-quarter views from
// the front right and the front left, and one straight on). Units: centimetres.
// - Size 23 x 16.3 x 7.5 cm: width over height from the straight-on view (1.41); the depth and the chamfer from the
//   three-quarter view (its faces' and chamfers' widths across, and its perspective: taken from 26 degrees to the
//   right, 8 above, about 1.5 m away).
// - Every edge chamfered at 45 degrees, K each way (0.65 cm), with a small facet where three
//   chamfers meet. The surface is a smooth maximum of the cutting planes (R): moulded foam has no sharp edges, so the
//   chamfers' own edges are eased and catch the light softly.
// - EVA foam: matte, a faint sheen at grazing angles; a fine stipple and scattered pinholes in its skin, a slight
//   mottle in the colour. All procedural, in the block's own space: no seams, no tiling, sharp at any size.
// - The logo printed on the front and on the back (each reading from its own side) in a pale ink, a third of the
//   width across, centred, 0.23 cm below the middle. Its mask (assets/yoga-block-logo.png) is the 2026 logo from the
//   brand guidelines PDF, drawn by macOS's PDF renderer at 12x (the wordmark: the d's slanted top, the letters'
//   rounded corners) with the symbol as exact circles (as the box's, fitbit-offline/box/logo2026.py); the ink's box
//   spans LOGO_INK of the texture's width, centred.
// Local frame: x along the width (the logo reads along +x), y up the height (standing, as in the renders), z out of
// the front (the logo's face). Centred on the block.
import * as THREE from 'three';

export const BLOCK = {
  W: 23, H: 16.3, D: 7.5,
  K: 0.65,           // chamfer, each way
  CORNER: 0.25,      // the facet where three chamfers meet: this far past their common point (the renders' corners are round)
  R: 0.02,           // softness of every crease (the smooth maximum's scale): eased, still a crisp chamfer
  logo: { w: 0.327, dy: -0.23 },   // ink width over the block's width; its centre below the middle, cm
};
// colours (sRGB): the foam and the ink, matched to the renders under the studio's block light (see LIGHTING.block)
export const BLOCK_COLORS = { foam: '#4464b0', ink: '#e1e9fe' };
// the foam's skin: stipple (height, cm, at two scales), pinholes (cell, cm; share of cells with one; radius range, in
// cells), mottle (brightness, at two scales)
// the logo mask's size, px, and the share of its width the ink spans (6 pt margins round 561.24 x 136.53 pt)
const LOGO_TEX = [3072, 796], LOGO_INK = 0.97907;
const SKIN = { grain: [0.0016, 0.0007], freq: [17, 43], pitCell: 0.22, pitShare: 0.5, pitR: [0.05, 0.11], pitDepth: 0.012, mottle: [0.035, 0.02] };

// ---------------------------------------------------------------- geometry
function cutPlanes() {
  const { W, H, D, K, CORNER } = BLOCK, a = W / 2, b = H / 2, c = D / 2, r2 = Math.SQRT1_2, r3 = 1 / Math.sqrt(3), P = [];
  for (const s of [-1, 1]) P.push([s, 0, 0, a], [0, s, 0, b], [0, 0, s, c]);
  for (const s of [-1, 1]) for (const t of [-1, 1]) P.push([s * r2, t * r2, 0, (a + b - K) * r2], [s * r2, 0, t * r2, (a + c - K) * r2], [0, s * r2, t * r2, (b + c - K) * r2]);
  const m = 1.5 * K + CORNER;   // the three chamfers meet at (a, b, c) - K/2: the corner facet cuts just past it
  for (const s of [-1, 1]) for (const t of [-1, 1]) for (const u of [-1, 1]) P.push([s * r3, t * r3, u * r3, (a + b + c - m) * r3]);
  return P;
}
// the smooth maximum of the planes' signed distances (R log sum exp) at p, and its gradient (the surface normal)
function field(P, x, y, z, g) {
  const R = BLOCK.R, n = P.length, e = field.e || (field.e = new Float64Array(64));
  let mx = -Infinity;
  for (let i = 0; i < n; i++) { const p = P[i]; e[i] = (p[0] * x + p[1] * y + p[2] * z - p[3]) / R; if (e[i] > mx) mx = e[i]; }
  let s = 0, gx = 0, gy = 0, gz = 0;
  for (let i = 0; i < n; i++) { const w = Math.exp(e[i] - mx), p = P[i]; s += w; gx += w * p[0]; gy += w * p[1]; gz += w * p[2]; }
  g[0] = gx / s; g[1] = gy / s; g[2] = gz / s;
  return R * (mx + Math.log(s));
}
// positions across a face, -h to h: fine within 1.1 cm of either edge (the chamfer and its eased creases), coarse between
function ticks(h) {
  const band = 1.1, nf = 28, mid = 2 * (h - band), nm = Math.max(1, Math.ceil(mid / 0.6)), t = [];
  for (let i = 0; i < nf; i++) t.push(-h + (band * i) / nf);
  for (let i = 0; i < nm; i++) t.push(-h + band + (mid * i) / nm);
  for (let i = 0; i <= nf; i++) t.push(h - band + (band * i) / nf);
  return t;
}
// each face of the box is sampled on its grid, and each sample moved along its ray from the centre onto the surface
// (Newton's method on the field). Neighbouring faces sample their shared edge alike, so the seams close exactly.
function blockGeometry() {
  const { W, H, D } = BLOCK, P = cutPlanes(), h = [W / 2, H / 2, D / 2], T = h.map(ticks), g = [0, 0, 0];
  const pos = [], nor = [], idx = [];
  for (let ax = 0; ax < 3; ax++) for (const s of [-1, 1]) {
    const u = (ax + 1) % 3, v = (ax + 2) % 3, Tu = T[u], Tv = T[v], base = pos.length / 3;
    for (let j = 0; j < Tv.length; j++) for (let i = 0; i < Tu.length; i++) {
      const p = [0, 0, 0]; p[ax] = s * h[ax]; p[u] = Tu[i]; p[v] = Tv[j];
      let t = 1;
      for (let it = 0; it < 12; it++) {
        const f = field(P, t * p[0], t * p[1], t * p[2], g), df = g[0] * p[0] + g[1] * p[1] + g[2] * p[2];
        const dt = f / df; t -= dt; if (Math.abs(dt) < 1e-7) break;
      }
      field(P, t * p[0], t * p[1], t * p[2], g);
      const gl = Math.sqrt(g[0] * g[0] + g[1] * g[1] + g[2] * g[2]);
      pos.push(t * p[0], t * p[1], t * p[2]); nor.push(g[0] / gl, g[1] / gl, g[2] / gl);
    }
    // (u, v, ax) is right-handed, so the grid's (i, j) winds anticlockwise seen from +ax; flipped for the -ax face
    const nu = Tu.length;
    for (let j = 0; j < Tv.length - 1; j++) for (let i = 0; i < nu - 1; i++) {
      const a = base + j * nu + i, b = a + 1, c = a + nu, d = c + 1;
      if (s > 0) idx.push(a, b, d, a, d, c); else idx.push(a, d, b, a, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  return geo;
}

// ---------------------------------------------------------------- the foam
const NOISE_GLSL = /* glsl */`
float ybHash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float ybNoise( vec3 x ) {
  vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( ybHash( i ), ybHash( i + vec3( 1.0, 0.0, 0.0 ) ), f.x ), mix( ybHash( i + vec3( 0.0, 1.0, 0.0 ) ), ybHash( i + vec3( 1.0, 1.0, 0.0 ) ), f.x ), f.y ),
              mix( mix( ybHash( i + vec3( 0.0, 0.0, 1.0 ) ), ybHash( i + vec3( 1.0, 0.0, 1.0 ) ), f.x ), mix( ybHash( i + vec3( 0.0, 1.0, 1.0 ) ), ybHash( i + 1.0 ), f.x ), f.y ), f.z );
}
// pinholes: small spheres (one in some cells) that the skin cuts through, so each shows as a round pit of its own size.
// p in cells; fw: a pixel's size in cells. Returns (how much of the pixel is pit, the pit's depth 0-1 at its centre)
vec2 ybPits( vec3 p, float fw ) {
  vec3 ip = floor( p ), o = step( 0.5, p - ip ) * 2.0 - 1.0;   // the nearer neighbour on each axis
  float cov = 0.0, dep = 0.0;
  for ( int k = 0; k < 8; k++ ) {
    vec3 c = ip + o * vec3( float( k & 1 ), float( ( k >> 1 ) & 1 ), float( ( k >> 2 ) & 1 ) );
    if ( ybHash( c + 3.7 ) > uPit.y ) continue;
    vec3 f = vec3( ybHash( c ), ybHash( c + 19.19 ), ybHash( c + 47.47 ) );
    float r = mix( uPit.z, uPit.w, ybHash( c + 9.1 ) ), d = length( p - c - f );
    float aa = max( fw, 1e-4 );
    // fades out when far smaller than a pixel (no sparkle)
    float a = smoothstep( r + aa, r - aa, d ) * smoothstep( 0.25, 0.8, r / aa );
    cov = max( cov, a ); dep = max( dep, a * ( 1.0 - d * d / ( r * r ) ) );
  }
  return vec2( cov, dep );
}
vec3 ybBump( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir ) {
  vec3 sx = normalize( dFdx( surf_pos ) ), sy = normalize( dFdy( surf_pos ) ), R1 = cross( sy, surf_norm ), R2 = cross( surf_norm, sx );
  float det = dot( sx, R1 ) * faceDir; vec3 grad = sign( det ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
  return normalize( abs( det ) * surf_norm - grad );
}`;

function foamMaterial(logoTex) {
  const { W, H, D, logo } = BLOCK;
  const inkW = logo.w * W, texW = inkW / LOGO_INK, texH = texW * LOGO_TEX[1] / LOGO_TEX[0], cx = 0;
  const mat = new THREE.MeshPhysicalMaterial({
    // a soft sheen and the skin's reflection at grazing angles whiten the faces seen edge-on (the top, the far chamfers),
    // as in the renders; seen square on, the foam is its own matte blue
    color: new THREE.Color(BLOCK_COLORS.foam), roughness: 0.6, metalness: 0, specularIntensity: 1, ior: 1.5,
    sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color('#c9d3ec'),
  });
  const U = {
    uLogo: { value: logoTex }, uLogoRect: { value: new THREE.Vector4(cx, logo.dy, texW, texH) }, uFrontZ: { value: D / 2 },
    uInk: { value: new THREE.Color(BLOCK_COLORS.ink) },
    uGrain: { value: new THREE.Vector4(SKIN.grain[0], SKIN.grain[1], SKIN.freq[0], SKIN.freq[1]) },
    uPit: { value: new THREE.Vector4(SKIN.pitCell, SKIN.pitShare, SKIN.pitR[0], SKIN.pitR[1]) }, uPitDepth: { value: SKIN.pitDepth },
    uMottle: { value: new THREE.Vector2(...SKIN.mottle) },
    uFloorY: { value: -1e4 },   // world height of the floor: the foam darkens close to it (it sees less of the floor's bounce)
  };
  mat.userData.uniforms = U;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;\nvarying vec3 vObjN;\nvarying vec3 vWorldP;\nvarying vec3 vWorldN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position; vObjN = normal; vWorldP = ( modelMatrix * vec4( position, 1.0 ) ).xyz; vWorldN = normalize( mat3( modelMatrix ) * normal );');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vObj;
varying vec3 vObjN;
varying vec3 vWorldP;
varying vec3 vWorldN;
uniform sampler2D uLogo;
uniform vec4 uLogoRect;
uniform float uFrontZ;
uniform vec3 uInk;
uniform vec4 uGrain;
uniform vec4 uPit;
uniform float uPitDepth;
uniform vec2 uMottle;
uniform float uFloorY;
${NOISE_GLSL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
  float ybFw = length( fwidth( vObj ) );   // a pixel's size on the block, cm
  vec2 ybPit = ybPits( vObj / uPit.x, ybFw / uPit.x );
  // the printed logo, on the front and on the back, its ink over the foam's skin. Each reads the right way round seen
  // from its own side (the back's x mirrored), the same way up and at the same height
  float ybSide = vObj.z >= 0.0 ? 1.0 : -1.0;
  vec2 ybUv = vec2( ( ybSide * vObj.x - uLogoRect.x ) / uLogoRect.z + 0.5, ( vObj.y - uLogoRect.y ) / uLogoRect.w + 0.5 );
  // (sampled everywhere, then masked: a sample inside a branch loses its mipmap level at the branch's edge)
  float ybIn = step( 0.6, ybSide * vObjN.z ) * step( uFrontZ - 0.3, abs( vObj.z ) ) * step( 0.0, ybUv.x ) * step( ybUv.x, 1.0 ) * step( 0.0, ybUv.y ) * step( ybUv.y, 1.0 );
  float ybInk = ybIn * texture2D( uLogo, clamp( ybUv, 0.0, 1.0 ) ).r;   // a grey mask: white is ink
  {
    float m = uMottle.x * ( ybNoise( vObj * 0.9 + 3.1 ) - 0.5 ) * 2.0 + uMottle.y * ( ybNoise( vObj * 5.0 ) - 0.5 ) * 2.0;
    // the stipple, in the colour too (at both its scales: the renders' faces show it as a fine, even grain)
    float st = ( ybNoise( vObj * uGrain.z ) - 0.5 ) * ( 1.0 - smoothstep( 0.3, 1.0, ybFw * uGrain.z ) ) * 0.16
             + ( ybNoise( vObj * uGrain.w + 5.3 ) - 0.5 ) * ( 1.0 - smoothstep( 0.3, 1.0, ybFw * uGrain.w ) ) * 0.12;
    diffuseColor.rgb *= ( 1.0 + m ) * ( 1.0 + st ) * ( 1.0 - 0.42 * ybPit.x );
    diffuseColor.rgb = mix( diffuseColor.rgb, uInk * ( 1.0 + 0.5 * m ) * ( 1.0 + 0.6 * st ) * ( 1.0 - 0.25 * ybPit.x ), ybInk * 0.96 );   // the ink follows the skin
  }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = clamp( roughnessFactor * ( 1.0 + 0.16 * ( ybNoise( vObj * 2.2 + 11.0 ) - 0.5 ) ) + 0.18 * ybPit.x, 0.0, 1.0 );
  roughnessFactor = mix( roughnessFactor, 0.5, ybInk * 0.85 );   // the ink is a little smoother than the foam`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    // the skin's height, cm: the stipple at two scales (faded when finer than a pixel) and the pits; the ink fills the
    // finest stipple a little. Its slope per cm along the screen's x and y, so the same at any distance
    vec3 sp = - vViewPosition;
    float g1 = ( ybNoise( vObj * uGrain.z ) - 0.5 ) * uGrain.x * ( 1.0 - smoothstep( 0.3, 1.0, ybFw * uGrain.z ) );
    float g2 = ( ybNoise( vObj * uGrain.w + 5.3 ) - 0.5 ) * uGrain.y * ( 1.0 - smoothstep( 0.3, 1.0, ybFw * uGrain.w ) ) * ( 1.0 - 0.6 * ybInk );
    float gh = g1 + g2 - uPitDepth * ybPit.y;
    vec2 dH = vec2( dFdx( gh ) / max( length( dFdx( sp ) ), 1e-7 ), dFdy( gh ) / max( length( dFdy( sp ) ), 1e-7 ) );
    normal = ybBump( sp, normal, dH, faceDirection );
  }`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
  {
    // close to the floor the foam sees less of its bright bounce (the floor round the block is in its shadow)
    float h = max( vWorldP.y - uFloorY, 0.0 ), ny = normalize( vWorldN ).y;
    float fo = 1.0 - 0.65 * exp( - h / 1.4 ) * ( 0.5 - 0.5 * ny );
    reflectedLight.indirectDiffuse *= fo; reflectedLight.indirectSpecular *= mix( 1.0, fo, 0.7 );
    #ifdef USE_SHEEN
      sheenSpecularIndirect *= fo;   // the sheen too (else the bottom chamfer glows with the floor's light)
    #endif
  }`);
  };
  mat.customProgramCacheKey = () => 'sword-yoga-foam-3';
  return mat;
}

export function createBlockMaterials(maxAniso = 8) {
  const logoTex = new THREE.TextureLoader().load(new URL('./assets/yoga-block-logo.png', import.meta.url).href);
  logoTex.anisotropy = maxAniso; logoTex.colorSpace = THREE.NoColorSpace;
  return { foam: foamMaterial(logoTex), logoTex };
}
// the floor's world height (the foam's contact shading)
export function setBlockFloor(BM, y) { BM.foam.userData.uniforms.uFloorY.value = y; }

export function buildBlock(BM) {
  const g = new THREE.Group(); g.name = 'yoga-block';
  const mesh = new THREE.Mesh(blockGeometry(), BM.foam);
  mesh.name = 'yoga-block-foam'; mesh.castShadow = false; mesh.receiveShadow = false;   // convex: nothing of it shades the rest (the floor's shadow is the studio's)
  g.add(mesh);
  return g;
}

// standing: on its long, narrow face, the logo to the front (as in the renders); flat: the logo up; end: on its end,
// standing tall, the logo to the front reading upwards. The studio then sets it on the floor
export function poseBlock(g, pose) {
  const m = g.children[0];
  m.rotation.set(0, 0, 0);
  if (pose === 'flat') m.rotation.x = -Math.PI / 2;
  else if (pose === 'end') m.rotation.z = Math.PI / 2;
  m.position.set(0, 0, 0);
  g.userData.pose = pose;
}
