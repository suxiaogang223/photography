import { photoMetadata } from './photo-metadata.js';

export function printLayout(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error('照片尺寸无效');
  }
  const shortSide = Math.min(width, height);
  const margin = Math.max(24, Math.round(shortSide * 0.04));
  const footer = Math.max(170, Math.round(shortSide * 0.16));
  const gap = Math.min(width * 0.08, Math.max(12, Math.round(shortSide * 0.03)));
  const columnWidth = (width - gap) / 2;
  return {
    width: width + margin * 2,
    height: height + margin + footer,
    photo: { x: margin, y: margin, width, height },
    margin,
    footer,
    columns: {
      left: { x: margin, width: columnWidth },
      right: { x: margin + width - columnWidth, width: columnWidth },
    },
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
  const { left, right } = layout.columns;
  const rightEdge = right.x + right.width;
  const footerTop = layout.photo.y + layout.photo.height;
  const titleY = footerTop + Math.round(layout.margin * 0.78) + titleSize;
  const equipmentY = titleY + Math.round(bodySize * 1.55);
  const exposureY = metadata.medium ? titleY + Math.round(bodySize * 2.95) : equipmentY;
  const signatureY = layout.height - Math.round(layout.margin * 0.65);

  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.fillStyle = '#242321';
  fittedText(context, photo.title, left.x, titleY, left.width, titleSize, 400, 12, serifFont);
  context.fillStyle = '#66635e';
  fittedText(context, metadata.dateLabel, left.x, equipmentY, left.width, smallSize);

  context.textAlign = 'right';
  fittedText(context, metadata.camera, rightEdge, titleY, right.width, bodySize, 500);
  fittedText(context, metadata.medium, rightEdge, equipmentY, right.width, bodySize);
  fittedText(context, metadata.exposure, rightEdge, exposureY, right.width, bodySize);

  context.fillStyle = '#a09b94';
  context.textAlign = 'left';
  fittedText(context, brand.nameEn, left.x, signatureY, left.width, smallSize);
  context.textAlign = 'right';
  fittedText(context, brand.siteUrl.replace(/^https?:\/\//, ''), rightEdge, signatureY, right.width, Math.max(11, smallSize - 3));

  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('浏览器未能生成照片')), 'image/jpeg', 0.94);
    } catch (error) { reject(error); }
  });
}
