import { useState, useEffect, useMemo, useRef } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { 
  Heart, 
  Users, 
  Calendar, 
  FileText, 
  Settings, 
  LogOut,
  Menu,
  Bell,
  Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
 
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface DashboardLayoutProps {
  userRole: "patient" | "doctor" | "admin" | "manager" | "lab_tech";
  userName: string;
  userEmail: string;
  children: React.ReactNode;
  onLogout?: () => void;
  hideSidebar?: boolean;
}

const DashboardLayout = ({ userRole, userName, userEmail, children, onLogout, hideSidebar }: DashboardLayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<Array<{id:number; title:string; message:string; created_at?:string}>>([]);
  const [unread, setUnread] = useState(0);
  // Compose notification state
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTitle, setComposeTitle] = useState('');
  const [composeMessage, setComposeMessage] = useState('');
  const [composeTarget, setComposeTarget] = useState<'doctor'|'manager'|'admin'|'lab_tech'>('doctor');
  const [composeBusy, setComposeBusy] = useState(false);
  const navigate = useNavigate();

  const getMenuItems = () => {
    // Role-specific dashboard path
    const dashboardPath =
      userRole === 'patient'
        ? '/dashboard/patient'
        : userRole === 'doctor'
        ? '/dashboard/doctor'
        : userRole === 'manager'
        ? '/dashboard/manager'
        : userRole === 'lab_tech'
        ? '/dashboard/lab'
        : '/dashboard/admin';

    // Base items shown to all roles
    const base = [
      { icon: Heart, label: "Dashboard", path: dashboardPath },
      { icon: Calendar, label: "Appointments", path: "/appointments" },
      { icon: FileText, label: "Medical Records", path: "/records" },
      { icon: Bell, label: "Notifications", path: "/notifications" },
      { icon: Settings, label: "Settings", path: "/settings" },
    ];

    // Role-specific additions
    if (userRole === 'doctor') {
      base.splice(2, 0, { icon: Users, label: "Patients", path: "/patients" });
    }
    if (userRole === 'admin') {
      base.splice(2, 0, { icon: Users, label: "Patients", path: "/patients" });
      base.push({ icon: Users, label: "Users", path: "/users" });
    }
    if (userRole === 'manager') {
      base.splice(2, 0, { icon: Users, label: "Patients", path: "/patients" });
    }
    return base;
  };

  const menuItems = getMenuItems();

  useEffect(() => {
    // Subscribe to SSE notifications
    let es: EventSource | null = null;
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : undefined;
      es = new EventSource(`/api/events${token ? `?token=${encodeURIComponent(token)}` : ''}`);
      es.addEventListener('notification', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          setNotifications(prev => {
            const next = [...prev, { id: data.id, title: data.title, message: data.message, created_at: data.created_at }];
            return next.slice(-20); // keep last 20
          });
          setUnread(u => u + 1);
        } catch {}
      });
    } catch {}
    return () => { try { es?.close(); } catch {} };
  }, []);

  const allowedTargets = useMemo(() => {
    switch (userRole) {
      case 'patient': return ['doctor'] as const;
      case 'doctor': return ['manager','lab_tech'] as const;
      case 'manager': return ['admin','doctor','lab_tech'] as const;
      case 'admin': return ['manager','doctor','lab_tech'] as const;
      case 'lab_tech': return ['doctor','manager'] as const;
      default: return [] as const;
    }
  }, [userRole]);

  // Ensure we only load unread notifications once per session (per mount),
  // regardless of state changes that might re-render this component
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (!allowedTargets.length) return;
    if (!allowedTargets.includes(composeTarget as any)) {
      setComposeTarget(allowedTargets[0] as any);
    }
    // Load unread notifications once per role change
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    (async () => {
      try {
        const token = (()=>{ try { return localStorage.getItem('auth_token')||''; } catch { return ''; } })();
        const res = await fetch('/api/notifications?unread=true', { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
        const data = await res.json();
        if (Array.isArray(data)) {
          setNotifications(data.slice(-20));
          setUnread(data.length);
        }
      } catch {}
    })();
  }, [userRole, allowedTargets, composeTarget]);

  const authToken = (() => { try { return localStorage.getItem('auth_token') || ''; } catch { return ''; } })();

  // Auto-mark notifications as read when dropdown opens
  useEffect(() => {
    if (!notifOpen) return;
    if (!notifications.length) return;
    (async () => {
      try {
        await Promise.all(
          notifications.map(n => fetch(`/api/notifications/${n.id}/read`, { method:'POST', headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined }))
        );
        setUnread(0);
      } catch {}
    })();
  }, [notifOpen, notifications]);
  async function sendNotification() {
    if (!composeTitle.trim() || !composeMessage.trim()) return;
    if (!allowedTargets.length) return;
    setComposeBusy(true);
    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
        body: JSON.stringify({ title: composeTitle.trim(), message: composeMessage.trim(), target_role: composeTarget }),
      });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(data?.message || 'Failed to send');
      // Optimistically add to list for current user if visible
      setNotifications(prev => [{ id: data?.id || Date.now(), title: composeTitle.trim(), message: composeMessage.trim(), created_at: new Date().toISOString() }, ...prev].slice(0,20));
      setUnread(u => u + 1);
      setComposeOpen(false); setComposeTitle(''); setComposeMessage('');
    } catch (e:any) {
      alert(e?.message || 'Failed to send notification');
    } finally { setComposeBusy(false); }
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      {!hideSidebar && (
      <div className={cn(
        "flex flex-col bg-card border-r transition-all duration-300",
        sidebarOpen ? "w-64" : "w-16"
      )}>
        {/* Logo */}
        <div className="flex items-center p-4 border-b">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-r from-primary to-primary/80 rounded-lg flex items-center justify-center">
              <Heart className="w-5 h-5 text-primary-foreground" />
            </div>
            {sidebarOpen && (
              <div>
                <h1 className="text-lg font-bold text-foreground">CareLink</h1>
                <p className="text-xs text-muted-foreground">HMS</p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {menuItems.map((item) => (
            <Button
              key={item.path}
              variant="ghost"
              className={cn(
                "w-full justify-start gap-3 h-10",
                !sidebarOpen && "px-2"
              )}
              onClick={() => navigate(item.path)}
            >
              <item.icon className="w-4 h-4" />
              {sidebarOpen && <span>{item.label}</span>}
            </Button>
          ))}
        </nav>

        {/* User section */}
        <div className="p-4 border-t">
          <div className="flex items-center gap-3">
            <Avatar className="w-8 h-8">
              <AvatarImage src="" />
              <AvatarFallback className="bg-primary text-primary-foreground">
                {userName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {userName}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {userRole}
                </p>
              </div>
            )}
          </div>
          {sidebarOpen && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-2 justify-start gap-2 text-muted-foreground"
              onClick={() => onLogout?.()}
            >
              <LogOut className="w-4 h-4" />
              Logout
            </Button>
          )}
        </div>
      </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between p-4 border-b bg-card">
          <div className="flex items-center gap-4">
            {!hideSidebar && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                <Menu className="w-4 h-4" />
              </Button>
            )}
            
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search patients, appointments..."
                className="pl-10 w-64"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <DropdownMenu open={notifOpen} onOpenChange={setNotifOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="relative">
                  <Bell className="w-4 h-4" />
                  {unread > 0 && (
                    <Badge className="absolute -top-1 -right-1 w-5 h-5 p-0 flex items-center justify-center text-xs">
                      {unread > 9 ? '9+' : unread}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-96 max-h-[28rem] overflow-auto">
                {/* Compose section (only if role has allowed targets) */}
                {allowedTargets.length > 0 && (
                  <div className="p-3 border-b bg-muted/10">
                    {!composeOpen ? (
                      <Button size="sm" variant="outline" onClick={()=> setComposeOpen(true)}>New notification</Button>
                    ) : (
                      <div className="space-y-2">
                        <input
                          className="border rounded px-2 py-1 w-full text-sm"
                          placeholder="Title"
                          value={composeTitle}
                          onChange={(e)=> setComposeTitle(e.target.value)}
                        />
                        <textarea
                          className="border rounded px-2 py-1 w-full text-sm"
                          placeholder="Message"
                          rows={3}
                          value={composeMessage}
                          onChange={(e)=> setComposeMessage(e.target.value)}
                        />
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-muted-foreground">Target</label>
                          <select className="border rounded px-2 py-1 text-sm" value={composeTarget} onChange={(e)=> setComposeTarget(e.target.value as any)}>
                            {allowedTargets.map(t => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                          <Button size="sm" onClick={sendNotification} disabled={composeBusy || !composeTitle.trim() || !composeMessage.trim()}>
                            {composeBusy ? 'Sending…' : 'Send'}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={()=> { setComposeOpen(false); setComposeTitle(''); setComposeMessage(''); }}>Cancel</Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {notifications.length === 0 && (
                  <div className="p-3 text-sm text-muted-foreground">No notifications</div>
                )}
                {notifications.slice().reverse().map(n => (
                  <DropdownMenuItem key={n.id} className="whitespace-normal">
                    <div>
                      <p className="text-sm font-medium">{n.title}</p>
                      <p className="text-xs text-muted-foreground">{n.message}</p>
                      {/** optional sender info if provided by SSE */}
                      { (n as any).from_role && (
                        <p className="text-[11px] text-muted-foreground/80">From: {(n as any).from_role}{(n as any).from_name ? ` (${(n as any).from_name})` : ''}</p>
                      )}
                    </div>
                  </DropdownMenuItem>
                ))}
                {notifications.length > 0 && (
                  <div className="p-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={async ()=>{
                        try {
                          const token = (()=>{ try { return localStorage.getItem('auth_token')||''; } catch { return ''; } })();
                          await Promise.all(
                            notifications.map(n => fetch(`/api/notifications/${n.id}/read`, { method:'POST', headers: token ? { Authorization: `Bearer ${token}` } : undefined }))
                          );
                          setUnread(0);
                        } catch {}
                      }}
                    >
                      Mark all as read
                    </Button>
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            
            <div className="flex items-center gap-2">
              <Avatar className="w-8 h-8">
                <AvatarImage src="" />
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {userName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="text-sm">
                <p className="font-medium text-foreground">{userName}</p>
                <p className="text-muted-foreground capitalize">{userRole}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;