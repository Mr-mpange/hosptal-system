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

const Billing = () => {
  const [patientId, setPatientId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState<"pending" | "paid" | "void">("pending");
  const [submitting, setSubmitting] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<InvoiceRow[]>([]);

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
      const res = await fetch("/api/invoices", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await parseResponse(res);
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!patientId || !amount || !date) { alert("patient_id, amount and date are required"); return; }
    setSubmitting(true);
    try {
      const token = (() => { try { return localStorage.getItem("auth_token") || undefined; } catch { return undefined; } })();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers,
        body: JSON.stringify({ patient_id: Number(patientId), amount: Number(amount), date, status })
      });
      await parseResponse(res);
      setPatientId(""); setAmount(""); setDate(""); setStatus("pending");
      await load();
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

      <Card>
        <CardHeader>
          <CardTitle>Create Invoice</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="b-patient">Patient ID</Label>
              <Input id="b-patient" placeholder="e.g. 1" value={patientId} onChange={(e) => setPatientId(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="b-amount">Amount</Label>
              <Input id="b-amount" type="number" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="b-date">Date</Label>
              <Input id="b-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={submit} disabled={submitting}>{submitting ? "Generating..." : "Generate"}</Button>
          </div>
        </CardContent>
      </Card>

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
