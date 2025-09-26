/*
 Express server with MySQL connection pooling and basic routes.
 - Loads env from .env
 - CORS enabled for local dev
 - JSON body parsing
 - Health check and example /api/ping
 - Graceful error handling
*/

const path = require("path");
const express = require("express");
const cors = require("cors");
const { pool } = require("./mysql.cjs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const fs = require('fs');
const { pathToFileURL } = require('url');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
function signTempOtpToken(userId) {
  if (!JWT_SECRET) throw new Error('Server missing JWT_SECRET');
  const payload = { sub: String(userId), otp_pending: true };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '10m' });
}

app.use(cors());
app.use(express.json());
// Tiny logger for debugging
app.use((req, _res, next) => {
  console.log(`[api] ${req.method} ${req.url}`);
  next();
});

// ===== Appointments: doctor actions (approve/reject/reschedule) =====
app.post('/api/appointments/:id/approve', requireAuth, requireRole(['doctor','admin']), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });
    const a = await q("SELECT id FROM appointments WHERE id = ? LIMIT 1", [id]);
    if (!a.length) return res.status(404).json({ message: 'Not found' });
    await q("UPDATE appointments SET status='approved' WHERE id = ?", [id]);
    try {
      const r = await pool.query("INSERT INTO notifications (title, message, target_role, created_by) VALUES (?,?,?,?)", ['Appointment Approved', `Your appointment #${id} has been approved.`, 'patient', req.user.id]);
      const nid = r?.[0]?.insertId;
      sseBroadcastNotification({ id: nid, title: 'Appointment Approved', message: `Your appointment #${id} has been approved.`, target_role: 'patient', created_at: new Date().toISOString() });
    } catch {}
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: 'Approve failed' }); }
});
app.post('/api/appointments/:id/reject', requireAuth, requireRole(['doctor','admin']), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });
    const a = await q("SELECT id FROM appointments WHERE id = ? LIMIT 1", [id]);
    if (!a.length) return res.status(404).json({ message: 'Not found' });
    await q("UPDATE appointments SET status='rejected' WHERE id = ?", [id]);
    try {
      const r = await pool.query("INSERT INTO notifications (title, message, target_role, created_by) VALUES (?,?,?,?)", ['Appointment Rejected', `Your appointment #${id} was rejected.`, 'patient', req.user.id]);
      const nid = r?.[0]?.insertId;
      sseBroadcastNotification({ id: nid, title: 'Appointment Rejected', message: `Your appointment #${id} was rejected.`, target_role: 'patient', created_at: new Date().toISOString() });
    } catch {}
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: 'Reject failed' }); }
});
app.post('/api/appointments/:id/reschedule', requireAuth, requireRole(['doctor','admin']), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const date = req.body?.date || req.body?.appointment_date || req.body?.appointmentDate;
    const time = req.body?.time || req.body?.appointment_time || req.body?.appointmentTime;
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });
    if (!date || !time) return res.status(400).json({ message: 'date and time required' });
    const a = await q("SELECT id FROM appointments WHERE id = ? LIMIT 1", [id]);
    if (!a.length) return res.status(404).json({ message: 'Not found' });
    await q("UPDATE appointments SET date = ?, time = ?, status='rescheduled' WHERE id = ?", [String(date), String(time), id]);
    try {
      const r = await pool.query("INSERT INTO notifications (title, message, target_role, created_by) VALUES (?,?,?,?)", ['Appointment Rescheduled', `Your appointment #${id} has been rescheduled to ${date} ${time}.`, 'patient', req.user.id]);
      const nid = r?.[0]?.insertId;
      sseBroadcastNotification({ id: nid, title: 'Appointment Rescheduled', message: `Your appointment #${id} has been rescheduled to ${date} ${time}.`, target_role: 'patient', created_at: new Date().toISOString() });
    } catch {}
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: 'Reschedule failed' }); }
});

// ===== Availability CRUD (basic) =====
app.get('/api/availability/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await q("SELECT * FROM availability WHERE id = ? LIMIT 1", [id]);
    if (!rows.length) return res.status(404).json({ message: 'Not found' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ message: 'Failed' }); }
});
app.delete('/api/availability/:id', requireAuth, requireRole(['doctor','admin']), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await q("SELECT * FROM availability WHERE id = ? LIMIT 1", [id]);
    if (!rows.length) return res.status(404).json({ message: 'Not found' });
    await q("DELETE FROM availability WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: 'Failed' }); }
});
// ===== Initialize Sequelize models from ESM module =====
let __sequelizeMods = null;
async function getSequelize() {
  if (!__sequelizeMods) {
    const url = pathToFileURL(path.resolve(__dirname, './sequelize.js')).href;
    __sequelizeMods = await import(url);
  }
  return __sequelizeMods;
}
(async () => {
  try {
    const { initModels, syncSequelize } = await getSequelize();
    await initModels();
    await syncSequelize();
    console.log('[sequelize] models ready');
  } catch (e) {
    console.error('[sequelize] init error:', e?.message || e);
  }
})();

// ===== In-app notifications via SSE =====
const sseClients = [];
function sseBroadcastNotification(n) {
  try {
    const payload = JSON.stringify({
      id: n.id || Date.now(),
      title: n.title,
      message: n.message,
      target_role: n.target_role || 'all',
      created_at: n.created_at || new Date().toISOString(),
    });
    sseClients.forEach(c => {
      if (n.target_role === 'all' || c.role === n.target_role) {
        c.res.write(`event: notification\n`);
        c.res.write(`data: ${payload}\n\n`);
      }
    });
  } catch (e) { console.warn('[sse] broadcast failed:', e?.message || e); }
}

app.get('/api/events', (req, res) => {
  // Authenticate via Authorization header or token query param
  let user = null;
  try {
    const auth = req.headers['authorization'] || '';
    const parts = auth.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      user = jwt.verify(parts[1], JWT_SECRET);
    } else if (req.query?.token) {
      user = jwt.verify(String(req.query.token), JWT_SECRET);
    }
  } catch {}
  if (!user) {
    res.writeHead(401, { 'Content-Type': 'text/plain' });
    return res.end('Unauthorized');
  }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
  });
  const client = { res, role: String(user.role || 'all') };
  sseClients.push(client);
  req.on('close', () => {
    const idx = sseClients.indexOf(client);
    if (idx >= 0) sseClients.splice(idx, 1);
  });
  // Heartbeat
  const hb = setInterval(() => { try { res.write(`event: ping\ndata: ${Date.now()}\n\n`); } catch {} }, 25000);
  res.on('close', () => { try { clearInterval(hb); } catch {} });
});

// List notifications (last 50) filtered by role
app.get('/api/notifications', requireAuth, async (req, res) => {
  try {
    const role = String(req.user.role || 'all');
    const rows = await q("SELECT id, title, message, target_role, created_at FROM notifications WHERE target_role = 'all' OR target_role = ? ORDER BY id DESC LIMIT 50", [role]);
    res.json(rows);
  } catch { res.status(500).json({ message: 'Failed to load notifications' }); }
});

// Create a notification (admin/manager)
app.post('/api/notifications', requireAuth, async (req, res) => {
  try {
    const { title, message } = req.body || {};
    let tr = String(req.body?.target_role || '').toLowerCase();
    if (!title || !message) return res.status(400).json({ message: 'title and message required' });
    const sender = String(req.user?.role || '').toLowerCase();
    // Enforce policy
    const allowedMap = {
      patient: ['doctor'],
      doctor: ['manager'],
      manager: ['admin','doctor'],
      admin: ['manager','doctor'],
    };
    const allowed = allowedMap[sender] || [];
    if (!allowed.length) return res.status(403).json({ message: 'Your role cannot send notifications' });
    if (!allowed.includes(tr)) {
      return res.status(403).json({ message: 'Not allowed to target this role', details: { sender, allowed_targets: allowed } });
    }
    const r = await pool.query("INSERT INTO notifications (title, message, target_role, created_by) VALUES (?,?,?,?)", [title, message, tr, req.user.id]);
    const insertId = r?.[0]?.insertId;
    const created = { id: insertId, title, message, target_role: tr, created_at: new Date().toISOString() };
    sseBroadcastNotification(created);
    res.status(201).json(created);
  } catch (e) { res.status(500).json({ message: 'Create notification failed' }); }
});

// ===== Simple file-backed settings =====
const settingsPath = path.resolve(__dirname, 'settings.json');
function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const raw = fs.readFileSync(settingsPath, 'utf8');
      return JSON.parse(raw || '{}');
    }
  } catch {}
  return {
    application: {
      app_name: 'CareLink HMS',
      logo_url: '/src/assets/logo.png',
      primary_color: '#0ea5e9',
      secondary_color: '#334155',
    },
    billing: {
      enable_push_to_pay: true,
      default_mobile_provider: 'mpesa',
      default_bank_provider: 'crdb',
      allow_amount_override: true,
    },
    notifications: {
      role_scoped: true,
    },
  };
}
function saveSettings(obj) {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(obj, null, 2), 'utf8');
    return true;
  } catch { return false; }
}

