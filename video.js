// Videos of the device: the camera moving round it, either along a ready-made movement or along one recorded from the
// user's own drags, zooms and pans. Rendered frame by frame (each frame a full-quality still, so the video stays smooth
// whatever the computer's speed) and made into a file in the browser: MP4 (H.264, WebCodecs + mp4-muxer), MOV (PNG
// codec, lossless, transparent if wanted), GIF, or a PNG sequence (video-formats.js). Nothing leaves the browser.
import { Muxer, ArrayBufferTarget } from './vendor/mp4-muxer.mjs';
import { movWriter, zipWriter, gifWriter } from './video-formats.js';

const DEG = Math.PI / 180;
// speed curves: starts slowly and ends slowly. Strong: a power curve (cubic, 3× the average speed at the middle);
// gentle: a cosine (1.6×)
const easeStrong = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeGentle = (t) => (1 - Math.cos(Math.PI * t)) / 2;
const TAU = Math.PI * 2;

// Each movement turns the camera round the device (round the vertical axis through its centre, and over it), keeping
// the framing you set: where the device sits in the shot stays where it is. Besides these, a device can have moves of
// its own (ctx.deviceMoves(): the travel bag unzipping, the Pad Box's lid lifting, a display counting up...): the same
// shape, plus act(t), which sets the device at t, and save / restore / done for how it was and how it ended. at(t) gives, for t from 0 to 1 over the
// video: az (degrees round), el (degrees over), k (distance, 1 = as now). `angle` is the movement's own slider (its
// label, range and default here); `dir` +1 right / -1 left.
export const MOTIONS = {
  turntable: { label: 'Turntable', angle: { label: 'Turn', min: 30, max: 720, step: 5, def: 360 }, dur: 8, dir: true,
    note: 'Turns round the device.', loop: true,
    at: (t, a, dir) => ({ az: dir * a * t }) },
  swing: { label: 'Swing', angle: { label: 'Swing', min: 10, max: 180, step: 5, def: 60 }, dur: 6, dir: true,
    note: 'Turns one way and back again, round the vertical axis.', loop: true,
    at: (t, a, dir) => ({ az: dir * (a / 2) * Math.sin(TAU * t) }) },
  tilt: { label: 'Tilt over', angle: { label: 'Tilt', min: 10, max: 120, step: 5, def: 60 }, dur: 6, dir: false,
    note: 'Rises over the device from your view and comes back down.', loop: true,
    at: (t, a) => ({ el: a * (1 - Math.cos(TAU * t)) / 2 }) },
  spiral: { label: 'Orbit & rise', angle: { label: 'Rise', min: 0, max: 80, step: 5, def: 30 }, dur: 10, dir: true,
    note: 'A full turn while the camera rises over the device and comes back down.', loop: true,
    at: (t, a, dir) => ({ az: dir * 360 * t, el: a * (1 - Math.cos(TAU * t)) / 2 }) },
  reveal: { label: 'Reveal', angle: { label: 'Turn', min: 15, max: 180, step: 5, def: 70 }, dur: 5, dir: true,
    note: 'Sweeps in from further round and further away, settling on your current view.',
    at: (t, a, dir) => ({ az: -dir * a * (1 - t), el: 12 * (1 - t), k: 1 + 0.45 * (1 - t) }) },
  push: { label: 'Push in', angle: { label: 'Zoom', min: 10, max: 60, step: 5, def: 30, unit: '%' }, dur: 5, dir: true,
    note: 'Moves slowly closer while drifting a little round the device.',
    at: (t, a, dir) => ({ k: 1 + a / 100 * (0.5 - t), az: dir * 12 * (t - 0.5) }) },
  float: { label: 'Float', angle: { label: 'Drift', min: 2, max: 30, step: 1, def: 10 }, dur: 8, dir: false,
    note: 'A gentle hand-held drift round your view, as a figure of eight.', loop: true,
    at: (t, a) => ({ az: (a / 2) * Math.sin(TAU * t), el: (a / 4) * Math.sin(2 * TAU * t) }) },
  mine: { label: 'Record with mouse', note: 'Press Record, then move the device with the mouse as you normally do: drag to turn, scroll to zoom, right-drag to pan. Press Stop when you are done, then Download video.' },
};
const CAMERA_MOVES = Object.keys(MOTIONS).filter((k) => k !== 'mine');

