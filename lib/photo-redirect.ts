export const PHOTO_REDIRECT_COUNTDOWN_SECONDS = 40;

export function getPhotoDownloadPath(filmId: string): string {
  return `/download/${filmId}`;
}
