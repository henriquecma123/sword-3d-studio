// Procedural 6.3" Pro-style iPhone. Units: centimetres.
// Local frame matches the tablet: x right (seen from the front), y up, z = 0 at the back glass, z = T at the cover glass.
import * as THREE from 'three';
import { rrContour, shapeFromPts, loft, arc, orientToNormals } from './geometry.js';

const N = 3; // superellipse exponent: Apple-style continuous corners

export const PHONE = {
  W: 7.15, H: 14.96, T: 0.825, R: 1.55,
  edge: 0.075,                       // frame round-over, front and back
  lip: 0.1,                          // titanium visible on the front before the glass starts
  glassRise: 0.03,                   // 2.5D cover glass stands proud of the frame
  display: { w: 6.69, h: 14.54, r: 1.33 },
  cam: { size: 3.68, r: 1.25, inset: 0.3, plateau: 0.11, ring: 0.2 },
};

export const FINISHES = {
  white:   { name: 'White Titanium',   frame: '#d9d7d2', back: '#efeeea', plateau: '#e6e4df', band: '#cfcdc7' },
  natural: { name: 'Natural Titanium', frame: '#b7b0a6', back: '#c6c1b8', plateau: '#bcb6ac', band: '#a39d94' },
  desert:  { name: 'Desert Titanium',  frame: '#c4a68b', back: '#cfb59d', plateau: '#c6aa91', band: '#b09781' },
  black:   { name: 'Black Titanium',   frame: '#4b4a47', back: '#38383a', plateau: '#303032', band: '#2f2f30' },
  spaceblack: { name: 'Space Black',   frame: '#2c2c2e', back: '#1e1e20', plateau: '#1a1a1c', band: '#232325' },
  deepblue:  { name: 'Deep Blue',       frame: '#2e3648', back: '#323a4d', plateau: '#2c3445', band: '#262d3c' },
};

// ---------- procedural textures ----------
function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

// fine directional streaks for the brushed titanium (streaks run along u = around the band)
function brushedTexture(size = 512) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d'); const img = ctx.createImageData(size, size);
  const rnd = rng(11);
  for (let y = 0; y < size; y++) {
    const row = rnd(), row2 = rnd();
    for (let x = 0; x < size; x++) {
      const v = 0.8 + 0.13 * row + 0.05 * row2 * Math.sin((x / size) * Math.PI * 2 * 3 + row * 6) + (rnd() - 0.5) * 0.05;
      const o = (y * size + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.max(0, Math.min(255, v * 255));
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 4, 2.2);
  t.anisotropy = 8;
  return t;
}

// True Tone flash: Fresnel diffuser rings over a warm-white LED
function flashTexture(size = 256) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d'), c = size / 2;
  ctx.fillStyle = '#e9e5dc'; ctx.fillRect(0, 0, size, size);
  for (let i = 18; i > 0; i--) {
    const r = (i / 18) * c;
    const g = ctx.createRadialGradient(c, c, r * 0.9, c, c, r);
    g.addColorStop(0, i % 2 ? '#efebe2' : '#dcd7cc'); g.addColorStop(1, i % 2 ? '#d6d1c6' : '#ece8df');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.fill();
  }
  const led = ctx.createRadialGradient(c, c, 0, c, c, c * 0.32);
  led.addColorStop(0, 'rgba(246,222,150,0.85)'); led.addColorStop(1, 'rgba(246,222,150,0)');
  ctx.fillStyle = led; ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// soft occlusion decals (black with an alpha falloff)
function aoRingTexture(inner, size = 256) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d'), c = size / 2;
  const g = ctx.createRadialGradient(c, c, c * inner, c, c, c);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.35, 'rgba(0,0,0,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(cv);
}
function aoPlateauTexture(size = 512) {
  const { size: s, r, inset } = { ...PHONE.cam, inset: 0.3 };
  const px = size / (s + 2 * inset);
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  // draw the plateau far off-canvas and keep only its blurred shadow
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 0.09 * px; ctx.shadowOffsetX = size * 2;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.roundRect(inset * px - size * 2, inset * px, s * px, s * px, r * 0.75 * px); ctx.fill();
  return new THREE.CanvasTexture(cv);
}

