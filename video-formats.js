// The video's file formats besides MP4: each takes rendered frames one at a time and gives back a Blob at the end.
// Frames are kept as Blobs (which the browser can hold on disk rather than in memory) until the file is put together.
//  - MOV: QuickTime with the PNG codec: lossless, with an alpha channel when transparent. Opens in Premiere,
//    After Effects, Final Cut, DaVinci Resolve and QuickTime Player.
//  - PNG sequence: every frame as a PNG, in a .zip (stored, not compressed: PNGs are compressed already).
//  - GIF: one 256-colour palette for the whole GIF (gifenc), ordered dither; transparent with a matte colour.
import { GIFEncoder, quantize, applyPalette } from './vendor/gifenc.mjs';

export const MAX_BYTES = 3.8e9;            // a file never grows past this (the zip has no 64-bit extension here)

const canvasBlob = (canvas, type) => new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('The browser ran out of memory making a frame.'))), type));

// ---------------------------------------------------------------- QuickTime MOV, PNG codec
// rate: { ts, dur } — the timescale and each frame's duration in it (29.97 fps: 30000 / 1001)
export function movWriter(W, H, rate, alpha) {
  const frames = [], sizes = [];
  let total = 0;
  return {
    async add(canvas) {
      const b = await canvasBlob(canvas, 'image/png');
      frames.push(b); sizes.push(b.size); total += b.size;
      if (total > MAX_BYTES) throw new Error('The file would be larger than 3.8 GB. Choose a shorter video or a smaller size.');
    },
    get bytes() { return total; },
    finish() {
      const n = frames.length, dur = n * rate.dur;
      const ftyp = box('ftyp', str('qt  '), u32(0x20050300), str('qt  '));
      const mdatHead = cat(u32(1), str('mdat'), u64(16 + total));   // 64-bit size: past 4 GB is fine
      let off = ftyp.length + mdatHead.length;
      const offsets = sizes.map((s) => { const o = off; off += s; return o; });
      const matrix = cat(u32(0x10000), u32(0), u32(0), u32(0), u32(0x10000), u32(0), u32(0), u32(0), u32(0x40000000));
      const mvhd = box('mvhd', u32(0), u32(0), u32(0), u32(rate.ts), u32(dur), u32(0x10000), u16(0x100), zeros(10), matrix, zeros(24), u32(2));
      const tkhd = box('tkhd', u32(0x0000000f), u32(0), u32(0), u32(1), u32(0), u32(dur), zeros(8), u16(0), u16(0), u16(0), u16(0), matrix, u32(W << 16), u32(H << 16));
      const mdhd = box('mdhd', u32(0), u32(0), u32(0), u32(rate.ts), u32(dur), u16(0), u16(0));
      const hdlrM = box('hdlr', u32(0), str('mhlr'), str('vide'), u32(0), u32(0), u32(0), pstr('VideoHandler'));
      const vmhd = box('vmhd', u32(1), u16(0x40), u16(0x8000), u16(0x8000), u16(0x8000));
      const hdlrD = box('hdlr', u32(0), str('dhlr'), str('alis'), u32(0), u32(0), u32(0), pstr('DataHandler'));
      const dinf = box('dinf', box('dref', u32(0), u32(1), box('alis', u32(1))));
      const name = new Uint8Array(32); name[0] = 3; name.set(new TextEncoder().encode('PNG'), 1);
      const entry = box('png ', zeros(6), u16(1), u16(0), u16(0), str('appl'), u32(0), u32(0x400), u16(W), u16(H),
        u32(72 << 16), u32(72 << 16), u32(0), u16(1), name, u16(alpha ? 32 : 24), u16(0xffff));
      const stsd = box('stsd', u32(0), u32(1), entry);
      const stts = box('stts', u32(0), u32(1), u32(n), u32(rate.dur));
      const stsc = box('stsc', u32(0), u32(1), u32(1), u32(1), u32(1));
      const stsz = box('stsz', u32(0), u32(0), u32(n), ...sizes.map(u32));
      const co64 = box('co64', u32(0), u32(n), ...offsets.map(u64));
      const stbl = box('stbl', stsd, stts, stsc, stsz, co64);
      const moov = box('moov', mvhd, box('trak', tkhd, box('mdia', mdhd, hdlrM, box('minf', vmhd, hdlrD, dinf, stbl))));
      return new Blob([ftyp, mdatHead, ...frames, moov], { type: 'video/quicktime' });
    },
  };
}

