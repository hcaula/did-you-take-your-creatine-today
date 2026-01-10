import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '../public');
const svgPath = path.join(publicDir, 'creatine.svg');

const sizes = [
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 192, name: 'icon-192.png' },
  { size: 512, name: 'icon-512.png' },
];

async function generateIcons() {
  const svgBuffer = fs.readFileSync(svgPath);

  for (const { size, name } of sizes) {
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(path.join(publicDir, name));
    
    console.log(`✓ Generated ${name} (${size}x${size})`);
  }

  console.log('\n✅ All icons generated successfully!');
}

generateIcons().catch(console.error);
