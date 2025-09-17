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

const queryClient = new QueryClient();

type Role = "patient" | "doctor" | "admin";

const getAuthUser = (): { email: string; name: string; role: Role } | null => {
  try {
    const raw = localStorage.getItem("auth_user");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.email && parsed?.role && parsed?.name) {
      const r = String(parsed.role).toLowerCase();
      const role: Role = (r === "patient" || r === "doctor" || r === "admin") ? r : "patient";
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
    const redirect = user.role === "patient" ? "/dashboard/patient" : user.role === "doctor" ? "/dashboard/doctor" : "/dashboard/admin";
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
                <PatientDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/doctor"
            element={
              <ProtectedRoute allowed={["doctor"]}>
                <DoctorDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/admin"
            element={
              <ProtectedRoute allowed={["admin"]}>
                <AdminDashboard />
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
