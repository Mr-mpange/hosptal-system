import { useEffect, useState } from "react";
import { Users, Calendar, DollarSign, TrendingUp, Activity, AlertTriangle, BarChart3, Settings } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const AdminDashboard = () => {
  const [users, setUsers] = useState<Array<{id:number; name:string; email:string; role:string;}>>([]);
  const [usersErr, setUsersErr] = useState<string | null>(null);
  const [usersLoading, setUsersLoading] = useState(true);

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
      setUsersLoading(true);
      setUsersErr(null);
      try {
        const res = await fetch('/api/users');
        const data = await parseResponse(res);
        setUsers(Array.isArray(data) ? data : []);
      } catch (e:any) {
        setUsersErr(e?.message || 'Failed to load users');
      } finally {
        setUsersLoading(false);
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
        <Button className="bg-gradient-to-r from-primary to-primary/90">
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
                <p className="text-2xl font-bold">1,234</p>
                <p className="text-sm text-muted-foreground">Total Patients</p>
                <p className="text-xs text-green-600">+12% this month</p>
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
                <p className="text-2xl font-bold">45</p>
                <p className="text-sm text-muted-foreground">Active Doctors</p>
                <p className="text-xs text-green-600">+2 new this week</p>
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
                <p className="text-2xl font-bold">$85.2K</p>
                <p className="text-sm text-muted-foreground">Monthly Revenue</p>
                <p className="text-xs text-green-600">+8% vs last month</p>
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
                <p className="text-2xl font-bold">156</p>
                <p className="text-sm text-muted-foreground">Today's Appointments</p>
                <p className="text-xs text-blue-600">92% capacity</p>
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
            {[
              { name: "Cardiology", patients: 45, efficiency: 94, revenue: "$25,400" },
              { name: "Neurology", patients: 32, efficiency: 88, revenue: "$18,200" },
              { name: "Orthopedics", patients: 38, efficiency: 91, revenue: "$22,100" },
              { name: "Emergency", patients: 67, efficiency: 85, revenue: "$19,500" },
              { name: "Pediatrics", patients: 28, efficiency: 96, revenue: "$14,800" },
            ].map((dept, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{dept.name}</span>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{dept.patients} patients</span>
                    <span>{dept.revenue}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Progress value={dept.efficiency} className="flex-1 h-2" />
                  <span className="text-sm font-medium w-12">{dept.efficiency}%</span>
                </div>
              </div>
            ))}
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
            {[
              { 
                type: "critical", 
                message: "Server load at 95%", 
                time: "5 min ago",
                action: "Check servers"
              },
              { 
                type: "warning", 
                message: "Low blood bank inventory", 
                time: "1 hour ago",
                action: "Contact blood bank"
              },
              { 
                type: "info", 
                message: "Scheduled maintenance tonight", 
                time: "2 hours ago",
                action: "Prepare notification"
              },
              { 
                type: "success", 
                message: "Monthly report generated", 
                time: "1 day ago",
                action: "Review report"
              },
            ].map((alert, index) => (
              <div key={index} className="p-3 border rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <Badge 
                    variant={
                      alert.type === "critical" ? "destructive" :
                      alert.type === "warning" ? "default" :
                      alert.type === "info" ? "secondary" : "outline"
                    }
                  >
                    {alert.type}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{alert.time}</span>
                </div>
                <p className="text-sm font-medium">{alert.message}</p>
                <Button variant="outline" size="sm" className="w-full text-xs">
                  {alert.action}
                </Button>
              </div>
            ))}
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
              <Button variant="outline" className="h-16 flex-col space-y-1">
                <Users className="w-5 h-5" />
                <span className="text-sm">Add Doctor</span>
              </Button>
              <Button variant="outline" className="h-16 flex-col space-y-1">
                <Activity className="w-5 h-5" />
                <span className="text-sm">Staff Schedule</span>
              </Button>
              <Button variant="outline" className="h-16 flex-col space-y-1">
                <Settings className="w-5 h-5" />
                <span className="text-sm">Permissions</span>
              </Button>
              <Button variant="outline" className="h-16 flex-col space-y-1">
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
              <span className="text-sm font-medium">Outstanding Bills</span>
              <span className="text-lg font-bold text-orange-600">$45,280</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-accent/50 rounded-lg">
              <span className="text-sm font-medium">Collected This Month</span>
              <span className="text-lg font-bold text-green-600">$85,200</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-accent/50 rounded-lg">
              <span className="text-sm font-medium">Insurance Claims</span>
              <span className="text-lg font-bold text-blue-600">$32,150</span>
            </div>
            <Button className="w-full">
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