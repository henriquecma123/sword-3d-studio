// Sword Pad Box: the Sword Pad's white rigid gift box, built in code from the Figma renders (Brand Library Assets,
// nodes 6030:119959 closed and 6030:119960 open with the pad) and the reference photos in "Pad box/figma/".
// Units: centimetres. Local frame: x along the box's long side (the lid's logo reads along +x), y up, z towards the
// front (the long side that carries the logo); centred on the box, floor at y = 0.
// - A white base (tray) with a white insert, the pad lying screen up in the insert's pad-shaped recess.
// - A full-depth lid ("telescope" lid) that covers the base down to the floor. Printed in black with the Sword logo
//   (Figma 11668:3634) where the Thrive box carries its logo (6030:119959): the logo in the middle of the top and on
//   the right of the long sides, the symbol in the middle of the short sides.
// - A sheet of tracing paper over the pad, as when the box is first opened; it can be peeled back and raised.
// - The pad's screen: set like the Sword Pad's (the studio's screen section), its own, off by default.
// - Solid: the open lid rises clear of the box, the pad and the paper below it, and stays above the floor.
import * as THREE from 'three';

const base = new URL('./', import.meta.url);
const loadImg = (name) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = new URL(name, base).href; });
const [logoImg, symbolImg] = await Promise.all([loadImg('assets/sword-logo-mono.svg'), loadImg('assets/sword-symbol-mono.svg')]);
// the kit's cards, from the brand's print files (Packaging/Thrive/3 - Thrive Pad): the welcome card (CORP-034-PT-01,
// 10 x 10 cm) and the return card (CORP-009CV-US-02 in English, CORP-009-PT-04 in Portuguese, 8 x 8 cm), front and back
const CARD_IMG = Object.fromEntries(await Promise.all(['welcome-pt-front', 'welcome-pt-back', 'return-en-front', 'return-en-back', 'return-pt-front', 'return-pt-back']
  .map(async (k) => [k, await loadImg(`assets/cards/${k}.jpg`)])));
const LOGO_AR = 285 / 69.5205, SYM_AR = 36.92 / 69.5205;   // the SVGs' viewBoxes

// the pad: 26 x 18.68 x 0.92 (geometry.js DIM)
export const PB = {
  base: { W: 27.4, D: 20.1, H: 4.3, t: 0.16 },          // the tray
  lid: { gap: 0.1, top: 0.18, t: 0.16, extra: 0.1 },    // walls clear the base by gap; the lid stands this much taller
  r: 0.07,                                              // the board's corner radius (plan view): a wrapped, crisp corner
  bevel: 0.035,                                         // the wrapped edges' round: crisp, as on Apple's boxes
  recess: 0.6,                                          // the pad sits this deep in the insert
  padBelowRim: 0.35,                                    // the pad's screen sits this far under the base's rim
};
const B = PB.base;
export const LID = { W: B.W + 2 * (PB.lid.gap + PB.lid.t), D: B.D + 2 * (PB.lid.gap + PB.lid.t), H: B.H + PB.lid.top + PB.lid.extra };
export const PADBOX_DEFAULTS = { lid: 'open', lidLift: 12, lidTilt: 14, lidSlide: -10, pad: true, padTilt: 0, paper: true, paperLift: 0, paperRaise: 0, charger: 'eu', lang: 'en' };
// the prints (cm), measured on the Thrive box's renders (Figma 6030:119959, 6030:119961) against the box's size: the
// logo 5.8 cm wide in the middle of the top; 3.9 cm wide in the middle of the long sides; the symbol 1 cm tall in the
// middle of the short sides
const PRINT = { top: 5.8, side: 3.9, sideX: 0, sym: 1.0 };
// heights inside the base
const PAD_TOP = B.H - PB.padBelowRim, PAD_BOTTOM = PAD_TOP - 0.92, INS_TOP = PAD_BOTTOM + PB.recess;

// ---------------------------------------------------------------- shapes
function rrShape(w, h, r, Path = THREE.Shape) {
  const s = new Path(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
// an extruded plan shape standing from y0 to y1 (plan: x, and z towards the front); steps: rings up the walls (for
// the baked shading)
function slab(shape, y0, y1, bevel = PB.bevel, steps = 1) {
  const b = Math.min(bevel, (y1 - y0) / 2.2);
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, y1 - y0 - 2 * b), steps, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 6, curveSegments: 16 });
  g.rotateX(-Math.PI / 2);                     // extrusion (+z) -> +y; the shape's y -> -z
  g.translate(0, y0 + b, 0);
  return g;
}
const ring = (w, h, t, r) => { const s = rrShape(w, h, r); s.holes.push(rrShape(w - 2 * t, h - 2 * t, Math.max(0.02, r - t * 0.5), THREE.Path)); return s; };
// smooth shading across the facets of curved walls: normals of the same point that differ by less than ~40 degrees
// are averaged (the walls' corners with the floors and tops stay crisp)
function smoothWalls(g, cosMax = 0.75) {
  const P = g.attributes.position, N = g.attributes.normal, map = new Map(), key = (i) => `${Math.round(P.getX(i) * 2000)},${Math.round(P.getY(i) * 2000)},${Math.round(P.getZ(i) * 2000)}`;
  for (let i = 0; i < P.count; i++) { const k = key(i); (map.get(k) || map.set(k, []).get(k)).push(i); }
  const out = new Float32Array(N.count * 3), a = new THREE.Vector3(), b = new THREE.Vector3(), sum = new THREE.Vector3();
  for (const ids of map.values()) for (const i of ids) {
    a.fromBufferAttribute(N, i); sum.set(0, 0, 0);
    for (const j of ids) { b.fromBufferAttribute(N, j); if (a.dot(b) > cosMax) sum.add(b); }
    sum.normalize(); out[i * 3] = sum.x; out[i * 3 + 1] = sum.y; out[i * 3 + 2] = sum.z;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  return g;
}
// baked soft shading (ambient occlusion) as vertex colours: f(position, normal) -> 0..1
function shade(g, f) {
  const P = g.attributes.position, N = g.attributes.normal, c = new Float32Array(P.count * 3), p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) { p.fromBufferAttribute(P, i); n.fromBufferAttribute(N, i); const v = f(p, n); c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = v; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const facesIn = (p, n) => n.x * -p.x + n.z * -p.z > 0.3 * Math.hypot(p.x, p.z) && Math.abs(n.y) < 0.5;

// ---------------------------------------------------------------- textures
// the wrap paper: a fine, faintly fibrous coated stock (a height map, cm-scaled: one tile per 3 cm)
function paperTexture(n = 512) {
  const c = document.createElement('canvas'); c.width = c.height = n;
  const x = c.getContext('2d');
  x.fillStyle = '#808080'; x.fillRect(0, 0, n, n);
  const im = x.getImageData(0, 0, n, n), d = im.data;
  for (let i = 0; i < n * n; i++) { const v = (Math.random() - 0.5) * 26; d[i * 4] += v; d[i * 4 + 1] += v; d[i * 4 + 2] += v; }
  x.putImageData(im, 0, 0);
  x.globalAlpha = 0.07; x.lineCap = 'round';
  for (let k = 0; k < 2600; k++) {   // short fibres, mostly along one direction (the paper's grain)
    const px = Math.random() * n, py = Math.random() * n, a = (Math.random() - 0.5) * 0.9, l = 3 + Math.random() * 10;
    x.strokeStyle = Math.random() < 0.5 ? '#fff' : '#000'; x.lineWidth = 0.6 + Math.random() * 0.8;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
  }
  // softened a little: per-pixel noise beats into a fine grid on faces seen at a slant
  const soft = document.createElement('canvas'); soft.width = soft.height = n;
  const sx = soft.getContext('2d'); sx.filter = 'blur(1.2px)';
  for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) sx.drawImage(c, ox, oy);   // (tiles without seams)
  x.drawImage(soft, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 3, 1 / 3); t.anisotropy = 8;
  return t;
}
// uncoated card (the insert, the linings): soft pulp, larger and rounder than the coated wrap's fibre, softened so it
// never beats into a grid (a height map, one tile per 6 cm)
function pulpTexture(n = 512) {
  const c = document.createElement('canvas'); c.width = c.height = n;
  const x = c.getContext('2d');
  x.fillStyle = '#808080'; x.fillRect(0, 0, n, n);
  for (let k = 0; k < 5000; k++) {
    const px = Math.random() * n, py = Math.random() * n, r = 1.5 + Math.random() * 6, v = Math.random() < 0.5 ? 255 : 0;
    for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) {
      const g = x.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, r); g.addColorStop(0, `rgba(${v},${v},${v},0.08)`); g.addColorStop(1, `rgba(${v},${v},${v},0)`);
      x.fillStyle = g; x.fillRect(px + ox - r, py + oy - r, 2 * r, 2 * r);
    }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 6, 1 / 6); t.anisotropy = 8;
  return t;
}
// a card face as a texture: the print file's page, patched where it needs to be:
// - the welcome card in English (only a Portuguese file exists): its two lines of text replaced on the same gradient
//   (each text's box filled by blending, column by column, the colours just above and below it), its testimonial on
//   the back translated
// - the English return card's back: the old Thrive logo replaced by the Sword logo, as on the Portuguese card
function cardFace(key, lang, maxAniso) {
  const img = CARD_IMG[key.replace('-xx-', '-pt-')];   // the Portuguese design for both languages (English: its text replaced)
  const c = document.createElement('canvas'), W = c.width = img ? img.naturalWidth : 1024, H = c.height = img ? img.naturalHeight : 1024;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); if (img) x.drawImage(img, 0, 0);
  const sans = (wt, px) => `${wt} ${Math.round(px)}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  const blendOut = (x0, y0, x1, y1) => {   // fill a box with the gradient around it
    const X0 = Math.round(x0 * W), X1 = Math.round(x1 * W), Y0 = Math.round(y0 * H), Y1 = Math.round(y1 * H);
    const top = x.getImageData(X0, Y0 - 2, X1 - X0, 1).data, bot = x.getImageData(X0, Y1 + 2, X1 - X0, 1).data, out = x.createImageData(X1 - X0, Y1 - Y0);
    for (let yy = 0; yy < Y1 - Y0; yy++) { const t = yy / (Y1 - Y0); for (let xx = 0; xx < X1 - X0; xx++) for (let k = 0; k < 4; k++) out.data[(yy * (X1 - X0) + xx) * 4 + k] = top[xx * 4 + k] * (1 - t) + bot[xx * 4 + k] * t; }
    x.putImageData(out, X0, Y0);
  };
  if (key === 'welcome-xx-front' && lang === 'en') {
    blendOut(0.33, 0.335, 0.67, 0.415); blendOut(0.13, 0.725, 0.87, 0.805);
    x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    x.font = sans(500, 0.047 * W); x.fillText('Welcome to', W / 2, 0.393 * H);
    x.font = sans(500, 0.04 * W); x.fillText('Real testimonials, from real patients.', W / 2, 0.781 * H);
  }
  if (key === 'welcome-xx-back' && lang === 'en') {
    x.fillStyle = '#ffffff'; x.fillRect(0.1 * W, 0.38 * H, 0.8 * W, 0.2 * H); x.fillRect(0.45 * W, 0.682 * H, 0.3 * W, 0.04 * H);
    x.fillStyle = '#1f222c'; x.textAlign = 'center'; x.font = `400 ${Math.round(0.046 * W)}px Lora, Georgia, "Times New Roman", serif`;
    ['With Sword, every session brought', 'improvements, until the day I woke', 'up completely free of pain.'].forEach((l, k) => x.fillText(l, W / 2, (0.425 + k * 0.058) * H));
    x.textAlign = 'left'; x.fillStyle = '#3a3d45'; x.font = sans(400, 0.024 * W); x.fillText('Sword Member', 0.457 * W, 0.708 * H);
  }
  // the return card in English: the Portuguese card's design, the English card's words (CORP-009CV-US-02)
  const serif = (px) => `400 ${Math.round(px)}px Lora, Georgia, "Times New Roman", serif`;
  const ink = '#24272e';
  const fillRect = (col, x0, y0, x1, y1) => { x.fillStyle = col; x.fillRect(x0 * W, y0 * H, (x1 - x0) * W, (y1 - y0) * H); };
  const colourAt = (fx, fy) => { const d = x.getImageData(Math.round(fx * W), Math.round(fy * H), 1, 1).data; return `rgb(${d[0]},${d[1]},${d[2]})`; };
  const lines = (arr, fx, fy, size, lh, opts = {}) => arr.forEach((l, k) => {
    const bold = typeof l === 'object'; x.font = (bold ? sans(600, size * W) : opts.font ? opts.font(size * W) : sans(400, size * W));
    x.fillStyle = opts.color || ink; x.textAlign = opts.align || 'left'; x.fillText(bold ? l.b : l, fx * W, (fy + k * lh) * H);
  });
  if (key === 'return-xx-front' && lang === 'en') {
    const white = colourAt(0.02, 0.5), box = colourAt(0.1, 0.29);
    fillRect(white, 0.045, 0.03, 0.83, 0.25);                                   // the title and the intro
    fillRect(white, 0.86, 0.074, 0.932, 0.114);                                 // inside the language tag
    for (const [bx, by] of [[0.068, 0.268], [0.519, 0.268], [0.068, 0.515], [0.519, 0.515]]) fillRect(box, bx + 0.012, by + 0.012, bx + 0.405, by + 0.205);
    x.textBaseline = 'alphabetic';
    lines(['Keep this!'], 0.068, 0.117, 0.066, 0, { font: serif });
    lines(['EN'], 0.896, 0.104, 0.031, 0, { align: 'center', font: (px) => sans(400, px) });
    lines(['Once you’ve completed your Sword program,', 'follow the steps below to return your kit.'], 0.068, 0.178, 0.0345, 0.049);
    const step = (n, arr, bx, by) => { x.font = sans(600, 0.03 * W); x.fillStyle = ink; x.textAlign = 'left'; x.fillText(`${n}.`, bx * W, by * H); const nw = x.measureText(`${n}. `).width / W;
      arr.forEach((l, k) => { const bold = typeof l === 'object'; x.font = sans(bold ? 600 : 400, 0.03 * W); x.fillText(bold ? l.b : l, (k === 0 ? bx + nw : bx) * W, (by + k * 0.036) * H); }); };
    step(1, ['Assemble your kit', 'contents and place the kit', 'inside any shipping box.'], 0.09, 0.322);
    step(2, ['Stick the prepaid Return', 'Label to the outside of the', 'box, on top of any old label.'], 0.541, 0.322);
    step(3, ['Scan this QR code to find', 'a UPS location near you.'], 0.09, 0.569);
    step(4, ['Bring the box to your local', 'UPS store.', { b: 'They’ll take it from there!' }], 0.541, 0.569);
  }
  if (key === 'return-xx-back' && lang === 'en') {
    const white = colourAt(0.02, 0.5), box = colourAt(0.1, 0.3);
    fillRect(white, 0.045, 0.03, 0.97, 0.245);                                  // the title and its line
    fillRect(box, 0.085, 0.29, 0.92, 0.58);                                     // inside the blue box
    fillRect(white, 0.045, 0.72, 0.97, 0.86); fillRect(white, 0.045, 0.86, 0.76, 0.965);   // the questions and contacts (the logo stays)
    x.textBaseline = 'alphabetic';
    lines(['Prefer a pickup?'], 0.068, 0.112, 0.064, 0, { font: serif });
    lines(['Schedule a kit pickup on the Sword mobile app,', 'or reach out to us.'], 0.068, 0.178, 0.033, 0.047);
    lines(['You just helped the planet.'], 0.115, 0.352, 0.045, 0, { font: serif, color: '#3d64a6' });
    lines(['By returning your kit, you’re helping protect', 'the planet by reducing landfill waste.'], 0.115, 0.42, 0.032, 0.049);
    lines([{ b: 'If you have questions about returning your kit,' }, { b: 'we’re here to help!' }], 0.068, 0.77, 0.032, 0.049);
    lines(['Email: help@swordhealth.com', 'Phone: +1 (209) 512-4634'], 0.068, 0.879, 0.032, 0.05);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso;
  return t;
}
// a card (w x h cm, thickness th) lying flat, its front up: front and back faces from the print, a white cut edge;
// notchR: the welcome card's half-round cut-outs at the middle of its left and right edges
function buildCard(front, back, w, h, notchR, PBM) {
  const g = new THREE.Group(), r = 0.12, th = 0.035, pts = [];
  const arc = (cx, cy, a0, a1, rr, n) => { for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; pts.push(new THREE.Vector2(cx + rr * Math.cos(a), cy + rr * Math.sin(a))); } };
  const hw = w / 2, hh = h / 2;
  arc(hw - r, -hh + r, -Math.PI / 2, 0, r, 6);
  if (notchR) arc(hw, 0, -Math.PI / 2, -1.5 * Math.PI, notchR, 24);    // into the card from its right edge
  arc(hw - r, hh - r, 0, Math.PI / 2, r, 6); arc(-hw + r, hh - r, Math.PI / 2, Math.PI, r, 6);
  if (notchR) arc(-hw, 0, Math.PI / 2, -Math.PI / 2, notchR, 24);      // and from its left edge
  arc(-hw + r, -hh + r, Math.PI, 1.5 * Math.PI, r, 6);
  const shape = fromPts(pts);
  const face = (tex, up) => {
    const geo = new THREE.ShapeGeometry(shape, 8), uv = geo.attributes.uv, P = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (P.getX(i) + hw) / w, (P.getY(i) + hh) / h);
    const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.5, specularIntensity: 0.45, sheen: 0.15, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ffffff') }));
    m.rotation.x = up ? -Math.PI / 2 : Math.PI / 2; m.position.y = up ? th : 0; if (!up) m.scale.x = -1;   // the back: seen from below, read the right way
    m.receiveShadow = true; m.castShadow = true; return m;
  };
  g.add(face(front, true), face(back, false));
  // the cut edge: the extrusion's walls only (its caps would sit a hair under the printed faces and flicker through
  // them, in white stripes, at some distances)
  const edge = new THREE.ExtrudeGeometry(shape, { depth: th, bevelEnabled: false, curveSegments: 8 }); edge.rotateX(-Math.PI / 2);
  edge.groups = edge.groups.filter((gr) => gr.materialIndex === 1).map((gr) => ({ ...gr, materialIndex: 0 }));
  g.add(new THREE.Mesh(edge, [PBM.cardEdge]));
  return g;
}
// an outline in the plan (x, and z towards the front), corners rounded r, with a thumb notch (a half circle, radius
// nr, centred at x = nx) cut into its back edge; as a shape (or a hole's path)
// a closed outline (plan points: x, and the shape's y = -z) as a shape or a hole's path
function fromPts(pts, Path = THREE.Shape) { const s = new Path(); s.setFromPoints(pts); if (s.closePath) s.closePath(); return s; }
// a moulded well (thermoformed): from the outline (plan points, counter-clockwise), a rounded lip down from the
// surface (radius rl), a straight wall, a soft inside fillet (rf) into a flat floor depth below the surface. Its
// top ring sits rl outside the outline, where the surface's opening is cut (cupOpening)
function offsetPts(pts, d) {   // moved in (d > 0) along each point's inward normal
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n], tx = b.x - a.x, ty = b.y - a.y, l = Math.hypot(tx, ty) || 1;
    out.push(new THREE.Vector2(pts[i].x - (ty / l) * d, pts[i].y + (tx / l) * d));
  }
  return out;
}
const ccw = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; } return a > 0 ? pts : pts.slice().reverse(); };
const dedupe = (pts) => pts.filter((p, i) => i === 0 || p.distanceTo(pts[i - 1]) > 1e-4).filter((p, i, A) => i < A.length - 1 || p.distanceTo(A[0]) > 1e-4);
function cupGeometry(pts0, top, depth, rl, rf, K = 6) {
  const pts = ccw(dedupe(pts0)), prof = [];
  for (let k = 0; k <= K; k++) { const a = (k / K) * Math.PI / 2; prof.push([-rl + rl * Math.sin(a), top - rl + rl * Math.cos(a)]); }
  for (let k = 0; k <= K; k++) { const a = (k / K) * Math.PI / 2; prof.push([rf - rf * Math.cos(a), top - depth + rf - rf * Math.sin(a)]); }
  const n = pts.length, pos = [], idx = [];
  for (const [d, y] of prof) for (const p of offsetPts(pts, d)) pos.push(p.x, y, -p.y);
  for (let r = 0; r < prof.length - 1; r++) for (let i = 0; i < n; i++) {
    const a = r * n + i, b = r * n + (i + 1) % n, c = (r + 1) * n + i, e = (r + 1) * n + (i + 1) % n;
    idx.push(a, c, b, b, c, e);
  }
  const wall = new THREE.BufferGeometry(); wall.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); wall.setIndex(idx); wall.computeVertexNormals();
  const floor = new THREE.ShapeGeometry(fromPts(offsetPts(pts, rf)), 1); floor.rotateX(-Math.PI / 2); floor.translate(0, top - depth, 0);
  return { wall, floor, opening: offsetPts(pts, -rl) };
}
function notchedPts(x0, x1, z0, z1, r, nx, nr) {
  const pts = [], arc = (cx, cy, a0, a1, rr, n = 10) => { for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; pts.push(new THREE.Vector2(cx + rr * Math.cos(a), cy + rr * Math.sin(a))); } };
  const y0 = -z1, y1 = -z0;
  arc(x0 + r, y0 + r, Math.PI, 1.5 * Math.PI, r); arc(x1 - r, y0 + r, 1.5 * Math.PI, 2 * Math.PI, r);
  arc(x1 - r, y1 - r, 0, 0.5 * Math.PI, r);
  if (nr) { // the thumb notch, its shoulders softly rounded into the back edge
    const sr = 0.35;
    arc(nx + nr + sr, y1 + sr, 1.5 * Math.PI, Math.PI, sr, 6);
    arc(nx, y1 + sr, 0, Math.PI, nr, 32);
    arc(nx - nr - sr, y1 + sr, 2 * Math.PI, 1.5 * Math.PI, sr, 6);
  }
  arc(x0 + r, y1 - r, 0.5 * Math.PI, Math.PI, r);
  return pts.filter((p) => Number.isFinite(p.x));
}
function stadiumPts(cx, cz, w, l) {
  const r = w / 2, h = l / 2 - r, pts = [];
  for (let k = 0; k <= 48; k++) { const a = Math.PI + Math.PI * k / 48; pts.push(new THREE.Vector2(cx + r * Math.cos(a), -(cz + h) + r * Math.sin(a))); }
  for (let k = 0; k <= 48; k++) { const a = Math.PI * k / 48; pts.push(new THREE.Vector2(cx + r * Math.cos(a), -(cz - h) + r * Math.sin(a))); }
  return pts;
}
function notched(x0, x1, z0, z1, r, nx, nr, Path = THREE.Shape) {
  const pts = [], arc = (cx, cy, a0, a1, rr, n = 12) => { for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; pts.push(new THREE.Vector2(cx + rr * Math.cos(a), cy + rr * Math.sin(a))); } };
  const y0 = -z1, y1 = -z0;   // the shape's y is -z: the back edge is its top
  arc(x0 + r, y0 + r, Math.PI, 1.5 * Math.PI, r); arc(x1 - r, y0 + r, 1.5 * Math.PI, 2 * Math.PI, r);
  arc(x1 - r, y1 - r, 0, 0.5 * Math.PI, r);
  if (nr) arc(nx, y1, 0, Math.PI, nr, 40);   // the notch, bulging out past the back edge
  arc(x0 + r, y1 - r, 0.5 * Math.PI, Math.PI, r);
  const s = new Path(); s.setFromPoints(pts); if (s.closePath) s.closePath();
  return s;
}
// a stadium (two half circles joined), its long axis along z
function stadium(cx, cz, w, l, Path = THREE.Shape) {
  const r = w / 2, h = l / 2 - r, pts = [];
  for (let k = 0; k <= 64; k++) { const a = Math.PI + Math.PI * k / 64; pts.push(new THREE.Vector2(cx + r * Math.cos(a), -(cz + h) + r * Math.sin(a))); }
  for (let k = 0; k <= 64; k++) { const a = Math.PI * k / 64; pts.push(new THREE.Vector2(cx + r * Math.cos(a), -(cz - h) + r * Math.sin(a))); }
  const s = new Path(); s.setFromPoints(pts); if (s.closePath) s.closePath();
  return s;
}
// an embossed ink print: the logo pressed up out of the board, its ink a glossy black over the raised surface. From the
// artwork (w x h cm, drawn inside a margin pad round it): the ink (black, the logo's alpha), the height (the logo
// softened: the emboss's rounded shoulders) and the board's raised surround (a wider soft mask, where the shoulders
// show on the white board)
function embossPrint(img, w, h, maxAniso, pad = 0.08) {
  const PX = 520, W = Math.round((w + 2 * pad) * PX), H = Math.round((h + 2 * pad) * PX), P = pad * PX;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const ink = mk(), ix = ink.getContext('2d');
  if (img) { ix.drawImage(img, P, P, W - 2 * P, H - 2 * P); ix.globalCompositeOperation = 'source-in'; ix.fillStyle = '#3b3e45'; /* a dark grey ink, softer than black */ ix.fillRect(0, 0, W, H); }
  const white = mk(), wx = white.getContext('2d');
  wx.fillStyle = '#000'; wx.fillRect(0, 0, W, H);
  if (img) { const t = mk(), tx = t.getContext('2d'); tx.drawImage(img, P, P, W - 2 * P, H - 2 * P); tx.globalCompositeOperation = 'source-in'; tx.fillStyle = '#fff'; tx.fillRect(0, 0, W, H); wx.drawImage(t, 0, 0); }
  const soft = (src, blurPx) => { const c = mk(), x = c.getContext('2d'); x.filter = `blur(${blurPx}px)`; x.drawImage(src, 0, 0); return c; };
  const height = soft(white, 0.009 * PX), around = soft(soft(white, 0.03 * PX), 0.03 * PX);
  // the ink's surface: a fine, even stipple, as offset ink laid on coated board takes (a roughness map)
  const grain = mk(), gx = grain.getContext('2d'), gd = gx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) { const v = 118 + Math.random() * 40; gd.data[i * 4] = gd.data[i * 4 + 1] = gd.data[i * 4 + 2] = v; gd.data[i * 4 + 3] = 255; }
  gx.putImageData(gd, 0, 0); const grainS = soft(grain, 0.6);
  { const x = around.getContext('2d'), d = x.getImageData(0, 0, W, H); for (let i = 0; i < d.data.length; i += 4) { const v = Math.min(255, d.data[i] * 3); d.data[i] = d.data[i + 1] = d.data[i + 2] = v; } x.putImageData(d, 0, 0); }
  const tex = (c, srgb) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; return t; };
  return { ink: tex(ink, true), height: tex(height), around: tex(around), grain: tex(grainS), w: w + 2 * pad, h: h + 2 * pad };
}
function decalTexture(img, wcm, hcm, maxAniso) {
  const PX = 420;   // px per cm
  const c = document.createElement('canvas'); c.width = Math.round(wcm * PX); c.height = Math.round(hcm * PX);
  if (img) c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso;
  return t;
}

// tracing paper's look through the light: its cloudy "formation" (denser and thinner flocks of fibre) and a few
// fibres, over the whole sheet (uv 0..1)
// the sheet's outline: a rounded rectangle (its corners cut round, r cm) as an alpha mask over its uv
function cornerMask(w, h, r, px = 60) {
  const c = document.createElement('canvas'); c.width = Math.round(w * px); c.height = Math.round(h * px);
  const x = c.getContext('2d'), R = r * px;
  x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#fff'; x.beginPath(); x.roundRect(1, 1, c.width - 2, c.height - 2, R); x.fill();
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8;
  return t;
}
function formationTexture(n = 2048) {
  const c = document.createElement('canvas'); c.width = c.height = n;
  const x = c.getContext('2d');
  x.fillStyle = '#c8c8c8'; x.fillRect(0, 0, n, n);
  for (const [count, rMin, rMax, a] of [[260, 80, 240, 0.02], [900, 24, 80, 0.025], [6000, 5, 22, 0.028]]) {
    for (let k = 0; k < count; k++) {
      const px = Math.random() * n, py = Math.random() * n, r = rMin + Math.random() * (rMax - rMin), v = Math.random() < 0.5 ? 255 : 120;
      const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, `rgba(${v},${v},${v},${a})`); g.addColorStop(1, `rgba(${v},${v},${v},0)`);
      x.fillStyle = g; x.fillRect(px - r, py - r, 2 * r, 2 * r);
    }
  }
  x.lineCap = 'round';
  for (let k = 0; k < 4200; k++) {
    const px = Math.random() * n, py = Math.random() * n, a = Math.random() * Math.PI, l = 8 + Math.random() * 34;
    x.strokeStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.05})`; x.lineWidth = 0.5 + Math.random();
    x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + Math.cos(a + 0.4) * l * 0.5, py + Math.sin(a + 0.4) * l * 0.5, px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8;
  return t;
}

// soft shading inside the box's cavities (ambient occlusion), worked out per pixel from where the surface is in the
// cavity: darker near the walls, the floor (or the lid's ceiling) and their corners, and deeper in. Cavities in the
// mesh's own frame: lo, hi corners; closed: +1 at the bottom (the base), -1 at the top (the lid)
function cavityShading(mat, lo, hi, closed, key) {
  const uniforms = { uCavLo: { value: new THREE.Vector3(...lo) }, uCavHi: { value: new THREE.Vector3(...hi) }, uCavClosed: { value: closed } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCavP;\nvarying vec3 vCavN;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n\tvCavN = objectNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvCavP = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vCavP;
varying vec3 vCavN;
uniform vec3 uCavLo;
uniform vec3 uCavHi;
uniform float uCavClosed;
float cavityAO() {
	vec3 p = vCavP, n = normalize( vCavN );
	if ( any( lessThan( p, uCavLo - 0.03 ) ) || any( greaterThan( p, uCavHi + 0.03 ) ) ) return 1.0;
	float ao = 1.0;
	if ( abs( n.x ) < 0.5 ) ao *= ( 1.0 - 0.38 * exp( -( p.x - uCavLo.x ) / 0.9 ) ) * ( 1.0 - 0.38 * exp( -( uCavHi.x - p.x ) / 0.9 ) );
	if ( abs( n.z ) < 0.5 ) ao *= ( 1.0 - 0.38 * exp( -( p.z - uCavLo.z ) / 0.9 ) ) * ( 1.0 - 0.38 * exp( -( uCavHi.z - p.z ) / 0.9 ) );
	float toEnd = uCavClosed > 0.0 ? p.y - uCavLo.y : uCavHi.y - p.y;          // to the floor (base) or the ceiling (lid)
	if ( abs( n.y ) < 0.5 ) ao *= 1.0 - 0.45 * exp( -toEnd / 0.8 );
	float depth = uCavClosed > 0.0 ? uCavHi.y - p.y : p.y - uCavLo.y;          // in from the opening
	return ao * ( 1.0 - 0.22 * smoothstep( 0.0, 4.0, depth ) );
}`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
	{ float cav = cavityAO(); reflectedLight.indirectDiffuse *= cav; reflectedLight.indirectSpecular *= cav; reflectedLight.directDiffuse *= mix( 1.0, cav, 0.45 ); reflectedLight.directSpecular *= cav; }`);
  };
  mat.customProgramCacheKey = () => 'padbox-cavity-' + key;
  return mat;
}

// ---------------------------------------------------------------- materials
export function createPadBoxMaterials(M, maxAniso = 8) {
  const bump = paperTexture(); bump.anisotropy = maxAniso;
  // white coated board, as on the reference boxes: a soft satin finish (broad, soft reflections, a velvety sheen at
  // grazing angles), the paper's fine fibre in the bump; inside, the cavities' soft shading
  // like Apple's packaging: a bright, very fine, smooth matte paper over the board: no gloss, a soft velvety sheen at
  // grazing angles, its fine fibre only just there
  const boardOpts = { color: '#f6f6f4', roughness: 0.8, specularIntensity: 0.32, sheen: 0.28, sheenRoughness: 0.7, sheenColor: new THREE.Color('#ffffff'),
    bumpMap: bump, bumpScale: 0.09 };   // the fibre barely there: stronger, it reads as cloth
  const bx = B.W / 2 - B.t, bz = B.D / 2 - B.t, lx = LID.W / 2 - PB.lid.t, lz = LID.D / 2 - PB.lid.t;
  const baseCav = [[-bx, INS_TOP, -bz], [bx, B.H, bz], 1], lidCav = [[-lx, 0, -lz], [lx, LID.H - PB.lid.top, lz], -1];
  const board = cavityShading(new THREE.MeshPhysicalMaterial(boardOpts), ...baseCav, 'base');
  const boardLid = cavityShading(new THREE.MeshPhysicalMaterial(boardOpts), ...lidCav, 'lid');
  // the insert: uncoated board (and its recess shaded in its vertex colours)
  const pulp = pulpTexture(); pulp.anisotropy = maxAniso;
  const card = { bumpMap: pulp, bumpScale: 0.6, sheen: 0.15 };   // uncoated: matte, a soft pulp texture
  const inner = cavityShading(new THREE.MeshPhysicalMaterial({ ...boardOpts, ...card, color: '#efeeea', roughness: 0.88, specularIntensity: 0.25, vertexColors: true }), ...baseCav, 'insert');
  const well = new THREE.MeshPhysicalMaterial({ ...boardOpts, ...card, color: '#e4e3df', roughness: 0.92, specularIntensity: 0.2, vertexColors: true });
  // the linings: the paper glued inside the base's walls and the lid, ending short of the rim (a fine step, as on any
  // rigid box)
  const liner = cavityShading(new THREE.MeshPhysicalMaterial({ ...boardOpts, ...card, color: '#f1f0ec', roughness: 0.82, specularIntensity: 0.3 }), ...baseCav, 'liner');
  const linerLid = cavityShading(new THREE.MeshPhysicalMaterial({ ...boardOpts, ...card, color: '#f1f0ec', roughness: 0.82, specularIntensity: 0.3 }), ...lidCav, 'linerlid');   // the recess's floor: a shade darker, so the empty insert reads
  // the prints: black ink with a light satin varnish over it
  // the prints: embossed, the board raised under them in soft shoulders, a glossy black ink over the raised face
  const embossed = (E) => ({
    size: [E.w, E.h],
    board: new THREE.MeshPhysicalMaterial({ ...boardOpts, bumpMap: E.height, bumpScale: 7, alphaMap: E.around, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    ink: new THREE.MeshPhysicalMaterial({ map: E.ink, transparent: true, roughness: 0.55, roughnessMap: E.grain, specularIntensity: 0.4, clearcoat: 0.45, clearcoatRoughness: 0.14, sheen: 0.15, sheenRoughness: 0.4, sheenColor: new THREE.Color('#8a8e98'), bumpMap: E.height, bumpScale: 7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
  });
  const decal = (map) => new THREE.MeshPhysicalMaterial({ map, transparent: true, roughness: 0.4, clearcoat: 0.3, clearcoatRoughness: 0.25, bumpMap: bump, bumpScale: 0.2,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false });
  const logoPrint = embossed(embossPrint(logoImg, PRINT.top, PRINT.top / LOGO_AR, maxAniso));
  const symPrint = embossed(embossPrint(symbolImg, PRINT.sym * SYM_AR, PRINT.sym, maxAniso));
  // tracing paper (papel vegetal): matte and translucent. What is under it is seen through it diffused (transmission
  // with a rough surface: blurred, so the screen's reflections don't show through), its own surface has almost no
  // shine, and its cloudy formation varies how much light it lets through. Over the screen, which is itself pulled
  // forward (polygon offset)
  const form = formationTexture(); form.anisotropy = maxAniso;
  const paper = new THREE.MeshPhysicalMaterial({ alphaMap: cornerMask(26.6, 19.2, 0.9), alphaTest: 0.5,
    color: '#fbfbfa', roughness: 0.05, metalness: 0, transmission: 0.86, transmissionMap: form, thickness: 0.004, ior: 1.15,
    specularIntensity: 0.02, sheen: 0.1, sheenRoughness: 0.95, sheenColor: new THREE.Color('#ffffff'), roughnessMap: form,
    bumpMap: bump, bumpScale: 0.12, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12 });
  // the boxed pad's own screen (set in the studio's screen section; off until set)
  const screen = M.screen.clone();
  // and its own glass: under the paper it gets only the paper's diffused light, so it mirrors nothing sharp (posePadBox)
  const glass = M.glass.clone();
  // under the pad: the accessory tray (moulded card, its wells shaded by depth in vertex colours), the charger's white
  // plastic and steel pins, the cable's soft rubber, and the return card
  // the tray: thermoformed white plastic, as in the kit's photo: smooth, a soft satin sheen, every edge rounded
  const tray = new THREE.MeshPhysicalMaterial({ color: '#e7e7e4', roughness: 0.46, specularIntensity: 0.4, sheen: 0.2, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ffffff'), vertexColors: true, side: THREE.DoubleSide });
  // the charger: glossy white polycarbonate (a smooth, bright reflection over a soft base); the pins' insulating
  // sleeves a satin white; nickel-plated pins and blades; the USB-C port's dark mouth and steel shell
  const plastic = new THREE.MeshPhysicalMaterial({ color: '#f6f6f3', roughness: 0.28, specularIntensity: 0.6, clearcoat: 0.6, clearcoatRoughness: 0.12 });
  const sleeve = new THREE.MeshPhysicalMaterial({ color: '#f0f0ed', roughness: 0.62, specularIntensity: 0.35 });
  // the charger's shell: injection-moulded polycarbonate with a fine satin texture: soft, broad reflections (no mirror
  // glare), a faint velvety sheen at grazing angles
  const chargerBody = new THREE.MeshPhysicalMaterial({ color: '#f4f4f1', roughness: 0.4, specularIntensity: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.28,
    sheen: 0.22, sheenRoughness: 0.45, sheenColor: new THREE.Color('#ffffff'), bumpMap: bump, bumpScale: 0.015 });
  const seam = new THREE.MeshStandardMaterial({ color: '#c9c9c5', roughness: 0.7 });   // the shell's parting line
  const portDark = new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.7, side: THREE.DoubleSide });
  const decalOpts = { polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 };
  const portHole = new THREE.MeshStandardMaterial({ color: '#0c0c0d', roughness: 0.85, ...decalOpts });           // the socket's opening
  const tongue = new THREE.MeshStandardMaterial({ color: '#2c2c2f', roughness: 0.5, metalness: 0.2, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });   // its tongue
  const slot = new THREE.MeshStandardMaterial({ color: '#050506', roughness: 0.9, side: THREE.DoubleSide });
  const pins = new THREE.MeshPhysicalMaterial({ color: '#d3d1cc', metalness: 1, roughness: 0.2 });
  const pinMetal = new THREE.MeshPhysicalMaterial({ color: '#cbc8c1', metalness: 1, roughness: 0.32 });   // nickel-plated brass, finely brushed
  const blades = new THREE.MeshPhysicalMaterial({ color: '#cbc5b7', metalness: 1, roughness: 0.32 });
  const tie = new THREE.MeshPhysicalMaterial({ color: '#f6f6f4', roughness: 0.6, specularIntensity: 0.35, sheen: 0.25, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ffffff'), side: THREE.DoubleSide });   // the cable's ties: soft matte plastic
  const rubber = new THREE.MeshPhysicalMaterial({ color: '#f4f4f2', roughness: 0.5, specularIntensity: 0.4, sheen: 0.35, sheenRoughness: 0.55, sheenColor: new THREE.Color('#ffffff') });   // the cable's soft TPE
  const cardEdge = new THREE.MeshStandardMaterial({ color: '#f4f3ef', roughness: 0.9 });   // the cards' cut edges
  const cards = {};
  for (const lang of ['en', 'pt']) cards[lang] = Object.fromEntries(['welcome-xx-front', 'welcome-xx-back', 'return-xx-front', 'return-xx-back'].map((k) => [k.replace('-xx-', '-'), cardFace(k, lang, maxAniso)]));
  return { board, boardLid, inner, well, liner, linerLid, tray, plastic, sleeve, chargerBody, seam, pinMetal, portDark, portHole, tongue, slot, pins, blades, rubber, tie, cardEdge, cards, logo: logoPrint, symbol: symPrint, paper, screen, glass };
}

// ---------------------------------------------------------------- the model
export function buildPadBox(PBM, M, buildTablet) {
  const group = new THREE.Group(); group.name = 'padbox';
  const mesh = (g, m, name) => { const o = new THREE.Mesh(g, m); if (name) o.name = name; o.castShadow = o.receiveShadow = true; return o; };
  const r = PB.r;
  const padTop = PAD_TOP, padBottom = PAD_BOTTOM, insTop = INS_TOP;

  // the base: walls and floor. Inside, the walls darken softly down towards the insert
  const baseG = new THREE.Group(); baseG.name = 'pb-base';
  baseG.add(mesh(slab(ring(B.W, B.D, B.t, r), 0, B.H, PB.bevel), PBM.board));
  // the lining inside the walls: from the insert up to 0.9 cm under the rim (a hair inside the walls' faces)
  baseG.add(mesh(slab(ring(B.W - 2 * B.t - 0.004, B.D - 2 * B.t - 0.004, 0.03, 0.02), INS_TOP - 0.02, B.H - 0.9, 0.012), PBM.liner));
  baseG.add(mesh(slab(rrShape(B.W - 0.02, B.D - 0.02, r), 0, B.t, 0.02), PBM.board));
  // the insert: solid up to the recess floor, then a frame round the pad-shaped recess
  const iw = B.W - 2 * B.t - 0.02, id = B.D - 2 * B.t - 0.02;
  baseG.add(buildTray(PBM, iw, id, padBottom));
  const frame = rrShape(iw, id, 0.06); frame.holes.push(rrShape(26.25, 18.93, 1.6, THREE.Path));
  baseG.add(mesh(shade(slab(frame, padBottom - 0.01, insTop, 0.02, 6), (p, n) => {
    const toWall = Math.min(iw / 2 - Math.abs(p.x), id / 2 - Math.abs(p.z));
    if (n.y > 0.5) return 1;                                              // the frame's top (shaded by the cavity)
    return 0.8 + 0.2 * sstep(padBottom, insTop, p.y);                     // the recess's walls: darker at the bottom
  }), PBM.inner));
  group.add(baseG);

  // the lid: top plate and walls, open at the bottom; prints on the outside. Inside, darker up into its corners
  const lid = new THREE.Group(); lid.name = 'pb-lid';
  const body = new THREE.Group(); body.name = 'pb-lid-body'; lid.add(body);
  body.add(mesh(slab(rrShape(LID.W, LID.D, r + 0.1), LID.H - PB.lid.top, LID.H), PBM.boardLid));
  body.add(mesh(slab(ring(LID.W, LID.D, PB.lid.t, r + 0.1), 0, LID.H - 0.05, PB.bevel), PBM.boardLid));
  // the lid's lining: walls from 0.9 cm over its edge up to the top, and the top's underside
  const lw = LID.W - 2 * PB.lid.t - 0.004, ld = LID.D - 2 * PB.lid.t - 0.004;
  body.add(mesh(slab(ring(lw, ld, 0.03, 0.06), 0.9, LID.H - PB.lid.top + 0.01, 0.012), PBM.linerLid));
  body.add(mesh(slab(rrShape(lw - 0.06, ld - 0.06, 0.04), LID.H - PB.lid.top - 0.025, LID.H - PB.lid.top + 0.001, 0.008), PBM.linerLid));
  const eps = 0.004, lh = PRINT.top / LOGO_AR, sh = PRINT.side / LOGO_AR;
  // a print (its plane in x, y facing +z), at w cm wide for the logo's own width (its margin scales with it)
  const print = (P, w, designW) => { const k = w / designW, g = new THREE.Group(); [P.board, P.ink].forEach((m, i) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(P.size[0] * k, P.size[1] * k), m); o.renderOrder = 1 + i; g.add(o); }); return g; };   // the ink always over its raised board
  const top = print(PBM.logo, PRINT.top, PRINT.top); top.rotation.x = -Math.PI / 2; top.position.set(0, LID.H + eps, 0);
  // the long sides: read left to right from outside
  const sideLogo = (front) => { const m = print(PBM.logo, PRINT.side, PRINT.top); m.rotation.y = front ? 0 : Math.PI; m.position.set(front ? PRINT.sideX : -PRINT.sideX, LID.H * 0.5, (front ? 1 : -1) * (LID.D / 2 + eps)); return m; };
  const sideSym = (right) => { const m = print(PBM.symbol, PRINT.sym * SYM_AR, PRINT.sym * SYM_AR); m.rotation.y = right ? Math.PI / 2 : -Math.PI / 2; m.position.set((right ? 1 : -1) * (LID.W / 2 + eps), LID.H * 0.5, 0); return m; };
  body.add(top, sideLogo(true), sideLogo(false), sideSym(true), sideSym(false));
  group.add(lid);

  // the pad, lying screen up in the recess; it turns about its front bottom edge (the back edge lifts). Its screen is
  // the Sword Pad's (the shared screen material)
  const padPivot = new THREE.Group(); padPivot.name = 'pb-pad-pivot';
  padPivot.position.set(0, padBottom, 18.68 / 2);
  const pad = buildTablet({ ...M, screen: PBM.screen, glass: PBM.glass });
  pad.name = 'pb-pad';
  pad.rotation.x = -Math.PI / 2;          // screen up, its top edge (the camera) away from the viewer
  pad.position.set(0, 0, -18.68 / 2);
  padPivot.add(pad);
  group.add(padPivot);

  // the tracing paper: on the pad (moves with it) or, without the pad, on the insert
  const paperGeo = new THREE.PlaneGeometry(PAPER.W, PAPER.D, 110, 80);
  paperGeo.rotateX(-Math.PI / 2);
  paperGeo.userData.flat = paperGeo.attributes.position.array.slice();
  const paper = mesh(paperGeo, PBM.paper, 'pb-paper'); paper.castShadow = false; paper.receiveShadow = false;   // translucent: no hard shadow on the screen
  group.add(paper);

  // the board's outer faces catch the key light at a slant: its shadow map stripes them. The board takes no shadows
  // (its insides are shaded by the cavities); the insert, the pad and the floor still do
  for (const o of [...baseG.children, ...body.children]) if (o.isMesh && (o.material === PBM.board || o.material === PBM.boardLid)) o.receiveShadow = false;
  group.userData.levels = { padTop, padBottom, insTop };
  group.userData.PBM = PBM;
  group.userData.obstacles = obstaclePoints(padBottom, insTop);
  return group;
}

// ---------------------------------------------------------------- the accessory tray under the pad
// As in the kit's photo (top view, measured against the box): on the left an empty slot with a thumb notch, in the
// middle an oval well with the charger lying in the coiled cable, on the right the return card in its own shallow slot
// with a notch to lift it. Its top is where the pad lies; the wells are cut down into it.
const TRAY = {
  slot: { x0: -13.05, x1: -2.85, z0: -5.1, z1: 5.1, r: 0.5, nx: -7.95, nr: 1.25, depth: 1.5 },   // holds the 10 cm welcome card
  well: { cx: 1.0, cz: 0.25, w: 5.8, l: 12.3, depth: 2.25 },
  card: { x0: 4.75, x1: 13.05, z0: -4.15, z1: 4.15, r: 0.2, nx: 8.9, nr: 1.25, depth: 0.25 },     // holds the 8 cm return card
};
function buildTray(PBM, iw, id, top) {
  const g = new THREE.Group(); g.name = 'pb-tray';
  const mesh = (geo, m) => { const o = new THREE.Mesh(geo, m); o.castShadow = o.receiveShadow = true; return o; };
  const T = TRAY, deep = top - T.well.depth - 0.05;
  // shading by depth (light falls in from above): walls darker down towards the floor, floors darker in the deeper wells
  const byDepth = (p, n) => (n.y > 0.7 ? 1 - 0.12 * Math.min(1, Math.max(0, top - p.y) / 2.3) : 0.74 + 0.26 * sstep(top - 2.3, top, p.y));
  const cups = [
    [notchedPts(T.slot.x0, T.slot.x1, T.slot.z0, T.slot.z1, T.slot.r, T.slot.nx, T.slot.nr), T.slot.depth, 0.32, 0.4],
    [stadiumPts(T.well.cx, T.well.cz, T.well.w, T.well.l), T.well.depth, 0.32, 0.45],
    [notchedPts(T.card.x0, T.card.x1, T.card.z0, T.card.z1, T.card.r, T.card.nx, T.card.nr), T.card.depth, 0.1, 0.08],
  ];
  const topShape = rrShape(iw, id, 0.06);
  for (const [pts, depth, rl, rf] of cups) {
    const c = cupGeometry(pts, top, depth, rl, rf);
    topShape.holes.push(fromPts(ccw(c.opening).slice().reverse(), THREE.Path));
    g.add(mesh(shade(c.wall, byDepth), PBM.tray), mesh(shade(c.floor, byDepth), PBM.tray));
  }
  // the tray's top surface round the wells (flat, its outer edge just rounded), and the solid under it
  g.add(mesh(shade(slab(topShape, top - 0.6, top, 0.03), byDepth), PBM.tray));
  g.add(mesh(shade(slab(rrShape(iw, id, 0.06), B.t, deep, 0.01), byDepth), PBM.tray));
  // the slot's floor steps, as in the photo: a raised band at the back (under the notch) and one at the front, a
  // lower channel between them; their edges well rounded
  const S = T.slot, fl = top - S.depth, w = S.x1 - S.x0 - 1.0;
  for (const [z0, z1, h] of [[S.z0 + 0.4, S.z0 + 3.6, 0.5], [S.z1 - 3.0, S.z1 - 0.4, 0.5]]) {   // (level: the welcome card lies across them)
    const step = mesh(shade(slab(rrShape(w, z1 - z0, 0.3), fl - 0.01, fl + h, 0.18), byDepth), PBM.tray);
    step.position.set((S.x0 + S.x1) / 2, 0, (z0 + z1) / 2); g.add(step);
  }
  // the cards, in English and in Portuguese (one shown): the welcome card across the slot's raised bands, the
  // return card on its shelf
  for (const lang of ['en', 'pt']) {
    const C = PBM.cards[lang], set = new THREE.Group(); set.name = 'pb-cards-' + lang;
    const wc = buildCard(C['welcome-front'], C['welcome-back'], 10, 10, 0.8, PBM); wc.position.set((S.x0 + S.x1) / 2, fl + 0.5 + 0.002, (S.z0 + S.z1) / 2);
    const rc = buildCard(C['return-front'], C['return-back'], 8, 8, 0, PBM); rc.position.set((T.card.x0 + T.card.x1) / 2, top - T.card.depth + 0.002, (T.card.z0 + T.card.z1) / 2);
    set.add(wc, rc); g.add(set);
  }
  const wf = top - T.well.depth;
  g.add(buildCharger(PBM, wf, 'eu'), buildCharger(PBM, wf, 'us'), buildCable(PBM, wf));
  return g;
}
// a box with every edge and corner rounded (radius r) and smooth normals: a subdivided box, its segments crowded
// towards the edges (where the rounding is), each point pulled onto the rounded surface
function roundedBox(w, h, d, r, seg = 28) {
  const g = new THREE.BoxGeometry(1, 1, 1, seg, seg, seg), P = g.attributes.position, N = g.attributes.normal;
  const half = [w / 2, h / 2, d / 2], inner = half.map((v) => Math.max(0, v - r)), v = [0, 0, 0], q = [0, 0, 0];
  for (let i = 0; i < P.count; i++) {
    v[0] = P.getX(i); v[1] = P.getY(i); v[2] = P.getZ(i);
    for (let k = 0; k < 3; k++) { const t = v[k] * 2; v[k] = Math.sin(t * Math.PI / 2) * half[k]; }   // crowd the segments to the edges
    let nx = 0, ny = 0, nz = 0;
    for (let k = 0; k < 3; k++) { q[k] = Math.min(inner[k], Math.max(-inner[k], v[k])); }
    nx = v[0] - q[0]; ny = v[1] - q[1]; nz = v[2] - q[2];
    let l = Math.hypot(nx, ny, nz);
    if (l < 1e-6) { nx = N.getX(i); ny = N.getY(i); nz = N.getZ(i); l = 1; }
    nx /= l; ny /= l; nz /= l;
    P.setXYZ(i, q[0] + nx * r, q[1] + ny * r, q[2] + nz * r); N.setXYZ(i, nx, ny, nz);
  }
  return g;
}
// USB-C (cm): the plug's steel shell is a stadium 0.83 x 0.26 in section; the socket's opening 0.89 x 0.32
function stadiumShape(w, h, Path = THREE.Shape) { return rrShape(w, h, h / 2 - 0.0005, Path); }
// the plug's shell along +z from z = 0 (its back, where it leaves the moulded head) to len, its open end dark, with the
// tongue's slot in it
function usbcPlug(PBM, len = 0.66) {
  const g = new THREE.Group();
  const ring = stadiumShape(0.83, 0.26); ring.holes.push(stadiumShape(0.75, 0.18, THREE.Path));
  const shell = new THREE.ExtrudeGeometry(ring, { depth: len, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelOffset: -0.012, bevelSegments: 3, curveSegments: 20 });
  g.add(new THREE.Mesh(shell, PBM.pins));
  const inside = new THREE.Mesh(new THREE.ShapeGeometry(stadiumShape(0.76, 0.19), 20), PBM.portDark); inside.position.z = len - 0.12; g.add(inside);
  const slot = new THREE.Mesh(new THREE.ShapeGeometry(rrShape(0.6, 0.07, 0.03), 8), PBM.slot); slot.position.z = len - 0.1; g.add(slot);
  return g;
}
// the socket, seen from outside (faces +z, on a flat face at z = 0): a polished steel rim, the dark opening, the
// tongue across its middle
function usbcSocket(PBM) {
  const g = new THREE.Group();
  const rim = stadiumShape(0.95, 0.38); rim.holes.push(stadiumShape(0.86, 0.29, THREE.Path));
  const r = new THREE.Mesh(new THREE.ExtrudeGeometry(rim, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.01, bevelOffset: -0.01, bevelSegments: 3, curveSegments: 20 }), PBM.pins); r.position.z = -0.012; g.add(r);
  const hole = new THREE.Mesh(new THREE.ShapeGeometry(stadiumShape(0.87, 0.3), 20), PBM.portHole); hole.position.z = 0.004; g.add(hole);
  const tongue = new THREE.Mesh(new THREE.ShapeGeometry(rrShape(0.66, 0.07, 0.03), 8), PBM.tongue); tongue.position.z = 0.006; g.add(tongue);
  return g;
}
// the chargers, lying face up in the oval well, plug end towards the front, the USB-C port at the back. As the kit's
// charger: a tall body with flat faces and small rounded corners, a little narrower at the back (the port end) than at
// the plug end; a step down to a narrower plug block; the pins (EU) or blades (US) out of its face
function buildCharger(PBM, floor, kind) {
  const g = new THREE.Group(); g.name = 'pb-charger-' + kind;
  const T = TRAY.well, cx = T.cx, eu = kind === 'eu', H = 2.05, y = floor + H / 2;
  const add = (geo, m, x, yy, z, setup) => { const o = new THREE.Mesh(geo, m); o.position.set(x, yy, z); if (setup) setup(o); g.add(o); return o; };
  const W = eu ? 3.55 : 3.1, D = eu ? 3.75 : 3.0, R = 0.34, back = T.cz - (eu ? 2.6 : 2.1), cz = back + D / 2;
  const taper = (geo, d) => { const P = geo.attributes.position; for (let i = 0; i < P.count; i++) { const t = (P.getZ(i) + d / 2) / d; P.setX(i, P.getX(i) * (0.9 + 0.1 * t)); } geo.computeVertexNormals(); return geo; };
  add(taper(roundedBox(W, H, D, R, 36), D), PBM.chargerBody, cx, y, cz);
  // the parting line round its sides, a little below the middle
  const seamG = slab(rrShape(W + 0.006, D + 0.006, R + 0.003), -0.011, 0.011, 0); seamG.translate(0, 0, 0);
  add(taper(seamG, D + 0.006), PBM.seam, cx, floor + H * 0.36, cz);
  // the USB-C port at the back
  const sock = usbcSocket(PBM); sock.rotation.y = Math.PI; sock.position.set(cx, y, back - 0.001); g.add(sock);
  // a pin along +z from the face: a white insulating sleeve, then the nickel-plated pin with its rounded end
  const pinGeo = (r, sleeveL, metalL) => {
    const sl = new THREE.CylinderGeometry(r + 0.004, r + 0.004, sleeveL, 48); sl.rotateX(Math.PI / 2); sl.translate(0, 0, sleeveL / 2);
    const shaft = new THREE.CylinderGeometry(r, r, metalL - r, 48, 1, true); shaft.rotateX(Math.PI / 2); shaft.translate(0, 0, sleeveL + (metalL - r) / 2);
    const tip = new THREE.SphereGeometry(r, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2); tip.rotateX(Math.PI / 2); tip.translate(0, 0, sleeveL + metalL - r);
    return [sl, shaft, tip];
  };
  const bw = eu ? 3.0 : 2.6, bh = H - 0.22, bl = eu ? 1.45 : 0.5;
  add(roundedBox(bw, bh, bl + 0.4, 0.3, 30), PBM.chargerBody, cx, y, cz + D / 2 + (bl + 0.4) / 2 - 0.4);
  const face = cz + D / 2 + bl;
  if (eu) {
    for (const sx of [-0.84, 0.84]) { const [sl, shaft, tip] = pinGeo(0.2, 1.05, 0.85); add(sl, PBM.sleeve, cx + sx, y, face - 0.02); add(shaft, PBM.pinMetal, cx + sx, y, face - 0.02); add(tip, PBM.pinMetal, cx + sx, y, face - 0.02); }
  } else {
    for (const sx of [-0.635, 0.635]) {
      add(roundedBox(0.15, 0.63, 1.6, 0.05, 12), PBM.blades, cx + sx, y, face + 0.75);
      for (const side of [-1, 1]) add(new THREE.CircleGeometry(0.15, 24), PBM.portDark, cx + sx + side * 0.077, y, face + 1.2, (o) => { o.rotation.y = side * Math.PI / 2; });
    }
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
  return g;
}
// the white USB-C cable, as in the kit's photo: one cable spiralling round the well about two and a half times, from
// its outer turn inwards, its two ends in view: one USB-C plug resting on the coil at the bottom right, where the
// spiral starts; the other off the inner turn at the top, lying diagonally towards the top left of the charger. A tie
// on each side, level with the charger, holds the strands together
function buildCable(PBM, floor) {
  const g = new THREE.Group(); g.name = 'pb-cable';
  const T = TRAY.well, cx = T.cx, tube = 0.13, yF = floor + tube + 0.006;
  // a point round the stadium, inset from the wall (t: 0..1, from the start of the back curve, clockwise from above)
  const at = (inset, t) => {
    t = ((t % 1) + 1) % 1;
    const w = T.w - 2 * inset, l = T.l - 2 * inset, r = w / 2, h = l / 2 - r, per = 2 * Math.PI * r + 4 * h, sArc = t * per;
    if (sArc < Math.PI * r) { const a = Math.PI + sArc / r; return [cx + r * Math.cos(a), T.cz - h + r * Math.sin(a)]; }
    if (sArc < Math.PI * r + 2 * h) return [cx + r, T.cz - h + (sArc - Math.PI * r)];
    if (sArc < 2 * Math.PI * r + 2 * h) { const a = (sArc - Math.PI * r - 2 * h) / r; return [cx + r * Math.cos(a), T.cz + h + r * Math.sin(a)]; }
    return [cx - r, T.cz + h - (sArc - 2 * Math.PI * r - 2 * h)];
  };
  const tAt = (inset, which) => {   // the t of the bottom right (a little round the front curve) and of the top middle
    const w = T.w - 2 * inset, l = T.l - 2 * inset, r = w / 2, h = l / 2 - r, per = 2 * Math.PI * r + 4 * h;
    return which === 'B' ? (Math.PI * r + 2 * h + 0.55 * r) / per : (0.5 * Math.PI * r) / per;
  };
  const I0 = 0.2, I1 = 0.9, tB = tAt(I0, 'B'), tTop = tAt(I1, 'top'), uEnd = (tB - tTop) + 2;   // the spiral's length in turns
  const insetAt = (u) => I0 + (I1 - I0) * (u / uEnd);
  const pts = [];
  for (let k = 0; k <= 420; k++) { const u = (k / 420) * uEnd, [x, z] = at(insetAt(u), tB - u); pts.push(new THREE.Vector3(x, yF, z)); }
  // end A: off the inner turn at the top middle, curving down to the left, into the plug lying diagonally
  const dirA = new THREE.Vector3(-0.6, 0, 0.8).normalize(), a0 = pts[pts.length - 1];
  const reliefA = new THREE.Vector3(a0.x - 0.55, yF, a0.z + 0.35);
  const lead = [a0, new THREE.Vector3(a0.x - 0.3, yF, a0.z + 0.06), new THREE.Vector3(a0.x - 0.5, yF, a0.z + 0.2), reliefA];
  // end B: the start of the spiral leaves the coil in a smooth S, up onto the strands, into the plug resting on them
  const [bx0, bz0] = at(I0, tB), [bx1, bz1] = at(I0, tB + 0.012), tb = new THREE.Vector3(bx1 - bx0, 0, bz1 - bz0).normalize(), dirB = tb.clone();
  const OFF = 1.0;   // the plug starts this far on from where the spiral begins
  const inside = (x, z, d) => { const h0 = T.l / 2 - T.w / 2, dz = Math.max(0, Math.abs(z - T.cz) - h0); return Math.hypot(x - cx, dz) <= T.w / 2 - d; };
  const fits = (d) => { const side = new THREE.Vector3(-d.z, 0, d.x); return [OFF, OFF + 1.0, OFF + 2.45].every((L) => [-0.42, 0.42].every((w) => inside(bx0 + d.x * L + side.x * w, bz0 + d.z * L + side.z * w, 0.15))); };
  turn: for (let k = 0; k <= 40; k++) for (const sg of [1, -1]) {   // turned in from the curve just enough to stay inside the well
    const a = sg * k * 3 * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a), d = new THREE.Vector3(tb.x * c - tb.z * sn, 0, tb.x * sn + tb.z * c);
    if (fits(d)) { dirB.copy(d); break turn; }
  }
  const yOn = floor + 2 * tube + 0.29;   // the plug's middle, resting on top of the strands
  const P0 = pts[0], reliefB = new THREE.Vector3(bx0 + dirB.x * OFF, yOn, bz0 + dirB.z * OFF);
  const c1 = reliefB.clone().addScaledVector(dirB, -0.45), c2 = new THREE.Vector3(P0.x + tb.x * 0.4, yF, P0.z + tb.z * 0.4), bez = [];
  for (let k = 0; k < 14; k++) { const t = k / 14, u = 1 - t; bez.push(new THREE.Vector3().addScaledVector(reliefB, u * u * u).addScaledVector(c1, 3 * u * u * t).addScaledVector(c2, 3 * u * t * t).addScaledVector(P0, t * t * t)); }
  // end A: the plug's moulded end on the floor, tilted so its far end rests on the strands where it reaches them
  const near = (x, z) => { let m = Infinity; for (let k = 0; k < pts.length; k += 2) m = Math.min(m, Math.hypot(pts[k].x - x, pts[k].z - z)); return m; };
  let Lc = null;
  { const side = new THREE.Vector3(-dirA.z, 0, dirA.x);
    for (let L = 0.3; L <= 2.66 && Lc === null; L += 0.08) for (const w of [-0.42, 0, 0.42]) if (near(reliefA.x + dirA.x * L + side.x * w, reliefA.z + dirA.z * L + side.z * w) < tube + 0.03) { Lc = L; break; } }
  const pitch = Lc === null ? 0 : Math.min(0.42, Math.atan(0.3 / Math.max(0.5, Lc - 0.1)));
  const dirA3 = new THREE.Vector3(dirA.x * Math.cos(pitch), Math.sin(pitch), dirA.z * Math.cos(pitch));
  const all = [...bez, ...pts, ...lead.slice(1)];
  const curve = new THREE.CatmullRomCurve3(all, false, 'catmullrom', 0.5);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 1600, tube, 16, false), PBM.rubber));
  // the plugs: a tapered strain relief, the moulded head, the steel USB-C shell, along dir (3D) from the cable's end
  const plug = (end, dir, y) => {
    const o = new THREE.Vector3(end.x, y, end.z), qz = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    const relief = new THREE.Mesh(new THREE.CylinderGeometry(0.2, tube + 0.002, 0.6, 32, 4), PBM.rubber); relief.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); relief.position.copy(o).addScaledVector(dir, 0.3); g.add(relief);
    const head = new THREE.Mesh(roundedBox(0.78, 0.56, 1.4, 0.24, 20), PBM.plastic); head.quaternion.copy(qz); head.position.copy(o).addScaledVector(dir, 1.3); g.add(head);
    const shell = usbcPlug(PBM); shell.quaternion.copy(qz); shell.position.copy(o).addScaledVector(dir, 2.0); g.add(shell);
  };
  plug(reliefA, dirA3, yF);
  plug(reliefB, dirB, yOn);
  // the ties: thin flat bands of soft white plastic wrapped snugly round the strands on each side, level with the
  // charger, each sized to the strands it holds
  const T2 = 0.035, zt = T.cz - 0.55;
  for (const side of [-1, 1]) {
    const xs = [];
    for (let k = 0; k <= 8000; k++) { const u = (k / 8000) * uEnd, [x, z] = at(insetAt(u), tB - u); if (Math.abs(z - zt) < 0.03 && Math.sign(x - cx) === side) xs.push(x); }
    if (!xs.length) continue;
    const x0 = Math.min(...xs) - tube - 0.01, x1 = Math.max(...xs) + tube + 0.01, iw = Math.max(0.36, x1 - x0), ih = 2 * tube + 0.03;
    const wrap = rrShape(iw + 2 * T2, ih + 2 * T2, tube + T2 + 0.01); wrap.holes.push(rrShape(iw, ih, tube + 0.01, THREE.Path));
    const band = new THREE.ExtrudeGeometry(wrap, { depth: 0.55, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelOffset: -0.01, bevelSegments: 3, curveSegments: 16 });
    band.translate(0, 0, -0.275);
    const m = new THREE.Mesh(band, PBM.tie); m.position.set((x0 + x1) / 2, yF + 0.012, zt); g.add(m);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
  return g;
}

