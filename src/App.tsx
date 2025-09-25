import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Register from "./pages/Register";
import PatientDashboard from "@/components/dashboard/PatientDashboard";
import DoctorDashboard from "@/components/dashboard/DoctorDashboard";
import AdminDashboard from "@/components/dashboard/AdminDashboard";
import ManagerDashboard from "@/components/dashboard/ManagerDashboard";
import DashboardLayout from "@/components/layout/DashboardLayout";
import Appointments from "./pages/Appointments";
import Patients from "./pages/Patients";
import MedicalRecords from "./pages/MedicalRecords";
import Billing from "./pages/Billing";
import UsersList from "@/components/users/UsersList";
import { useNavigate } from "react-router-dom";
import Notifications from "@/pages/Notifications";

const queryClient = new QueryClient();

type Role = "patient" | "doctor" | "admin" | "manager";

const getAuthUser = (): { email: string; name: string; role: Role } | null => {
  try {
    const raw = localStorage.getItem("auth_user");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.email && parsed?.role && parsed?.name) {
      const r = String(parsed.role).toLowerCase();
      const role: Role = (r === "patient" || r === "doctor" || r === "admin" || r === "manager") ? (r as Role) : "patient";
      return { email: parsed.email, name: parsed.name, role } as any;
    }
  } catch {}
  return null;
};

