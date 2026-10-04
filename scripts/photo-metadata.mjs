// Read only public-facing exposure fields. Never copy EXIF blobs, GPS, serial numbers,
// copyright/contact data, or the source filename into the published manifest.
import { captureDateFromExif } from './photo-dates.mjs';

export function captureFromExif(exif) {
  if (!Buffer.isBuffer(exif)) return null;
  const start = exif.subarray(0, 6).toString('ascii') === 'Exif\0\0' ? 6 : 0;
  const tiff = exif.subarray(start);
  if (tiff.length < 8) return null;
  const byteOrder = tiff.toString('ascii', 0, 2);
  if (byteOrder !== 'II' && byteOrder !== 'MM') return null;
  const little = byteOrder === 'II';
  const u16 = offset => little ? tiff.readUInt16LE(offset) : tiff.readUInt16BE(offset);
  const u32 = offset => little ? tiff.readUInt32LE(offset) : tiff.readUInt32BE(offset);
  const sizeOf = { 2: 1, 3: 2, 4: 4, 5: 8 };
  const inBounds = (offset, length) => Number.isSafeInteger(offset) && offset >= 0 && Number.isSafeInteger(length) && length >= 0 && offset + length <= tiff.length;
  if (u16(2) !== 42) return null;

  function directory(offset) {
    if (!inBounds(offset, 2)) return new Map();
    const count = u16(offset);
    if (count > 256 || !inBounds(offset + 2, count * 12)) return new Map();
    const fields = new Map();
    for (let index = 0; index < count; index++) {
      const entry = offset + 2 + index * 12;
      const tag = u16(entry);
      const type = u16(entry + 2);
      const elements = u32(entry + 4);
      const length = elements * sizeOf[type];
      if (!length || length > 4096) continue;
      const value = length <= 4 ? entry + 8 : u32(entry + 8);
      if (inBounds(value, length)) fields.set(tag, { type, elements, value, length });
    }
    return fields;
  }

  function ascii(field) {
    if (field?.type !== 2) return null;
    const value = tiff.toString('utf8', field.value, field.value + field.length).replace(/\0.*$/s, '').trim();
    return value && value.length <= 120 && !/[\x00-\x1f]/.test(value) ? value : null;
  }
  function integer(field) {
    if (!field || field.elements !== 1) return null;
    if (field.type === 3) return u16(field.value);
    if (field.type === 4) return u32(field.value);
    return null;
  }
  function rational(field) {
    if (field?.type !== 5 || field.elements !== 1) return null;
    const denominator = u32(field.value + 4);
    return denominator ? u32(field.value) / denominator : null;
  }
  const root = directory(u32(4));
  const exposure = directory(integer(root.get(0x8769)));
  const camera = ascii(root.get(0x0110));
  const lens = ascii(exposure.get(0xa434));
  const equivalent = integer(exposure.get(0xa405));
  const fNumber = rational(exposure.get(0x829d));
  const seconds = rational(exposure.get(0x829a));
  const iso = integer(exposure.get(0x8827));
  const date = captureDateFromExif(exif);
  const originalTime = ascii(exposure.get(0x9003));
  const result = {};
  if (camera) result.camera = camera;
  if (lens) result.lens = lens;
  // The public readout uses only the 35mm-equivalent value; never substitute
  // the physical focal length if the equivalent EXIF field is unavailable.
  if (equivalent > 0 && equivalent < 2000) result.focalLength = `${equivalent}mm`;
  if (fNumber > 0 && fNumber < 128) result.aperture = `f/${Number(fNumber.toFixed(1))}`;
  if (seconds > 0 && seconds < 3600) {
    const reciprocal = Math.round(1 / seconds);
    result.shutter = seconds < 1 && Math.abs(1 / reciprocal - seconds) < 0.0001
      ? `1/${reciprocal} s` : `${Number(seconds.toFixed(3))} s`;
  }
  if (iso > 0 && iso < 1_000_000) result.iso = String(iso);
  if (date && originalTime?.startsWith(date.replaceAll('-', ':'))) result.dateTime = `${date}T${originalTime.slice(11, 16)}`;
  return Object.keys(result).length ? result : null;
}
