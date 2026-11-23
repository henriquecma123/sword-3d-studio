import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RectAreaLightUniformsLib } from './vendor/RectAreaLightUniformsLib.js';
import { DIM, createMaterials, buildTablet, buildStand } from './geometry.js';
import { PHONE, FINISHES, createPhoneMaterials, setFinish, buildPhone } from './iphone.js';
import { BOX, BOX_SCENE, createBoxMaterials, buildBox } from './box.js';
import { BandsRig } from './bands.js';
import { createMBandMaterials, buildMBand, poseMBand } from './mband.js';
import { BLOCK, createBlockMaterials, buildBlock, poseBlock, setBlockFloor } from './yogablock.js';
import { createBloomMaterials, buildBloom, setBloomFloor, setBloomLight } from './bloompod.js';
import { studioLight, installCameraCurve } from './bands-light.js';
import { PAD_SCREENS, PHONE_SCREENS, EXERCISES, VERSION } from './screens.js';
import { drawScoreBar, drawPill, PILL_MAX, scoreBarFonts } from './scorebar.js';
import { drawPhoneScreen } from './phoneui.js';
import { createPhoenix, PHOENIX_MAX } from './phoenix.js';

const $ = (s) => document.querySelector(s);
const DEG = Math.PI / 180;

// device profile: phones/tablets get lighter render targets
const IS_TOUCH = matchMedia('(pointer: coarse)').matches;
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const MAX_PIXEL_RATIO = IS_TOUCH ? 1.75 : 2;
const MAX_CANVAS_AREA = IS_IOS ? 16777216 : 268435456; // iOS Safari caps canvas area at 16.7 MP

// ---------------------------------------------------------------- state
const state = {
  device: 'pad',              // pad | iphone | box | bands | mband | block (the yoga block) | bloom (the Bloom pod)
  boxPose: 'floating',        // box: floating (as in the mockup) | resting (lid up on the floor)
  mbandPose: 'worn',          // M-Band: worn (closed in a loop) | flat (lying flat) | sensor (turned over, sensors up)
  bloomLight: false,          // Bloom pod: its light on or off (the renders show both)
  blockPose: 'standing',      // yoga block: standing (on its long side, as in its renders) | flat (logo up) | end (on its end)
  finish: 'white',            // iPhone finish
  stand: true,
  pose: 'upright',            // when no stand: upright | flat
  lightAz: 38, lightEl: 52,   // degrees, world space (0 = in front of the screen)
  keyIntensity: 1.0,
  envIntensity: 1.0,
  exposure: 1.0,
  shadow: true,
  shadowStrength: 0.55,
  shadowSoftness: 0.6,       // 0..1
  contact: 0.5,              // ambient-occlusion share of the floor shadow (fixed)
  floorGap: 0,               // cm from the device's lowest point down to the floor (each pose keeps its own)
  screenBrightness: 1.0,
  pick: {                     // chosen Figma exercise screen per device
    pad: { g: 'f', ex: 'lunge', age: 'any', eth: 'any', key: '13685-91228' },        // Thrive Pad / Lunge (Figma, 2026-11-20)
    iphone: { g: 'f', ex: 'hip-abduction', age: 'any', eth: 'any', key: '13895-57715' },  // Vision AI / Hip abduction (user, 2026-11-22)
  },
  progress: 80,               // pad score bar fill, 0–100 (+5 reward at 100)
  msg: null,                  // pad Phoenix message; null = the screen's own
  arrows: 'green',            // iPhone arrow status: white | yellow | green
  stage: 'g2',                // green stage: g1 | g2 | g3 | full
  reps: 9,                    // iPhone rep counter, 1–10
  phoenix: { on: false, count: 2, texts: ['Great job!', 'Your form has improved so much'], side: 'right', y: 16 }, // iPhone Phoenix message; y: % from the top
  screenReflect: 0.6,
  fit: 'cover',
  bg: '#ffffff',
  transparent: false,
  aspect: '16:9',
  resolution: 5760,
  format: 'png',
  focal: 70,
};

// ---------------------------------------------------------------- renderer
const viewport = $('#viewport');
const stage = $('#stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = state.exposure;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
stage.appendChild(renderer.domElement);
const maxAniso = renderer.capabilities.getMaxAnisotropy();
installCameraCurve();   // the bands' camera colour (THREE.CustomToneMapping, used for the bands only)

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 16 / 9, 1, 2000);
camera.filmGauge = 36;
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minPolarAngle = 0;
controls.maxPolarAngle = Math.PI;
controls.minDistance = 8;
controls.maxDistance = 600;
controls.zoomSpeed = 0.8;

// ---------------------------------------------------------------- model
const M = createMaterials();
M.white.userData.grain.anisotropy = maxAniso;
const tablet = buildTablet(M);
let stand = new THREE.Group(); // replaced once the worker has meshed it
const P = createPhoneMaterials(M);
setFinish(P, state.finish);
const phone = buildPhone(P, M);
const BM = createBoxMaterials(maxAniso);
const box = buildBox(BM);
const MBM = createMBandMaterials(maxAniso);   // the M-Band: built in code, its weave drawn at load (mband.js)
const mband = buildMBand(MBM);
const BKM = createBlockMaterials(maxAniso);   // the yoga block: built in code, its foam procedural (yogablock.js)
const block = buildBlock(BKM);
const BLM = createBloomMaterials();   // the Bloom pod: built in code from its side render, its silicone procedural (bloompod.js)
const bloom = buildBloom(BLM);
const model = new THREE.Group();
// the resistance bands: simulated (bands.js); their pin handles show on screen only
const bandsRig = new BandsRig(maxAniso);
await bandsRig.init();
bandsRig.camera = camera;   // prints are turned to the camera once a preset settles
model.add(tablet, stand, phone, box, mband, block, bloom, bandsRig.group);
scene.add(model, bandsRig.helpers);
const isPhone = () => state.device === 'iphone';
const isPad = () => state.device === 'pad';
const isBox = () => state.device === 'box';
const isMBand = () => state.device === 'mband';
const isBlock = () => state.device === 'block';
const isBloom = () => state.device === 'bloom';
const isBands = () => state.device === 'bands';
// the hooks can be shown in the image only for the shapes that hang on them (Hanging, Stretched); the tick is kept
// for when one is picked again
let bandHooksWanted = false;
const bandHooksAllowed = () => bandsRig.opts.pos === 'floating' && (bandsRig.opts.shape === 'hang' || bandsRig.opts.shape === 'stretch');
// on screen, the hooks' blue stand-ins and the pins' red handles show only where the hooks are in the image too: with
// the hooks left out (Hanging or Stretched), the view is the image
const bandAids = () => !(bandHooksAllowed() && !bandHooksWanted);
const applyBandAids = () => { bandsRig.setAids(bandAids()); bandsRig.helpers.visible = isBands() && bandAids(); };
// Phoenix message: kept out of the model so the floor-shadow proxy ignores it; follows the phone's pose
const phx = createPhoenix();
scene.add(phx.group);
function syncPhoenix() {
  const P2 = state.phoenix;
  phx.group.visible = isPhone() && P2.on;
  phone.updateMatrixWorld(true);
  phone.matrixWorld.decompose(phx.group.position, phx.group.quaternion, phx.group.scale);
  phx.layout(P2.side, P2.y / 100, PHONE);
  requestRender();
}
function phoenixTexts() {
  const P2 = state.phoenix;
  phx.setTexts(P2.texts.slice(0, P2.count).filter((t) => t.trim()));   // an empty bubble just drops out
  syncPhoenix();
}

// phone vertices (all meshes have identity transforms) used to find how it rests on the floor
let phonePts = null;
function phonePoints() {
  if (phonePts) return phonePts;
  const arr = [];
  phone.traverse((o) => { if (o.isMesh) arr.push(...o.geometry.attributes.position.array); });
  return (phonePts = new Float32Array(arr));
}
// height of the centre of mass above the lowest point for a given orientation
const _m = new THREE.Matrix4();
function restHeight(q) {
  const e = _m.makeRotationFromQuaternion(q).elements, p = phonePoints();
  let min = Infinity;
  for (let i = 0; i < p.length; i += 3) { const y = e[1] * p[i] + e[5] * p[i + 1] + e[9] * p[i + 2]; if (y < min) min = y; }
  return e[9] * PHONE.T / 2 - min;
}

function posePhone() {
  const flat = state.pose === 'flat';
  let q = new THREE.Quaternion().setFromEuler(new THREE.Euler(flat ? -Math.PI / 2 : 0, 0, 0));
  if (flat) {
    // the camera bump props one end up: tilt until the phone settles (lowest centre of mass)
    const axis = new THREE.Vector3(1, 0, 0);
    let best = Infinity, bestQ = q;
    for (let a = -4; a <= 4; a += 0.05) {
      const qq = new THREE.Quaternion().setFromAxisAngle(axis, a * DEG).multiply(q);
      const h = restHeight(qq);
      if (h < best - 1e-7) { best = h; bestQ = qq; }
    }
    q = bestQ;
  }
  phone.quaternion.copy(q);
  phone.position.set(0, 0, 0);
  phone.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(phone, true);
  const c = box.getCenter(new THREE.Vector3());
  phone.position.set(-c.x, -box.min.y + 0.001, -c.z);
}

// the M-Band: closed as if worn and standing on its edge, or lying flat (either face up), on the floor
function poseMBandStudio() {
  poseMBand(mband, state.mbandPose);
  mband.position.set(0, 0, 0);
  mband.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(mband, true), c = b.getCenter(new THREE.Vector3());
  mband.position.set(-c.x, -b.min.y + 0.001, -c.z);
}

// the Bloom pod: lying on the floor as in its renders, the tail looping up over the pod
function poseBloomStudio() {
  bloom.position.set(0, 0, 0);
  bloom.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(bloom, true), c = b.getCenter(new THREE.Vector3());
  bloom.position.set(-c.x, -b.min.y + 0.001, -c.z);
}

// the yoga block: standing on its long side (as in its renders), lying flat or on its end, on the floor
function poseBlockStudio() {
  poseBlock(block, state.blockPose);
  block.position.set(0, 0, 0);
  block.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(block, true), c = b.getCenter(new THREE.Vector3());
  block.position.set(-c.x, -b.min.y + 0.001, -c.z);
}

// the box: floating as in the mockup (its pose and height over the floor), or resting lid up on the floor
function poseBox() {
  const m = box.getObjectByName('box');
  if (state.boxPose === 'resting') { m.quaternion.identity(); m.position.set(0, BOX.H / 2 + 0.001, 0); }
  else { m.quaternion.set(...BOX_SCENE.front.q); m.position.set(...BOX_SCENE.front.p); }
  box.updateMatrixWorld(true);
}

