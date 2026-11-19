// The resistance bands' studio light, and the camera colour they are rendered with (light and cheap: no path tracing).
// - The light: a white cove, softboxes and a dark ceiling, as one environment map (made here, once per light change),
//   which lights the bands and decides the floor shadow's light directions, so the two agree.
// - The colour: a camera's tone curve (each channel on its own, with its saturation), fitted to the product photo.
import * as THREE from 'three';

const DEG = Math.PI / 180;
const dirAzEl = (az, el) => new THREE.Vector3(Math.sin(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), Math.cos(az * DEG) * Math.cos(el * DEG));
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- the studio's light
// A product studio: a white cove (floor and back wall, lit), grey side walls, a dark ceiling; a large overhead
// scrim and a key softbox in the light's direction (az, el; soft widens it), a white bounce card opposite the key and
// two tall strip lights to the sides, a little behind, for the lines of light along the bands' edges.
// Radiance is scaled so a white surface facing up would read `level` (before exposure), whatever the light's position:
// a high-key product shot, its white floor blown out and the bands' lit faces bright (as in the product photo).
export function studioLight({ az = 8, el = 50, soft = 0.6, key = 1, level = 1.0 } = {}, W = 512, H = 256) {
  const boxes = [];
  const box = (d, hw, hh, L, f) => {
    const t1 = new THREE.Vector3(0, 1, 0).cross(d); if (t1.lengthSq() < 1e-6) t1.set(1, 0, 0); t1.normalize();
    const t2 = new THREE.Vector3().crossVectors(d, t1).normalize();
    boxes.push({ d, t1, t2, tw: Math.tan(hw * DEG), th: Math.tan(hh * DEG), L, f });
  };
  const keyHalf = 9 + 17 * soft;
  box(dirAzEl(az, 82), 34, 34, 1.4, 0.35);                      // overhead scrim
  box(dirAzEl(az, el), keyHalf, keyHalf, 7.5 * key, 0.18);      // key softbox (key: the Key light slider)
  box(dirAzEl(az + 180, 16), 36, 20, 1.3, 0.35);                // bounce card opposite the key
  box(dirAzEl(az + 100, 14), 4.5, 30, 1.8, 0.25);               // strip lights, to the sides and a little behind
  box(dirAzEl(az - 104, 14), 4.5, 30, 1.5, 0.25);
  const room = (d) => {
    const y = d.y;
    if (y < 0) return 0.62;                                       // the white floor, lit (hidden by the floor in the photo render)
    // the cove's back wall: white paper behind the subject, bright low down; grey side walls; a dark ceiling
    const back = smooth(-0.2, -0.75, d.z) * (1 - smooth(0.25, 0.75, y));
    const wall = 0.5 - 0.3 * smooth(0.0, 0.85, y);   // bright enough to fill the bands' upright faces softly
    return wall + back * 0.42;
  };
  const data = new Float32Array(W * H * 4), d = new THREE.Vector3();
  const lum = new Float64Array(W * H);   // radiance, for the normalisation
  for (let r = 0; r < H; r++) {
    const v = (r + 0.5) / H, y = -Math.cos(Math.PI * v), sy = Math.sqrt(Math.max(0, 1 - y * y));
    for (let c = 0; c < W; c++) {
      const phi = ((c + 0.5) / W - 0.5) * 2 * Math.PI;
      d.set(Math.cos(phi) * sy, y, Math.sin(phi) * sy);
      let L = room(d);
      for (const b of boxes) {
        const k = d.dot(b.d); if (k <= 0) continue;
        const x = Math.abs(d.dot(b.t1) / k) / b.tw, z = Math.abs(d.dot(b.t2) / k) / b.th;
        if (x >= 1 || z >= 1) continue;
        // feathered edges, a little brighter in the middle, like a real diffuser
        L += b.L * (1 - smooth(1 - b.f, 1, x)) * (1 - smooth(1 - b.f, 1, z)) * (1 - 0.18 * (x * x + z * z));
      }
      lum[r * W + c] = L;
      data[4 * (r * W + c)] = data[4 * (r * W + c) + 1] = data[4 * (r * W + c) + 2] = L; data[4 * (r * W + c) + 3] = 1;
    }
  }
  // irradiance on a face looking up: E = sum L cos dw; scale so E / pi = 1
  let E = 0;
  const dOmega = (r) => { const v0 = r / H, v1 = (r + 1) / H; return (2 * Math.PI / W) * (Math.cos(Math.PI * v0) - Math.cos(Math.PI * v1)); };
  for (let r = 0; r < H; r++) {
    const y = -Math.cos(Math.PI * (r + 0.5) / H), dw = dOmega(r);
    if (y > 0) for (let c = 0; c < W; c++) E += lum[r * W + c] * y * dw;
  }
  const scale = (level * Math.PI) / E;
  for (let i = 0; i < data.length; i += 4) { data[i] *= scale; data[i + 1] *= scale; data[i + 2] *= scale; }
  const texture = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter; texture.generateMipmaps = false;
  texture.needsUpdate = true;
  // a direction for the floor shadow's n-th sample: from the key softbox or the overhead scrim. Only those two: the
  // walls, the bounce card and the low strip lights reach the floor from all round and low down, and as shadow they
  // only drew long, faint streaks across the white floor, which a studio photo never shows. A floating band casts a
  // soft shadow below it, pushed a little away from the key.
  const halton = (i, b) => { let f = 1, x = 0; while (i > 0) { f /= b; x += f * (i % b); i = Math.floor(i / b); } return x; };
  // The overhead light casts most of it (from a 24-degree patch of the scrim, almost straight above), the key a quarter:
  // by their light it would be half each, but floating 10-50 cm up, the bands' key shadows land far behind them, long
  // and thin; a product photo keeps the shadow soft and under the subject.
  const top = { d: dirAzEl(az, 86), tw: Math.tan(24 * DEG), th: Math.tan(24 * DEG) };
  top.t1 = new THREE.Vector3(0, 1, 0).cross(top.d).normalize(); top.t2 = new THREE.Vector3().crossVectors(top.d, top.t1).normalize();
  // Floating, the key's share is dropped (wKey 0): its shadow landed as a second, separate one well behind each band.
  // A product photo shows one soft shadow under each.
  const casters = [{ b: boxes[1] }, { b: top }];
  const sample = (i, wKey = 0.25) => {
    const { b } = casters[(i * 0.6180339887) % 1 < wKey ? 0 : 1];
    const x = (2 * halton(i, 2) - 1) * b.tw, z = (2 * halton(i, 3) - 1) * b.th;
    const d = b.d.clone().addScaledVector(b.t1, x).addScaledVector(b.t2, z).normalize();
    if (d.y < 0.05) { d.y = 0.05; d.normalize(); }
    return d;
  };
  // the live shadow's few directions, while the bands move (each blurred, they merge into one soft shadow): the
  // centres of the overhead patch's four quarters, and the key's centre for its share. One direction alone missed the
  // shadow of the bands' upright faces, which only the slanting light catches
  const liveDirs = (wKey = 0.25) => {
    const out = [];
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      out.push({ d: top.d.clone().addScaledVector(top.t1, 0.5 * sx * top.tw).addScaledVector(top.t2, 0.5 * sz * top.th).normalize(), w: (1 - wKey) / 4 });
    }
    if (wKey > 0) out.push({ d: boxes[1].d.clone(), w: wKey });
    return out;
  };
  return { texture, sample, liveDirs, dispose: () => texture.dispose() };
}