// Occupancy metrics (beds by department)
app.get('/api/metrics/occupancy', requireAuth, async (req, res) => {
  try {
    const totals = await q("SELECT COUNT(*) totalBeds, SUM(CASE WHEN status='occupied' THEN 1 ELSE 0 END) occupiedBeds FROM beds");
    const t = totals[0] || { totalBeds: 0, occupiedBeds: 0 };
    const details = await q(`SELECT d.name AS department, COUNT(b.id) AS total, SUM(CASE WHEN b.status='occupied' THEN 1 ELSE 0 END) AS occupied
      FROM departments d
      LEFT JOIN wards w ON w.department_id = d.id
      LEFT JOIN beds b ON b.ward_id = w.id
      GROUP BY d.id, d.name
      ORDER BY d.name ASC`);
    const byDepartment = details.map(r => ({ department: r.department, total: Number(r.total||0), occupied: Number(r.occupied||0), free: Math.max(Number(r.total||0) - Number(r.occupied||0), 0) }));
    const freeBeds = Math.max(Number(t.totalBeds||0) - Number(t.occupiedBeds||0), 0);
    res.json({ totalBeds: Number(t.totalBeds||0), occupiedBeds: Number(t.occupiedBeds||0), freeBeds, byDepartment });
  } catch { res.status(500).json({ message: 'Failed' }); }
});

