export function photoMetadata(photo) {
  const capture = photo.capture || {};
  return {
    camera: capture.camera || '',
    medium: capture.film || (capture.filter ? `${capture.filter} 滤镜` : capture.lens) || '',
    exposure: [capture.focalLength, capture.aperture, capture.shutter, capture.iso && `ISO ${capture.iso}`].filter(Boolean).join(' · '),
    dateTime: capture.dateTime || '',
    dateLabel: capture.dateTime ? capture.dateTime.replaceAll('-', '.').replace('T', ' ') : '',
  };
}

export function printLayout(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error('照片尺寸无效');
  }
  const shortSide = Math.min(width, height);
  const margin = Math.max(24, Math.round(shortSide * 0.04));
  const footer = Math.max(170, Math.round(shortSide * 0.16));
  return {
    width: width + margin * 2,
    height: height + margin + footer,
    photo: { x: margin, y: margin, width, height },
    margin,
    footer,
  };
}

const sansFont = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
const serifFont = '"Iowan Old Style", "Palatino Linotype", "Songti SC", "Noto Serif CJK SC", serif';

function fittedText(context, text, x, y, maxWidth, size, weight = 400, minimum = 12, family = sansFont) {
  if (!text) return;
  let fontSize = size;
  do {
    context.font = `${weight} ${fontSize}px ${family}`;
    if (context.measureText(text).width <= maxWidth || fontSize <= minimum) break;
    fontSize -= 1;
  } while (true);
  context.fillText(text, x, y, maxWidth);
}

export async function renderPrint(photo, brand, source) {
  const layout = printLayout(source.naturalWidth, source.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('浏览器无法绘制照片');

  context.fillStyle = '#f0eee8';
  context.fillRect(0, 0, layout.width, layout.height);
  context.drawImage(source, layout.photo.x, layout.photo.y, layout.photo.width, layout.photo.height);

  const metadata = photoMetadata(photo);
  const shortSide = Math.min(layout.photo.width, layout.photo.height);
  const titleSize = Math.max(20, Math.min(54, Math.round(shortSide * 0.024)));
  const bodySize = Math.max(14, Math.min(32, Math.round(shortSide * 0.014)));
  const smallSize = Math.max(12, Math.min(24, Math.round(shortSide * 0.011)));
  const left = layout.margin;
  const fullWidth = layout.width - layout.margin * 2;
  const footerTop = layout.photo.y + layout.photo.height;
  const titleY = footerTop + Math.round(layout.margin * 0.78) + titleSize;

  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.fillStyle = '#242321';
  fittedText(context, photo.title, left, titleY, fullWidth, titleSize, 400, 12, serifFont);

  const equipment = [metadata.camera, metadata.medium].filter(Boolean).join(' · ');
  context.fillStyle = '#66635e';
  fittedText(context, equipment, left, titleY + Math.round(bodySize * 1.55), fullWidth, bodySize);
  fittedText(context, metadata.exposure, left, titleY + Math.round(bodySize * 2.95), fullWidth, bodySize);
  fittedText(context, metadata.dateLabel, left, titleY + Math.round(bodySize * 4.15), fullWidth * 0.65, smallSize);

  context.textAlign = 'right';
  context.fillStyle = '#242321';
  const right = layout.width - layout.margin;
  fittedText(context, brand.nameEn, right, layout.height - Math.round(layout.margin * 1.32), fullWidth * 0.46, smallSize, 600);
  context.fillStyle = '#77736e';
  fittedText(context, brand.siteUrl.replace(/^https?:\/\//, ''), right, layout.height - Math.round(layout.margin * 0.62), fullWidth * 0.58, Math.max(11, smallSize - 3));

  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('浏览器未能生成照片')), 'image/jpeg', 0.94);
    } catch (error) { reject(error); }
  });
}
