import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface InvoiceRow {
  id: number;
  patient_id: number;
  amount: string; // decimal as string
  date: string;   // YYYY-MM-DD
  status: "pending" | "paid" | "void";
  created_at?: string;
}

interface SimplePatient {
  id: number;
  name: string;
  email?: string;
}

const Billing = () => {
  const [selectedPatient, setSelectedPatient] = useState<SimplePatient | null>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState<string>("pending");
  const [statusOptions, setStatusOptions] = useState<string[]>(["pending","paid","void"]);
  const [submitting, setSubmitting] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<InvoiceRow[]>([]);

  const [loadingPatients, setLoadingPatients] = useState(true);
  const [patientsError, setPatientsError] = useState<string | null>(null);
  const [patients, setPatients] = useState<SimplePatient[]>([]);

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

  const authHeaders = () => {
    const token = (() => { try { return localStorage.getItem("auth_token") || undefined; } catch { return undefined; } })();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return headers;
  };

  const loadInvoices = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/invoices", { headers: authHeaders() });
      const data = await parseResponse(res);
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  };

  const loadPatients = async () => {
    setLoadingPatients(true);
    setPatientsError(null);
    try {
      const meRes = await fetch("/api/me", { headers: authHeaders() });
      const me = await parseResponse(meRes);
      const role = String(me?.role || '').toLowerCase();

      if (role === 'patient') {
        const pRes = await fetch(`/api/patients/by-user/${me.id}`, { headers: authHeaders() });
        const p = await parseResponse(pRes);
        const one = { id: p.id, name: p.name, email: p.email } as SimplePatient;
        setPatients([one]);
        setSelectedPatient(one);
      } else {
        let data: any[] = [];
        try {
          const res = await fetch("/api/patients/simple", { headers: authHeaders() });
          data = await parseResponse(res);
        } catch (e) {
          data = [];
        }
        setPatients(Array.isArray(data) ? data : []);
      }
    } catch (err: any) {
      setPatientsError(err?.message || "Failed to load patients");
    } finally {
      setLoadingPatients(false);
    }
  };

  const loadMeta = async () => {
    try {
      const res = await fetch("/api/invoices/meta", { headers: authHeaders() });
      const data = await parseResponse(res);
      if (data?.statuses && Array.isArray(data.statuses)) {
        setStatusOptions(data.statuses);
        if (!data.statuses.includes(status)) setStatus("pending");
      }
    } catch {}
  };

  useEffect(() => { loadInvoices(); loadPatients(); loadMeta(); }, []);

  const download = async (id: number) => {
    try {
      const res = await fetch(`/api/invoices/${id}/download`, { headers: authHeaders() });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice_${id}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Download failed: ${err?.message || 'Unknown error'}`);
    }
  };

  const submit = async () => {
    if (!selectedPatient || !amount || !date) { alert("Select patient and provide amount/date"); return; }
    setSubmitting(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json", ...authHeaders() };
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers,
        body: JSON.stringify({ patient_id: selectedPatient.id, amount: Number(amount), date, status })
      });
      await parseResponse(res);
      setAmount(""); setDate(""); setStatus("pending");
      await loadInvoices();
      alert("Invoice created");
    } catch (err: any) {
      alert(`Create failed: ${err?.message || "Unknown error"}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Billing</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Patients (click to select)</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingPatients && <div className="text-sm text-muted-foreground">Loading patients…</div>}
            {patientsError && <div className="text-sm text-rose-700">{patientsError}</div>}
            {!loadingPatients && !patientsError && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-2 pr-4">ID</th>
                      <th className="py-2 pr-4">Name</th>
                      <th className="py-2 pr-4">Email</th>
                      <th className="py-2 pr-4">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patients.map(p => {
                      const selected = selectedPatient?.id === p.id;
                      return (
                        <tr key={p.id} className={`border-b last:border-0 ${selected ? 'bg-muted/50' : ''}`}>
                          <td className="py-2 pr-4">{p.id}</td>
                          <td className="py-2 pr-4">{p.name}</td>
                          <td className="py-2 pr-4">{p.email || ''}</td>
                          <td className="py-2 pr-4">
                            <Button variant={selected ? 'default' : 'secondary'} size="sm" onClick={() => setSelectedPatient(p)}>
                              {selected ? 'Selected' : 'Select'}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                    {patients.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-4 text-muted-foreground">No patients found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Create Invoice {selectedPatient ? `for ${selectedPatient.name} (#${selectedPatient.id})` : ''}</CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedPatient && (
              <div className="text-sm text-muted-foreground mb-3">Select a patient from the list</div>
            )}
            <div className="grid grid-cols-1 gap-4">
              <div>
                <Label htmlFor="b-amount">Amount</Label>
                <Input id="b-amount" type="number" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="b-date">Date</Label>
                <Input id="b-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 mt-2">
            <div>
            <Label htmlFor="b-status">Status</Label>
            <select id="b-status" className="border rounded px-3 py-2 w-full" value={status} onChange={(e) => setStatus(e.target.value)}>
            {statusOptions.map(s => (
            <option key={s} value={s}>{s}</option>
            ))}
            </select>
            </div>
            </div>
            <div className="mt-4">
            <Button onClick={submit} disabled={submitting || !selectedPatient}>{submitting ? "Generating..." : "Generate"}</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Invoices</CardTitle>
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
                    <th className="py-2 pr-4">Patient ID</th>
                    <th className="py-2 pr-4">Amount</th>
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(inv => (
                    <tr key={inv.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{inv.id}</td>
                      <td className="py-2 pr-4">{inv.patient_id}</td>
                      <td className="py-2 pr-4">{inv.amount}</td>
                      <td className="py-2 pr-4">{inv.date}</td>
                      <td className="py-2 pr-4 capitalize">{inv.status}</td>
                      <td className="py-2 pr-4 space-x-2">
                        <Button size="sm" variant="secondary" onClick={() => download(inv.id)}>Download</Button>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-muted-foreground">No invoices found.</td>
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

export default Billing;
