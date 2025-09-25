import { useEffect, useMemo, useState } from "react";
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
  const [form, setForm] = useState({ name: "", email: "", phone: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<PatientRow[]>([]);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "", notes: "" });
  const [deletingId, setDeletingId] = useState<number | null>(null);

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

  const authHeaders = useMemo(() => {
    const token = (() => { try { return localStorage.getItem("auth_token") || undefined; } catch { return undefined; } })();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return headers;
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/patients", { headers: authHeaders });
      const data = await parseResponse(res);
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load patients");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const createPatient = async () => {
    if (!form.name) { alert("Name is required"); return; }
    setSubmitting(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json", ...authHeaders };
      const res = await fetch("/api/patients", {
        method: "POST",
        headers,
        body: JSON.stringify(form)
      });
      await parseResponse(res);
      setForm({ name: "", email: "", phone: "", notes: "" });
      await load();
      alert("Patient created");
    } catch (err: any) {
      alert(`Create failed: ${err?.message || "Unknown error"}`);
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (p: PatientRow) => {
    setEditingId(p.id);
    setEditForm({ name: p.name || "", email: p.email || "", phone: p.phone || "", notes: p.notes || "" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ name: "", email: "", phone: "", notes: "" });
  };

  const updatePatient = async (id: number) => {
    setSubmitting(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json", ...authHeaders };
      const res = await fetch(`/api/patients/${id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(editForm)
      });
      await parseResponse(res);
      await load();
      cancelEdit();
      alert("Patient updated");
    } catch (err: any) {
      alert(`Update failed: ${err?.message || "Unknown error"}`);
    } finally {
      setSubmitting(false);
    }
  };

  const deletePatient = async (id: number) => {
    if (!confirm("Delete this patient? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/patients/${id}`, {
        method: "DELETE",
        headers: authHeaders
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || data?.details || `HTTP ${res.status}`);
      await load();
      alert("Patient deleted");
    } catch (err: any) {
      alert(`Delete failed: ${err?.message || "Unknown error"}`);
    } finally {
      setDeletingId(null);
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
              <Input id="p-name" placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="p-email">Email</Label>
              <Input id="p-email" type="email" placeholder="patient@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="p-phone">Phone</Label>
              <Input id="p-phone" placeholder="(+255) 700 000 000" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <Label htmlFor="p-notes">Notes</Label>
              <Input id="p-notes" placeholder="Optional notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={createPatient} disabled={submitting}>{submitting ? "Saving..." : "Save"}</Button>
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
                    <th className="py-2 pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(p => (
                    <tr key={p.id} className="border-b last:border-0 align-top">
                      <td className="py-2 pr-4">{p.id}</td>
                      <td className="py-2 pr-4">
                        {editingId === p.id ? (
                          <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                        ) : p.name}
                      </td>
                      <td className="py-2 pr-4">
                        {editingId === p.id ? (
                          <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                        ) : (p.email || "")}
                      </td>
                      <td className="py-2 pr-4">
                        {editingId === p.id ? (
                          <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
                        ) : (p.phone || "")}
                      </td>
                      <td className="py-2 pr-4">{p.created_at ? new Date(p.created_at).toLocaleString() : ""}</td>
                      <td className="py-2 pr-4 space-x-2">
                        {editingId === p.id ? (
                          <>
                            <Button size="sm" onClick={() => updatePatient(p.id)} disabled={submitting}>Save</Button>
                            <Button size="sm" variant="secondary" onClick={cancelEdit}>Cancel</Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="secondary" onClick={() => startEdit(p)}>Edit</Button>
                            <Button size="sm" variant="destructive" onClick={() => deletePatient(p.id)} disabled={deletingId === p.id}>
                              {deletingId === p.id ? 'Deleting...' : 'Delete'}
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-4 text-muted-foreground">No patients found.</td>
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
