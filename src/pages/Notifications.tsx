import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface Notif { id:number; title:string; message:string; target_role:string; created_at?:string }

const Notifications = () => {
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [q, setQ] = useState<string>("");
  const [readIds, setReadIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    // restore read ids from localStorage
    try {
      const raw = localStorage.getItem('notif_read_ids');
      if (raw) setReadIds(new Set(JSON.parse(raw)));
    } catch {}
  }, []);

  const saveRead = (ns: Set<number>) => {
    setReadIds(new Set(ns));
    try { localStorage.setItem('notif_read_ids', JSON.stringify(Array.from(ns))); } catch {}
  };

  const authHeaders = () => {
    const token = (() => { try { return localStorage.getItem('auth_token') || undefined; } catch { return undefined; } })();
    const headers: any = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  };

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (q.trim()) params.set('q', q.trim());
      const res = await fetch(`/api/notifications?${params.toString()}`, { headers: authHeaders() });
      if (!res.ok) { const t = await res.text(); throw new Error(t); }
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e:any) {
      setError(e?.message || 'Failed to load notifications');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const fq = q.trim().toLowerCase();
    return items.filter(n => {
      if (from && String(n.created_at||'').slice(0,10) < from) return false;
      if (to && String(n.created_at||'').slice(0,10) > to) return false;
      if (fq && !(n.title?.toLowerCase().includes(fq) || n.message?.toLowerCase().includes(fq))) return false;
      return true;
    });
  }, [items, from, to, q]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Notifications</h1>
          <p className="text-muted-foreground">Recent messages relevant to your role</p>
        </div>
        <Button variant="outline" onClick={load}>Refresh</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Search, date range and read/unread</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label htmlFor="nf-from">From</Label>
              <Input id="nf-from" type="date" value={from} onChange={(e)=>setFrom(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="nf-to">To</Label>
              <Input id="nf-to" type="date" value={to} onChange={(e)=>setTo(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="nf-q">Search</Label>
              <Input id="nf-q" placeholder="title or message" value={q} onChange={(e)=>setQ(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Messages</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 max-h-[60vh] overflow-auto">
          {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {error && <div className="text-sm text-rose-700">{error}</div>}
          {!loading && !error && filtered.map(n => {
            const isRead = readIds.has(n.id);
            return (
              <div key={n.id} className="p-3 border rounded flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{n.title}</p>
                  <p className="text-xs text-muted-foreground break-words">{n.message}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{n.created_at ? new Date(n.created_at).toLocaleString() : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={isRead ? 'outline' : 'secondary'}>{isRead ? 'read' : 'unread'}</Badge>
                  <Button size="sm" variant="outline" onClick={async () => {
                    try {
                      const res = await fetch(`/api/notifications/${n.id}/read`, { method:'POST', headers: authHeaders() });
                      if (!res.ok) { const t = await res.text(); throw new Error(t); }
                      const next = new Set(readIds); next.add(n.id); saveRead(next);
                    } catch {}
                  }}>Mark read</Button>
                </div>
              </div>
            );
          })}
          {!loading && !error && filtered.length === 0 && (
            <div className="text-sm text-muted-foreground">No notifications</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Notifications;