// ---------------------------------------------------------------- a camera's tone curve
// Each channel on its own, linear up to a knee, then a soft shoulder to white: as a camera renders bright colours (a
// lit yellow stays a clean lemon, its blue channel low), unlike the studio's hue-preserving Neutral tone mapping,
// which bleaches them towards white. Used for the bands (renderer.toneMapping = THREE.CustomToneMapping).
// Before the curve, the camera's saturation (CAMERA_SAT): 1.0. At 1.2 the blue's red channel fell to a third of the
// photo's and it rendered cyan; at 1.0 the lit tops of the lying-flat bands are within a few levels of the photo.
const CAMERA_CURVE = `#define CAMERA_SAT 1.0
vec3 CustomToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	float luma = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
	color = max( vec3( luma ) + CAMERA_SAT * ( color - vec3( luma ) ), 0.0 );
	const float knee = 0.72;
	vec3 shoulder = knee + ( 1.0 - knee ) * ( 1.0 - exp( - ( color - knee ) / ( 1.0 - knee ) ) );
	return mix( color, shoulder, step( knee, color ) );
}`;
export function installCameraCurve() {
  const k = 'tonemapping_pars_fragment', hook = 'vec3 CustomToneMapping( vec3 color ) { return color; }';
  if (THREE.ShaderChunk[k].includes(hook)) THREE.ShaderChunk[k] = THREE.ShaderChunk[k].replace(hook, CAMERA_CURVE);
}
