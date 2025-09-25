import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface RecordRow {
  id: number;
  patient_id: number;
  record_type: string;
  notes?: string;
  date: string; // YYYY-MM-DD
  created_at?: string;
}

interface PatientRecordStatus {
  id: number;
  name: string;
  records_count: number;
  last_record_date?: string | null;
}

const MedicalRecords = () => {
  const [selectedPatient, setSelectedPatient] = useState<PatientRecordStatus | null>(null);
  const [recordType, setRecordType] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [viewRecord, setViewRecord] = useState<RecordRow | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [loadingRecords, setLoadingRecords] = useState(true);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [records, setRecords] = useState<RecordRow[]>([]);

  const [loadingPatients, setLoadingPatients] = useState(true);
  const [patientsError, setPatientsError] = useState<string | null>(null);
  const [patients, setPatients] = useState<PatientRecordStatus[]>([]);
  const [role, setRole] = useState<string>("");

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

  const loadRecords = async () => {
    setLoadingRecords(true);
    setRecordsError(null);
    try {
      const res = await fetch("/api/records", { headers: authHeaders() });
      const data = await parseResponse(res);
      setRecords(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setRecordsError(err?.message || "Failed to load records");
    } finally {
      setLoadingRecords(false);
    }
  };

  const loadPatients = async () => {
    setLoadingPatients(true);
    setPatientsError(null);
    try {
      // Determine role to pick correct endpoint
      const meRes = await fetch("/api/me", { headers: authHeaders() });
      const me = await parseResponse(meRes);
      const role = String(me?.role || '').toLowerCase();
      setRole(role);

      if (role === 'patient') {
        // Load the current patient's info and records to compute status
        const pRes = await fetch(`/api/patients/by-user/${me.id}`, { headers: authHeaders() });
        const p = await parseResponse(pRes);
        // Load own records (already filtered by backend for patients)
        const rRes = await fetch('/api/records', { headers: authHeaders() });
        const recs: RecordRow[] = await parseResponse(rRes);
        const count = Array.isArray(recs) ? recs.length : 0;
        const last = count > 0 ? recs.reduce<string>((acc, cur) => (acc > cur.date ? acc : cur.date), recs[0].date) : null;
        setPatients([{ id: p.id, name: p.name, records_count: count, last_record_date: last }]);
        // Optional: auto-select the only available patient
        setSelectedPatient({ id: p.id, name: p.name, records_count: count, last_record_date: last });
      } else {
        // Staff endpoints
        let data: any[] = [];
        try {
          const res = await fetch("/api/patients/record-status", { headers: authHeaders() });
          data = await parseResponse(res);
        } catch (e) {
          // Fallback if route not available
          const res2 = await fetch('/api/patients/simple', { headers: authHeaders() });
          const simple = await parseResponse(res2);
          data = (Array.isArray(simple) ? simple : []).map((s: any) => ({ id: s.id, name: s.name, records_count: 0, last_record_date: null }));
        }
        setPatients(Array.isArray(data) ? data : []);
      }
    } catch (err: any) {
      setPatientsError(err?.message || "Failed to load patient list");
    } finally {
      setLoadingPatients(false);
    }
  };

  useEffect(() => { loadRecords(); loadPatients(); }, []);

  const submit = async () => {
    if (!selectedPatient) { alert("Select a patient from the list first"); return; }
    if (!recordType || !date) { alert("record_type and date are required"); return; }
    setSubmitting(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json", ...authHeaders() };
      const res = await fetch("/api/records", {
        method: "POST",
        headers,
        body: JSON.stringify({ patient_id: selectedPatient.id, record_type: recordType, notes, date })
      });
      await parseResponse(res);
      setRecordType(""); setDate(""); setNotes("");
      await Promise.all([loadRecords(), loadPatients()]);
      alert("Record saved");
    } catch (err: any) {
      alert(`Save failed: ${err?.message || "Unknown error"}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Medical Records</h1>

      {role !== 'patient' && (
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
                      <th className="py-2 pr-4">Records</th>
                      <th className="py-2 pr-4">Last Record</th>
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
                          <td className="py-2 pr-4">{p.records_count}</td>
                          <td className="py-2 pr-4">{p.last_record_date || ''}</td>
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
                        <td colSpan={5} className="py-4 text-muted-foreground">No patients found.</td>
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
            <CardTitle>Add Record {selectedPatient ? `for ${selectedPatient.name} (#${selectedPatient.id})` : ''}</CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedPatient && (
              <div className="text-sm text-muted-foreground mb-3">Select a patient from the list</div>
            )}
            <div className="grid grid-cols-1 gap-4">
              <div>
                <Label htmlFor="mr-type">Record Type</Label>
                <Input id="mr-type" placeholder="e.g. Diagnosis, Prescription" value={recordType} onChange={(e) => setRecordType(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="mr-date">Date</Label>
                <Input id="mr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="mr-notes">Notes</Label>
                <Textarea id="mr-notes" placeholder="Details" value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} />
              </div>
            </div>
            <div className="mt-4">
              <Button onClick={submit} disabled={submitting || !selectedPatient}>{submitting ? "Saving..." : "Save"}</Button>
            </div>
          </CardContent>
        </Card>
      </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Existing Medical Records</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingRecords && <div className="text-sm text-muted-foreground">Loading…</div>}
          {recordsError && <div className="text-sm text-rose-700">{recordsError}</div>}
          {!loadingRecords && !recordsError && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-4">ID</th>
                    <th className="py-2 pr-4">Patient ID</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map(r => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{r.id}</td>
                      <td className="py-2 pr-4">{r.patient_id}</td>
                      <td className="py-2 pr-4">{r.record_type}</td>
                      <td className="py-2 pr-4">{r.date}</td>
                      <td className="py-2 pr-4 truncate max-w-[240px]">
                        <div className="flex items-center gap-2">
                          <span className="inline-block overflow-hidden text-ellipsis whitespace-nowrap max-w-[200px]">{r.notes || ""}</span>
                          <Button size="sm" variant="secondary" onClick={() => setViewRecord(r)}>View</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {records.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-muted-foreground">No records found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!viewRecord} onOpenChange={(o) => { if (!o) setViewRecord(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Medical Record Details</DialogTitle>
          </DialogHeader>
          {viewRecord && (
            <div className="space-y-2 text-sm">
              <div><span className="font-medium">ID:</span> {viewRecord.id}</div>
              <div><span className="font-medium">Patient ID:</span> {viewRecord.patient_id}</div>
              <div><span className="font-medium">Type:</span> {viewRecord.record_type}</div>
              <div><span className="font-medium">Date:</span> {viewRecord.date}</div>
              <div><span className="font-medium">Notes:</span></div>
              <pre className="whitespace-pre-wrap bg-muted p-2 rounded border max-h-[60vh] overflow-auto">{viewRecord.notes || ''}</pre>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MedicalRecords;
