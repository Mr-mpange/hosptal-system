import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Calendar, Clock, FileText, AlertCircle, TrendingUp, FlaskConical } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import NotificationsBell from "@/components/NotificationsBell";
import { useToast } from "@/components/ui/use-toast";

type DocAppt = { id:number; doctor_id?:number; patient_id:number; date:string; time:string; notes?:string };
type DoctorMetrics = {
  doctorId: number | null;
  appointmentsToday: number;
  patientsCount: number;
  recordsCount: number;
  invoicesToday: number;
  commonRecordTypes: { record_type: string; c: number }[];
};

const DoctorDashboard = () => {
  let displayName = "Doctor";
  let userId: number | undefined = undefined;
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('auth_user') : null;
    if (raw) {
      const u = JSON.parse(raw);
      if (u?.name) displayName = u.name;
      if (u?.id) userId = Number(u.id);
    }
  } catch {}
  const [schedule, setSchedule] = useState<DocAppt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<DoctorMetrics | null>(null);
  const [abnormalLabs, setAbnormalLabs] = useState<number>(0);
  const [showRx, setShowRx] = useState(false);
  const [showLab, setShowLab] = useState(false);
  const [formPatientId, setFormPatientId] = useState<string>("");
  const [formDiagnosis, setFormDiagnosis] = useState<string>("");
  const [formMeds, setFormMeds] = useState<string>("");
  const [formNotes, setFormNotes] = useState<string>("");
  const [formTests, setFormTests] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [avail, setAvail] = useState<Array<{id:number; date:string; start_time?:string|null; end_time?:string|null; status:'on'|'off'}>>([]);
  const [editingId, setEditingId] = useState<number|null>(null);
  const [editDate, setEditDate] = useState<string>('');
  const [editStart, setEditStart] = useState<string>('');
  const [editEnd, setEditEnd] = useState<string>('');
  const [editStatus, setEditStatus] = useState<'on'|'off'>('on');
  const [savingAvail, setSavingAvail] = useState<boolean>(false);
  const [recentNotifs, setRecentNotifs] = useState<Array<{id:number; title:string; message:string; created_at?:string; from_role?:string|null; from_name?:string|null}>>([]);
  const [avDate, setAvDate] = useState<string>(new Date().toISOString().slice(0,10));
  const [avStart, setAvStart] = useState<string>("09:00");
  const [avEnd, setAvEnd] = useState<string>("17:00");
  const [avStatus, setAvStatus] = useState<'on'|'off'>('on');
  // Reschedule state
  const [showRes, setShowRes] = useState(false);
  const [resApptId, setResApptId] = useState<number | null>(null);
  const [resDate, setResDate] = useState<string>(new Date().toISOString().slice(0,10));
  const [resTime, setResTime] = useState<string>("09:00");
  const [resSlots, setResSlots] = useState<string[]>([]);
  const { toast } = useToast();

  // Helpers
  const authHeaders = () => {
    const token = (() => { try { return localStorage.getItem('auth_token') || undefined; } catch { return undefined; } })();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' } as any;
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  };

  const refreshAvailRange = async () => {
    try {
      const token = (() => { try { return localStorage.getItem('auth_token') || undefined; } catch { return undefined; } })();
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const from = new Date().toISOString().slice(0,10);
      const to = new Date(Date.now()+14*24*60*60*1000).toISOString().slice(0,10);
      const list = await fetch(`/api/availability?from=${from}&to=${to}`, { headers });
      const data = await list.json();
      setAvail(Array.isArray(data) ? data : []);
    } catch {}
  };
  const refreshSchedule = async () => {
    try {
      const token = (() => { try { return localStorage.getItem('auth_token') || undefined; } catch { return undefined; } })();
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const today = new Date();
      const toDate = new Date(today.getTime() + 7*24*60*60*1000);
      const fromStr = today.toISOString().slice(0,10);
      const toStr = toDate.toISOString().slice(0,10);
      const aRes = await fetch(`/api/appointments/range?from=${fromStr}&to=${toStr}&doctor_id=${userId}`, { headers });
      const data = await aRes.json();
      setSchedule(Array.isArray(data) ? data.slice(0,10) : []);
    } catch {}
  };

  const parseResponse = async (res: Response) => {
    const ct = res.headers.get("content-type") || "";
    let data: any = null;
    if (ct.includes("application/json")) data = await res.json();
    else { const text = await res.text(); try { data = JSON.parse(text); } catch { throw new Error(text || "Non-JSON response"); } }
    if (!res.ok) throw new Error(data?.message || data?.details || `HTTP ${res.status}`);
    return data;
  };

  useEffect(() => {
    let active = true;
    (async () => {
      if (!userId) { setLoading(false); return; }
      setLoading(true); setError(null);
      try {
        const token = (() => { try { return localStorage.getItem('auth_token') || undefined; } catch { return undefined; } })();
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
        const today = new Date();
        const toDate = new Date(today.getTime() + 7*24*60*60*1000);
        const fromStr = today.toISOString().slice(0,10);
        const toStr = toDate.toISOString().slice(0,10);
        const [aRes, mRes, labRes] = await Promise.all([
          fetch(`/api/appointments/range?from=${fromStr}&to=${toStr}&doctor_id=${userId}`, { headers }),
          fetch(`/api/metrics/doctor?doctor_id=${userId}`, { headers }),
          fetch(`/api/metrics/labs/abnormal`, { headers }),
        ]);
        const [aData, mData, labData] = await Promise.all([
          parseResponse(aRes), parseResponse(mRes), parseResponse(labRes)
        ]);
        if (!active) return;
        setSchedule(Array.isArray(aData) ? aData.slice(0, 10) : []);
        setMetrics(mData as DoctorMetrics);
        setAbnormalLabs(Number(labData?.abnormal || 0));
        // Load availability for next 14 days
        const avTo = new Date(today.getTime() + 14*24*60*60*1000).toISOString().slice(0,10);
        try {
          const avRes = await fetch(`/api/availability?from=${fromStr}&to=${avTo}`, { headers });
          const avData = await parseResponse(avRes);
          setAvail(Array.isArray(avData) ? avData : []);
        } catch {}
      } catch (e:any) {
        if (!active) return;
        setError(e?.message || 'Failed to load schedule');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  // userId only
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Load available slots for reschedule when date changes and modal is open
  useEffect(() => {
    (async () => {
      try {
        if (!showRes || !resDate || !userId) { setResSlots([]); return; }
        const token = (() => { try { return localStorage.getItem('auth_token') || undefined; } catch { return undefined; } })();
        const headers:any = token ? { Authorization: `Bearer ${token}` } : undefined;
        const res = await fetch(`/api/appointments/available?doctor_id=${userId}&date=${resDate}`, { headers });
        if (!res.ok) { setResSlots([]); return; }
        const data = await res.json();
        setResSlots(Array.isArray(data) ? data : []);
        if (Array.isArray(data) && data.length > 0) setResTime(String(data[0]));
      } catch { setResSlots([]); }
    })();
  }, [showRes, resDate, userId]);

  // Realtime notifications via SSE: toast and recent list
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
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 5) return 'Good night';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    if (h < 21) return 'Good evening';
    return 'Good night';
  })();

  return (
    <div className="space-y-6">
      {/* Welcome section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{greeting}, {displayName}</h1>
          <p className="text-muted-foreground">You have {schedule.length} appointments scheduled</p>
        </div>
        <div className="flex items-center gap-2">
          <NotificationsBell />
          <Button className="bg-gradient-to-r from-primary to-primary/90" onClick={() => navigate('/patients')}>
            <Users className="w-4 h-4 mr-2" />
            View All Patients
          </Button>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <Calendar className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{schedule.length}</p>
                <p className="text-sm text-muted-foreground">Appointments</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{metrics?.patientsCount ?? '—'}</p>
                <p className="text-sm text-muted-foreground">Patients</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{metrics?.invoicesToday ?? 0}</p>
                <p className="text-sm text-muted-foreground">Invoices Today</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{abnormalLabs}</p>
                <p className="text-sm text-muted-foreground">Abnormal Lab Results</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Schedule */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Your Schedule
            </CardTitle>
            <CardDescription>Your upcoming appointments</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
            {error && <div className="text-sm text-rose-700">{error}</div>}
            {!loading && !error && schedule.map((a) => (
              <div key={a.id} className="flex items-center justify-between p-4 bg-accent/50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <Avatar className="w-10 h-10">
                    <AvatarImage src="" />
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                      PT
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">Patient #{a.patient_id}</p>
                    <p className="text-sm text-muted-foreground">Notes: {a.notes || '—'}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium">{a.time}</p>
                  <Badge className="mt-1">scheduled</Badge>
                  <div className="mt-2 flex gap-2 justify-end">
                    <Button size="sm" variant="secondary" onClick={async ()=>{
                      try {
                        const res = await fetch(`/api/appointments/${a.id}/approve`, { method:'POST', headers: authHeaders() });
                        if (!res.ok) { const t = await res.text(); throw new Error(t); }
                        await refreshSchedule();
                        toast({ title: 'Appointment approved', description: `#${a.id} approved` });
                      } catch (e:any) { toast({ variant:'destructive', title:'Approve failed', description: e?.message||'Unknown error' }); }
                    }}>Approve</Button>
                    <Button size="sm" variant="outline" onClick={async ()=>{
                      try {
                        const res = await fetch(`/api/appointments/${a.id}/reject`, { method:'POST', headers: authHeaders() });
                        if (!res.ok) { const t = await res.text(); throw new Error(t); }
                        await refreshSchedule();
                        toast({ title:'Appointment rejected', description:`#${a.id} rejected` });
                      } catch (e:any) { toast({ variant:'destructive', title:'Reject failed', description: e?.message||'Unknown error' }); }
                    }}>Reject</Button>
                    <Button size="sm" onClick={()=>{ setShowRes(true); setResApptId(a.id); setResDate(a.date); setResTime(a.time); }}>Reschedule</Button>
                  </div>
                </div>
              </div>
            ))}
            {!loading && !error && schedule.length === 0 && (
              <div className="text-sm text-muted-foreground">No appointments found.</div>
            )}
          </CardContent>
        </Card>

        {/* Recent Patients */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Recent Patients
            </CardTitle>
            <CardDescription>Common record types (top)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {metrics?.commonRecordTypes?.length ? metrics.commonRecordTypes.map((r, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-accent/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Avatar className="w-10 h-10">
                    <AvatarImage src="" />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {r.record_type?.slice(0,2)?.toUpperCase() || 'MR'}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{r.record_type || 'Record'}</p>
                    <p className="text-sm text-muted-foreground">Count</p>
                  </div>
                </div>
                <Badge variant="outline" className="mt-1 text-xs">
                  {r.c}
                </Badge>
              </div>
            )) : <div className="text-sm text-muted-foreground">No data available.</div>}
          </CardContent>
        </Card>
      </div>

      {/* Availability */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Availability
          </CardTitle>
          <CardDescription>Set your on-duty times</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <Label htmlFor="av-date">Date</Label>
              <Input id="av-date" type="date" value={avDate} onChange={(e)=>setAvDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="av-start">Start</Label>
              <Input id="av-start" type="time" value={avStart} onChange={(e)=>setAvStart(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="av-end">End</Label>
              <Input id="av-end" type="time" value={avEnd} onChange={(e)=>setAvEnd(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="av-status">Status</Label>
              <select id="av-status" className="w-full border rounded h-10 px-2" value={avStatus} onChange={(e)=>setAvStatus(e.target.value as 'on'|'off')}>
                <option value="on">on</option>
                <option value="off">off</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button disabled={submitting} onClick={async ()=>{
                try{
                  setSubmitting(true);
                  const token = localStorage.getItem('auth_token')||undefined;
                  const headers:any = { 'Content-Type':'application/json' };
                  if (token) headers.Authorization = `Bearer ${token}`;
                  const res = await fetch('/api/availability', { method:'POST', headers, body: JSON.stringify({ date: avDate, start_time: avStart, end_time: avEnd, status: avStatus }) });
                  if (!res.ok) { const t = await res.text(); throw new Error(t); }
                  // Refresh availability window next 14 days
                  const from = new Date().toISOString().slice(0,10);
                  const to = new Date(Date.now()+14*24*60*60*1000).toISOString().slice(0,10);
                  const list = await fetch(`/api/availability?from=${from}&to=${to}`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
                  const data = await list.json();
                  setAvail(Array.isArray(data) ? data : []);
                }catch(e){ console.error('create availability error', e); alert('Failed to save availability'); }
                finally{ setSubmitting(false); }
              }}>Add</Button>
            </div>
          </div>

          <div className="space-y-2 max-h-64 overflow-auto">
            {avail.map(a => (
              <div key={a.id} className="p-3 border rounded">
                {editingId === a.id ? (
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
                    <div>
                      <Label className="text-xs">Date</Label>
                      <Input type="date" value={editDate} onChange={(e)=>setEditDate(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Start</Label>
                      <Input type="time" value={editStart} onChange={(e)=>setEditStart(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">End</Label>
                      <Input type="time" value={editEnd} onChange={(e)=>setEditEnd(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Status</Label>
                      <select className="w-full border rounded h-10 px-2" value={editStatus} onChange={(e)=>setEditStatus(e.target.value as 'on'|'off')}>
                        <option value="on">on</option>
                        <option value="off">off</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" disabled={savingAvail} onClick={async ()=>{
                        try {
                          setSavingAvail(true);
                          const token = localStorage.getItem('auth_token')||undefined;
                          const headers:any = { 'Content-Type':'application/json' };
                          if (token) headers.Authorization = `Bearer ${token}`;
                          const res = await fetch(`/api/availability/${a.id}`, { method:'PUT', headers, body: JSON.stringify({ date: editDate, start_time: editStart, end_time: editEnd, status: editStatus }) });
                          if (!res.ok) { const t = await res.text(); throw new Error(t); }
                          setEditingId(null);
                          await refreshAvailRange();
                          toast({ title:'Availability updated' });
                        } catch(e:any) { toast({ variant:'destructive', title:'Update failed', description: e?.message||'Unknown error' }); }
                        finally { setSavingAvail(false); }
                      }}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={()=> setEditingId(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{a.date}</p>
                      <p className="text-xs text-muted-foreground">{a.start_time || '--:--'} - {a.end_time || '--:--'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="capitalize">{a.status}</Badge>
                      <Button size="sm" variant="outline" onClick={()=>{ setEditingId(a.id); setEditDate(a.date); setEditStart(a.start_time||''); setEditEnd(a.end_time||''); setEditStatus(a.status); }}>Edit</Button>
                      <Button size="sm" variant="destructive" onClick={async ()=>{
                        if (!confirm('Delete this availability?')) return;
                        try {
                          const token = localStorage.getItem('auth_token')||undefined;
                          const headers:any = token ? { Authorization: `Bearer ${token}` } : undefined;
                          const res = await fetch(`/api/availability/${a.id}`, { method:'DELETE', headers });
                          if (!res.ok) { const t = await res.text(); throw new Error(t); }
                          await refreshAvailRange();
                          toast({ title:'Availability deleted' });
                        } catch(e:any) { toast({ variant:'destructive', title:'Delete failed', description: e?.message||'Unknown error' }); }
                      }}>Delete</Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {avail.length===0 && <div className="text-sm text-muted-foreground">No availability set for the next two weeks.</div>}
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Quick Actions
            </CardTitle>
            <CardDescription>Commonly used features</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button variant="outline" className="h-20 flex-col space-y-2" onClick={() => setShowRx(true)}>
              <FileText className="w-6 h-6" />
              <span className="text-sm">New Prescription</span>
            </Button>
            <Button variant="outline" className="h-20 flex-col space-y-2" onClick={() => navigate('/appointments')}>
              <Calendar className="w-6 h-6" />
              <span className="text-sm">Schedule Appointment</span>
            </Button>
            <Button variant="outline" className="h-20 flex-col space-y-2" onClick={() => navigate('/records')}>
              <Users className="w-6 h-6" />
              <span className="text-sm">Patient Records</span>
            </Button>
            <Button variant="outline" className="h-20 flex-col space-y-2" onClick={() => setShowLab(true)}>
              <FlaskConical className="w-6 h-6" />
              <span className="text-sm">Request Lab Tests</span>
            </Button>
          </div>
          </CardContent>
        </Card>

      {/* NewPrescription Modal */}
      <Dialog open={showRx} onOpenChange={setShowRx}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>NewPrescription</DialogTitle>
            <DialogDescription>Create a prescription for a patient</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="rx-patient">Patient ID</Label>
              <Input id="rx-patient" value={formPatientId} onChange={(e)=>setFormPatientId(e.target.value)} placeholder="e.g., 123" />
            </div>
            <div>
              <Label htmlFor="rx-dx">Diagnosis</Label>
              <Input id="rx-dx" value={formDiagnosis} onChange={(e)=>setFormDiagnosis(e.target.value)} placeholder="Diagnosis" />
            </div>
            <div>
              <Label htmlFor="rx-meds">Medications (JSON or lines)</Label>
              <Textarea id="rx-meds" value={formMeds} onChange={(e)=>setFormMeds(e.target.value)} placeholder='e.g., [{"name":"Amoxicillin","dose":"500mg","freq":"TID"}] or one per line' />
            </div>
            <div>
              <Label htmlFor="rx-notes">Notes</Label>
              <Textarea id="rx-notes" value={formNotes} onChange={(e)=>setFormNotes(e.target.value)} placeholder="Optional notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={()=>setShowRx(false)}>Cancel</Button>
            <Button disabled={submitting} onClick={async ()=>{
              try{
                setSubmitting(true);
                const token = localStorage.getItem('auth_token')||undefined;
                const headers:any = { 'Content-Type':'application/json' };
                if (token) headers.Authorization = `Bearer ${token}`;
                let medications:any = null;
                if (formMeds.trim()){
                  try { medications = JSON.parse(formMeds); }
                  catch{ medications = formMeds.split('\n').map(x=>x.trim()).filter(Boolean); }
                }
                const res = await fetch('/api/prescriptions',{ method:'POST', headers, body: JSON.stringify({ patient_id: Number(formPatientId), diagnosis: formDiagnosis || undefined, medications, notes: formNotes||undefined })});
                if(!res.ok){ const t = await res.text(); throw new Error(t); }
                setShowRx(false);
                setFormPatientId(""); setFormDiagnosis(""); setFormMeds(""); setFormNotes("");
              }catch(e){ console.error('rx save error', e); toast({ variant:'destructive', title:'Failed to save prescription' }); }
              finally{ setSubmitting(false); }
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reschedule Modal */}
      <Dialog open={showRes} onOpenChange={setShowRes}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reschedule Appointment</DialogTitle>
            <DialogDescription>Select new date and time</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="rs-date">Date</Label>
              <Input id="rs-date" type="date" value={resDate} onChange={(e)=>setResDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="rs-time">Time</Label>
              {resSlots.length>0 ? (
                <select id="rs-time" className="w-full border rounded h-10 px-2" value={resTime} onChange={(e)=>setResTime(e.target.value)}>
                  {resSlots.map(s => (<option key={s} value={s}>{s}</option>))}
                </select>
              ) : (
                <Input id="rs-time" type="time" value={resTime} onChange={(e)=>setResTime(e.target.value)} />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={()=>setShowRes(false)}>Cancel</Button>
            <Button disabled={submitting || !resApptId} onClick={async ()=>{
              try {
                setSubmitting(true);
                const res = await fetch(`/api/appointments/${resApptId}/reschedule`, { method:'POST', headers: authHeaders(), body: JSON.stringify({ date: resDate, time: resTime }) });
                if (!res.ok) { const t = await res.text(); throw new Error(t); }
                setShowRes(false);
                await refreshSchedule();
              } catch (e) { alert('Failed to reschedule'); }
              finally { setSubmitting(false); }
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lab Order Modal */}
      <Dialog open={showLab} onOpenChange={setShowLab}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Lab Tests</DialogTitle>
            <DialogDescription>Create a lab order for a patient</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="lab-patient">Patient ID</Label>
              <Input id="lab-patient" value={formPatientId} onChange={(e)=>setFormPatientId(e.target.value)} placeholder="e.g., 123" />
            </div>
            <div>
              <Label htmlFor="lab-tests">Tests (comma-separated)</Label>
              <Input id="lab-tests" value={formTests} onChange={(e)=>setFormTests(e.target.value)} placeholder="e.g., CBC, CMP, Lipid Panel" />
            </div>
            <div>
              <Label htmlFor="lab-notes">Notes</Label>
              <Textarea id="lab-notes" value={formNotes} onChange={(e)=>setFormNotes(e.target.value)} placeholder="Optional notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={()=>setShowLab(false)}>Cancel</Button>
            <Button disabled={submitting} onClick={async ()=>{
              try{
                setSubmitting(true);
                const token = localStorage.getItem('auth_token')||undefined;
                const headers:any = { 'Content-Type':'application/json' };
                if (token) headers.Authorization = `Bearer ${token}`;
                const tests = formTests.split(',').map(x=>x.trim()).filter(Boolean);
                const res = await fetch('/api/lab-orders',{ method:'POST', headers, body: JSON.stringify({ patient_id: Number(formPatientId), tests, notes: formNotes||undefined })});
                if(!res.ok){ const t = await res.text(); throw new Error(t); }
                setShowLab(false);
                setFormPatientId(""); setFormTests(""); setFormNotes("");
              }catch(e){ console.error('lab save error', e); toast({ variant:'destructive', title:'Failed to create lab order' }); }
              finally{ setSubmitting(false); }
            }}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DoctorDashboard;