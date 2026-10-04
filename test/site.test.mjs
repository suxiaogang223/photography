import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { ROOT, loadContent, validateContent, normalizeBase, mediaUrl } from '../scripts/lib.mjs';
import { renderSite, buildSite } from '../scripts/build.mjs';
import { importPhotos } from '../scripts/import-photos.mjs';

const example = {
  site: JSON.parse(await readFile(path.join(ROOT, 'test/fixtures/content/site.json'), 'utf8')),
  collections: JSON.parse(await readFile(path.join(ROOT, 'test/fixtures/content/collections.json'), 'utf8')),
};
validateContent(example.site, example.collections);
async function workspace(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'photography-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await cp(path.join(ROOT, 'test/fixtures/content'), path.join(directory, 'content'), { recursive: true });
  await cp(path.join(ROOT, 'assets/placeholders'), path.join(directory, 'assets/placeholders'), { recursive: true });
  await cp(path.join(ROOT, 'src'), path.join(directory, 'src'), { recursive: true });
  return directory;
}

test('renders independent pages, responsive images, and honest placeholder labels', () => {
  const pages = renderSite(example);
  assert.equal(pages.size, 7);
  assert.match(pages.get('index.html'), /布局预览/);
  assert.match(pages.get('index.html'), /srcset=/);
  assert.match(pages.get('index.html'), /fetchpriority="high"/);
  assert.match(pages.get('index/index.html'), /data-filter="ordinary-light"/);
  assert.match(pages.get('series/ordinary-light/index.html'), /返回系列/);
  assert.match(pages.get('404.html'), /页面不存在/);
  assert.match(pages.get('about/index.html'), /业余摄影师/);
  for (const page of pages.values()) {
    assert.match(page, /href="\/photography\/assets\/style.css"/);
    assert.doesNotMatch(page, /https:\/\/(?:fonts|images|unpkg|cdn\.jsdelivr)/);
  }
});

test('live collections and their image files remain valid independently of sample fixtures', async () => {
  const live = await loadContent();
  assert.ok(renderSite(live).has('index.html'));
  const digital = live.collections.flatMap(collection => collection.photos).filter(photo => photo.capture && !photo.capture.film);
  assert.ok(digital.length > 0);
  for (const photo of digital) {
    if (photo.capture.focalLength) assert.match(photo.capture.focalLength, /^\d+mm$/);
  }
});

test('lightbox receives distinct capture details for each photo', () => {
  const modified = structuredClone(example);
  modified.collections[0].photos[0].capture = { camera: 'NIKON Z fc', aperture: 'f/5.6', shutter: '1/640 s', iso: '200', dateTime: '2026-10-01T16:29' };
  modified.collections[0].photos[1].capture = { camera: 'Ricoh Elnica 35', film: 'Kodak UltraMax 400' };
  const page = renderSite(modified).get('index.html');
  assert.match(page, /id="lightbox-capture" class="lightbox-capture" role="group" aria-label="照片拍摄参数" hidden/);
  assert.match(page, /id="lightbox-readout" class="lightbox-readout" hidden/);
  const runtime = JSON.parse(page.match(/<script id="gallery-data" type="application\/json">(.*?)<\/script>/s)[1]);
  assert.deepEqual(runtime.photos.find(photo => photo.id === 'light-01').capture, modified.collections[0].photos[0].capture);
  assert.deepEqual(runtime.photos.find(photo => photo.id === 'light-02').capture, modified.collections[0].photos[1].capture);
  assert.equal(runtime.photos.find(photo => photo.id === 'places-01').capture, undefined);
  assert.throws(() => validateContent(modified.site, [{ ...modified.collections[0], photos: [{ ...modified.collections[0].photos[0], capture: { gps: 'secret' } }] }]));
  assert.throws(() => validateContent(modified.site, [{ ...modified.collections[0], photos: [{ ...modified.collections[0].photos[0], capture: { dateTime: 'not a date' } }] }]));
});

