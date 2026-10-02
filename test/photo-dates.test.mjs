import test from 'node:test';
import assert from 'node:assert/strict';
import { captureDateFromExif, summarizeDates } from '../scripts/photo-dates.mjs';

function fixture(value, { little = true, tag = 0x9003 } = {}) {
  const tiff = Buffer.alloc(80);
  tiff.write(little ? 'II' : 'MM');
  const uint16 = (value, offset) => little ? tiff.writeUInt16LE(value, offset) : tiff.writeUInt16BE(value, offset);
  const uint32 = (value, offset) => little ? tiff.writeUInt32LE(value, offset) : tiff.writeUInt32BE(value, offset);
  uint16(42, 2); uint32(8, 4); uint16(1, 8);
  uint16(0x8769, 10); uint16(4, 12); uint32(1, 14); uint32(26, 18);
  uint16(1, 26); uint16(tag, 28); uint16(2, 30); uint32(20, 32); uint32(44, 36);
  tiff.write(`${value}\0`, 44, 'ascii');
  return Buffer.concat([Buffer.from('Exif\0\0'), tiff]);
}

test('reads original photo dates in both TIFF byte orders without changing the local day', () => {
  for (const little of [true, false]) assert.equal(captureDateFromExif(fixture('2026:10:01 00:01:00', { little })), '2026-10-01');
});

test('does not substitute modification, digitization or missing dates', () => {
  assert.equal(captureDateFromExif(fixture('2026:09:28 15:22:00', { tag: 0x9004 })), null);
  assert.equal(captureDateFromExif(fixture('2026:09:28 15:22:00', { tag: 0x0132 })), null);
  assert.equal(captureDateFromExif(undefined), null);
});

test('malformed or impossible EXIF timestamps fail safely', () => {
  for (const value of ['2026:02:30 00:00:00', '2026:10:01 29:00:00', '0000:00:00 00:00:00']) assert.equal(captureDateFromExif(fixture(value)), null);
  const malformed = fixture('2026:10:01 12:00:00');
  malformed.writeUInt32LE(0xffffffff, 6 + 36);
  assert.equal(captureDateFromExif(malformed), null);
  assert.equal(captureDateFromExif(Buffer.from('Exif\0\0')), null);
});

test('summarizes only available photo dates and tracks incomplete coverage', () => {
  assert.deepEqual(summarizeDates(['2026-10-02', null, '2026-10-01']), {
    start: '2026-10-01', end: '2026-10-02', source: 'EXIF DateTimeOriginal', datedPhotos: 2, totalPhotos: 3,
  });
  assert.equal(summarizeDates([null]), null);
});
