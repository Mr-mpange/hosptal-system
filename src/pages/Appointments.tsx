import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AppointmentRow {
  id: number;
  patient_id: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  notes?: string;
  created_at?: string;
}

const Appointments = () => {
  const [patientId, setPatientId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<AppointmentRow[]>([]);

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
      const res = await fetch("/api/appointments", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await parseResponse(res);
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load appointments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!patientId || !date || !time) { alert("patient_id, date and time are required"); return; }
    setSubmitting(true);
    try {
      const token = (() => { try { return localStorage.getItem("auth_token") || undefined; } catch { return undefined; } })();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers,
        body: JSON.stringify({ patient_id: Number(patientId), date, time, notes })
      });
      await parseResponse(res);
      setPatientId(""); setDate(""); setTime(""); setNotes("");
      await load();
      alert("Appointment scheduled");
    } catch (err: any) {
      alert(`Schedule failed: ${err?.message || "Unknown error"}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Appointments</h1>

      <Card>
        <CardHeader>
          <CardTitle>Book New Appointment</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="a-patient">Patient ID</Label>
              <Input id="a-patient" placeholder="e.g. 1" value={patientId} onChange={(e) => setPatientId(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="a-date">Date</Label>
              <Input id="a-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="a-time">Time</Label>
              <Input id="a-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <Label htmlFor="a-notes">Notes</Label>
              <Input id="a-notes" placeholder="Optional notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={submit} disabled={submitting}>{submitting ? "Scheduling..." : "Schedule"}</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming Appointments</CardTitle>
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
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Time</th>
                    <th className="py-2 pr-4">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(a => (
                    <tr key={a.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{a.id}</td>
                      <td className="py-2 pr-4">{a.patient_id}</td>
                      <td className="py-2 pr-4">{a.date}</td>
                      <td className="py-2 pr-4">{a.time}</td>
                      <td className="py-2 pr-4">{a.notes || ""}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-muted-foreground">No appointments found.</td>
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

export default Appointments;
