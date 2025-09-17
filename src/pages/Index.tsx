import { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import LoginForm from "@/components/auth/LoginForm";
import RegisterForm from "@/components/auth/RegisterForm";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PatientDashboard from "@/components/dashboard/PatientDashboard";
import DoctorDashboard from "@/components/dashboard/DoctorDashboard";
import AdminDashboard from "@/components/dashboard/AdminDashboard";
import UsersList from "@/components/users/UsersList";
import Appointments from "./Appointments";
import Billing from "./Billing";
import MedicalRecords from "./MedicalRecords";
import Patients from "./Patients";

interface User {
  id?: number;
  email: string;
  name: string;
  role: "patient" | "doctor" | "admin";
}

const Index = () => {
  const [user, setUser] = useState<User | null>(null);
  const [apiStatus, setApiStatus] = useState<
    | { status: "ok"; db: string }
    | { status: "error"; message: string }
    | { status: "loading" }
  >({ status: "loading" });
  const navigate = useNavigate();

  useEffect(() => {
    // Load persisted auth user if present
    try {
      const raw = localStorage.getItem("auth_user");
      if (raw) {
        const saved = JSON.parse(raw) as User;
        if (saved?.email && saved?.role && saved?.name) setUser(saved);
      }
    } catch {}
    const controller = new AbortController();
    const load = async () => {
      try {
        const res = await fetch("/api/health", { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const ct = res.headers.get("content-type") || "";
        let data: any = null;
        if (ct.includes("application/json")) {
          data = await res.json();
        } else {
          const text = await res.text();
          try {
            data = JSON.parse(text);
          } catch (_) {
            throw new Error(text || "Non-JSON response");
          }
        }
        setApiStatus({ status: "ok", db: data.db ?? "unknown" });
      } catch (err: any) {
        setApiStatus({ status: "error", message: err?.message ?? "Request failed" });
      }
    };
    load();
    return () => controller.abort();
  }, []);

  const handleLogin = (email: string, _password: string, role: "patient" | "doctor" | "admin", nameFromServer?: string, idFromServer?: number) => {
    // Use the name from the server when available; fallback to email prefix
    const fallbackName = email.includes("@") ? email.split("@")[0] : email;
    const userData: User = { id: idFromServer, email, name: nameFromServer || fallbackName, role };
    setUser(userData);
    try { localStorage.setItem("auth_user", JSON.stringify(userData)); } catch {}
    // Redirect user to their role-specific dashboard
    const path = role === "patient" ? "/dashboard/patient" : role === "doctor" ? "/dashboard/doctor" : "/dashboard/admin";
    try { navigate(path, { replace: true }); } catch {}
  };

  const handleLogout = () => {
    setUser(null);
    try { localStorage.removeItem("auth_user"); } catch {}
  };

  if (!user) {
    return (
      <div>
        {(() => {
          const [showRegister, setShowRegister] = [false, (v: boolean) => {}];
          // Simple inline toggle without losing original components.
          // We use a small self-executing block to avoid refactors elsewhere.
          return null;
        })()}
        {/* Lightweight toggle using URL hash for simplicity: #register shows RegisterForm */}
        {typeof window !== 'undefined' && window.location.hash === '#register' ? (
          <RegisterForm />
        ) : (
          <LoginForm onLogin={handleLogin} />
        )}
      </div>
    );
  }

  // If already authenticated and on root, redirect to the correct dashboard
  if (typeof window !== 'undefined' && window.location.pathname === '/') {
    const path = user.role === "patient" ? "/dashboard/patient" : user.role === "doctor" ? "/dashboard/doctor" : "/dashboard/admin";
    return <Navigate to={path} replace />;
  }

  return (
    <DashboardLayout userRole={user.role} userName={user.name} userEmail={user.email} onLogout={handleLogout}>
      <div className="p-3 text-sm">
        {apiStatus.status === "loading" && (
          <div className="rounded bg-muted p-2">Checking API/DB status…</div>
        )}
        {apiStatus.status === "ok" && (
          <div className="rounded bg-emerald-100 text-emerald-900 p-2">
            API OK (DB: {apiStatus.db})
          </div>
        )}
        {apiStatus.status === "error" && (
          <div className="rounded bg-rose-100 text-rose-900 p-2">
            API Error: {apiStatus.message}
          </div>
        )}
      </div>
      <Routes>
        {/* Role dashboards */}
        <Route
          path="/dashboard/patient"
          element={
            user.role === "patient" ? (
              <PatientDashboard />
            ) : (
              <Navigate to={user.role === "doctor" ? "/dashboard/doctor" : "/dashboard/admin"} replace />
            )
          }
        />
        <Route
          path="/dashboard/doctor"
          element={
            user.role === "doctor" ? (
              <DoctorDashboard />
            ) : (
              <Navigate to={user.role === "patient" ? "/dashboard/patient" : "/dashboard/admin"} replace />
            )
          }
        />
        <Route
          path="/dashboard/admin"
          element={
            user.role === "admin" ? (
              <AdminDashboard />
            ) : (
              <Navigate to={user.role === "patient" ? "/dashboard/patient" : "/dashboard/doctor"} replace />
            )
          }
        />
        {/* Generic dashboard path redirects to user's home */}
        <Route
          path="/dashboard"
          element={
            <Navigate to={user.role === "patient" ? "/dashboard/patient" : user.role === "doctor" ? "/dashboard/doctor" : "/dashboard/admin"} replace />
          }
        />
        {/* Core pages */}
        <Route path="/appointments" element={<Appointments />} />
        <Route path="/patients" element={<Patients />} />
        <Route path="/records" element={<MedicalRecords />} />
        <Route path="/billing" element={<Billing />} />
        <Route path="/users" element={<UsersList />} />
        <Route path="/settings" element={<div className="p-6"><h1 className="text-2xl font-bold">Settings</h1><p className="text-muted-foreground">Coming soon...</p></div>} />
        <Route
          path="*"
          element={
            <Navigate to={user.role === "patient" ? "/dashboard/patient" : user.role === "doctor" ? "/dashboard/doctor" : "/dashboard/admin"} replace />
          }
        />
      </Routes>
    </DashboardLayout>
  );
};

export default Index;