// ---------------------------------------------------------------- solidity
// points over what the lid must stay clear of: the base's outside and rim, the insert, the pad (in its pivot's frame)
function obstaclePoints(padBottom, insTop) {
  const base = [], pad = [], st = 0.7;
  const hx = B.W / 2, hz = B.D / 2;
  for (let x = -hx; x <= hx + 1e-6; x += st) for (let y = 0; y <= B.H + 1e-6; y += 0.5) base.push([x, y, hz], [x, y, -hz]);
  for (let z = -hz; z <= hz + 1e-6; z += st) for (let y = 0; y <= B.H + 1e-6; y += 0.5) base.push([hx, y, z], [-hx, y, z]);
  for (let x = -hx; x <= hx + 1e-6; x += st) for (let z = -hz; z <= hz + 1e-6; z += st) base.push([x, (Math.abs(x) > hx - 0.3 || Math.abs(z) > hz - 0.3) ? B.H : insTop, z]);
  // the pad: its top and bottom faces and its edges, in the pivot's frame (x across, y up, z from -18.68 to 0)
  for (let x = -13; x <= 13 + 1e-6; x += 1) for (let z = -18.68; z <= 1e-6; z += 1.0378) pad.push([x, 0.92, z], [x, 0, z]);
  return { base, pad };
}
const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _v = new THREE.Vector3(), _e = new THREE.Euler();
// the lowest lift (cm, for the lid's centre: lift + LID.H / 2) at which the lid, turned and slid as asked, clears
// every point and the floor
function clearLift(pts, tilt, slide, from) {
  _qi.setFromEuler(_e.set(tilt, 0, 0)).invert();
  const c = LID.H / 2, hw = LID.W / 2 + 0.03, hd = LID.D / 2 + 0.03;
  // the lid's corners' depth below its centre (the floor)
  _q.setFromEuler(_e.set(tilt, 0, 0));
  let low = 0;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) { _v.set(sx * LID.W / 2, sy * c, sz * LID.D / 2).applyQuaternion(_q); low = Math.min(low, _v.y); }
  const floorLift = -low - c;   // centre at c + lift; lowest corner at c + lift + low >= 0
  const hits = (lift) => {
    if (lift < floorLift - 1e-6) return true;
    for (const p of pts) {
      _v.set(p[0], p[1] - (lift + c), p[2] - slide).applyQuaternion(_qi);
      if (Math.abs(_v.x) < hw && Math.abs(_v.z) < hd && _v.y > -c - 0.03 && _v.y < c + 0.03) return true;
    }
    return false;
  };
  if (!hits(from)) return from;
  let lo = from, hi = from + 1;
  while (hits(hi) && hi < from + 120) { lo = hi; hi += 2; }
  for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (hits(m)) lo = m; else hi = m; }
  return hi;
}

