// Local-only review helper. These sheets never enter the published site.
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { ROOT, escapeHtml, args } from './lib.mjs';

const options = args(process.argv.slice(2));
if (!options.input) throw new Error('用法：node scripts/contact-sheets.mjs --input /照片主题目录');
const sourceRoot = path.resolve(options.input);
const themes = [
  { directory: '中秋节扫街', id: 'mid-autumn-streets' },
  { directory: '青岛映像', id: 'qingdao' },
  { directory: '二道海胶片', id: 'erdaohai-film' },
];
const output = path.join(ROOT, 'test-results');
await mkdir(output, { recursive: true });
for (const theme of themes) {
  const directory = path.join(sourceRoot, theme.directory);
  const files = (await readdir(directory)).filter(file => /\.jpe?g$/i.test(file)).sort((left, right) => left.localeCompare(right, 'en', { numeric: true }));
  const columns = 6;
  const cellWidth = 260;
  const cellHeight = 210;
  const layers = [];
  const manifest = [];
  for (const [index, file] of files.entries()) {
    const buffer = await readFile(path.join(directory, file));
    const photoId = `${theme.id}-${createHash('sha256').update(buffer).digest('hex').slice(0, 16)}`;
    const image = await sharp(buffer).rotate().resize({ width: 246, height: 175, fit: 'contain', background: '#141414' }).toColourspace('srgb').jpeg({ quality: 88 }).toBuffer();
    const label = Buffer.from(`<svg width="260" height="25"><text x="8" y="18" fill="#ededed" font-family="sans-serif" font-size="14">${escapeHtml(String(index + 1).padStart(2, '0'))}</text></svg>`);
    const left = index % columns * cellWidth;
    const top = Math.floor(index / columns) * cellHeight;
    layers.push({ input: image, left: left + 7, top: top + 5 }, { input: label, left, top: top + 181 });
    manifest.push({ number: index + 1, photoId });
  }
  const contactPath = path.join(output, `contact-${theme.id}.jpg`);
  await sharp({ create: { width: columns * cellWidth, height: Math.ceil(files.length / columns) * cellHeight, channels: 3, background: '#141414' } }).composite(layers).jpeg({ quality: 90 }).toFile(contactPath);
  await writeFile(path.join(output, `contact-${theme.id}.json`), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ theme: theme.directory, count: files.length, contactPath }));
}
