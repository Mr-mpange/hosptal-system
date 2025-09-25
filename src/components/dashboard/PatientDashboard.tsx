import NotificationsBell from "@/components/NotificationsBell";
import { useToast } from "@/components/ui/use-toast";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, Clock, FileText, CreditCard, User, Activity, FlaskConical } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Appointment = { id:number; patient_id:number; date:string; time:string; notes?:string };
type MedRecord = { id:number; patient_id:number; record_type:string; date:string; notes?:string };
type Invoice = { id:number; patient_id:number; amount:string|number; date:string; status:string };
type LabResult = { id:number; patient_id:number; test_type:string; value?:string|null; unit?:string|null; flag:'normal'|'abnormal'|'critical'; date:string };

const PatientDashboard = () => {
  let displayName = "User";
  let userId: number | undefined = undefined;
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('auth_user') : null;
    if (raw) {
      const u = JSON.parse(raw);
      if (u?.name) displayName = u.name;
      if (u?.id) userId = Number(u.id);
    }
  } catch {}

  const [patientId, setPatientId] = useState<number | null>(null);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [records, setRecords] = useState<MedRecord[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [labs, setLabs] = useState<LabResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [showBook, setShowBook] = useState(false);
  const [doctors, setDoctors] = useState<Array<{id:number;name:string;email:string}>>([]);
  const [bookDoctorId, setBookDoctorId] = useState<string>("");
  const [bookDate, setBookDate] = useState<string>(new Date().toISOString().slice(0,10));
  const [bookTime, setBookTime] = useState<string>("09:00");
  const [submitting, setSubmitting] = useState(false);
  const [slots, setSlots] = useState<string[]>([]);
  const [notifCount, setNotifCount] = useState<number>(0);
  const { toast } = useToast();

  const parseResponse = async (res: Response) => {
    const ct = res.headers.get("content-type") || "";
    let data: any = null;
    if (ct.includes("application/json")) data = await res.json();
    else { const text = await res.text(); try { data = JSON.parse(text); } catch { throw new Error(text || "Non-JSON response"); } }
    if (!res.ok) throw new Error(data?.message || data?.details || `HTTP ${res.status}`);
    return data;
  };

  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (!userId) { setLoading(false); return; }
      setLoading(true); setError(null);
      try {
        const token = (() => { try { return localStorage.getItem('auth_token') || undefined; } catch { return undefined; } })();
        const authHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;
        // 1) Find patient by user id
        const pRes = await fetch(`/api/patients/by-user/${userId}`, { headers: authHeaders });
        const patient = await parseResponse(pRes);
        if (!isMounted) return;
        setPatientId(patient.id);

        // 2) Load datasets in parallel
        const [aRes, rRes, iRes, lRes] = await Promise.all([
          fetch(`/api/appointments?patient_id=${patient.id}`, { headers: authHeaders }),
          fetch(`/api/records?patient_id=${patient.id}`, { headers: authHeaders }),
          fetch(`/api/invoices?patient_id=${patient.id}`, { headers: authHeaders }),
          fetch(`/api/labs`, { headers: authHeaders }),
        ]);
        const [aData, rData, iData, lData] = await Promise.all([
          parseResponse(aRes),
          parseResponse(rRes),
          parseResponse(iRes),
          parseResponse(lRes),
        ]);
        if (!isMounted) return;
        setAppts(Array.isArray(aData) ? aData.slice(0, 5) : []);
        setRecords(Array.isArray(rData) ? rData.slice(0, 5) : []);
        setInvoices(Array.isArray(iData) ? iData.slice(0, 5) : []);
        setLabs(Array.isArray(lData) ? lData.slice(0, 5) : []);
      } catch (e:any) {
        if (!isMounted) return;
        setError(e?.message || 'Failed to load your data');
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => { isMounted = false; };
  // userId only
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Load available slots when doctor/date changes
  useEffect(() => {
    (async () => {
      try {
        if (!bookDoctorId || !bookDate) { setSlots([]); return; }
        const token = (() => { try { return localStorage.getItem('auth_token') || undefined; } catch { return undefined; } })();
        const headers:any = token ? { Authorization: `Bearer ${token}` } : undefined;
        const res = await fetch(`/api/appointments/available?doctor_id=${bookDoctorId}&date=${bookDate}`, { headers });
        if (!res.ok) { setSlots([]); return; }
        const data = await res.json();
        setSlots(Array.isArray(data) ? data : []);
        if (Array.isArray(data) && data.length > 0) setBookTime(String(data[0]));
      } catch { setSlots([]); }
    })();
  }, [bookDoctorId, bookDate]);

  // Lightweight notifications polling (every 60s)
  useEffect(() => {
    let timer:any;
    const load = async () => {
      try {
        const token = localStorage.getItem('auth_token')||undefined;
        const headers:any = token ? { Authorization: `Bearer ${token}` } : undefined;
        const res = await fetch('/api/notifications', { headers });
        const data = await res.json();
        setNotifCount(Array.isArray(data) ? data.length : 0);
      } catch { /* ignore */ }
      timer = setTimeout(load, 60000);
    };
    load();
    return () => { if (timer) clearTimeout(timer); };
  }, []);
  return (
    <div className="space-y-6">
      {/* Welcome section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Welcome back, {displayName}</h1>
          <p className="text-muted-foreground">Here's your health overview</p>
          {notifCount>0 && (<p className="text-xs mt-1"><span className="inline-flex items-center px-2 py-0.5 rounded bg-primary/10 text-primary">{notifCount} notifications</span></p>)}
        </div>
        <div className="flex items-center gap-2">
        <NotificationsBell />
        <Button className="bg-gradient-to-r from-primary to-primary/90" onClick={async () => {
          try {
            setShowBook(true);
            const token = localStorage.getItem('auth_token')||undefined;
            const headers:any = token ? { Authorization: `Bearer ${token}` } : undefined;
            const res = await fetch('/api/doctors', { headers });
            const data = await res.json();
            setDoctors(Array.isArray(data) ? data : []);
          } catch {}
        }}>
          <Calendar className="w-4 h-4 mr-2" />
          Book Appointment
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
                <p className="text-2xl font-bold">{appts.length}</p>
                <p className="text-sm text-muted-foreground">Upcoming Appointments</p>
              </div>
            </div>
          </CardContent>
        </Card>

      {/* Book Appointment Modal */}
      <Dialog open={showBook} onOpenChange={setShowBook}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Book Appointment</DialogTitle>
            <DialogDescription>Select doctor, date and time</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label htmlFor="bk-doc">Doctor</Label>
              <select id="bk-doc" className="w-full border rounded h-10 px-2" value={bookDoctorId} onChange={(e)=>setBookDoctorId(e.target.value)}>
                <option value="">Any available</option>
                {doctors.map(d => (
                  <option key={d.id} value={d.id}>{d.name} ({d.email})</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="bk-date">Date</Label>
              <Input id="bk-date" type="date" value={bookDate} onChange={(e)=>setBookDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="bk-time">Time</Label>
              {slots.length>0 ? (
                <select id="bk-time" className="w-full border rounded h-10 px-2" value={bookTime} onChange={(e)=>setBookTime(e.target.value)}>
                  {slots.map(s => (<option key={s} value={s}>{s}</option>))}
                </select>
              ) : (
                <Input id="bk-time" type="time" value={bookTime} onChange={(e)=>setBookTime(e.target.value)} />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={()=>setShowBook(false)}>Cancel</Button>
            <Button disabled={submitting} onClick={async ()=>{
              try{
                setSubmitting(true);
                const token = localStorage.getItem('auth_token')||undefined;
                const headers:any = { 'Content-Type':'application/json' };
                if (token) headers.Authorization = `Bearer ${token}`;
                const body:any = { date: bookDate, time: bookTime };
                if (bookDoctorId) body.doctor_id = Number(bookDoctorId);
                const res = await fetch('/api/appointments', { method:'POST', headers, body: JSON.stringify(body) });
                if (!res.ok) { const t = await res.text(); throw new Error(t); }
                // refresh appointments
                try {
                  const authHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;
                  const me = await fetch(`/api/patients/by-user/${userId}`, { headers: authHeaders });
                  const meData = await me.json();
                  const aRes = await fetch(`/api/appointments?patient_id=${meData?.id}`, { headers: authHeaders });
                  const aData = await aRes.json();
                  setAppts(Array.isArray(aData) ? aData.slice(0,5) : []);
                } catch {}
                setShowBook(false);
                toast({ title:'Appointment requested', description:`${bookDate} ${bookTime}` });
              }catch(e:any){ console.error('book appt error', e); toast({ variant:'destructive', title:'Failed to book appointment', description: e?.message||'Slot may be unavailable' }); }
              finally{ setSubmitting(false); }
            }}>Book</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lab Results */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5" />
            Lab Results
          </CardTitle>
          <CardDescription>Your most recent lab tests</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
            {error && <div className="text-sm text-rose-700">{error}</div>}
            {!loading && !error && labs.map(l => (
              <div key={l.id} className="flex items-center justify-between p-3 border rounded">
                <div>
                  <p className="font-medium">{l.test_type}</p>
                  <p className="text-xs text-muted-foreground">{l.date} • {l.value || ''} {l.unit || ''}</p>
                </div>
                <Badge variant={l.flag === 'normal' ? 'outline' : l.flag === 'abnormal' ? 'secondary' : 'destructive'} className="capitalize">{l.flag}</Badge>
              </div>
            ))}
            {!loading && !error && labs.length === 0 && (
              <div className="text-sm text-muted-foreground">No lab results available.</div>
            )}
          </div>
        </CardContent>
      </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{records.length}</p>
                <p className="text-sm text-muted-foreground">Medical Records</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Activity className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">98%</p>
                <p className="text-sm text-muted-foreground">Health Score</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <CreditCard className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{invoices.reduce((sum, inv) => sum + Number(inv.amount || 0), 0).toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">Outstanding Bills</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Appointments */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Upcoming Appointments
            </CardTitle>
            <CardDescription>Your scheduled visits</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
            {error && <div className="text-sm text-rose-700">{error}</div>}
            {!loading && !error && appts.map((a) => (
              <div key={a.id} className="flex items-center justify-between p-4 bg-accent/50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Appointment</p>
                    <p className="text-sm text-muted-foreground">Notes: {a.notes || '—'}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium">{a.date}</p>
                  <p className="text-sm text-muted-foreground">{a.time}</p>
                  <Badge className="mt-1">scheduled</Badge>
                </div>
              </div>
            ))}
            {!loading && !error && appts.length === 0 && (
              <div className="text-sm text-muted-foreground">No upcoming appointments.</div>
            )}
          </CardContent>
        </Card>

        {/* Health Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Health Overview
            </CardTitle>
            <CardDescription>Your current health metrics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>Blood Pressure</span>
                <span className="text-green-600 font-medium">Normal</span>
              </div>
              <Progress value={85} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">120/80 mmHg</p>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>Cholesterol</span>
                <span className="text-yellow-600 font-medium">Moderate</span>
              </div>
              <Progress value={65} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">180 mg/dL</p>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>Blood Sugar</span>
                <span className="text-green-600 font-medium">Good</span>
              </div>
              <Progress value={90} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">95 mg/dL</p>
            </div>

            <Button variant="outline" className="w-full" onClick={() => navigate('/records')}>
              <FileText className="w-4 h-4 mr-2" />
              View Full Report
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Recent Activity
          </CardTitle>
          <CardDescription>Your recent medical activities</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
            {error && <div className="text-sm text-rose-700">{error}</div>}
            {!loading && !error && records.map((r) => (
              <div key={r.id} className="flex items-center space-x-3 p-3 hover:bg-accent/50 rounded-lg transition-colors">
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                  <FileText className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{r.record_type}</p>
                  <p className="text-xs text-muted-foreground">{r.date} • {r.notes || '—'}</p>
                </div>
              </div>
            ))}
            {!loading && !error && records.length === 0 && (
              <div className="text-sm text-muted-foreground">No recent records.</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PatientDashboard;