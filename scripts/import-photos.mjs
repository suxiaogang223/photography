import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { ROOT, args, validId, validateContent } from './lib.mjs';
import { captureFromExif } from './photo-metadata.mjs';

const supported = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.avif']);
export async function importPhotos({ inputDir, collectionId, title, root = ROOT }) {
  if (!validId(collectionId)) throw new Error('系列 ID 只能使用小写英文、数字和单个连接号。');
  const source = path.resolve(inputDir);
  const contentPath = path.join(root, 'content', 'collections.json');
  const originalManifest = await readFile(contentPath, 'utf8');
  const collections = JSON.parse(originalManifest);
  const site = JSON.parse(await readFile(path.join(root, 'content', 'site.json'), 'utf8'));
  validateContent(site, collections);
  let collection = collections.find(item => item.id === collectionId);
  const entries = await readdir(source, { withFileTypes: true });
  const files = entries.filter(entry => entry.isFile() && supported.has(path.extname(entry.name).toLowerCase())).map(entry => entry.name).sort((left, right) => left.localeCompare(right, 'en', { numeric: true }));
  if (!files.length) throw new Error('没有找到可导入的图片。请先从 Apple 照片导出 JPEG 或 PNG；本工具不导入 HEIC、RAW 或视频。');
  if (!collection) {
    collection = { id: collectionId, title: title || '未命名系列', subtitle: collectionId.replaceAll('-', ' ').toUpperCase(), year: '', description: '在这里写下这个系列的故事。', cover: '', photos: [] };
    collections.push(collection);
  }
  const destination = path.join(root, 'assets', 'media', collectionId);
  await mkdir(destination, { recursive: true });
  const additions = [];
  let skipped = 0;
  let bytes = 0;
  for (const filename of files) {
    const sourceBuffer = await readFile(path.join(source, filename));
    const hash = createHash('sha256').update(sourceBuffer).digest('hex').slice(0, 16);
    const id = `${collectionId}-${hash}`;
    if (collection.photos.some(photo => photo.id === id) || additions.some(photo => photo.id === id)) { skipped++; continue; }
    let sourceMetadata;
    try {
      sourceMetadata = await sharp(sourceBuffer, { failOn: 'error', limitInputPixels: 100_000_000 }).metadata();
    } catch (error) { throw new Error(`图片无法处理：${filename}。${error.message}`); }
    // Scanned film often records the scanner as the camera. Film details are manual per photo.
    const capture = collection.photos.some(photo => photo.capture?.film) ? null : captureFromExif(sourceMetadata.exif);
    const variants = [];
    let largest;
    // Default Sharp output strips EXIF, XMP and IPTC. Rotate first, normalize color to sRGB.
    // Preserve only a standardized sRGB ICC profile, never source metadata.
    for (const [name, width, quality] of [['thumb', 640, 78], ['display', 1600, 84], ['large', 3000, 90]]) {
      let encoded;
      try {
        encoded = await sharp(sourceBuffer, { failOn: 'error', limitInputPixels: 100_000_000 })
          .rotate().resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
          .toColourspace('srgb').withIccProfile('srgb').webp({ quality, effort: 5 })
          .toBuffer({ resolveWithObject: true });
      } catch (error) { throw new Error(`图片无法处理：${filename}。${error.message}`); }
      if (largest && encoded.info.width === largest.info.width && encoded.info.height === largest.info.height) continue;
      const outputName = `${id}-${name}.webp`;
      await writeFile(path.join(destination, outputName), encoded.data, { flag: 'wx' }).catch(async error => {
        if (error.code !== 'EEXIST') throw error;
        // A prior interrupted import can have left this immutable variant behind.
        const existing = await readFile(path.join(destination, outputName));
        if (!existing.equals(encoded.data)) throw new Error(`同名图片内容不同，未覆盖：${outputName}`);
      });
      bytes += encoded.data.length;
      variants.push({ src: `media/${collectionId}/${outputName}`, width: encoded.info.width });
      largest = encoded;
    }
    additions.push({ id, title: `未命名 ${String(collection.photos.filter(photo => !photo.placeholder).length + additions.length + 1).padStart(2, '0')}`, alt: `${collection.title}系列的一张照片，请补充画面描述`, caption: '', width: largest.info.width, height: largest.info.height, variants, ...(capture ? { capture } : {}) });
  }
  if (additions.length) {
    collection.photos = [...collection.photos.filter(photo => !photo.placeholder), ...additions];
    if (!collection.photos.some(photo => photo.id === collection.cover)) collection.cover = collection.photos[0].id;
    if (title) collection.title = title;
    if (collection.year === '预览') collection.year = '';
    validateContent(site, collections);
    // Don't overwrite a manifest that was edited while conversion was in progress.
    if (await readFile(contentPath, 'utf8') !== originalManifest) throw new Error('作品清单已被修改，本次未覆盖。图片已生成，请检查后重试导入。');
    const temporary = `${contentPath}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(collections, null, 2)}\n`, { flag: 'wx' });
    await rename(temporary, contentPath);
  }
  return { imported: additions.length, skipped, bytes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.includes('--help')) {
      console.log('npm run import -- --input /绝对路径/照片目录 --collection ordinary-light --title "寻常的光"\n支持 JPEG、PNG、WebP、TIFF、AVIF。只生成展示图，不复制原图；重复导入跳过已登记照片。');
    } else {
      const options = args(process.argv.slice(2));
      if (!options.input || !options.collection || Object.keys(options).some(key => !['input', 'collection', 'title'].includes(key))) throw new Error('用法：npm run import -- --input /照片目录 --collection 系列-id [--title 系列名称]');
      const result = await importPhotos({ inputDir: options.input, collectionId: options.collection, title: options.title });
      console.log(`导入 ${result.imported} 张，跳过 ${result.skipped} 张，新增展示图片 ${(result.bytes / 1e6).toFixed(2)} MB。请在 content/collections.json 完善标题、描述和排序。`);
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