// ---------------------------------------------------------------- PNG sequence in a zip
export function zipWriter(base) {
  const parts = [], central = [];
  let off = 0, count = 0;
  return {
    async add(canvas) {
      const b = await canvasBlob(canvas, 'image/png');
      const data = new Uint8Array(await b.arrayBuffer());
      const crc = crc32(data);
      const nm = new TextEncoder().encode(`${base}/${base}_${String(++count).padStart(5, '0')}.png`);
      const local = cat(u32le(0x04034b50), u16le(20), u16le(0), u16le(0), u16le(0), u16le(0x21), u32le(crc), u32le(data.length), u32le(data.length), u16le(nm.length), u16le(0), nm);
      central.push(cat(u32le(0x02014b50), u16le(20), u16le(20), u16le(0), u16le(0), u16le(0), u16le(0x21), u32le(crc), u32le(data.length), u32le(data.length), u16le(nm.length), u16le(0), u16le(0), u16le(0), u16le(0), u32le(0), u32le(off), nm));
      parts.push(local, b);
      off += local.length + data.length;
      if (off > MAX_BYTES) throw new Error('The file would be larger than 3.8 GB. Choose a shorter video or a smaller size.');
    },
    get bytes() { return off; },
    finish() {
      const cd = cat(...central);
      const end = cat(u32le(0x06054b50), u16le(0), u16le(0), u16le(count), u16le(count), u32le(cd.length), u32le(off), u16le(0));
      return new Blob([...parts, cd, end], { type: 'application/zip' });
    },
  };
}

