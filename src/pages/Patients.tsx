import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PatientRow {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
  created_at?: string;
}

const Patients = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<PatientRow[]>([]);

  const parseResponse = async (res: Response) => {
    const ct = res.headers.get("content-type") || "";
    let data: any = null;
    if (ct.includes("application/json")) data = await res.json();
    else {
      const text = await res.text();
      try { data = JSON.parse(text); } catch { throw new Error(text || "Non-JSON response"); }
    }
    if (!res.ok) throw new Error(data?.message || data?.details || `HTTP ${res.status}`);
    return data;
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = (() => { try { return localStorage.getItem("auth_token") || undefined; } catch { return undefined; } })();
      const res = await fetch("/api/patients", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await parseResponse(res);
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load patients");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!name) { alert("Name is required"); return; }
    setSubmitting(true);
    try {
      const token = (() => { try { return localStorage.getItem("auth_token") || undefined; } catch { return undefined; } })();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch("/api/patients", {
        method: "POST",
        headers,
        body: JSON.stringify({ name, email, phone, notes })
      });
      await parseResponse(res);
      setName(""); setEmail(""); setPhone(""); setNotes("");
      await load();
      alert("Patient saved");
    } catch (err: any) {
      alert(`Save failed: ${err?.message || "Unknown error"}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Patients</h1>

      <Card>
        <CardHeader>
          <CardTitle>Add Patient</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="p-name">Full Name</Label>
              <Input id="p-name" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="p-email">Email</Label>
              <Input id="p-email" type="email" placeholder="patient@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="p-phone">Phone</Label>
              <Input id="p-phone" placeholder="(+255) 700 000 000" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <Label htmlFor="p-notes">Notes</Label>
              <Input id="p-notes" placeholder="Optional notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={submit} disabled={submitting}>{submitting ? "Saving..." : "Save"}</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Patient List</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {error && <div className="text-sm text-rose-700">{error}</div>}
          {!loading && !error && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-4">ID</th>
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4">Phone</th>
                    <th className="py-2 pr-4">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(p => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{p.id}</td>
                      <td className="py-2 pr-4">{p.name}</td>
                      <td className="py-2 pr-4">{p.email || ""}</td>
                      <td className="py-2 pr-4">{p.phone || ""}</td>
                      <td className="py-2 pr-4">{p.created_at ? new Date(p.created_at).toLocaleString() : ""}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-muted-foreground">No patients found.</td>
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

export default Patients;