// Simple query helper
async function q(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

// Minimal bootstrap of required tables for development/demo
async function ensureTables() {
  await q(`CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(160) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('patient','doctor','admin','laboratorist','manager') NOT NULL DEFAULT 'patient',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);

  await q(`CREATE TABLE IF NOT EXISTS notifications (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(160) NOT NULL,
    message VARCHAR(1000) NOT NULL,
    target_role ENUM('all','patient','doctor','admin','laboratorist','manager') NOT NULL DEFAULT 'all',
    created_by INT UNSIGNED NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX(target_role), INDEX(created_at)
  ) ENGINE=InnoDB`);

  await q(`CREATE TABLE IF NOT EXISTS patients (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NULL,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(160) NULL,
    phone VARCHAR(40) NULL,
    notes VARCHAR(255) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX (user_id)
  ) ENGINE=InnoDB`);

  await q(`CREATE TABLE IF NOT EXISTS appointments (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    patient_id INT UNSIGNED NOT NULL,
    doctor_id INT UNSIGNED NULL,
    date DATE NOT NULL,
    time VARCHAR(8) NOT NULL,
    notes VARCHAR(255) NULL,
    status ENUM('requested','approved','rejected','rescheduled','cancelled','completed') NOT NULL DEFAULT 'requested',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX (patient_id), INDEX (doctor_id), INDEX(date)
  ) ENGINE=InnoDB`);

  await q(`CREATE TABLE IF NOT EXISTS invoices (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    patient_id INT UNSIGNED NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    date DATE NOT NULL,
    status ENUM('pending','paid','void') NOT NULL DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX (patient_id), INDEX(status)
  ) ENGINE=InnoDB`);

  await q(`CREATE TABLE IF NOT EXISTS payments (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    invoice_id INT UNSIGNED NULL,
    patient_id INT UNSIGNED NULL,
    amount DECIMAL(10,2) NOT NULL,
    method VARCHAR(40) NULL,
    status ENUM('initiated','success','failed') NOT NULL DEFAULT 'initiated',
    reference VARCHAR(160) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX(invoice_id), INDEX(patient_id)
  ) ENGINE=InnoDB`);

  await q(`CREATE TABLE IF NOT EXISTS availability (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    doctor_user_id INT UNSIGNED NOT NULL,
    date DATE NOT NULL,
    start_time VARCHAR(8) NULL,
    end_time VARCHAR(8) NULL,
    status ENUM('on','off') NOT NULL DEFAULT 'on',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX(doctor_user_id), INDEX(date)
  ) ENGINE=InnoDB`);

  await q(`CREATE TABLE IF NOT EXISTS branches (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(160) NOT NULL UNIQUE,
    address VARCHAR(255) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);

  await q(`CREATE TABLE IF NOT EXISTS services (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    price DECIMAL(10,2) NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);

  await q(`CREATE TABLE IF NOT EXISTS templates (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    type ENUM('sms','email') NOT NULL,
    key VARCHAR(120) NOT NULL UNIQUE,
    subject VARCHAR(200) NULL,
    body TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);

  await q(`CREATE TABLE IF NOT EXISTS medical_records (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    patient_id INT UNSIGNED NOT NULL,
    record_type VARCHAR(80) NOT NULL,
    notes TEXT NULL,
    date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX(patient_id), INDEX(date)
  ) ENGINE=InnoDB`);

  await q(`CREATE TABLE IF NOT EXISTS lab_results (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    patient_id INT UNSIGNED NOT NULL,
    test_type VARCHAR(120) NOT NULL,
    value VARCHAR(120) NULL,
    unit VARCHAR(40) NULL,
    normal_range VARCHAR(80) NULL,
    flag ENUM('normal','abnormal','critical') NOT NULL DEFAULT 'normal',
    date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX(patient_id), INDEX(date)
  ) ENGINE=InnoDB`);

  await q(`CREATE TABLE IF NOT EXISTS prescriptions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    patient_id INT UNSIGNED NOT NULL,
    doctor_id INT UNSIGNED NOT NULL,
    date DATE NOT NULL DEFAULT (CURRENT_DATE),
    diagnosis VARCHAR(255) NULL,
    medications TEXT NULL,
    notes TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX(patient_id), INDEX(doctor_id)
  ) ENGINE=InnoDB`);

  await q(`CREATE TABLE IF NOT EXISTS lab_orders (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    patient_id INT UNSIGNED NOT NULL,
    doctor_id INT UNSIGNED NOT NULL,
    tests TEXT NULL,
    status ENUM('requested','in_progress','completed','cancelled') NOT NULL DEFAULT 'requested',
    requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME NULL,
    notes TEXT NULL,
    INDEX(patient_id), INDEX(doctor_id)
  ) ENGINE=InnoDB`);

  await q(`CREATE TABLE IF NOT EXISTS audit_logs (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NULL,
    action VARCHAR(80) NOT NULL,
    entity VARCHAR(80) NOT NULL,
    entity_id INT UNSIGNED NULL,
    meta TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX(user_id), INDEX(entity), INDEX(created_at)
  ) ENGINE=InnoDB`);

  // Manager resources
  await q(`CREATE TABLE IF NOT EXISTS departments (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(160) NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);

  await q(`CREATE TABLE IF NOT EXISTS wards (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    department_id INT UNSIGNED NOT NULL,
    name VARCHAR(160) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX(department_id)
  ) ENGINE=InnoDB`);

  await q(`CREATE TABLE IF NOT EXISTS beds (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ward_id INT UNSIGNED NOT NULL,
    label VARCHAR(40) NOT NULL,
    status ENUM('available','occupied','maintenance') NOT NULL DEFAULT 'available',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX(ward_id), INDEX(status)
  ) ENGINE=InnoDB`);

  await q(`CREATE TABLE IF NOT EXISTS inventory_items (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    sku VARCHAR(80) NULL,
    quantity INT NOT NULL DEFAULT 0,
    reorder_threshold INT NOT NULL DEFAULT 0,
    unit VARCHAR(40) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);

  await q(`CREATE TABLE IF NOT EXISTS staff (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NULL,
    name VARCHAR(160) NOT NULL,
    role ENUM('doctor','nurse','support','admin','manager','laboratorist') NOT NULL,
    department_id INT UNSIGNED NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX(department_id)
  ) ENGINE=InnoDB`);

  await q(`CREATE TABLE IF NOT EXISTS shifts (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    staff_id INT UNSIGNED NOT NULL,
    date DATE NOT NULL,
    start_time VARCHAR(8) NOT NULL,
    end_time VARCHAR(8) NOT NULL,
    status ENUM('scheduled','completed','missed') NOT NULL DEFAULT 'scheduled',
    INDEX(staff_id), INDEX(date)
  ) ENGINE=InnoDB`);

  await q(`CREATE TABLE IF NOT EXISTS attendance (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    staff_id INT UNSIGNED NOT NULL,
    date DATE NOT NULL,
    clock_in VARCHAR(8) NULL,
    clock_out VARCHAR(8) NULL,
    status ENUM('present','absent','leave') NOT NULL DEFAULT 'present',
    INDEX(staff_id), INDEX(date)
  ) ENGINE=InnoDB`);
}

// Map common MySQL errors to friendly messages
const toDbMessage = (err) => {
  if (!err) return undefined;
  if (err.code === 'ER_ACCESS_DENIED_ERROR') return 'DB access denied: check DB_USER/DB_PASSWORD';
  if (err.code === 'ER_BAD_DB_ERROR') return 'Database not found: check DB_NAME';
  if (err.code === 'ER_NO_SUCH_TABLE') return 'Table not found (users): run the migration/DDL in README';
  if (err.code === 'ECONNREFUSED') return 'Cannot connect to MySQL: check DB_HOST/DB_PORT and that MySQL is running';
  return err.message || String(err);
};

// Simple admin auth using a shared secret. In production, use proper auth (JWT/OAuth).
const requireAdmin = (req, res, next) => {
  const headerSecret = req.headers["x-admin-secret"] || req.headers["x-admin-token"];
  const secret = process.env.ADMIN_API_SECRET;
  if (!secret) {
    return res.status(500).json({ message: "Server is missing ADMIN_API_SECRET" });
  }
  if (!headerSecret || headerSecret !== secret) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
};

// JWT auth middleware and RBAC
const requireAuth = (req, res, next) => {
  try {
    const auth = req.headers["authorization"] || req.headers["Authorization"];
    if (!auth || !auth.startsWith("Bearer ")) return res.status(401).json({ message: "Missing token" });
    const token = auth.slice(7);
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, name, email, role }
    next();
  } catch (e) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

const requireRole = (roles = []) => (req, res, next) => {
  const role = String(req.user?.role || '').toLowerCase();
  if (!roles.includes(role)) return res.status(403).json({ message: 'Forbidden' });
  next();
};

// ===== Settings endpoints =====
app.get('/api/settings', requireAuth, requireRole(['admin','manager']), (req, res) => {
  try { res.json(loadSettings()); } catch { res.status(500).json({ message: 'Failed to load settings' }); }
});
app.put('/api/settings', requireAuth, requireRole(['admin']), (req, res) => {
  try {
    const current = loadSettings();
    const next = { ...current, ...(req.body||{}) };
    if (!saveSettings(next)) return res.status(500).json({ message: 'Failed to save settings' });
    res.json(next);
  } catch { res.status(500).json({ message: 'Failed to save settings' }); }
});

// ===== 2FA (Sequelize-backed) for CJS server =====
function normalizeMsisdn(msisdn){ const s=String(msisdn||'').replace(/\s+/g,''); if(s.startsWith('+')) return s; if(s.startsWith('0')) return `+255${s.slice(1)}`; if(/^255\d+$/.test(s)) return `+${s}`; return s; }

// Status
app.get('/api/2fa/status', requireAuth, async (req,res)=>{
  try {
    const { models } = await getSequelize();
    const rec = await models.User2FA.findByPk(Number(req.user.id));
    res.json({ enabled: !!rec?.enabled, method: rec?.method||null, contact: rec?.contact||null });
  } catch (e) { res.status(500).json({ message: 'Failed' }); }
});

// Set method/contact
app.post('/api/2fa/method', requireAuth, async (req,res)=>{
  try {
    const { models } = await getSequelize();
    const userId = Number(req.user.id);
    const method = String(req.body?.method||'').toLowerCase();
    const contact = req.body?.contact ? String(req.body.contact) : null;
    if (!['totp','otp'].includes(method)) return res.status(400).json({ message: 'Invalid method' });
    if (method==='otp' && !contact) return res.status(400).json({ message: 'contact required for otp' });
    const ex = await models.User2FA.findByPk(userId);
    if (ex) await ex.update({ method, contact: contact||null, enabled: false });
    else await models.User2FA.create({ user_id: userId, method, contact: contact||null, enabled: false });
    res.json({ ok: true });
  } catch { res.status(500).json({ message: 'Failed to set method' }); }
});

// Request OTP (email via SendGrid, sms via Briq OTP API)
app.post('/api/2fa/otp/request', requireAuth, async (req,res)=>{
  try {
    const { models } = await getSequelize();
    const userId = Number(req.user.id);
    const rec = await models.User2FA.findByPk(userId);
    if (!rec || rec.method !== 'otp' || !rec.contact) return res.status(400).json({ message: 'OTP method not configured' });
    const isEmail = rec.contact.includes('@');
    if (isEmail) {
      const code = String(Math.floor(100000 + Math.random()*900000));
      const expires = new Date(Date.now() + 5*60*1000);
      await models.UserOTP.create({ user_id: userId, channel: 'email', code, expires_at: expires });
      const SG_KEY = process.env.SENDGRID_API_KEY; const FROM = process.env.SENDGRID_FROM_EMAIL; const FROM_NAME = process.env.SENDGRID_FROM_NAME || 'Clinicare HMS';
      if (!SG_KEY || !FROM) return res.status(500).json({ message: 'Email OTP not configured' });
      const payload = { personalizations:[{ to:[{ email: rec.contact }] }], from:{ email: FROM, name: FROM_NAME }, subject:'Your verification code', content:[{ type:'text/plain', value:`Your verification code is ${code}. It expires in 5 minutes.` }] };
      const r = await fetch('https://api.sendgrid.com/v3/mail/send', { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${SG_KEY}` }, body: JSON.stringify(payload) });
      if (!r.ok) { const t = await r.text(); return res.status(500).json({ message:'Failed to send OTP (email)', details:t }); }
      return res.json({ sent:true, channel:'email', to: rec.contact });
    } else {
      const API_KEY = process.env.BRIQ_API_KEY; const DEV_APP = process.env.BRIQ_DEVELOPER_APP_ID; const BASE = (process.env.BRIQ_OTP_BASE_URL||process.env.BRIQ_BASE_URL||'https://api.briq.tz').replace(/\/$/,'');
      if (!API_KEY || !DEV_APP) return res.status(500).json({ message: 'SMS OTP not configured' });
      const body = { phone_number: normalizeMsisdn(rec.contact), developer_app_id: DEV_APP };
      const r = await fetch(`${BASE}/otp/request`, { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${API_KEY}` }, body: JSON.stringify(body) });
      let data=null; try{ data=await r.json(); } catch{ data=await r.text(); }
      if (!r.ok || (data && data.success===false)) return res.status(500).json({ message: 'Failed to send OTP (sms)', details: (data && (data.error||data.message)) || data });
      return res.json({ sent:true, channel:'sms', to: rec.contact });
    }
  } catch (e) { res.status(500).json({ message: 'OTP request failed' }); }
});

// Verify OTP (email local, sms via Briq)
app.post('/api/2fa/otp/verify', requireAuth, async (req,res)=>{
  try {
    const { models } = await getSequelize();
    const userId = Number(req.user.id);
    const code = String(req.body?.code||'').trim(); if (!code) return res.status(400).json({ message: 'code required' });
    const rec = await models.User2FA.findByPk(userId);
    if (!rec || rec.method !== 'otp' || !rec.contact) return res.status(400).json({ message: 'OTP method not configured' });
    const isEmail = rec.contact.includes('@');
    if (isEmail) {
      const now = new Date();
      const row = await models.UserOTP.findOne({ where: { user_id: userId, channel: 'email', code, used_at: null, expires_at: { ['gt']: now } }, order: [['id','DESC']] });
      // NOTE: Using raw condition due to lack of Op in CJS; fallback to manual check
      // If the above condition fails due to ['gt'], fallback query:
      if (!row) {
        const candidates = await models.UserOTP.findAll({ where: { user_id: userId, channel: 'email', code, used_at: null }, order: [['id','DESC']], limit: 3 });
        const valid = candidates.find(r => new Date(r.expires_at) > new Date());
        if (!valid) return res.status(400).json({ message: 'Invalid or expired code' });
        await valid.update({ used_at: new Date() });
      } else {
        await row.update({ used_at: new Date() });
      }
    } else {
      const API_KEY = process.env.BRIQ_API_KEY; const DEV_APP = process.env.BRIQ_DEVELOPER_APP_ID; const BASE = (process.env.BRIQ_OTP_BASE_URL||process.env.BRIQ_BASE_URL||'https://api.briq.tz').replace(/\/$/,'');
      if (!API_KEY || !DEV_APP) return res.status(500).json({ message: 'SMS OTP not configured' });
      const body = { phone_number: normalizeMsisdn(rec.contact), code: String(code), developer_app_id: DEV_APP };
      const r = await fetch(`${BASE}/otp/validate`, { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${API_KEY}` }, body: JSON.stringify(body) });
      let data=null; try{ data=await r.json(); } catch{ data=await r.text(); }
      if (!r.ok || (data && data.success===false)) return res.status(400).json({ message: 'Invalid code', details: (data && (data.error||data.message)) || data });
    }
    if (rec) await rec.update({ method:'otp', enabled:true }); else await models.User2FA.create({ user_id: userId, method:'otp', enabled:true });
    res.json({ enabled:true, method:'otp' });
  } catch (e) { res.status(500).json({ message: 'OTP verify failed' }); }
});

// Audit helper
async function audit(userId, action, entity, entityId = null, meta = null) {
  try {
    await q("INSERT INTO audit_logs (user_id, action, entity, entity_id, meta) VALUES (?,?,?,?,?)", [userId || null, action, entity, entityId, meta ? JSON.stringify(meta) : null]);
  } catch (e) {
    console.warn('[audit] failed:', e?.message || e);
  }
}

// Health check
app.get("/api/health", async (req, res) => {
  let db = "unknown";
  let db_error = undefined;
  try {
    const [rows] = await pool.query("SELECT 1 AS ok");
    db = rows?.[0]?.ok === 1 ? "connected" : "unknown";
  } catch (err) {
    console.error("/api/health db error:", err);
    db = "error";
    db_error = err?.message || String(err);
  }
  res.json({ status: "ok", db, db_error });
});

// Initialize minimal schema (dev/demo)
ensureTables().then(()=>console.log('[db] ensureTables done')).catch(e=>console.error('[db] ensureTables error', e));

// Auth endpoints
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: 'Missing credentials' });
    const rows = await q("SELECT id, name, email, password_hash, role FROM users WHERE email = ? LIMIT 1", [email]);
    if (!rows.length) return res.status(401).json({ message: 'Invalid email or password' });
    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: 'Invalid email or password' });
    // 2FA check via Sequelize
    try {
      const { models } = await getSequelize();
      const rec = await models.User2FA.findByPk(Number(user.id));
      if (rec && rec.enabled) {
        const temp_token = signTempOtpToken(user.id);
        return res.json({ requires_otp: true, temp_token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
      }
    } catch {}
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (e) { res.status(500).json({ message: 'Login failed' }); }
});

// Request OTP during two-step login
app.post('/api/login/otp/request', async (req, res) => {
  try {
    const { temp_token } = req.body || {};
    if (!temp_token) return res.status(400).json({ message: 'temp_token required' });
    let decoded=null; try { decoded = jwt.verify(String(temp_token), JWT_SECRET); } catch { return res.status(401).json({ message: 'Invalid or expired temp token' }); }
    if (!decoded?.sub || !decoded?.otp_pending) return res.status(400).json({ message: 'Invalid temp token' });
    const userId = Number(decoded.sub);
    const { models } = await getSequelize();
    const rec = await models.User2FA.findByPk(userId);
    if (!rec || rec.method !== 'otp' || !rec.contact) return res.status(400).json({ message: 'OTP method not configured' });
    const isEmail = rec.contact.includes('@');
    if (isEmail) {
      const code = String(Math.floor(100000 + Math.random()*900000));
      const expires = new Date(Date.now() + 5*60*1000);
      await models.UserOTP.create({ user_id: userId, channel: 'email', code, expires_at: expires });
      const SG_KEY = process.env.SENDGRID_API_KEY; const FROM = process.env.SENDGRID_FROM_EMAIL; const FROM_NAME = process.env.SENDGRID_FROM_NAME || 'Clinicare HMS';
      if (!SG_KEY || !FROM) return res.status(500).json({ message: 'Email OTP not configured' });
      const payload = { personalizations:[{ to:[{ email: rec.contact }] }], from:{ email: FROM, name: FROM_NAME }, subject:'Your login code', content:[{ type:'text/plain', value:`Your login code is ${code}. It expires in 5 minutes.` }] };
      const r = await fetch('https://api.sendgrid.com/v3/mail/send', { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${SG_KEY}` }, body: JSON.stringify(payload) });
      if (!r.ok) { const t=await r.text(); return res.status(500).json({ message:'Failed to send OTP (email)', details:t }); }
      return res.json({ sent: true, channel: 'email', to: rec.contact });
    } else {
      const API_KEY = process.env.BRIQ_API_KEY; const DEV_APP = process.env.BRIQ_DEVELOPER_APP_ID; const BASE = (process.env.BRIQ_OTP_BASE_URL||process.env.BRIQ_BASE_URL||'https://api.briq.tz').replace(/\/$/,'');
      if (!API_KEY || !DEV_APP) return res.status(500).json({ message: 'SMS OTP not configured' });
      const body = { phone_number: normalizeMsisdn(rec.contact), developer_app_id: DEV_APP };
      const r = await fetch(`${BASE}/otp/request`, { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${API_KEY}` }, body: JSON.stringify(body) });
      let data=null; try{ data=await r.json(); } catch{ data=await r.text(); }
      if (!r.ok || (data && data.success===false)) return res.status(500).json({ message:'Failed to send OTP (sms)', details: (data && (data.error||data.message)) || data });
      return res.json({ sent: true, channel: 'sms', to: rec.contact });
    }
  } catch (err) { return res.status(500).json({ message: 'OTP request failed' }); }
});

// Verify OTP during two-step login
app.post('/api/login/verify-otp', async (req, res) => {
  try {
    const { temp_token, code } = req.body || {};
    if (!temp_token || !code) return res.status(400).json({ message: 'temp_token and code required' });
    let decoded=null; try { decoded = jwt.verify(String(temp_token), JWT_SECRET); } catch { return res.status(401).json({ message: 'Invalid or expired temp token' }); }
    if (!decoded?.sub || !decoded?.otp_pending) return res.status(400).json({ message: 'Invalid temp token' });
    const userId = Number(decoded.sub);
    // Load user
    const rows = await q("SELECT id, name, email, role FROM users WHERE id = ? LIMIT 1", [userId]);
    if (!rows.length) return res.status(404).json({ message: 'User not found' });
    const user = rows[0];
    const { models } = await getSequelize();
    const rec = await models.User2FA.findByPk(userId);
    if (!rec?.enabled) return res.status(400).json({ message: '2FA not enabled' });
    let ok=false;
    if (rec.method === 'otp') {
      if (rec.contact.includes('@')) {
        const now = new Date();
        const row = await models.UserOTP.findOne({ where: { user_id: userId, channel: 'email', code: String(code), used_at: null }, order: [['id','DESC']] });
        if (!row || new Date(row.expires_at) <= now) return res.status(400).json({ message: 'Invalid or expired code' });
        await row.update({ used_at: new Date() }); ok = true;
      } else {
        const API_KEY = process.env.BRIQ_API_KEY; const DEV_APP = process.env.BRIQ_DEVELOPER_APP_ID; const BASE = (process.env.BRIQ_OTP_BASE_URL||process.env.BRIQ_BASE_URL||'https://api.briq.tz').replace(/\/$/,'');
        if (!API_KEY || !DEV_APP) return res.status(500).json({ message: 'SMS OTP not configured' });
        const body = { phone_number: normalizeMsisdn(rec.contact), code: String(code), developer_app_id: DEV_APP };
        const r = await fetch(`${BASE}/otp/validate`, { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${API_KEY}` }, body: JSON.stringify(body) });
        let data=null; try{ data=await r.json(); } catch{ data=await r.text(); }
        if (!r.ok || (data && data.success===false)) return res.status(400).json({ message: 'Invalid code', details: (data && (data.error||data.message)) || data });
        ok = true;
      }
    } else {
      return res.status(400).json({ message: 'Unsupported 2FA method' });
    }
    if (!ok) return res.status(400).json({ message: 'Invalid code' });
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) { return res.status(500).json({ message: 'Verify OTP failed' }); }
});

