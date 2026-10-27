import test from 'node:test';
import assert from 'node:assert/strict';
import { datePrecision, photoMetadata, photoMedium } from '../src/photo-metadata.js';
import { validateContent } from '../scripts/lib.mjs';
import { readFile } from 'node:fs/promises';

test('month, film day, and local digital minute retain their precision in every readout', () => {
  for (const [date, precision, label] of [
    ['2026-10', 'month', '2026.10'],
    ['2026-10-01', 'day', '2026.10.01'],
    ['2026-10-25T00:03', 'minute', '2026.10.25 00:03'],
    ['2024-02-29', 'day', '2024.02.29'],
  ]) {
    assert.equal(datePrecision(date), precision);
    assert.equal(photoMetadata({ capture: { date } }).dateLabel, label);
    assert.equal(photoMetadata({ capture: { date } }).date, date);
  }
  for (const invalid of [undefined, '', '2026', '2026-00', '2026-13', '2026-02-29', '2026-04-31', '2026-10-00', '2026-10-01T24:00', '2026-10-01T14:60', '2026-10-01T14:00Z']) {
    assert.equal(datePrecision(invalid), null, String(invalid));
  }
});

test('metadata hides digital lens names while retaining exposure, film, and DazzCam filters', () => {
  assert.equal(photoMedium({ capture: { film: 'FUJICOLOR C200' } }), 'film');
  assert.equal(photoMedium({ medium: 'digital' }, { medium: 'film' }), 'digital');
  const digital = photoMetadata({ capture: { camera: 'NIKON Z fc', lens: 'Z 23mm f/1.8', focalLength: '35mm', aperture: 'f/5.6' } });
  assert.equal(digital.medium, '');
  assert.equal(digital.camera, 'NIKON Z fc');
  assert.equal(digital.exposure, '35mm · f/5.6');
  const dazz = photoMetadata({ capture: { camera: 'DazzCam', filter: 'GRF', focalLength: '35mm', iso: '50', date: '2026-10-25T14:01' } });
  assert.equal(dazz.camera, 'DazzCam');
  assert.equal(dazz.medium, 'GRF 滤镜');
  assert.equal(dazz.exposure, '35mm · ISO 50');
});

test('capture validation rejects invented film times, invalid dates, and ambiguous legacy fields', async () => {
  const site = JSON.parse(await readFile(new URL('./fixtures/content/site.json', import.meta.url)));
  const collections = JSON.parse(await readFile(new URL('./fixtures/content/collections.json', import.meta.url)));
  const photo = collections[0].photos[0];
  for (const capture of [
    { date: '2026-02-29' },
    { dateTime: '2026-10-01T12:00' },
    { film: 'Kodak UltraMax 400', date: '2026-10-01T00:00' },
    { date: '2026-10-01', dateSource: 'processing-month' },
    { dateSource: 'manual' },
  ]) {
    photo.capture = capture;
    assert.throws(() => validateContent(site, collections));
  }
});
