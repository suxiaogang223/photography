import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const scriptJson = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
export const validId = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

export function normalizeBase(value = '/photography/') {
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(value)) throw new Error('SITE_BASE_PATH 必须是 / 或 /photography/ 这样的路径。');
  return value;
}

export function validAssetPath(value) {
  return typeof value === 'string' && /^(?:media|placeholders)\/[a-zA-Z0-9_./-]+$/.test(value)
    && !value.split('/').some(part => part === '..' || part === '.' || part === '');
}

export function validateContent(site, collections) {
  for (const key of ['name', 'nameEn', 'title', 'subtitle', 'description', 'about']) {
    if (typeof site[key] !== 'string' || !site[key].trim()) throw new Error(`site.${key} 必须是非空文字。`);
  }
  for (const key of ['mediaBaseUrl', 'siteUrl', 'blogUrl']) {
    if (!site[key]) continue;
    const url = new URL(site[key]);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error(`site.${key} 必须是无参数的 HTTPS 地址。`);
  }
  if (!Array.isArray(collections)) throw new Error('作品清单必须是数组。');
  if (site.portrait !== undefined) {
    const portrait = site.portrait;
    if (!portrait || typeof portrait.alt !== 'string' || !portrait.alt.trim()
      || ![portrait.width, portrait.height].every(value => Number.isInteger(value) && value > 0)
      || !Array.isArray(portrait.variants) || !portrait.variants.length) throw new Error('个人照片需要替代文字、尺寸和图片版本。');
    let previousWidth = 0;
    for (const variant of portrait.variants) {
      if (!validAssetPath(variant.src) || !Number.isInteger(variant.width) || variant.width <= previousWidth || variant.width > portrait.width) throw new Error('个人照片路径或尺寸顺序无效。');
      previousWidth = variant.width;
    }
  }
  const ids = new Set();
  const photoIds = new Set();
  const captureKeys = new Set(['camera', 'lens', 'focalLength', 'aperture', 'shutter', 'iso', 'dateTime', 'film']);
  const validateCapture = (capture, label) => {
    if (capture === undefined) return;
    if (!capture || typeof capture !== 'object' || Array.isArray(capture)) throw new Error(`拍摄参数格式无效：${label}`);
    for (const [key, value] of Object.entries(capture)) {
      if (!captureKeys.has(key) || typeof value !== 'string' || !value.trim() || value.length > 120) throw new Error(`拍摄参数无效：${label}.${key}`);
      if (key === 'dateTime' && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error(`拍摄时间无效：${label}`);
    }
  };
  for (const collection of collections) {
    if (!validId(collection.id) || ids.has(collection.id)) throw new Error(`系列 ID 无效或重复：${collection.id}`);
    ids.add(collection.id);
    if (!collection.title || !Array.isArray(collection.photos)) throw new Error(`系列缺少标题或照片：${collection.id}`);
    if (collection.medium !== undefined && !['film', 'digital'].includes(collection.medium)) throw new Error(`系列媒介无效：${collection.id}`);
    for (const photo of collection.photos) {
      if (!validId(photo.id) || photoIds.has(photo.id)) throw new Error(`照片 ID 无效或重复：${photo.id}`);
      photoIds.add(photo.id);
      validateCapture(photo.capture, photo.id);
      if (!photo.alt?.trim() || !photo.title?.trim()) throw new Error(`照片需要标题和替代文字：${photo.id}`);
      if (![photo.width, photo.height].every(value => Number.isInteger(value) && value > 0)) throw new Error(`照片尺寸无效：${photo.id}`);
      if (!Array.isArray(photo.variants) || !photo.variants.length) throw new Error(`照片需要图片版本：${photo.id}`);
      let previousWidth = 0;
      for (const variant of photo.variants) {
        if (!validAssetPath(variant.src) || !Number.isInteger(variant.width) || variant.width <= previousWidth) throw new Error(`图片路径或尺寸顺序无效：${photo.id}`);
        previousWidth = variant.width;
      }
    }
    if (collection.photos.length && !collection.photos.some(photo => photo.id === collection.cover)) throw new Error(`系列封面不存在：${collection.id}`);
  }
}

export async function loadContent(root = ROOT) {
  const [site, collections] = await Promise.all(['site', 'collections'].map(async name => JSON.parse(await readFile(path.join(root, 'content', `${name}.json`), 'utf8'))));
  validateContent(site, collections);
  for (const variant of site.portrait?.variants || []) {
    const info = await stat(path.join(root, 'assets', variant.src)).catch(() => null);
    if (!info?.isFile()) throw new Error(`找不到个人照片文件：${variant.src}`);
  }
  // Even when switching to a remote media origin, keep local assets as the source of truth.
  for (const collection of collections) {
    for (const photo of collection.photos) {
      for (const variant of photo.variants) {
        const info = await stat(path.join(root, 'assets', variant.src)).catch(() => null);
        if (!info?.isFile()) throw new Error(`找不到图片文件：${variant.src}`);
      }
    }
  }
  return { site, collections };
}

export function mediaUrl(src, site, base) {
  const prefix = src.startsWith('media/') && site.mediaBaseUrl ? `${site.mediaBaseUrl.replace(/\/$/, '')}/` : `${base}assets/`;
  return `${prefix}${src}`;
}

export function args(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index++) {
    const name = argv[index];
    if (!name.startsWith('--') || !argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error(`参数需要值：${name}`);
    result[name.slice(2)] = argv[++index];
  }
  return result;
}
