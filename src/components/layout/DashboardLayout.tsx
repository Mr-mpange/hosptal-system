import { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { 
  Heart, 
  Users, 
  Calendar, 
  FileText, 
  CreditCard, 
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

interface DashboardLayoutProps {
  userRole: "patient" | "doctor" | "admin";
  userName: string;
  userEmail: string;
  children: React.ReactNode;
  onLogout?: () => void;
}

const DashboardLayout = ({ userRole, userName, userEmail, children, onLogout }: DashboardLayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const navigate = useNavigate();

  const getMenuItems = () => {
    // Role-specific dashboard path
    const dashboardPath = userRole === 'patient'
      ? '/dashboard/patient'
      : userRole === 'doctor'
      ? '/dashboard/doctor'
      : '/dashboard/admin';

    // Base items shown to all roles
    const base = [
      { icon: Heart, label: "Dashboard", path: dashboardPath },
      { icon: Calendar, label: "Appointments", path: "/appointments" },
      { icon: FileText, label: "Medical Records", path: "/records" },
      { icon: CreditCard, label: "Billing", path: "/billing" },
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
    return base;
  };

  const menuItems = getMenuItems();

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
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

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between p-4 border-b bg-card">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <Menu className="w-4 h-4" />
            </Button>
            
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search patients, appointments..."
                className="pl-10 w-64"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" className="relative">
              <Bell className="w-4 h-4" />
              <Badge className="absolute -top-1 -right-1 w-5 h-5 p-0 flex items-center justify-center text-xs">
                3
              </Badge>
            </Button>
            
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