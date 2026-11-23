// Sword Bloom pod (the pink one): a pelvic-floor trainer in soft-touch silicone, built in code from the brand's
// renders (Figma "pod" section 3297:2, the purple views; Bloom pod/pink/). Units: centimetres.
// - One seamless sweep: the egg-shaped pod (a solid of revolution), its ribbed neck, and the tail that loops up and
//   back over the pod and ends in a rounded paddle with the power button and its light.
// - The centreline and the radius along it are traced from the side render (Bloom pod/fit/profile.py →
//   bloompod-profile.json): the pod is 3.04 cm across (its 456 px), the rest follows at 150 px/cm (6.9 cm pod,
//   0.78 cm tail flaring to 1.32 cm at the paddle, 30 cm along the whole sweep). The tail lies in the plane of the pod's
//   axis (the top-down render shows it running straight over the pod).
// - Silicone: matte and soft, a fine orange-peel skin (its close-up), a soft sheen at grazing angles, light
//   scattering into the shadows (they stay a clear lilac, never grey). All procedural, in the pod's own space.
// - The power symbol is moulded in relief on the paddle (bump only); the light above it glows white when on.
// Local frame: x along the pod (its nose toward -x), y up (lying on the floor at y 0), z out of the side seen in the
// side render.
import * as THREE from 'three';

const PROFILE = await (await fetch(new URL('./bloompod-profile.json', import.meta.url))).json();

export const BLOOM = {
  sides: 96,
  ribs: { x: [3.67, 3.99, 4.33], amp: 0.035, sigma: 0.045 },   // the neck's three ribs (cm along the pod's axis; measured on the side render), on its top and underside
  podWide: { k: 1.5, from: 0.4, to: 1.0 },   // the pod's width over its height: wider toward its nose, round at the neck (it rests on its flat side; seen from above it is a fuller ellipse than the egg of the side renders). Fitted to the three-quarter renders from above (Bloom pod/fit/camfit.py). from/to: along the pod, 0 nose to 1 neck
  paddle: { len: 5.5, wide: 1.0 },   // the paddle's width over its height toward the tip (1: round; the top-down render's tip is a half circle, as the side render's is)
  icon: { fromTip: 1.85, R: 0.218, w: 0.04, h: 0.026, gap: 36 },   // the power symbol: its centre (cm back from the tip), ring radius, stroke half-width, relief, gap (deg each side)
  led: { fromTip: 1.17, r: 0.064, halo: 0.07 },
};
// colours (sRGB): the silicone, matched to the renders under the studio's Bloom light (LIGHTING.bloom)
export const BLOOM_COLORS = { silicone: '#d6c7dc', scatter: '#cab2d4' };
const SKIN = { grain: [0.0025, 0.0011], freq: [62, 140], mottle: [0.02, 0.012] };   // the pebbled skin of the detail render: cells about 0.015 cm