const ProtectedRoute = ({ children, allowed }: { children: JSX.Element; allowed?: Role[] }) => {
  const user = getAuthUser();
  if (!user) return <Navigate to="/" replace />;
  if (allowed && !allowed.includes(user.role)) {
    // Send user back to their own dashboard
    const redirect =
      user.role === "patient"
        ? "/dashboard/patient"
        : user.role === "doctor"
        ? "/dashboard/doctor"
        : user.role === "manager"
        ? "/dashboard/manager"
        : "/dashboard/admin";
    return <Navigate to={redirect} replace />;
  }
  return children;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/*" element={<Index />} />
          <Route path="/register" element={<Register />} />
          {/* Role-specific dashboards (protected) */}
          <Route
            path="/dashboard/patient"
            element={
              <ProtectedRoute allowed={["patient"]}>
                {(() => {
                  const u = getAuthUser();
                  if (!u) return <Navigate to="/" replace />;
                  const onLogout = () => { try { localStorage.removeItem("auth_user"); } catch {}; window.location.href = "/"; };
                  return (
                    <DashboardLayout userRole={u.role} userName={u.name} userEmail={u.email} onLogout={onLogout}>
                      <PatientDashboard />
                    </DashboardLayout>
                  );
                })()}
              </ProtectedRoute>
            }
          />
          <Route
            path="/notifications"
            element={
              <ProtectedRoute>
                {(() => {
                  const u = getAuthUser();
                  if (!u) return <Navigate to="/" replace />;
                  const onLogout = () => { try { localStorage.removeItem("auth_user"); } catch {}; window.location.href = "/"; };
                  return (
                    <DashboardLayout userRole={u.role} userName={u.name} userEmail={u.email} onLogout={onLogout}>
                      <Notifications />
                    </DashboardLayout>
                  );
                })()}
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/doctor"
            element={
              <ProtectedRoute allowed={["doctor"]}>
                {(() => {
                  const u = getAuthUser();
                  if (!u) return <Navigate to="/" replace />;
                  const onLogout = () => { try { localStorage.removeItem("auth_user"); } catch {}; window.location.href = "/"; };
                  return (
                    <DashboardLayout userRole={u.role} userName={u.name} userEmail={u.email} onLogout={onLogout}>
                      <DoctorDashboard />
                    </DashboardLayout>
                  );
                })()}
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/manager"
            element={
              <ProtectedRoute allowed={["manager"]}>
                {(() => {
                  const u = getAuthUser();
                  if (!u) return <Navigate to="/" replace />;
                  const onLogout = () => { try { localStorage.removeItem("auth_user"); } catch {}; window.location.href = "/"; };
                  return (
                    <DashboardLayout userRole={u.role} userName={u.name} userEmail={u.email} onLogout={onLogout}>
                      <ManagerDashboard />
                    </DashboardLayout>
                  );
                })()}
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/admin"
            element={
              <ProtectedRoute allowed={["admin"]}>
                {(() => {
                  const u = getAuthUser();
                  if (!u) return <Navigate to="/" replace />;
                  const onLogout = () => { try { localStorage.removeItem("auth_user"); } catch {}; window.location.href = "/"; };
                  return (
                    <DashboardLayout userRole={u.role} userName={u.name} userEmail={u.email} onLogout={onLogout}>
                      <AdminDashboard />
                    </DashboardLayout>
                  );
                })()}
              </ProtectedRoute>
            }
          />
          {/* Core pages (protected for any logged-in role) */}
          <Route
            path="/appointments"
            element={
              <ProtectedRoute>
                {(() => {
                  const u = getAuthUser();
                  if (!u) return <Navigate to="/" replace />;
                  const onLogout = () => { try { localStorage.removeItem("auth_user"); } catch {}; window.location.href = "/"; };
                  return (
                    <DashboardLayout userRole={u.role} userName={u.name} userEmail={u.email} onLogout={onLogout}>
                      <Appointments />
                    </DashboardLayout>
                  );
                })()}
              </ProtectedRoute>
            }
          />
          <Route
            path="/patients"
            element={
              <ProtectedRoute allowed={["doctor","admin"]}>
                {(() => {
                  const u = getAuthUser();
                  if (!u) return <Navigate to="/" replace />;
                  const onLogout = () => { try { localStorage.removeItem("auth_user"); } catch {}; window.location.href = "/"; };
                  return (
                    <DashboardLayout userRole={u.role} userName={u.name} userEmail={u.email} onLogout={onLogout}>
                      <Patients />
                    </DashboardLayout>
                  );
                })()}
              </ProtectedRoute>
            }
          />
          <Route
            path="/records"
            element={
              <ProtectedRoute>
                {(() => {
                  const u = getAuthUser();
                  if (!u) return <Navigate to="/" replace />;
                  const onLogout = () => { try { localStorage.removeItem("auth_user"); } catch {}; window.location.href = "/"; };
                  return (
                    <DashboardLayout userRole={u.role} userName={u.name} userEmail={u.email} onLogout={onLogout}>
                      <MedicalRecords />
                    </DashboardLayout>
                  );
                })()}
              </ProtectedRoute>
            }
          />
          <Route
            path="/billing"
            element={
              <ProtectedRoute>
                {(() => {
                  const u = getAuthUser();
                  if (!u) return <Navigate to="/" replace />;
                  const onLogout = () => { try { localStorage.removeItem("auth_user"); } catch {}; window.location.href = "/"; };
                  return (
                    <DashboardLayout userRole={u.role} userName={u.name} userEmail={u.email} onLogout={onLogout}>
                      <Billing />
                    </DashboardLayout>
                  );
                })()}
              </ProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute allowed={["admin"]}>
                {(() => {
                  const u = getAuthUser();
                  if (!u) return <Navigate to="/" replace />;
                  const onLogout = () => { try { localStorage.removeItem("auth_user"); } catch {}; window.location.href = "/"; };
                  return (
                    <DashboardLayout userRole={u.role} userName={u.name} userEmail={u.email} onLogout={onLogout}>
                      <UsersList />
                    </DashboardLayout>
                  );
                })()}
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                {(() => {
                  const u = getAuthUser();
                  if (!u) return <Navigate to="/" replace />;
                  const onLogout = () => { try { localStorage.removeItem("auth_user"); } catch {}; window.location.href = "/"; };
                  return (
                    <DashboardLayout userRole={u.role} userName={u.name} userEmail={u.email} onLogout={onLogout}>
                      <div className="p-6"><h1 className="text-2xl font-bold">Settings</h1><p className="text-muted-foreground">Coming soon...</p></div>
                    </DashboardLayout>
                  );
                })()}
              </ProtectedRoute>
            }
          />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