function applyPose() {
  const { H, T } = DIM;
  tablet.visible = isPad();
  phone.visible = isPhone();
  box.visible = isBox();
  mband.visible = isMBand();
  block.visible = isBlock();
  bloom.visible = isBloom();
  bandsRig.group.visible = isBands(); applyBandAids();
  stand.visible = isPad() && state.stand;
  tablet.rotation.set(0, 0, 0);
  const mbFlat = isMBand() && state.mbandPose !== 'worn';
  setShadowFrame(isPhone() ? 11 : isBox() ? 17 : isBands() ? 30 : isMBand() ? (mbFlat ? 19 : 8) : isBlock() ? 16 : isBloom() ? 12 : 19, isPhone() ? 70 : isBox() ? 100 : isBands() ? 130 : isMBand() ? (mbFlat ? 80 : 50) : isBlock() ? 120 : isBloom() ? 90 : 140);
  if (isBands()) {
    // the bands pose themselves (the simulation); a new preset is built by setupBands()
  } else if (isMBand()) {
    poseMBandStudio();
  } else if (isBlock()) {
    poseBlockStudio();
  } else if (isBloom()) {
    poseBloomStudio();
  } else if (isBox()) {
    poseBox();
  } else if (isPhone()) {
    posePhone();
    syncPhoenix();
  } else if (state.stand) {
    tablet.position.set(0, DIM.stand.slotFloor + H / 2, -T / 2);
  } else if (state.pose === 'upright') {
    tablet.position.set(0, H / 2 + 0.001, -T / 2);
  } else {
    // lying on its back, screen up, top edge away from the viewer
    tablet.rotation.x = -Math.PI / 2;
    tablet.position.set(0, 0.001, 0);
  }
  model.updateMatrixWorld(true);
  setFloor(true);
  rebuildShadowProxy();
  resetShadow();
  markShadowDirty();
}

// the floor (the shadow-catching plane) sits floorGap below the device's lowest point; each pose remembers its own
// distance, starting where the pose puts it: on the floor, or the box floating at its mockup's height
const floorGaps = {};
let floorRange = null;   // its slider (bound with the other shadow controls)
const poseKey = () => (isBox() ? `box:${state.boxPose}` : isMBand() ? `mband:${state.mbandPose}` : isBlock() ? `block:${state.blockPose}` : isBloom() ? 'bloom' : isPad() ? `pad:${state.stand ? 'stand' : state.pose}` : `${state.device}:${state.pose}`);
function setFloor(fromPose) {
  if (isBands()) {
    // the bands' floor is their simulation's: fixed at y = 0. The slider sets how high the floating presets hang
    if (fromPose) { state.floorGap = bandsRig.opts.pos === 'floating' ? bandsRig.opts.lift : 0; if (floorRange) { floorRange.el.value = state.floorGap; floorRange.show(); } }
    ground.position.y = accPlane.position.y = -0.001;
    topCam.position.set(0, 200, 0); topCam.lookAt(0, 0, 0);
    groundMat.uniforms.uBlur.value = bandsRig.opts.pos === 'floating' ? 30 : 5;   // texels (0.06 cm): 1.9 cm floating, 0.3 cm on the floor
    return;
  }
  groundMat.uniforms.uBlur.value = 0;
  const low = modelBounds().min.y;
  if (fromPose) {
    state.floorGap = floorGaps[poseKey()] ?? Math.round(Math.max(0, low) * 2) / 2;
    if (floorRange) { floorRange.el.value = state.floorGap; floorRange.show(); }
  }
  const y = low - state.floorGap - 0.001;
  ground.position.y = accPlane.position.y = y;
  setBlockFloor(BKM, y); setBloomFloor(BLM, y);   // the block's foam darkens close to the floor
  topCam.position.set(0, y + 200, 0); topCam.lookAt(0, y, 0);
}

function modelBounds() {
  if (isPhone()) { const b = new THREE.Box3().setFromObject(phone); if (phx.group.visible) b.expandByObject(phx.group); return b; }
  if (isBox()) return new THREE.Box3().setFromObject(box);
  if (isMBand()) return new THREE.Box3().setFromObject(mband);
  if (isBlock()) return new THREE.Box3().setFromObject(block);
  if (isBloom()) return new THREE.Box3().setFromObject(bloom);
  if (isBands()) { const b = bandsRig.bounds(); return b.isEmpty() ? new THREE.Box3(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 20, 10)) : b; }
  const bb = new THREE.Box3().setFromObject(tablet);
  if (state.stand) bb.expandByObject(stand);
  return bb;
}

// ---------------------------------------------------------------- screen content
function makeScreen(w, h, mat) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  mat.emissiveMap = tex;
  return { canvas, tex, mat };
}
const screens = {
  pad: makeScreen(3200, Math.round(3200 * DIM.display.h / DIM.display.w), M.screen),
  iphone: makeScreen(Math.round(3000 * PHONE.display.w / PHONE.display.h), 3000, P.screen),
};
let screenSource = null; // HTMLImageElement | canvas | null (off)

function updateScreen() {
  if (!screens[state.device]) return requestRender();   // the box has no screen
  const { canvas, tex, mat } = screens[state.device];
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const SCREEN_W = canvas.width, SCREEN_H = canvas.height;
  if (screenSource) {
    const iw = screenSource.naturalWidth || screenSource.width, ih = screenSource.naturalHeight || screenSource.height;
    let dw = SCREEN_W, dh = SCREEN_H, dx = 0, dy = 0;
    if (state.fit !== 'stretch') {
      const sc = state.fit === 'cover' ? Math.max(SCREEN_W / iw, SCREEN_H / ih) : Math.min(SCREEN_W / iw, SCREEN_H / ih);
      dw = iw * sc; dh = ih * sc; dx = (SCREEN_W - dw) / 2; dy = (SCREEN_H - dh) / 2;
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(screenSource, dx, dy, dw, dh);
  }
  tex.needsUpdate = true;
  mat.emissiveIntensity = screenSource ? state.screenBrightness : 0;
  requestRender();
}

function loadImage(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
}

// ---------------------------------------------------------------- studio environment
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null;
let bandsStudio = null;   // the bands' studio light (bands-light.js): their environment and the floor shadow's light directions

function dirFromAzEl(az, el) {
  return new THREE.Vector3(Math.sin(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), Math.cos(az * DEG) * Math.cos(el * DEG));
}

const softboxMat = (intensity, feather = 0.08) => new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  uniforms: { uI: { value: intensity }, uF: { value: feather } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `varying vec2 vUv; uniform float uI; uniform float uF;
    void main(){ vec2 d = abs(vUv - 0.5) * 2.0; float e = (1.0 - smoothstep(1.0 - uF * 2.0, 1.0, d.x)) * (1.0 - smoothstep(1.0 - uF * 2.0, 1.0, d.y));
      float c = 1.0 - 0.22 * dot(d, d); gl_FragColor = vec4(vec3(uI * e * c), 1.0); }`,
});

// The box is lit as in its mockup: a key high on the front right (az 60, el 60: the direction of the mockup's floor
// shadow), carrying 40-55% of the light on the faces it reaches, with its softbox and strip lights in the reflections,
// so the box answers when the light moves; a broad fill from the front left (fillAz, relative to the key), a light
// floor bouncing into the faces turned down, soft walls, a dim ceiling and no overhead scrim. Solved in linear light
// so the blueprint's colours still render like the mockup on all six faces (fit/match_box.js, box/compare.py).
const LIGHTING = { default: { room: [0.16, 0.30, 0.62], key: 1 },
  // the bands: a soft, even, bright studio, as in the brand's floating render (the bands face many ways at once)
  bands: { room: [0.6, 0.62, 0.62], key: 0.7, fill: 2.0 },
  box: { room: [0.08, 0.41, 0.98], key: 0.9, envKey: 1, scrim: 0, fillAz: -130, fill: 2.33 },
  // the M-Band, as in its product renders: a soft key and strip lights that the glossy yarn and the satin plastic
  // reflect, over a mid-grey studio (an even, bright one left the yarn and the plastic flat)
  mband: { room: [0.18, 0.42, 0.55], key: 0.75, fill: 1.25, scrim: 0.28 },
  // the yoga block, as in its renders: a soft key from the front left, the fill from the front left too (the faces
  // turned from the key stay a clear, deep blue), a low scrim, and no strip on the far side of the key
  block: { room: [0.42, 0.55, 0.7], key: 0.85, fill: 1.3, fillAz: 45, scrim: 0.55, strips: [0, 1] },
  // the Bloom pod, as in its renders: a bright, soft, near-white studio, the key from above, a soft fill
  bloom: { room: [0.5, 0.46, 0.2], key: 1.0, fill: 0.9, scrim: 0.7 } };
const lighting = () => LIGHTING[state.device in LIGHTING ? state.device : 'default'];

