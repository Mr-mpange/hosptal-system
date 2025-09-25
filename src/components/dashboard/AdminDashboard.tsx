import NotificationsBell from "@/components/NotificationsBell";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Calendar, DollarSign, TrendingUp, Activity, AlertTriangle, BarChart3, Settings } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

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
  const [audit, setAudit] = useState<Array<{id:number; user_id:number|null; action:string; entity:string; entity_id:number|null; created_at:string; meta?:string|null;}>>([]);
  const [auditFrom, setAuditFrom] = useState<string>("");
  const [auditTo, setAuditTo] = useState<string>("");
  const [auditUserId, setAuditUserId] = useState<string>("");
  const [branches, setBranches] = useState<Array<{id:number; name:string; address?:string|null}>>([]);
  const [services, setServices] = useState<Array<{id:number; name:string; price:number}>>([]);
  const [templates, setTemplates] = useState<Array<{id:number; type:'sms'|'email'; key:string; subject?:string|null; body:string; enabled:boolean}>>([]);
  const [newBranch, setNewBranch] = useState<{name:string; address:string}>({ name: "", address: "" });
  const [newService, setNewService] = useState<{name:string; price:string}>({ name: "", price: "0" });
  const [newTemplate, setNewTemplate] = useState<{type:'sms'|'email'; key:string; subject:string; body:string; enabled:boolean}>({ type:'sms', key:'', subject:'', body:'', enabled:true });

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
    (async () => {
      setLoading(true);
      setUsersLoading(true);
      setUsersErr(null);
      setError(null);
      try {
        const token = (() => { try { return localStorage.getItem('auth_token') || undefined; } catch { return undefined; } })();
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
        const today = new Date().toISOString().slice(0,10);
        const [uRes, pRes, aRes, fRes, auRes, brRes, svRes, tpRes] = await Promise.all([
          fetch('/api/users', { headers }),
          fetch('/api/patients', { headers }),
          fetch('/api/appointments', { headers }),
          fetch('/api/metrics/finance', { headers }),
          fetch('/api/audit', { headers }),
          fetch('/api/branches', { headers }),
          fetch('/api/services', { headers }),
          fetch('/api/templates', { headers }),
        ]);
        const [uData, pData, aData, fData, auData, brData, svData, tpData] = await Promise.all([
          parseResponse(uRes), parseResponse(pRes), parseResponse(aRes), parseResponse(fRes), parseResponse(auRes), parseResponse(brRes), parseResponse(svRes), parseResponse(tpRes)
        ]);
        setUsers(Array.isArray(uData) ? uData : []);
        setPatientsCount(Array.isArray(pData) ? pData.length : null);
        const appts = Array.isArray(aData) ? aData : [];
        setAppointmentsToday(appts.filter((x:any) => String(x.date) === today).length);
        setFinance(fData);
        setAudit(Array.isArray(auData) ? auData.slice(0,50) : []);
        setBranches(Array.isArray(brData) ? brData : []);
        setServices(Array.isArray(svData) ? svData : []);
        setTemplates(Array.isArray(tpData) ? tpData : []);
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
        <div className="flex items-center gap-2">
          <NotificationsBell />
          <Button className="bg-gradient-to-r from-primary to-primary/90" onClick={() => navigate('/settings')}>
            <Settings className="w-4 h-4 mr-2" />
            System Settings
          </Button>
        </div>
      </div>

      {/* Audit Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Audit Logs
          </CardTitle>
          <CardDescription>Recent system actions (admin-only)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="text-sm">From</label>
              <Input type="date" value={auditFrom} onChange={(e)=>setAuditFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-sm">To</label>
              <Input type="date" value={auditTo} onChange={(e)=>setAuditTo(e.target.value)} />
            </div>
            <div>
              <label className="text-sm">User ID</label>
              <Input type="number" placeholder="optional" value={auditUserId} onChange={(e)=>setAuditUserId(e.target.value)} />
            </div>
            <Button variant="outline" onClick={async ()=>{
              try {
                const token = localStorage.getItem('auth_token')||undefined;
                const headers:any = token ? { Authorization: `Bearer ${token}` } : undefined;
                const params = new URLSearchParams();
                if (auditFrom) params.set('from', auditFrom);
                if (auditTo) params.set('to', auditTo);
                if (auditUserId) params.set('user_id', auditUserId);
                const res = await fetch(`/api/audit?${params.toString()}`, { headers });
                const data = await res.json();
                setAudit(Array.isArray(data) ? data.slice(0,50) : []);
              } catch {}
            }}>Filter</Button>
          </div>
          <div className="space-y-2 max-h-64 overflow-auto">
            {audit.map(log => (
              <div key={log.id} className="p-3 border rounded flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{log.action}</p>
                  <p className="text-xs text-muted-foreground truncate">{log.entity} #{log.entity_id ?? ''}</p>
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</div>
              </div>
            ))}
            {audit.length === 0 && <div className="text-sm text-muted-foreground">No audit entries.</div>}
          </div>
        </CardContent>
      </Card>

      {/* Settings: Branches */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Branches
          </CardTitle>
          <CardDescription>Manage hospital branches</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="br-name">Name</Label>
              <Input id="br-name" value={newBranch.name} onChange={(e)=>setNewBranch(b=>({...b,name:e.target.value}))} />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="br-addr">Address</Label>
              <Input id="br-addr" value={newBranch.address} onChange={(e)=>setNewBranch(b=>({...b,address:e.target.value}))} />
            </div>
          </div>
          <Button onClick={async ()=>{
            try {
              const token = localStorage.getItem('auth_token')||undefined;
              const headers:any = { 'Content-Type': 'application/json' };
              if (token) headers.Authorization = `Bearer ${token}`;
              const res = await fetch('/api/branches', { method:'POST', headers, body: JSON.stringify(newBranch) });
              if(!res.ok){ const t = await res.text(); throw new Error(t); }
              const list = await fetch('/api/branches', { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
              const data = await list.json(); setBranches(Array.isArray(data) ? data : []);
              setNewBranch({ name:'', address:'' });
              toast({ title:'Branch created', description: newBranch.name });
            } catch (e:any) { toast({ variant:'destructive', title:'Failed to create branch', description: e?.message||'Error' }); }
          }}>Add Branch</Button>
          <div className="space-y-2 max-h-48 overflow-auto">
            {branches.map(b => (
              <div key={b.id} className="p-2 border rounded flex items-center justify-between gap-3">
                <div className="min-w-0"><p className="font-medium truncate">{b.name}</p><p className="text-xs text-muted-foreground truncate">{b.address}</p></div>
                <Button variant="outline" size="sm" onClick={async ()=>{
                  if(!confirm('Delete branch?')) return; 
                  try{
                    const token = localStorage.getItem('auth_token')||undefined;
                    const headers:any = token ? { Authorization: `Bearer ${token}` } : undefined;
                    const res = await fetch(`/api/branches/${b.id}`, { method:'DELETE', headers });
                    if(!res.ok){ const t = await res.text(); throw new Error(t); }
                    setBranches(prev=>prev.filter(x=>x.id!==b.id));
                    toast({ title:'Branch deleted', description:`#${b.id}` });
                  }catch(e:any){ toast({ variant:'destructive', title:'Failed to delete branch', description: e?.message||'Error' }); }
                }}>Delete</Button>
              </div>
            ))}
            {branches.length===0 && <div className="text-sm text-muted-foreground">No branches yet.</div>}
          </div>
        </CardContent>
      </Card>

      {/* Settings: Services */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Services
          </CardTitle>
          <CardDescription>Manage hospital services</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="svc-name">Name</Label>
              <Input id="svc-name" value={newService.name} onChange={(e)=>setNewService(s=>({...s,name:e.target.value}))} />
            </div>
            <div>
              <Label htmlFor="svc-price">Price</Label>
              <Input id="svc-price" type="number" value={newService.price} onChange={(e)=>setNewService(s=>({...s,price:e.target.value}))} />
            </div>
          </div>
          <Button onClick={async ()=>{
            try {
              const token = localStorage.getItem('auth_token')||undefined;
              const headers:any = { 'Content-Type': 'application/json' };
              if (token) headers.Authorization = `Bearer ${token}`;
              const res = await fetch('/api/services', { method:'POST', headers, body: JSON.stringify({ name:newService.name, price: Number(newService.price)||0 }) });
              if(!res.ok){ const t = await res.text(); throw new Error(t); }
              const list = await fetch('/api/services', { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
              const data = await list.json(); setServices(Array.isArray(data) ? data : []);
              setNewService({ name:'', price:'0' });
              toast({ title:'Service created', description: newService.name });
            } catch (e:any) { toast({ variant:'destructive', title:'Failed to create service', description: e?.message||'Error' }); }
          }}>Add Service</Button>
          <div className="space-y-2 max-h-48 overflow-auto">
            {services.map(s => (
              <div key={s.id} className="p-2 border rounded flex items-center justify-between gap-3">
                <div className="min-w-0"><p className="font-medium truncate">{s.name}</p><p className="text-xs text-muted-foreground truncate">{Number(s.price).toLocaleString()}</p></div>
                <Button variant="outline" size="sm" onClick={async ()=>{
                  if(!confirm('Delete service?')) return; 
                  try{
                    const token = localStorage.getItem('auth_token')||undefined;
                    const headers:any = token ? { Authorization: `Bearer ${token}` } : undefined;
                    const res = await fetch(`/api/services/${s.id}`, { method:'DELETE', headers });
                    if(!res.ok){ const t = await res.text(); throw new Error(t); }
                    setServices(prev=>prev.filter(x=>x.id!==s.id));
                    toast({ title:'Service deleted', description:`#${s.id}` });
                  }catch(e:any){ toast({ variant:'destructive', title:'Failed to delete service', description: e?.message||'Error' }); }
                }}>Delete</Button>
              </div>
            ))}
            {services.length===0 && <div className="text-sm text-muted-foreground">No services yet.</div>}
          </div>
        </CardContent>
      </Card>

      {/* Settings: Templates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Templates
          </CardTitle>
          <CardDescription>Manage SMS/Email templates</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="tpl-type">Type</Label>
              <select id="tpl-type" className="w-full border rounded h-10 px-2" value={newTemplate.type} onChange={(e)=>setNewTemplate(t=>({...t, type: e.target.value as 'sms'|'email'}))}>
                <option value="sms">SMS</option>
                <option value="email">Email</option>
              </select>
            </div>
            <div>
              <Label htmlFor="tpl-key">Key</Label>
              <Input id="tpl-key" value={newTemplate.key} onChange={(e)=>setNewTemplate(t=>({...t,key:e.target.value}))} />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="tpl-sub">Subject</Label>
              <Input id="tpl-sub" value={newTemplate.subject} onChange={(e)=>setNewTemplate(t=>({...t,subject:e.target.value}))} />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="tpl-body">Body</Label>
              <Textarea id="tpl-body" value={newTemplate.body} onChange={(e)=>setNewTemplate(t=>({...t,body:e.target.value}))} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm">Enabled</label>
            <input type="checkbox" checked={newTemplate.enabled} onChange={(e)=>setNewTemplate(t=>({...t,enabled:e.target.checked}))} />
          </div>
          <Button onClick={async ()=>{
            try {
              const token = localStorage.getItem('auth_token')||undefined;
              const headers:any = { 'Content-Type': 'application/json' };
              if (token) headers.Authorization = `Bearer ${token}`;
              const res = await fetch('/api/templates', { method:'POST', headers, body: JSON.stringify(newTemplate) });
              if(!res.ok){ const t = await res.text(); throw new Error(t); }
              const list = await fetch('/api/templates', { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
              const data = await list.json(); setTemplates(Array.isArray(data) ? data : []);
              setNewTemplate({ type:'sms', key:'', subject:'', body:'', enabled:true });
              toast({ title:'Template created', description: newTemplate.key });
            } catch (e:any) { toast({ variant:'destructive', title:'Failed to create template', description: e?.message||'Error' }); }
          }}>Add Template</Button>
          <div className="space-y-2 max-h-48 overflow-auto">
            {templates.map(t => (
              <div key={t.id} className="p-2 border rounded flex items-center justify-between gap-3">
                <div className="min-w-0"><p className="font-medium truncate">[{t.type}] {t.key}</p><p className="text-xs text-muted-foreground truncate">{t.subject || '(no subject)'}</p></div>
                <Button variant="outline" size="sm" onClick={async ()=>{
                  if(!confirm('Delete template?')) return; 
                  try{
                    const token = localStorage.getItem('auth_token')||undefined;
                    const headers:any = token ? { Authorization: `Bearer ${token}` } : undefined;
                    const res = await fetch(`/api/templates/${t.id}`, { method:'DELETE', headers });
                    if(!res.ok){ const tt = await res.text(); throw new Error(tt); }
                    setTemplates(prev=>prev.filter(x=>x.id!==t.id));
                    toast({ title:'Template deleted', description:`#${t.id}` });
                  }catch(e:any){ toast({ variant:'destructive', title:'Failed to delete template', description: e?.message||'Error' }); }
                }}>Delete</Button>
              </div>
            ))}
            {templates.length===0 && <div className="text-sm text-muted-foreground">No templates yet.</div>}
          </div>
        </CardContent>
      </Card>
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