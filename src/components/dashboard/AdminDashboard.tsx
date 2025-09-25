import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Calendar, DollarSign, TrendingUp, Activity, AlertTriangle, BarChart3, Settings } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const AdminDashboard = () => {
  const [users, setUsers] = useState<Array<{id:number; name:string; email:string; role:string;}>>([]);
  const [usersErr, setUsersErr] = useState<string | null>(null);
  const [usersLoading, setUsersLoading] = useState(true);
  const [patientsCount, setPatientsCount] = useState<number | null>(null);
  const [appointmentsToday, setAppointmentsToday] = useState<number | null>(null);
  const [finance, setFinance] = useState<{ total:number; pending:number; paid:number; todayTotal:number; count:number } | null>(null);
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
    (async () => {
      setLoading(true);
      setUsersLoading(true);
      setUsersErr(null);
      setError(null);
      try {
        const token = (() => { try { return localStorage.getItem('auth_token') || undefined; } catch { return undefined; } })();
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
        const today = new Date().toISOString().slice(0,10);
        const [uRes, pRes, aRes, fRes] = await Promise.all([
          fetch('/api/users', { headers }),
          fetch('/api/patients', { headers }),
          fetch('/api/appointments', { headers }),
          fetch('/api/metrics/finance', { headers }),
        ]);
        const [uData, pData, aData, fData] = await Promise.all([
          parseResponse(uRes), parseResponse(pRes), parseResponse(aRes), parseResponse(fRes)
        ]);
        setUsers(Array.isArray(uData) ? uData : []);
        setPatientsCount(Array.isArray(pData) ? pData.length : null);
        const appts = Array.isArray(aData) ? aData : [];
        setAppointmentsToday(appts.filter((x:any) => String(x.date) === today).length);
        setFinance(fData);
      } catch (e:any) {
        setError(e?.message || 'Failed to load admin metrics');
      } finally {
        setUsersLoading(false);
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      {/* Welcome section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Hospital Overview</h1>
          <p className="text-muted-foreground">Complete system statistics and management</p>
        </div>
        <Button className="bg-gradient-to-r from-primary to-primary/90" onClick={() => navigate('/settings')}>
          <Settings className="w-4 h-4 mr-2" />
          System Settings
        </Button>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{patientsCount ?? '—'}</p>
                <p className="text-sm text-muted-foreground">Patients</p>
              </div>
            </div>
            <div className="mt-6">
              <p className="text-sm font-medium">Recent Users</p>
              {usersLoading && <p className="text-xs text-muted-foreground mt-1">Loading…</p>}
              {usersErr && <p className="text-xs text-rose-700 mt-1">{usersErr}</p>}
              {!usersLoading && !usersErr && (
                <ul className="mt-2 space-y-2 text-sm">
                  {users.slice(0,5).map(u => (
                    <li key={u.id} className="flex items-center justify-between border rounded px-2 py-1">
                      <span className="truncate mr-2">{u.name} <span className="text-muted-foreground">({u.email})</span></span>
                      <Badge className="capitalize">{u.role}</Badge>
                    </li>
                  ))}
                  {users.length === 0 && (
                    <li className="text-muted-foreground">No users found.</li>
                  )}
                </ul>
              )}
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
                <p className="text-2xl font-bold">{appointmentsToday ?? '—'}</p>
                <p className="text-sm text-muted-foreground">Appointments Today</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{finance ? finance.total.toLocaleString() : '—'}</p>
                <p className="text-sm text-muted-foreground">Revenue (All Time)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <Calendar className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{finance ? finance.todayTotal.toLocaleString() : '—'}</p>
                <p className="text-sm text-muted-foreground">Revenue Today</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Department Performance */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Department Performance
            </CardTitle>
            <CardDescription>Efficiency metrics by department</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-sm text-muted-foreground">Connect department analytics later. For now use Occupancy and Finance metrics.</div>
          </CardContent>
        </Card>

        {/* System Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              System Alerts
            </CardTitle>
            <CardDescription>Important notifications</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">Hook system alerts to notifications or monitoring endpoints.</div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Management */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              User Management
            </CardTitle>
            <CardDescription>Manage system users and permissions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <Button variant="outline" className="h-16 flex-col space-y-1" onClick={() => navigate('/users')}>
                <Users className="w-5 h-5" />
                <span className="text-sm">Add Doctor</span>
              </Button>
              <Button variant="outline" className="h-16 flex-col space-y-1" onClick={() => navigate('/appointments')}>
                <Activity className="w-5 h-5" />
                <span className="text-sm">Staff Schedule</span>
              </Button>
              <Button variant="outline" className="h-16 flex-col space-y-1" onClick={() => navigate('/settings')}>
                <Settings className="w-5 h-5" />
                <span className="text-sm">Permissions</span>
              </Button>
              <Button variant="outline" className="h-16 flex-col space-y-1" onClick={() => navigate('/billing')}>
                <BarChart3 className="w-5 h-5" />
                <span className="text-sm">User Reports</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Financial Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Financial Overview
            </CardTitle>
            <CardDescription>Revenue and billing information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-accent/50 rounded-lg">
              <span className="text-sm font-medium">Total Revenue</span>
              <span className="text-lg font-bold text-green-600">{finance ? finance.total.toLocaleString() : '—'}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-accent/50 rounded-lg">
              <span className="text-sm font-medium">Pending</span>
              <span className="text-lg font-bold text-amber-600">{finance ? finance.pending.toLocaleString() : '—'}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-accent/50 rounded-lg">
              <span className="text-sm font-medium">Paid</span>
              <span className="text-lg font-bold text-blue-600">{finance ? finance.paid.toLocaleString() : '—'}</span>
            </div>
            <Button className="w-full" onClick={() => navigate('/billing')}>
              <BarChart3 className="w-4 h-4 mr-2" />
              View Financial Reports
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboard;