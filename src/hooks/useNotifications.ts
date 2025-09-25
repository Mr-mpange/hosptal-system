import { useEffect, useState, useCallback } from "react";

export type NotificationRow = {
  id: number;
  title: string;
  message: string;
  target_role: 'all'|'patient'|'doctor'|'admin'|'laboratorist'|'manager';
  created_by?: number|null;
  created_at?: string;
};

export function useNotifications(pollMs: number = 60000) {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string| null>(null);

  const authHeaders = useCallback(() => {
    const token = (() => { try { return localStorage.getItem('auth_token') || undefined; } catch { return undefined; } })();
    const headers: Record<string,string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/notifications', { headers: authHeaders() });
      if (!res.ok) {
        const t = await res.text(); throw new Error(t);
      }
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    let timer: any;
    load();
    if (pollMs > 0) {
      timer = setInterval(load, pollMs);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [load, pollMs]);

  return { items, loading, error, reload: load };
}
