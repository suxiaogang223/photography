import { photoMetadata } from './photo-metadata.js';
import { renderPrint } from './print.js';

const data = JSON.parse(document.querySelector('#gallery-data').textContent);
const dialog = document.querySelector('.lightbox');
const image = document.querySelector('#lightbox-image');
const imageWrap = document.querySelector('.lightbox-image-wrap');
const close = document.querySelector('#lightbox-close');
const previous = document.querySelector('#lightbox-prev');
const next = document.querySelector('#lightbox-next');
const fit = document.querySelector('#lightbox-fit');
const printButton = document.querySelector('#lightbox-print');
const printStatus = document.querySelector('#lightbox-print-status');
const printDialog = document.querySelector('#print-dialog');
const printPreview = document.querySelector('#print-preview-image');
const printSave = document.querySelector('#print-save');
const printClose = document.querySelector('#print-dialog-close');
const error = document.querySelector('#lightbox-error');
const captureDetails = document.querySelector('#lightbox-capture');
const captureCamera = document.querySelector('#lightbox-camera');
const captureMedium = document.querySelector('#lightbox-medium');
const captureReadout = document.querySelector('#lightbox-readout');
const captureExposure = document.querySelector('#lightbox-exposure');
const captureDate = document.querySelector('#lightbox-date');
let selection = [];
let position = 0;
let returnFocus = null;
let touchStart = null;
let controlsVisible = false;
let printing = false;
let printUrl = null;
let printFilename = '';
let printSaved = false;

imageWrap.tabIndex = 0;
imageWrap.setAttribute('role', 'button');

function setControlsVisible(visible) {
  controlsVisible = visible;
  dialog.classList.toggle('controls-visible', visible);
  imageWrap.setAttribute('aria-pressed', String(visible));
  imageWrap.setAttribute('aria-label', `${image.alt || '照片'}，${visible ? '隐藏' : '显示'}照片信息`);
  if (!visible && dialog.open && document.activeElement !== close) imageWrap.focus({ preventScroll: true });
}

function resetZoom() {
  imageWrap.classList.remove('zoomed');
  image.style.removeProperty('--actual-pixel-width');
  image.style.removeProperty('--actual-pixel-height');
  fit.setAttribute('aria-pressed', 'false');
  fit.textContent = '实际大小';
  imageWrap.scrollTo(0, 0);
}

function setActualPixelSize() {
  const width = image.naturalWidth || Number(image.getAttribute('width'));
  const height = image.naturalHeight || Number(image.getAttribute('height'));
  const pixelRatio = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
  if (!width || !height) return;
  image.style.setProperty('--actual-pixel-width', `${width / pixelRatio}px`);
  image.style.setProperty('--actual-pixel-height', `${height / pixelRatio}px`);
}

function centerActualPixels() {
  imageWrap.scrollTo(
    (imageWrap.scrollWidth - imageWrap.clientWidth) / 2,
    (imageWrap.scrollHeight - imageWrap.clientHeight) / 2,
  );
}

function showPhoto() {
  const photo = selection[position];
  if (!photo) return;
  resetZoom();
  error.hidden = true;
  // Only the currently viewed photo gets its large variant. No album-wide preloading.
  image.alt = photo.alt;
  imageWrap.setAttribute('aria-label', `${photo.alt}，${controlsVisible ? '隐藏' : '显示'}照片信息`);
  image.src = photo.variants.at(-1).src;
  image.width = photo.width;
  image.height = photo.height;
  document.querySelector('#lightbox-title').textContent = photo.title;
  document.querySelector('#lightbox-caption').textContent = photo.placeholder ? '布局示意插画 · 非摄影作品' : photo.caption || '';
  const metadata = photoMetadata(photo);
  captureCamera.textContent = metadata.camera;
  captureMedium.textContent = metadata.medium;
  captureMedium.hidden = !metadata.medium;
  captureExposure.textContent = metadata.exposure;
  captureDate.textContent = metadata.dateLabel;
  if (metadata.date) captureDate.dateTime = metadata.date;
  else captureDate.removeAttribute('datetime');
  captureDetails.hidden = !(metadata.camera || metadata.medium || metadata.exposure || metadata.date);
  captureReadout.hidden = !metadata.exposure && !metadata.date;
  captureDetails.classList.toggle('single-column', captureReadout.hidden);
  captureExposure.hidden = !metadata.exposure;
  captureDate.hidden = !metadata.date;
  document.querySelector('#lightbox-series').textContent = `${photo.collectionTitle} / ${photo.collectionSubtitle || ''}`;
  document.querySelector('#lightbox-count').textContent = `${String(position + 1).padStart(2, '0')} / ${String(selection.length).padStart(2, '0')}`;
  previous.disabled = position === 0;
  next.disabled = position === selection.length - 1;
  printButton.disabled = printing || !!photo.placeholder;
  if (!printing) {
    printButton.textContent = '冲洗照片';
    printStatus.textContent = '';
  }
  if (document.activeElement === previous && previous.disabled || document.activeElement === next && next.disabled) document.querySelector('#lightbox-close').focus();
}

function changePhoto(delta) {
  const updated = position + delta;
  if (updated < 0 || updated >= selection.length) return;
  position = updated;
  showPhoto();
}