// ---------- materials ----------
export function createPhoneMaterials(M) {
  const brushed = brushedTexture();
  const band = { value: new THREE.Color() };
  const frame = new THREE.MeshPhysicalMaterial({
    metalness: 1, roughness: 0.36, roughnessMap: brushed, bumpMap: brushed, bumpScale: 0.025,
    specularIntensity: 1,
  });
  // antenna bands: thin plastic breaks in the titanium band, masked in object space
  frame.onBeforeCompile = (sh) => {
    sh.uniforms.uBand = band;
    sh.uniforms.uHalf = { value: new THREE.Vector2(PHONE.W / 2, PHONE.H / 2) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vLocal;
uniform vec3 uBand; uniform vec2 uHalf;
float bandAt(float d, float w){ return 1.0 - smoothstep(w - 0.004, w + 0.004, abs(d)); }
float antennaMask(vec3 p){
  float side = step(uHalf.x - 0.35, abs(p.x));
  float topE = step(uHalf.y - 0.35, p.y);
  float m = side * bandAt(abs(p.y) - (uHalf.y - 1.9), 0.045);
  return max(m, topE * bandAt(p.x + 1.4, 0.045));
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float bandM = antennaMask(vLocal);
diffuseColor.rgb = mix(diffuseColor.rgb, uBand, bandM);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.55, bandM);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, 0.0, bandM);`);
  };
  frame.customProgramCacheKey = () => 'iphone-frame';
  frame.userData.band = band;

  const back = new THREE.MeshPhysicalMaterial({   // matte textured glass: soft sheen, fine frosted grain
    roughness: 0.5, roughnessMap: M.white.userData.grain, bumpMap: M.white.userData.grain, bumpScale: 0.015,
    specularIntensity: 1, ior: 1.5, sheen: 0.25, sheenRoughness: 0.6,
  });
  const plateau = new THREE.MeshPhysicalMaterial({ roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02, specularIntensity: 1 });
  // lens rings: polished, colour-matched metal
  const ring = new THREE.MeshPhysicalMaterial({ metalness: 1, roughness: 0.12, specularIntensity: 1 });
  const gasket = new THREE.MeshStandardMaterial({ color: '#050506', roughness: 0.6 });
  const barrel = new THREE.MeshPhysicalMaterial({ color: '#09090b', roughness: 0.5, specularIntensity: 0.6 });
  const retainer = new THREE.MeshPhysicalMaterial({ color: '#2a2b30', metalness: 0.8, roughness: 0.38 });
  const cavity = new THREE.MeshBasicMaterial({ color: '#010102' });
  const innerLens = new THREE.MeshPhysicalMaterial({
    color: '#04050a', roughness: 0.08, clearcoat: 0.6, clearcoatRoughness: 0.0, specularIntensity: 0.7,
    iridescence: 0.55, iridescenceIOR: 1.3, iridescenceThicknessRange: [260, 340],
  });
  const pupil = new THREE.MeshPhysicalMaterial({ color: '#010103', roughness: 0.1, clearcoat: 1 });
  // reflection-only glass: black base added on top, so only the specular term shows over what is beneath
  const glassLayer = (opts) => new THREE.MeshPhysicalMaterial({
    color: '#000000', metalness: 0, roughness: 0.0, specularIntensity: 1, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, ...opts,
  });
  const cover = glassLayer({ ior: 1.77 });                                                   // sapphire
  const coating = glassLayer({ ior: 1.55, roughness: 0.03, specularIntensity: 0.8, iridescence: 0.7, iridescenceIOR: 1.3, iridescenceThicknessRange: [240, 330] }); // AR coated element
  const flash = new THREE.MeshPhysicalMaterial({ map: flashTexture(), roughness: 0.45 });
  const lidar = new THREE.MeshPhysicalMaterial({ color: '#060608', roughness: 0.25, specularIntensity: 0.6 });
  const sapphire = new THREE.MeshPhysicalMaterial({ roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, specularIntensity: 1 });
  const decal = (tex) => new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, toneMapped: false });
  const aoRing = decal(aoRingTexture(0.765 / (0.765 + 0.16)));
  const aoPlateau = decal(aoPlateauTexture());
  const screw = new THREE.MeshPhysicalMaterial({ color: '#7a7a7d', metalness: 1, roughness: 0.4 });
  const screen = M.screen.clone();
  return { frame, back, plateau, ring, gasket, barrel, retainer, cavity, innerLens, pupil, cover, coating, flash, lidar, sapphire, aoRing, aoPlateau, screw, screen };
}

export function setFinish(P, key) {
  const f = FINISHES[key];
  P.frame.color.set(f.frame);
  P.frame.userData.band.value.set(f.band);
  P.ring.color.set(f.frame).offsetHSL(0, 0, 0.04);
  P.back.color.set(f.back);
  P.plateau.color.set(f.plateau);
  P.sapphire.color.set(f.plateau).multiplyScalar(0.55);
  P.back.sheenColor.set(f.back);
}

// ---------- geometry ----------
export function buildPhone(P, M) {
  const { W, H, T, R, edge: e, lip } = PHONE;
  const group = new THREE.Group();
  group.name = 'iphone';
  const SEG = 26;
  const zF = T - PHONE.glassRise;   // front face of the titanium band
  const zMid = zF / 2;
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); group.add(m); return m; };
  const contour = (inset) => rrContour(W - 2 * inset, H - 2 * inset, R - inset, SEG, N);

  // titanium band: flat back lip -> round-over -> flat side -> round-over -> front lip -> small seat for the glass
  const rings = [];
  rings.push({ z: 0, d: 0.15, nr: 0, nz: -1 });
  arc(rings, e, e, e, 0, Math.PI / 2, 8, (a, cz, cd, r) => ({ z: cz - r * Math.cos(a), d: cd - r * Math.sin(a), nr: Math.sin(a), nz: -Math.cos(a) }));
  arc(rings, zF - e, e, e, 0, Math.PI / 2, 8, (a, cz, cd, r) => ({ z: cz + r * Math.sin(a), d: cd - r * Math.cos(a), nr: Math.cos(a), nz: Math.sin(a) }));
  rings.push({ z: zF, d: lip, nr: 0, nz: 1 });
  rings.push({ z: zF - 0.012, d: lip + 0.004, nr: 0.3, nz: 1 });
  add(loft(W, H, R, SEG, rings, 0, 0, N), P.frame);

  // cover glass with a 2.5D rounded edge
  const g0 = lip + 0.004, gr = PHONE.glassRise + 0.012;
  const glassRings = [];
  arc(glassRings, zF - 0.012, g0 + gr, gr, 0, Math.PI / 2, 10, (a, cz, cd, r) => ({ z: cz + r * Math.sin(a), d: cd - r * Math.cos(a), nr: Math.cos(a), nz: Math.sin(a) }));
  add(loft(W, H, R, SEG, glassRings, 0, 0, N), M.glass);
  const front = new THREE.ShapeGeometry(shapeFromPts(contour(g0 + gr)));
  front.translate(0, 0, T);
  add(front, M.glass);

  // display (rounded, UVs normalised to the panel); no Dynamic Island, so the screen shows whole (user, 2026-11-11)
  const D = PHONE.display;
  const dispGeo = new THREE.ShapeGeometry(shapeFromPts(rrContour(D.w, D.h, D.r, SEG, N)));
  const uv = dispGeo.attributes.uv, pos = dispGeo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / D.w + 0.5, pos.getY(i) / D.h + 0.5);
  dispGeo.translate(0, 0, T + 0.0008);
  add(dispGeo, P.screen).name = 'display';

  // back glass
  const back = new THREE.ShapeGeometry(shapeFromPts(contour(0.15)));
  back.rotateY(Math.PI);
  add(back, P.back);

  // ---- camera plateau (top-left seen from the back = +x in this frame)
  const C = PHONE.cam;
  const pcx = W / 2 - C.inset - C.size / 2, pcy = H / 2 - C.inset - C.size / 2;
  const rT = 0.035;
  const pr = [{ z: 0.003, d: 0, nr: 1, nz: 0 }];
  arc(pr, -(C.plateau - rT), rT, rT, 0, Math.PI / 2, 6, (a, cz, cd, r) => ({ z: cz - r * Math.sin(a), d: cd - r * Math.cos(a), nr: Math.cos(a), nz: -Math.sin(a) }));
  add(loft(C.size, C.size, C.r, 20, pr, pcx, pcy, N), P.plateau);
  const pTop = new THREE.ShapeGeometry(shapeFromPts(rrContour(C.size - 2 * rT, C.size - 2 * rT, C.r - rT, 20, N)));
  pTop.rotateY(Math.PI); pTop.translate(pcx, pcy, -C.plateau);
  add(pTop, P.plateau);

  // flat discs facing out of the back, at height h above the back glass
  const onBack = (geo, x, y, h) => { geo.rotateY(Math.PI); geo.translate(x, y, -h); return geo; };
  // solids of revolution built with y = height above the back glass
  const axial = (geo, x, y) => { geo.rotateX(-Math.PI / 2); geo.translate(x, y, 0); return geo; };
  const lathe = (pts, x, y, mat) => { const g = new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), 128); orientToNormals(g); return add(axial(g, x, y), mat); };
  const cap = (r, sag, h, x, y, mat) => {
    const Rs = (r * r + sag * sag) / (2 * sag), th = Math.asin(r / Rs);
    const g = new THREE.SphereGeometry(Rs, 96, 10, 0, Math.PI * 2, 0, th);
    g.translate(0, h - Rs * Math.cos(th), 0);
    return add(axial(g, x, y), mat);
  };
  const layer = (m) => { m.castShadow = false; m.renderOrder = 2; return m; };

  // soft contact shadow where the plateau meets the back glass
  const aoPad = 0.3;
  const aoGeo = onBack(new THREE.PlaneGeometry(C.size + 2 * aoPad, C.size + 2 * aoPad), pcx, pcy, 0.0006);
  layer(add(aoGeo, P.aoPlateau));

  const ph = C.plateau, top = C.plateau + C.ring;
  const ro = 0.765, ri = 0.615;
  // polished ring: satin outer wall with a slight taper, rounded shoulder, flat top, small inner chamfer
  const ringPts = [[ro, ph - 0.003], [ro, ph + 0.012]];
  for (let i = 0; i <= 10; i++) { const t = (i / 10) * Math.PI / 2; ringPts.push([ro - 0.045 + 0.035 * Math.cos(t), top - 0.035 + 0.035 * Math.sin(t)]); }
  for (let i = 0; i <= 6; i++) { const t = Math.PI / 2 + (i / 6) * Math.PI / 2; ringPts.push([ri + 0.015 + 0.015 * Math.cos(t), top - 0.015 + 0.015 * Math.sin(t)]); }
  ringPts.push([ri, top - 0.03]);
  ringPts[2][0] -= 0.01; // taper starts above the foot

  const lenses = [
    { x: pcx + 0.86, y: pcy + 0.88, el: 0.4 },    // 48 MP Fusion (main)
    { x: pcx + 0.86, y: pcy - 0.88, el: 0.37 },   // 48 MP ultra wide
    { x: pcx - 0.89, y: pcy, el: 0.29 },          // 5x tetraprism telephoto
  ];
  const hc = top - 0.028;   // sapphire cover, just under the ring top
  for (const L of lenses) {
    layer(add(onBack(new THREE.RingGeometry(ro - 0.01, ro + 0.16, 96, 1), L.x, L.y, ph + 0.0005), P.aoRing));
    lathe(ringPts, L.x, L.y, P.ring);
    add(onBack(new THREE.RingGeometry(ri - 0.035, ri + 0.001, 96), L.x, L.y, top - 0.03), P.gasket);
    // stepped black barrel going down into the module
    const e = L.el;
    lathe([[ri - 0.035, top - 0.03], [ri - 0.035, top - 0.05], [e + 0.075, top - 0.05], [e + 0.075, top - 0.068], [e + 0.022, top - 0.068], [e + 0.022, top - 0.08]], L.x, L.y, P.barrel);
    add(onBack(new THREE.RingGeometry(e, e + 0.022, 96), L.x, L.y, top - 0.08), P.retainer);
    // the deeper optics, seen through the front element
    add(onBack(new THREE.CircleGeometry(e + 0.01, 96), L.x, L.y, top - 0.15), P.cavity);
    add(onBack(new THREE.RingGeometry(e * 0.6, e * 0.7, 96), L.x, L.y, top - 0.125), P.retainer);
    cap(e * 0.6, 0.018, top - 0.125, L.x, L.y, P.innerLens);
    add(onBack(new THREE.CircleGeometry(e * 0.2, 48), L.x, L.y, top - 0.125 + 0.0186), P.pupil);
    // front element and sapphire cover: reflection-only layers over the dark interior
    layer(cap(e, 0.03, top - 0.08, L.x, L.y, P.coating));
    layer(add(onBack(new THREE.CircleGeometry(ri - 0.002, 128), L.x, L.y, hc), P.cover));
  }

  // True Tone flash
  const fx = pcx - 0.92;
  add(onBack(new THREE.CircleGeometry(0.27, 64), fx, pcy + 1.26, ph + 0.0008), P.flash);
  add(onBack(new THREE.RingGeometry(0.27, 0.3, 64), fx, pcy + 1.26, ph + 0.0008), P.gasket);
  layer(add(onBack(new THREE.CircleGeometry(0.3, 64), fx, pcy + 1.26, ph + 0.0025), P.cover));
  // LiDAR: dark window with emitter + receiver just visible behind it
  add(onBack(new THREE.CircleGeometry(0.25, 64), fx, pcy - 1.26, ph + 0.0008), P.lidar);
  add(onBack(new THREE.RingGeometry(0.25, 0.275, 64), fx, pcy - 1.26, ph + 0.0008), P.retainer);
  for (const dx of [-0.07, 0.07]) add(onBack(new THREE.CircleGeometry(0.038, 32), fx + dx, pcy - 1.26, ph + 0.0014), P.retainer);
  layer(add(onBack(new THREE.CircleGeometry(0.275, 64), fx, pcy - 1.26, ph + 0.0025), P.cover));
  // microphone
  add(onBack(new THREE.CircleGeometry(0.045, 24), pcx - 0.05, pcy + 1.45, ph + 0.0008), M.hole);

  // ---- side buttons (lengths and positions measured from the top edge)
  const stadium = (w, h) => shapeFromPts(rrContour(w, h, Math.min(w, h) / 2 - 0.0005, 10));
  const toSide = (geo, x, yc) => { geo.rotateZ(Math.PI / 2); geo.rotateY(Math.PI / 2); geo.translate(x, yc, zMid); return geo; };
  const button = (right, fromTop, len) => {
    const geo = new THREE.ExtrudeGeometry(stadium(len, 0.26), { depth: 0.035, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.012, bevelSegments: 4, curveSegments: 10 });
    add(toSide(geo, right ? W / 2 - 0.01 : -W / 2 - 0.025, H / 2 - fromTop - len / 2), P.frame);
  };
  button(false, 2.95, 0.65);   // Action button
  button(false, 4.15, 1.0);    // volume up
  button(false, 5.6, 1.0);     // volume down
  button(true, 4.25, 1.9);     // side button
  // Camera Control: flush sapphire in a polished surround
  const ccY = H / 2 - 10.25;
  add(toSide(new THREE.ShapeGeometry(stadium(1.68, 0.3), 12), W / 2 + 0.0015, ccY), P.ring);
  add(toSide(new THREE.ShapeGeometry(stadium(1.58, 0.22), 12), W / 2 + 0.0025, ccY), P.sapphire);

  // ---- bottom: USB-C, speaker + mic grilles, screws
  const toBottom = (geo, x, dy) => { geo.rotateX(Math.PI / 2); geo.translate(x, -H / 2 - dy, zMid); return geo; };
  const portRing = stadium(0.92, 0.34);
  portRing.holes.push(shapeFromPts(rrContour(0.84, 0.26, 0.1295, 10), THREE.Path));
  add(toBottom(new THREE.ShapeGeometry(portRing, 10), 0, 0.0015), P.ring);
  add(toBottom(new THREE.ShapeGeometry(stadium(0.84, 0.26), 10), 0, 0.001), M.portInner);
  add(toBottom(new THREE.ShapeGeometry(shapeFromPts(rrContour(0.62, 0.065, 0.03, 6))), 0, 0.0015), M.portTongue);
  for (const sx of [1, -1]) {
    for (let i = 0; i < 6; i++) add(toBottom(new THREE.CircleGeometry(0.045, 20), sx * (0.95 + i * 0.19), 0.0015), M.hole);
    add(toBottom(new THREE.CircleGeometry(0.055, 24), sx * 0.66, 0.0015), P.screw);
    add(toBottom(new THREE.CircleGeometry(0.018, 12), sx * 0.66, 0.002), M.hole);
  }

  group.traverse((o) => { if (o.isMesh) { o.castShadow = !o.material.transparent; o.receiveShadow = true; } });
  return group;
}
