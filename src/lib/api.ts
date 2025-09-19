// Simple API helper to centralize JWT handling and JSON parsing
// Usage:
//   const api = createApi();
//   const data = await api.get('/api/me');
//   await api.post('/api/admin/users', body);
//   api.setToken(tokenFromLogin);

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiResponse<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

export const getToken = (): string | undefined => {
  try { return localStorage.getItem('auth_token') || undefined; } catch { return undefined; }
};
export const setToken = (token?: string) => {
  try {
    if (!token) localStorage.removeItem('auth_token');
    else localStorage.setItem('auth_token', token);
  } catch {}
};
export const clearToken = () => setToken(undefined);

export const parseJson = async (res: Response) => {
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { message: text }; }
};

export const apiFetch = async <T = any>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> => {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  // Default content-type for JSON bodies
  if (options.body && !(headers['Content-Type'])) headers['Content-Type'] = 'application/json';

  const res = await fetch(path, { ...options, headers });
  const data = await parseJson(res);
  if (!res.ok) {
    return { ok: false, status: res.status, data: null, error: (data?.message || data?.details || `HTTP ${res.status}`) };
  }
  return { ok: true, status: res.status, data };
};

export const createApi = () => ({
  get: async <T = any>(path: string) => (await apiFetch<T>(path)).data as T,
  post: async <T = any>(path: string, body?: any) => (await apiFetch<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined })).data as T,
  put: async <T = any>(path: string, body?: any) => (await apiFetch<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined })).data as T,
  patch: async <T = any>(path: string, body?: any) => (await apiFetch<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined })).data as T,
  delete: async <T = any>(path: string) => (await apiFetch<T>(path, { method: 'DELETE' })).data as T,
  setToken,
  clearToken,
  getToken,
});