test('sorts series newest first by capture-period start without reordering their photographs', () => {
  const content = structuredClone(example);
  content.collections[0].dateRange = { start: '2026-09-25', end: '2026-09-25', source: 'EXIF DateTimeOriginal' };
  content.collections[1].dateRange = { start: '2026-10-01', end: '2026-10-02', source: 'EXIF DateTimeOriginal' };
  content.collections[2].dateRange = { start: '2026-09-28', end: '2026-09-28', source: 'EXIF DateTimeOriginal' };
  const appended = structuredClone(content.collections[0]);
  appended.id = 'newly-imported';
  appended.dateRange = { start: '2026-09-27', end: '2026-10-02', source: 'EXIF DateTimeOriginal' };
  appended.photos = appended.photos.map(photo => ({ ...photo, id: `new-${photo.id}` }));
  appended.cover = appended.photos[0].id;
  content.collections.push(appended);
  const before = structuredClone(content);
  const pages = renderSite(content);
  const home = pages.get('index.html');
  const runtime = JSON.parse(home.match(/<script id="gallery-data" type="application\/json">(.*?)<\/script>/s)[1]);
  assert.deepEqual(runtime.collections.map(collection => collection.id), ['between-places', 'quiet-moments', 'newly-imported', 'ordinary-light']);
  for (const collection of content.collections) {
    assert.deepEqual(runtime.photos.filter(photo => photo.collection === collection.id).map(photo => photo.id), collection.photos.map(photo => photo.id));
  }
  const hero = home.match(/<section class="hero".*?<\/section>/s)[0];
  assert.match(hero, new RegExp(`data-photo="${content.collections[1].cover}"`));
  const cards = [...home.matchAll(/class="series-cover" href="\/photography\/series\/([^/]+)\//g)].map(match => match[1]);
  assert.deepEqual(cards, runtime.collections.map(collection => collection.id));
  const filters = [...pages.get('index/index.html').matchAll(/data-filter="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(filters, ['all', ...cards]);
  assert.match(pages.get('series/between-places/index.html'), /class="next-series".*?series\/quiet-moments\//s);
  assert.deepEqual(content, before);
  delete content.collections[0].dateRange;
  assert.equal(JSON.parse(renderSite(content).get('index.html').match(/<script id="gallery-data" type="application\/json">(.*?)<\/script>/s)[1]).collections.at(-1).id, 'ordinary-light');
});

test('about page renders an independent responsive portrait, not a gallery photograph', () => {
  const modified = structuredClone(example);
  modified.site.about = '业余摄影师，喜欢森山大道与亚力克斯·韦伯。';
  modified.site.portrait = { alt: '个人照片 <相机>', width: 936, height: 839, variants: [
    { src: 'media/profile/small.webp', width: 480 }, { src: 'media/profile/large.webp', width: 936 },
  ] };
  validateContent(modified.site, modified.collections);
  const pages = renderSite(modified);
  const about = pages.get('about/index.html');
  assert.match(about, /href="\/photography\/about\/" aria-current="page"/);
  assert.match(about, /业余摄影师，喜欢森山大道与亚力克斯·韦伯/);
  assert.match(about, /width="936" height="839" alt="个人照片 &lt;相机&gt;"/);
  assert.match(about, /small.webp 480w, .*large.webp 936w/);
  assert.doesNotMatch(about, /data-photo=/);
  const runtime = JSON.parse(about.match(/<script id="gallery-data" type="application\/json">(.*?)<\/script>/s)[1]);
  assert.equal(runtime.photos.length, modified.collections.flatMap(collection => collection.photos).length);
  modified.site.mediaBaseUrl = 'https://images.example.com';
  assert.match(renderSite(modified, '/').get('about/index.html'), /src="https:\/\/images.example.com\/media\/profile\/large.webp"/);
});

test('numbers series oldest to newest, keeping existing numbers when a newer series is added', () => {
  const content = structuredClone(example);
  const [oldest, newest, middle] = content.collections;
  oldest.dateRange = { start: '2026-09-25', end: '2026-09-25' };
  newest.dateRange = { start: '2026-10-01', end: '2026-10-02' };
  middle.dateRange = { start: '2026-09-28', end: '2026-09-28' };
  const numbers = html => new Map([...html.matchAll(/class="series-cover" href="\/photography\/series\/([^/]+)\/".*?class="series-number">(\d+)<\/span>/gs)].map(match => [match[1], match[2]]));
  const before = renderSite(content).get('index.html');
  assert.deepEqual([...numbers(before)], [[newest.id, '03'], [middle.id, '02'], [oldest.id, '01']]);
  assert.match(before, /FEATURED SERIES \/ 03/);
  assert.match(before.match(/<section class="hero".*?<\/section>/s)[0], new RegExp(`data-photo="${newest.cover}"`));
  const added = structuredClone(oldest);
  added.id = 'later-series';
  added.dateRange = { start: '2026-10-03', end: '2026-10-03' };
  added.photos = added.photos.map(photo => ({ ...photo, id: `later-${photo.id}` }));
  added.cover = added.photos[0].id;
  content.collections.push(added);
  const after = renderSite(content).get('index.html');
  assert.deepEqual([...numbers(after)], [[added.id, '04'], ...numbers(before)]);
  assert.match(after, /FEATURED SERIES \/ 04/);
  assert.match(after.match(/<section class="hero".*?<\/section>/s)[0], new RegExp(`data-photo="${added.cover}"`));
});

test('portrait validation rejects unsafe paths, dimensions and missing local assets', async t => {
  const portrait = { alt: '个人照片', width: 936, height: 839, variants: [{ src: 'media/profile/missing.webp', width: 936 }] };
  for (const mutate of [
    value => { value.alt = ''; }, value => { value.height = 0; },
    value => { value.variants[0].src = 'media/../../secret.jpg'; },
    value => { value.variants[0].width = 1000; },
    value => { value.variants.push({ ...value.variants[0] }); },
  ]) {
    const value = structuredClone(portrait);
    mutate(value);
    assert.throws(() => validateContent({ ...example.site, portrait: value }, example.collections));
  }
  const root = await workspace(t);
  await writeFile(path.join(root, 'content/site.json'), JSON.stringify({ ...example.site, portrait }));
  await assert.rejects(loadContent(root), /找不到个人照片文件/);
});

test('series dates appear with semantic time tags while categories and covers are preserved', () => {
  const modified = structuredClone(example);
  modified.collections[0].category = '街头摄影';
  modified.collections[0].dateRange = { start: '2026-09-25', end: '2026-09-25', source: 'EXIF DateTimeOriginal' };
  modified.collections[1].dateRange = { start: '2026-10-01', end: '2026-10-02', source: 'EXIF DateTimeOriginal' };
  const pages = renderSite(modified);
  const home = pages.get('index.html');
  assert.match(home, /街头摄影/);
  assert.match(home, /<time datetime="2026-09-25">2026\.09\.25<\/time>/);
  assert.match(home, /<time datetime="2026-10-02">10\.02<\/time>/);
  assert.match(pages.get('series/between-places/index.html'), /照片日期/);
  modified.collections[1].dateRange.end = '2027-01-01';
  assert.match(renderSite(modified).get('index.html'), /<time datetime="2027-01-01">2027\.01\.01<\/time>/);
});

test('neutral dark theme keeps all interface colors achromatic and does not filter photos', async () => {
  const css = await readFile(path.join(ROOT, 'src', 'style.css'), 'utf8');
  assert.match(css, /color-scheme:dark/);
  assert.match(css, /--paper:#141414/);
  for (const [, color] of css.matchAll(/#([0-9a-f]{6})(?:[0-9a-f]{2})?\b/gi)) {
    assert.equal(color.slice(0, 2), color.slice(2, 4), `neutral red/green: ${color}`);
    assert.equal(color.slice(2, 4), color.slice(4, 6), `neutral green/blue: ${color}`);
  }
  assert.doesNotMatch(css, /(?:^|[;{])filter:/);
  assert.match(css, /\.hero img\{height:100%;object-fit:contain/);
  assert.match(css, /\.series-cover img\{height:100%;object-fit:contain/);
  assert.match(css, /\.hero \.photo-open\{[^}]*aspect-ratio:3\/2/);
  assert.match(css, /\.series-cover\{[^}]*aspect-ratio:3\/2/);
  assert.doesNotMatch(css, /(?:\.hero \.photo-open|\.series-card:nth-child\([^)]*\) \.series-cover)\{aspect-ratio:(?!3\/2)/);
  const page = renderSite(example).get('index.html');
  assert.match(page, /name="theme-color" content="#141414"/);
  assert.match(page, /name="color-scheme" content="dark"/);
  assert.match(page, new RegExp(example.site.subtitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('root deployment, canonical URL, and CDN migration keep independent asset bases', () => {
  const modified = structuredClone(example);
  modified.site.siteUrl = 'https://photo.example.com';
  modified.site.mediaBaseUrl = 'https://images.example.com';
  const pages = renderSite(modified, '/');
  assert.match(pages.get('index.html'), /href="\/assets\/style.css"/);
  assert.match(pages.get('index/index.html'), /rel="canonical" href="https:\/\/photo.example.com\/index\/"/);
  assert.equal(mediaUrl('media/test/one.webp', modified.site, '/photography/'), 'https://images.example.com/media/test/one.webp');
  assert.equal(mediaUrl('placeholders/light.svg', modified.site, '/photography/'), '/photography/assets/placeholders/light.svg');
  assert.throws(() => normalizeBase('//attacker.example/'));
  assert.throws(() => normalizeBase('/../'));
});

test('escapes captions in HTML and embedded gallery JSON', () => {
  const modified = structuredClone(example);
  modified.collections[0].photos[0].title = '<script>alert("x")</script>';
  modified.collections[0].photos[0].caption = '</script><script>oops</script>';
  const page = renderSite(modified).get('index.html');
  assert.doesNotMatch(page, /<script>alert/);
  assert.doesNotMatch(page, /<script>oops/);
  const json = page.match(/<script id="gallery-data" type="application\/json">(.*?)<\/script>/s)[1];
  assert.equal(JSON.parse(json).photos[0].caption, modified.collections[0].photos[0].caption);
});

test('rejects missing covers, duplicate IDs, unsafe paths, invalid media origins', () => {
  for (const mutate of [
    content => { content.collections[0].cover = 'missing'; },
    content => { content.collections[1].id = content.collections[0].id; },
    content => { content.collections[0].photos[0].variants[0].src = 'media/../../secret.jpg'; },
    content => { content.site.mediaBaseUrl = 'javascript:alert(1)'; },
    content => { content.collections[0].photos[0].height = 0; },
  ]) {
    const modified = structuredClone(example);
    mutate(modified);
    assert.throws(() => validateContent(modified.site, modified.collections));
  }
});

test('handles no collections or empty collections without broken cover images', () => {
  for (const collections of [[], [{ ...example.collections[0], photos: [] }]]) {
    const pages = renderSite({ site: example.site, collections });
    assert.match(pages.get('index.html'), /第一张照片，还在路上/);
    assert.equal(pages.size, 4);
  }
});

test('builds all local links and assets with optional sitemap', async t => {
  const root = await workspace(t);
  const site = { ...example.site, siteUrl: 'https://example.com/photography' };
  await writeFile(path.join(root, 'content', 'site.json'), JSON.stringify(site));
  const outDir = path.join(root, 'dist');
  const result = await buildSite({ root, outDir });
  assert.equal(result.pages, 7);
  assert.ok(result.bytes > 1000 && result.bytes < 1_000_000);
  for (const [filename] of renderSite(example)) {
    const html = await readFile(path.join(outDir, filename), 'utf8');
    for (const match of html.matchAll(/(?:href|src)="(\/photography\/[^"#]*)/g)) {
      const relative = match[1].slice('/photography/'.length);
      const target = path.join(outDir, relative.endsWith('/') || !relative ? `${relative}index.html` : relative);
      await readFile(target);
    }
  }
  assert.match(await readFile(path.join(outDir, 'sitemap.xml'), 'utf8'), /https:\/\/example.com\/photography\/series\/ordinary-light\//);
  assert.ok((await readdir(outDir)).includes('.nojekyll'));
});

test('import rotates images, strips private metadata, creates variants, and is idempotent', async t => {
  const root = await workspace(t);
  const inputDir = path.join(root, 'incoming');
  await mkdir(inputDir);
  const original = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#d9c6a4' } })
    .withMetadata({ orientation: 6 }).withExifMerge({ IFD0: { Artist: 'Private Name', ImageDescription: 'Secret Location' } }).jpeg().toBuffer();
  await writeFile(path.join(inputDir, 'private-source.jpg'), original);
  const result = await importPhotos({ inputDir, collectionId: 'ordinary-light', root });
  assert.equal(result.imported, 1);
  const collections = JSON.parse(await readFile(path.join(root, 'content', 'collections.json')));
  const collection = collections[0];
  assert.equal(collection.photos.length, 1);
  assert.equal(collection.photos[0].placeholder, undefined);
  assert.equal(collection.cover, collection.photos[0].id);
  assert.equal(collection.photos[0].variants.length, 3);
  assert.equal(collection.photos[0].width, 1200);
  assert.equal(collection.photos[0].height, 2400);
  for (const variant of collection.photos[0].variants) {
    const metadata = await sharp(path.join(root, 'assets', variant.src)).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, variant.width);
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.xmp, undefined);
    assert.equal(metadata.iptc, undefined);
    assert.equal(metadata.orientation, undefined);
    assert.ok(metadata.icc, 'standard sRGB profile retained');
  }
  assert.deepEqual(await readFile(path.join(inputDir, 'private-source.jpg')), original);
  assert.doesNotMatch(JSON.stringify(collection), /private-source|Private Name|Secret Location/);
  const repeated = await importPhotos({ inputDir, collectionId: 'ordinary-light', root });
  assert.equal(repeated.imported, 0);
  assert.equal(repeated.skipped, 1);
  assert.equal((await readdir(path.join(root, 'assets', 'media', 'ordinary-light'))).length, 3);
});

test('new series and small source avoid upscaling or duplicate width variants', async t => {
  const root = await workspace(t);
  const inputDir = path.join(root, 'incoming');
  await mkdir(inputDir);
  await sharp({ create: { width: 220, height: 150, channels: 3, background: '#778d6b' } }).png().toFile(path.join(inputDir, 'tiny.png'));
  await importPhotos({ inputDir, collectionId: 'new-series', title: '新系列', root });
  const content = await loadContent(root);
  const collection = content.collections.at(-1);
  assert.equal(collection.title, '新系列');
  assert.equal(collection.year, '', 'import time is not a verified capture date');
  assert.equal(collection.photos[0].variants.length, 1);
  assert.equal(collection.photos[0].width, 220);
  assert.match(renderSite(content).get('series/new-series/index.html'), /新系列/);
});

test('identical files within one import batch are deduplicated', async t => {
  const root = await workspace(t);
  const inputDir = path.join(root, 'incoming');
  await mkdir(inputDir);
  const original = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#778d6b' } }).jpeg().toBuffer();
  await writeFile(path.join(inputDir, 'one.jpg'), original);
  await writeFile(path.join(inputDir, 'copy.jpg'), original);
  const result = await importPhotos({ inputDir, collectionId: 'duplicates', root });
  assert.equal(result.imported, 1);
  assert.equal(result.skipped, 1);
  const content = await loadContent(root);
  assert.equal(content.collections.at(-1).photos.length, 1);
});

test('bad files or IDs do not replace the collection manifest', async t => {
  const root = await workspace(t);
  const inputDir = path.join(root, 'incoming');
  await mkdir(inputDir);
  await writeFile(path.join(inputDir, 'bad.jpg'), 'not an image');
  const before = await readFile(path.join(root, 'content', 'collections.json'));
  await assert.rejects(importPhotos({ inputDir, collectionId: '../escape', root }));
  await assert.rejects(importPhotos({ inputDir, collectionId: 'ordinary-light', root }), /图片无法处理/);
  assert.deepEqual(await readFile(path.join(root, 'content', 'collections.json')), before);
});
