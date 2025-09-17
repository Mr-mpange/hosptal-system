import { useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import LoginForm from "@/components/auth/LoginForm";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PatientDashboard from "@/components/dashboard/PatientDashboard";
import DoctorDashboard from "@/components/dashboard/DoctorDashboard";
import AdminDashboard from "@/components/dashboard/AdminDashboard";

interface User {
  email: string;
  name: string;
  role: "patient" | "doctor" | "admin";
}

const Index = () => {
  const [user, setUser] = useState<User | null>(null);

  const handleLogin = (email: string, password: string, role: "patient" | "doctor" | "admin") => {
    // Mock user data based on role
    const userData = {
      email,
      name: role === "patient" ? "John Doe" : role === "doctor" ? "Dr. Sarah Wilson" : "Admin User",
      role,
    };
    setUser(userData);
  };

  const handleLogout = () => {
    setUser(null);
  };

  if (!user) {
    return <LoginForm onLogin={handleLogin} />;
  }

  return (
    <DashboardLayout userRole={user.role} userName={user.name} userEmail={user.email}>
      <Routes>
        <Route 
          path="/" 
          element={
            user.role === "patient" ? <PatientDashboard /> :
            user.role === "doctor" ? <DoctorDashboard /> :
            <AdminDashboard />
          } 
        />
        <Route 
          path="/dashboard" 
          element={
            user.role === "patient" ? <PatientDashboard /> :
            user.role === "doctor" ? <DoctorDashboard /> :
            <AdminDashboard />
          } 
        />
        {/* Placeholder routes for future pages */}
        <Route path="/appointments" element={<div className="p-6"><h1 className="text-2xl font-bold">Appointments</h1><p className="text-muted-foreground">Coming soon...</p></div>} />
        <Route path="/patients" element={<div className="p-6"><h1 className="text-2xl font-bold">Patients</h1><p className="text-muted-foreground">Coming soon...</p></div>} />
        <Route path="/records" element={<div className="p-6"><h1 className="text-2xl font-bold">Medical Records</h1><p className="text-muted-foreground">Coming soon...</p></div>} />
        <Route path="/billing" element={<div className="p-6"><h1 className="text-2xl font-bold">Billing</h1><p className="text-muted-foreground">Coming soon...</p></div>} />
        <Route path="/users" element={<div className="p-6"><h1 className="text-2xl font-bold">User Management</h1><p className="text-muted-foreground">Coming soon...</p></div>} />
        <Route path="/settings" element={<div className="p-6"><h1 className="text-2xl font-bold">Settings</h1><p className="text-muted-foreground">Coming soon...</p></div>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </DashboardLayout>
  );
};

export default Index;