// ---------------------------------------------------------------- geometry
function arcLengths(P) { const s = [0]; for (let i = 1; i < P.length; i++) s.push(s[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])); return s; }
function podGeometry() {
  const { x, y, r } = PROFILE, n = x.length, S = BLOOM.sides, P = x.map((v, i) => [v, y[i]]), s = arcLengths(P);
  const { ribs } = BLOOM;
  const pos = new Float32Array(n * S * 3), idx = [];
  const T = [], U = [];
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const t = [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; T.push(t); U.push([t[1], -t[0]]);
  }
  const { paddle } = BLOOM, sEnd = s[n - 1];
  for (let i = 0; i < n; i++) {
    const rr = r[i];
    // the neck's ribs: on its straight run (x past the pod, still low), raised bands on its top and underside only
    let rib = 0;
    if (P[i][1] < 2 && i > PROFILE.podEnd) for (const rx of ribs.x) rib += ribs.amp * Math.exp(-0.5 * ((P[i][0] - rx) / ribs.sigma) ** 2);
    // the paddle: wider than it is tall toward the tip
    const k = Math.min(1, Math.max(0, (s[i] - (sEnd - paddle.len)) / paddle.len));
    const { k: pk, from, to } = BLOOM.podWide, tp = Math.min(1, Math.max(0, (i / PROFILE.podEnd - from) / (to - from)));
    const kp = 1 - tp * tp * (3 - 2 * tp);   // full width toward the nose, easing back to round by the neck
    const wide = (1 + (paddle.wide - 1) * k * k * (3 - 2 * k)) * (1 + (pk - 1) * kp);
    for (let j = 0; j < S; j++) {
      const f = (j / S) * Math.PI * 2, c = Math.cos(f), sn = Math.sin(f), q = (i * S + j) * 3;
      const rj = rr + rib * Math.abs(c) ** 3;
      pos[q] = P[i][0] + U[i][0] * rj * c; pos[q + 1] = P[i][1] + U[i][1] * rj * c; pos[q + 2] = rj * sn * wide;
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < S; j++) {
    const a = i * S + j, b = i * S + ((j + 1) % S), c = a + S, d = b + S;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // the two ends close on a point: its ring takes the sweep's own direction there (no pinch)
  const nor = geo.attributes.normal;
  for (const [i, sg] of [[0, -1], [n - 1, 1]]) for (let j = 0; j < S; j++) nor.setXYZ(i * S + j, sg * T[i][0], sg * T[i][1], 0);
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  // where the power symbol and the light sit: on the paddle's top, measured back from the tip along the sweep
  const at = (back) => {
    const want = s[n - 1] - back; let i = 0; while (i < n - 2 && s[i + 1] < want) i++;
    const t = T[i], u = U[i];
    return { p: new THREE.Vector3(P[i][0] + u[0] * r[i], P[i][1] + u[1] * r[i], 0), t: new THREE.Vector3(t[0], t[1], 0), n: new THREE.Vector3(u[0], u[1], 0) };
  };
  geo.userData.icon = at(BLOOM.icon.fromTip); geo.userData.led = at(BLOOM.led.fromTip);
  return geo;
}

// ---------------------------------------------------------------- the silicone
const NOISE_GLSL = /* glsl */`
float bpHash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float bpNoise( vec3 x ) {
  vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( bpHash( i ), bpHash( i + vec3( 1.0, 0.0, 0.0 ) ), f.x ), mix( bpHash( i + vec3( 0.0, 1.0, 0.0 ) ), bpHash( i + vec3( 1.0, 1.0, 0.0 ) ), f.x ), f.y ),
              mix( mix( bpHash( i + vec3( 0.0, 0.0, 1.0 ) ), bpHash( i + vec3( 1.0, 0.0, 1.0 ) ), f.x ), mix( bpHash( i + vec3( 0.0, 1.0, 1.0 ) ), bpHash( i + 1.0 ), f.x ), f.y ), f.z );
}
vec3 bpBump( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir ) {
  vec3 sx = normalize( dFdx( surf_pos ) ), sy = normalize( dFdy( surf_pos ) ), R1 = cross( sy, surf_norm ), R2 = cross( surf_norm, sx );
  float det = dot( sx, R1 ) * faceDir; vec3 grad = sign( det ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
  return normalize( abs( det ) * surf_norm - grad );
}
// the power symbol's relief (0-1) at (u along the paddle toward its tip, v across), cm: a ring open at the top and a
// bar through its gap; flat-topped strokes with a narrow bevel (as in the detail render), round-ended
float bpIcon( vec2 q, float R, float w, float gap, float aa ) {
  float L = length( q ), a = abs( atan( q.y, q.x ) );   // the angle from the bar's direction (+u)
  float d = a > gap ? abs( L - R ) : length( q - R * vec2( cos( gap ), sin( gap ) * sign( q.y ) ) );
  vec2 b = q - vec2( clamp( q.x, 0.54 * R, 1.5 * R ), 0.0 );
  d = min( d, length( b ) );
  float e = max( 0.012, aa );   // the bevel's half-width, cm: a rounded shoulder
  return 1.0 - smoothstep( w - e, w + e, d );
}`;

function siliconeMaterial(geo) {
  const { icon, led } = geo.userData;
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(BLOOM_COLORS.silicone), roughness: 0.52, metalness: 0, specularIntensity: 0.55, ior: 1.41,
    sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ece6f0'),
  });
  const side = new THREE.Vector3().crossVectors(icon.t, icon.n);
  const U = {
    uIconP: { value: icon.p }, uIconT: { value: icon.t }, uIconN: { value: icon.n }, uIconB: { value: side },
    uIcon: { value: new THREE.Vector4(BLOOM.icon.R, BLOOM.icon.w, BLOOM.icon.h, (BLOOM.icon.gap * Math.PI) / 180) },
    uLedP: { value: led.p }, uLedN: { value: led.n }, uLed: { value: new THREE.Vector3(BLOOM.led.r, BLOOM.led.halo, 0) },   // z: on (0-1)
    uGrain: { value: new THREE.Vector4(SKIN.grain[0], SKIN.grain[1], SKIN.freq[0], SKIN.freq[1]) },
    uMottle: { value: new THREE.Vector2(...SKIN.mottle) },
    uScatter: { value: new THREE.Color(BLOOM_COLORS.scatter) },
    uFloorY: { value: -1e4 },
  };
  mat.userData.uniforms = U;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;\nvarying vec3 vObjN;\nvarying vec3 vWorldP;\nvarying vec3 vWorldN;\nvarying vec3 vIconT;\nvarying vec3 vIconB;\nuniform vec3 uIconT;\nuniform vec3 uIconB;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position; vObjN = normal; vWorldP = ( modelMatrix * vec4( position, 1.0 ) ).xyz; vWorldN = normalize( mat3( modelMatrix ) * normal ); vIconT = normalize( normalMatrix * uIconT ); vIconB = normalize( normalMatrix * uIconB );');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vObj;
varying vec3 vObjN;
varying vec3 vWorldP;
varying vec3 vWorldN;
uniform vec3 uIconP; uniform vec3 uIconT; uniform vec3 uIconN; uniform vec3 uIconB; uniform vec4 uIcon;
varying vec3 vIconT; varying vec3 vIconB;
uniform vec3 uLedP; uniform vec3 uLedN; uniform vec3 uLed;
uniform vec4 uGrain; uniform vec2 uMottle; uniform vec3 uScatter; uniform float uFloorY;
${NOISE_GLSL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
  float bpFw = length( fwidth( vObj ) );   // a pixel's size on the pod, cm
  // the power symbol: in the paddle's top, its own plane (the paddle is near straight there)
  vec3 bpD = vObj - uIconP;
  float bpOn = step( 0.5, dot( normalize( vObjN ), uIconN ) ) * step( length( bpD ), 0.6 );
  vec2 bpQ = vec2( dot( bpD, uIconT ), dot( bpD, uIconB ) );
  float bpAa = 0.5 * bpFw, bpE = 0.004;
  float bpH = bpOn * bpIcon( bpQ, uIcon.x, uIcon.y, uIcon.w, bpAa );
  vec2 bpG = bpOn * uIcon.z / ( 2.0 * bpE ) * vec2(
    bpIcon( bpQ + vec2( bpE, 0.0 ), uIcon.x, uIcon.y, uIcon.w, bpAa ) - bpIcon( bpQ - vec2( bpE, 0.0 ), uIcon.x, uIcon.y, uIcon.w, bpAa ),
    bpIcon( bpQ + vec2( 0.0, bpE ), uIcon.x, uIcon.y, uIcon.w, bpAa ) - bpIcon( bpQ - vec2( 0.0, bpE ), uIcon.x, uIcon.y, uIcon.w, bpAa ) );
  // the light: a small window just below the skin, toward the tip
  vec3 bpL = vObj - uLedP;
  float bpLd = length( bpL - dot( bpL, uLedN ) * uLedN ) + 10.0 * max( 0.0, 0.45 - dot( normalize( vObjN ), uLedN ) );
  {
    float m = uMottle.x * ( bpNoise( vObj * 1.3 + 3.1 ) - 0.5 ) * 2.0 + uMottle.y * ( bpNoise( vObj * 6.0 ) - 0.5 ) * 2.0;
    float st = ( bpNoise( vObj * uGrain.z ) - 0.5 ) * ( 1.0 - smoothstep( 0.3, 1.0, bpFw * uGrain.z ) ) * 0.07
             + ( bpNoise( vObj * uGrain.w + 5.3 ) - 0.5 ) * ( 1.0 - smoothstep( 0.3, 1.0, bpFw * uGrain.w ) ) * 0.06;
    diffuseColor.rgb *= ( 1.0 + m ) * ( 1.0 + st );
  }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = clamp( roughnessFactor * ( 1.0 + 0.14 * ( bpNoise( vObj * 3.0 + 11.0 ) - 0.5 ) ) - 0.06 * bpH, 0.0, 1.0 );`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    // the skin's height, cm: the orange peel at two scales (faded when finer than a pixel) and the moulded symbol
    vec3 sp = - vViewPosition;
    float g1 = ( bpNoise( vObj * uGrain.z ) - 0.5 ) * uGrain.x * ( 1.0 - smoothstep( 0.3, 1.0, bpFw * uGrain.z ) );
    float g2 = ( bpNoise( vObj * uGrain.w + 5.3 ) - 0.5 ) * uGrain.y * ( 1.0 - smoothstep( 0.3, 1.0, bpFw * uGrain.w ) );
    float gh = ( g1 + g2 ) * ( 1.0 - 3.2 * bpH * ( 1.0 - bpH ) );   // the skin runs over the symbol, eased on its bevel
    vec2 dH = vec2( dFdx( gh ) / max( length( dFdx( sp ) ), 1e-7 ), dFdy( gh ) / max( length( dFdy( sp ) ), 1e-7 ) );
    normal = bpBump( sp, normal, dH, faceDirection );
    normal = normalize( normal - bpG.x * vIconT - bpG.y * vIconB );   // the raised symbol: its slope, analytic
  }`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
  {
    // close to the floor the silicone sees less of its bounce (the pod's underside, the floor round it in its shadow)
    float h = max( vWorldP.y - uFloorY, 0.0 ), ny = normalize( vWorldN ).y;
    float fo = 1.0 - 0.6 * exp( - h / 0.9 ) * ( 0.5 - 0.5 * ny );
    reflectedLight.indirectDiffuse *= fo; reflectedLight.indirectSpecular *= mix( 1.0, fo, 0.7 );
    #ifdef USE_SHEEN
      sheenSpecularIndirect *= fo;
    #endif
  }`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  {
    // light scattered inside the silicone: the shaded side keeps a clear, saturated lilac, and some of the direct light
    // comes back out past the terminator, tinted by the depth it travelled
    vec3 sc = uScatter / max( max( uScatter.r, uScatter.g ), uScatter.b );
    reflectedLight.indirectDiffuse *= mix( vec3( 1.0 ), sc, 0.22 );
    reflectedLight.indirectDiffuse += 0.12 * sc * reflectedLight.directDiffuse;
  }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  {
    // the light: a white core under the skin and the glow it spreads into the silicone round it
    float core = smoothstep( uLed.x + 0.006 + 0.5 * bpFw, uLed.x - 0.012 - 0.5 * bpFw, bpLd );   // a slightly soft edge (it sits under the skin)
    float halo = exp( - bpLd / uLed.y );
    totalEmissiveRadiance += uLed.z * ( vec3( 9.0 ) * core + vec3( 1.0, 0.97, 1.0 ) * ( 2.6 * halo + 2.0 * halo * halo ) );
  }`);
  };
  mat.customProgramCacheKey = () => 'sword-bloom-silicone-1';
  return mat;
}

export function createBloomMaterials() {
  const geo = podGeometry();
  return { geo, silicone: siliconeMaterial(geo) };
}
export function setBloomFloor(BM, y) { BM.silicone.userData.uniforms.uFloorY.value = y; }
export function setBloomLight(BM, on) { BM.silicone.userData.uniforms.uLed.value.z = on ? 1 : 0; }

export function buildBloom(BM) {
  const g = new THREE.Group(); g.name = 'bloom-pod';
  const mesh = new THREE.Mesh(BM.geo, BM.silicone);
  mesh.name = 'bloom-pod-silicone'; mesh.castShadow = true; mesh.receiveShadow = false;   // casts on the floor; no self-shadow (the key's shadow map drew a hard inset outline on the pod)
  g.add(mesh);
  return g;
}
