// Thrive Pad exercise "Score bar", redrawn from the Figma component (Brand Library Assets → Thrive → componentes).
// Coordinates are Figma units relative to the Score bar instance; the caller scales them to image pixels.

// star glyphs, copied from the component's vector paths
const STAR_TOTAL = new Path2D('M 2.786 2.322 L 4.025 0 L 5.263 2.322 L 7.894 2.786 L 6.192 4.798 L 6.811 7.894 L 4.025 6.501 L 1.393 7.740 L 1.857 4.798 L 0 2.786 Z');
const STAR_STEP = new Path2D('M 0 2.417 L 2.064 1.977 L 3.302 0 L 4.541 1.977 L 6.811 2.417 L 5.160 4.174 L 5.572 6.811 L 3.302 5.712 L 1.032 6.811 L 1.445 4.174 Z');
// rounded white outline drawn around an earned star (scaled from the 9.907 x 9.467 "Union" vector)
const OUTLINE = new Path2D('M 4.953 0 C 5.130 0 5.291 0.100 5.370 0.259 L 6.649 2.851 L 9.509 3.266 C 9.684 3.291 9.829 3.414 9.884 3.582 C 9.938 3.750 9.893 3.935 9.766 4.058 L 7.697 6.076 L 8.185 8.925 C 8.215 9.099 8.144 9.275 8.001 9.379 C 7.858 9.483 7.668 9.496 7.512 9.414 L 4.953 8.069 L 2.395 9.414 C 2.238 9.496 2.049 9.483 1.906 9.379 C 1.763 9.275 1.691 9.099 1.721 8.925 L 2.210 6.076 L 0.140 4.058 C 0.014 3.935 -0.032 3.750 0.023 3.582 C 0.077 3.414 0.223 3.291 0.398 3.266 L 3.258 2.851 L 4.537 0.259 C 4.615 0.100 4.777 0 4.953 0 Z M 4.953 1.514 L 3.982 3.481 C 3.915 3.618 3.784 3.713 3.633 3.735 L 1.462 4.050 L 3.033 5.581 C 3.142 5.688 3.192 5.841 3.167 5.992 L 2.796 8.154 L 4.737 7.133 C 4.872 7.062 5.034 7.062 5.169 7.133 L 7.111 8.154 L 6.740 5.992 C 6.714 5.841 6.764 5.688 6.874 5.581 L 8.444 4.050 L 6.274 3.735 C 6.123 3.713 5.992 3.618 5.924 3.481 Z');

const BLUE = '#5993ea', YELLOW = '#fed267', EMPTY = 'rgba(255, 255, 255, 0.4)';
const SEGMENTS = 20, SEG_Y0 = 28.525, SEG_PITCH = 8.668, SEG_H = 7.43, BAR_X = 22.289, BAR_W = 22.29;
const STARS = new Set([0, 4, 8, 12, 16]);   // segments (from the top) that carry a star

export const scoreBarFonts = () => Promise.all([
  document.fonts.load('600 12px Montserrat'),
  document.fonts.load('500 10px Montserrat'),
  document.fonts.load('600 13px Figtree'),
  document.fonts.load('500 12px Figtree'),
  document.fonts.load('400 46px Figtree'),
]).catch(() => {});

function star(ctx, path, x, y, color, scale = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.fillStyle = color; ctx.fill(path, 'evenodd'); ctx.restore();
}

// progress 0–100 fills the 20 segments from the bottom; the header shows the progress number,
// and at 100 it turns into the earned "★ +5" reward
export function drawScoreBar(ctx, k, bar, progress) {
  const [bx, by, bh] = bar;
  const value = Math.round(Math.max(0, Math.min(100, progress)));
  const filled = Math.round(value / 5);
  const done = value === 100;
  ctx.save();
  ctx.scale(k, k);
  ctx.translate(bx, by);

  if (done) {
    star(ctx, STAR_TOTAL, 7.121, 4.953, YELLOW);
    star(ctx, OUTLINE, 6.047, 3.869, '#fff');
  } else {
    star(ctx, STAR_TOTAL, 7.121, 4.953, '#fff');
  }
  ctx.fillStyle = '#fff';
  ctx.font = '600 12.383px Montserrat, Figtree, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(done ? '+5' : String(value), 33.434, 13.1);

  ctx.fillStyle = '#fff';
  ctx.fillRect(BAR_X, 26.049, BAR_W, 1.238);
  for (let i = 0; i < SEGMENTS; i++) {
    const y = SEG_Y0 + i * SEG_PITCH;
    const on = i >= SEGMENTS - filled;
    ctx.fillStyle = on ? BLUE : EMPTY;
    ctx.fillRect(BAR_X, y, BAR_W, SEG_H);
    if (STARS.has(i)) {
      star(ctx, STAR_STEP, 11.738, y + 0.594, on ? YELLOW : '#fff');
      if (on) star(ctx, OUTLINE, 11.184, y + 0.163, '#fff', 0.8);
    }
  }
  ctx.fillStyle = '#fff';
  ctx.fillRect(BAR_X, 201.891, BAR_W, 1.238);

  // rep counter ("1 / 7"), only on the screens whose bar includes it
  if (bh > 220) {
    const base = 224.3, right = 44.359;
    ctx.textAlign = 'left';
    ctx.font = '500 9.907px Montserrat, Figtree, sans-serif';
    const tail = ' / 7', wt = ctx.measureText(tail).width;
    ctx.fillText(tail, right - wt, base);
    ctx.font = '600 13.002px Figtree, sans-serif';
    const w1 = ctx.measureText('1').width;
    ctx.fillText('1', right - wt - w1, base);
  }
  ctx.restore();
}

// Phoenix coach message: a frosted dark capsule centred on the screen, as in the Figma "Phoenix constraint" frame
// (fill #3b3d42 at 70%, 0.31 hairline fading from white to transparent coral, Figtree Medium 12, 12.38 side padding)
export const PILL_MAX = 45;
export function drawPill(ctx, k, screenW, [top, h], text) {
  text = (text || '').trim().slice(0, PILL_MAX);
  if (!text) return;
  const s = h / 29;
  ctx.save();
  ctx.scale(k, k);
  ctx.font = `500 ${12 * s}px Figtree, sans-serif`;
  const w = ctx.measureText(text).width + 2 * 12.383 * s, x = screenW / 2 - w / 2, r = h / 2;
  ctx.beginPath(); ctx.roundRect(x, top, w, h, r);
  ctx.fillStyle = 'rgba(59, 61, 66, 0.7)'; ctx.fill();
  const g = ctx.createLinearGradient(x, top, x + w, top + h);
  g.addColorStop(0, 'rgba(255, 255, 255, 1)'); g.addColorStop(1, 'rgba(255, 130, 131, 0)');
  ctx.lineWidth = 0.31 * s; ctx.strokeStyle = g;
  ctx.beginPath(); ctx.roundRect(x + 0.155 * s, top + 0.155 * s, w - 0.31 * s, h - 0.31 * s, r); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, screenW / 2, top + 18.7 * s);
  ctx.restore();
}
