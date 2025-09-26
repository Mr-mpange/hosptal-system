import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { CardDescription } from "@/components/ui/card";
// Checkout UI removed per request

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
  const { toast } = useToast();
  const [selectedPatient, setSelectedPatient] = useState<SimplePatient | null>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState<string>("pending");
  const [statusOptions, setStatusOptions] = useState<string[]>(["pending","paid","void"]);
  const [submitting, setSubmitting] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [metrics, setMetrics] = useState<{ pending:number; paid:number; partially_paid:number; overdue:number; claims:number }|null>(null);
  const [payMethodById, setPayMethodById] = useState<Record<number,string>>({});
  // Removed Payment Status and Expired CNs UI state per request

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

  // Removed expired CNs loader per request

  const loadMetrics = async () => {
    try {
      const res = await fetch('/api/metrics/invoices-status', { headers: authHeaders() });
      if (!res.ok) { const t = await res.text(); throw new Error(t); }
      const data = await res.json();
      setMetrics(data);
    } catch {}
  };

  // Control Number lifecycle helpers
  const listCN = async (invoiceId: number) => {
    try {
      const res = await fetch(`/api/control-numbers?invoice_id=${invoiceId}`, { headers: authHeaders() });
      if (!res.ok) { const t = await res.text(); throw new Error(t); }
      const data = await res.json();
      const active = (Array.isArray(data) ? data : []).filter((c:any)=>c.status==='active');
      toast({ title:`CNs: ${data?.length||0}`, description: active.length ? `Active: ${active[0]?.number}` : 'No active CN' });
    } catch (e:any) {
      toast({ variant:'destructive', title:'List CN failed', description: e?.message||'Unknown error' });
    }
  };

  const generateCN = async (invoiceId: number) => {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json", ...authHeaders() };
      const res = await fetch(`/api/control-numbers`, { method:'POST', headers, body: JSON.stringify({ invoice_id: invoiceId }) });
      if (!res.ok) { const t = await res.text(); throw new Error(t); }
      const row = await res.json();
      toast({ title:'Control number created', description: row?.number || '' });
    } catch (e:any) {
      toast({ variant:'destructive', title:'Generate CN failed', description: e?.message||'Unknown error' });
    }
  };

  const latestCNId = async (invoiceId: number): Promise<number|null> => {
    const res = await fetch(`/api/control-numbers?invoice_id=${invoiceId}`, { headers: authHeaders() });
    if (!res.ok) return null;
    const list = await res.json();
    const arr = Array.isArray(list) ? list : [];
    if (!arr.length) return null;
    return Number(arr[0]?.id) || null; // ordered DESC in API
  };

  const cancelCN = async (invoiceId: number) => {
    try {
      const id = await latestCNId(invoiceId);
      if (!id) { toast({ title:'No CN to cancel' }); return; }
      const res = await fetch(`/api/control-numbers/${id}/cancel`, { method:'POST', headers: authHeaders() });
      if (!res.ok) { const t = await res.text(); throw new Error(t); }
      toast({ title:'Control number cancelled', description:`#${id}` });
    } catch (e:any) {
      toast({ variant:'destructive', title:'Cancel CN failed', description: e?.message||'Unknown error' });
    }
  };

  const reissueCN = async (invoiceId: number) => {
    try {
      const id = await latestCNId(invoiceId);
      if (!id) { toast({ title:'No CN to reissue' }); return; }
      const res = await fetch(`/api/control-numbers/${id}/reissue`, { method:'POST', headers: authHeaders() });
      if (!res.ok) { const t = await res.text(); throw new Error(t); }
      const data = await res.json();
      toast({ title:'CN reissued', description: data?.new?.number || 'No new CN (settled?)' });
    } catch (e:any) {
      toast({ variant:'destructive', title:'Reissue CN failed', description: e?.message||'Unknown error' });
    }
  };

  // Jobs / Reconcile handlers (used by header buttons)
  const reconcileNow = async () => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json', ...authHeaders() };
      const res = await fetch('/api/reconcile/payments', { method: 'POST', headers });
      if (!res.ok) { const t = await res.text(); throw new Error(t); }
      toast({ title: 'Reconciliation triggered' });
      await Promise.all([loadInvoices(), loadMetrics()]);
    } catch (e:any) {
      toast({ variant:'destructive', title:'Reconcile failed', description: e?.message || 'Unknown error' });
    }
  };

  const overdueJob = async () => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json', ...authHeaders() };
      const res = await fetch('/api/jobs/overdue', { method: 'POST', headers });
      if (!res.ok) { const t = await res.text(); throw new Error(t); }
      toast({ title: 'Overdue/Expiry job triggered' });
      await Promise.all([loadInvoices(), loadMetrics()]);
    } catch (e:any) {
      toast({ variant:'destructive', title:'Overdue job failed', description: e?.message || 'Unknown error' });
    }
  };

  const initiate = async (id: number) => {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json", ...authHeaders() };
      const method = (payMethodById[id] || 'control');
      const res = await fetch(`/api/payments/initiate`, { method: 'POST', headers, body: JSON.stringify({ invoice_id: id, method }) });
      const p = await parseResponse(res);
      const msg = method === 'zenopay' ? 'Zenopay initiated' : 'Control number generated';
      toast({ title: msg, description:`Ref: ${p?.reference || 'N/A'}` });
    } catch (err: any) {
      toast({ variant:'destructive', title:'Initiate failed', description: err?.message || 'Unknown error' });
    }
  };

  const checkStatus = async (invoiceId: number) => {
    try {
      const res = await fetch(`/api/payments/by-invoice/${invoiceId}`, { headers: authHeaders() });
      if (!res.ok) { const t = await res.text(); throw new Error(t); }
      const p = await res.json();
      if (!p) { toast({ title:'No payment found', description:`Invoice #${invoiceId}` }); return; }
      toast({ title:`Payment ${p.status}`, description:`Ref: ${p.reference || 'N/A'} • Amount: ${p.amount}` });
    } catch (e:any) {
      toast({ variant:'destructive', title:'Status check failed', description: e?.message || 'Unknown error' });
    }
  };

  // Removed payment status poller per request

  const copyRef = async () => {
    try { if (lastRef) { await navigator.clipboard.writeText(lastRef); toast({ title:'Copied reference' }); } } catch {}
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

  useEffect(() => { loadInvoices(); loadPatients(); loadMeta(); loadMetrics(); }, []);

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
      toast({ variant:'destructive', title:'Download failed', description: err?.message || 'Unknown error' });
    }
  };

  const submit = async () => {
    if (!selectedPatient || !amount || !date) { toast({ variant:'destructive', title:'Validation error', description:'Select patient and provide amount/date' }); return; }
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
      toast({ title:'Invoice created', description:`#${selectedPatient.id} - ${Number(amount).toFixed(2)}` });
    } catch (err: any) {
      toast({ variant:'destructive', title:'Create failed', description: err?.message || 'Unknown error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Billing</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={reconcileNow}>Reconcile Now</Button>
          <Button variant="outline" onClick={overdueJob}>Overdue/Expire CNs</Button>
        </div>
      </div>

      {/* Expired CNs UI removed per request */}

      {/* Checkout UI removed per request */}

      {/* Invoice Status Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Invoice Status</CardTitle>
          <CardDescription>Paid, Pending, Overdue, Claims</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="p-4 rounded-md border">
              <div className="text-sm text-muted-foreground">Paid</div>
              <div className="text-2xl font-bold">{metrics ? metrics.paid : '—'}</div>
            </div>
            <div className="p-4 rounded-md border">
              <div className="text-sm text-muted-foreground">Pending</div>
              <div className="text-2xl font-bold">{metrics ? metrics.pending : '—'}</div>
            </div>
            <div className="p-4 rounded-md border">
              <div className="text-sm text-muted-foreground">Partially Paid</div>
              <div className="text-2xl font-bold">{metrics ? metrics.partially_paid : '—'}</div>
            </div>
            <div className="p-4 rounded-md border">
              <div className="text-sm text-muted-foreground">Overdue</div>
              <div className="text-2xl font-bold">{metrics ? metrics.overdue : '—'}</div>
            </div>
            <div className="p-4 rounded-md border">
              <div className="text-sm text-muted-foreground">Claims</div>
              <div className="text-2xl font-bold">{metrics ? metrics.claims : '—'}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Status UI removed per request */}

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
                        {inv.status === 'pending' && (
                          <>
                            <select className="border rounded h-8 px-2 text-sm mr-2" value={payMethodById[inv.id]||'control'} onChange={(e)=>setPayMethodById(prev=>({ ...prev, [inv.id]: e.target.value }))}>
                              <option value="control">Control</option>
                              <option value="zenopay">Zenopay</option>
                            </select>
                            <Button size="sm" onClick={() => initiate(inv.id)}>Initiate</Button>
                          </>
                        )}
                        <Button size="sm" variant="outline" onClick={() => generateCN(inv.id)}>CN Generate</Button>
                        <Button size="sm" variant="outline" onClick={() => listCN(inv.id)}>CN List</Button>
                        <Button size="sm" variant="outline" onClick={() => reissueCN(inv.id)}>CN Reissue</Button>
                        <Button size="sm" variant="outline" onClick={() => cancelCN(inv.id)}>CN Cancel</Button>
                        <Button size="sm" variant="outline" onClick={() => checkStatus(inv.id)}>Check</Button>
                        <Button size="sm" variant="secondary" onClick={async ()=>{
                          try{
                            const claim_number = prompt('Claim number:')||'';
                            const provider = prompt('Provider (e.g., NHIF):')||'';
                            const claim_amount_raw = prompt('Claim amount (optional):')||'';
                            const claim_amount = claim_amount_raw ? Number(claim_amount_raw) : undefined;
                            if (!claim_number) { toast({ variant:'destructive', title:'Claim number required' }); return; }
                            const headers: Record<string, string> = { 'Content-Type':'application/json', ...authHeaders() };
                            const res = await fetch('/api/insurance-claims', { method:'POST', headers, body: JSON.stringify({ invoice_id: inv.id, claim_number, provider, claim_amount }) });
                            if (!res.ok) { const t = await res.text(); throw new Error(t); }
                            toast({ title:'Claim submitted', description: claim_number });
                            await loadMetrics();
                          }catch(e:any){ toast({ variant:'destructive', title:'Submit claim failed', description: e?.message||'Unknown error' }); }
                        }}>Claim Create</Button>
                        <Button size="sm" variant="secondary" onClick={async ()=>{
                          try{
                            const res = await fetch(`/api/insurance-claims?invoice_id=${inv.id}`, { headers: authHeaders() });
                            if (!res.ok) { const t = await res.text(); throw new Error(t); }
                            const data = await res.json();
                            const cnt = Array.isArray(data) ? data.length : 0;
                            toast({ title:`Claims: ${cnt}`, description: cnt? (data[0]?.status || 'status') : 'None' });
                          }catch(e:any){ toast({ variant:'destructive', title:'Fetch claims failed', description: e?.message||'Unknown error' }); }
                        }}>Claims</Button>
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