document.querySelectorAll('[data-photo]').forEach(button => {
  button.addEventListener('click', () => {
    const photo = data.photos.find(item => item.id === button.dataset.photo);
    if (!photo) return;
    const grid = button.closest('.contact-grid');
    const visibleIds = grid ? [...grid.querySelectorAll('figure:not([hidden]) [data-photo]')].map(item => item.dataset.photo) : null;
    selection = visibleIds ? visibleIds.map(id => data.photos.find(item => item.id === id)) : data.photos.filter(item => item.collection === photo.collection);
    position = selection.findIndex(item => item.id === photo.id);
    returnFocus = button;
    showPhoto();
    dialog.showModal();
    document.body.classList.add('viewer-open');
    setControlsVisible(true);
    close.focus();
  });
});

previous.addEventListener('click', () => changePhoto(-1));
next.addEventListener('click', () => changePhoto(1));
close.addEventListener('click', () => dialog.close());
printButton.addEventListener('click', async () => {
  const photo = selection[position];
  if (!photo || photo.placeholder || printing) return;
  printing = true;
  printButton.disabled = true;
  printButton.textContent = '冲洗中…';
  printStatus.textContent = '正在冲洗照片';
  let failed = false;
  try {
    const source = new Image();
    source.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      source.onload = resolve;
      source.onerror = () => reject(new Error('照片加载失败'));
      source.src = photo.variants.at(-1).src;
    });
    const blob = await renderPrint(photo, data.brand, source);
    if (!dialog.open || selection[position]?.id !== photo.id) return;
    printUrl = URL.createObjectURL(blob);
    printFilename = `${photo.id.replace(/[^a-z0-9_-]/gi, '-')}-print.jpg`;
    printPreview.alt = `${photo.title}的冲洗照片预览`;
    printPreview.src = printUrl;
    printStatus.textContent = '冲洗预览已准备好';
    printDialog.showModal();
    printClose.focus();
  } catch (error) {
    console.error('照片冲洗失败', error);
    printStatus.textContent = '冲洗失败，请重试';
    failed = true;
  } finally {
    printing = false;
    printButton.disabled = !!selection[position]?.placeholder;
    printButton.textContent = failed ? '冲洗失败，重试' : '冲洗照片';
  }
});
printClose.addEventListener('click', () => printDialog.close());
printSave.addEventListener('click', () => {
  if (!printUrl) return;
  const link = document.createElement('a');
  link.href = printUrl;
  link.download = printFilename;
  document.body.append(link);
  link.click();
  link.remove();
  printSaved = true;
  printDialog.close();
});
printDialog.addEventListener('close', () => {
  const url = printUrl;
  printUrl = null;
  printPreview.removeAttribute('src');
  if (url) {
    if (printSaved) setTimeout(() => URL.revokeObjectURL(url), 30_000);
    else URL.revokeObjectURL(url);
  }
  printSaved = false;
  printStatus.textContent = '';
  if (dialog.open) printButton.focus();
});
imageWrap.addEventListener('click', () => setControlsVisible(!controlsVisible));
imageWrap.addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  setControlsVisible(!controlsVisible);
});
dialog.addEventListener('close', () => {
  document.body.classList.remove('viewer-open');
  setControlsVisible(false);
  resetZoom();
  image.removeAttribute('src');
  returnFocus?.focus();
});
dialog.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    if (imageWrap.classList.contains('zoomed')) return;
    event.preventDefault();
    changePhoto(event.key === 'ArrowLeft' ? -1 : 1);
  }
});
fit.addEventListener('click', () => {
  const zoomed = imageWrap.classList.toggle('zoomed');
  if (zoomed) {
    setActualPixelSize();
    centerActualPixels();
  } else imageWrap.scrollTo(0, 0);
  fit.setAttribute('aria-pressed', String(zoomed));
  fit.textContent = zoomed ? '适应屏幕' : '实际大小';
});
image.addEventListener('load', () => {
  if (imageWrap.classList.contains('zoomed')) {
    setActualPixelSize();
    centerActualPixels();
  }
});
window.addEventListener('resize', () => {
  if (imageWrap.classList.contains('zoomed')) {
    setActualPixelSize();
    centerActualPixels();
  }
});
image.addEventListener('error', () => { error.hidden = false; });
imageWrap.addEventListener('touchstart', event => {
  touchStart = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
}, { passive: true });
imageWrap.addEventListener('touchend', event => {
  if (!touchStart || imageWrap.classList.contains('zoomed') || !event.changedTouches.length) return;
  const dx = event.changedTouches[0].clientX - touchStart.x;
  const dy = event.changedTouches[0].clientY - touchStart.y;
  touchStart = null;
  if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    event.preventDefault();
    changePhoto(dx < 0 ? 1 : -1);
  }
});

const filterButtons = [...document.querySelectorAll('[data-filter]')];
const cards = [...document.querySelectorAll('.contact-photo')];
function applyFilter(filter) {
  if (!filterButtons.some(button => button.dataset.filter === filter)) filter = 'all';
  filterButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === filter)));
  cards.forEach(card => { card.hidden = filter !== 'all' && card.dataset.collection !== filter; });
  const visible = cards.filter(card => !card.hidden);
  const hasPlaceholders = visible.some(card => card.dataset.placeholder === 'true');
  document.querySelector('#filter-count').textContent = `${visible.length} ${hasPlaceholders ? '幅画面（含占位示意）' : '张照片'}`;
}
if (filterButtons.length) {
  filterButtons.forEach(button => button.addEventListener('click', () => {
    applyFilter(button.dataset.filter);
    history.replaceState(null, '', button.dataset.filter === 'all' ? location.pathname : `#${button.dataset.filter}`);
  }));
  applyFilter(location.hash.slice(1) || 'all');
  window.addEventListener('hashchange', () => applyFilter(location.hash.slice(1) || 'all'));
}