// peels the paper back from its front right corner, like a page: the fold line runs across the corner, square to the
// diagonal, and moves in as the peel grows (peel: 0 flat to 200 most of the sheet turned back); past the fold the
// sheet rolls up round a curl (radius R) and on, straight, back over itself
const PAPER = { W: 26.6, D: 19.2 };
function shapePaper(paper, peel) {
  const g = paper.geometry, P = g.attributes.position.array, F = g.userData.flat;
  const hw = PAPER.W / 2, hd = PAPER.D / 2, f = Math.min(1, Math.max(0, peel / 200));
  const dx = hw, dz = hd, dl = Math.hypot(dx, dz), ux = dx / dl, uz = dz / dl;   // from the middle to the corner
  const reach = dl;                                       // the corner's distance along the diagonal
  const s0 = reach - f * reach * 0.95;                    // the fold line
  const R = 2.2 + 1.5 * f, thMax = Math.PI * (0.35 + 0.55 * Math.min(1, f * 2.2));   // the curl, and how far round it goes
  for (let i = 0; i < P.length; i += 3) {
    const x = F[i], z = F[i + 2];
    // a sheet of paper is never quite flat: a faint, slow ripple, its edges lifting a hair
    const e = Math.max(0, 1 - Math.min(hw - Math.abs(x), hd - Math.abs(z)) / 1.2);
    const w = 0.025 * Math.sin(x * 0.45 + z * 0.3) * Math.sin(z * 0.55 - x * 0.12) + 0.05 * e * e;
    const sAlong = x * ux + z * uz, u = sAlong - s0;
    let nx = x, ny = w, nz = z;
    if (f > 0 && u > 0) {
      let along, up;
      if (u <= thMax * R) { const t = u / R; along = R * Math.sin(t); up = R * (1 - Math.cos(t)); }
      else { const rest = u - thMax * R; along = R * Math.sin(thMax) + rest * Math.cos(thMax); up = R * (1 - Math.cos(thMax)) + rest * Math.sin(thMax); }
      const shift = along - u;                            // along the diagonal (back towards the middle as it turns)
      nx = x + ux * shift; nz = z + uz * shift; ny = up + w * (1 - Math.min(1, u / R));
    }
    P[i] = nx; P[i + 1] = ny; P[i + 2] = nz;
  }
  g.attributes.position.needsUpdate = true;
  g.computeVertexNormals();
  g.computeBoundingBox(); g.computeBoundingSphere();
}

