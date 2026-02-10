import { getApiHeaders } from '@/lib/api';
import type { FilmCreateRequest, FilmResponse, FilmListResponse } from '@/types/films';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function createFilm(request: FilmCreateRequest): Promise<FilmResponse> {
  const body = JSON.stringify(request);
  console.log('[createFilm] Sending request:', body);
  if (!body || body === 'undefined') {
    console.error('[createFilm] Invalid request body:', request);
    return { success: false, error: 'Invalid request body' };
  }
  const response = await fetch(`${API_URL}/api/festa/film`, {
    method: 'POST',
    headers: getApiHeaders(),
    body,
  });
  if (!response.ok) {
    const text = await response.text();
    console.error('[createFilm] Server error:', response.status, text);
    return { success: false, error: `Server error: ${response.status}` };
  }
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
