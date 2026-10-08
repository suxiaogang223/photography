const data = JSON.parse(document.querySelector('#gallery-data').textContent);
const dialog = document.querySelector('.lightbox');
const image = document.querySelector('#lightbox-image');
const imageWrap = document.querySelector('.lightbox-image-wrap');
const previous = document.querySelector('#lightbox-prev');
const next = document.querySelector('#lightbox-next');
const fit = document.querySelector('#lightbox-fit');
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
  image.src = photo.variants.at(-1).src;
  image.width = photo.width;
  image.height = photo.height;
  imageWrap.classList.toggle('film-view', photo.medium === 'film');
  imageWrap.classList.toggle('film-portrait', photo.medium === 'film' && photo.height > photo.width);
  document.querySelector('#lightbox-title').textContent = photo.title;
  document.querySelector('#lightbox-caption').textContent = photo.placeholder ? '布局示意插画 · 非摄影作品' : photo.caption || '';
  const capture = photo.capture || {};
  const exposure = [capture.focalLength, capture.aperture, capture.shutter, capture.iso && `ISO ${capture.iso}`].filter(Boolean);
  captureCamera.textContent = capture.camera || '';
  captureMedium.textContent = capture.film || capture.lens || '';
  captureExposure.textContent = exposure.join(' · ');
  captureDate.textContent = capture.dateTime ? capture.dateTime.replaceAll('-', '.').replace('T', ' ') : '';
  if (capture.dateTime) captureDate.dateTime = capture.dateTime;
  else captureDate.removeAttribute('datetime');
  captureDetails.hidden = !(captureCamera.textContent || captureMedium.textContent || exposure.length || capture.dateTime);
  captureReadout.hidden = exposure.length === 0 && !capture.dateTime;
  captureDetails.classList.toggle('single-column', captureReadout.hidden);
  captureExposure.hidden = exposure.length === 0;
  captureDate.hidden = !capture.dateTime;
  document.querySelector('#lightbox-series').textContent = `${photo.collectionTitle} / ${photo.collectionSubtitle || ''}`;
  document.querySelector('#lightbox-count').textContent = `${String(position + 1).padStart(2, '0')} / ${String(selection.length).padStart(2, '0')}`;
  previous.disabled = position === 0;
  next.disabled = position === selection.length - 1;
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
    document.querySelector('#lightbox-close').focus();
  });
});

previous.addEventListener('click', () => changePhoto(-1));
next.addEventListener('click', () => changePhoto(1));
document.querySelector('#lightbox-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  document.body.classList.remove('viewer-open');
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
  if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) changePhoto(dx < 0 ? 1 : -1);
}, { passive: true });

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