function buildEnvironment() {
  if (isBands()) {
    // the bands' studio: one environment lights them and decides their floor shadow
    bandsStudio?.dispose();
    bandsStudio = studioLight({ az: state.lightAz, el: state.lightEl, soft: state.shadowSoftness, key: state.keyIntensity });
    if (envRT) envRT.dispose();
    envRT = pmrem.fromEquirectangular(bandsStudio.texture);
    scene.environment = envRT.texture;
    return;
  }
  const env = new THREE.Scene();
  // cyclorama: soft grey walls, darker ceiling, bright floor bounce
  const [rTop, rHor, rFloor] = lighting().room.map((v) => v.toFixed(3));
  const room = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vD; void main(){ float y = vD.y;
      vec3 top = vec3(${rTop}), hor = vec3(${rHor}), floorC = vec3(${rFloor});
      vec3 c = y > 0.0 ? mix(hor, top, pow(y, 0.55)) : mix(hor, floorC, pow(-y, 0.35));
      gl_FragColor = vec4(c, 1.0); }`,
  }));
  env.add(room);
  const k = state.keyIntensity * lighting().key * (lighting().envKey ?? 1);
  const add = (w, h, intensity, az, el, dist, feather) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), softboxMat(intensity, feather));
    m.position.copy(dirFromAzEl(az, el).multiplyScalar(dist));
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  // key softbox in the light direction
  add(110, 110, 7.0 * k, state.lightAz, state.lightEl, 150, 0.06);
  // large overhead scrim (a device's lighting can turn it down: the box's has none)
  add(260, 260, 1.6 * (lighting().scrim ?? 1), state.lightAz, 88, 190, 0.2);
  // fill from the opposite side, low and broad (the box's comes from the front left, as in its mockup)
  add(220, 150, 0.9 * (lighting().fill ?? 1), state.lightAz + (lighting().fillAz ?? 180), 18, 200, 0.25);
  // two strip lights for edge definition
  // (a device's lighting can turn either down: the block's renders have no light on the far side of the key)
  add(26, 220, 3.4 * k * (lighting().strips?.[0] ?? 1), state.lightAz + 115, 15, 170, 0.08);
  add(26, 220, 2.6 * k * (lighting().strips?.[1] ?? 1), state.lightAz - 125, 15, 170, 0.08);
  if (envRT) envRT.dispose();
  envRT = pmrem.fromScene(env, 0.0, 1, 1000);
  scene.environment = envRT.texture;
  env.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
}

// direct key light for self-shadowing (tablet on stand etc.)
const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.setScalar(IS_TOUCH ? 2048 : 4096);
const sc = keyLight.shadow.camera;
sc.left = -19; sc.right = 19; sc.top = 19; sc.bottom = -19; sc.near = 1; sc.far = 400;
keyLight.shadow.bias = -0.00015;
keyLight.shadow.normalBias = 0.02;
scene.add(keyLight, keyLight.target);

// real softboxes at a finite distance: light falls off softly across flat faces, as in a studio photo
RectAreaLightUniformsLib.init();
const keyBox = new THREE.RectAreaLight(0xffffff, 1, 70, 70);
const fillBox = new THREE.RectAreaLight(0xffffff, 1, 110, 70);
scene.add(keyBox, fillBox);
function placeBox(light, center, az, el, dist) {
  light.position.copy(center).addScaledVector(dirFromAzEl(az, el), dist);
  light.lookAt(center.x, center.y + 4, center.z);
}

function updateLights() {
  const center = modelBounds().getCenter(new THREE.Vector3());
  keyLight.target.position.copy(center);
  keyLight.position.copy(center).addScaledVector(dirFromAzEl(state.lightAz, state.lightEl), 150);
  keyLight.intensity = 1.5 * state.keyIntensity * lighting().key;
  placeBox(keyBox, center, state.lightAz, state.lightEl, 85);
  placeBox(fillBox, center, state.lightAz + (lighting().fillAz ?? 180), 34, 95);
  keyBox.intensity = 0.55 * state.keyIntensity * lighting().key * (lighting().envKey ?? 1);
  fillBox.intensity = 0.75 * (lighting().fill ?? 1);
  keyLight.shadow.radius = 2 + state.shadowSoftness * 10;
  if (isBands()) keyLight.intensity = keyBox.intensity = fillBox.intensity = 0;   // all in the studio environment
  // the bands render as a camera would (each channel's own shoulder); the other devices keep the Neutral tone mapping
  renderer.toneMapping = isBands() ? THREE.CustomToneMapping : THREE.NeutralToneMapping;
  keyLight.target.updateMatrixWorld();
  buildEnvironment();
  scene.environmentIntensity = state.envIntensity;
  markShadowDirty();
  resetShadow();
}

// ---------------------------------------------------------------- accumulated soft ground shadow
const GROUND = 140;          // cm, side of the shadow-catching plane
const ACC_RES = IS_TOUCH ? 1024 : 2048;
// additive accumulation needs a float target; fall back to 8-bit with 1/255 weights where unsupported
const FLOAT_ACC = renderer.extensions.has('EXT_color_buffer_half_float') || renderer.extensions.has('EXT_color_buffer_float');
const ACC_WEIGHT = FLOAT_ACC ? 1 : 1 / 255;
const accTarget = new THREE.WebGLRenderTarget(ACC_RES, ACC_RES, { type: FLOAT_ACC ? THREE.HalfFloatType : THREE.UnsignedByteType, depthBuffer: true });
// the bands' live shadow, while they move: four directions a frame across the overhead light, their mipmaps blurring
// them into one soft shadow (the full one's 640 samples, redone every frame, cost 24 shadow renders a frame and drew
// each band's shadow two dozen times over). Once they rest the full shadow builds and fades in over it
const LIVE_RES = 1024;
const liveTarget = new THREE.WebGLRenderTarget(LIVE_RES, LIVE_RES, { type: FLOAT_ACC ? THREE.HalfFloatType : THREE.UnsignedByteType, depthBuffer: true, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
let liveDirty = true;
const accScene = new THREE.Scene();
const accLight = new THREE.DirectionalLight(0xffffff, 1);
accLight.castShadow = true;
accLight.shadow.mapSize.set(2048, 2048);
Object.assign(accLight.shadow.camera, { left: -19, right: 19, top: 19, bottom: -19, near: 1, far: 600 });
accLight.shadow.bias = -0.0002;
accLight.shadow.radius = 1;
accScene.add(accLight, accLight.target);
const accPlane = new THREE.Mesh(new THREE.PlaneGeometry(GROUND, GROUND), new THREE.ShadowMaterial({
  color: 0xffffff, opacity: ACC_WEIGHT, transparent: false,
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
  blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
  depthWrite: false, depthTest: false,
}));
accPlane.rotation.x = -Math.PI / 2;
accPlane.receiveShadow = true;
accScene.add(accPlane);
const topCam = new THREE.OrthographicCamera(-GROUND / 2, GROUND / 2, GROUND / 2, -GROUND / 2, 1, 400);
topCam.position.set(0, 200, 0);
topCam.up.set(0, 0, -1);
topCam.lookAt(0, 0, 0);
// tighter shadow frusta for the smaller phone keep its contact shadows crisp
function setShadowFrame(half, size) {
  for (const cam of [keyLight.shadow.camera, accLight.shadow.camera]) {
    Object.assign(cam, { left: -half, right: half, top: half, bottom: -half });
    cam.updateProjectionMatrix();
  }
  Object.assign(topCam, { left: -size / 2, right: size / 2, top: size / 2, bottom: -size / 2 });
  topCam.updateProjectionMatrix();
  ground.scale.setScalar(size / GROUND);
  accPlane.scale.setScalar(size / GROUND);
}
const invisibleMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
let proxy = null;

function rebuildShadowProxy() {
  if (proxy) accScene.remove(proxy);
  proxy = model.clone(true);
  proxy.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = !o.material.transparent;   // decals don't cast
      o.material = invisibleMat;
    }
  });
  accScene.add(proxy);
}

const groundMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { tAcc: { value: accTarget.texture }, uCount: { value: 1 }, uStrength: { value: 0.7 }, uScale: { value: 1 / ACC_WEIGHT }, uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uTexel: { value: 1 / ACC_RES }, uBlur: { value: 0 },
    tLive: { value: liveTarget.texture }, uMix: { value: 1 }, uLiveR: { value: 0 }, uLiveLod: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `varying vec2 vUv; uniform sampler2D tAcc; uniform float uCount; uniform float uStrength; uniform float uScale;
    uniform vec2 uCenter; uniform float uTexel; uniform float uBlur;
    uniform sampler2D tLive; uniform float uMix; uniform float uLiveR; uniform float uLiveLod;
    const vec2 DISK[12] = vec2[12](vec2(-0.326,-0.406),vec2(-0.840,-0.074),vec2(-0.696,0.457),vec2(-0.203,0.621),vec2(0.962,-0.195),vec2(0.473,-0.480),
      vec2(0.519,0.767),vec2(0.185,-0.893),vec2(0.507,0.064),vec2(0.896,0.412),vec2(-0.322,-0.933),vec2(-0.792,-0.598));
    void main(){
      // blur grows with distance from the object: crisp contact, soft far shadow. uBlur (texels), when set, is one blur
      // for the whole floor: the floating bands' shadows are soft everywhere, and their samples' copies would show
      float rad = uTexel * (uBlur > 0.0 ? uBlur : mix(0.8, 7.0, smoothstep(0.02, 0.22, distance(vUv, uCenter))));
      float acc = texture2D(tAcc, vUv).r;
      for (int i = 0; i < 12; i++) acc += texture2D(tAcc, vUv + DISK[i] * rad).r;
      float s = (acc / 13.0) * uScale / max(uCount, 1.0);
      // the bands' live shadow (uMix 0), the full one fading in over it as it builds (uMix to 1)
      if (uMix < 1.0) {
        float l = textureLod(tLive, vUv, uLiveLod).r;
        for (int i = 0; i < 12; i++) l += textureLod(tLive, vUv + DISK[i] * uLiveR, uLiveLod).r;
        s = mix(l / 13.0, s, uMix);
      }
      float edge = 1.0 - smoothstep(0.42, 0.5, max(abs(vUv.x-0.5), abs(vUv.y-0.5)));
      float a = clamp(s * uStrength, 0.0, 1.0) * edge;
      gl_FragColor = vec4(vec3(0.0), a); }`,
});
const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND, GROUND), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0;
ground.renderOrder = -1;
scene.add(ground);

const SHADOW_SAMPLES = FLOAT_ACC ? 640 : 255;
let accCount = 0;

function resetShadow() {
  accCount = 0; ambI = 0; keyI = 0; liveDirty = true;
  groundMat.uniforms.uMix.value = isBands() ? 0 : 1;
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(accTarget);
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, true, true);
  renderer.setRenderTarget(prev);
  groundMat.uniforms.uCount.value = 1;
  requestRender();
}

// low-discrepancy (Halton) samples: far smoother than random for the same sample count
function halton(i, base) { let f = 1, r = 0; while (i > 0) { f /= base; r += f * (i % base); i = Math.floor(i / base); } return r; }
let ambI = 0, keyI = 0;
function sampleDir() {
  // the bands: from their studio's key softbox and overhead scrim, by the light each brings the floor (bands-light.js)
  if (isBands() && bandsStudio) return bandsStudio.sample(++ambI + 7, bandsKeyShare());
  const key = dirFromAzEl(state.lightAz, state.lightEl);
  // golden-ratio interleave decides ambient vs key so both converge evenly
  if (((accCount + 1) * 0.6180339887) % 1 < state.contact) {
    // ambient: cosine-weighted hemisphere, above 12 degrees
    const i = ++ambI;
    const r = Math.sqrt(halton(i, 2)) * Math.cos(12 * DEG), phi = halton(i, 3) * Math.PI * 2;
    return new THREE.Vector3(r * Math.cos(phi), Math.sqrt(1 - r * r), r * Math.sin(phi));
  }
  // area light: directions within a cone around the key
  const i = ++keyI;
  const cone = (2 + state.shadowSoftness * 28) * DEG;
  const t1 = new THREE.Vector3().crossVectors(key, Math.abs(key.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
  const t2 = new THREE.Vector3().crossVectors(key, t1);
  const r = Math.sqrt(halton(i, 2)) * Math.tan(cone), phi = halton(i, 3) * Math.PI * 2;
  const d = key.clone().addScaledVector(t1, r * Math.cos(phi)).addScaledVector(t2, r * Math.sin(phi)).normalize();
  if (d.y < 0.05) d.y = 0.05;
  return d.normalize();
}

// floating, the bands' shadow comes from the overhead light alone: one soft shadow under each band (bands-light.js)
const bandsKeyShare = () => (bandsRig.opts.pos === 'floating' ? 0 : 0.25);
function liveShadow() {
  liveDirty = false;
  if (!bandsStudio) return;
  const b = modelBounds(), center = b.getCenter(new THREE.Vector3());
  // blurred enough at the bands' mean height to merge the four directions' shadows (0.45 h apart: tan 24 = 0.45)
  const R = THREE.MathUtils.clamp(0.3 * Math.max(0, center.y), 0.35, 12), size = ground.scale.x * GROUND, Ruv = R / size;
  groundMat.uniforms.uLiveR.value = Ruv;
  groundMat.uniforms.uLiveLod.value = Math.max(0, Math.log2(Ruv * LIVE_RES * 0.5));
  accLight.target.position.copy(center); accLight.target.updateMatrixWorld();
  const prevTarget = renderer.getRenderTarget(), prevAuto = renderer.autoClear, op = accPlane.material.opacity;
  renderer.setRenderTarget(liveTarget);
  renderer.setClearColor(0x000000, 0); renderer.clear(true, true, true);
  renderer.autoClear = false;
  for (const { d, w } of bandsStudio.liveDirs(bandsKeyShare())) {
    accLight.position.copy(center).addScaledVector(d, 250); accLight.updateMatrixWorld();
    accPlane.material.opacity = w;
    renderer.shadowMap.needsUpdate = true;
    renderer.render(accScene, topCam);
  }
  accPlane.material.opacity = op; renderer.autoClear = prevAuto;
  renderer.setRenderTarget(prevTarget);
}

function accumulate(n) {
  if (accCount >= SHADOW_SAMPLES) return false;
  const center = modelBounds().getCenter(new THREE.Vector3());
  accLight.target.position.copy(center);
  accLight.target.updateMatrixWorld();
  const prevTarget = renderer.getRenderTarget();
  const prevAuto = renderer.autoClear;
  const prevTone = renderer.toneMapping;
  renderer.autoClear = false;
  renderer.setRenderTarget(accTarget);
  // the floor only receives (it never casts), so it cannot shade itself: no device takes a depth bias (0.12 cm of it
  // left a lit, white line of floor along each one's bottom edge)
  accLight.shadow.bias = 0;
  for (let i = 0; i < n && accCount < SHADOW_SAMPLES; i++, accCount++) {
    accLight.position.copy(center).addScaledVector(sampleDir(), 250);
    accLight.updateMatrixWorld();
    renderer.shadowMap.needsUpdate = true;
    renderer.render(accScene, topCam);
  }
  renderer.setRenderTarget(prevTarget);
  renderer.autoClear = prevAuto;
  renderer.toneMapping = prevTone;
  groundMat.uniforms.uCount.value = accCount;
  groundMat.uniforms.uMix.value = isBands() ? THREE.MathUtils.smoothstep(accCount / SHADOW_SAMPLES, 0.15, 1) : 1;
  return true;
}

// ---------------------------------------------------------------- render loop
let dirty = true;
let shadowDirty = true;
function requestRender() { dirty = true; }
function markShadowDirty() { shadowDirty = true; dirty = true; }

// keep the depth range tight around the subject: with a fixed 1 cm near plane, layers a fraction of a millimetre
// apart (screen over cover glass) start to fight when zoomed out, showing up as dark blocks
const _sph = new THREE.Sphere();
function fitClipPlanes() {
  modelBounds().getBoundingSphere(_sph);
  const d = camera.position.distanceTo(_sph.center);
  const reach = Math.max(_sph.radius * 1.5, (ground.scale.x * GROUND) / 2);   // device or its floor shadow, whichever is wider
  const near = THREE.MathUtils.clamp(d - reach * 1.2, 0.5, d * 0.5);
  const far = d + reach * 2 + 100;
  if (Math.abs(near - camera.near) > 1e-3 || Math.abs(far - camera.far) > 1e-3) { camera.near = near; camera.far = far; camera.updateProjectionMatrix(); }
}

function renderMain() {
  fitClipPlanes();
  ground.visible = state.shadow;
  groundMat.uniforms.uStrength.value = state.shadowStrength;
  renderer.shadowMap.needsUpdate = shadowDirty;
  shadowDirty = false;
  phx.prepareBackdrop(renderer, scene, camera);   // frosted glass behind the Phoenix bubbles
  renderer.render(scene, camera);
}

function loop() {
  requestAnimationFrame(loop);
  const moved = controls.update();
  if (moved) { syncCameraUI(); dirty = true; }
  const moving = isBands() && bandsRig.step();
  if (moving) { markShadowDirty(); resetShadow(); }
  if (state.shadow) {
    // the bands: their live shadow while they move, the full one once they rest
    if (isBands() && liveDirty) { liveShadow(); dirty = true; }
    if (!moving && accumulate(IS_TOUCH ? 16 : 24)) dirty = true;
  }
  if (dirty) { renderMain(); dirty = false; }
}

// ---------------------------------------------------------------- viewport sizing
function aspectValue() {
  const [a, b] = state.aspect.split(':').map(Number);
  return a / b;
}
function resize() {
  const r = viewport.getBoundingClientRect();
  const pad = r.width < 600 ? 10 : 28;
  // keep the stage clear of the logo (top) and the hint pill (bottom), staying vertically centred
  const vpad = window.matchMedia('(max-width: 860px)').matches ? 42 : 70;
  const aw = r.width - pad * 2, ah = r.height - vpad * 2;
  const asp = aspectValue();
  let w = aw, h = aw / asp;
  if (h > ah) { h = ah; w = ah * asp; }
  w = Math.max(1, w); h = Math.max(1, h);
  stage.style.width = `${Math.floor(w)}px`;
  stage.style.height = `${Math.floor(h)}px`;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setSize(Math.floor(w), Math.floor(h));
  camera.aspect = asp;
  camera.updateProjectionMatrix();
  updateExportInfo();
  requestRender();
}
new ResizeObserver(resize).observe(viewport);

// ---------------------------------------------------------------- camera helpers
const spherical = new THREE.Spherical();
// camera height: the camera and the point it looks at raised or lowered together, so the view's angle stays and the
// device moves down or up in the frame (as a camera on a stand). In cm from where the view was last framed (camRef);
// the slider's reach follows the device's size
const camRef = new THREE.Vector3().copy(controls.target), camLift = $('#cam-lift');
function setFrameRef() {
  camRef.copy(controls.target);
  const s = modelBounds().getSize(new THREE.Vector3()), reach = THREE.MathUtils.clamp(Math.ceil(Math.max(s.x, s.y, s.z) * 1.5), 10, 80);
  camLift.min = -reach; camLift.max = reach;
}
function setCamLift(h) {
  const d = h - (controls.target.y - camRef.y);
  controls.target.y += d; camera.position.y += d; camera.lookAt(controls.target); controls.update();
  syncCameraUI(); requestRender();
}
function getCamAngles() {
  const off = camera.position.clone().sub(controls.target);
  spherical.setFromVector3(off);
  return { az: THREE.MathUtils.radToDeg(spherical.theta), el: 90 - THREE.MathUtils.radToDeg(spherical.phi), dist: spherical.radius };
}
function setCamAngles(az, el, dist) {
  const cur = getCamAngles();
  dist = dist ?? cur.dist;
  const phi = THREE.MathUtils.clamp((90 - el) * DEG, 0.0001, Math.PI - 0.0001);
  spherical.set(dist, phi, az * DEG);
  camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
  camera.lookAt(controls.target);
  controls.update();
  syncCameraUI();
  requestRender();
}
function fitDistance() {
  const box = modelBounds();
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const vFov = camera.getEffectiveFOV() * DEG;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const fov = Math.min(vFov, hFov);
  return (sphere.radius / Math.sin(fov / 2)) * 0.92;
}
function frame(az, el) {
  const box = modelBounds();
  controls.target.copy(box.getCenter(new THREE.Vector3())); setFrameRef();
  const a = az ?? getCamAngles().az, e = el ?? getCamAngles().el;
  setCamAngles(a, e, fitDistance());
}
// floating starts from the mockup's own camera (its height angle, distance and lens: the same vertical field of view),
// worn: from the front left, a little above, as in its three-quarter photo (the pod's side, its light slit showing past
// the strap); lying flat: from the front, higher
function frameMBand() { if (state.mbandPose === 'worn') frame(-42, 14); else frame(8, 34); }
// the yoga block standing: from the front right and a little above, as in its render (its right side just showing)
// the Bloom pod: its hero render's camera (a 55 mm lens from the front left, just above the floor: fitted to the
// render's silhouette, Bloom pod/fit/camfit.py)
function frameBloom() {
  camera.setFocalLength(55); camera.updateProjectionMatrix();
  state.focal = 55; $('#focal').value = state.focal; $('#focal-v').textContent = `${state.focal} mm`; paintRange($('#focal'));
  frame(-36, 5);
}
function frameBlock() { if (state.blockPose === 'flat') frame(20, 38); else if (state.blockPose === 'end') frame(24, 10); else frame(16, 8); }
// centred on the box; resting starts from the usual three-quarter view
function frameBox() {
  if (state.boxPose === 'resting') return frame(32, 24);
  const S = BOX_SCENE, off = new THREE.Vector3(...S.camera).sub(new THREE.Vector3(...S.target));
  const target = new THREE.Vector3(...S.front.p);
  const mm = THREE.MathUtils.clamp(camera.filmGauge / Math.max(camera.aspect, 1) / 2 / Math.tan((S.fovV / 2) * DEG), 24, 200);
  camera.setFocalLength(mm); camera.updateProjectionMatrix();
  state.focal = Math.round(mm); $('#focal').value = state.focal; $('#focal-v').textContent = `${state.focal} mm`; paintRange($('#focal'));
  controls.target.copy(target); setFrameRef();
  camera.position.copy(target).add(off);
  camera.lookAt(target); controls.update(); syncCameraUI(); requestRender();
}
function setFocal(mm) {
  const before = camera.getEffectiveFOV();
  camera.setFocalLength(mm);
  camera.updateProjectionMatrix();
  // keep the subject the same size on screen (dolly-zoom)
  const ratio = Math.tan(before * DEG / 2) / Math.tan(camera.getEffectiveFOV() * DEG / 2);
  const { az, el, dist } = getCamAngles();
  setCamAngles(az, el, THREE.MathUtils.clamp(dist * ratio, controls.minDistance, controls.maxDistance));
}

// ---------------------------------------------------------------- UI bindings
// sliders fill their track with the brand gradient up to the thumb
function paintRange(el) {
  const p = ((el.value - el.min) / (el.max - el.min)) * 100;
  el.style.setProperty('--p', `${Math.max(0, Math.min(100, p))}%`);
}
function bindRange(id, key, fmt, onChange) {
  const el = $(`#${id}`), out = $(`#${id}-v`);
  const show = () => { if (out) out.textContent = fmt(parseFloat(el.value)); paintRange(el); };
  el.value = state[key] ?? el.value;
  show();
  el.addEventListener('input', () => { if (key) state[key] = parseFloat(el.value); show(); onChange?.(parseFloat(el.value)); });
  return { el, show };
}
const pct = (v) => `${Math.round(v * 100)}%`;
const deg = (v) => `${Math.round(v)}°`;

