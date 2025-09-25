import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, Clock, FileText, CreditCard, User, Activity } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

type Appointment = { id:number; patient_id:number; date:string; time:string; notes?:string };
type MedRecord = { id:number; patient_id:number; record_type:string; date:string; notes?:string };
type Invoice = { id:number; patient_id:number; amount:string|number; date:string; status:string };

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

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
        const [aRes, rRes, iRes] = await Promise.all([
          fetch(`/api/appointments?patient_id=${patient.id}`, { headers: authHeaders }),
          fetch(`/api/records?patient_id=${patient.id}`, { headers: authHeaders }),
          fetch(`/api/invoices?patient_id=${patient.id}`, { headers: authHeaders }),
        ]);
        const [aData, rData, iData] = await Promise.all([
          parseResponse(aRes),
          parseResponse(rRes),
          parseResponse(iRes),
        ]);
        if (!isMounted) return;
        setAppts(Array.isArray(aData) ? aData.slice(0, 5) : []);
        setRecords(Array.isArray(rData) ? rData.slice(0, 5) : []);
        setInvoices(Array.isArray(iData) ? iData.slice(0, 5) : []);
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
  return (
    <div className="space-y-6">
      {/* Welcome section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Welcome back, {displayName}</h1>
          <p className="text-muted-foreground">Here's your health overview</p>
        </div>
        <Button className="bg-gradient-to-r from-primary to-primary/90" onClick={() => navigate('/appointments')}>
          <Calendar className="w-4 h-4 mr-2" />
          Book Appointment
        </Button>
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