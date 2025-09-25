import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Calendar, Clock, FileText, AlertCircle, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type DocAppt = { id:number; doctor_id?:number; patient_id:number; date:string; time:string; notes?:string };

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
        const res = await fetch(`/api/appointments?doctor_id=${userId}`, { headers });
        const data = await parseResponse(res);
        if (!active) return;
        setSchedule(Array.isArray(data) ? data.slice(0, 10) : []);
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
  return (
    <div className="space-y-6">
      {/* Welcome section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Good morning, {displayName}</h1>
          <p className="text-muted-foreground">You have {schedule.length} appointments scheduled</p>
        </div>
        <Button className="bg-gradient-to-r from-primary to-primary/90" onClick={() => navigate('/patients')}>
          <Users className="w-4 h-4 mr-2" />
          View All Patients
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
                <p className="text-2xl font-bold">156</p>
                <p className="text-sm text-muted-foreground">Total Patients</p>
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
                <p className="text-2xl font-bold">94%</p>
                <p className="text-sm text-muted-foreground">Patient Satisfaction</p>
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
                <p className="text-2xl font-bold">3</p>
                <p className="text-sm text-muted-foreground">Urgent Cases</p>
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
            <CardDescription>Recently treated patients</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { name: "Alice Brown", condition: "Hypertension", lastVisit: "Yesterday", status: "stable" },
              { name: "Robert Wilson", condition: "Diabetes", lastVisit: "2 days ago", status: "improving" },
              { name: "Lisa Garcia", condition: "Migraine", lastVisit: "1 week ago", status: "follow-up needed" },
              { name: "David Lee", condition: "Arthritis", lastVisit: "2 weeks ago", status: "stable" },
            ].map((patient, index) => (
              <div key={index} className="flex items-center justify-between p-4 bg-accent/50 rounded-lg hover:bg-accent/70 transition-colors cursor-pointer">
                <div className="flex items-center space-x-3">
                  <Avatar className="w-10 h-10">
                    <AvatarImage src="" />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {patient.name.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{patient.name}</p>
                    <p className="text-sm text-muted-foreground">{patient.condition}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">{patient.lastVisit}</p>
                  <Badge variant="outline" className="mt-1 text-xs">
                    {patient.status}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

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
            <Button variant="outline" className="h-20 flex-col space-y-2" onClick={() => navigate('/records')}>
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
            <Button variant="outline" className="h-20 flex-col space-y-2">
              <AlertCircle className="w-6 h-6" />
              <span className="text-sm">Emergency Protocol</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DoctorDashboard;