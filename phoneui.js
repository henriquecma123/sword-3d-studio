// Vision AI (iPhone) exercise screen: layers under the arrows, the ROM arrows in the chosen state, layers over them,
// then the rep counter. Geometry is in Figma units (375-wide screen); sprites come from the Figma arrow components.
import { ARROW_SPRITES } from './screens.js';

export const ARROW_STATES = { white: 'white', yellow: 'yellow', g1: 'g1', g2: 'g2', g3: 'g3', full: 'full' };

export function arrowSpriteURLs(screen, state) {
  return screen.arrows.map((a) => `assets/screens/arrows/${a.sprite}-${state}.png`);
}

export function drawPhoneScreen(ctx, k, screen, { below, over, sprites }, reps) {
  ctx.drawImage(below, 0, 0);
  screen.arrows.forEach((a, i) => {
    const im = sprites[i]; if (!im) return;
    const [ox, oy, w, h] = ARROW_SPRITES[im.dataset.sprite];
    const m = a.m;
    ctx.save();
    ctx.setTransform(k * m[0], k * m[1], k * m[2], k * m[3], k * m[4], k * m[5]);
    ctx.drawImage(im, ox, oy, w, h);
    ctx.restore();
  });
  if (over) ctx.drawImage(over, 0, 0);
  // reps: "7" (Figtree SemiBold 64) + "/10" (Figtree Regular 46, 70% white), 4 apart, on a shared baseline
  ctx.save();
  ctx.scale(k, k);
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
  const n = String(Math.max(1, Math.min(10, Math.round(reps))));
  ctx.font = '600 64px Figtree, sans-serif'; const wn = ctx.measureText(n).width;
  ctx.font = '400 46px Figtree, sans-serif'; const wt = ctx.measureText('/10').width;
  const x = 190 - (wn + 4 + wt) / 2, base = 743.5;
  ctx.font = '600 64px Figtree, sans-serif'; ctx.fillText(n, x, base);
  ctx.font = '400 46px Figtree, sans-serif'; ctx.globalAlpha = 0.7; ctx.fillText('/10', x + wn + 4, base);
  ctx.restore();
}
