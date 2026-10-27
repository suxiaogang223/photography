// Partial ISO dates retain what is actually known: month, day, or local minute.
// Never convert camera time to UTC or pad a film date with an invented midnight.
export function datePrecision(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2}))?)?$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  if (+year < 1900 || +month < 1 || +month > 12) return null;
  if (day) {
    const calendar = new Date(Date.UTC(+year, +month - 1, +day));
    if (calendar.getUTCFullYear() !== +year || calendar.getUTCMonth() !== +month - 1 || calendar.getUTCDate() !== +day) return null;
  }
  if (hour !== undefined && (+hour > 23 || +minute > 59)) return null;
  return hour !== undefined ? 'minute' : day ? 'day' : 'month';
}

export function photoMedium(photo, collection = {}) {
  return photo.medium || (photo.capture?.film ? 'film' : collection.medium || 'digital');
}

export function photoMetadata(photo) {
  const capture = photo.capture || {};
  const date = capture.date || '';
  return {
    camera: capture.camera || '',
    medium: capture.film || (capture.filter ? `${capture.filter} 滤镜` : ''),
    exposure: [capture.focalLength, capture.aperture, capture.shutter, capture.iso && `ISO ${capture.iso}`].filter(Boolean).join(' · '),
    date,
    dateLabel: date.replaceAll('-', '.').replace('T', ' '),
  };
}
