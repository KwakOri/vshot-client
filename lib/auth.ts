/**
 * Auth Utilities
 *
 * JWT 기반 인증 - 쿠키에 토큰 저장 (Next.js middleware 접근 가능)
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const TOKEN_COOKIE = 'vshot_token';

interface AuthResponse {
  token: string;
  user: { id: string; email: string; role: string };
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Login failed' }));
    throw new Error(data.error || 'Login failed');
  }

  const data: AuthResponse = await res.json();
  setTokenCookie(data.token);
  return data;
}

export async function createUser(email: string, password: string, role: string = 'host'): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ email, password, role }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Failed to create user' }));
    throw new Error(data.error || 'Failed to create user');
  }

  return res.json();
}

export async function getUsers(): Promise<{ users: { id: string; email: string; role: string; created_at: string }[]; total: number }> {
  const res = await fetch(`${API_URL}/api/auth/users`, {
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Failed to fetch users' }));
    throw new Error(data.error || 'Failed to fetch users');
  }

  return res.json();
}

export async function deleteUser(userId: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_URL}/api/auth/users/${userId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Failed to delete user' }));
    throw new Error(data.error || 'Failed to delete user');
  }

  return res.json();
}

interface AdminStats {
  active: number;
  expired: number;
  deleted: number;
  today: number;
  recentFilms: {
    id: string;
    status: string;
    photoUrl: string | null;
    videoUrl: string | null;
    createdAt: string;
    expiresAt: string;
  }[];
}

export async function getAdminStats(): Promise<AdminStats> {
  const res = await fetch(`${API_URL}/api/auth/stats`, {
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Failed to fetch stats' }));
    throw new Error(data.error || 'Failed to fetch stats');
  }

  return res.json();
}

export function logout(): void {
  document.cookie = `${TOKEN_COOKIE}=; path=/; max-age=0`;
}

export function getToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${TOKEN_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function getAuthHeaders(): HeadersInit {
  const apiKey = process.env.NEXT_PUBLIC_API_KEY;
  const token = getToken();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

export function getUserRole(): string | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.role || null;
  } catch {
    return null;
  }
}

export function getUserId(): string | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.userId || null;
  } catch {
    return null;
  }
}

function setTokenCookie(token: string): void {
  // 24h expiry matching JWT
  const maxAge = 24 * 60 * 60;
  document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}
