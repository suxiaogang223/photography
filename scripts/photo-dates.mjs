import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Read only DateTimeOriginal, never GPS, file modification time or scan time tags.
// Keep the date as recorded by the camera; UTC conversion could change its day.
export function captureDateFromExif(exif) {
  if (!Buffer.isBuffer(exif)) return null;
  const start = exif.subarray(0, 6).toString('ascii') === 'Exif\0\0' ? 6 : 0;
  const tiff = exif.subarray(start);
  if (tiff.length < 8) return null;
  const endian = tiff.toString('ascii', 0, 2);
  if (!['II', 'MM'].includes(endian)) return null;
  const uint16 = offset => endian === 'II' ? tiff.readUInt16LE(offset) : tiff.readUInt16BE(offset);
  const uint32 = offset => endian === 'II' ? tiff.readUInt32LE(offset) : tiff.readUInt32BE(offset);
  if (uint16(2) !== 42) return null;
  let original = null;
  function readIfd(offset, depth = 0) {
    if (depth > 1 || offset < 8 || offset + 2 > tiff.length) return;
    const count = uint16(offset);
    for (let index = 0; index < count; index++) {
      const entry = offset + 2 + index * 12;
      if (entry + 12 > tiff.length) return;
      const tag = uint16(entry);
      const type = uint16(entry + 2);
      const size = uint32(entry + 4);
      const value = uint32(entry + 8);
      if (tag === 0x8769 && type === 4 && size === 1) readIfd(value, depth + 1);
      if (tag !== 0x9003 || type !== 2 || size < 19 || size > 64) continue;
      if (value + size > tiff.length) continue;
      original = tiff.toString('ascii', value, value + size).replace(/\0.*$/, '');
    }
  }
  readIfd(uint32(4));
  const match = original?.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  if (year < 1900 || hour > 23 || minute > 59 || second > 59) return null;
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function summarizeDates(dates) {
  const valid = dates.filter(Boolean).sort();
  if (!valid.length) return null;
  return { start: valid[0], end: valid.at(-1), source: 'EXIF DateTimeOriginal', datedPhotos: valid.length, totalPhotos: dates.length };
}

export async function inspectPhotoDates(inputDir, collectionId) {
  const files = (await readdir(inputDir, { withFileTypes: true })).filter(entry => entry.isFile() && /\.jpe?g$/i.test(entry.name));
  const result = new Map();
  for (const file of files) {
    const buffer = await readFile(path.join(inputDir, file.name));
    const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
    const metadata = await sharp(buffer).metadata();
    result.set(`${collectionId}-${hash}`, captureDateFromExif(metadata.exif));
  }
  return result;
}