const SIZES = [[1280, '720p · 1280 px'], [1920, 'HD · 1920 px'], [2560, '2K · 2560 px'], [3840, '4K · 3840 px']];
const GIF_SIZES = [[640, '640 px'], [960, '960 px'], [1280, '1280 px'], [1920, 'HD · 1920 px']];
// frame rates: the timescale and each frame's duration in it (29.97 is NTSC's 30000/1001)
const RATES = { 25: { ts: 25000, dur: 1000 }, 29.97: { ts: 30000, dur: 1001 }, 30: { ts: 30000, dur: 1000 }, 60: { ts: 60000, dur: 1000 } };
export const FORMATS = {
  mp4: { label: 'MP4', ext: 'mp4', alpha: false, note: 'H.264. The smallest file; plays everywhere (Slack, PowerPoint, phones, the web). No transparency.' },
  mov: { label: 'MOV', ext: 'mov', alpha: true, note: 'Lossless QuickTime (PNG codec), for Premiere, After Effects, Final Cut and DaVinci Resolve. Keeps transparency. Large files.' },
  png: { label: 'PNG seq.', ext: 'zip', alpha: true, note: 'Every frame as a PNG, in a .zip: opens in any editing app. Keeps transparency.' },
  gif: { label: 'GIF', ext: 'gif', alpha: true, note: 'For Google Slides, Slack, email and docs, up to 1920 px. 256 colours, finely dithered.' },
};
const MAX_TAKE = 30;                      // s, the longest recording
// a breath between frames, so the page stays responsive (Cancel works) and the encoder can catch up: a message to
// itself, not a timer, since a browser holds a background tab's timers to one a second (an export left running in
// another tab crawled at a frame a second)
const breathe = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => { ch.port1.close(); r(); }; ch.port2.postMessage(0); });
const MAX_FRAMES = 60 * 30;               // a video never has more frames than this

