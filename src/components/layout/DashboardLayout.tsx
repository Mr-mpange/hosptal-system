import { useState } from "react";
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
import { useEffect } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface DashboardLayoutProps {
  userRole: "patient" | "doctor" | "admin" | "manager";
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
        : '/dashboard/admin';

    // Base items shown to all roles
    const base = [
      { icon: Heart, label: "Dashboard", path: dashboardPath },
      { icon: Calendar, label: "Appointments", path: "/appointments" },
      { icon: FileText, label: "Medical Records", path: "/records" },
      { icon: Bell, label: "Notifications", path: "/notifications" },
    ];

    // Role-specific additions
    if (userRole === 'doctor') {
      base.splice(2, 0, { icon: Users, label: "Patients", path: "/patients" });
    }
    if (userRole === 'admin') {
      base.splice(2, 0, { icon: Users, label: "Patients", path: "/patients" });
      base.push({ icon: Users, label: "Users", path: "/users" });
      base.push({ icon: Settings, label: "Settings", path: "/settings" });
    }
    if (userRole === 'manager') {
      base.splice(2, 0, { icon: Users, label: "Patients", path: "/patients" });
      base.push({ icon: Settings, label: "Settings", path: "/settings" });
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
              <DropdownMenuContent align="end" className="w-80 max-h-80 overflow-auto">
                {notifications.length === 0 && (
                  <div className="p-3 text-sm text-muted-foreground">No notifications</div>
                )}
                {notifications.slice().reverse().map(n => (
                  <DropdownMenuItem key={n.id} className="whitespace-normal">
                    <div>
                      <p className="text-sm font-medium">{n.title}</p>
                      <p className="text-xs text-muted-foreground">{n.message}</p>
                    </div>
                  </DropdownMenuItem>
                ))}
                {notifications.length > 0 && (
                  <div className="p-2">
                    <Button variant="outline" size="sm" className="w-full" onClick={()=>{ setUnread(0); }}>Mark all as read</Button>
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