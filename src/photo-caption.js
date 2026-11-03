// Keep author-written paragraphs consistent across the gallery, lightbox and print.
export function photoCaption(photo) {
  return typeof photo.caption === 'string' ? photo.caption.replace(/\r\n?/g, '\n').trim() : '';
}
