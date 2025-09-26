import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

// Simple icons as emoji to avoid adding additional deps
const Lock = () => <span aria-label="lock" title="Secure Payment">🔒</span>;

interface Invoice {
  id: number;
  patient_id: number;
  amount: string;
  date: string;
  status: string;
}

interface Props {
  logoSrc?: string; // defaults to /src/assets/logo.png
  primaryColor?: string; // default modern blue
  secondaryColor?: string; // default slate
  onAfterAction?: () => void; // refresh invoices/metrics
}

export default function CheckoutPanel({ logoSrc = "/src/assets/logo.png", primaryColor = "#0ea5e9", secondaryColor = "#334155", onAfterAction }: Props) {
  const { toast } = useToast();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<number | null>(null);

  const [tab, setTab] = useState<'mobile'|'bank'|'card'|'insurance'>('mobile');

  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [mobileProvider, setMobileProvider] = useState<'mpesa'|'airtel'|'tigopesa'|'halopesa'>('mpesa');
  const [bankProvider, setBankProvider] = useState<'crdb'|'nmb'|'other'>('crdb');
  const [insuranceProvider, setInsuranceProvider] = useState("NHIF");
  const [policyNumber, setPolicyNumber] = useState("");

  const [loading, setLoading] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  const authHeaders = () => {
    const token = (() => { try { return localStorage.getItem("auth_token") || undefined; } catch { return undefined; } })();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return headers;
  };

  const amount = useMemo(() => {
    const inv = invoices.find(i => i.id === selectedInvoice);
    return inv ? Number(inv.amount || 0) : 0;
  }, [selectedInvoice, invoices]);

  const loadInvoices = async () => {
    try {
      const res = await fetch('/api/invoices', { headers: authHeaders() });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setInvoices(Array.isArray(data) ? data : []);
      if (!selectedInvoice && Array.isArray(data) && data.length) setSelectedInvoice(data[0].id);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Load invoices failed', description: e?.message || 'Unknown error' });
    }
  };

  useEffect(() => { loadInvoices(); }, []);

  // Phone mask +255 XXX XXX XXX (best-effort)
  const formatPhone = (v: string) => {
    const digits = v.replace(/\D/g, '');
    if (digits.startsWith('255')) {
      const rest = digits.slice(3).slice(0,9);
      const parts = ["+255", rest.slice(0,3), rest.slice(3,6), rest.slice(6,9)].filter(Boolean);
      return parts.join(' ').trim();
    }
    if (digits.startsWith('0')) {
      const rest = digits.slice(1).slice(0,9);
      const parts = ["+255", rest.slice(0,3), rest.slice(3,6), rest.slice(6,9)].filter(Boolean);
      return parts.join(' ').trim();
    }
    return v;
  };

  const validate = (): string | null => {
    if (!selectedInvoice) return 'Select an invoice';
    if (tab === 'mobile') {
      const phoneDigits = buyerPhone.replace(/\D/g, '');
      if (!(phoneDigits.length === 12 && phoneDigits.startsWith('255'))) return 'Enter valid phone like +255 7xx xxx xxx';
      if (amount <= 0) return 'Amount must be greater than 0';
      if (!mobileProvider) return 'Choose mobile money provider';
    }
    if (tab === 'bank') {
      if (amount <= 0) return 'Amount must be greater than 0';
      if (!bankProvider) return 'Choose bank';
    }
    if (tab === 'insurance') {
      if (!policyNumber) return 'Enter policy number';
    }
    return null;
  };

  const confirmAndPay = async () => {
    const err = validate();
    if (err) { toast({ variant:'destructive', title:'Validation error', description: err }); return; }
    try {
      setLoading(true);
      setCheckoutUrl(null);
      setReference(null);
      setStatus(null);

      let method = 'control';
      let body: any = { invoice_id: selectedInvoice, method };

      if (tab === 'mobile') {
        method = 'zenopay';
        body = {
          invoice_id: selectedInvoice,
          method,
          buyer_phone: buyerPhone.replace(/\s+/g,'').replace(/^0/,'255'),
          buyer_name: buyerName || undefined,
          buyer_email: buyerEmail || undefined,
          provider: mobileProvider,
        };
      } else if (tab === 'card') {
        method = 'zenopay'; // placeholder until direct card integration; Zenopay may handle
        body = { invoice_id: selectedInvoice, method, buyer_name: buyerName || undefined, buyer_email: buyerEmail || undefined };
      } else if (tab === 'insurance') {
        // For now, just create claim and return
        const headers: Record<string, string> = { 'Content-Type':'application/json', ...authHeaders() };
        const res = await fetch('/api/insurance-claims', { method:'POST', headers, body: JSON.stringify({ invoice_id: selectedInvoice, claim_number: `CLM-${Date.now()}`, provider: insuranceProvider, claim_amount: amount }) });
        if (!res.ok) throw new Error(await res.text());
        toast({ title: 'Insurance claim submitted', description: `${insuranceProvider} • ${policyNumber}` });
        onAfterAction?.();
        return;
      } else if (tab === 'bank') {
        // Generate control number directly and return
        const headers: Record<string, string> = { 'Content-Type':'application/json', ...authHeaders() };
        const res = await fetch('/api/control-numbers', { method:'POST', headers, body: JSON.stringify({ invoice_id: selectedInvoice, provider: bankProvider }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || 'Control number failed');
        toast({ title:'Control number created', description: data?.number || '' });
        onAfterAction?.();
        return;
      }

      const headers: Record<string, string> = { 'Content-Type':'application/json', ...authHeaders() };
      const res = await fetch('/api/payments/initiate', { method:'POST', headers, body: JSON.stringify(body) });
      const p = await res.json();
      if (!res.ok) throw new Error(p?.message || 'Initiate failed');
      setReference(String(p.reference||''));
      setStatus(String(p.status||'initiated'));
      if (p.checkout_url) setCheckoutUrl(String(p.checkout_url));

      toast({ title: 'Processing started', description: `Ref: ${p.reference || 'N/A'}` });
      setPolling(true);
    } catch (e: any) {
      toast({ variant:'destructive', title:'Payment failed', description: e?.message || 'Unknown error' });
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (!polling || !reference) return;
    let timer: any;
    const tick = async () => {
      try {
        const res = await fetch(`/api/payments/status/${encodeURIComponent(reference)}`, { headers: authHeaders() });
        if (res.ok) {
          const row = await res.json();
          if (row) setStatus(String(row.status||''));
          if (row && (row.status === 'success' || row.status === 'failed')) {
            setPolling(false);
            onAfterAction?.();
          }
        }
      } catch {}
      timer = setTimeout(tick, 5000);
    };
    tick();
    return () => { if (timer) clearTimeout(timer); };
  }, [polling, reference]);

  const Branding = () => (
    <div className="flex items-center justify-between p-3 rounded-md" style={{ background: primaryColor, color: 'white' }}>
      <div className="flex items-center gap-3">
        <img src={logoSrc} alt="Logo" className="h-8 w-auto" onError={(e:any)=>{ e.currentTarget.style.display='none'; }} />
        <div className="font-semibold">Secure Payment</div>
      </div>
      <div className="flex items-center gap-2 opacity-90"><Lock/> <span className="text-sm">SSL Encrypted</span></div>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Checkout</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Branding/>

          {/* Trust logos */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>Visa</span>
            <span>Mastercard</span>
            <span>Mpesa</span>
            <span>Airtel Money</span>
            <span>TigoPesa</span>
            <span>HaloPesa</span>
            <span>CRDB</span>
            <span>NMB</span>
          </div>

          {/* Invoice selector */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <div className="text-sm mb-1">Invoice</div>
              <select className="border rounded h-9 px-2 w-full" value={selectedInvoice ?? ''} onChange={(e)=> setSelectedInvoice(e.target.value? Number(e.target.value): null)}>
                {invoices.map(inv => (
                  <option key={inv.id} value={inv.id}>#{inv.id} • {inv.date} • {inv.amount} • {inv.status}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-sm mb-1">Patient (optional)</div>
              <Input value={buyerName} onChange={e=> setBuyerName(e.target.value)} placeholder="Full name"/>
            </div>
            <div>
              <div className="text-sm mb-1">Email (optional)</div>
              <Input type="email" value={buyerEmail} onChange={e=> setBuyerEmail(e.target.value)} placeholder="name@example.com"/>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-2 mt-2">
            <Button type="button" variant={tab==='mobile'? 'default':'outline'} onClick={()=> setTab('mobile')}>Mobile Money</Button>
            <Button type="button" variant={tab==='bank'? 'default':'outline'} onClick={()=> setTab('bank')}>Bank Transfer</Button>
            <Button type="button" variant={tab==='card'? 'default':'outline'} onClick={()=> setTab('card')}>Card (Visa/Mastercard)</Button>
            <Button type="button" variant={tab==='insurance'? 'default':'outline'} onClick={()=> setTab('insurance')}>Insurance (NHIF)</Button>
          </div>

          {/* Right panel forms */}
          {tab === 'mobile' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <div className="text-sm mb-1">Phone Number</div>
                <Input value={buyerPhone} onChange={e=> setBuyerPhone(formatPhone(e.target.value))} placeholder="+255 7xx xxx xxx"/>
              </div>
              <div>
                <div className="text-sm mb-1">Provider</div>
                <select className="border rounded h-9 px-2 w-full" value={mobileProvider} onChange={e=> setMobileProvider(e.target.value as any)}>
                  <option value="mpesa">Mpesa</option>
                  <option value="airtel">Airtel Money</option>
                  <option value="tigopesa">TigoPesa</option>
                  <option value="halopesa">HaloPesa</option>
                </select>
              </div>
              <div>
                <div className="text-sm mb-1">Amount</div>
                <Input value={amount ? amount.toFixed(2): ''} readOnly/>
              </div>
              <div className="flex items-end gap-2">
                <Button onClick={confirmAndPay} disabled={loading}>{loading? 'Processing...' : 'Confirm & Pay'}</Button>
                <Button variant="outline" disabled={loading} onClick={async ()=>{
                  const err = validate();
                  if (err) { toast({ variant:'destructive', title:'Validation error', description: err }); return; }
                  try {
                    setLoading(true);
                    setCheckoutUrl(null); setReference(null); setStatus(null);
                    const headers: Record<string, string> = { 'Content-Type':'application/json', ...authHeaders() };
                    const phoneRaw = buyerPhone.replace(/\s+/g,'').replace(/^0/,'255');
                    const res = await fetch('/api/payments/push', { method:'POST', headers, body: JSON.stringify({ invoice_id: selectedInvoice, provider: mobileProvider, phone: phoneRaw }) });
                    const row = await res.json();
                    if (!res.ok) throw new Error(row?.message || 'Push failed');
                    setReference(String(row.reference||''));
                    setStatus(String(row.status||'initiated'));
                    toast({ title:'Push sent', description:`Ref: ${row.reference || 'N/A'}` });
                    setPolling(true);
                  } catch (e:any) {
                    toast({ variant:'destructive', title:'Push failed', description: e?.message || 'Unknown error' });
                  } finally { setLoading(false); }
                }}>Send Push</Button>
              </div>
            </div>
          )}

          {tab === 'bank' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <div className="text-sm mb-1">Bank</div>
                <select className="border rounded h-9 px-2 w-full" value={bankProvider} onChange={e=> setBankProvider(e.target.value as any)}>
                  <option value="crdb">CRDB</option>
                  <option value="nmb">NMB</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <div className="text-sm mb-1">Amount</div>
                <Input value={amount ? amount.toFixed(2): ''} readOnly/>
              </div>
              <div className="md:col-span-1 flex items-end">
                <Button onClick={confirmAndPay} disabled={loading}>{loading? 'Generating CN...' : 'Confirm & Generate Control Number'}</Button>
              </div>
            </div>
          )}

          {tab === 'card' && (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Card payments via provider. UI placeholder; routed through Zenopay when available.</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <div className="text-sm mb-1">Cardholder Name</div>
                  <Input value={buyerName} onChange={e=> setBuyerName(e.target.value)} placeholder="As on card"/>
                </div>
                <div>
                  <div className="text-sm mb-1">Email (for receipt)</div>
                  <Input type="email" value={buyerEmail} onChange={e=> setBuyerEmail(e.target.value)} placeholder="name@example.com"/>
                </div>
                <div className="flex items-end">
                  <Button onClick={confirmAndPay} disabled={loading}>{loading? 'Processing...' : 'Confirm & Pay'}</Button>
                </div>
              </div>
            </div>
          )}

          {tab === 'insurance' && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <div className="text-sm mb-1">Provider</div>
                <select className="border rounded h-9 px-2 w-full" value={insuranceProvider} onChange={e=> setInsuranceProvider(e.target.value)}>
                  <option>NHIF</option>
                  <option>Jubilee</option>
                  <option>AAR</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <div className="text-sm mb-1">Policy Number</div>
                <Input value={policyNumber} onChange={e=> setPolicyNumber(e.target.value)} placeholder="Policy #"/>
              </div>
              <div className="flex items-end">
                <Button onClick={confirmAndPay} disabled={loading}>{loading? 'Submitting...' : 'Submit Claim'}</Button>
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="rounded-md border p-3">
            <div className="text-sm font-medium mb-2">Summary</div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-sm">
              <div>Invoice: #{selectedInvoice ?? '—'}</div>
              <div>Method: {tab === 'mobile' ? 'Mobile Money' : tab === 'bank' ? 'Bank Transfer (CN)' : tab === 'card' ? 'Card' : 'Insurance (NHIF)'}</div>
              <div>Amount: {amount ? amount.toFixed(2) : '—'}</div>
              <div>Phone: {buyerPhone ? buyerPhone.replace(/(\+255\s\d{3})\s\d{3}\s(\d{3})/, '$1 *** ***') : '—'}</div>
            </div>
          </div>

          {/* Status + Actions */}
          {(reference || checkoutUrl) && (
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="text-sm">
                {status ? <span>Status: <span className="capitalize">{status}</span></span> : <span>⏳ Waiting for confirmation…</span>}
                {reference && <span className="ml-2">Ref: <span className="font-mono">{reference}</span></span>}
              </div>
              <div className="flex items-center gap-2">
                {checkoutUrl && <Button onClick={()=> window.open(checkoutUrl!, '_blank')}>Proceed to Pay</Button>}
                <Button variant="outline" onClick={()=> setPolling(true)} disabled={polling}>Refresh</Button>
              </div>
            </div>
          )}

        </div>
      </CardContent>
    </Card>
  );
}
