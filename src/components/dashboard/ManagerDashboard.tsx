import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { BarChart3, Activity, BedDouble, Users, Calendar, Package, DollarSign, FileBarChart, Settings, Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";

// Lightweight types for data we can already fetch from existing APIs
type Appt = { id:number; patient_id:number; date:string; time:string; notes?:string };
type Finance = { total:number; pending:number; paid:number; todayTotal:number; count:number };
type Occupancy = { totalBeds:number; occupiedBeds:number; freeBeds:number; byDepartment: { department:string; total:number; occupied:number; free:number }[] };
type InventoryItem = { id:number; name:string; quantity:number; reorder_threshold:number; unit?:string|null };
type Shift = { id:number; date:string; start_time:string; end_time:string; status:string; Staff?: { id:number; name:string; role:string } };

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        const [aRes, fRes, oRes, invRes, shRes] = await Promise.all([
          fetch('/api/appointments', { headers }),
          fetch('/api/metrics/finance', { headers }),
          fetch('/api/metrics/occupancy', { headers }),
          fetch('/api/inventory?low_stock=true', { headers }),
          fetch(`/api/shifts?date=${today}`, { headers }),
        ]);
        const [aData, fData, oData, invData, shData] = await Promise.all([
          parseResponse(aRes), parseResponse(fRes), parseResponse(oRes), parseResponse(invRes), parseResponse(shRes)
        ]);
        if (!active) return;
        setAppointments(Array.isArray(aData) ? aData.slice(0, 10) : []);
        setFinance(fData as Finance);
        setOccupancy(oData as Occupancy);
        setLowStock(Array.isArray(invData) ? invData : []);
        setShifts(Array.isArray(shData) ? shData.slice(0, 10) : []);
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
        <div className="flex items-center gap-2">
          <Button variant="outline"><Bell className="w-4 h-4 mr-2"/>Notifications</Button>
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
            <div className="text-sm text-muted-foreground">Use Billing page for detailed lists and exports.</div>
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
    </div>
  );
};

export default ManagerDashboard;