export function initVideo(ctx) {
  const { THREE, $, camera, controls, renderer, state } = ctx;
  const sec = $('#video-section');
  const v = { motion: 'turntable', angle: 360, dir: 1, dur: 8, size: 1920, gifSize: 1280, matte: '#ffffff', fps: '29.97', smooth: 2, lastPreset: 'turntable', format: 'mp4', transparent: false };
  const angleMem = {};                    // each movement keeps its own angle
  const durMem = {};                      // and its own length
  // the device's own moves (fresh from the app each time: they capture where the device is when they start)
  const devMoves = () => (ctx.deviceMoves ? ctx.deviceMoves() : []);
  const motionOf = (k, list = devMoves()) => MOTIONS[k] || list.find((m) => m.key === k) || MOTIONS.turntable;
  const isDevMove = (k) => !MOTIONS[k];
  let take = null;                        // the recording: [{t, p:[x,y,z], q:[x,y,z], f}]
  let rec = null;                         // recording now: { t0, samples }
  let play = null;                        // previewing in the view: { t0, base }
  // where the last preview started, while the camera stays where that preview left it: the next preview and the video
  // start from there again (not from the end of the last one)
  let anchor = null;
  const poseKey = () => [...camera.position.toArray(), ...controls.target.toArray(), camera.getFocalLength()].map((x) => x.toFixed(3)).join();
  function baseView() {
    if (anchor && anchor.key === poseKey()) return anchor.start;
    anchor = null;
    return grab();
  }
  let busy = false, cancel = false;

  // ---------------------------------------------------------------- the camera
  function grab() {
    const pivot = ctx.pivot(), rel = camera.position.clone().sub(pivot);
    const el = 90 - new THREE.Spherical().setFromVector3(rel).phi / DEG;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion); right.y = 0;
    if (right.lengthSq() < 1e-8) right.set(1, 0, 0); right.normalize();
    return { target: controls.target.clone(), pos: camera.position.clone(), focal: camera.getFocalLength(), pivot, el, right };
  }
  function restore(s) {
    controls.target.copy(s.target); camera.position.copy(s.pos);
    if (Math.abs(camera.getFocalLength() - s.focal) > 1e-3) { camera.setFocalLength(s.focal); camera.updateProjectionMatrix(); }
    camera.lookAt(controls.target); controls.update(); ctx.cameraMoved();
  }
  // the camera and the point it looks at turned together round the device's centre: over it (round the camera's
  // horizontal), then round the vertical; then moved along the view line for the distance
  const _q = new THREE.Quaternion(), _qy = new THREE.Quaternion(), _p = new THREE.Vector3(), _t = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
  function poseAt(t, base, m = motionOf(v.motion)) {
    // (a device's own move keeps its own timing, soft starts and stops included: the Speed setting is for the camera's)
    const e = m.act ? t : v.smooth === 2 ? easeStrong(t) : v.smooth === 1 ? easeGentle(t) : t;
    if (m.act) m.act(e);   // (a device's own move: the device first, then the camera with it)
    const o = m.angle ? m.at(e, v.angle, v.dir) : m.at(e);
    // never past straight above, nor under the floor (no lower than your view, or 3° above the floor)
    const over = THREE.MathUtils.clamp(o.el ?? 0, Math.min(0, 3 - base.el), Math.max(0, 85 - base.el));
    _q.setFromAxisAngle(base.right, -over * DEG);
    _qy.setFromAxisAngle(_Y, (o.az ?? 0) * DEG);
    _q.premultiply(_qy);
    _p.copy(base.pos).sub(base.pivot).applyQuaternion(_q).add(base.pivot);
    _t.copy(base.target).sub(base.pivot).applyQuaternion(_q).add(base.pivot);
    const k = o.k ?? 1;
    camera.position.copy(_t).addScaledVector(_p.sub(_t), k);
    controls.target.copy(_t);
    camera.lookAt(_t);
  }
  // the recording at time s (seconds from its start): straight-line between the two samples either side
  function takeAt(s) {
    const S = take.samples; let i = 1;
    while (i < S.length - 1 && S[i].t < s) i++;
    const a = S[i - 1], b = S[i], k = b.t > a.t ? THREE.MathUtils.clamp((s - a.t) / (b.t - a.t), 0, 1) : 1;
    camera.position.set(a.p[0] + (b.p[0] - a.p[0]) * k, a.p[1] + (b.p[1] - a.p[1]) * k, a.p[2] + (b.p[2] - a.p[2]) * k);
    controls.target.set(a.q[0] + (b.q[0] - a.q[0]) * k, a.q[1] + (b.q[1] - a.q[1]) * k, a.q[2] + (b.q[2] - a.q[2]) * k);
    const f = a.f + (b.f - a.f) * k;
    if (Math.abs(camera.getFocalLength() - f) > 1e-3) { camera.setFocalLength(f); camera.updateProjectionMatrix(); }
    camera.lookAt(controls.target);
  }
  const length = () => (v.motion === 'mine' ? (take ? take.length : 0) : v.dur);

  // ---------------------------------------------------------------- recording and previewing, driven by the app's loop
  function tick() {
    if (rec) {
      const t = (performance.now() - rec.t0) / 1000;
      const p = camera.position, q = controls.target, f = camera.getFocalLength(), last = rec.samples[rec.samples.length - 1];
      const same = last && Math.abs(last.p[0] - p.x) + Math.abs(last.p[1] - p.y) + Math.abs(last.p[2] - p.z) + Math.abs(last.q[0] - q.x) + Math.abs(last.q[1] - q.y) + Math.abs(last.q[2] - q.z) + Math.abs(last.f - f) < 1e-4;
      if (!same || t - last.t > 0.25) rec.samples.push({ t, p: [p.x, p.y, p.z], q: [q.x, q.y, q.z], f, moved: !same });
      if (rec.samples.length > 20000) rec.samples.splice(1, 1);   // (never grows without bound)
      $('#vid-rec-time').textContent = `${t.toFixed(1)} s`;
      if (t >= MAX_TAKE) stopRec();
    }
    if (play) {
      const s = (performance.now() - play.t0) / 1000, L = length();
      if (!L || s >= L) {   // the end: stays there
        if (v.motion === 'mine') takeAt(L); else poseAt(1, play.base, play.move);
        ctx.cameraMoved(); stopPlay(); return;
      }
      if (v.motion === 'mine') takeAt(s); else poseAt(s / L, play.base, play.move);
      ctx.cameraMoved();
    }
  }

  function startRec() {
    stopPlay();
    rec = { t0: performance.now(), samples: [] };
    sec.classList.add('recording'); ctx.setRecording(true);
    $('#vid-rec').innerHTML = '<span class="rec-dot"></span>Stop';
    tick();
  }
  function stopRec() {
    if (!rec) return;
    const S = rec.samples; rec = null;
    sec.classList.remove('recording'); ctx.setRecording(false);
    $('#vid-rec').innerHTML = '<span class="rec-dot"></span>Record';
    // trim the still start and end (before the first drag, after the last)
    let a = S.findIndex((s) => s.moved), b = S.length - 1 - [...S].reverse().findIndex((s) => s.moved);
    if (a < 0) { take = null; info('Nothing moved: drag, scroll or pan the view while recording.'); return refresh(); }
    a = Math.max(0, a - 1); b = Math.min(S.length - 1, b);
    const t0 = S[a].t, kept = S.slice(a, b + 1).map((s) => ({ ...s, t: s.t - t0 }));
    const lead = 0.3;                                       // a beat of stillness each end
    kept.forEach((s) => { s.t += lead; });
    kept.unshift({ ...kept[0], t: 0 }); kept.push({ ...kept[kept.length - 1], t: kept[kept.length - 1].t + lead });
    take = { samples: kept, length: kept[kept.length - 1].t, start: kept[0] };
    info(''); refresh();
  }
  function startPlay() {
    if (busy || rec) return;
    if (v.motion === 'mine' && !take) return;
    stopPlay();
    const move = v.motion === 'mine' ? null : motionOf(v.motion);
    if (move?.prep) move.prep();   // (a device's move set up first, its first-time drawing costs included: then the clock starts)
    play = { t0: performance.now(), base: baseView(), move };
    controls.enabled = false;
    $('#vid-preview').innerHTML = '■ Stop';
  }
  function stopPlay() {   // the camera (and the device, for its own moves) stays where the preview got to
    if (!play) return;
    const start = play.base, move = play.move; play = null;
    move?.done?.();
    controls.enabled = true;
    controls.update();
    anchor = { start, key: poseKey() };
    $('#vid-preview').innerHTML = '▶ Preview';
  }

  // ---------------------------------------------------------------- the video
  const hexRGB = (h) => [1, 3, 5].map((i) => parseInt((h || '#ffffff').slice(i, i + 2), 16) || 0);
  const rate = () => RATES[v.fps];
  const fpsNum = () => rate().ts / rate().dur;
  const alphaOn = () => v.transparent && FORMATS[v.format].alpha;
  // a GIF's frame delay is in hundredths of a second: 25 fps → 4, 29.97 and 30 → 3 (33 fps), 60 → 2 (50 fps)
  const gifDelay = () => Math.max(2, Math.round(100 / fpsNum())) * 10;
  function videoSize() {
    const asp = ctx.aspect(), long = v.format === 'gif' ? v.gifSize : v.size;
    let w = asp >= 1 ? long : long * asp, h = asp >= 1 ? long / asp : long;
    return [Math.round(w / 2) * 2, Math.round(h / 2) * 2];   // (H.264 wants even sizes)
  }
  async function pickConfig(W, H) {
    if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return null;
    const bitrate = Math.round(Math.min(60e6, W * H * fpsNum() * 0.22));
    for (const codec of ['avc1.640034', 'avc1.640033', 'avc1.4d0034', 'avc1.42e034', 'avc1.640028', 'avc1.42e01f']) {
      const config = { codec, width: W, height: H, bitrate, framerate: fpsNum(), avc: { format: 'avc' } };
      try { const r = await VideoEncoder.isConfigSupported(config); if (r.supported) return r.config; } catch { /* try the next */ }
    }
    return null;
  }
  // MP4: frames go to the H.264 encoder as they are made, the muxer collecting what it gives back
  async function mp4Writer(W, H) {
    const config = await pickConfig(W, H);
    if (!config) throw new Error(`this browser can't make ${W} × ${H} MP4 videos. Try a smaller size, another format, or the latest Chrome or Safari`);
    const r = rate(), target = new ArrayBufferTarget();
    // (the muxer's own frame rate must be a whole number: 29.97 gets an exact timescale instead, 30000, vendor patch)
    const muxer = new Muxer({ target, video: { codec: 'avc', width: W, height: H, ...(r.dur === 1000 ? { frameRate: r.ts / 1000 } : { timescale: r.ts }) }, fastStart: 'in-memory', firstTimestampBehavior: 'offset' });
    let err = null, i = 0, bytes = 0;
    const enc = new VideoEncoder({ output: (chunk, meta) => { bytes += chunk.byteLength; muxer.addVideoChunk(chunk, meta); }, error: (e) => { err = e; } });
    enc.configure(config);
    const key = Math.round(fpsNum() * 2);
    return {
      async add(canvas) {
        if (err) throw err;
        const ts = Math.round((i * 1e6 * r.dur) / r.ts), next = Math.round(((i + 1) * 1e6 * r.dur) / r.ts);
        const vf = new VideoFrame(canvas, { timestamp: ts, duration: next - ts });
        try { enc.encode(vf, { keyFrame: i % key === 0 }); } finally { vf.close(); }
        i++;
        // don't run ahead of the encoder (it holds every frame it hasn't finished in memory)
        while (enc.encodeQueueSize > 3 && !err) await breathe();
      },
      get bytes() { return bytes; },
      async finishAsync() { await enc.flush(); if (err) throw err; muxer.finalize(); return new Blob([target.buffer], { type: 'video/mp4' }); },
      close() { try { if (enc.state !== 'closed') enc.close(); } catch { /* closed */ } },
    };
  }

  async function exportVideo() {
    if (busy) return;
    if (rec) stopRec();
    stopPlay();
    const L = length();
    if (!L) { info('Record a movement first.'); return; }
    const fmt = FORMATS[v.format], alpha = alphaOn(), [W, H] = videoSize();
    const fps = v.format === 'gif' ? 1000 / gifDelay() : fpsNum();
    const frames = Math.min(MAX_FRAMES, Math.max(2, Math.round(L * fps)));
    const m = v.motion === 'mine' ? MOTIONS.mine : motionOf(v.motion);
    // a steady loop's last frame would be its first again: stop one short, so it repeats without a stutter
    const loops = v.motion !== 'mine' && m.loop && (m.act ? true : v.smooth === 0 && !(v.motion === 'turntable' && v.angle % 360));
    const devSaved = m.save ? m.save() : undefined;
    if (m.prep) m.prep();
    const subject = `${ctx.subject()}_video_${v.motion === 'mine' ? 'my-movement' : v.motion}_${L.toFixed(0)}s_${W}x${H}_${v.format === 'gif' ? Math.round(fps) : v.fps}fps${alpha ? '_transparent' : ''}`;

    busy = true; cancel = false;
    const home = grab(), base = baseView(), homeAnchor = anchor;
    const btn = $('#vid-download'); btn.disabled = true; $('#download').disabled = true;
    controls.enabled = false;
    ctx.showBusy('Preparing video…', () => { cancel = true; });
    ctx.hold(true);
    await new Promise((r) => setTimeout(r, 30));

    let writer = null, prev = null, shadowWas = null;
    try {
      writer = v.format === 'mp4' ? await mp4Writer(W, H)
        : v.format === 'mov' ? movWriter(W, H, rate(), alpha)
        : v.format === 'png' ? zipWriter(subject)
        : gifWriter(W, H, gifDelay(), hexRGB(alpha ? v.matte : ctx.state.bg), alpha);
      // a transparent GIF has no floor shadow (a GIF can't hold its soft see-through tones): left out of the frames
      if (v.format === 'gif' && alpha) shadowWas = ctx.setShadow(false);
      prev = ctx.beginFrames(W, H);
      const out = document.createElement('canvas'); out.width = W; out.height = H;
      const octx = out.getContext('2d', { alpha, willReadFrequently: v.format === 'gif' });
      octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = 'high';
      const at = (t) => { if (v.motion === 'mine') takeAt(t * L); else poseAt(t, base, m); };
      if (writer.setPalette) {   // the GIF's colours, from five frames across the movement
        ctx.busyText('Choosing the GIF\'s colours…');
        const samples = [];
        for (const t of [0, 0.25, 0.5, 0.75, 1]) { at(t); ctx.renderFrame(octx, W, H, alpha); samples.push(octx.getImageData(0, 0, W, H).data); await breathe(); }
        writer.setPalette(samples);
      }
      for (let i = 0; i < frames; i++) {
        if (cancel) throw new Error('cancelled');
        const t = loops ? i / frames : i / (frames - 1);
        at(t);
        ctx.renderFrame(octx, W, H, alpha);
        await writer.add(out);
        const mb = writer.bytes / 1e6;
        ctx.busyText(`Rendering video ${Math.round(((i + 1) / frames) * 100)}%${mb >= 1 ? ` · ${mb < 1000 ? Math.round(mb) + ' MB' : (mb / 1000).toFixed(1) + ' GB'}` : ''}`);
        await breathe();
      }
      ctx.busyText('Finishing the file…');
      await breathe();
      const blob = writer.finishAsync ? await writer.finishAsync() : writer.finish();
      if (cancel) throw new Error('cancelled');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `${subject}.${fmt.ext}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    } catch (err) {
      if (err?.message !== 'cancelled') { console.error(err); alert(`The video couldn't be made: ${err?.message || err}`); }
    } finally {
      writer?.close?.();
      writer = null;
      if (prev) ctx.endFrames(prev);
      if (shadowWas !== null) ctx.setShadow(shadowWas);
      if (m.restore) m.restore(devSaved);   // (the device as it was before the video)
      restore(home);
      controls.enabled = true;
      if (homeAnchor) anchor = { start: homeAnchor.start, key: poseKey() };
      ctx.hold(false);
      ctx.hideBusy();
      btn.disabled = false; $('#download').disabled = false;
      busy = false;
      refresh();
    }
  }

  // ---------------------------------------------------------------- panel
  const angleEl = $('#vid-angle'), durEl = $('#vid-dur'), sizeSel = $('#vid-size');
  const chip = (k, m) => `<button data-move="${k}" title="${(m.note || '').replace(/"/g, '&quot;')}">${m.label}</button>`;
  $('#vid-cam-chips').innerHTML = CAMERA_MOVES.map((k) => chip(k, MOTIONS[k])).join('');
  let devSig = null;
  function fillDeviceChips() {   // the device's own moves, as chips over the camera's (none: no group)
    const list = devMoves(), sig = (ctx.deviceName ? ctx.deviceName() : '') + list.map((m) => m.key).join();
    if (sig === devSig) return list;
    devSig = sig;
    $('#vid-dev-chips').innerHTML = list.map((m) => chip(m.key, m)).join('');
    $('#vid-dev-name').textContent = ctx.deviceName ? ctx.deviceName() : 'This device';
    $('#vid-dev-group').classList.toggle('hidden', !list.length);
    return list;
  }
  let sizesFor = '';
  function fillSizes() {
    const gif = v.format === 'gif';
    if (sizesFor === String(gif)) return;
    sizesFor = String(gif);
    const cur = gif ? v.gifSize : v.size;
    sizeSel.innerHTML = (gif ? GIF_SIZES : SIZES).map(([s, l]) => `<option value="${s}"${s === cur ? ' selected' : ''}>${l}</option>`).join('');
  }
  $('#vid-format').innerHTML = Object.entries(FORMATS).map(([k, f]) => `<button data-value="${k}">${f.label}</button>`).join('');
  function info(text) { $('#vid-take-info').textContent = text; }
  function refresh() {
    const list = fillDeviceChips();
    // a device's move the new device doesn't have: back to the turntable
    if (v.motion !== 'mine' && isDevMove(v.motion) && !list.some((d) => d.key === v.motion)) { setMotion('turntable'); return; }
    if (v.motion !== 'mine' && isDevMove(v.lastPreset) && !list.some((d) => d.key === v.lastPreset)) v.lastPreset = 'turntable';
    const mine = v.motion === 'mine', m = mine ? MOTIONS.mine : motionOf(v.motion, list);
    $('#vid-presets').classList.toggle('hidden', mine);
    $('#vid-mine').classList.toggle('hidden', !mine);
    $('#vid-note').textContent = mine ? '' : m.note;
    $('#vid-mine-note').textContent = MOTIONS.mine.note;
    document.querySelectorAll('[data-move]').forEach((b) => b.classList.toggle('on', b.dataset.move === v.motion));
    $('#vid-angle-row').classList.toggle('hidden', mine || !m.angle);
    $('#vid-dir-row').classList.toggle('hidden', mine || !m.dir);
    $('#vid-smooth-row').classList.toggle('hidden', mine || !!m.act);   // (a device's move times itself)
    if (!mine) {
      if (m.angle) {
        Object.assign(angleEl, { min: m.angle.min, max: m.angle.max, step: m.angle.step });
        angleEl.value = v.angle;
        $('#vid-angle-l').textContent = m.angle.label;
        $('#vid-angle-v').textContent = `${v.angle}${m.angle.unit || '°'}`;
        ctx.paintRange(angleEl);
      }
      durEl.value = v.dur; $('#vid-dur-v').textContent = `${v.dur} s`;
      ctx.paintRange(durEl);
    } else if (take && !rec) info(`Recorded: ${take.length.toFixed(1)} s`);
    else if (!rec && !$('#vid-take-info').textContent) info('');
    document.querySelectorAll('[data-vseg="dir"] button').forEach((b) => b.classList.toggle('on', +b.dataset.value === v.dir));
    document.querySelectorAll('[data-vseg="fps"] button').forEach((b) => b.classList.toggle('on', b.dataset.value === v.fps));
    document.querySelectorAll('[data-vseg="smooth"] button').forEach((b) => b.classList.toggle('on', +b.dataset.value === v.smooth));
    document.querySelectorAll('[data-vmode] button').forEach((b) => b.classList.toggle('on', (b.dataset.value === 'mouse') === mine));
    document.querySelectorAll('#vid-format button').forEach((b) => b.classList.toggle('on', b.dataset.value === v.format));
    fillSizes();
    const fmt = FORMATS[v.format], tr = $('#vid-transparent');
    tr.checked = v.transparent; tr.disabled = !fmt.alpha;
    $('#vid-transparent-row').classList.toggle('disabled', !fmt.alpha);
    $('#vid-transparent-sub').textContent = fmt.alpha ? '' : `not with ${fmt.label}`;
    $('#vid-format-note').textContent = fmt.note + (v.format === 'gif' && alphaOn() ? ' Transparent: set the colour of the slide it goes on, and its edges blend into it cleanly. Transparent GIFs have no shadow (GIF pixels can only be solid or see-through).' : '');
    const gifA = v.format === 'gif' && alphaOn();
    $('#vid-matte-row').classList.toggle('hidden', !gifA);
    $('#vid-matte').value = v.matte;
    document.querySelectorAll('[data-matte]').forEach((b) => b.classList.toggle('on', b.dataset.matte === v.matte));

    const [W, H] = videoSize(), L = length();
    const fpsText = v.format === 'gif' ? `${Math.round(1000 / gifDelay())} fps` : `${v.fps} fps`;
    $('#vid-info').innerHTML = `<span class="num">${W} × ${H}<small>px</small></span>${fmt.label === 'PNG seq.' ? 'PNG sequence' : fmt.label} · ${fpsText}${L ? ` · ${L.toFixed(1)} s` : ''}${alphaOn() ? ' · transparent' : ''}`;
    $('#vid-preview').disabled = mine && !take;
    btnState();
  }
  function btnState() { $('#vid-download').disabled = busy || (v.motion === 'mine' && (!take || !!rec)); }

  function setMotion(k) {
    if (rec) stopRec();
    stopPlay();
    if (v.motion !== 'mine') { const was = motionOf(v.motion); if (was.angle) angleMem[v.motion] = v.angle; durMem[v.motion] = v.dur; }
    v.motion = k;
    if (k !== 'mine') {
      v.lastPreset = k;
      const m = motionOf(k);
      if (m.angle) v.angle = angleMem[k] ?? m.angle.def;
      v.dur = durMem[k] ?? m.dur;
    }
    info(''); refresh();
  }
  $('#vid-presets').addEventListener('click', (e) => { const b = e.target.closest('[data-move]'); if (b) setMotion(b.dataset.move); });
  document.querySelector('[data-vmode]').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    setMotion(b.dataset.value === 'mouse' ? 'mine' : v.lastPreset);
  });
  angleEl.addEventListener('input', () => { v.angle = +angleEl.value; refresh(); });
  durEl.addEventListener('input', () => { v.dur = +durEl.value; refresh(); });
  sizeSel.addEventListener('change', () => { if (v.format === 'gif') v.gifSize = +sizeSel.value; else v.size = +sizeSel.value; refresh(); });
  document.querySelectorAll('[data-vseg]').forEach((g) => g.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const k = g.dataset.vseg;
    v[k] = k === 'fps' || k === 'format' ? b.dataset.value : +b.dataset.value;
    refresh();
  }));
  $('#vid-transparent').addEventListener('change', (e) => { v.transparent = e.target.checked; refresh(); });
  $('#vid-matte').addEventListener('input', (e) => { v.matte = e.target.value; refresh(); });
  document.querySelectorAll('[data-matte]').forEach((b) => b.addEventListener('click', () => { v.matte = b.dataset.matte; refresh(); }));
  $('#vid-preview').addEventListener('click', () => (play ? stopPlay() : startPlay()));
  $('#vid-rec').addEventListener('click', () => (rec ? stopRec() : startRec()));
  $('#vid-download').addEventListener('click', exportVideo);
  // touching the view stops a preview where it is
  renderer.domElement.addEventListener('pointerdown', () => stopPlay());
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (rec) stopRec(); stopPlay(); } });

  function setAvailable(on) {
    sec.classList.toggle('hidden', !on);
    $('#vid-export-row').classList.toggle('hidden', !on);
    if (!on) { if (rec) stopRec(); stopPlay(); }
  }
  refresh();
  return { tick, refresh, setAvailable, busy: () => busy, playing: () => !!play || !!rec };
}
