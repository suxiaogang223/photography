import { cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, escapeHtml as e, scriptJson, loadContent, mediaUrl, normalizeBase } from './lib.mjs';

export function renderSite({ site, collections }, base = '/photography/') {
  base = normalizeBase(base);
  // Series follow their capture-period start, not import order. Sorting the filtered
  // copy leaves both the manifest and each series' photo sequence untouched.
  const seriesDate = collection => collection.dateRange?.start || collection.dateRange?.end || '';
  const active = collections.filter(collection => collection.photos.length).sort((left, right) =>
    seriesDate(right).localeCompare(seriesDate(left))
    || (right.dateRange?.end || '').localeCompare(left.dateRange?.end || ''));
  const photos = active.flatMap(collection => collection.photos.map(photo => ({ ...photo, collection: collection.id, collectionTitle: collection.title, collectionSubtitle: collection.subtitle, year: collection.year, medium: collection.medium || 'digital' })));
  const published = photos.filter(photo => !photo.placeholder);
  const demo = photos.some(photo => photo.placeholder);
  const count = number => String(number).padStart(2, '0');
  // Number series oldest-to-newest while displaying and featuring newest first.
  const seriesNumbers = new Map(active.map((collection, index) => [collection.id, count(active.length - index)]));
  const collectionLabel = collection => collection.category || collection.year || '';
  const collectionDates = collection => {
    const range = collection.dateRange;
    if (!range) return '';
    const start = range.start.replaceAll('-', '.');
    const end = (range.end.slice(0, 4) === range.start.slice(0, 4) ? range.end.slice(5) : range.end).replaceAll('-', '.');
    const endTime = range.start === range.end ? '' : ` — <time datetime="${e(range.end)}">${e(end)}</time>`;
    return `<span class="series-date" aria-label="照片日期" title="${e(range.source)}"><time datetime="${e(range.start)}">${e(start)}</time>${endTime}</span>`;
  };
  const image = (photo, { sizes = '(max-width: 700px) 90vw, 46vw', eager = false } = {}) => {
    const variants = photo.variants;
    const initial = variants.find(variant => variant.width >= 1200) || variants.at(-1);
    return `<img src="${e(mediaUrl(initial.src, site, base))}" srcset="${variants.map(variant => `${e(mediaUrl(variant.src, site, base))} ${variant.width}w`).join(', ')}" sizes="${sizes}" width="${photo.width}" height="${photo.height}" alt="${e(photo.alt)}" loading="${eager ? 'eager' : 'lazy'}" ${eager ? 'fetchpriority="high"' : ''} decoding="async">`;
  };
  const badge = photo => photo.placeholder ? '<span class="sample-badge">布局示意 · 非摄影作品</span>' : '';
  const photoButton = (photo, options) => `<button class="photo-open${photo.medium === 'film' ? ` film-frame${photo.height > photo.width ? ' film-portrait' : ''}` : ''}" data-photo="${e(photo.id)}" aria-label="查看${e(photo.title)}">${image(photo, options)}${badge(photo)}<span class="photo-expand" aria-hidden="true">↗</span></button>`;
  const totalLabel = demo && !published.length ? `${count(photos.length)} 幅布局示意` : `${count(published.length)} 张作品`;
  const firstCollection = active[0];
  const hero = firstCollection?.photos.find(photo => photo.id === firstCollection.cover);
  const runtime = { photos: photos.map(photo => ({ ...photo, variants: photo.variants.map(variant => ({ ...variant, src: mediaUrl(variant.src, site, base) })) })), collections: active.map(({ id, title, description, subtitle, year }) => ({ id, title, description, subtitle, year })) };
  const about = `<section class="about" id="about" aria-labelledby="about-title"><p class="eyebrow">BEHIND THE LENS / 关于</p><div class="about-grid"><h2 id="about-title">在街头，<br>也在远方。</h2><div><p>${e(site.about)}</p><span class="signature">${e(site.name)} <span>/ PHOTOGRAPHS</span></span><a class="text-link" href="${base}about/">关于我 <span aria-hidden="true">↗</span></a>${site.blogUrl ? `<a class="text-link" href="${e(site.blogUrl)}" target="_blank" rel="noopener noreferrer">阅读我的文字 <span aria-hidden="true">↗</span></a>` : ''}</div></div></section>`;
  const document = (title, body, route = '', description = site.description) => {
    const canonical = site.siteUrl ? `${site.siteUrl.replace(/\/$/, '')}/${route}` : '';
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#141414"><meta name="color-scheme" content="dark"><title>${e(title)}</title><meta name="description" content="${e(description)}"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(description)}"><meta property="og:type" content="website">${canonical ? `<link rel="canonical" href="${e(canonical)}"><meta property="og:url" content="${e(canonical)}">` : ''}<link rel="icon" href="${base}assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="${base}assets/style.css"><script type="module" src="${base}assets/app.js"></script></head><body><a class="skip-link" href="#main">跳到内容</a><header class="site-header"><a class="brand" href="${base}" aria-label="${e(site.name)}摄影集首页"><span class="brand-mark" aria-hidden="true">◉</span><span>${e(site.nameEn)}<small>PHOTOGRAPHIC JOURNAL</small></span></a><nav aria-label="主导航"><a href="${base}#series" ${route === '' ? 'aria-current="page"' : ''}>系列 <span>Series</span></a><a href="${base}index/" ${route === 'index/' ? 'aria-current="page"' : ''}>索引 <span>Index</span></a><a href="${base}about/" ${route === 'about/' ? 'aria-current="page"' : ''}>关于 <span>About</span></a></nav></header>${body}<footer class="site-footer"><span>© ${new Date().getFullYear()} ${e(site.nameEn)}</span><span>街头 · 途中 · 远方<span class="footer-dot" aria-hidden="true">●</span></span><a href="#top">回到顶部 ↑</a></footer><dialog class="lightbox" aria-label="照片查看器"><div class="lightbox-top"><span id="lightbox-series"></span><button id="lightbox-close" aria-label="关闭照片查看器">关闭 <span aria-hidden="true">×</span></button></div><div class="lightbox-stage"><button id="lightbox-prev" class="lightbox-arrow" aria-label="上一张照片">←</button><div class="lightbox-image-wrap"><img id="lightbox-image" alt=""><p id="lightbox-error" hidden>图片暂时无法加载，请稍后重试。</p></div><button id="lightbox-next" class="lightbox-arrow" aria-label="下一张照片">→</button></div><div class="lightbox-bottom"><div><h2 id="lightbox-title"></h2><p id="lightbox-caption"></p></div><div class="lightbox-tools"><button id="lightbox-fit" aria-pressed="false">实际大小</button><span id="lightbox-count" aria-live="polite"></span></div><div id="lightbox-capture" class="lightbox-capture" role="group" aria-label="照片拍摄参数" hidden><div class="lightbox-equipment"><strong id="lightbox-camera"></strong><span id="lightbox-medium"></span></div><div id="lightbox-readout" class="lightbox-readout" hidden><p id="lightbox-exposure" hidden></p><time id="lightbox-date" hidden></time></div></div></div><p class="keyboard-hint">← → 切换 · Esc 关闭</p></dialog><script id="gallery-data" type="application/json">${scriptJson(runtime)}</script></body></html>`;
  };
  const home = `<main id="main"><section class="intro" id="top"><div class="intro-heading"><p class="eyebrow"><span class="status-dot" aria-hidden="true"></span> A PERSONAL COLLECTION OF OBSERVATIONS</p><h1>${e(site.title)}<span>${e(site.subtitle)}</span></h1></div><div class="intro-note"><p>${e(site.description)}</p><a class="text-link" href="#series">浏览摄影系列 <span aria-hidden="true">↓</span></a></div></section>${hero ? `<section class="hero" aria-label="封面作品"><figure>${photoButton(hero, { eager: true, sizes: '(max-width: 700px) 100vw, 86vw' })}<figcaption><span><span class="eyebrow">FEATURED SERIES / ${seriesNumbers.get(firstCollection.id)}</span><a href="${base}series/${firstCollection.id}/">${e(firstCollection.title)} <span aria-hidden="true">↗</span></a></span><span>${e(firstCollection.subtitle)}<br>${e(collectionLabel(firstCollection))}${collectionLabel(firstCollection) ? ' · ' : ''}${hero.placeholder ? '布局预览' : `${count(firstCollection.photos.length)} 张作品`}${collectionDates(firstCollection)}</span></figcaption></figure><span class="hero-side" aria-hidden="true">LOOK CLOSER. STAY A LITTLE LONGER.</span></section>` : '<section class="empty-state"><h2>第一张照片，还在路上。</h2><p>导入你的照片后，作品会出现在这里。</p></section>'}${demo ? '<p class="demo-notice">当前为布局预览：画面是本地占位插画，并非摄影作品。导入真实照片后会自动替换对应系列。</p>' : ''}<section class="series-section" id="series" aria-labelledby="series-heading"><div class="section-heading"><div><p class="eyebrow">SELECTED WORK / 摄影系列</p><h2 id="series-heading">摄影系列<span>Selected series</span></h2></div><span class="section-count">${count(active.length)} 个系列 / ${totalLabel}</span></div><div class="series-grid">${active.map(collection => { const cover = collection.photos.find(photo => photo.id === collection.cover); return `<article class="series-card"><a class="series-cover" href="${base}series/${collection.id}/" aria-label="浏览${e(collection.title)}系列">${image(cover)}${badge(cover)}<span class="cover-arrow" aria-hidden="true">↗</span></a><div class="series-meta"><span class="series-number">${seriesNumbers.get(collection.id)}</span><div><h3><a href="${base}series/${collection.id}/">${e(collection.title)}</a></h3><p class="eyebrow">${e(collection.subtitle)}</p></div><span>${e(collectionLabel(collection))}${collectionDates(collection)}</span></div><p class="series-description">${e(collection.description)}</p></article>`; }).join('')}</div></section><section class="index-invitation"><span class="eyebrow">THE CONTACT SHEET</span><h2>换一种方式观看。</h2><p>没有先后，只有一个个被留下的瞬间。</p><a class="pill-link" href="${base}index/">打开全部索引 <span aria-hidden="true">↗</span></a></section>${about}</main>`;
  const pages = new Map([['index.html', document(`${site.title} — ${site.name}摄影集`, home)]]);
  const aboutBody = `<main id="main"><section class="profile-page" id="top" aria-labelledby="profile-title"><p class="eyebrow">BEHIND THE LENS / 关于我</p><div class="profile-grid">${site.portrait ? `<figure class="profile-portrait">${image(site.portrait, { sizes: '(max-width: 700px) 90vw, 43vw', eager: true })}<figcaption>${e(site.nameEn)} / PHOTOGRAPHS</figcaption></figure>` : ''}<div class="profile-copy"><p class="eyebrow">AMATEUR PHOTOGRAPHER / 业余摄影师</p><h1 id="profile-title">${e(site.name)}</h1><p class="profile-bio">${e(site.about)}</p><p class="profile-note">从街头开始，也走向更远的地方。<br>不急着给画面定义，先把它们留下。</p><div class="profile-links"><a class="text-link" href="${base}#series">浏览摄影系列 <span aria-hidden="true">↗</span></a>${site.blogUrl ? `<a class="text-link" href="${e(site.blogUrl)}" target="_blank" rel="noopener noreferrer">阅读我的文字 <span aria-hidden="true">↗</span></a>` : ''}</div></div></div></section></main>`;
  pages.set('about/index.html', document(`关于我 — ${site.name}`, aboutBody, 'about/', site.about));
  const grid = photoList => `<div class="contact-grid">${photoList.map((photo, index) => `<figure class="contact-photo" data-collection="${photo.collection}" data-placeholder="${!!photo.placeholder}">${photoButton(photo, { sizes: '(max-width: 600px) 43vw, (max-width: 1000px) 28vw, 21vw' })}<figcaption><span>${count(index + 1)} / ${e(photo.title)}</span><span>${e(photo.collectionTitle)}</span></figcaption></figure>`).join('')}</div>`;
  const indexBody = `<main id="main"><section class="page-intro" id="top"><p class="eyebrow">THE CONTACT SHEET / 全部索引</p><h1>每一个瞬间<span>Every frame, a small pause.</span></h1><p>像翻看一张接触印样，在不同的画面之间，寻找自己的停留。</p></section><section class="index-section" aria-label="照片索引"><div class="filter-bar"><div class="filters" role="group" aria-label="按系列筛选"><button data-filter="all" aria-pressed="true">全部</button>${active.map(collection => `<button data-filter="${collection.id}" aria-pressed="false">${e(collection.title)}</button>`).join('')}</div><span id="filter-count" aria-live="polite">${photos.length} ${demo ? '幅画面（含占位示意）' : '张照片'}</span></div>${photos.length ? grid(photos) : '<p class="empty-state">还没有照片，导入后再来看看。</p>'}${demo ? '<p class="demo-notice">带“布局示意”标记的画面不是摄影作品。</p>' : ''}</section></main>`;
  pages.set('index/index.html', document(`全部索引 — ${site.title}`, indexBody, 'index/'));
  for (const collection of active) {
    const collectionPhotos = photos.filter(photo => photo.collection === collection.id);
    const next = active[(active.indexOf(collection) + 1) % active.length];
    const body = `<main id="main"><section class="page-intro collection-intro" id="top"><a class="back-link" href="${base}#series">← 返回系列</a><p class="eyebrow">${e(collection.subtitle)}${collectionLabel(collection) ? ` / ${e(collectionLabel(collection))}` : ''}</p>${collectionDates(collection)}<h1>${e(collection.title)}</h1><p>${e(collection.description)}</p><span class="section-count">${count(collection.photos.length)} ${collection.photos.some(photo => photo.placeholder) ? '幅画面（含布局示意）' : '张作品'}</span></section><section class="collection-gallery" aria-label="${e(collection.title)}作品">${collectionPhotos.map((photo, index) => `<figure class="collection-photo ${photo.height > photo.width ? 'portrait' : ''}">${photoButton(photo, { sizes: '(max-width: 700px) 90vw, 78vw', eager: index === 0 })}<figcaption><span>${count(index + 1)} / ${e(photo.title)}</span><span>${e(photo.caption || (photo.placeholder ? '布局示意 · 等待真实照片' : ''))}</span></figcaption></figure>`).join('')}</section>${active.length > 1 ? `<section class="next-series"><p class="eyebrow">CONTINUE EXPLORING / 下一个系列</p><a href="${base}series/${next.id}/">${e(next.title)} <span aria-hidden="true">↗</span></a></section>` : ''}</main>`;
    pages.set(`series/${collection.id}/index.html`, document(`${collection.title} — ${site.title}`, body, `series/${collection.id}/`, collection.description));
  }
  pages.set('404.html', document(`页面不存在 — ${site.title}`, `<main id="main"><section class="empty-state" id="top"><p class="eyebrow">404 / NOT FOUND</p><h1>走到了画面之外。</h1><p>这个页面不存在，也许作品已经换了位置。</p><a class="pill-link" href="${base}">回到摄影集 →</a></section></main>`));
  return pages;
}

