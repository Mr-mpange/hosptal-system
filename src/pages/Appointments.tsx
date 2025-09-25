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

interface SimplePatient {
  id: number;
  name: string;
  email?: string;
}

const Appointments = () => {
  const [selectedPatient, setSelectedPatient] = useState<SimplePatient | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<AppointmentRow[]>([]);

  const [loadingPatients, setLoadingPatients] = useState(true);
  const [patientsError, setPatientsError] = useState<string | null>(null);
  const [patients, setPatients] = useState<SimplePatient[]>([]);
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

  const loadAppointments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/appointments", { headers: authHeaders() });
      const data = await parseResponse(res);
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load appointments");
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
      setRole(role);

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
          // Fallback: empty list if not available
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

  useEffect(() => { loadAppointments(); loadPatients(); }, []);

  const submit = async () => {
    if (!selectedPatient || !date || !time) { alert("Select a patient and provide date/time"); return; }
    setSubmitting(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json", ...authHeaders() };
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers,
        body: JSON.stringify({ patient_id: selectedPatient.id, date, time, notes })
      });
      await parseResponse(res);
      setDate(""); setTime(""); setNotes("");
      await loadAppointments();
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
            <CardTitle>Book New Appointment {selectedPatient ? `for ${selectedPatient.name} (#${selectedPatient.id})` : ''}</CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedPatient && (
              <div className="text-sm text-muted-foreground mb-3">Select a patient from the list</div>
            )}
            <div className="grid grid-cols-1 gap-4">
              <div>
                <Label htmlFor="a-date">Date</Label>
                <Input id="a-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="a-time">Time</Label>
                <Input id="a-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="a-notes">Notes</Label>
                <Input id="a-notes" placeholder="Optional notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
            <div className="mt-4">
              <Button onClick={submit} disabled={submitting || !selectedPatient}>{submitting ? "Scheduling..." : "Schedule"}</Button>
            </div>
          </CardContent>
        </Card>
      </div>
      )}

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