// camera sliders (not bound to state; mirror the orbit controls)
const camAz = $('#cam-az'), camEl = $('#cam-el'), camDist = $('#cam-dist');
function syncCameraUI() {
  const { az, el, dist } = getCamAngles();
  camAz.value = az; camEl.value = el; camDist.value = dist;
  for (const r of [camAz, camEl, camDist]) paintRange(r);
  $('#cam-az-v').textContent = deg(az);
  $('#cam-el-v').textContent = deg(el);
  $('#cam-dist-v').textContent = `${Math.round(dist)} cm`;
  const lift = controls.target.y - camRef.y;
  camLift.value = lift; paintRange(camLift);
  $('#cam-lift-v').textContent = `${lift > 0.05 ? '+' : ''}${(Math.abs(lift) < 0.05 ? 0 : lift).toFixed(1)} cm`;
}
camAz.addEventListener('input', () => setCamAngles(+camAz.value, +camEl.value));
camEl.addEventListener('input', () => setCamAngles(+camAz.value, +camEl.value));
camDist.addEventListener('input', () => setCamAngles(+camAz.value, +camEl.value, +camDist.value));
camLift.addEventListener('input', () => setCamLift(+camLift.value));
bindRange('focal', 'focal', (v) => `${v} mm`, (v) => setFocal(v));

