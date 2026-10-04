import test from 'node:test';
import assert from 'node:assert/strict';
import { captureFromExif } from '../scripts/photo-metadata.mjs';

function fixture(little) {
  const tiff = Buffer.alloc(320);
  tiff.write(little ? 'II' : 'MM');
  const u16 = (value, offset) => little ? tiff.writeUInt16LE(value, offset) : tiff.writeUInt16BE(value, offset);
  const u32 = (value, offset) => little ? tiff.writeUInt32LE(value, offset) : tiff.writeUInt32BE(value, offset);
  const entry = (offset, tag, type, count, value) => {
    u16(tag, offset); u16(type, offset + 2); u32(count, offset + 4);
    if (type === 3 && count === 1) u16(value, offset + 8);
    else u32(value, offset + 8);
  };
  u16(42, 2); u32(8, 4); u16(2, 8);
  entry(10, 0x0110, 2, 11, 50);
  entry(22, 0x8769, 4, 1, 80);
  tiff.write('NIKON Z fc\0', 50, 'ascii');
  u16(7, 80);
  const lens = 'TTArtisan Z 23mm f/1.8 S\0';
  entry(82, 0xa434, 2, lens.length, 180);
  entry(94, 0x920a, 5, 1, 220);
  entry(106, 0x829d, 5, 1, 228);
  entry(118, 0x829a, 5, 1, 236);
  entry(130, 0x8827, 3, 1, 200);
  entry(142, 0xa405, 3, 1, 34);
  entry(154, 0x9003, 2, 20, 260);
  tiff.write(lens, 180, 'ascii');
  u32(23, 220); u32(1, 224);
  u32(63, 228); u32(10, 232);
  u32(1, 236); u32(640, 240);
  tiff.write('2026:10:01 16:29:17\0', 260, 'ascii');
  return Buffer.concat([Buffer.from('Exif\0\0'), tiff]);
}

test('reads camera, lens and exposure values from both EXIF byte orders', () => {
  for (const little of [true, false]) assert.deepEqual(captureFromExif(fixture(little)), {
    camera: 'NIKON Z fc',
    lens: 'TTArtisan Z 23mm f/1.8 S',
    focalLength: '34mm',
    aperture: 'f/6.3',
    shutter: '1/640 s',
    iso: '200',
    dateTime: '2026-10-01T16:29',
  });
});

test('missing or malformed EXIF never invents camera parameters', () => {
  assert.equal(captureFromExif(undefined), null);
  assert.equal(captureFromExif(Buffer.from('Exif\0\0')), null);
  const bad = fixture(true);
  bad.writeUInt32LE(0xffffffff, 6 + 22 + 8);
  assert.deepEqual(captureFromExif(bad), { camera: 'NIKON Z fc' });
  const noEquivalent = fixture(true);
  noEquivalent.writeUInt16LE(0, 6 + 142 + 8);
  assert.equal(captureFromExif(noEquivalent).focalLength, undefined);
});
