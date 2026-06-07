// Build promo art from the shared popover renderer (no app code shipped):
//   - frame PNGs (one per tab) in /tmp for GIF assembly + verification
//   - docs/social-preview.png  (1280x640 GitHub social card)
//   - docs/tour.png            (all four tabs side by side, static fallback)
// Run: node scripts/build-promo.js
import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { drawPopover, C, TABS } from '../lib/render-popover.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docs = path.join(__dirname, '..', 'docs');
const tmp = path.join(__dirname, '..', '.promo-frames');
fs.mkdirSync(docs, { recursive: true });
fs.mkdirSync(tmp, { recursive: true });

const W = 400;
const H = 624;

// --- per-tab frames (2x for crisp text) ---
const SCALE = 2;
TABS.forEach((tab, i) => {
  const cv = createCanvas(W * SCALE, H * SCALE);
  const ctx = cv.getContext('2d');
  ctx.scale(SCALE, SCALE);
  // opaque backdrop so the GIF (no alpha gradients) looks clean
  ctx.fillStyle = '#0e0f12';
  ctx.fillRect(0, 0, W, H);
  drawPopover(ctx, tab);
  fs.writeFileSync(path.join(tmp, `frame-${i}-${tab}.png`), cv.toBuffer('image/png'));
});
console.log(`frames: ${TABS.length} written to ${tmp}`);

// --- tour.png: four popovers side by side ---
(() => {
  const gap = 28;
  const tw = W * TABS.length + gap * (TABS.length + 1);
  const cv = createCanvas(tw, H + gap * 2);
  const ctx = cv.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, tw, H);
  bg.addColorStop(0, '#14151a');
  bg.addColorStop(1, '#0c0d10');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cv.width, cv.height);
  TABS.forEach((tab, i) => {
    ctx.save();
    ctx.translate(gap + i * (W + gap), gap);
    drawPopover(ctx, tab);
    ctx.restore();
  });
  fs.writeFileSync(path.join(docs, 'tour.png'), cv.toBuffer('image/png'));
  console.log('docs/tour.png written');
})();

// --- social-preview.png: 1280x640 promo card ---
(() => {
  const SW = 1280;
  const SH = 640;
  const cv = createCanvas(SW, SH);
  const ctx = cv.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, SW, SH);
  bg.addColorStop(0, '#1b1d24');
  bg.addColorStop(1, '#0e0f13');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SW, SH);

  // subtle accent glow
  const glow = ctx.createRadialGradient(980, 320, 60, 980, 320, 520);
  glow.addColorStop(0, 'rgba(45,164,78,0.16)');
  glow.addColorStop(1, 'rgba(45,164,78,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, SW, SH);

  // left: icon + text
  // rounded-square app icon mark
  const ix = 96;
  const iy = 150;
  const isz = 132;
  const ir = 30;
  const ig = ctx.createLinearGradient(ix, iy, ix + isz, iy + isz);
  ig.addColorStop(0, '#2d333b');
  ig.addColorStop(1, '#1c2128');
  roundRect(ctx, ix, iy, isz, isz, ir);
  ctx.fillStyle = ig;
  ctx.fill();
  // branch glyph
  ctx.strokeStyle = '#ECECEC';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  const cx = ix + isz / 2;
  ctx.beginPath();
  ctx.arc(cx - 22, iy + 42, 13, 0, Math.PI * 2); // top node
  ctx.moveTo(cx - 22, iy + 55);
  ctx.lineTo(cx - 22, iy + 92);
  ctx.arc(cx - 22, iy + 92, 13, 0, Math.PI * 2); // bottom-left node
  ctx.moveTo(cx + 24, iy + 55);
  ctx.arc(cx + 24, iy + 42, 13, 0, Math.PI * 2); // right node
  ctx.stroke();
  ctx.beginPath(); // merge curve
  ctx.moveTo(cx + 24, iy + 55);
  ctx.bezierCurveTo(cx + 24, iy + 80, cx - 22, iy + 66, cx - 22, iy + 90);
  ctx.stroke();
  ctx.lineCap = 'butt';

  ctx.fillStyle = '#ECECEC';
  ctx.font = 'bold 92px "Helvetica Neue", Arial, sans-serif';
  ctx.fillText('Git Menu', 268, 248);

  ctx.fillStyle = '#9B9B9B';
  ctx.font = '32px "Helvetica Neue", Arial, sans-serif';
  ctx.fillText('Your GitHub work in the macOS menu bar', 98, 338);
  ctx.fillStyle = '#7d8590';
  ctx.font = '26px "Helvetica Neue", Arial, sans-serif';
  ctx.fillText('PRs · reviews · inbox · Actions · contributions', 98, 380);

  // feature dots
  const feats = [
    ['#2da44e', 'gh-powered — no token setup'],
    ['#d29922', 'Live CI & review status'],
    ['#f0883e', 'Keyboard-first, self-updating'],
  ];
  feats.forEach(([col, label], i) => {
    const y = 452 + i * 46;
    ctx.beginPath();
    ctx.arc(112, y - 9, 7, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.fillStyle = '#C9C9C9';
    ctx.font = '400 26px -apple-system, "Helvetica Neue", Arial, sans-serif';
    ctx.fillText(label, 132, y);
  });

  // right: the popover, scaled + tilted shadow
  ctx.save();
  ctx.translate(820, 18);
  const s = 0.96;
  ctx.scale(s, s);
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 20;
  drawPopover(ctx, 'Actions');
  ctx.restore();

  fs.writeFileSync(path.join(docs, 'social-preview.png'), cv.toBuffer('image/png'));
  console.log('docs/social-preview.png written');
})();

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
