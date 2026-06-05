import { createCanvas } from 'canvas';

const SCALE = 2;
const W = 22; // logical width (room for the corner badge)
const H = 16; // logical height

// Draw the git-branch glyph within a 16x16 logical box, stroked/filled in `color`.
export function drawGlyph(ctx, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(5, 4.5); ctx.lineTo(5, 11.5); ctx.stroke();            // trunk
  ctx.beginPath(); ctx.arc(5, 3.3, 1.9, 0, Math.PI * 2); ctx.fill();                 // top-left node
  ctx.beginPath(); ctx.arc(5, 12.7, 1.9, 0, Math.PI * 2); ctx.fill();                // bottom-left node
  ctx.beginPath(); ctx.moveTo(5, 9); ctx.bezierCurveTo(10.5, 9, 11, 5.5, 11, 5.5); ctx.stroke(); // branch
  ctx.beginPath(); ctx.arc(11, 4.3, 1.9, 0, Math.PI * 2); ctx.fill();                // right node
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBadge(ctx, count) {
  const label = count > 9 ? '9+' : String(count);
  const w = label.length > 1 ? 11 : 9;
  const h = 9;
  const x = W - w;
  const y = 0;
  ctx.save();
  ctx.fillStyle = '#e5484d';
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 7px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 0.5);
  ctx.restore();
}

// Render the tray icon as a @2x PNG buffer. count>0 adds the red corner badge
// (capped at "9+"); `dark` picks the glyph color (white on a dark menubar).
export function renderTrayIcon({ count = 0, dark = true } = {}) {
  const canvas = createCanvas(W * SCALE, H * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.clearRect(0, 0, W, H);
  drawGlyph(ctx, dark ? '#ffffff' : '#000000');
  if (count > 0) drawBadge(ctx, count);
  return canvas.toBuffer('image/png');
}
