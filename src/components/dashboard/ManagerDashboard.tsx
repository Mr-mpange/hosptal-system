import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import NotificationsBell from "@/components/NotificationsBell";
import { BarChart3, Activity, BedDouble, Users, Calendar, Package, DollarSign, FileBarChart, Settings, Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Lightweight types for data we can already fetch from existing APIs
type Appt = { id:number; patient_id:number; date:string; time:string; notes?:string };
type Finance = { total:number; pending:number; paid:number; todayTotal:number; count:number };
type Occupancy = { totalBeds:number; occupiedBeds:number; freeBeds:number; byDepartment: { department:string; total:number; occupied:number; free:number }[] };
type InventoryItem = { id:number; name:string; quantity:number; reorder_threshold:number; unit?:string|null };
type Shift = { id:number; date:string; start_time:string; end_time:string; status:string; Staff?: { id:number; name:string; role:string } };
type Attendance = { id:number; date:string; status:string; clock_in?:string|null; clock_out?:string|null; Staff?: { id:number; name:string; role:string; department_id?:number|null } };
type Staff = { id:number; name:string; role:string; department_id?:number|null };
type Department = { id:number; name:string };

const ManagerDashboard = () => {
  const navigate = useNavigate();
  let displayName = "Manager";
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('auth_user') : null;
    if (raw) {
      const u = JSON.parse(raw);
      if (u?.name) displayName = u.name;
    }
  } catch {}

  const [appointments, setAppointments] = useState<Appt[]>([]);
  const [finance, setFinance] = useState<Finance | null>(null);
  const [occupancy, setOccupancy] = useState<Occupancy | null>(null);
  const [lowStock, setLowStock] = useState<InventoryItem[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [plannerDate, setPlannerDate] = useState<string>(new Date().toISOString().slice(0,10));
  const [newShift, setNewShift] = useState<{staff_id:string; start_time:string; end_time:string}>({ staff_id: "", start_time: "08:00", end_time: "16:00" });
  const [saving, setSaving] = useState(false);

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
      setLoading(true); setError(null);
      try {
        const token = (() => { try { return localStorage.getItem('auth_token') || undefined; } catch { return undefined; } })();
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
        const today = new Date().toISOString().slice(0,10);
        const [aRes, fRes, oRes, invRes, shRes, atRes, stRes, depRes] = await Promise.all([
          fetch('/api/appointments', { headers }),
          fetch('/api/metrics/finance', { headers }),
          fetch('/api/metrics/occupancy', { headers }),
          fetch('/api/inventory?low_stock=true', { headers }),
          fetch(`/api/shifts?date=${today}`, { headers }),
          fetch(`/api/attendance?date=${today}`, { headers }),
          fetch('/api/staff', { headers }),
          fetch('/api/departments', { headers }),
        ]);
        const [aData, fData, oData, invData, shData, atData, stData, depData] = await Promise.all([
          parseResponse(aRes), parseResponse(fRes), parseResponse(oRes), parseResponse(invRes), parseResponse(shRes), parseResponse(atRes), parseResponse(stRes), parseResponse(depRes)
        ]);
        if (!active) return;
        setAppointments(Array.isArray(aData) ? aData.slice(0, 10) : []);
        setFinance(fData as Finance);
        setOccupancy(oData as Occupancy);
        setLowStock(Array.isArray(invData) ? invData : []);
        setShifts(Array.isArray(shData) ? shData.slice(0, 10) : []);
        setAttendance(Array.isArray(atData) ? atData.slice(0, 10) : []);
        setStaff(Array.isArray(stData) ? stData : []);
        setDepartments(Array.isArray(depData) ? depData : []);
      } catch (e:any) {
        if (!active) return;
        setError(e?.message || 'Failed to load dashboard data');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);
  const revenueStats = useMemo(() => ({
    total: finance?.total || 0,
    todayTotal: finance?.todayTotal || 0,
    pending: finance?.pending || 0,
    paid: finance?.paid || 0,
  }), [finance]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Welcome, {displayName}</h1>
          <p className="text-muted-foreground">Operational overview at a glance</p>
        </div>

      {/* Attendance (today) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Activity className="w-5 h-5"/>Attendance Today</CardTitle>
          <CardDescription>Presence by staff</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-64 overflow-auto">
            {attendance.map(a => (
              <div key={a.id} className="flex items-center justify-between p-3 rounded-md border">
                <div>
                  <p className="font-medium">{a.Staff?.name || `Staff #${a.id}`}</p>
                  <p className="text-xs text-muted-foreground">{a.clock_in || '--:--'} - {a.clock_out || '--:--'} • {a.Staff?.role}</p>
                </div>
                <Badge variant="outline" className="capitalize">{a.status}</Badge>
              </div>
            ))}
            {attendance.length === 0 && <div className="text-sm text-muted-foreground">No attendance records for today.</div>}
          </div>
        </CardContent>
      </Card>
        <div className="flex items-center gap-2">
          <NotificationsBell />
          <Button className="bg-gradient-to-r from-primary to-primary/90"><Settings className="w-4 h-4 mr-2"/>Manage</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Appointments (upcoming)</p>
              <p className="text-2xl font-bold">{appointments.length}</p>
            </div>
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
              <Calendar className="w-6 h-6 text-primary"/>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Revenue (today)</p>
              <p className="text-2xl font-bold">{revenueStats.todayTotal.toLocaleString()}</p>
            </div>
            <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-emerald-600"/>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Revenue (paid)</p>
              <p className="text-2xl font-bold">{revenueStats.paid.toLocaleString()}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-blue-600"/>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Revenue (pending)</p>
              <p className="text-2xl font-bold">{revenueStats.pending.toLocaleString()}</p>
            </div>
            <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6 text-amber-600"/>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hospital Occupancy */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BedDouble className="w-5 h-5"/>Hospital Occupancy</CardTitle>
            <CardDescription>Occupied vs available beds</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 bg-accent/50 rounded-lg">
              <div className="flex items-center gap-3">
                <BedDouble className="w-5 h-5"/>
                <div>
                  <p className="font-medium">Occupied Beds</p>
                  <p className="text-sm text-muted-foreground">{occupancy ? `${occupancy.occupiedBeds} of ${occupancy.totalBeds}` : '—'}</p>
                </div>
              </div>
              <Badge variant="secondary">{occupancy ? `${Math.max(occupancy.freeBeds,0)} free` : '—'}</Badge>
            </div>
            {occupancy && (
              <div className="mt-4 space-y-2 max-h-48 overflow-auto">
                {occupancy.byDepartment.map((d) => (
                  <div key={d.department} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{d.department}</span>
                    <span>{d.occupied}/{d.total} occupied</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Staff shifts today */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5"/>Staff Shifts Today</CardTitle>
            <CardDescription>Scheduled staff</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-56 overflow-auto">
              {shifts.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-md border">
                  <div>
                    <p className="font-medium">{s.Staff?.name || 'Staff #' + s.id}</p>
                    <p className="text-xs text-muted-foreground">{s.start_time} - {s.end_time} • {s.Staff?.role}</p>
                  </div>
                  <Badge variant="outline" className="text-xs capitalize">{s.status}</Badge>
                </div>
              ))}
              {shifts.length === 0 && <div className="text-sm text-muted-foreground">No shifts scheduled for today.</div>}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Financial overview (API) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><DollarSign className="w-5 h-5"/>Financial Overview</CardTitle>
            <CardDescription>Aggregated from invoices</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20">
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-xl font-semibold">{revenueStats.total.toLocaleString()}</p>
              </div>
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20">
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-xl font-semibold">{revenueStats.pending.toLocaleString()}</p>
              </div>
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20">
                <p className="text-sm text-muted-foreground">Paid</p>
                <p className="text-xl font-semibold">{revenueStats.paid.toLocaleString()}</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50">
                <p className="text-sm text-muted-foreground">Today</p>
                <p className="text-xl font-semibold">{revenueStats.todayTotal.toLocaleString()}</p>
              </div>
            </div>
            <Separator />
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={()=>{
                const today = new Date().toISOString().slice(0,10);
                window.location.href = `/api/reports/finance.csv?from=${today}&to=${today}`;
              }}>Export Today (CSV)</Button>
              <Button variant="outline" size="sm" onClick={()=>{
                const now = new Date();
                const from = new Date(now.getTime()-7*24*60*60*1000).toISOString().slice(0,10);
                const to = now.toISOString().slice(0,10);
                window.location.href = `/api/reports/finance.csv?from=${from}&to=${to}`;
              }}>Export 7 Days (CSV)</Button>
            </div>
          </CardContent>
        </Card>

        {/* Inventory low stock */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Package className="w-5 h-5"/>Inventory & Supplies</CardTitle>
            <CardDescription>Low stock alerts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-56 overflow-auto">
              {lowStock.map(item => (
                <div key={item.id} className="flex items-center justify-between p-3 rounded-md border">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">Threshold {item.reorder_threshold}{item.unit ? ` ${item.unit}` : ''}</p>
                  </div>
                  <Badge variant="destructive">{item.quantity}{item.unit ? ` ${item.unit}` : ''}</Badge>
                </div>
              ))}
              {lowStock.length === 0 && <div className="text-sm text-muted-foreground">No low stock items.</div>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Patient flow / admissions placeholder */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileBarChart className="w-5 h-5"/>Patient Flow / Admissions</CardTitle>
          <CardDescription>Current admitted patients and discharges (placeholder)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-accent/50 rounded-lg">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5"/>
              <div>
                <p className="font-medium">Admitted</p>
                <p className="text-sm text-muted-foreground">Requires admissions/discharge models</p>
              </div>
            </div>
            <Badge variant="secondary">—</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions (Manager-specific) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Quick Actions
          </CardTitle>
          <CardDescription>Manager tools</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button variant="outline" className="h-20 flex-col space-y-2" onClick={() => navigate('/billing')}>
              <DollarSign className="w-6 h-6" />
              <span className="text-sm">Review Finance</span>
            </Button>
            <Button variant="outline" className="h-20 flex-col space-y-2" onClick={() => navigate('/appointments')}>
              <Calendar className="w-6 h-6" />
              <span className="text-sm">Manage Shifts</span>
            </Button>
            <Button variant="outline" className="h-20 flex-col space-y-2" onClick={() => navigate('/patients')}>
              <Users className="w-6 h-6" />
              <span className="text-sm">Patients</span>
            </Button>
            <Button variant="outline" className="h-20 flex-col space-y-2" onClick={() => navigate('/settings')}>
              <Settings className="w-6 h-6" />
              <span className="text-sm">Settings</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Shift Planner */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Calendar className="w-5 h-5"/>Shift Planner</CardTitle>
          <CardDescription>Create and review shifts by day</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3">
            <div>
              <Label htmlFor="planner-date">Date</Label>
              <Input id="planner-date" type="date" value={plannerDate} onChange={async (e)=>{
                const d = e.target.value; setPlannerDate(d);
                try {
                  const token = localStorage.getItem('auth_token') || undefined;
                  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
                  const res = await fetch(`/api/shifts?date=${d}`, { headers });
                  const data = await res.json();
                  setShifts(Array.isArray(data) ? data : []);
                } catch {}
              }} />
            </div>
            <div>
              <Label htmlFor="planner-staff">Staff</Label>
              <select id="planner-staff" className="border rounded h-10 px-2" value={newShift.staff_id} onChange={(e)=>setNewShift(s=>({ ...s, staff_id: e.target.value }))}>
                <option value="">Select staff</option>
                {staff.map(s=> (
                  <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="planner-start">Start</Label>
              <Input id="planner-start" type="time" value={newShift.start_time} onChange={(e)=>setNewShift(s=>({ ...s, start_time: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="planner-end">End</Label>
              <Input id="planner-end" type="time" value={newShift.end_time} onChange={(e)=>setNewShift(s=>({ ...s, end_time: e.target.value }))} />
            </div>
            <Button disabled={saving || !newShift.staff_id} onClick={async ()=>{
              try{
                setSaving(true);
                const token = localStorage.getItem('auth_token')||undefined;
                const headers:any = { 'Content-Type':'application/json' };
                if (token) headers.Authorization = `Bearer ${token}`;
                const res = await fetch('/api/shifts', { method:'POST', headers, body: JSON.stringify({ staff_id: Number(newShift.staff_id), date: plannerDate, start_time: newShift.start_time, end_time: newShift.end_time }) });
                if(!res.ok){ const t = await res.text(); throw new Error(t); }
                // reload list
                const listRes = await fetch(`/api/shifts?date=${plannerDate}`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
                const listData = await listRes.json();
                setShifts(Array.isArray(listData) ? listData : []);
              }catch(e){ console.error('create shift error', e); alert('Failed to create shift'); }
              finally{ setSaving(false); }
            }}>Create Shift</Button>
          </div>

          <div className="space-y-2 max-h-64 overflow-auto">
            {shifts.map(s => (
              <div key={s.id} className="flex items-center justify-between p-3 rounded-md border gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{s.Staff?.name || `Staff #${s.id}`}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.start_time} - {s.end_time} • {s.Staff?.role}</p>
                </div>
                <div className="flex items-center gap-2">
                  <select className="border rounded h-8 px-2 text-sm capitalize" defaultValue={s.status} onChange={async (e)=>{
                    try{
                      const token = localStorage.getItem('auth_token')||undefined;
                      const headers:any = { 'Content-Type':'application/json' };
                      if (token) headers.Authorization = `Bearer ${token}`;
                      const res = await fetch(`/api/shifts/${s.id}`, { method:'PUT', headers, body: JSON.stringify({ status: e.target.value }) });
                      if(!res.ok){ const t = await res.text(); throw new Error(t); }
                    }catch(err){ console.error('update shift error', err); alert('Failed to update shift'); }
                  }}>
                    <option value="scheduled">scheduled</option>
                    <option value="completed">completed</option>
                    <option value="missed">missed</option>
                  </select>
                  <Button variant="outline" size="sm" onClick={async ()=>{
                    if(!confirm('Delete this shift?')) return;
                    try{
                      const token = localStorage.getItem('auth_token')||undefined;
                      const headers:any = token ? { Authorization: `Bearer ${token}` } : undefined;
                      const res = await fetch(`/api/shifts/${s.id}`, { method:'DELETE', headers });
                      if(!res.ok){ const t = await res.text(); throw new Error(t); }
                      // remove locally
                      setShifts(prev => prev.filter(x=>x.id !== s.id));
                    }catch(err){ console.error('delete shift error', err); alert('Failed to delete shift'); }
                  }}>Delete</Button>
                </div>
              </div>
            ))}
            {shifts.length === 0 && <div className="text-sm text-muted-foreground">No shifts for selected day.</div>}
          </div>
        </CardContent>
      </Card>

      {/* Department Assignment */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5"/>Department Assignment</CardTitle>
          <CardDescription>Assign staff to departments</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-80 overflow-auto">
            {staff.map(s => (
              <div key={s.id} className="flex items-center justify-between gap-4 p-3 border rounded">
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.role}</p>
                </div>
                <div className="flex items-center gap-2">
                  <select className="border rounded h-9 px-2" defaultValue={s.department_id || ''} onChange={async (e)=>{
                    const depId = e.target.value ? Number(e.target.value) : null;
                    try{
                      const token = localStorage.getItem('auth_token')||undefined;
                      const headers:any = { 'Content-Type':'application/json' };
                      if (token) headers.Authorization = `Bearer ${token}`;
                      const res = await fetch(`/api/staff/${s.id}/department`, { method:'PUT', headers, body: JSON.stringify({ department_id: depId }) });
                      if(!res.ok){ const t = await res.text(); throw new Error(t); }
                    }catch(err){ console.error('assign dep error', err); alert('Failed to update department'); }
                  }}>
                    <option value="">Unassigned</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
            {staff.length === 0 && <div className="text-sm text-muted-foreground">No staff records.</div>}
          </div>
        </CardContent>
      </Card>

      {/* Reports */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileBarChart className="w-5 h-5"/>Reports</CardTitle>
          <CardDescription>Export finance data by date range</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <Label htmlFor="rep-from">From</Label>
              <Input id="rep-from" type="date" defaultValue={new Date(Date.now()-7*24*60*60*1000).toISOString().slice(0,10)} />
            </div>
            <div>
              <Label htmlFor="rep-to">To</Label>
              <Input id="rep-to" type="date" defaultValue={new Date().toISOString().slice(0,10)} />
            </div>
            <Button variant="outline" onClick={()=>{
              const from = (document.getElementById('rep-from') as HTMLInputElement)?.value;
              const to = (document.getElementById('rep-to') as HTMLInputElement)?.value;
              if (!from || !to) return;
              window.location.href = `/api/reports/finance.csv?from=${from}&to=${to}`;
            }}>Export CSV</Button>
            <Button variant="outline" onClick={()=>{
              window.location.href = `/api/reports/occupancy.csv`;
            }}>Export Occupancy CSV</Button>
            <Button variant="outline" onClick={()=>{
              const from = (document.getElementById('rep-from') as HTMLInputElement)?.value;
              const to = (document.getElementById('rep-to') as HTMLInputElement)?.value;
              if (!from || !to) return;
              window.location.href = `/api/reports/admissions.csv?from=${from}&to=${to}`;
            }}>Export Admissions CSV</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ManagerDashboard;