// highlight the preset in use until the camera is moved by hand
const viewButtons = document.querySelectorAll('[data-view]');
const markView = (btn) => viewButtons.forEach((b) => b.classList.toggle('on', b === btn));
viewButtons.forEach((b) => b.addEventListener('click', () => {
  const [az, el] = b.dataset.view.split(',').map(Number);
  frame(az, el);
  markView(b);
}));
controls.addEventListener('start', () => markView(null));
for (const r of [camAz, camEl, camDist, camLift]) r.addEventListener('input', () => markView(null));
$('#btn-fit').addEventListener('click', () => frame());

// setup
function setSeg(name, value) {
  document.querySelectorAll(`[data-seg="${name}"] button`).forEach((b) => b.classList.toggle('on', b.dataset.value === value));
}
document.querySelectorAll('[data-seg]').forEach((g) => g.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const name = g.dataset.seg, v = b.dataset.value;
  setSeg(name, v);
  if (name === 'device') {
    // the box and the bands keep their own light and floor shadow (their look depends on them); the others share theirs
    // (the yoga block too)
    const own = (d) => d === 'box' || d === 'bands' || d === 'block';
    if (own(state.device) && state.device !== v) { if (state.device === 'box') boxLook = grabLook(); else if (state.device === 'bands') bandsLook = grabLook(); else blockLook = grabLook(); if (!own(v)) applyLook(otherLook); }
    if (own(v) && state.device !== v) { if (!own(state.device)) otherLook = grabLook(); applyLook(v === 'box' ? boxLook : v === 'bands' ? bandsLook : blockLook); }
    state.device = v;
    // the M-Band's renders are lit from the upper left, the light catching the tops of the yarn and the pod's edges
    if (v === 'mband' && !mbandLit) { mbandLit = true; state.lightAz = -35; state.lightEl = 38; lAz.el.value = state.lightAz; lAz.show(); lEl.el.value = state.lightEl; lEl.show(); lightChanged(); }
    // the Bloom pod's renders are lit from above and the front left: the tops of the pod and the tail bright, their
    // undersides a deeper lilac
    if (v === 'bloom' && !bloomLit) { bloomLit = true; state.lightAz = -50; state.lightEl = 62; lAz.el.value = state.lightAz; lAz.show(); lEl.el.value = state.lightEl; lEl.show(); lightChanged(); }
    if (v === 'bands' && !bandsRig.meshes.length) setupBands(false);
    syncSetupUI(); applyPose(); updateLights(); drawLightPad();
    if (v === 'box') frameBox(); else if (v === 'bands') frameBands(); else if (v === 'mband') frameMBand(); else if (v === 'block') frameBlock(); else if (v === 'bloom') frameBloom(); else frame(32, 14);
    renderPicker();
    if (screenPreset === 'exercise') setScreenPreset('exercise'); else updateScreen();
  }
  if (name === 'boxpose') { state.boxPose = v; applyPose(); updateLights(); frameBox(); }
  if (name === 'mbandpose') { state.mbandPose = v; applyPose(); updateLights(); frameMBand(); }
  if (name === 'bloomlight') { state.bloomLight = v === 'on'; setBloomLight(BLM, state.bloomLight); markShadowDirty(); requestRender(); }
  if (name === 'blockpose') { state.blockPose = v; applyPose(); updateLights(); frameBlock(); }
  if (name === 'bandpos') { bandsRig.opts.pos = v; setupBands(true); }
  if (name === 'bandpouch') { bandsRig.opts.pouch = v === 'with'; if (bandsRig.opts.pouch) bandsRig.opts.pos = 'surface'; setupBands(true); }
  if (name === 'bandshape') {
    // each shape has the gravity it needs: hung and stretched bands hang; the loops float, as in the brand's render
    bandsRig.opts.shape = v; bandsRig.opts.gravity = v === 'hang' || v === 'stretch';
    setupBands(true);
  }
  if (name === 'bandlay') { bandsRig.opts.lay = v; setupBands(true); }
  if (name === 'bandprint') { bandsRig.opts.print = v; bandsRig.applyPrint(); requestRender(); }
  if (name === 'stand') { state.stand = v === 'on'; syncSetupUI(); applyPose(); updateLights(); frame(); }
  if (name === 'pose') { state.pose = v; applyPose(); updateLights(); frame(state.pose === 'flat' ? 30 : undefined, state.pose === 'flat' ? 38 : undefined); }
  if (name === 'fit') { state.fit = v; updateScreen(); }
  if (name === 'phx-count') { state.phoenix.count = +v; $('#phx-2-field').classList.toggle('hidden', state.phoenix.count < 2); phoenixTexts(); }
  if (name === 'phx-side') { state.phoenix.side = v; syncPhoenix(); }
  if (name === 'format') { state.format = v; $('#transparent-row').classList.toggle('disabled', v === 'jpg'); updateExportInfo(); }
  if (name === 'aspect') { state.aspect = v; limitResolutions(); resize(); }
}));

function syncSetupUI() {
  const ph = isPhone();
  $('#stand-row').classList.toggle('hidden', !isPad());
  $('#pose-row').classList.toggle('hidden', isBox() || isBands() || isMBand() || isBlock() || isBloom() || (isPad() && state.stand));
  $('#mband-pose-row').classList.toggle('hidden', !isMBand());
  $('#block-pose-row').classList.toggle('hidden', !isBlock());
  $('#bloom-light-row').classList.toggle('hidden', !isBloom());
  $('#box-pose-row').classList.toggle('hidden', !isBox());
  $('#bands-rows').classList.toggle('hidden', !isBands());
  const floatingBands = bandsRig.opts.pos === 'floating', inPouch = bandsRig.opts.pouch;
  $('#band-pos-row').classList.toggle('hidden', inPouch);
  $('#band-out-row').classList.toggle('hidden', !inPouch);
  $('#band-shape-row').classList.toggle('hidden', !floatingBands || inPouch);
  $('#band-lay-row').classList.toggle('hidden', floatingBands || inPouch);
  $('#floor-gap').closest('.slider').classList.toggle('hidden', isBands() && !floatingBands);
  document.querySelectorAll('[data-band]').forEach((b) => b.classList.toggle('on', bandsRig.opts.on[b.dataset.band]));
  { const o = bandsRig.opts; setSeg('bandpos', o.pos); setSeg('bandshape', o.shape); setSeg('bandlay', o.lay); setSeg('bandprint', o.print); setSeg('bandpouch', o.pouch ? 'with' : 'without'); $('#band-hooks').checked = bandHooksWanted; }
  $('#band-hooks-row').classList.toggle('hidden', !bandHooksAllowed());   // only hung and stretched bands have hooks to show
  $('#screen-section').classList.toggle('hidden', isBox() || isBands() || isMBand() || isBlock() || isBloom());   // the box, the bands, the M-Band and the block have no screen
  $('#finish-row').classList.toggle('hidden', !ph);
  $('#phoenix-section').classList.toggle('hidden', !ph);
  phx.group.visible = ph && state.phoenix.on;
  document.querySelectorAll('[data-finish]').forEach((b) => b.classList.toggle('on', b.dataset.finish === state.finish));
  $('#finish-name').textContent = FINISHES[state.finish].name.replace(' Titanium', '');
}
document.querySelectorAll('[data-finish]').forEach((b) => b.addEventListener('click', () => {
  state.finish = b.dataset.finish;
  setFinish(P, state.finish);
  syncSetupUI();
  requestRender();
}));

// lighting
let envTimer = 0, mbandLit = false, bloomLit = false;
// the box's mockup is lit by a key high on the front right (the direction of its floor shadow); its floor shadow is
// darker and a little crisper than the studio's default; its lens is set by its framing
let boxLook = { az: BOX_SCENE.key[0], el: BOX_SCENE.key[1], strength: 0.92, soft: 0.35 }, otherLook = null;
// the bands start lit from the front left and above: the faces turned to the camera are bright, as in the brand's
// render, and lying flat their soft shadows fall to the right, as in the product photo
let bandsLook = { az: -55, el: 36, strength: 0.85, soft: 0.6 };   // a lowish key lights the upright faces of floating bands
// the yoga block's renders: a soft key from the front left, lowish, its long soft shadow falling to the right
let blockLook = { az: -75, el: 32, strength: 0.8, soft: 0.6 };
function grabLook() { return { az: state.lightAz, el: state.lightEl, strength: state.shadowStrength, soft: state.shadowSoftness, focal: state.focal }; }
function applyLook(L) {
  if (!L) return;
  state.lightAz = L.az; state.lightEl = L.el; lAz.el.value = L.az; lAz.show(); lEl.el.value = L.el; lEl.show();
  for (const [id, val] of [['shadow-strength', L.strength], ['shadow-soft', L.soft]]) { const el = $(`#${id}`); el.value = val; el.dispatchEvent(new Event('input')); }
  // the lens too (the box's floating view uses the mockup's long lens); the device switch then re-frames
  if (L.focal) { state.focal = L.focal; camera.setFocalLength(L.focal); camera.updateProjectionMatrix(); $('#focal').value = L.focal; $('#focal-v').textContent = `${L.focal} mm`; paintRange($('#focal')); }
  lightChanged();
}
function lightChanged() {
  // keep the direct light responsive; rebuild the env map at most every ~60ms while dragging
  const center = modelBounds().getCenter(new THREE.Vector3());
  keyLight.position.copy(center).addScaledVector(dirFromAzEl(state.lightAz, state.lightEl), 150);
  markShadowDirty(); resetShadow();
  drawLightPad();
  clearTimeout(envTimer);
  envTimer = setTimeout(updateLights, 40);
}
const lAz = bindRange('light-az', 'lightAz', deg, lightChanged);
const lEl = bindRange('light-el', 'lightEl', deg, lightChanged);
bindRange('key', 'keyIntensity', pct, lightChanged);
bindRange('env', 'envIntensity', pct, (v) => { scene.environmentIntensity = v; requestRender(); });
bindRange('exposure', 'exposure', (v) => v.toFixed(2), (v) => { renderer.toneMappingExposure = v; requestRender(); });