app.get('/api/me', requireAuth, async (req, res) => {
  try {
    const rows = await q("SELECT id, name, email, role FROM users WHERE id = ?", [req.user.id]);
    if (!rows.length) return res.status(404).json({ message: 'User not found' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ message: 'Failed to load profile' }); }
});

// Admin: create user with role (protected by ADMIN_API_SECRET)
app.post("/api/admin/users", requireAdmin, async (req, res) => {
  try {
    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    if (!["patient", "doctor", "admin"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }
    const [existing] = await pool.query("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
    if (existing && existing.length > 0) {
      return res.status(409).json({ message: "Email is already registered" });
    }
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    const [result] = await pool.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
      [name, email, hash, role]
    );
    return res.status(201).json({ id: result.insertId, name, email, role });
  } catch (err) {
    console.error("/api/admin/users error:", err);
    return res.status(500).json({ message: "Create user failed", details: toDbMessage(err) });
  }
});

// Example route
app.get("/api/ping", (req, res) => {
  res.json({ message: "pong" });
});

// Registration endpoint
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    const userRole = ["patient", "doctor", "admin"].includes(role) ? role : "patient";

    // Check for existing user
    const [existing] = await pool.query("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
    if (existing && existing.length > 0) {
      return res.status(409).json({ message: "Email is already registered" });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    // Insert user
    const [result] = await pool.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
      [name, email, hash, userRole]
    );
    // Auto-create a patient profile for patient role
    if (userRole === 'patient') {
      await q("INSERT INTO patients (user_id, name, email) VALUES (?,?,?)", [result.insertId, name, email]);
    }
    await audit(null, 'register', 'user', result.insertId, { email, role: userRole });
    return res.status(201).json({ id: result.insertId, name, email, role: userRole });
  } catch (err) {
    console.error("/api/register error:", err);
    return res.status(500).json({ message: "Registration failed", details: toDbMessage(err) });
  }
});

// Simple root check
app.get('/api', (_req, res) => {
  res.json({ status: 'ok', message: 'API running', time: new Date().toISOString() });
});

// Example: users list (requires a `users` table). Safe to keep as placeholder.
app.get("/api/users", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, name, email, role, created_at FROM users ORDER BY id DESC LIMIT 50");
    res.json(rows);
  } catch (err) {
    console.error("/api/users error:", err);
    res.status(500).json({ message: "Database error", details: err.message });
  }
});