// ---------------------------------------------------------------- GIF
// One palette for the whole GIF, from frames across the movement (no colour flicker frame to frame), and an ordered
// (Bayer) dither: smooth gradients without the crawling noise an error-diffusion dither makes in motion.
const BAYER = (() => {
  const m = [[0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26], [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25], [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21]];
  const t = new Float32Array(64);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) t[y * 8 + x] = (m[y][x] + 0.5) / 64 - 0.5;
  return t;
})();
// bg: the background colour [r, g, b], kept exact (and undithered) so the GIF sits cleanly on a page of that colour.
// alpha: a transparent GIF. A GIF pixel is either fully see-through or fully solid, so the soft parts are worked out:
//  - the device and its edges (mostly solid): solid, their colour blended into `bg` (the matte: the colour of the slide
//    the GIF goes on) as far as they are see-through: clean edges on that colour, with no dark or light fringe;
//  - the soft floor shadow (mostly see-through): a fine, even stipple of solid dots, each a light tint of the shadow, as
//    many as the shadow is dark (as a printed halftone): it reads as a soft shadow on any background, and stays still
//    as the camera moves (an ordered pattern).
export function gifWriter(W, H, delayMs, bg, alpha = false) {
  const gif = GIFEncoder();
  let palette = null, cache = null, count = 0, bgIndex = 0, clearIndex = -1;
  const index = new Uint8Array(W * H);
  function nearest(r, g, b) {   // (cached per 21-bit colour: steps of 2 levels, fine enough for near-white shadows)
    const key = ((r >> 1) << 14) | ((g >> 1) << 7) | (b >> 1);
    let i = cache[key];
    if (i < 0) {
      let best = 1e9;
      for (let k = 0; k < palette.length; k++) {
        if (k === clearIndex) continue;
        const c = palette[k], dr = c[0] - r, dg = c[1] - g, db = c[2] - b;
        const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
        if (d < best) { best = d; i = k; }
      }
      cache[key] = i;
    }
    return i;
  }
  const SOLID = 0.5;     // see-through below this: the shadow's stipple; above: solid, blended into the matte
  const TINT = 0.14;     // each shadow dot's strength: light dots, many of them (a fine stipple that reads as a soft tone)
  return {
    // the palette from a few frames' pixels (RGBA arrays, blended into the matte), every other pixel of each
    setPalette(samples) {
      const n = samples.reduce((s, d) => s + d.length / 8, 0) | 0, all = new Uint8ClampedArray(n * 4);
      let o = 0;
      for (const d of samples) for (let i = 0; i + 7 < d.length; i += 8) {
        const a = alpha ? d[i + 3] / 255 : 1;
        if (alpha && a < SOLID) continue;   // (the stipple's dots have their own tones, below)
        all[o] = d[i] * a + bg[0] * (1 - a); all[o + 1] = d[i + 1] * a + bg[1] * (1 - a); all[o + 2] = d[i + 2] * a + bg[2] * (1 - a); all[o + 3] = 255; o += 4;
      }
      // 229 colours from the frames, then the background exactly and a fine ladder of 25 tones just darker than it (the
      // soft floor shadow fading into the background: without them it breaks into blotches), and one see-through slot
      palette = quantize(all.subarray(0, Math.max(4, o)), 229, { format: 'rgb565' });
      bgIndex = palette.length; palette.push([bg[0], bg[1], bg[2]]);
      for (let k = 1; k <= 25; k++) { const f = 1 - k * (alpha ? 0.022 : 0.006); palette.push(bg.map((c) => Math.round(c * f))); }
      if (alpha) { clearIndex = palette.length; palette.push([bg[0], bg[1], bg[2]]); }
      cache = new Int16Array(1 << 21).fill(-1);
    },
    async add(canvas) {
      const { data } = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H);
      const amp = 8;   // dither strength, in 0–255 levels: about the palette's step in smooth gradients
      for (let y = 0, p = 0; y < H; y++) {
        const row = (y & 7) * 8;
        for (let x = 0; x < W; x++, p++) {
          const q = p * 4, th = BAYER[row + (x & 7)];
          let r = data[q], g = data[q + 1], b = data[q + 2];
          if (alpha) {
            const a = data[q + 3] / 255;
            if (a < SOLID) {
              // the stipple: a dot here if this spot of the pattern is under the shadow's density
              const s = Math.max(a, TINT), density = a / s;
              if (a < 0.003 || density <= th + 0.5) { index[p] = clearIndex; continue; }
              r = r * s + bg[0] * (1 - s); g = g * s + bg[1] * (1 - s); b = b * s + bg[2] * (1 - s);
              index[p] = nearest(r | 0, g | 0, b | 0);
              continue;
            }
            r = r * a + bg[0] * (1 - a); g = g * a + bg[1] * (1 - a); b = b * a + bg[2] * (1 - a);
          } else if (r === bg[0] && g === bg[1] && b === bg[2]) { index[p] = bgIndex; continue; }
          const d = th * amp;
          r = Math.min(255, Math.max(0, r + d)); g = Math.min(255, Math.max(0, g + d)); b = Math.min(255, Math.max(0, b + d));
          index[p] = nearest(r | 0, g | 0, b | 0);
        }
      }
      // (a transparent GIF clears each frame before the next: otherwise the last frame shows through its see-through parts)
      gif.writeFrame(index, W, H, { palette: count === 0 ? palette : undefined, delay: delayMs, repeat: 0, ...(alpha ? { transparent: true, transparentIndex: clearIndex, dispose: 2 } : {}) });
      count++;
      if (gif.bytesView().length > MAX_BYTES / 4) throw new Error('The GIF would be too large. Choose a shorter video or a smaller size.');
    },
    get bytes() { return gif.bytesView().length; },
    finish() { gif.finish(); return new Blob([gif.bytes()], { type: 'image/gif' }); },
  };
}

// ---------------------------------------------------------------- bytes
function cat(...arrs) {
  const n = arrs.reduce((s, a) => s + a.length, 0), out = new Uint8Array(n);
  let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}
function box(type, ...content) { const body = cat(...content); return cat(u32(8 + body.length), str(type), body); }
function u32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0); return b; }
function u16(v) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v & 0xffff); return b; }
function u64(v) { const b = new Uint8Array(8); const d = new DataView(b.buffer); d.setUint32(0, Math.floor(v / 2 ** 32)); d.setUint32(4, v >>> 0); return b; }
function u32le(v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0, true); return b; }
function u16le(v) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v & 0xffff, true); return b; }
function str(s) { return new TextEncoder().encode(s); }
function pstr(s) { const t = str(s); return cat(new Uint8Array([t.length]), t); }
function zeros(n) { return new Uint8Array(n); }
let CRC_T = null;
function crc32(data) {
  if (!CRC_T) { CRC_T = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_T[i] = c >>> 0; } }
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_T[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