// light pad (top-down: front of the tablet is at the bottom)
const pad = $('#lightpad'), pctx = pad.getContext('2d');
function drawLightPad() {
  const dpr = window.devicePixelRatio || 1;
  const S = pad.clientWidth;
  if (pad.width !== S * dpr) { pad.width = pad.height = S * dpr; }
  pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  pctx.clearRect(0, 0, S, S);
  const c = S / 2, R = S / 2 - 10;
  pctx.strokeStyle = '#dbdbdb'; pctx.lineWidth = 1;
  for (const f of [1, 2 / 3, 1 / 3]) { pctx.beginPath(); pctx.arc(c, c, R * f, 0, Math.PI * 2); pctx.stroke(); }
  pctx.beginPath(); pctx.moveTo(c - R, c); pctx.lineTo(c + R, c); pctx.moveTo(c, c - R); pctx.lineTo(c, c + R); pctx.stroke();
  // device icon, screen facing the bottom
  const hw = isPhone() ? 7 : 22;
  if (isBox()) { pctx.fillStyle = '#c2c2c2'; pctx.beginPath(); pctx.roundRect(c - 9, c - 9, 18, 18, 2); pctx.fill(); }
  else if (isBands()) { pctx.strokeStyle = '#c2c2c2'; pctx.lineWidth = 3; for (const dx of [-9, 0, 9]) { pctx.beginPath(); pctx.ellipse(c + dx, c, 3, 9, 0, 0, Math.PI * 2); pctx.stroke(); } }
  else {
    pctx.fillStyle = '#c2c2c2'; pctx.beginPath(); pctx.roundRect(c - hw, c - 3, hw * 2, 6, 1.5); pctx.fill();
    pctx.fillStyle = '#2e2e2e'; pctx.fillRect(c - hw + 2, c + 1.5, hw * 2 - 4, 1.5);
  }
  if (isPad()) { pctx.fillStyle = '#ff7e7e'; pctx.fillRect(c + 9, c - 3, 8, 6); }
  pctx.fillStyle = '#5e5e5e'; pctx.font = '500 9.5px Figtree, -apple-system, sans-serif'; pctx.textAlign = 'center';
  pctx.fillText('Front', c, S - 2); pctx.fillText('Back', c, 10);
  // light
  const rr = R * (90 - state.lightEl) / 90;
  const lx = c + Math.sin(state.lightAz * DEG) * rr, ly = c + Math.cos(state.lightAz * DEG) * rr;
  // brand-gradient light handle with a soft glow
  const g = pctx.createRadialGradient(lx, ly, 0, lx, ly, 18);
  g.addColorStop(0, 'rgba(190,149,229,0.55)'); g.addColorStop(1, 'rgba(190,149,229,0)');
  pctx.fillStyle = g; pctx.beginPath(); pctx.arc(lx, ly, 18, 0, Math.PI * 2); pctx.fill();
  const h = pctx.createLinearGradient(lx - 7, ly + 7, lx + 7, ly - 7);
  h.addColorStop(0, '#ff7e7e'); h.addColorStop(0.5, '#be95e5'); h.addColorStop(1, '#4a89e8');
  pctx.fillStyle = h; pctx.strokeStyle = '#fff'; pctx.lineWidth = 2.5;
  pctx.shadowColor = 'rgba(13,13,13,0.25)'; pctx.shadowBlur = 4;
  pctx.beginPath(); pctx.arc(lx, ly, 7, 0, Math.PI * 2); pctx.fill(); pctx.stroke();
  pctx.shadowBlur = 0;
}
function padPointer(e) {
  const r = pad.getBoundingClientRect();
  const c = r.width / 2, R = r.width / 2 - 10;
  const dx = e.clientX - r.left - c, dy = e.clientY - r.top - c;
  const dist = Math.min(Math.hypot(dx, dy), R);
  state.lightAz = Math.round(Math.atan2(dx, dy) / DEG);
  state.lightEl = Math.round(Math.max(5, 90 - (dist / R) * 90));
  lAz.el.value = state.lightAz; lAz.show();
  lEl.el.value = state.lightEl; lEl.show();
  lightChanged();
}
pad.addEventListener('pointerdown', (e) => { pad.setPointerCapture(e.pointerId); padPointer(e); });
pad.addEventListener('pointermove', (e) => { if (pad.hasPointerCapture(e.pointerId)) padPointer(e); });

// shadow
$('#shadow-on').addEventListener('change', (e) => { state.shadow = e.target.checked; $('#shadow-controls').classList.toggle('disabled', !state.shadow); requestRender(); });
bindRange('shadow-strength', 'shadowStrength', pct, () => requestRender());
bindRange('shadow-soft', 'shadowSoftness', pct, () => {
  keyLight.shadow.radius = 2 + state.shadowSoftness * 10; markShadowDirty(); resetShadow();
  if (isBands()) { clearTimeout(envTimer); envTimer = setTimeout(updateLights, 40); }   // the bands' key softbox grows softer
});
// how far below the device the floor is: 0 rests it on the floor; more floats it, its shadow growing softer and paler
floorRange = bindRange('floor-gap', 'floorGap', (v) => (v === 0 ? 'On the floor' : `${v.toFixed(1).replace('.0', '')} cm`), (v) => {
  if (isBands()) {   // lift or lower the floating bands with their hooks and clips; their lowest point sits that far up
    bandsRig.opts.lift = v;
    if (bandsRig.opts.pos === 'floating') { bandsRig.shift(0, v - Math.max(0, bandsRig.lowest()), 0); bandsRig.world.wake(); }
    markShadowDirty(); resetShadow(); return;
  }
  floorGaps[poseKey()] = v; setFloor(false); markShadowDirty(); resetShadow();
});

// screen
// both devices pick from the Figma exercise screens (live score bar / Phoenix message on the pad,
// live arrows and reps on the iPhone); an uploaded image is shared
const presets = { custom: null };
let screenPreset = 'exercise';
const CATALOG = { pad: PAD_SCREENS, iphone: PHONE_SCREENS };
const BY_KEY = Object.fromEntries([...PAD_SCREENS, ...PHONE_SCREENS].map((s) => [s.key, s]));
const imgCache = {};
const img = (src) => (imgCache[src] ??= loadImage(`${src}?v=${VERSION}`));
const sprite = (src, name) => img(src).then((im) => { im.dataset.sprite = name; return im; });
const screenCanvas = { pad: document.createElement('canvas'), iphone: document.createElement('canvas') };
let uiFonts = null;
const phoneArrowState = () => (state.arrows === 'green' ? state.stage : state.arrows);

async function padExerciseSource() {
  const s = BY_KEY[state.pick.pad.key];
  const im = await img(`assets/screens/pad/${s.key}.jpg`);
  await (uiFonts ??= scoreBarFonts());
  if (state.pick.pad.key !== s.key) return null; // changed while loading
  const c = screenCanvas.pad;
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const ctx = c.getContext('2d'), k = im.naturalWidth / s.w;
  ctx.drawImage(im, 0, 0);
  drawScoreBar(ctx, k, s.bar, state.progress);
  drawPill(ctx, k, s.w, s.pill, state.msg ?? s.msg);
  return c;
}
async function phoneExerciseSource() {
  const s = BY_KEY[state.pick.iphone.key], st = phoneArrowState();
  const [below, over, ...sprites] = await Promise.all([
    img(`assets/screens/phone/${s.key}.jpg`),
    s.over ? img(`assets/screens/phone/${s.key}-over.webp`) : null,
    ...s.arrows.map((a) => sprite(`assets/screens/arrows/${a.sprite}-${st}.png`, `${a.sprite}-${st}`)),
  ]);
  await (uiFonts ??= scoreBarFonts());
  if (state.pick.iphone.key !== s.key || phoneArrowState() !== st) return null;
  const c = screenCanvas.iphone;
  c.width = below.naturalWidth; c.height = below.naturalHeight;
  drawPhoneScreen(c.getContext('2d'), below.naturalWidth / s.w, s, { below, over, sprites }, state.reps);
  return trimPhoneEdges(c, below, over);
}

// The phone screens' Figma exports can carry a light strip down a side (3 pt: the photo's white export background
// where the frame's edge falls between pixels, and an opaque white line on the overlay), and a few a white frame all
// round (8 pt). Measure them on the layers and crop them off, so the picture always fills the display edge to edge.
const probe = document.createElement('canvas');
const trimmedScreen = document.createElement('canvas');
// how many lines in from one side are a strip: nearly every sample along the line passes `test`
function stripWidth(im, side, test) {
  const W = im.naturalWidth, H = im.naturalHeight, M = Math.round(W * 0.05), vert = side === 'left' || side === 'right';
  const bw = vert ? M : Math.round(W * 0.4), bh = vert ? Math.round(H * 0.4) : M;   // along the middle of the side
  const sx = side === 'left' ? 0 : side === 'right' ? W - M : Math.round(W * 0.3);
  const sy = side === 'top' ? 0 : side === 'bottom' ? H - M : Math.round(H * 0.2);
  probe.width = bw; probe.height = bh;
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(im, sx, sy, bw, bh, 0, 0, bw, bh);
  const d = ctx.getImageData(0, 0, bw, bh).data, len = vert ? bh : bw;
  let n = 0;
  for (let k = 0; k < M; k++) {
    let pass = 0, all = 0;
    for (let t = 0; t < len; t += 2, all++) {
      const x = vert ? (side === 'left' ? k : bw - 1 - k) : t, y = vert ? t : (side === 'top' ? k : bh - 1 - k), i = (y * bw + x) * 4;
      if (test(d[i], d[i + 1], d[i + 2], d[i + 3])) pass++;
    }
    if (pass < 0.9 * all) break;
    n = k + 1;
  }
  return n;
}
function trimPhoneEdges(c, below, over) {
  const white = (r, g, b) => r > 240 && g > 240 && b > 240, opaque = (r, g, b, a) => a > 128;
  const side = (s) => Math.max(stripWidth(below, s, white), over && s !== 'bottom' ? stripWidth(over, s, opaque) : 0);   // the overlay's bottom is its glow
  const pad = (n) => (n ? n + 1 : 0);   // and the anti-aliased line next to it
  const L = side('left'), R = side('right'), T = side('top'), B = side('bottom');
  // the sides always; the top and bottom only when the screen is framed all round (elsewhere a light wall or floor
  // can reach them, and the display's fit crops a few lines there anyway)
  const framed = Math.min(L, R, T, B) >= 12;
  const l = pad(L), r = pad(R), t = framed ? pad(T) : 0, b = framed ? pad(B) : 0;
  if (!(l || r || t || b)) return c;
  trimmedScreen.width = c.width - l - r; trimmedScreen.height = c.height - t - b;
  trimmedScreen.getContext('2d').drawImage(c, l, t, trimmedScreen.width, trimmedScreen.height, 0, 0, trimmedScreen.width, trimmedScreen.height);
  return trimmedScreen;
}
async function setScreenPreset(name) {
  screenPreset = name;
  document.querySelectorAll('[data-screen]').forEach((b) => b.classList.toggle('on', b.dataset.screen === name));
  if (name === 'off') screenSource = null;
  else if (name === 'exercise') {
    const dev = state.device;
    if (dev === 'box' || dev === 'bands' || dev === 'mband' || dev === 'block' || dev === 'bloom') return;
    const src = dev === 'pad' ? await padExerciseSource() : await phoneExerciseSource();
    if (!src || screenPreset !== 'exercise' || state.device !== dev) return; // changed while loading
    screenSource = src;
  }
  updateScreen();
}
const refreshExercise = () => { if (screenPreset === 'exercise') setScreenPreset('exercise'); };

