import { createCanvas } from 'canvas';

const SCALE = 2;
const W = 18; // logical width (a little room for the corner dot)
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

function drawDot(ctx) {
  // Minimalist matte-red "needs attention" dot at the glyph's top-right corner.
  ctx.save();
  ctx.fillStyle = '#cf5d55';
  ctx.beginPath();
  ctx.arc(13.5, 3, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Render the tray icon as a @2x PNG buffer. count>0 adds a minimalist matte-red
// dot; `dark` picks the glyph color (white on a dark menubar).
export function renderTrayIcon({ count = 0, dark = true } = {}) {
  const canvas = createCanvas(W * SCALE, H * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.clearRect(0, 0, W, H);
  drawGlyph(ctx, dark ? '#ffffff' : '#000000');
  if (count > 0) drawDot(ctx);
  return canvas.toBuffer('image/png');
}