export function posePadBox(group, o) {
  const lid = group.getObjectByName('pb-lid'), body = group.getObjectByName('pb-lid-body'), padPivot = group.getObjectByName('pb-pad-pivot'), paper = group.getObjectByName('pb-paper');
  const L = group.userData.levels;
  padPivot.visible = !!o.pad;
  padPivot.rotation.set((o.lid === 'closed' ? 0 : o.padTilt || 0) * Math.PI / 180, 0, 0);   // the back edge lifts (not under a closed lid)
  paper.visible = !!o.paper && !!o.pad && o.lid !== 'closed';   // the paper comes out with the pad
  group.getObjectByName('pb-cards-en').visible = o.lang !== 'pt'; group.getObjectByName('pb-cards-pt').visible = o.lang === 'pt';
  group.getObjectByName('pb-charger-eu').visible = o.charger !== 'us'; group.getObjectByName('pb-charger-us').visible = o.charger === 'us';
  shapePaper(paper, o.paperLift || 0);
  // the paper rests on the screen (the pad in) or on the insert
  paper.rotation.set(0, 0, 0);
  if (o.pad) {
    const off = new THREE.Vector3(0, 0.93 + 0.02 + (o.paperRaise || 0), -18.68 / 2).applyQuaternion(padPivot.quaternion);
    paper.quaternion.copy(padPivot.quaternion);
    paper.position.copy(padPivot.position).add(off);
  } else {
    paper.position.set(0, L.insTop + 0.008 + (o.paperRaise || 0), 0);
  }
  paper.updateMatrix(); padPivot.updateMatrix();
  // the paper over the pad (not peeled far, nor lifted off): the glass only sees the light the paper lets through,
  // diffused, so its sharp reflections go
  // paper in contact shows what it lies on near sharp; lifted off it (peeled, raised) it turns milky: farther from it,
  // the light through it is spread wider
  { const away = sstep(0.2, 3, o.paperRaise || 0), P = group.userData.PBM.paper;
    P.transmission = 0.86 - 0.3 * away; P.roughness = 0.05 + 0.12 * away; }
  { const PBM = group.userData.PBM, covered = paper.visible && o.pad && (o.paperRaise || 0) < 0.6;
    for (const m of [PBM.screen, PBM.glass]) {
      // (the coat is the sharp reflection: kept aside while covered, back when the paper is off; the studio's screen
      // controls set the kept values meanwhile)
      if (covered) { if (m.userData.cc === undefined) { m.userData.cc = m.clearcoat; m.userData.sp = m.specularIntensity; } m.clearcoat = 0; m.specularIntensity = 0; m.envMapIntensity = 0.3; }
      else { if (m.userData.cc !== undefined) { m.clearcoat = m.userData.cc; m.specularIntensity = m.userData.sp; delete m.userData.cc; delete m.userData.sp; } m.envMapIntensity = 1; }
    } }

  lid.visible = o.lid !== 'off';
  lid.rotation.set(0, 0, 0); lid.position.set(0, 0, 0); body.position.y = 0;
  if (o.lid === 'open') {
    // lifted about its centre; tilt turns its front edge up (towards the viewer). It rises clear of what is below it
    const c = LID.H / 2, tilt = -o.lidTilt * Math.PI / 180;
    const ob = group.userData.obstacles, pts = ob.base.slice();
    if (o.pad) for (const p of ob.pad) { _v.set(p[0], p[1], p[2]).applyMatrix4(padPivot.matrix); pts.push([_v.x, _v.y, _v.z]); }
    if (paper.visible) { const A = paper.geometry.attributes.position; for (let i = 0; i < A.count; i++) { _v.fromBufferAttribute(A, i).applyMatrix4(paper.matrix); pts.push([_v.x, _v.y, _v.z]); } }
    const lift = clearLift(pts, tilt, o.lidSlide, Math.max(0, o.lidLift));
    lid.position.set(0, lift + c, o.lidSlide);
    lid.rotation.x = tilt;
    body.position.y = -c;
    group.userData.lidLift = lift;   // where it ended up (the slider asks for at least this... or more)
  }
  group.updateMatrixWorld(true);
}
