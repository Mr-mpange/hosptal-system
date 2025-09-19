import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RecordRow {
  id: number;
  patient_id: number;
  record_type: string;
  notes?: string;
  date: string; // YYYY-MM-DD
  created_at?: string;
}

const MedicalRecords = () => {
  const [patientId, setPatientId] = useState("");
  const [recordType, setRecordType] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<RecordRow[]>([]);

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
      const res = await fetch("/api/records", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await parseResponse(res);
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load records");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!patientId || !recordType || !date) { alert("patient_id, record_type and date are required"); return; }
    setSubmitting(true);
    try {
      const token = (() => { try { return localStorage.getItem("auth_token") || undefined; } catch { return undefined; } })();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch("/api/records", {
        method: "POST",
        headers,
        body: JSON.stringify({ patient_id: Number(patientId), record_type: recordType, notes, date })
      });
      await parseResponse(res);
      setPatientId(""); setRecordType(""); setDate(""); setNotes("");
      await load();
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

      <Card>
        <CardHeader>
          <CardTitle>Add Record</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="mr-patient">Patient ID</Label>
              <Input id="mr-patient" placeholder="e.g. 1" value={patientId} onChange={(e) => setPatientId(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="mr-type">Record Type</Label>
              <Input id="mr-type" placeholder="e.g. Diagnosis, Prescription" value={recordType} onChange={(e) => setRecordType(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="mr-date">Date</Label>
              <Input id="mr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <Label htmlFor="mr-notes">Notes</Label>
              <Input id="mr-notes" placeholder="Details" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={submit} disabled={submitting}>{submitting ? "Saving..." : "Save"}</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Patient Records</CardTitle>
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
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{r.id}</td>
                      <td className="py-2 pr-4">{r.patient_id}</td>
                      <td className="py-2 pr-4">{r.record_type}</td>
                      <td className="py-2 pr-4">{r.date}</td>
                      <td className="py-2 pr-4">{r.notes || ""}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
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
    </div>
  );
};

export default MedicalRecords;
