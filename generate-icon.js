// Regenerate the monochrome template PNGs from the shared branch glyph.
// Run with: node generate-icon.js
import { createCanvas } from 'canvas';
import fs from 'fs';
import { drawGlyph } from './lib/render-icon.js';

function writeTemplate(size, filename) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.scale(size / 16, size / 16);
  drawGlyph(ctx, 'black'); // template image: black on transparent; macOS inverts for the menubar
  fs.writeFileSync(filename, canvas.toBuffer('image/png'));
  console.log(`${filename} written`);
}

writeTemplate(16, 'iconTemplate.png');
writeTemplate(32, 'iconTemplate@2x.png');