// exercise screen picker: person, exercise, age, ethnicity -> matching screens (per device)
const pickSel = $('#pick-ex'), pickThumbs = $('#pick-thumbs');
const matchesPick = (s, p, { age = true, eth = true } = {}) => s.g === p.g && s.ex === p.ex &&
  (!age || p.age === 'any' || s.age === p.age) && (!eth || p.eth === 'any' || s.eth === p.eth);
// keep the selection valid: fall back to a person and exercise that exist, then relax age and ethnicity
function normalizePick(list, p) {
  if (!list.some((s) => s.g === p.g)) p.g = list[0].g;
  const forG = list.filter((s) => s.g === p.g);
  if (!forG.some((s) => s.ex === p.ex)) p.ex = forG[0].ex;
  if (p.age !== 'any' && !list.some((s) => matchesPick(s, p, { eth: false }))) p.age = 'any';
  if (p.eth !== 'any' && !list.some((s) => matchesPick(s, p))) p.eth = 'any';
  const m = list.filter((s) => matchesPick(s, p));
  if (!m.some((s) => s.key === p.key)) p.key = m[0].key;
  return m;
}
// the iPhone's arrows and reps start from what the chosen Figma screen shows
function screenDefaults() {
  const s = BY_KEY[state.pick.iphone.key];
  const st = s.arrowState || 'g3';
  state.arrows = st.startsWith('g') || st === 'full' ? 'green' : st;
  if (state.arrows === 'green') state.stage = st;
  state.reps = s.reps;
  repsRange.el.value = state.reps; repsRange.show();
}
function renderPicker() {
  const dev = state.device;
  $('#exercise-picker').classList.toggle('hidden', dev === 'box' || dev === 'bands' || dev === 'mband' || dev === 'block' || dev === 'bloom');
  if (dev === 'box' || dev === 'bands' || dev === 'mband' || dev === 'block' || dev === 'bloom') return;   // the box, the bands, the M-Band and the block have no screen
  const list = CATALOG[dev], p = state.pick[dev];
  const before = p.key, m = normalizePick(list, p);
  if (dev === 'iphone' && p.key !== before) screenDefaults();
  $('#exercise-picker').classList.toggle('phone', dev === 'iphone');
  const counts = {};
  for (const s of list) if (s.g === p.g) counts[s.ex] = (counts[s.ex] || 0) + 1;
  pickSel.innerHTML = Object.keys(EXERCISES).filter((k) => counts[k])
    .sort((a, b) => EXERCISES[a].localeCompare(EXERCISES[b]))
    .map((k) => `<option value="${k}">${EXERCISES[k]}</option>`).join('');
  pickSel.value = p.ex;
  for (const name of ['g', 'age', 'eth']) {
    document.querySelectorAll(`[data-pick="${name}"] button`).forEach((b) => {
      const v = b.dataset.value;
      b.classList.toggle('on', v === p[name]);
      if (name === 'g') b.disabled = !list.some((s) => s.g === v);
      if (name === 'age') b.disabled = v !== 'any' && !list.some((s) => matchesPick(s, { ...p, age: v }, { eth: false }));
      if (name === 'eth') b.disabled = v !== 'any' && !list.some((s) => matchesPick(s, { ...p, eth: v }));
    });
  }
  $('#pick-count').textContent = `${m.length} screen${m.length === 1 ? '' : 's'}`;
  const dir = dev === 'pad' ? 'pad' : 'phone';
  pickThumbs.innerHTML = m.map((s) => `<button class="thumb${s.key === p.key ? ' on' : ''}" data-key="${s.key}" role="option" aria-selected="${s.key === p.key}" aria-label="${EXERCISES[s.ex]} screen"><img src="assets/screens/${dir}/t/${s.key}.jpg?v=${VERSION}" alt="" loading="lazy" /></button>`).join('');
  renderScreenControls();
}
function renderScreenControls() {
  const s = BY_KEY[state.pick.pad.key];
  msgInput.value = state.msg ?? s.msg;
  $('#pill-count').textContent = `${msgInput.value.length}/${PILL_MAX}`;
  $('#pill-reset').hidden = state.msg === null;
  const ph = BY_KEY[state.pick.iphone.key], fixed = !ph.arrows.length;
  for (const name of ['arrows', 'stage']) document.querySelectorAll(`[data-pick="${name}"] button`).forEach((b) => b.classList.toggle('on', b.dataset.value === state[name]));
  document.querySelectorAll('[data-pick="arrows"], [data-pick="stage"]').forEach((g) => g.classList.toggle('disabled', fixed));
  $('#stage-row').classList.toggle('hidden', state.arrows !== 'green' || fixed);
  $('#arrows-fixed').classList.toggle('hidden', !fixed);
}
function pickChanged() {
  renderPicker();
  setScreenPreset('exercise');
}
document.querySelectorAll('[data-pick]').forEach((g) => g.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  const name = g.dataset.pick;
  if (name === 'arrows' || name === 'stage') { state[name] = b.dataset.value; renderScreenControls(); setScreenPreset('exercise'); return; }
  state.pick[state.device][name] = b.dataset.value;
  pickChanged();
}));
pickSel.addEventListener('change', () => { state.pick[state.device].ex = pickSel.value; pickChanged(); });
pickThumbs.addEventListener('click', (e) => {
  const b = e.target.closest('.thumb'); if (!b) return;
  state.pick[state.device].key = b.dataset.key;
  if (state.device === 'iphone') screenDefaults();
  pickChanged();
});
bindRange('progress', 'progress', (v) => `${Math.round(v)}%`, () => { if (state.device === 'pad') refreshExercise(); });
const repsRange = bindRange('reps', 'reps', (v) => `${Math.round(v)}/10`, () => { if (state.device === 'iphone') refreshExercise(); });
// the Phoenix message follows the chosen screen until you type your own (max 45 characters)
const msgInput = $('#pill-msg');
msgInput.addEventListener('input', () => {
  state.msg = msgInput.value.slice(0, PILL_MAX);
  $('#pill-count').textContent = `${state.msg.length}/${PILL_MAX}`;
  $('#pill-reset').hidden = false;
  if (state.device === 'pad') refreshExercise();
});
$('#pill-reset').addEventListener('click', () => { state.msg = null; renderScreenControls(); if (state.device === 'pad') refreshExercise(); });
document.querySelectorAll('[data-screen]').forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.screen === 'custom') { if (presets.custom) { screenPreset = 'custom'; screenSource = presets.custom; document.querySelectorAll('[data-screen]').forEach((x) => x.classList.toggle('on', x === b)); updateScreen(); } else $('#file').click(); return; }
  setScreenPreset(b.dataset.screen);
}));
async function useFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const url = URL.createObjectURL(file);
  const im = await loadImage(url);
  presets.custom = im;
  screenPreset = 'custom';
  screenSource = im;
  const btn = $('[data-screen="custom"]');
  btn.classList.remove('hidden');
  document.querySelectorAll('[data-screen]').forEach((x) => x.classList.toggle('on', x === btn));
  $('#file-name').textContent = file.name;
  updateScreen();
}
$('#upload').addEventListener('click', () => $('#file').click());
$('#file').addEventListener('change', (e) => useFile(e.target.files[0]));
viewport.addEventListener('dragover', (e) => { e.preventDefault(); viewport.classList.add('drop'); });
viewport.addEventListener('dragleave', () => viewport.classList.remove('drop'));
viewport.addEventListener('drop', (e) => { e.preventDefault(); viewport.classList.remove('drop'); useFile(e.dataTransfer.files[0]); });
bindRange('screen-bright', 'screenBrightness', pct, (v) => { if (screenSource) M.screen.emissiveIntensity = P.screen.emissiveIntensity = v; requestRender(); });
bindRange('screen-reflect', 'screenReflect', pct, (v) => applyReflect(v));
function applyReflect(v) {
  for (const m of [M.screen, P.screen, M.glass]) { m.clearcoat = v; m.specularIntensity = 0.15 + 0.6 * v; }
  requestRender();
}

// Phoenix message (iPhone): 1–2 bubbles of up to 55 characters (20 a line), left / centre / right, from a little above the phone to a little below
const phxInputs = [$('#phx-1'), $('#phx-2')];
phxInputs.forEach((el, i) => {
  el.maxLength = PHOENIX_MAX;
  el.value = state.phoenix.texts[i];
  const count = () => { $(`#phx-${i + 1}-count`).textContent = `${el.value.length}/${PHOENIX_MAX}`; };
  count();
  el.addEventListener('input', () => { state.phoenix.texts[i] = el.value.slice(0, PHOENIX_MAX); count(); phoenixTexts(); });
});
$('#phx-on').addEventListener('change', (e) => {
  state.phoenix.on = e.target.checked;
  $('#phx-controls').classList.toggle('disabled', !state.phoenix.on);
  syncPhoenix(); frame();
});
bindRange('phx-y', null, (v) => (v < 0 ? 'Above the phone' : v === 0 ? 'Top' : v > 100 ? 'Below the phone' : v === 100 ? 'Bottom' : `${Math.round(v)}%`), (v) => { state.phoenix.y = v; syncPhoenix(); });
$('#phx-y').value = state.phoenix.y; $('#phx-y').dispatchEvent(new Event('input'));
document.fonts?.load('500 19px Figtree').then(phoenixTexts);

// background
function markBg() {
  let preset = false;
  document.querySelectorAll('[data-bg]').forEach((b) => { const on = b.dataset.bg === state.bg; b.classList.toggle('on', on); preset ||= on; });
  $('.color-pick').classList.toggle('on', !preset);
}
$('#bg').addEventListener('input', (e) => { state.bg = e.target.value; stage.style.background = state.transparent ? '' : state.bg; markBg(); });
$('#transparent').addEventListener('change', (e) => { state.transparent = e.target.checked; stage.classList.toggle('checker', state.transparent); stage.style.background = state.transparent ? '' : state.bg; });
document.querySelectorAll('[data-bg]').forEach((b) => b.addEventListener('click', () => { $('#bg').value = b.dataset.bg; $('#bg').dispatchEvent(new Event('input')); }));

