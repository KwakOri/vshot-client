export const PHOTO_REDIRECT_COUNTDOWN_SECONDS = 30;

export function getPhotoDownloadPath(filmId: string): string {
  return `/download/${filmId}`;
}
