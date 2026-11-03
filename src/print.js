import { photoMetadata } from './photo-metadata.js';
import { photoCaption } from './photo-caption.js';

export function printLayout(width, height, captionHeight = 0) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error('照片尺寸无效');
  }
  if (!Number.isSafeInteger(captionHeight) || captionHeight < 0) throw new Error('照片文字高度无效');
  const shortSide = Math.min(width, height);
  const margin = Math.max(24, Math.round(shortSide * 0.04));
  const footer = Math.max(170, Math.round(shortSide * 0.16)) + captionHeight;
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

export function wrapPrintCaption(text, maxWidth, measure) {
  if (!text) return [];
  const lines = [];
  const words = new Intl.Segmenter('zh', { granularity: 'word' });
  const graphemes = new Intl.Segmenter('zh', { granularity: 'grapheme' });
  const closing = '，。、！？；：）》】」』…,.!?;:)]}';
  const opening = '（《【「『([{';
  for (const paragraph of text.split('\n')) {
    // Keep punctuation with the neighboring word instead of starting a line with it.
    const units = [];
    let prefix = '';
    for (const { segment } of words.segment(paragraph)) {
      if (Array.from(segment).every(character => opening.includes(character))) {
        prefix += segment;
      } else if (!prefix && units.length && Array.from(segment).every(character => closing.includes(character))) {
        units[units.length - 1] += segment;
      } else {
        units.push(prefix + segment);
        prefix = '';
      }
    }
    if (prefix) units.push(prefix);
    let line = '';
    for (const segment of units) {
      if (measure(line + segment) <= maxWidth) {
        line += segment;
        continue;
      }
      if (line.trim()) lines.push(line.trimEnd());
      line = '';
      for (const { segment: character } of graphemes.segment(segment.trimStart())) {
        if (line && measure(line + character) > maxWidth) {
          const characters = [...graphemes.segment(line)].map(part => part.segment);
          const carry = closing.includes(character) && characters.length > 1 ? characters.pop() : '';
          lines.push(characters.join('').trimEnd());
          line = carry;
        }
        line += character;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

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
  let layout = printLayout(source.naturalWidth, source.naturalHeight);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('浏览器无法绘制照片');

  const metadata = photoMetadata(photo);
  const shortSide = Math.min(layout.photo.width, layout.photo.height);
  const titleSize = Math.max(20, Math.min(54, Math.round(shortSide * 0.024)));
  const bodySize = Math.max(14, Math.min(32, Math.round(shortSide * 0.014)));
  const smallSize = Math.max(12, Math.min(24, Math.round(shortSide * 0.011)));
  const captionSize = bodySize;
  const captionLineHeight = captionSize * 2;
  const captionWidth = Math.min(layout.photo.width, captionSize * 42);
  context.font = `400 ${captionSize}px ${sansFont}`;
  const captionLines = wrapPrintCaption(photoCaption(photo), captionWidth, text => context.measureText(text).width);
  const captionY = layout.height - Math.round(layout.margin * 0.65) - smallSize + captionSize;
  const captionHeight = captionLines.length
    ? captionSize + (captionLines.length - 1) * captionLineHeight + Math.round(layout.margin * 0.45) : 0;
  layout = printLayout(source.naturalWidth, source.naturalHeight, captionHeight);
  canvas.width = layout.width;
  canvas.height = layout.height;
  context.fillStyle = '#f0eee8';
  context.fillRect(0, 0, layout.width, layout.height);
  context.drawImage(source, layout.photo.x, layout.photo.y, layout.photo.width, layout.photo.height);

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

  context.textAlign = 'left';
  context.font = `400 ${captionSize}px ${sansFont}`;
  context.fillStyle = '#66635e';
  captionLines.forEach((line, index) => context.fillText(line, layout.photo.x, captionY + index * captionLineHeight));

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