// Doctors and Patients
app.get('/api/doctors', requireAuth, async (req, res) => {
  try { const rows = await q("SELECT id, name, email FROM users WHERE role = 'doctor' ORDER BY name ASC"); res.json(rows); }
  catch { res.status(500).json({ message: 'Failed to load doctors' }); }
});

app.get('/api/patients', requireAuth, async (req, res) => {
  try { const rows = await q("SELECT * FROM patients ORDER BY id DESC LIMIT 200"); res.json(rows); }
  catch { res.status(500).json({ message: 'Failed to load patients' }); }
});

app.get('/api/patients/simple', requireAuth, async (req, res) => {
  try { const rows = await q("SELECT id, name, email FROM patients ORDER BY name ASC"); res.json(rows); }
  catch { res.status(500).json({ message: 'Failed' }); }
});

app.get('/api/patients/by-user/:userId', requireAuth, async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const ps = await q("SELECT * FROM patients WHERE user_id = ? LIMIT 1", [userId]);
    if (ps.length) return res.json(ps[0]);
    const us = await q("SELECT id, name, email FROM users WHERE id = ?", [userId]);
    if (!us.length) return res.status(404).json({ message: 'User not found' });
    const u = us[0];
    const r = await q("INSERT INTO patients (user_id, name, email) VALUES (?,?,?)", [u.id, u.name, u.email]);
    const created = await q("SELECT * FROM patients WHERE id = ?", [r.insertId]);
    res.json(created[0]);
  } catch { res.status(500).json({ message: 'Failed' }); }
});

// Invoices
app.get('/api/invoices', requireAuth, async (req, res) => {
  try {
    const { patient_id } = req.query;
    let rows;
    if (patient_id) rows = await q("SELECT * FROM invoices WHERE patient_id = ? ORDER BY id DESC", [Number(patient_id)]);
    else rows = await q("SELECT * FROM invoices ORDER BY id DESC LIMIT 200");
    rows = rows.map(r => ({ ...r, amount: String(r.amount) }));
    res.json(rows);
  } catch { res.status(500).json({ message: 'Failed to load invoices' }); }
});

app.get('/api/invoices/meta', requireAuth, (req, res) => { res.json({ statuses: ['pending','paid','void'] }); });

app.post('/api/invoices', requireAuth, requireRole(['admin','manager','doctor']), async (req, res) => {
  try {
    const { patient_id, amount, date, status } = req.body || {};
    if (!patient_id || !amount || !date) return res.status(400).json({ message: 'Missing fields' });
    const st = ['pending','paid','void'].includes(String(status)) ? String(status) : 'pending';
    const r = await q("INSERT INTO invoices (patient_id, amount, date, status) VALUES (?,?,?,?)", [Number(patient_id), Number(amount), date, st]);
    await audit(req.user.id, 'create', 'invoice', r.insertId, { patient_id, amount, date, status: st });
    res.status(201).json({ id: r.insertId });
  } catch { res.status(500).json({ message: 'Create invoice failed' }); }
});

app.post('/api/invoices/:id/pay', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const invs = await q("SELECT * FROM invoices WHERE id = ?", [id]);
    if (!invs.length) return res.status(404).json({ message: 'Invoice not found' });
    const inv = invs[0];
    await q("UPDATE invoices SET status='paid' WHERE id = ?", [id]);
    await q("INSERT INTO payments (invoice_id, patient_id, amount, method, status, reference) VALUES (?,?,?,?,?,?)",
      [id, inv.patient_id, inv.amount, (req.body?.method||'mock'), 'success', `INV${id}-${Date.now()}`]);
    await audit(req.user.id, 'pay', 'invoice', id, { method: req.body?.method||'mock' });
    res.json({ ok: true });
  } catch { res.status(500).json({ message: 'Payment failed' }); }
});

app.get('/api/invoices/:id/download', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await q("SELECT i.*, p.name AS patient_name FROM invoices i LEFT JOIN patients p ON p.id = i.patient_id WHERE i.id = ?", [id]);
    if (!rows.length) return res.status(404).json({ message: 'Not found' });
    const inv = rows[0];
    const content = `Invoice #${inv.id}\nPatient: ${inv.patient_name || inv.patient_id}\nAmount: ${inv.amount}\nDate: ${inv.date}\nStatus: ${inv.status}\nGenerated: ${new Date().toISOString()}\n`;
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="invoice_${id}.txt"`);
    res.send(content);
  } catch { res.status(500).json({ message: 'Download failed' }); }
});

// Availability helpers
async function isWithinAvailability(doctorUserId, date, timeStr) {
  try {
    const avs = await q("SELECT * FROM availability WHERE doctor_user_id = ? AND date = ? AND status='on'", [doctorUserId, date]);
    if (!avs.length) return false;
    const t = timeStr;
    return avs.some(a => (!a.start_time || t >= a.start_time) && (!a.end_time || t <= a.end_time));
  } catch { return true; }
}

async function hasConflict(doctorUserId, date, timeStr) {
  const rows = await q("SELECT id FROM appointments WHERE doctor_id = ? AND date = ? AND time = ? LIMIT 1", [doctorUserId, date, timeStr]);
  return rows.length > 0;
}

// Appointments
app.get('/api/appointments', requireAuth, async (req, res) => {
  try {
    const { patient_id } = req.query;
    let rows;
    if (patient_id) rows = await q("SELECT * FROM appointments WHERE patient_id = ? ORDER BY date DESC, time DESC", [Number(patient_id)]);
    else rows = await q("SELECT * FROM appointments ORDER BY date DESC, time DESC LIMIT 200");
    res.json(rows);
  } catch { res.status(500).json({ message: 'Failed to load appointments' }); }
});

app.get('/api/appointments/range', requireAuth, async (req, res) => {
  try {
    const { from, to, doctor_id } = req.query;
    const params = [];
    let sql = "SELECT * FROM appointments WHERE 1=1";
    if (from) { sql += " AND date >= ?"; params.push(from); }
    if (to) { sql += " AND date <= ?"; params.push(to); }
    if (doctor_id) { sql += " AND doctor_id = ?"; params.push(Number(doctor_id)); }
    sql += " ORDER BY date ASC, time ASC";
    const rows = await q(sql, params);
    res.json(rows);
  } catch { res.status(500).json({ message: 'Failed' }); }
});

app.post('/api/appointments', requireAuth, async (req, res) => {
  try {
    const role = String(req.user.role || '').toLowerCase();
    const uid = req.user.id;
    const { patient_id, doctor_id, notes } = req.body || {};
  const date = req.body?.date || req.body?.appointment_date || req.body?.appointmentDate;
  const time = req.body?.time || req.body?.appointment_time || req.body?.appointmentTime;
    const pId = patient_id ? Number(patient_id) : null;
    let dId = doctor_id ? Number(doctor_id) : null;
    if (!date || !time) return res.status(400).json({ message: 'Missing date/time', details: 'Provide date and time as YYYY-MM-DD and HH:mm (e.g., 2025-09-26, 14:30)' });
    let finalPatientId = pId;
    if (role === 'patient' && !finalPatientId) {
      let p = await q("SELECT id FROM patients WHERE user_id = ? LIMIT 1", [uid]);
      if (!p.length) {
        // Auto-create patient profile from users table
        const u = await q("SELECT id, name, email FROM users WHERE id = ? LIMIT 1", [uid]);
        if (!u.length) return res.status(400).json({ message: 'User not found' });
        const user = u[0];
        const r = await q("INSERT INTO patients (user_id, name, email) VALUES (?,?,?)", [user.id, user.name || 'Patient', user.email || null]);
        p = await q("SELECT id FROM patients WHERE id = ? LIMIT 1", [r.insertId]);
        if (!p.length) return res.status(500).json({ message: 'Failed to create patient profile' });
      }
      finalPatientId = p[0].id;
    }
    if (!finalPatientId) return res.status(400).json({ message: 'Missing patient_id' });
    if (dId) {
      if (await hasConflict(dId, date, time)) return res.status(409).json({ message: 'Selected time conflicts with existing appointment' });
      const ok = await isWithinAvailability(dId, date, time);
      if (!ok) return res.status(409).json({ message: 'Doctor is not available at the selected time' });
    }
    const r = await q("INSERT INTO appointments (patient_id, doctor_id, date, time, notes) VALUES (?,?,?,?,?)", [finalPatientId, dId, date, time, notes || null]);
    await audit(req.user.id, 'create', 'appointment', r.insertId, { patient_id: finalPatientId, doctor_id: dId, date, time });
    res.status(201).json({ id: r.insertId });
  } catch { res.status(500).json({ message: 'Create failed' }); }
});

// Appointment status transitions (doctor/admin)
app.post('/api/appointments/:id/approve', requireAuth, requireRole(['doctor','admin']), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await q("SELECT * FROM appointments WHERE id = ?", [id]);
    if (!rows.length) return res.status(404).json({ message: 'Not found' });
    const a = rows[0];
    if (a.doctor_id) {
      if (await hasConflict(a.doctor_id, a.date, a.time)) return res.status(409).json({ message: 'Conflict at this time' });
      const ok = await isWithinAvailability(a.doctor_id, a.date, a.time);
      if (!ok) return res.status(409).json({ message: 'Not within doctor availability' });
    }
    await q("UPDATE appointments SET status='approved' WHERE id = ?", [id]);
    await audit(req.user.id, 'approve', 'appointment', id);
    await q("INSERT INTO notifications (title, message, target_role, created_by) VALUES (?,?,?,?)", ['Appointment Approved', `Your appointment #${id} has been approved.`, 'patient', req.user.id]);
    res.json({ ok: true });
  } catch { res.status(500).json({ message: 'Failed' }); }
});

