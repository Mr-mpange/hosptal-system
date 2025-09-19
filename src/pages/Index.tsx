import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import LoginForm from "@/components/auth/LoginForm";
import RegisterForm from "@/components/auth/RegisterForm";

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

  // Do NOT auto-redirect from "/" even if authenticated; let the homepage render.

  // Auth landing: show API status banner and Login/Register
  return (
    <div className="p-3">
      <div className="mb-4 text-sm">
        {apiStatus.status === "loading" && (
          <div className="rounded bg-muted p-2">Checking API/DB status…</div>
        )}
        {apiStatus.status === "ok" && (
          <div className="rounded bg-emerald-100 text-emerald-900 p-2">API OK (DB: {apiStatus.db})</div>
        )}
        {apiStatus.status === "error" && (
          <div className="rounded bg-rose-100 text-rose-900 p-2">API Error: {apiStatus.message}</div>
        )}
      </div>

      {typeof window !== 'undefined' && window.location.hash === '#register' ? (
        <RegisterForm />
      ) : (
        <LoginForm onLogin={handleLogin} />
      )}
    </div>
  );
};

export default Index;
