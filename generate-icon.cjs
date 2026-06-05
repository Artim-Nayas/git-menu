const { createCanvas } = require('canvas');
const fs = require('fs');

function drawIcon(size, filename) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'transparent';
  ctx.fillRect(0, 0, size, size);

  // Define scaling factor based on size (16 -> 1, 32 -> 2)
  const scale = size / 16;
  ctx.scale(scale, scale);

  ctx.strokeStyle = 'black';
  ctx.fillStyle = 'black';
  ctx.lineWidth = 1.5; // thinner lines
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Draw PR icon within a 16x16 box, with some padding
  
  // Base branch (left vertical line)
  ctx.beginPath();
  ctx.moveTo(5, 4);
  ctx.lineTo(5, 12);
  ctx.stroke();

  // Bottom circle (left)
  ctx.beginPath();
  ctx.arc(5, 13, 2, 0, Math.PI * 2);
  ctx.fill();

  // Top circle (left)
  ctx.beginPath();
  ctx.arc(5, 3, 2, 0, Math.PI * 2);
  ctx.fill();

  // Branching line
  ctx.beginPath();
  ctx.moveTo(5, 10);
  ctx.bezierCurveTo(11, 10, 11, 6, 11, 6);
  ctx.stroke();

  // Right branch top circle
  ctx.beginPath();
  ctx.arc(11, 4.5, 2, 0, Math.PI * 2);
  ctx.fill();

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(filename, buffer);
  console.log(`${filename} generated.`);
}

drawIcon(16, 'iconTemplate.png');
drawIcon(32, 'iconTemplate@2x.png');