app.post('/api/appointments/:id/reject', requireAuth, requireRole(['doctor','admin']), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await q("SELECT id FROM appointments WHERE id = ?", [id]);
    if (!rows.length) return res.status(404).json({ message: 'Not found' });
    await q("UPDATE appointments SET status='rejected' WHERE id = ?", [id]);
    await audit(req.user.id, 'reject', 'appointment', id);
    await q("INSERT INTO notifications (title, message, target_role, created_by) VALUES (?,?,?,?)", ['Appointment Rejected', `Your appointment #${id} was rejected.`, 'patient', req.user.id]);
    res.json({ ok: true });
  } catch { res.status(500).json({ message: 'Failed' }); }
});

app.post('/api/appointments/:id/reschedule', requireAuth, requireRole(['doctor','admin']), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { date, time } = req.body || {};
    if (!date || !time) return res.status(400).json({ message: 'Missing date/time' });
    const rows = await q("SELECT * FROM appointments WHERE id = ?", [id]);
    if (!rows.length) return res.status(404).json({ message: 'Not found' });
    const a = rows[0];
    if (a.doctor_id) {
      if (await hasConflict(a.doctor_id, date, time)) return res.status(409).json({ message: 'Conflict at selected time' });
      const ok = await isWithinAvailability(a.doctor_id, date, time);
      if (!ok) return res.status(409).json({ message: 'Not within doctor availability' });
    }
    await q("UPDATE appointments SET date=?, time=?, status='rescheduled' WHERE id = ?", [date, time, id]);
    await audit(req.user.id, 'reschedule', 'appointment', id, { date, time });
    await q("INSERT INTO notifications (title, message, target_role, created_by) VALUES (?,?,?,?)", ['Appointment Rescheduled', `Your appointment #${id} has been rescheduled to ${date} ${time}.`, 'patient', req.user.id]);
    res.json({ ok: true });
  } catch { res.status(500).json({ message: 'Failed' }); }
});

// Available slots suggestion for a doctor and date (15-min grid)
app.get('/api/appointments/available', requireAuth, async (req, res) => {
  try {
    const doctor_id = Number(req.query.doctor_id);
    const date = String(req.query.date || '');
    if (!doctor_id || !date) return res.status(400).json({ message: 'doctor_id and date required' });
    const avs = await q("SELECT * FROM availability WHERE doctor_user_id = ? AND date = ? AND status='on'", [doctor_id, date]);
    if (!avs.length) return res.json([]);
    const takenRows = await q("SELECT time FROM appointments WHERE doctor_id = ? AND date = ?", [doctor_id, date]);
    const taken = new Set(takenRows.map(r=>r.time));
    const slots = [];
    for (const a of avs) {
      const start = a.start_time || '09:00';
      const end = a.end_time || '17:00';
      let [h, m] = start.split(':').map(Number);
      while (true) {
        const t = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
        if (t > end) break;
        if (!taken.has(t)) slots.push(t);
        m += 15; if (m >= 60) { m = 0; h += 1; }
        if (h > 23) break;
      }
    }
    res.json([...new Set(slots)].sort());
  } catch { res.status(500).json({ message: 'Failed' }); }
});

// Availability CRUD (doctor)
app.get('/api/availability', requireAuth, async (req, res) => {
  try {
    const { from, to } = req.query;
    const params = [];
    let sql = "SELECT * FROM availability WHERE 1=1";
    if (from) { sql += " AND date >= ?"; params.push(from); }
    if (to) { sql += " AND date <= ?"; params.push(to); }
    sql += " ORDER BY date ASC";
    const rows = await q(sql, params);
    res.json(rows);
  } catch { res.status(500).json({ message: 'Failed' }); }
});

app.post('/api/availability', requireAuth, requireRole(['doctor','admin','manager']), async (req, res) => {
  try {
    const doctor_user_id = req.user.id;
    const { date, start_time, end_time, status } = req.body || {};
    if (!date) return res.status(400).json({ message: 'Missing date' });
    const st = ['on','off'].includes(String(status)) ? String(status) : 'on';
    const r = await q("INSERT INTO availability (doctor_user_id, date, start_time, end_time, status) VALUES (?,?,?,?,?)", [doctor_user_id, date, start_time || null, end_time || null, st]);
    await audit(req.user.id, 'create', 'availability', r.insertId, { date, start_time, end_time, status: st });
    res.status(201).json({ id: r.insertId });
  } catch { res.status(500).json({ message: 'Failed' }); }
});

// Metrics
app.get('/api/metrics/finance', requireAuth, async (req, res) => {
  try {
    const totals = await q("SELECT COUNT(*) as count, SUM(amount) as total, SUM(CASE WHEN status='pending' THEN amount ELSE 0 END) as pending, SUM(CASE WHEN status='paid' THEN amount ELSE 0 END) as paid, SUM(CASE WHEN date = CURRENT_DATE THEN amount ELSE 0 END) as todayTotal FROM invoices");
    const t = totals[0] || { count:0,total:0,pending:0,paid:0,todayTotal:0 };
    res.json({ count: Number(t.count||0), total: Number(t.total||0), pending: Number(t.pending||0), paid: Number(t.paid||0), todayTotal: Number(t.todayTotal||0) });
  } catch { res.status(500).json({ message: 'Failed' }); }
});

app.get('/api/metrics/doctor', requireAuth, async (req, res) => {
  try {
    const doctorId = Number(req.query.doctor_id || req.user.id);
    const today = new Date().toISOString().slice(0,10);
    const [aToday] = await q("SELECT COUNT(*) c FROM appointments WHERE doctor_id = ? AND date = ?", [doctorId, today]);
    const [patients] = await q("SELECT COUNT(DISTINCT patient_id) c FROM appointments WHERE doctor_id = ?", [doctorId]);
    const [records] = await q("SELECT COUNT(*) c FROM medical_records");
    const [inv] = await q("SELECT COUNT(*) c FROM invoices WHERE date = CURRENT_DATE");
    const common = await q("SELECT record_type, COUNT(*) c FROM medical_records GROUP BY record_type ORDER BY c DESC LIMIT 5");
    res.json({ doctorId, appointmentsToday: Number(aToday?.c||0), patientsCount: Number(patients?.c||0), recordsCount: Number(records?.c||0), invoicesToday: Number(inv?.c||0), commonRecordTypes: common });
  } catch { res.status(500).json({ message: 'Failed' }); }
});

app.get('/api/metrics/labs/abnormal', requireAuth, async (req, res) => {
  try { const [row] = await q("SELECT COUNT(*) c FROM lab_results WHERE flag IN ('abnormal','critical') AND date >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)"); res.json({ abnormal: Number(row?.c||0) }); }
  catch { res.status(500).json({ message: 'Failed' }); }
});

// Branches/Services/Templates CRUD
app.get('/api/branches', requireAuth, async (req, res) => { try { res.json(await q("SELECT * FROM branches ORDER BY id DESC")); } catch { res.status(500).json({ message: 'Failed' }); } });
app.post('/api/branches', requireAuth, requireRole(['admin','manager']), async (req, res) => { try { const r = await q("INSERT INTO branches (name, address) VALUES (?,?)", [req.body?.name, req.body?.address||null]); await audit(req.user.id, 'create', 'branch', r.insertId, req.body); res.status(201).json({ id: r.insertId }); } catch { res.status(500).json({ message: 'Failed' }); } });
app.delete('/api/branches/:id', requireAuth, requireRole(['admin','manager']), async (req, res) => { try { await q("DELETE FROM branches WHERE id = ?", [Number(req.params.id)]); await audit(req.user.id, 'delete', 'branch', Number(req.params.id)); res.json({ ok: true }); } catch { res.status(500).json({ message: 'Failed' }); } });

app.get('/api/services', requireAuth, async (req, res) => { try { res.json(await q("SELECT * FROM services ORDER BY id DESC")); } catch { res.status(500).json({ message: 'Failed' }); } });
app.post('/api/services', requireAuth, requireRole(['admin','manager']), async (req, res) => { try { const r = await q("INSERT INTO services (name, price) VALUES (?,?)", [req.body?.name, Number(req.body?.price)||0]); await audit(req.user.id, 'create', 'service', r.insertId, req.body); res.status(201).json({ id: r.insertId }); } catch { res.status(500).json({ message: 'Failed' }); } });
app.delete('/api/services/:id', requireAuth, requireRole(['admin','manager']), async (req, res) => { try { await q("DELETE FROM services WHERE id = ?", [Number(req.params.id)]); await audit(req.user.id, 'delete', 'service', Number(req.params.id)); res.json({ ok: true }); } catch { res.status(500).json({ message: 'Failed' }); } });

