import type { FilmCreateRequest, FilmResponse, FilmListResponse } from '@/types/films';

export async function createFilm(request: FilmCreateRequest): Promise<FilmResponse> {
  const response = await fetch('/api/films', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return response.json();
}

export async function getFilm(filmId: string): Promise<FilmResponse> {
  const response = await fetch(`/api/films/${filmId}`);
  return response.json();
}

export async function getFilms(params?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<FilmListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.offset) searchParams.set('offset', String(params.offset));

  const response = await fetch(`/api/films?${searchParams}`);
  return response.json();
}

export async function deleteFilm(filmId: string): Promise<{ success: boolean }> {
  const response = await fetch(`/api/films/${filmId}`, { method: 'DELETE' });
  return response.json();
}