// ---------------------------------------------------------------- resistance bands: presets and hands-on shaping
// a preset (bands chosen, floating shape or surface lay) is built fresh; then the simulation takes over
function setupBands(reframe) {
  bandsRig.opts.showHooks = bandHooksWanted && bandHooksAllowed();
  bandsRig.setup();
  bandsRig.aimPrints(bandsPresetCamera());   // once, before the first frame: the prints stay where they are put
  rebuildShadowProxy(); resetShadow(); markShadowDirty();
  syncSetupUI(); setFloor(true); updateLights(); drawLightPad(); applyBandAids();
  if (reframe) setTimeout(frameBands, 900);   // once the shape has mostly formed
  requestRender();
}
// each preset's view: standing, from the front right and a little above, so each band behind shows past the one in
// front (and its print)
const bandsView = () => { const o = bandsRig.opts; return o.pouch ? [10, 8] : o.pos === 'surface' ? (o.lay === 'standing' ? [30, 22] : [18, 28]) : [0, 6]; };
function frameBands() { const [az, el] = bandsView(); frame(az, el); }
// the camera a preset will be framed with (as frameBands would, round the bands as they start): their prints are
// aimed at it as the preset is built, so they never turn or jump once it shows
function bandsPresetCamera() {
  const [az, el] = bandsView(), c = modelBounds().getCenter(new THREE.Vector3()), cam = camera.clone();
  cam.position.copy(c).add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(fitDistance(), (90 - el) * DEG, az * DEG)));
  cam.lookAt(c); cam.updateMatrixWorld();
  return cam;
}
document.querySelectorAll('[data-band]').forEach((b) => b.addEventListener('click', () => {
  const k = b.dataset.band, on = bandsRig.opts.on;
  if (on[k] && bandsRig.keys().length === 1) return;   // at least one band
  on[k] = !on[k];
  setupBands(true);
}));
$('#band-hooks').addEventListener('change', (e) => { bandHooksWanted = e.target.checked; bandsRig.setShowHooks(bandHooksWanted && bandHooksAllowed()); applyBandAids(); rebuildShadowProxy(); markShadowDirty(); resetShadow(); });
$('#band-reset').addEventListener('click', () => setupBands(true));
// in the pouch: how far the bands stand out of it (they fold in at the foot, or ride up the neck)
let bandOutRaf = 0;   // one rebuild per frame however fast the slider moves
bindRange('band-out', null, (v) => `${v.toFixed(1)} cm`, (v) => { bandsRig.opts.pouchOut = v; if (!bandOutRaf) bandOutRaf = requestAnimationFrame(() => { bandOutRaf = 0; setupBands(false); }); });

// pointer: drag a band to pull it (⇧ as you let go pins it there), ⌥-drag moves a whole band, drag a pin to move
// it; scroll over a pin (or while holding a band) turns it, ⇧-scroll twists it; double-click a pin to remove it
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), dragPlane = new THREE.Plane(), hitP = new THREE.Vector3();
function rayAt(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray;
}
let bandDrag = null, hoverPin = null;
stage.addEventListener('pointerdown', (e) => {
  if (!isBands() || e.button !== 0) return;
  const hit = bandsRig.pick(rayAt(e));
  if (!hit) return;
  e.stopPropagation(); e.preventDefault();
  const D = bandsRig.startDrag(hit, e.altKey ? 'move' : 'pull');
  // floating: drag across the view; on a surface: along the floor's plane at the grabbed height
  const view = camera.getWorldDirection(new THREE.Vector3());
  if (bandsRig.opts.pos === 'surface' && !hit.pin) dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), hit.point);
  else dragPlane.setFromNormalAndCoplanarPoint(view.negate(), hit.point);
  bandDrag = { id: e.pointerId, D };
  try { stage.setPointerCapture(e.pointerId); } catch { /* a pointer that is already gone */ }
  stage.style.cursor = 'grabbing';
}, { capture: true });
stage.addEventListener('pointermove', (e) => {
  if (!isBands()) return;
  if (bandDrag && e.pointerId === bandDrag.id) {
    if (rayAt(e).ray.intersectPlane(dragPlane, hitP)) bandsRig.dragTo(hitP);
    e.stopPropagation(); return;
  }
  if (e.buttons) return;
  const hit = bandsRig.pick(rayAt(e));
  hoverPin = hit?.pin || null;
  stage.style.cursor = hit ? 'grab' : '';
}, { capture: true });
const endBandDrag = (e) => {
  if (!bandDrag || e.pointerId !== bandDrag.id) return;
  bandsRig.endDrag(e.shiftKey);
  bandDrag = null; stage.style.cursor = '';
  e.stopPropagation();
};
stage.addEventListener('pointerup', endBandDrag, { capture: true });
stage.addEventListener('pointercancel', endBandDrag, { capture: true });
stage.addEventListener('wheel', (e) => {
  if (!isBands()) return;
  const target = bandDrag?.D?.clip ? { clip: bandDrag.D.clip } : bandDrag?.D?.pin || hoverPin;
  if (!target) return;
  e.stopPropagation(); e.preventDefault();
  bandsRig.turn(target, (e.deltaY > 0 ? 1 : -1) * 6 * DEG, camera.getWorldDirection(new THREE.Vector3()), e.shiftKey);
}, { capture: true, passive: false });
stage.addEventListener('dblclick', (e) => {
  if (!isBands()) return;
  const hit = bandsRig.pick(rayAt(e));
  if (hit?.pin) { bandsRig.removePin(hit.pin); e.stopPropagation(); }
}, { capture: true });

// ---------------------------------------------------------------- export
function exportSize() {
  const asp = aspectValue();
  const long = state.resolution;
  return asp >= 1 ? [long, Math.round(long / asp)] : [Math.round(long * asp), long];
}
function updateExportInfo() {
  const [w, h] = exportSize();
  const extra = state.format === 'png' && state.transparent ? ' · transparent' : '';
  $('#export-info').innerHTML = `<span class="num">${w} × ${h}<small>px</small></span>${state.format.toUpperCase()}${extra}`;
}
$('#resolution').addEventListener('change', (e) => { state.resolution = +e.target.value; updateExportInfo(); });
function limitResolutions() {
  // hide sizes this browser cannot allocate as a single canvas (mainly iOS)
  const asp = aspectValue();
  const sel = $('#resolution');
  for (const o of sel.options) {
    const long = +o.value, area = long * (asp >= 1 ? long / asp : long * asp);
    o.disabled = area > MAX_CANVAS_AREA;
  }
  if (sel.selectedOptions[0]?.disabled) {
    const ok = [...sel.options].filter((o) => !o.disabled).pop();
    sel.value = ok.value; state.resolution = +ok.value;
  }
}
$('#transparent').addEventListener('change', updateExportInfo);

async function renderToCanvas(W, H, transparent, onProgress) {
  // the bands' pins and (unless shown) hooks are on-screen aids only
  const pinsShown = bandsRig.helpers.visible; bandsRig.helpers.visible = false; bandsRig.exportMode(true);
  // finish the shadow
  if (state.shadow) while (accumulate(64)) { /* converge */ }
  const SS = 2;                 // supersampling factor
  const TILE = 1024;            // output pixels per tile side
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const octx = out.getContext('2d');
  if (!transparent) { octx.fillStyle = state.bg; octx.fillRect(0, 0, W, H); }
  octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = 'high';
  const prevPR = renderer.getPixelRatio();
  const prevSize = renderer.getSize(new THREE.Vector2());
  renderer.setPixelRatio(1);
  camera.aspect = W / H;
  let done = 0; const total = Math.ceil(W / TILE) * Math.ceil(H / TILE);
  try {
    for (let y = 0; y < H; y += TILE) {
      for (let x = 0; x < W; x += TILE) {
        const tw = Math.min(TILE, W - x), th = Math.min(TILE, H - y);
        renderer.setSize(tw * SS, th * SS, false);
        camera.setViewOffset(W * SS, H * SS, x * SS, y * SS, tw * SS, th * SS);
        camera.updateProjectionMatrix();
        renderMain();
        octx.drawImage(renderer.domElement, 0, 0, tw * SS, th * SS, x, y, tw, th);
        onProgress?.(++done / total);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  } finally {
    bandsRig.helpers.visible = pinsShown; bandsRig.exportMode(false);
    camera.clearViewOffset();
    renderer.setPixelRatio(prevPR);
    renderer.setSize(prevSize.x, prevSize.y);
    resize();
  }
  return out;
}

async function exportImage() {
  const btn = $('#download');
  btn.disabled = true;
  $('#busy').classList.add('show');
  await new Promise((r) => setTimeout(r, 30));
  try {
    const [W, H] = exportSize();
    const transparent = state.format === 'png' && state.transparent;
    const out = await renderToCanvas(W, H, transparent, (p) => { $('#busy-text').textContent = `Rendering ${Math.round(p * 100)}%`; });
    $('#busy-text').textContent = 'Encoding…';
    await new Promise((r) => setTimeout(r, 0));
    const type = state.format === 'png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise((r) => out.toBlob(r, type, 0.95));
    const { az, el } = getCamAngles();
    const subject = isBloom() ? `sword-bloom-pod_${state.bloomLight ? 'light-on' : 'light-off'}` : isBlock() ? `sword-yoga-block_${state.blockPose}` : isMBand() ? `sword-m-band_${state.mbandPose}` : isBands() ? `sword-bands_${bandsRig.keys().join('-')}_${bandsRig.opts.pouch ? 'pouch' : bandsRig.opts.pos === 'floating' ? bandsRig.opts.shape : bandsRig.opts.lay}` : isBox() ? `sword-box_${state.boxPose}` : isPhone() ? `vision-ai_${state.finish}_${state.pose}` : `thrive-pad_${state.stand ? 'stand' : state.pose}`;
    const name = `${subject}_az${Math.round(az)}_el${Math.round(el)}_${W}x${H}.${state.format}`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch (err) {
    console.error(err);
    alert(`Export failed: ${err.message}`);
  } finally {
    btn.disabled = false;
    $('#busy').classList.remove('show');
    $('#busy-text').textContent = 'Rendering…';
    requestRender();
  }
}
$('#download').addEventListener('click', exportImage);
if (new URLSearchParams(location.search).has('debug')) window.__studio = { renderToCanvas, frame, frameBox, frameBands, frameMBand, frameBlock, block, BKM, BLOCK, bloom, BLM, frameBloom, setupBands, applyPose, state, controls, camera, requestRender, phone, box, mband, MBM, bandsRig, LIGHTING, updateLights, renderer, THREE, liveShadow, accumulate, resetShadow, renderMain, groundMat };

// ---------------------------------------------------------------- init
if (IS_TOUCH) $('.hint').textContent = 'Drag to rotate · Pinch to zoom · Two-finger drag to pan';
applyReflect(state.screenReflect);
phoenixTexts();
normalizePick(PHONE_SCREENS, state.pick.iphone);
screenDefaults();
renderPicker();
syncSetupUI();
markBg();
limitResolutions();
resize();
setFocal(state.focal);
drawLightPad();
document.fonts?.ready.then(drawLightPad); // repaint labels once Figtree has loaded
updateExportInfo();
$('#busy-text').textContent = 'Loading studio…';
$('#busy').classList.add('show');
const [standMesh] = await Promise.all([buildStand(M), setScreenPreset('exercise')]);
model.remove(stand);
stand = standMesh;
model.add(stand);
applyPose();
updateLights();
if (isBox()) frameBox(); else if (isBands()) frameBands(); else if (isMBand()) frameMBand(); else if (isBlock()) frameBlock(); else if (isBloom()) frameBloom(); else frame(32, 14);   // a device may have been picked while the studio loaded
$('#busy').classList.remove('show');
$('#busy-text').textContent = 'Rendering…';
// open on a device from a link, e.g. ?device=bands (the Figma "Sword 3D Studio" card links each device this way)
{ const want = new URLSearchParams(location.search).get('device');
  const btn = want && document.querySelector(`[data-seg="device"] button[data-value="${CSS.escape(want)}"]`);
  if (btn && want !== state.device) btn.click(); }
loop();
