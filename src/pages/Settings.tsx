import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import {
  LayoutGrid,
  Building2,
  Palette,
  Phone,
  Users,
  ShieldCheck,
  KeyRound,
  CreditCard,
  Landmark,
  Shield,
  CalendarCheck,
  Bell,
  BarChart3,
  DatabaseBackup,
  FileDown,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

type SettingsShape = {
  application: {
    app_name: string;
    logo_url: string;
    primary_color: string;
    secondary_color: string;
    contact_email?: string;
    contact_phone?: string;
  };
  billing: {
    enable_push_to_pay: boolean;
    default_mobile_provider: 'mpesa'|'airtel'|'tigopesa'|'halopesa';
    default_bank_provider: 'crdb'|'nmb'|'other';
    allow_amount_override: boolean;
  };
  notifications: {
    role_scoped: boolean;
  };
};

const categories = [
  {
    key: 'general', label: 'General', icon: LayoutGrid, items: [
      { key: 'hospital-info', label: 'Hospital Info', icon: Building2 },
      { key: 'branding', label: 'Branding', icon: Palette },
      { key: 'contact', label: 'Contact Info', icon: Phone },
      { key: 'preferences', label: 'Preferences', icon: LayoutGrid },
      { key: 'appearance', label: 'Appearance', icon: Palette },
    ]
  },
  {
    key: 'users', label: 'Users & Roles', icon: Users, items: [
      { key: 'user-management', label: 'User Management', icon: Users },
      { key: 'roles-permissions', label: 'Roles & Permissions', icon: ShieldCheck },
      { key: 'security', label: 'Security', icon: KeyRound },
      { key: 'twofa', label: 'Two-Factor Auth (2FA)', icon: ShieldCheck },
    ]
  },
  {
    key: 'billing', label: 'Billing & Payments', icon: CreditCard, items: [
      { key: 'payment-methods', label: 'Payment Methods', icon: CreditCard },
      { key: 'control-numbers', label: 'Control Numbers', icon: Landmark },
      { key: 'insurance', label: 'Insurance Providers', icon: Shield },
      { key: 'invoice', label: 'Invoice Settings', icon: FileDown },
    ]
  },
  {
    key: 'appointments', label: 'Appointments', icon: CalendarCheck, items: [
      { key: 'scheduling', label: 'Scheduling Rules', icon: CalendarCheck },
      { key: 'approvals', label: 'Approvals', icon: ShieldCheck },
      { key: 'notifications', label: 'Notifications', icon: Bell },
    ]
  },
  {
    key: 'reports', label: 'Reports & Data', icon: BarChart3, items: [
      { key: 'export', label: 'Export Data', icon: FileDown },
      { key: 'reports', label: 'Reports', icon: BarChart3 },
      { key: 'backup', label: 'Backup & Restore', icon: DatabaseBackup },
    ]
  },
];

const Settings = () => {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SettingsShape | null>(null);
  const [saving, setSaving] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ general: true, users: true, billing: true, appointments: false, reports: false });
  const [activeItem, setActiveItem] = useState<string>('hospital-info');
  // Client-side preferences and theme
  const [prefs, setPrefs] = useState<{ language: string; timezone: string; date_format: string; notifications_email: boolean; notifications_sms: boolean }>({ language: 'en', timezone: 'Africa/Dar_es_Salaam', date_format: 'YYYY-MM-DD', notifications_email: true, notifications_sms: false });
  const [theme, setTheme] = useState<'light'|'dark'>(() => {
    try { return (localStorage.getItem('theme') as 'light'|'dark') || 'light'; } catch { return 'light'; }
  });
  // 2FA
  const [twofaEnabled, setTwofaEnabled] = useState<boolean>(false);
  const [twofaSecret, setTwofaSecret] = useState<string>('');
  const [twofaOtpAuth, setTwofaOtpAuth] = useState<string>('');
  const [twofaCode, setTwofaCode] = useState<string>('');
  const [twofaMethod, setTwofaMethod] = useState<'totp'|'otp'>('totp');
  const [twofaContact, setTwofaContact] = useState<string>('');

  const authHeaders = useMemo(() => {
    const token = (() => { try { return localStorage.getItem("auth_token") || undefined; } catch { return undefined; } })();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return headers;
  }, []);

  const role = useMemo(() => {
    try {
      const raw = localStorage.getItem('auth_user');
      if (!raw) return 'patient';
      const u = JSON.parse(raw);
      return String(u?.role || 'patient').toLowerCase();
    } catch { return 'patient'; }
  }, []);

  const canEdit = role === 'admin';

  const load = async () => {
    try {
      const res = await fetch('/api/settings', { headers: authHeaders });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSettings(data);
    } catch (e:any) {
      toast({ variant:'destructive', title:'Load failed', description: e?.message || 'Unknown error' });
    }
  };

  useEffect(() => { 
    load();
    // Initialize preferences from localStorage
    try {
      const raw = localStorage.getItem('user_prefs');
      if (raw) setPrefs({ ...prefs, ...JSON.parse(raw) });
    } catch {}
    // Apply theme on mount
    applyTheme(theme);
    // Load 2FA status
    (async () => {
      try {
        const res = await fetch('/api/2fa/status', { headers: authHeaders });
        if (res.ok) {
          const data = await res.json();
          setTwofaEnabled(!!data?.enabled);
        }
      } catch {}
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { applyTheme(theme); try { localStorage.setItem('theme', theme); } catch {} }, [theme]);

  const applyTheme = (t: 'light'|'dark') => {
    try {
      const root = document.documentElement;
      if (t === 'dark') root.classList.add('dark'); else root.classList.remove('dark');
    } catch {}
  };

  const save = async () => {
    if (!canEdit || !settings) return;
    try {
      setSaving(true);
      const headers: Record<string,string> = { 'Content-Type': 'application/json', ...authHeaders };
      const res = await fetch('/api/settings', { method:'PUT', headers, body: JSON.stringify(settings) });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSettings(data);
      toast({ title:'Settings saved' });
    } catch (e:any) {
      toast({ variant:'destructive', title:'Save failed', description: e?.message || 'Unknown error' });
    } finally { setSaving(false); }
  };

  if (!settings) return <div className="p-6 text-sm text-muted-foreground">Loading settings…</div>;

  const NavCategory = ({ c }: { c: typeof categories[number] }) => {
    const Icon = c.icon;
    const isOpen = !!expanded[c.key];
    return (
      <div className="rounded-lg bg-card/50 border shadow-sm overflow-hidden">
        <button
          onClick={() => setExpanded(prev => ({ ...prev, [c.key]: !prev[c.key] }))}
          className="w-full flex items-center justify-between px-3 py-2 hover:bg-accent/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4" />
            {!sidebarCollapsed && <span className="font-medium text-sm">{c.label}</span>}
          </div>
          {!sidebarCollapsed && (isOpen ? <ChevronDown className="w-4 h-4"/> : <ChevronRight className="w-4 h-4"/>) }
        </button>
        {isOpen && (
          <div className="px-2 py-1">
            {c.items.map(item => {
              const It = item.icon;
              const active = activeItem === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setActiveItem(item.key)}
                  className={`w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm transition-colors ${active ? 'bg-primary/10 text-primary' : 'hover:bg-accent/30'}`}
                >
                  <It className="w-4 h-4"/>
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <button onClick={() => setSidebarCollapsed(s => !s)} className="inline-flex items-center gap-2 border rounded-md px-3 py-2 hover:bg-accent/30">
            {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4"/> : <PanelLeftClose className="w-4 h-4"/>}
            <span className="hidden sm:inline text-sm">{sidebarCollapsed ? 'Expand' : 'Collapse'} Sidebar</span>
          </button>
          <h1 className="text-xl sm:text-2xl font-bold">Settings</h1>
        </div>
        <div>
          <Button onClick={save} disabled={!canEdit || saving}>{saving ? 'Saving…' : 'Save Settings'}</Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        <aside className={`${sidebarCollapsed ? 'w-16' : 'w-72'} hidden md:block p-3 border-r bg-background transition-all duration-300 overflow-auto`}> 
          <div className="space-y-2">
            {categories.map(c => <NavCategory key={c.key} c={c} />)}
          </div>
        </aside>

        {/* Content */}
        <section className="flex-1 p-4 overflow-auto">
          {/* General: Preferences */}
          {activeItem === 'preferences' && (
            <Card className="mb-4">
              <CardHeader><CardTitle>Preferences</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="mb-1 block">Language</Label>
                    <select className="border rounded px-3 py-2 w-full" value={prefs.language} onChange={(e)=> setPrefs({ ...prefs, language: e.target.value })}>
                      <option value="en">English</option>
                      <option value="sw">Swahili</option>
                    </select>
                  </div>
                  <div>
                    <Label className="mb-1 block">Timezone</Label>
                    <input className="border rounded px-3 py-2 w-full" value={prefs.timezone} onChange={(e)=> setPrefs({ ...prefs, timezone: e.target.value })} placeholder="Africa/Dar_es_Salaam"/>
                  </div>
                  <div>
                    <Label className="mb-1 block">Date Format</Label>
                    <select className="border rounded px-3 py-2 w-full" value={prefs.date_format} onChange={(e)=> setPrefs({ ...prefs, date_format: e.target.value })}>
                      <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                      <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                      <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    </select>
                  </div>
                  <div>
                    <Label className="mb-1 block">Notifications</Label>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={prefs.notifications_email} onChange={(e)=> setPrefs({ ...prefs, notifications_email: e.target.checked })}/> Email</label>
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={prefs.notifications_sms} onChange={(e)=> setPrefs({ ...prefs, notifications_sms: e.target.checked })}/> SMS</label>
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <Button variant="secondary" onClick={()=> { try { localStorage.setItem('user_prefs', JSON.stringify(prefs)); toast({ title:'Preferences saved' }); } catch { toast({ variant:'destructive', title:'Failed to save preferences' }); }}}>Save Preferences</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* General: Appearance */}
          {activeItem === 'appearance' && (
            <Card className="mb-4">
              <CardHeader><CardTitle>Appearance</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="mb-1 block">Theme</Label>
                    <div className="flex items-center gap-3">
                      <button onClick={()=> setTheme('light')} className={`px-3 py-2 rounded border ${theme==='light'?'bg-primary/10 border-primary text-primary':''}`}>Light</button>
                      <button onClick={()=> setTheme('dark')} className={`px-3 py-2 rounded border ${theme==='dark'?'bg-primary/10 border-primary text-primary':''}`}>Dark</button>
                    </div>
                  </div>
                </div>
                <div className="mt-4 text-sm text-muted-foreground">Theme is stored locally in your browser and applied instantly.</div>
              </CardContent>
            </Card>
          )}
          {/* General: Hospital Info */}
          {activeItem === 'hospital-info' && (
            <Card className="mb-4">
              <CardHeader><CardTitle>Hospital Info</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="mb-1 block">Application Name</Label>
                    <input className="border rounded px-3 py-2 w-full" value={settings.application.app_name || ''} onChange={(e)=> setSettings({ ...settings!, application: { ...settings!.application, app_name: e.target.value }})} disabled={!canEdit}/>
                  </div>
                  <div>
                    <Label className="mb-1 block">Contact Email</Label>
                    <input className="border rounded px-3 py-2 w-full" value={settings.application.contact_email || ''} onChange={(e)=> setSettings({ ...settings!, application: { ...settings!.application, contact_email: e.target.value }})} disabled={!canEdit}/>
                  </div>
                  <div>
                    <Label className="mb-1 block">Contact Phone</Label>
                    <input className="border rounded px-3 py-2 w-full" value={settings.application.contact_phone || ''} onChange={(e)=> setSettings({ ...settings!, application: { ...settings!.application, contact_phone: e.target.value }})} disabled={!canEdit}/>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* General: Branding */}
          {activeItem === 'branding' && (
            <Card className="mb-4">
              <CardHeader><CardTitle>Branding</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="mb-1 block">Logo URL</Label>
                    <input className="border rounded px-3 py-2 w-full" value={settings.application.logo_url || ''} onChange={(e)=> setSettings({ ...settings!, application: { ...settings!.application, logo_url: e.target.value }})} disabled={!canEdit}/>
                  </div>
                  <div>
                    <Label className="mb-1 block">Primary Color</Label>
                    <input type="color" className="border rounded px-3 py-2 w-full h-10" value={settings.application.primary_color || '#0ea5e9'} onChange={(e)=> setSettings({ ...settings!, application: { ...settings!.application, primary_color: e.target.value }})} disabled={!canEdit}/>
                  </div>
                  <div>
                    <Label className="mb-1 block">Secondary Color</Label>
                    <input type="color" className="border rounded px-3 py-2 w-full h-10" value={settings.application.secondary_color || '#334155'} onChange={(e)=> setSettings({ ...settings!, application: { ...settings!.application, secondary_color: e.target.value }})} disabled={!canEdit}/>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* General: Contact Info */}
          {activeItem === 'contact' && (
            <Card className="mb-4">
              <CardHeader><CardTitle>Contact Info</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="mb-1 block">Contact Email</Label>
                    <input className="border rounded px-3 py-2 w-full" value={settings.application.contact_email || ''} onChange={(e)=> setSettings({ ...settings!, application: { ...settings!.application, contact_email: e.target.value }})} disabled={!canEdit}/>
                  </div>
                  <div>
                    <Label className="mb-1 block">Contact Phone</Label>
                    <input className="border rounded px-3 py-2 w-full" value={settings.application.contact_phone || ''} onChange={(e)=> setSettings({ ...settings!, application: { ...settings!.application, contact_phone: e.target.value }})} disabled={!canEdit}/>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Billing & Payments: Payment Methods */}
          {activeItem === 'payment-methods' && (
            <Card className="mb-4">
              <CardHeader><CardTitle>Payment Methods</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="mb-1 block">Enable Push-to-Pay</Label>
                    <select className="border rounded px-3 py-2 w-full" value={String(settings.billing.enable_push_to_pay)} onChange={(e)=> setSettings({ ...settings!, billing: { ...settings!.billing, enable_push_to_pay: e.target.value === 'true' }})} disabled={!canEdit}>
                      <option value="true">Enabled</option>
                      <option value="false">Disabled</option>
                    </select>
                  </div>
                  <div>
                    <Label className="mb-1 block">Allow Amount Override</Label>
                    <select className="border rounded px-3 py-2 w-full" value={String(settings.billing.allow_amount_override)} onChange={(e)=> setSettings({ ...settings!, billing: { ...settings!.billing, allow_amount_override: e.target.value === 'true' }})} disabled={!canEdit}>
                      <option value="true">Allowed</option>
                      <option value="false">Not Allowed</option>
                    </select>
                  </div>
                  <div>
                    <Label className="mb-1 block">Default Mobile Provider</Label>
                    <select className="border rounded px-3 py-2 w-full" value={settings.billing.default_mobile_provider} onChange={(e)=> setSettings({ ...settings!, billing: { ...settings!.billing, default_mobile_provider: e.target.value as any }})} disabled={!canEdit}>
                      <option value="mpesa">Mpesa</option>
                      <option value="airtel">Airtel Money</option>
                      <option value="tigopesa">TigoPesa</option>
                      <option value="halopesa">HaloPesa</option>
                    </select>
                  </div>
                  <div>
                    <Label className="mb-1 block">Default Bank</Label>
                    <select className="border rounded px-3 py-2 w-full" value={settings.billing.default_bank_provider} onChange={(e)=> setSettings({ ...settings!, billing: { ...settings!.billing, default_bank_provider: e.target.value as any }})} disabled={!canEdit}>
                      <option value="crdb">CRDB</option>
                      <option value="nmb">NMB</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Placeholders for other subsections */}
          {activeItem === 'control-numbers' && (
            <Card className="mb-4"><CardHeader><CardTitle>Control Numbers</CardTitle></CardHeader><CardContent>
              <p className="text-sm text-muted-foreground">Manage CN expiry, reissue rules, and providers here. (Coming soon)</p>
            </CardContent></Card>
          )}
          {activeItem === 'insurance' && (
            <Card className="mb-4"><CardHeader><CardTitle>Insurance Providers</CardTitle></CardHeader><CardContent>
              <p className="text-sm text-muted-foreground">Configure accepted insurers and claim rules. (Coming soon)</p>
            </CardContent></Card>
          )}
          {activeItem === 'invoice' && (
            <Card className="mb-4"><CardHeader><CardTitle>Invoice Settings</CardTitle></CardHeader><CardContent>
              <p className="text-sm text-muted-foreground">Set numbering, due dates, and templates. (Coming soon)</p>
            </CardContent></Card>
          )}
          {activeItem === 'user-management' && (
            <Card className="mb-4"><CardHeader><CardTitle>User Management</CardTitle></CardHeader><CardContent>
              <p className="text-sm text-muted-foreground">Create, edit, and deactivate users. (Coming soon)</p>
            </CardContent></Card>
          )}
          {activeItem === 'roles-permissions' && (
            <Card className="mb-4"><CardHeader><CardTitle>Roles & Permissions</CardTitle></CardHeader><CardContent>
              <p className="text-sm text-muted-foreground">Assign permissions per role. (Coming soon)</p>
            </CardContent></Card>
          )}
          {activeItem === 'security' && (
            <Card className="mb-4"><CardHeader><CardTitle>Security</CardTitle></CardHeader><CardContent>
              <p className="text-sm text-muted-foreground">Password policy, MFA, and session settings. (Coming soon)</p>
            </CardContent></Card>
          )}
          {activeItem === 'twofa' && (
            <Card className="mb-4"><CardHeader><CardTitle>Two-Factor Authentication (2FA)</CardTitle></CardHeader><CardContent>
              <p className="text-sm text-muted-foreground mb-3">Enhance account security by requiring a 6-digit code from an authenticator app (Google Authenticator, Authy, etc.).</p>
              {!twofaEnabled ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="mb-1 block">Method</Label>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-sm"><input type="radio" name="twofa_method" checked={twofaMethod==='totp'} onChange={()=> setTwofaMethod('totp')}/> Authenticator App (TOTP)</label>
                      <label className="flex items-center gap-2 text-sm"><input type="radio" name="twofa_method" checked={twofaMethod==='otp'} onChange={()=> setTwofaMethod('otp')}/> OTP via Email/SMS</label>
                    </div>
                  </div>
                  {twofaMethod === 'totp' && (
                    !twofaSecret ? (
                      <Button onClick={async ()=>{
                        try {
                          const res = await fetch('/api/2fa/setup', { method:'POST', headers: { 'Content-Type':'application/json', ...authHeaders } });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data?.message||'Setup failed');
                          setTwofaSecret(String(data.secret||''));
                          setTwofaOtpAuth(String(data.otpauth||''));
                        } catch (e:any) { toast({ variant:'destructive', title:'Setup failed', description: e?.message||'Unknown error' }); }
                      }}>Begin 2FA Setup</Button>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <Label className="mb-1 block">Scan QR</Label>
                          <div className="p-2 border rounded inline-block bg-white">
                            <img alt="2FA QR" src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(twofaOtpAuth)}`} />
                          </div>
                          <div className="text-xs text-muted-foreground mt-2">Alternatively, enter the secret manually.</div>
                        </div>
                        <div>
                          <Label className="mb-1 block">Secret</Label>
                          <div className="text-sm break-all p-2 border rounded bg-muted/30">{twofaSecret}</div>
                        </div>
                        <div>
                          <Label className="mb-1 block">Enter 6-digit code</Label>
                          <input className="border rounded px-3 py-2 w-full max-w-xs" value={twofaCode} onChange={(e)=> setTwofaCode(e.target.value)} placeholder="123456"/>
                        </div>
                        <div>
                          <Button onClick={async ()=>{
                            try {
                              const res = await fetch('/api/2fa/verify', { method:'POST', headers: { 'Content-Type':'application/json', ...authHeaders }, body: JSON.stringify({ code: twofaCode }) });
                              const data = await res.json();
                              if (!res.ok) throw new Error(data?.message||'Verification failed');
                              setTwofaEnabled(true);
                              toast({ title:'2FA enabled' });
                            } catch (e:any) { toast({ variant:'destructive', title:'Verification failed', description: e?.message || 'Unknown error' }); }
                          }}>Verify & Enable</Button>
                        </div>
                      </div>
                    )
                  )}

                  {twofaMethod === 'otp' && (
                    <div className="space-y-3">
                      <div>
                        <Label className="mb-1 block">Contact (Email or Phone)</Label>
                        <input className="border rounded px-3 py-2 w-full max-w-md" placeholder="patient@example.com or +2557xxxxxxx" value={twofaContact} onChange={(e)=> setTwofaContact(e.target.value)} />
                        <div className="text-xs text-muted-foreground mt-1">We will send a 6-digit code to this contact.</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="secondary" onClick={async ()=>{
                          try {
                            const headers: Record<string,string> = { 'Content-Type':'application/json', ...authHeaders };
                            const res = await fetch('/api/2fa/method', { method:'POST', headers, body: JSON.stringify({ method:'otp', contact: twofaContact }) });
                            const data = await res.json();
                            if (!res.ok) throw new Error(data?.message||'Failed to set method');
                            const r2 = await fetch('/api/2fa/otp/request', { method:'POST', headers, body: JSON.stringify({}) });
                            const d2 = await r2.json();
                            if (!r2.ok) throw new Error(d2?.message||'Failed to send OTP');
                            toast({ title:'OTP sent', description:`Check ${d2.channel}: ${d2.to}` });
                          } catch (e:any) { toast({ variant:'destructive', title:'Failed to send OTP', description: e?.message || 'Unknown error' }); }
                        }}>Send OTP</Button>
                        <input className="border rounded px-3 py-2 w-32" placeholder="123456" value={twofaCode} onChange={(e)=> setTwofaCode(e.target.value)} />
                        <Button onClick={async ()=>{
                          try {
                            const headers: Record<string,string> = { 'Content-Type':'application/json', ...authHeaders };
                            const res = await fetch('/api/2fa/otp/verify', { method:'POST', headers, body: JSON.stringify({ code: twofaCode }) });
                            const data = await res.json();
                            if (!res.ok) throw new Error(data?.message||'Verification failed');
                            setTwofaEnabled(true);
                            toast({ title:'2FA enabled (OTP)' });
                          } catch (e:any) { toast({ variant:'destructive', title:'Verification failed', description: e?.message || 'Unknown error' }); }
                        }}>Verify & Enable</Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-sm">2FA is currently <span className="text-green-600 font-medium">ENABLED</span> for your account.</div>
                  <Button variant="destructive" onClick={async ()=>{
                    try {
                      const res = await fetch('/api/2fa/disable', { method:'POST', headers: { 'Content-Type':'application/json', ...authHeaders } });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data?.message||'Disable failed');
                      setTwofaEnabled(false); setTwofaSecret(''); setTwofaOtpAuth(''); setTwofaCode('');
                      toast({ title:'2FA disabled' });
                    } catch (e:any) { toast({ variant:'destructive', title:'Disable failed', description: e?.message||'Unknown error' }); }
                  }}>Disable 2FA</Button>
                </div>
              )}
            </CardContent></Card>
          )}
          {activeItem === 'scheduling' && (
            <Card className="mb-4"><CardHeader><CardTitle>Scheduling Rules</CardTitle></CardHeader><CardContent>
              <p className="text-sm text-muted-foreground">Clinic hours, slot size, and buffers. (Coming soon)</p>
            </CardContent></Card>
          )}
          {activeItem === 'approvals' && (
            <Card className="mb-4"><CardHeader><CardTitle>Approvals</CardTitle></CardHeader><CardContent>
              <p className="text-sm text-muted-foreground">Approval flows for appointments. (Coming soon)</p>
            </CardContent></Card>
          )}
          {activeItem === 'notifications' && (
            <Card className="mb-4"><CardHeader><CardTitle>Appointment Notifications</CardTitle></CardHeader><CardContent>
              <p className="text-sm text-muted-foreground">Reminders and confirmations. (Coming soon)</p>
            </CardContent></Card>
          )}
          {activeItem === 'export' && (
            <Card className="mb-4"><CardHeader><CardTitle>Export Data</CardTitle></CardHeader><CardContent>
              <p className="text-sm text-muted-foreground">Export patients, invoices, and records. (Coming soon)</p>
            </CardContent></Card>
          )}
          {activeItem === 'reports' && (
            <Card className="mb-4"><CardHeader><CardTitle>Reports</CardTitle></CardHeader><CardContent>
              <p className="text-sm text-muted-foreground">Generate operational and financial reports. (Coming soon)</p>
            </CardContent></Card>
          )}
          {activeItem === 'backup' && (
            <Card className="mb-4"><CardHeader><CardTitle>Backup & Restore</CardTitle></CardHeader><CardContent>
              <p className="text-sm text-muted-foreground">Manage backups and recovery options. (Coming soon)</p>
            </CardContent></Card>
          )}
        </section>
      </div>
    </div>
  );
};

export default Settings;
