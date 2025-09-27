import { useEffect, useMemo, useState } from "react";
import NotificationsBell from "@/components/NotificationsBell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Activity, FlaskConical, AlertTriangle, ClipboardList } from "lucide-react";

interface LabOrder {
  id: number;
  patient_id?: number | null;
  doctor_id?: number | null;
  tests?: string | null;
  notes?: string | null;
  status?: string | null; // pending|processing|completed
  result?: string | null;
  value?: string | null;
  unit?: string | null;
  flag?: string | null; // normal|abnormal|critical
  created_at?: string;
}

const LabTechDashboard = () => {
  const { toast } = useToast();
  const [pending, setPending] = useState<LabOrder[]>([]);
  const [completed, setCompleted] = useState<LabOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentNotifs, setRecentNotifs] = useState<Array<{id:number; title:string; message:string; created_at?:string; from_role?:string|null; from_name?:string|null}>>([]);

  const authHeaders = () => {
    const token = (() => { try { return localStorage.getItem('auth_token') || undefined; } catch { return undefined; } })();
    const headers: Record<string,string> = { 'Content-Type': 'application/json' } as any;
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  };

  const loadOrders = async () => {
    try {
      setLoading(true); setError(null);
      const headers = authHeaders();
      const [pRes, aRes] = await Promise.all([
        fetch('/api/lab-orders?status=pending', { headers }),
        fetch('/api/lab-orders?status=completed', { headers }),
      ]);
      const [pData, aData] = await Promise.all([pRes.json().catch(()=>[]), aRes.json().catch(()=>[])]);
      setPending(Array.isArray(pData) ? pData : []);
      setCompleted(Array.isArray(aData) ? aData.slice(0, 10) : []);
    } catch (e:any) {
      setError(e?.message || 'Failed to load lab orders');
    } finally { setLoading(false); }
  };

  useEffect(() => { loadOrders(); }, []);

  // SSE for realtime notifications
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      const token = (() => { try { return localStorage.getItem('auth_token') || ''; } catch { return ''; } })();
      if (!token) return;
      es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
      es.addEventListener('notification', (ev: MessageEvent) => {
        try {
          const data = JSON.parse(ev.data || '{}');
          setRecentNotifs(prev => {
            const next = [...prev, { id: data.id, title: data.title, message: data.message, created_at: data.created_at, from_role: data.from_role, from_name: data.from_name }];
            return next.slice(-5);
          });
          toast({ title: data.title || 'Notification', description: data.message || '' });
        } catch {}
      });
    } catch {}
    return () => { try { es?.close(); } catch {} };
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Lab Technician</h1>
          <p className="text-muted-foreground">Manage and update lab results</p>
        </div>
        <div className="flex items-center gap-2">
          <NotificationsBell />
          <Button variant="outline" size="sm" onClick={loadOrders}>Refresh</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Lab Orders */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FlaskConical className="w-5 h-5"/>Pending Lab Orders</CardTitle>
            <CardDescription>Review and complete pending tests</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
            {error && <div className="text-sm text-rose-700">{error}</div>}
            {!loading && !error && pending.length === 0 && (
              <div className="text-sm text-muted-foreground">No pending lab orders.</div>
            )}
            {!loading && !error && pending.map(o => (
              <div key={o.id} className="p-3 border rounded space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Lab Order #{o.id}</p>
                    <p className="text-xs text-muted-foreground">Patient #{o.patient_id ?? '—'} • Doctor #{o.doctor_id ?? '—'}</p>
                  </div>
                  <Badge variant="secondary" className="capitalize">{o.status || 'pending'}</Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Requested tests</p>
                  <p className="text-sm">{o.tests || '—'}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <div className="md:col-span-2">
                    <Label className="text-xs">Result</Label>
                    <Input defaultValue={o.result || ''} id={`res-${o.id}`} placeholder="e.g., Hb 12.8" />
                  </div>
                  <div>
                    <Label className="text-xs">Flag</Label>
                    <select id={`flag-${o.id}`} defaultValue={o.flag || 'normal'} className="w-full h-10 border rounded px-2 text-sm">
                      <option value="normal">normal</option>
                      <option value="abnormal">abnormal</option>
                      <option value="critical">critical</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Status</Label>
                    <select id={`stat-${o.id}`} defaultValue={o.status || 'processing'} className="w-full h-10 border rounded px-2 text-sm">
                      <option value="processing">processing</option>
                      <option value="completed">completed</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={async ()=>{
                    try {
                      const result = (document.getElementById(`res-${o.id}`) as HTMLInputElement)?.value || '';
                      const flag = (document.getElementById(`flag-${o.id}`) as HTMLSelectElement)?.value || 'normal';
                      const status = (document.getElementById(`stat-${o.id}`) as HTMLSelectElement)?.value || 'processing';
                      const res = await fetch(`/api/lab-orders/${o.id}`, { method:'PATCH', headers: authHeaders(), body: JSON.stringify({ result, flag, status }) });
                      if (!res.ok) { const t = await res.text(); throw new Error(t); }
                      toast({ title: 'Lab order updated', description: `#${o.id} → ${status}` });
                      await loadOrders();
                    } catch (e:any) {
                      toast({ variant:'destructive', title:'Update failed', description: e?.message || 'Unknown error' });
                    }
                  }}>Save</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Recent Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ClipboardList className="w-5 h-5"/>Recent Notifications</CardTitle>
            <CardDescription>Last 5 notifications</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentNotifs.length === 0 && <div className="text-sm text-muted-foreground">No recent notifications.</div>}
            {recentNotifs.slice().reverse().map(n => (
              <div key={n.id} className="p-2 border rounded">
                <p className="text-sm font-medium">{n.title}</p>
                <p className="text-xs text-muted-foreground">{n.message}</p>
                {(n.from_role || n.from_name) && (
                  <p className="text-[11px] text-muted-foreground/80">From: {n.from_role}{n.from_name ? ` (${n.from_name})` : ''}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Recently Completed */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Activity className="w-5 h-5"/>Recently Completed</CardTitle>
          <CardDescription>Last 10 completed lab orders</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {completed.map(c => (
            <div key={c.id} className="flex items-center justify-between p-3 border rounded">
              <div>
                <p className="font-medium">Lab Order #{c.id}</p>
                <p className="text-xs text-muted-foreground">{c.result || '(no result)'}{c.flag ? ` • ${c.flag}` : ''}</p>
              </div>
              <Badge variant="outline" className="capitalize">{c.status || 'completed'}</Badge>
            </div>
          ))}
          {completed.length === 0 && <div className="text-sm text-muted-foreground">No completed lab orders yet.</div>}
        </CardContent>
      </Card>
    </div>
  );
};

export default LabTechDashboard;