async function directoryBytes(directory) {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    total += entry.isDirectory() ? await directoryBytes(target) : (await stat(target)).size;
  }
  return total;
}

export async function buildSite({ root = ROOT, outDir = path.join(ROOT, 'dist'), base = process.env.SITE_BASE_PATH || '/photography/' } = {}) {
  const content = await loadContent(root);
  const pages = renderSite(content, base);
  // dist is generated output only; source photos and manifests are never removed.
  await mkdir(outDir, { recursive: true });
  await Promise.all([...pages].map(async ([filename, html]) => {
    const destination = path.join(outDir, filename);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, html);
  }));
  await cp(path.join(root, 'src'), path.join(outDir, 'assets'), { recursive: true });
  await cp(path.join(root, 'assets'), path.join(outDir, 'assets'), { recursive: true });
  await writeFile(path.join(outDir, '.nojekyll'), '');
  if (content.site.siteUrl) {
    const origin = content.site.siteUrl.replace(/\/$/, '');
    const urls = [...pages.keys()].filter(filename => filename !== '404.html').map(filename => `${origin}/${filename.replace(/index\.html$/, '')}`);
    await writeFile(path.join(outDir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(url => `<url><loc>${e(url)}</loc></url>`).join('')}</urlset>`);
    await writeFile(path.join(outDir, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
  }
  const bytes = await directoryBytes(outDir);
  if (bytes >= 950_000_000) throw new Error(`站点大小 ${(bytes / 1e6).toFixed(1)} MB，接近 Pages 上限，请先迁移图片存储。`);
  if (bytes >= 500_000_000) console.warn('提醒：站点已超过 500 MB，建议准备迁移图片存储。');
  return { pages: pages.size, bytes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    normalizeBase(process.env.SITE_BASE_PATH || '/photography/');
    // Clear only this project's disposable output to avoid publishing stale pages.
    await rm(path.join(ROOT, 'dist'), { recursive: true, force: true });
    const result = await buildSite();
    console.log(`已构建 ${result.pages} 个页面，站点 ${(result.bytes / 1e6).toFixed(2)} MB。`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
