import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface UserRow {
  id: number;
  name: string;
  email: string;
  role?: "patient" | "doctor" | "admin" | "manager";
  created_at?: string;
}

const UsersList = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<UserRow[]>([]);

  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = (() => { try { return localStorage.getItem("auth_token") || undefined; } catch { return undefined; } })();
      const res = await fetch("/api/users", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const ct = res.headers.get("content-type") || "";
      let data: any = null;
      if (ct.includes("application/json")) data = await res.json();
      else {
        const text = await res.text();
        try { data = JSON.parse(text); } catch { throw new Error(text || "Non-JSON response"); }
      }
      if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Admin create user (requires JWT token with role=admin)
  const [aName, setAName] = useState("");
  const [aEmail, setAEmail] = useState("");
  const [aPass, setAPass] = useState("");
  const [aRole, setARole] = useState<"patient" | "doctor" | "admin" | "manager">("patient");
  const [aSubmitting, setASubmitting] = useState(false);

  const submitAdminCreate = async () => {
    if (!aName || !aEmail || !aPass) {
      toast({ title: "Missing fields", description: "Fill name, email and password.", variant: "destructive" });
      return;
    }
    const token = (() => { try { return localStorage.getItem("auth_token") || undefined; } catch { return undefined; } })();
    if (!token) {
      toast({ title: "Not authenticated", description: "Sign in as an admin to create users.", variant: "destructive" });
      return;
    }
    setASubmitting(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: aName, email: aEmail, password: aPass, role: aRole }),
      });
      const ct = res.headers.get("content-type") || "";
      let data: any = null;
      if (ct.includes("application/json")) data = await res.json();
      else {
        const text = await res.text();
        try { data = JSON.parse(text); } catch { throw new Error(text || "Non-JSON response"); }
      }
      if (!res.ok) throw new Error(data?.message || data?.details || `HTTP ${res.status}`);
      toast({ title: "User created", description: `${data.email} (${data.role})` });
      setAName(""); setAEmail(""); setAPass(""); setARole("patient");
      load();
    } catch (err: any) {
      toast({ title: "Create failed", description: err?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setASubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Users</h1>

      <Card>
        <CardHeader>
          <CardTitle>Admin: Create User</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="a-name">Name</Label>
              <Input id="a-name" value={aName} onChange={(e) => setAName(e.target.value)} placeholder="Full name" />
            </div>
            <div>
              <Label htmlFor="a-email">Email</Label>
              <Input id="a-email" type="email" value={aEmail} onChange={(e) => setAEmail(e.target.value)} placeholder="email@example.com" />
            </div>
            <div>
              <Label htmlFor="a-pass">Password</Label>
              <Input id="a-pass" type="password" value={aPass} onChange={(e) => setAPass(e.target.value)} placeholder="******" />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={aRole} onValueChange={(v) => setARole(v as any)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="patient">Patient</SelectItem>
                  <SelectItem value="doctor">Doctor</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={submitAdminCreate} disabled={aSubmitting}>
              {aSubmitting ? "Creating..." : "Create User"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Users in Database</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <div className="text-sm text-muted-foreground">Loading users…</div>}
          {error && <div className="text-sm text-rose-700">{error}</div>}
          {!loading && !error && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-4">ID</th>
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4">Role</th>
                    <th className="py-2 pr-4">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => (
                    <tr key={u.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{u.id}</td>
                      <td className="py-2 pr-4">{u.name}</td>
                      <td className="py-2 pr-4">{u.email}</td>
                      <td className="py-2 pr-4 capitalize">{u.role ?? "-"}</td>
                      <td className="py-2 pr-4">{u.created_at ? new Date(u.created_at).toLocaleString() : ""}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-muted-foreground">No users found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default UsersList;
