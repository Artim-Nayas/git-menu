// Build-time: render the macOS app icon (1024²) — white branch glyph on a dark
// rounded-square gradient. Run: node scripts/generate-app-icon.js
import { createCanvas } from 'canvas';
import fs from 'fs';
import { drawGlyph } from '../lib/render-icon.js';

const SIZE = 1024;
const canvas = createCanvas(SIZE, SIZE);
const ctx = canvas.getContext('2d');
ctx.clearRect(0, 0, SIZE, SIZE);

// Rounded square on the macOS icon grid (~824 in 1024).
const margin = 100;
const side = SIZE - margin * 2;
const radius = 185;
const x = margin;
const y = margin;

const grad = ctx.createLinearGradient(x, y, x + side, y + side);
grad.addColorStop(0, '#2d333b');
grad.addColorStop(1, '#1c2128');

ctx.beginPath();
ctx.moveTo(x + radius, y);
ctx.arcTo(x + side, y, x + side, y + side, radius);
ctx.arcTo(x + side, y + side, x, y + side, radius);
ctx.arcTo(x, y + side, x, y, radius);
ctx.arcTo(x, y, x + side, y, radius);
ctx.closePath();
ctx.fillStyle = grad;
ctx.fill();

// Branch glyph (drawn in a 16-unit box) centered, ~46% of the square.
const glyph = side * 0.46;
const scale = glyph / 16;
ctx.save();
ctx.translate(SIZE / 2 - glyph / 2, SIZE / 2 - glyph / 2);
ctx.scale(scale, scale);
drawGlyph(ctx, '#ffffff');
ctx.restore();

fs.mkdirSync('build', { recursive: true });
fs.writeFileSync('build/icon.png', canvas.toBuffer('image/png'));
console.log('build/icon.png written');