app.get('/api/templates', requireAuth, async (req, res) => { try { res.json(await q("SELECT * FROM templates ORDER BY id DESC")); } catch { res.status(500).json({ message: 'Failed' }); } });
app.post('/api/templates', requireAuth, requireRole(['admin','manager']), async (req, res) => { try { const { type, key, subject, body, enabled } = req.body||{}; const r = await q("INSERT INTO templates (type, `key`, subject, body, enabled) VALUES (?,?,?,?,?)", [type, key, subject||null, body, !!enabled]); await audit(req.user.id, 'create', 'template', r.insertId, { type, key }); res.status(201).json({ id: r.insertId }); } catch { res.status(500).json({ message: 'Failed' }); } });
app.delete('/api/templates/:id', requireAuth, requireRole(['admin','manager']), async (req, res) => { try { await q("DELETE FROM templates WHERE id = ?", [Number(req.params.id)]); await audit(req.user.id, 'delete', 'template', Number(req.params.id)); res.json({ ok: true }); } catch { res.status(500).json({ message: 'Failed' }); } });

// Prescriptions and Lab Orders (doctor)
app.post('/api/prescriptions', requireAuth, requireRole(['doctor','admin']), async (req, res) => {
  try {
    const { patient_id, diagnosis, medications, notes } = req.body || {};
    if (!patient_id) return res.status(400).json({ message: 'Missing patient_id' });
    const meds = medications ? JSON.stringify(medications) : null;
    const r = await q("INSERT INTO prescriptions (patient_id, doctor_id, diagnosis, medications, notes, date) VALUES (?,?,?,?,?, CURRENT_DATE)", [Number(patient_id), req.user.id, diagnosis||null, meds, notes||null]);
    await audit(req.user.id, 'create', 'prescription', r.insertId, { patient_id });
    res.status(201).json({ id: r.insertId });
  } catch { res.status(500).json({ message: 'Failed' }); }
});

app.post('/api/lab-orders', requireAuth, requireRole(['doctor','admin']), async (req, res) => {
  try {
    const { patient_id, tests, notes } = req.body || {};
    if (!patient_id) return res.status(400).json({ message: 'Missing patient_id' });
    const t = Array.isArray(tests) ? JSON.stringify(tests) : null;
    const r = await q("INSERT INTO lab_orders (patient_id, doctor_id, tests, notes) VALUES (?,?,?,?)", [Number(patient_id), req.user.id, t, notes||null]);
    await audit(req.user.id, 'create', 'lab_order', r.insertId, { patient_id });
    res.status(201).json({ id: r.insertId });
  } catch { res.status(500).json({ message: 'Failed' }); }
});

// Labs list (for patient dashboard sample)
app.get('/api/labs', requireAuth, async (req, res) => {
  try { res.json(await q("SELECT * FROM lab_results ORDER BY date DESC, id DESC LIMIT 50")); }
  catch { res.status(500).json({ message: 'Failed' }); }
});

// Medical Records API
app.get('/api/records', requireAuth, async (req, res) => {
  try {
    const { patient_id } = req.query;
    let sql = "SELECT * FROM medical_records"; const params = [];
    if (patient_id) { sql += " WHERE patient_id = ?"; params.push(Number(patient_id)); }
    sql += " ORDER BY date DESC, id DESC LIMIT 200";
    res.json(await q(sql, params));
  } catch { res.status(500).json({ message: 'Failed' }); }
});

// Manager Resources APIs
// Departments
app.get('/api/departments', requireAuth, async (req, res) => { try { res.json(await q("SELECT * FROM departments ORDER BY name ASC")); } catch { res.status(500).json({ message: 'Failed' }); } });
app.post('/api/departments', requireAuth, requireRole(['admin','manager']), async (req, res) => { try { const r = await q("INSERT INTO departments (name) VALUES (?)", [req.body?.name]); await audit(req.user.id, 'create', 'department', r.insertId, req.body); res.status(201).json({ id: r.insertId }); } catch { res.status(500).json({ message: 'Failed' }); } });
app.delete('/api/departments/:id', requireAuth, requireRole(['admin','manager']), async (req, res) => { try { await q("DELETE FROM departments WHERE id = ?", [Number(req.params.id)]); await audit(req.user.id, 'delete', 'department', Number(req.params.id)); res.json({ ok: true }); } catch { res.status(500).json({ message: 'Failed' }); } });

// Wards
app.get('/api/wards', requireAuth, async (req, res) => { try { res.json(await q("SELECT * FROM wards ORDER BY id DESC")); } catch { res.status(500).json({ message: 'Failed' }); } });
app.post('/api/wards', requireAuth, requireRole(['admin','manager']), async (req, res) => { try { const { department_id, name } = req.body||{}; const r = await q("INSERT INTO wards (department_id, name) VALUES (?,?)", [Number(department_id), name]); await audit(req.user.id, 'create', 'ward', r.insertId, req.body); res.status(201).json({ id: r.insertId }); } catch { res.status(500).json({ message: 'Failed' }); } });
app.delete('/api/wards/:id', requireAuth, requireRole(['admin','manager']), async (req, res) => { try { await q("DELETE FROM wards WHERE id = ?", [Number(req.params.id)]); await audit(req.user.id, 'delete', 'ward', Number(req.params.id)); res.json({ ok: true }); } catch { res.status(500).json({ message: 'Failed' }); } });

// Beds
app.get('/api/beds', requireAuth, async (req, res) => { try { res.json(await q("SELECT * FROM beds ORDER BY id DESC")); } catch { res.status(500).json({ message: 'Failed' }); } });
app.post('/api/beds', requireAuth, requireRole(['admin','manager']), async (req, res) => { try { const { ward_id, label, status } = req.body||{}; const st = ['available','occupied','maintenance'].includes(String(status)) ? String(status) : 'available'; const r = await q("INSERT INTO beds (ward_id, label, status) VALUES (?,?,?)", [Number(ward_id), label, st]); await audit(req.user.id, 'create', 'bed', r.insertId, req.body); res.status(201).json({ id: r.insertId }); } catch { res.status(500).json({ message: 'Failed' }); } });
app.patch('/api/beds/:id', requireAuth, requireRole(['admin','manager']), async (req, res) => { try { const { status } = req.body||{}; const st = ['available','occupied','maintenance'].includes(String(status)) ? String(status) : null; if (!st) return res.status(400).json({ message: 'Invalid status' }); await q("UPDATE beds SET status=? WHERE id=?", [st, Number(req.params.id)]); await audit(req.user.id, 'update', 'bed', Number(req.params.id), { status: st }); res.json({ ok: true }); } catch { res.status(500).json({ message: 'Failed' }); } });
app.delete('/api/beds/:id', requireAuth, requireRole(['admin','manager']), async (req, res) => { try { await q("DELETE FROM beds WHERE id = ?", [Number(req.params.id)]); await audit(req.user.id, 'delete', 'bed', Number(req.params.id)); res.json({ ok: true }); } catch { res.status(500).json({ message: 'Failed' }); } });

// Inventory
app.get('/api/inventory', requireAuth, async (req, res) => {
  try {
    const low = String(req.query.low_stock||'').toLowerCase();
    if (['1','true','yes','on'].includes(low)) {
      return res.json(await q("SELECT * FROM inventory_items WHERE quantity <= reorder_threshold ORDER BY (reorder_threshold - quantity) DESC, id DESC"));
    }
    res.json(await q("SELECT * FROM inventory_items ORDER BY id DESC"));
  } catch { res.status(500).json({ message: 'Failed' }); }
});
app.post('/api/inventory', requireAuth, requireRole(['admin','manager']), async (req, res) => { try { const { name, sku, quantity, reorder_threshold, unit } = req.body||{}; const r = await q("INSERT INTO inventory_items (name, sku, quantity, reorder_threshold, unit) VALUES (?,?,?,?,?)", [name, sku||null, Number(quantity)||0, Number(reorder_threshold)||0, unit||null]); await audit(req.user.id, 'create', 'inventory_item', r.insertId, req.body); res.status(201).json({ id: r.insertId }); } catch { res.status(500).json({ message: 'Failed' }); } });
app.patch('/api/inventory/:id', requireAuth, requireRole(['admin','manager']), async (req, res) => { try { const { quantity } = req.body||{}; if (quantity==null) return res.status(400).json({ message: 'quantity required' }); await q("UPDATE inventory_items SET quantity=? WHERE id=?", [Number(quantity), Number(req.params.id)]); await audit(req.user.id, 'update', 'inventory_item', Number(req.params.id), { quantity: Number(quantity) }); res.json({ ok: true }); } catch { res.status(500).json({ message: 'Failed' }); } });
app.delete('/api/inventory/:id', requireAuth, requireRole(['admin','manager']), async (req, res) => { try { await q("DELETE FROM inventory_items WHERE id = ?", [Number(req.params.id)]); await audit(req.user.id, 'delete', 'inventory_item', Number(req.params.id)); res.json({ ok: true }); } catch { res.status(500).json({ message: 'Failed' }); } });

