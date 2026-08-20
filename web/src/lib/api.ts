import type { NavigateFunction } from 'react-router-dom';
import type { SessionUser } from './types';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  return localStorage.getItem('token');
}

export function setSession(token: string, user: SessionUser): void {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

export function setStoredUser(user: SessionUser): void {
  localStorage.setItem('user', JSON.stringify(user));
}

export function clearSession(): void {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

export async function logout(navigate: NavigateFunction): Promise<void> {
  try {
    await apiFetch('/auth/logout', { method: 'POST' });
  } catch {
    // client-side logout must succeed regardless of network errors
  }
  clearSession();
  navigate('/login', { replace: true });
}

export function getUser(): SessionUser | null {
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    if (res.status === 401 && path !== '/auth/login') {
      clearSession();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    throw new ApiError(res.status, (body as { error?: string }).error ?? res.statusText);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}
