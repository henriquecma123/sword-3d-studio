// Phoenix message on the iPhone (Figma "Phoenix message" 13182:100374): a gradient 3D sphere sitting on the phone's edge
// and one or two chat bubbles beside it. Built in the phone's local frame (cm: x right, y up, z = 0 at the back glass),
// so it follows the phone when the camera moves.
import * as THREE from 'three';
import { rrContour, shapeFromPts } from './geometry.js';

export const PHOENIX_MAX = 55;          // characters per bubble
const PT = 0.0245;                      // cm per Figma point, as in the example comps (51 pt sphere ≈ 1.25 cm on the 7.15 cm phone)
const F = { sphere: 51.1, gap: 13.55, bubbleW: 212, padX: 16, padY: 13, lineH: 23, font: 18.82, stackGap: 14, radius: 20 };
const PX = 8;                           // texture pixels per point: sharp at 8K export

// sphere: self-lit in view space so the design reads the same from any angle — peach top-left to blue bottom-right,
// a soft white "cloud" highlight, a darker limb and a light rim for depth
const sphereMat = () => new THREE.ShaderMaterial({
  vertexShader: `varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `varying vec3 vN;
    void main(){
      vec3 n = normalize(vN);
      vec3 peach = vec3(1.0, 0.651, 0.475), lilac = vec3(0.82, 0.72, 0.86), blue = vec3(0.349, 0.576, 0.918);
      float g = clamp(0.5 + 0.62 * dot(n.xy, normalize(vec2(0.72, -0.69))), 0.0, 1.0);
      vec3 col = g < 0.5 ? mix(peach, lilac, g * 2.0) : mix(lilac, blue, g * 2.0 - 1.0);
      vec2 p = n.xy;
      float e1 = length((p - vec2(-0.28, 0.0)) / vec2(0.78, 0.6));
      float e2 = length((p - vec2(0.16, 0.17)) / vec2(0.68, 0.66));
      float cloud = max(1.0 - smoothstep(0.2, 1.0, e1), 1.0 - smoothstep(0.2, 1.0, e2));
      col = mix(col, vec3(1.0), 0.85 * cloud);
      float ndv = clamp(n.z, 0.0, 1.0);
      col *= 0.84 + 0.16 * ndv;
      col += pow(1.0 - ndv, 3.0) * vec3(0.32, 0.36, 0.5);
      col += pow(max(dot(n, normalize(vec3(-0.4, 0.55, 0.75))), 0.0), 40.0) * 0.18;
      gl_FragColor = vec4(min(col, vec3(1.0)), 1.0);
    }`,
});

function glowTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const ctx = cv.getContext('2d'), g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(235,164,134,0.5)'); g.addColorStop(0.45, 'rgba(160,150,220,0.28)'); g.addColorStop(0.7, 'rgba(89,147,234,0.12)'); g.addColorStop(1, 'rgba(89,147,234,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// wrap at 20 characters a line (words kept whole; a longer word is split)
export const PHOENIX_LINE = 20;
function wrap(text) {
  const lines = [];
  let line = '';
  for (let w of text.trim().split(/\s+/).filter(Boolean)) {
    while (w.length > PHOENIX_LINE) { if (line) { lines.push(line); line = ''; } lines.push(w.slice(0, PHOENIX_LINE)); w = w.slice(PHOENIX_LINE); }
    if (!w) continue;
    const t = line ? `${line} ${w}` : w;
    if (t.length > PHOENIX_LINE) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

const FONT = `500 ${F.font}px Figtree, -apple-system, system-ui, sans-serif`;
const DEPTH = 0.03, BEVEL = 0.065;      // cm: a thin core with a fully rounded edge, so the bubble reads as a soft pill in depth

export function createPhoenix() {
  const group = new THREE.Group();
  group.name = 'phoenix';
  const r = (F.sphere * PT) / 2;
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(r, 64, 48), sphereMat());
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, toneMapped: false }));
  glow.scale.setScalar(r * 4.2);
  glow.renderOrder = 2;
  const stack = new THREE.Group();
  group.add(glow, stack, sphere);
  // UI overlay, not a material: no studio lighting or reflections. Apple-style glass instead: the Figma grey at 80%,
  // the scene behind seen through it frosted (a blurred backdrop, sampled in screen space), a soft light rim along the
  // top edge and a faint darker lip at the bottom — all fixed to the view, so they never react to the studio lights
  const bodyMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Vector3(90 / 255, 90 / 255, 93 / 255) },   // display (sRGB) values, written as-is
      uOpacity: { value: 0.8 },
      tBackdrop: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uPad: { value: 0 }, uHasBackdrop: { value: 0 },
    },
    transparent: true, depthWrite: false,
    vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity, uHasBackdrop; uniform sampler2D tBackdrop; uniform vec2 uRes; uniform float uPad; varying vec3 vN;
      void main(){
        vec3 n = normalize(vN); float f = clamp(n.z, 0.0, 1.0);
        vec4 bd = uHasBackdrop > 0.5 ? texture2D(tBackdrop, (gl_FragCoord.xy + uPad) / (uRes + 2.0 * uPad)) : vec4(0.0);
        vec3 bdc = pow(max(bd.rgb, 0.0), vec3(1.0 / 2.2));                 // backdrop is linear and premultiplied
        vec3 tint = uColor * (0.88 + 0.12 * sqrt(f));
        vec3 col = tint * uOpacity + bdc * (1.0 - uOpacity);               // premultiplied result
        float alpha = uOpacity + (1.0 - uOpacity) * bd.a;
        float rim = 1.0 - smoothstep(0.2, 0.9, f);
        float hl = clamp(dot(n.xy, normalize(vec2(-0.4, 0.92))), 0.0, 1.0);
        float lo = clamp(dot(n.xy, normalize(vec2(0.4, -0.92))), 0.0, 1.0);
        col += vec3(0.42) * rim * hl * alpha;                              // light catching the top edge
        col *= 1.0 - 0.14 * rim * lo;                                       // a touch darker underneath
        col += vec3(0.035) * alpha;                                         // the faint milky lift of frosted glass
        gl_FragColor = vec4(col / max(alpha, 1e-3), alpha);
      }`,
  });
  const measure = document.createElement('canvas').getContext('2d');
  let bubbles = [];   // { w, h (pt), body, text }

  // one slab per non-empty text, as wide as its longest line
  function setTexts(texts) {
    for (const b of bubbles) { b.body.geometry.dispose(); b.text.geometry.dispose(); b.text.material.map.dispose(); b.text.material.dispose(); stack.remove(b.body, b.text); }
    bubbles = [];
    measure.font = FONT;
    for (const t of texts) {
      const lines = wrap(t.slice(0, PHOENIX_MAX));
      if (!lines.length) continue;
      const w = Math.ceil(Math.max(...lines.map((l) => measure.measureText(l).width))) + 2 * F.padX;
      const h = 2 * F.padY + lines.length * F.lineH;
      const wc = w * PT, hc = h * PT, rc = Math.min(F.radius * PT, hc / 2);
      const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shapeFromPts(rrContour(wc - 2 * BEVEL, hc - 2 * BEVEL, rc - BEVEL, 12)),
        { depth: DEPTH, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 10, curveSegments: 16 }), bodyMat);
      body.geometry.translate(0, 0, -DEPTH / 2); body.renderOrder = 2;
      const cv = document.createElement('canvas'); cv.width = w * PX; cv.height = h * PX;
      const ctx = cv.getContext('2d'); ctx.setTransform(PX, 0, 0, PX, 0, 0);
      ctx.fillStyle = '#ffffff'; ctx.font = FONT; ctx.textBaseline = 'middle';
      lines.forEach((l, j) => ctx.fillText(l, F.padX, F.padY + F.lineH * (j + 0.5)));
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      const text = new THREE.Mesh(new THREE.PlaneGeometry(wc, hc), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
      text.position.z = DEPTH / 2 + BEVEL + 0.002; text.renderOrder = 3;
      stack.add(body, text);
      bubbles.push({ w, h, body, text });
    }
    group.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
  }

  // side: left | center | right; t: sphere centre, 0 = top edge of the phone, 1 = bottom edge (a little beyond both allowed)
  function layout(side, t, phone) {
    const { W, H, T } = phone;
    const gap = F.gap * PT, maxW = Math.max(0, ...bubbles.map((b) => b.w)) * PT;
    const stackH = (bubbles.reduce((a, b) => a + b.h, 0) + F.stackGap * Math.max(0, bubbles.length - 1)) * PT;
    const yc = H / 2 - t * H;
    let sx;
    if (side === 'left') sx = -W / 2;
    else if (side === 'center') sx = -(2 * r + gap + maxW) / 2 + r;
    else sx = W / 2;
    const zs = T + r + 0.12;   // clear of the glass: it floats just in front of the phone
    sphere.position.set(sx, yc, zs);
    glow.position.set(sx, yc, zs - 0.02);
    // the stack sits beside the sphere, its bottom level with the sphere's bottom (as in Figma); left side mirrors it
    const dir = side === 'left' ? -1 : 1, ax = sx + dir * (r + gap);
    let top = yc - r + stackH;
    for (const b of bubbles) {
      const wc = b.w * PT, hc = b.h * PT;
      const x = ax + dir * wc / 2, y = top - hc / 2;
      b.body.position.set(x, y, zs); b.text.position.set(x, y, zs + DEPTH / 2 + BEVEL + 0.002);
      top -= hc + F.stackGap * PT;
    }
  }

  // frosted backdrop: the scene without the Phoenix, rendered small and blurred, for the bubbles to sample
  const BACKDROP_H = 500;   // backdrop texels across the whole picture's height: the same frost on screen and in big exports
  const rtA = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }), rtB = rtA.clone();
  const blurMat = new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null }, uStep: { value: new THREE.Vector2() } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tSrc; uniform vec2 uStep; varying vec2 vUv;
      void main(){ vec4 c = texture2D(tSrc, vUv) * 0.2270270;
        c += (texture2D(tSrc, vUv + uStep * 1.3846154) + texture2D(tSrc, vUv - uStep * 1.3846154)) * 0.3162162;
        c += (texture2D(tSrc, vUv + uStep * 3.2307692) + texture2D(tSrc, vUv - uStep * 3.2307692)) * 0.0702703;
        gl_FragColor = c; }`,
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blurMat), qScene = new THREE.Scene(), qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  qScene.add(quad);
  const _size = new THREE.Vector2();
  function prepareBackdrop(renderer, scene, camera) {
    if (!group.visible || !bubbles.length) return;
    renderer.getDrawingBufferSize(_size);
    const v = camera.view && camera.view.enabled ? { ...camera.view } : null;   // an export tile of a bigger picture
    const D = Math.max(1, (v ? v.fullHeight * _size.y / v.height : _size.y) / BACKDROP_H);
    const pad = v ? Math.round(32 * D) : 0;   // tiles look a little past their edges, so the frost never seams between them
    const w = Math.max(1, Math.round((_size.x + 2 * pad) / D)), h = Math.max(1, Math.round((_size.y + 2 * pad) / D));
    if (rtA.width !== w || rtA.height !== h) { rtA.setSize(w, h); rtB.setSize(w, h); }
    const prev = renderer.getRenderTarget(), auto = renderer.autoClear;
    group.visible = false;
    if (v) { const k = v.width / _size.x; camera.setViewOffset(v.fullWidth, v.fullHeight, v.offsetX - pad * k, v.offsetY - pad * k, v.width + 2 * pad * k, v.height + 2 * pad * k); }
    renderer.setRenderTarget(rtA); renderer.autoClear = true; renderer.render(scene, camera);
    if (v) camera.setViewOffset(v.fullWidth, v.fullHeight, v.offsetX, v.offsetY, v.width, v.height);
    for (let i = 0; i < 4; i++) {   // repeated separable passes, widening each time: a soft, wide frost
      const k = 1.4 + i * 1.1;
      blurMat.uniforms.tSrc.value = rtA.texture; blurMat.uniforms.uStep.value.set(k / w, 0); renderer.setRenderTarget(rtB); renderer.render(qScene, qCam);
      blurMat.uniforms.tSrc.value = rtB.texture; blurMat.uniforms.uStep.value.set(0, k / h); renderer.setRenderTarget(rtA); renderer.render(qScene, qCam);
    }
    group.visible = true;
    renderer.setRenderTarget(prev); renderer.autoClear = auto;
    bodyMat.uniforms.tBackdrop.value = rtA.texture; bodyMat.uniforms.uRes.value.copy(_size); bodyMat.uniforms.uPad.value = pad; bodyMat.uniforms.uHasBackdrop.value = 1;
  }

  return { group, setTexts, layout, prepareBackdrop };
}