// Staff & Shifts
app.get('/api/staff', requireAuth, async (req, res) => { try { res.json(await q("SELECT * FROM staff ORDER BY id DESC")); } catch { res.status(500).json({ message: 'Failed' }); } });
app.post('/api/staff', requireAuth, requireRole(['admin','manager']), async (req, res) => { try { const { user_id, name, role, department_id } = req.body||{}; const r = await q("INSERT INTO staff (user_id, name, role, department_id) VALUES (?,?,?,?)", [user_id||null, name, role, department_id||null]); await audit(req.user.id, 'create', 'staff', r.insertId, req.body); res.status(201).json({ id: r.insertId }); } catch { res.status(500).json({ message: 'Failed' }); } });
app.patch('/api/staff/:id', requireAuth, requireRole(['admin','manager']), async (req, res) => { try { const { department_id, role } = req.body||{}; const params = []; let sql = 'UPDATE staff SET '; const sets = []; if (department_id!==undefined){ sets.push('department_id=?'); params.push(department_id||null);} if (role){ sets.push('role=?'); params.push(role);} if(!sets.length) return res.status(400).json({ message: 'No changes' }); sql += sets.join(', ')+ ' WHERE id=?'; params.push(Number(req.params.id)); await q(sql, params); await audit(req.user.id, 'update', 'staff', Number(req.params.id), req.body); res.json({ ok: true }); } catch { res.status(500).json({ message: 'Failed' }); } });
// Support department update path used by ManagerDashboard
app.put('/api/staff/:id/department', requireAuth, requireRole(['admin','manager']), async (req, res) => { try { const depId = ('department_id' in req.body) ? (req.body.department_id || null) : null; await q("UPDATE staff SET department_id=? WHERE id=?", [depId, Number(req.params.id)]); await audit(req.user.id, 'update', 'staff', Number(req.params.id), { department_id: depId }); res.json({ ok: true }); } catch { res.status(500).json({ message: 'Failed' }); } });
app.delete('/api/staff/:id', requireAuth, requireRole(['admin','manager']), async (req, res) => { try { await q("DELETE FROM staff WHERE id = ?", [Number(req.params.id)]); await audit(req.user.id, 'delete', 'staff', Number(req.params.id)); res.json({ ok: true }); } catch { res.status(500).json({ message: 'Failed' }); } });

app.get('/api/shifts', requireAuth, async (req, res) => { try { const { date } = req.query; let sql = 'SELECT * FROM shifts'; const params=[]; if (date){ sql += ' WHERE date=?'; params.push(date);} sql += ' ORDER BY date DESC, id DESC'; res.json(await q(sql, params)); } catch { res.status(500).json({ message: 'Failed' }); } });
app.post('/api/shifts', requireAuth, requireRole(['admin','manager']), async (req, res) => { try { const { staff_id, date, start_time, end_time, status } = req.body||{}; if (!staff_id || !date || !start_time || !end_time) return res.status(400).json({ message: 'Missing fields' }); const st = ['scheduled','completed','missed'].includes(String(status)) ? String(status) : 'scheduled'; const r = await q("INSERT INTO shifts (staff_id, date, start_time, end_time, status) VALUES (?,?,?,?,?)", [Number(staff_id), date, start_time, end_time, st]); await audit(req.user.id, 'create', 'shift', r.insertId, req.body); res.status(201).json({ id: r.insertId }); } catch { res.status(500).json({ message: 'Failed' }); } });
app.patch('/api/shifts/:id', requireAuth, requireRole(['admin','manager']), async (req, res) => { try { const { status } = req.body||{}; const st = ['scheduled','completed','missed'].includes(String(status)) ? String(status) : null; if (!st) return res.status(400).json({ message: 'Invalid status' }); await q("UPDATE shifts SET status=? WHERE id=?", [st, Number(req.params.id)]); await audit(req.user.id, 'update', 'shift', Number(req.params.id), { status: st }); res.json({ ok: true }); } catch { res.status(500).json({ message: 'Failed' }); } });
// Support PUT as used by ManagerDashboard
app.put('/api/shifts/:id', requireAuth, requireRole(['admin','manager']), async (req, res) => { try { const { status } = req.body||{}; const st = ['scheduled','completed','missed'].includes(String(status)) ? String(status) : null; if (!st) return res.status(400).json({ message: 'Invalid status' }); await q("UPDATE shifts SET status=? WHERE id=?", [st, Number(req.params.id)]); await audit(req.user.id, 'update', 'shift', Number(req.params.id), { status: st }); res.json({ ok: true }); } catch { res.status(500).json({ message: 'Failed' }); } });
app.delete('/api/shifts/:id', requireAuth, requireRole(['admin','manager']), async (req, res) => { try { await q("DELETE FROM shifts WHERE id = ?", [Number(req.params.id)]); await audit(req.user.id, 'delete', 'shift', Number(req.params.id)); res.json({ ok: true }); } catch { res.status(500).json({ message: 'Failed' }); } });

// Attendance (read-only for now)
app.get('/api/attendance', requireAuth, async (req, res) => {
  try {
    const { from, to, staff_id, date } = req.query;
    let sql = 'SELECT * FROM attendance WHERE 1=1';
    const params=[];
    if (date) { sql += ' AND date = ?'; params.push(date); }
    if (from) { sql += ' AND date>=?'; params.push(from); }
    if (to) { sql += ' AND date<=?'; params.push(to); }
    if (staff_id) { sql += ' AND staff_id=?'; params.push(Number(staff_id)); }
    sql += ' ORDER BY date DESC, id DESC';
    res.json(await q(sql, params));
  } catch { res.status(500).json({ message: 'Failed' }); }
});

app.post('/api/records', requireAuth, requireRole(['doctor','admin']), async (req, res) => {
  try {
    const { patient_id, record_type, notes, date } = req.body || {};
    if (!patient_id || !record_type || !date) return res.status(400).json({ message: 'Missing fields' });
    const r = await q("INSERT INTO medical_records (patient_id, record_type, notes, date) VALUES (?,?,?,?)", [Number(patient_id), record_type, notes||null, date]);
    await audit(req.user.id, 'create', 'medical_record', r.insertId, { patient_id, record_type });
    res.status(201).json({ id: r.insertId });
  } catch { res.status(500).json({ message: 'Failed' }); }
});

// Notifications API (basic, role-based)
app.get('/api/notifications', requireAuth, async (req, res) => {
  try {
    const role = String(req.user.role || 'all');
    const rows = await q("SELECT * FROM notifications WHERE target_role IN ('all', ?) ORDER BY id DESC LIMIT 100", [role]);
    res.json(rows);
  } catch { res.status(500).json({ message: 'Failed' }); }
});

app.post('/api/notifications', requireAuth, requireRole(['admin','manager','doctor']), async (req, res) => {
  try {
    const { title, message, target_role } = req.body || {};
    if (!title || !message) return res.status(400).json({ message: 'Missing fields' });
    const target = ['all','patient','doctor','admin','laboratorist','manager'].includes(String(target_role)) ? String(target_role) : 'all';
    const r = await q("INSERT INTO notifications (title, message, target_role, created_by) VALUES (?,?,?,?)", [title, message, target, req.user.id]);
    await audit(req.user.id, 'create', 'notification', r.insertId, { target_role: target });
    res.status(201).json({ id: r.insertId });
  } catch { res.status(500).json({ message: 'Failed' }); }
});

// Audit log list with optional filters
app.get('/api/audit', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { from, to, user_id } = req.query;
    let sql = "SELECT * FROM audit_logs WHERE 1=1"; const params = [];
    if (from) { sql += " AND created_at >= ?"; params.push(from + ' 00:00:00'); }
    if (to) { sql += " AND created_at <= ?"; params.push(to + ' 23:59:59'); }
    if (user_id) { sql += " AND user_id = ?"; params.push(Number(user_id)); }
    sql += " ORDER BY id DESC LIMIT 200";
    res.json(await q(sql, params));
  } catch { res.status(500).json({ message: 'Failed' }); }
});

// API 404 handler
app.use("/api", (req, res) => {
  res.status(404).json({ message: "API route not found" });
});

// Global JSON error handler (must be after routes)
// Ensures we never leak HTML error pages to the client
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("[api] Unhandled error:", err);
  if (res.headersSent) {
    return; // let Express finish
  }
  res.status(500).json({ message: "Internal Server Error", details: err?.message || "" });
});

// Optional: Serve static files in production after `vite build`
// If you want this server to host the frontend build, uncomment the following:
// const distPath = path.join(__dirname, "..", "dist");
// app.use(express.static(distPath));
// app.get(/^(?!\/api).*/, (req, res) => {
//   res.sendFile(path.join(distPath, "index.html"));
// });

app.listen(PORT, () => {
  console.log(`API server started on http://localhost:${PORT}`);
});
