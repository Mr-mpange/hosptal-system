// ESM Express server with MySQL connection pooling and basic routes.
// Explicitly load the root .env regardless of where the process is started from.
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

app.post('/api/inventory', requireAuth, requireRole('admin','manager'), async (req, res) => {
  try {
    const { name, sku, quantity, reorder_threshold, unit } = req.body || {};
    if (!name) return res.status(400).json({ message: 'name is required' });
    const row = await models.InventoryItem.create({ name, sku: sku||null, quantity: Number(quantity)||0, reorder_threshold: Number(reorder_threshold)||0, unit: unit||null });
    res.status(201).json(row);
  } catch (err) {
    console.error('/api/inventory POST error:', err);
    res.status(500).json({ message: 'Create inventory failed', details: toDbMessage(err) });
  }
});

app.patch('/api/inventory/:id', requireAuth, requireRole('admin','manager'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await models.InventoryItem.findByPk(id);
    if (!row) return res.status(404).json({ message: 'Not found' });
    const { quantity, name, reorder_threshold, unit, sku } = req.body || {};
    await row.update({
      quantity: quantity!==undefined ? Number(quantity) : row.quantity,
      name: name!==undefined ? String(name) : row.name,
      reorder_threshold: reorder_threshold!==undefined ? Number(reorder_threshold) : row.reorder_threshold,
      unit: unit!==undefined ? (unit||null) : row.unit,
      sku: sku!==undefined ? (sku||null) : row.sku,
    });
    res.json(row);
  } catch (err) {
    console.error('/api/inventory/:id PATCH error:', err);
    res.status(500).json({ message: 'Update inventory failed', details: toDbMessage(err) });
  }
});

// ===== Payments (initiate and status) =====
app.post('/api/payments/initiate', requireAuth, async (req, res) => {
  try {
    const { invoice_id, method } = req.body || {};
    const invId = Number(invoice_id);
    if (!invId) return res.status(400).json({ message: 'invoice_id required' });
    const inv = await models.Invoice.findByPk(invId);
    if (!inv) return res.status(404).json({ message: 'Invoice not found' });
    const reference = `CN-${invId}-${Date.now()}`;
    const row = await models.Payment.create({ invoice_id: invId, patient_id: inv.patient_id, amount: inv.amount, method: method || 'control', status: 'initiated', reference });
    res.status(201).json(row);
  } catch (err) {
    console.error('/api/payments/initiate POST error:', err);
    res.status(500).json({ message: 'Initiate payment failed', details: toDbMessage(err) });
  }
});

app.get('/api/payments/by-invoice/:invoiceId', requireAuth, async (req, res) => {
  try {
    const invoiceId = Number(req.params.invoiceId);
    const rows = await models.Payment.findAll({ where: { invoice_id: invoiceId }, order: [['id','DESC']], limit: 1 });
    res.json(rows[0] || null);
  } catch (err) {
    console.error('/api/payments/by-invoice GET error:', err);
    res.status(500).json({ message: 'Fetch payment failed', details: toDbMessage(err) });
  }
});

app.get('/api/payments/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await models.Payment.findByPk(id);
    if (!row) return res.status(404).json({ message: 'Not found' });
    res.json(row);
  } catch (err) {
    console.error('/api/payments/:id GET error:', err);
    res.status(500).json({ message: 'Fetch payment failed', details: toDbMessage(err) });
  }
});

// ===== Appointment available slots (auth) =====
app.get('/api/appointments/available', requireAuth, async (req, res) => {
  try {
    const doctor_id = Number(req.query.doctor_id);
    const date = String(req.query.date || '');
    if (!doctor_id || !date) return res.status(400).json({ message: 'doctor_id and date required' });
    const av = await models.Availability.findAll({ where: { doctor_user_id: doctor_id, date, status: 'on' }, order: [['id','ASC']], limit: 50 });
    if (!av.length) return res.json([]);
    const taken = await models.Appointment.findAll({ where: { doctor_id, date }, attributes: ['time'], limit: 500 });
    const takenSet = new Set(taken.map(t => String(t.time)));
    const slots = [];
    for (const a of av) {
      const start = a.start_time || '09:00';
      const end = a.end_time || '17:00';
      let [h, m] = start.split(':').map(Number);
      while (true) {
        const t = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
        if (t > end) break;
        if (!takenSet.has(t)) slots.push(t);
        m += 15; if (m >= 60) { m = 0; h += 1; }
        if (h > 23) break;
      }
    }
    res.json([...new Set(slots)].sort());
  } catch (err) {
    console.error('/api/appointments/available error:', err);
    res.status(500).json({ message: 'Fetch available slots failed', details: toDbMessage(err) });
  }
});

// ===== Reports: Finance CSV (admin/manager) =====
app.get('/api/reports/finance.csv', requireAuth, requireRole('admin','manager'), async (req, res) => {
  try {
    const { from, to } = req.query || {};
    const where = {};
    if (from) where.date = { [Op.gte]: String(from) };
    if (to) where.date = where.date ? { ...where.date, [Op.lte]: String(to) } : { [Op.lte]: String(to) };
    const invoices = await models.Invoice.findAll({ where, order: [['date','ASC'],['id','ASC']] });
    const header = 'id,patient_id,amount,date,status\n';
    const rows = invoices.map(inv => [inv.id, inv.patient_id, inv.amount, inv.date, inv.status].join(',')).join('\n');
    const csv = header + rows + (rows ? '\n' : '');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="finance.csv"');
    res.send(csv);
  } catch (err) {
    console.error('/api/reports/finance.csv GET error:', err);
    res.status(500).json({ message: 'Generate finance CSV failed', details: toDbMessage(err) });
  }
});

// ===== Reports: Occupancy CSV (admin/manager) =====
app.get('/api/reports/occupancy.csv', requireAuth, requireRole('admin','manager'), async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT d.name AS department,
             COUNT(b.id) AS total,
             SUM(CASE WHEN b.status='occupied' THEN 1 ELSE 0 END) AS occupied
      FROM departments d
      LEFT JOIN wards w ON w.department_id = d.id
      LEFT JOIN beds b ON b.ward_id = w.id
      GROUP BY d.id, d.name
      ORDER BY d.name ASC`);
    const header = 'department,total,occupied,free\n';
    const body = rows.map(r => {
      const total = Number(r.total||0);
      const occ = Number(r.occupied||0);
      const free = Math.max(total - occ, 0);
      return [r.department, total, occ, free].join(',');
    }).join('\n');
    const csv = header + body + (body ? '\n' : '');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="occupancy.csv"');
    res.send(csv);
  } catch (err) {
    console.error('/api/reports/occupancy.csv GET error:', err);
    res.status(500).json({ message: 'Generate occupancy CSV failed', details: toDbMessage(err) });
  }
});

// ===== Reports: Admissions CSV (admin/manager) =====
// Placeholder since admissions table may not be populated. Export basic appointments as proxy.
app.get('/api/reports/admissions.csv', requireAuth, requireRole('admin','manager'), async (req, res) => {
  try {
    const { from, to } = req.query || {};
    const where = {};
    if (from || to) {
      where.date = {};
      if (from) where.date[Op.gte] = String(from);
      if (to) where.date[Op.lte] = String(to);
    }
    const list = await models.Appointment.findAll({ where, order: [['date','ASC'],['id','ASC']], limit: 5000 });
    const header = 'id,patient_id,doctor_id,date,time,status\n';
    const body = list.map(a => [a.id, a.patient_id, a.doctor_id ?? '', a.date, a.time, a.status || ''].join(',')).join('\n');
    const csv = header + body + (body ? '\n' : '');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="admissions.csv"');
    res.send(csv);
  } catch (err) {
    console.error('/api/reports/admissions.csv GET error:', err);
    res.status(500).json({ message: 'Generate admissions CSV failed', details: toDbMessage(err) });
  }
});
import express from 'express';
import cors from 'cors';
import { pool } from './mysql.js';
import { sequelize, initModels, syncSequelize, models } from './sequelize.js';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ==== JWT helpers and middleware (must be defined before any route uses them) ====
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';

const signToken = (user) => {
  if (!JWT_SECRET) throw new Error('Server is missing JWT_SECRET');
  const payload = {
    sub: String(user.id),
    role: user.role,
    email: user.email,
    name: user.name,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

const requireAuth = (req, res, next) => {
  try {
    const auth = req.headers.authorization || '';
    const parts = auth.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ message: 'Missing or invalid Authorization header' });
    }
    if (!JWT_SECRET) {
      return res.status(500).json({ message: 'Server is missing JWT_SECRET' });
    }
    const decoded = jwt.verify(parts[1], JWT_SECRET);
    req.user = decoded; // { sub, role, email, name, iat, exp }
    next();
  } catch (err) {
    console.error('Auth error:', err?.message || err);
    return res.status(401).json({ message: 'Unauthorized' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  if (!roles.includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
  next();
};

// Tiny logger for debugging
app.use((req, _res, next) => {
  console.log(`[api] ${req.method} ${req.url}`);
  next();
});

// Ensure CORS preflight (OPTIONS) for API routes succeeds and does not fall through to 404
app.options('/api/*', cors());

// Audit logging for write operations (POST/PUT/PATCH/DELETE)
app.use((req, res, next) => {
  const method = String(req.method || 'GET').toUpperCase();
  const isWrite = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
  if (!isWrite) return next();
  const start = Date.now();
  res.on('finish', async () => {
    try {
      // Only log if models are initialized and table exists
      if (!models?.AuditLog) return;
      const userId = req.user?.sub ? Number(req.user.sub) : null;
      const action = `${method} ${req.path}`;
      const entityMatch = String(req.path || '').split('/').filter(Boolean);
      const entity = entityMatch[1] || 'unknown'; // e.g., /api/patients/123 -> 'patients'
      const entityId = (() => { const id = Number(entityMatch[2]); return Number.isFinite(id) ? id : null; })();
      const meta = JSON.stringify({ query: req.query || {}, statusCode: res.statusCode, durationMs: Date.now() - start });
      await models.AuditLog.create({ user_id: userId || null, action, entity, entity_id: entityId, meta });
    } catch (e) {
      // Do not crash request flow for logging errors
      console.warn('[audit] log failed:', e?.message || e);
    }
  });
  next();
});

// Simple API root to verify server is up
app.get('/api', (_req, res) => {
  res.json({ status: 'ok', message: 'API running', endpoints: ['GET /api/health', 'POST /api/login', 'POST /api/register'] });
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    const [rows] = await pool.query('SELECT id, name, email, password_hash, role FROM users WHERE email = ? LIMIT 1', [email]);
    const user = rows && rows[0];
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    const bcrypt = (await import('bcryptjs')).default;
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
    const token = signToken(user);
    return res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('/api/login error:', err);
    return res.status(500).json({ message: 'Login failed', details: toDbMessage(err) });
  }
});

// ===== Notifications =====
// Create notification (admin/manager only)
app.post('/api/notifications', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const { title, message, target_role } = req.body || {};
    const allowedTargets = ['all','patient','doctor','admin','laboratorist','manager'];
    if (!title || !message) {
      return res.status(400).json({ message: 'Missing required fields: title, message' });
    }
    const trg = (target_role || 'all').toLowerCase();
    if (!allowedTargets.includes(trg)) {
      return res.status(400).json({ message: 'Invalid target_role' });
    }
    const created_by = req.user?.sub ? Number(req.user.sub) : null;
    const row = await models.Notification.create({ title, message, target_role: trg, created_by });
    res.status(201).json(row);
  } catch (err) {
    console.error('/api/notifications POST error:', err);
    res.status(500).json({ message: 'Create notification failed', details: toDbMessage(err) });
  }
});

// List notifications relevant to the current user
app.get('/api/notifications', requireAuth, async (req, res) => {
  try {
    const role = String(req.user?.role || 'patient').toLowerCase();
    const page = Math.max(1, Number(req.query.page||1));
    const limit = Math.min(200, Math.max(1, Number(req.query.limit||50)));
    const offset = (page-1)*limit;
    const where = { target_role: { [Op.in]: ['all', role] } };
    if (req.query.from || req.query.to) {
      where.created_at = {};
      if (req.query.from) where.created_at[Op.gte] = new Date(String(req.query.from));
      if (req.query.to) where.created_at[Op.lte] = new Date(String(req.query.to));
    }
    if (req.query.q) {
      const q = String(req.query.q);
      where[Op.or] = [
        { title: { [Op.like]: `%${q}%` } },
        { message: { [Op.like]: `%${q}%` } },
      ];
    }
    const list = await models.Notification.findAll({ where, order: [['id','DESC']], limit, offset });
    // mark read flags for current user
    const userId = Number(req.user?.sub);
    let readMap = new Set();
    try {
      const ids = list.map(n => n.id);
      if (ids.length) {
        const reads = await models.NotificationsRead.findAll({ where: { user_id: userId, notification_id: { [Op.in]: ids } }, attributes: ['notification_id'] });
        readMap = new Set(reads.map(r => r.notification_id));
      }
    } catch {}
    res.json(list.map(n => ({ ...n.toJSON(), read: readMap.has(n.id) })));
  } catch (err) {
    console.error('/api/notifications GET error:', err);
    res.status(500).json({ message: 'Fetch notifications failed', details: toDbMessage(err) });
  }
});

// Mark notification as read
app.post('/api/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const userId = Number(req.user?.sub);
    if (!id || !userId) return res.status(400).json({ message: 'Invalid' });
    await models.NotificationsRead.findOrCreate({ where: { user_id: userId, notification_id: id }, defaults: { user_id: userId, notification_id: id } });
    res.json({ ok: true });
  } catch (err) {
    console.error('/api/notifications/:id/read POST error:', err);
    res.status(500).json({ message: 'Mark read failed', details: toDbMessage(err) });
  }
});

// Patients: fetch by user_id to support personalized dashboards
app.get('/api/patients/by-user/:userId', requireAuth, async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId) return res.status(400).json({ message: 'Invalid user id' });
    // Patients can only access their own record; doctors/admins can access any
    const role = req.user?.role;
    const sub = Number(req.user?.sub);
    if (role === 'patient' && sub !== userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const [rows] = await pool.query('SELECT * FROM patients WHERE user_id = ? LIMIT 1', [userId]);
    if (!rows || rows.length === 0) return res.status(404).json({ message: 'Patient not found for user' });
    res.json(rows[0]);
  } catch (err) {
    console.error('/api/patients/by-user error:', err);
    res.status(500).json({ message: 'Lookup failed', details: toDbMessage(err) });
  }
});

// Guide if someone tries GET /api/login
app.get('/api/login', (_req, res) => {
  res.status(405).json({ message: 'Method Not Allowed: use POST /api/login' });
});

// Map common MySQL errors to friendly messages
const toDbMessage = (err) => {
  if (!err) return undefined;
  if (err.code === 'ER_ACCESS_DENIED_ERROR') return 'DB access denied: check DB_USER/DB_PASSWORD';
  if (err.code === 'ER_BAD_DB_ERROR') return 'Database not found: check DB_NAME';
  if (err.code === 'ER_NO_SUCH_TABLE') return 'Table not found (users): run the migration/DDL in README';
  if (err.code === 'ECONNREFUSED') return 'Cannot connect to MySQL: check DB_HOST/DB_PORT and that MySQL is running';
  if (err.code === 'ER_NO_REFERENCED_ROW_2') return 'Referenced row not found (e.g., patient_id does not exist)';
  return err.message || String(err);
};

// Health check (always 200, with db status included)
app.get('/api/health', async (_req, res) => {
  let db = 'unknown';
  let db_error = undefined;
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    db = rows?.[0]?.ok === 1 ? 'connected' : 'unknown';
  } catch (err) {
    console.error('/api/health db error:', err);
    db = 'error';
    db_error = err?.message || String(err);
  }
  res.json({ status: 'ok', db, db_error });
});

// Admin: create user with role (protected by JWT + role=admin)
app.post('/api/admin/users', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    if (!['patient', 'doctor', 'admin', 'laboratorist', 'manager'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (existing && existing.length > 0) {
      return res.status(409).json({ message: 'Email is already registered' });
    }
    const bcrypt = (await import('bcryptjs')).default;
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, email, hash, role]
    );
    return res.status(201).json({ id: result.insertId, name, email, role });
  } catch (err) {
    console.error('/api/admin/users error:', err);
    return res.status(500).json({ message: 'Create user failed', details: toDbMessage(err) });
  }
});

// Simple ping
app.get('/api/ping', (_req, res) => {
  res.json({ message: 'pong' });
});

// ===== Server-Sent Events for notifications =====
app.get('/api/events', async (req, res) => {
  try {
    // Authenticate: prefer Authorization header, else token query param
    let user = null;
    try {
      const auth = req.headers.authorization || '';
      const parts = auth.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer' && JWT_SECRET) {
        user = jwt.verify(parts[1], JWT_SECRET);
      } else if (req.query?.token && JWT_SECRET) {
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

    const send = (event, data) => {
      try {
        if (event) res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch {}
    };

    // Initial hello
    send('message', { type: 'hello', time: new Date().toISOString() });

    // On connect, send recent notifications for the user role
    try {
      const role = String(user.role || 'all');
      const notifs = await models.Notification.findAll({
        where: {
          target_role: { [Op.in]: ['all', role] },
        },
        order: [['id','DESC']],
        limit: 5,
      });
      for (const n of notifs.reverse()) {
        send('notification', { id: n.id, title: n.title, message: n.message, role: n.target_role, created_at: n.created_at });
      }
    } catch {}

    // Heartbeat
    const hb = setInterval(() => {
      send('ping', { t: Date.now() });
    }, 30000);

    req.on('close', () => {
      clearInterval(hb);
    });
  } catch (err) {
    try { res.end(); } catch {}
  }
});

// Current authenticated user info
app.get('/api/me', requireAuth, async (req, res) => {
  try {
    const id = Number(req.user?.sub);
    const role = String(req.user?.role || '').toLowerCase();
    const email = req.user?.email || '';
    const name = req.user?.name || '';
    res.json({ id, role, email, name });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load user' });
  }
});

// Simplified patients list
app.get('/api/patients/simple', requireAuth, requireRole('admin','manager','doctor'), async (_req, res) => {
  try {
    const rows = await models.Patient.findAll({ attributes: ['id','name','email'], order: [['id','ASC']], limit: 1000 });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load patients' });
  }
});

// ===== Doctors list (auth) =====
app.get('/api/doctors', requireAuth, async (_req, res) => {
  try {
    // users table: role='doctor'
    const [rows] = await pool.query("SELECT id, name, email, role FROM users WHERE role = 'doctor' ORDER BY name ASC LIMIT 500");
    res.json(rows);
  } catch (err) {
    console.error('/api/doctors GET error:', err);
    res.status(500).json({ message: 'Fetch doctors failed', details: toDbMessage(err) });
  }
});

// ===== Appointment create with conflict check (auth) =====
app.post('/api/appointments', requireAuth, async (req, res) => {
  try {
    const { patient_id, doctor_id, date, time, notes } = req.body || {};
    let pid = Number(patient_id);
    const did = doctor_id ? Number(doctor_id) : null;
    const role = String(req.user?.role || '').toLowerCase();
    // If patient, infer patient_id from user
    if (!pid && role === 'patient') {
      const [[row]] = await pool.query('SELECT id FROM patients WHERE user_id = ? LIMIT 1', [Number(req.user?.sub)]);
      pid = row?.id;
    }
    if (!pid || !date || !time) return res.status(400).json({ message: 'Missing patient_id/date/time' });
    // Conflict check (same doctor/date/time)
    if (did) {
      const conflict = await models.Appointment.count({ where: { doctor_id: did, date: String(date), time: String(time) } });
      if (conflict > 0) return res.status(409).json({ message: 'Selected slot is not available' });
    }
    const row = await models.Appointment.create({ patient_id: pid, doctor_id: did || null, date: String(date), time: String(time), notes: notes || null });
    res.status(201).json(row);
  } catch (err) {
    console.error('/api/appointments POST error:', err);
    res.status(500).json({ message: 'Create appointment failed', details: toDbMessage(err) });
  }
});

// ===== Admin Settings: Branches =====
app.get('/api/branches', requireAuth, requireRole('admin'), async (_req, res) => {
  try { const list = await models.Branch.findAll({ order: [['name','ASC']] }); res.json(list); }
  catch (err) { console.error('/api/branches GET error:', err); res.status(500).json({ message: 'Fetch branches failed', details: toDbMessage(err) }); }
});
app.post('/api/branches', requireAuth, requireRole('admin'), async (req, res) => {
  try { const row = await models.Branch.create({ name: req.body?.name, address: req.body?.address }); res.status(201).json(row); }
  catch (err) { console.error('/api/branches POST error:', err); res.status(500).json({ message: 'Create branch failed', details: toDbMessage(err) }); }
});
app.put('/api/branches/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try { const row = await models.Branch.findByPk(Number(req.params.id)); if(!row) return res.status(404).json({message:'Not found'}); await row.update({ name: req.body?.name, address: req.body?.address }); res.json(row); }
  catch (err) { console.error('/api/branches PUT error:', err); res.status(500).json({ message: 'Update branch failed', details: toDbMessage(err) }); }
});
app.delete('/api/branches/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try { const row = await models.Branch.findByPk(Number(req.params.id)); if(!row) return res.status(404).json({message:'Not found'}); await row.destroy(); res.json({ ok: true }); }
  catch (err) { console.error('/api/branches DELETE error:', err); res.status(500).json({ message: 'Delete branch failed', details: toDbMessage(err) }); }
});

// ===== Admin Settings: Services =====
app.get('/api/services', requireAuth, requireRole('admin'), async (_req, res) => {
  try { const list = await models.Service.findAll({ order: [['name','ASC']] }); res.json(list); }
  catch (err) { console.error('/api/services GET error:', err); res.status(500).json({ message: 'Fetch services failed', details: toDbMessage(err) }); }
});
app.post('/api/services', requireAuth, requireRole('admin'), async (req, res) => {
  try { const row = await models.Service.create({ name: req.body?.name, price: req.body?.price ?? 0 }); res.status(201).json(row); }
  catch (err) { console.error('/api/services POST error:', err); res.status(500).json({ message: 'Create service failed', details: toDbMessage(err) }); }
});
app.put('/api/services/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try { const row = await models.Service.findByPk(Number(req.params.id)); if(!row) return res.status(404).json({message:'Not found'}); await row.update({ name: req.body?.name, price: req.body?.price }); res.json(row); }
  catch (err) { console.error('/api/services PUT error:', err); res.status(500).json({ message: 'Update service failed', details: toDbMessage(err) }); }
});
app.delete('/api/services/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try { const row = await models.Service.findByPk(Number(req.params.id)); if(!row) return res.status(404).json({message:'Not found'}); await row.destroy(); res.json({ ok: true }); }
  catch (err) { console.error('/api/services DELETE error:', err); res.status(500).json({ message: 'Delete service failed', details: toDbMessage(err) }); }
});

// ===== Admin Settings: Templates =====
app.get('/api/templates', requireAuth, requireRole('admin'), async (_req, res) => {
  try { const list = await models.Template.findAll({ order: [['id','DESC']] }); res.json(list); }
  catch (err) { console.error('/api/templates GET error:', err); res.status(500).json({ message: 'Fetch templates failed', details: toDbMessage(err) }); }
});
app.post('/api/templates', requireAuth, requireRole('admin'), async (req, res) => {
  try { const { type, key, subject, body, enabled } = req.body || {}; const row = await models.Template.create({ type, key, subject, body, enabled: enabled !== false }); res.status(201).json(row); }
  catch (err) { console.error('/api/templates POST error:', err); res.status(500).json({ message: 'Create template failed', details: toDbMessage(err) }); }
});
app.put('/api/templates/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try { const row = await models.Template.findByPk(Number(req.params.id)); if(!row) return res.status(404).json({message:'Not found'}); const { type, key, subject, body, enabled } = req.body || {}; await row.update({ type, key, subject, body, enabled }); res.json(row); }
  catch (err) { console.error('/api/templates PUT error:', err); res.status(500).json({ message: 'Update template failed', details: toDbMessage(err) }); }
});
app.delete('/api/templates/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try { const row = await models.Template.findByPk(Number(req.params.id)); if(!row) return res.status(404).json({message:'Not found'}); await row.destroy(); res.json({ ok: true }); }
  catch (err) { console.error('/api/templates DELETE error:', err); res.status(500).json({ message: 'Delete template failed', details: toDbMessage(err) }); }
});
// ===== Audit logs (admin only)
app.get('/api/audit', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { from, to, user_id, action } = req.query || {};
    const where = {};
    if (user_id) where.user_id = Number(user_id);
    if (action) where.action = String(action);
    if (from || to) {
      const fromDate = from ? new Date(String(from)) : null;
      const toDate = to ? new Date(String(to)) : null;
      where.created_at = {};
      if (fromDate) where.created_at[Op.gte] = fromDate;
      if (toDate) where.created_at[Op.lte] = toDate;
    }
    const logs = await models.AuditLog.findAll({ where, order: [['id','DESC']], limit: 500 });
    res.json(logs);
  } catch (err) {
    console.error('/api/audit GET error:', err);
    res.status(500).json({ message: 'Fetch audit logs failed', details: toDbMessage(err) });
  }
});

// ===== Appointments by date range (any authenticated; doctors filter by own id by default) =====
app.get('/api/appointments/range', requireAuth, async (req, res) => {
  try {
    const { from, to, doctor_id, patient_id } = req.query || {};
    if (!from || !to) return res.status(400).json({ message: 'from and to are required (YYYY-MM-DD)' });
    const where = { date: { [Op.gte]: String(from), [Op.lte]: String(to) } };
    const role = String(req.user?.role || '').toLowerCase();
    if (patient_id) where.patient_id = Number(patient_id);
    if (doctor_id) where.doctor_id = Number(doctor_id);
    if (!doctor_id && role === 'doctor') where.doctor_id = Number(req.user?.sub);
    // Patients can only see their own
    if (role === 'patient') {
      const [[row]] = await pool.query('SELECT id FROM patients WHERE user_id = ? LIMIT 1', [Number(req.user?.sub)]);
      const pid = row?.id;
      if (!pid) return res.json([]);
      where.patient_id = pid;
    }
    const list = await models.Appointment.findAll({ where, order: [['date','ASC'],['time','ASC']], limit: 1000 });
    res.json(list);
  } catch (err) {
    console.error('/api/appointments/range error:', err);
    res.status(500).json({ message: 'Fetch appointments range failed', details: toDbMessage(err) });
  }
});

// ===== Prescriptions =====
// Create
app.post('/api/prescriptions', requireAuth, requireRole('doctor','admin'), async (req, res) => {
  try {
    const { patient_id, diagnosis, medications, notes, date } = req.body || {};
    const pid = Number(patient_id);
    if (!Number.isInteger(pid) || pid <= 0) return res.status(400).json({ message: 'Invalid patient_id' });
    const patient = await models.Patient.findByPk(pid);
    if (!patient) return res.status(400).json({ message: 'Invalid patient_id: not found' });
    const docId = Number(req.user?.sub);
    const row = await models.Prescription.create({ patient_id: pid, doctor_id: docId, diagnosis, medications: medications ? JSON.stringify(medications) : null, notes, date: date || new Date().toISOString().slice(0,10) });
    res.status(201).json(row);
  } catch (err) {
    console.error('/api/prescriptions POST error:', err);
    res.status(500).json({ message: 'Create prescription failed', details: toDbMessage(err) });
  }
});
// List
app.get('/api/prescriptions', requireAuth, async (req, res) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    const where = {};
    if (role === 'patient') {
      const [[row]] = await pool.query('SELECT id FROM patients WHERE user_id = ? LIMIT 1', [Number(req.user?.sub)]);
      const pid = row?.id;
      if (!pid) return res.json([]);
      where.patient_id = pid;
    } else if (req.query?.patient_id) {
      where.patient_id = Number(req.query.patient_id);
    }
    const list = await models.Prescription.findAll({ where, order: [['id','DESC']], limit: 500 });
    res.json(list.map(p => ({ ...p.toJSON(), medications: p.medications ? safeParseJSON(p.medications) : null })));
  } catch (err) {
    console.error('/api/prescriptions GET error:', err);
    res.status(500).json({ message: 'Fetch prescriptions failed', details: toDbMessage(err) });
  }
});
// Update (doctor/admin)
app.put('/api/prescriptions/:id', requireAuth, requireRole('doctor','admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { diagnosis, medications, notes, date } = req.body || {};
    const row = await models.Prescription.findByPk(id);
    if (!row) return res.status(404).json({ message: 'Not found' });
    await row.update({ diagnosis, medications: medications ? JSON.stringify(medications) : null, notes, date });
    res.json({ ...row.toJSON(), medications: row.medications ? safeParseJSON(row.medications) : null });
  } catch (err) {
    console.error('/api/prescriptions PUT error:', err);
    res.status(500).json({ message: 'Update prescription failed', details: toDbMessage(err) });
  }
});

// ===== Lab Orders =====
// Create
app.post('/api/lab-orders', requireAuth, requireRole('doctor','admin'), async (req, res) => {
  try {
    const { patient_id, tests, notes } = req.body || {};
    const pid = Number(patient_id);
    if (!Number.isInteger(pid) || pid <= 0) return res.status(400).json({ message: 'Invalid patient_id' });
    const patient = await models.Patient.findByPk(pid);
    if (!patient) return res.status(400).json({ message: 'Invalid patient_id: not found' });
    const docId = Number(req.user?.sub);
    const row = await models.LabOrder.create({ patient_id: pid, doctor_id: docId, tests: tests ? JSON.stringify(tests) : null, notes });
    res.status(201).json(row);
  } catch (err) {
    console.error('/api/lab-orders POST error:', err);
    res.status(500).json({ message: 'Create lab order failed', details: toDbMessage(err) });
  }
});
// List
app.get('/api/lab-orders', requireAuth, async (req, res) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    const where = {};
    if (role === 'patient') {
      const [[row]] = await pool.query('SELECT id FROM patients WHERE user_id = ? LIMIT 1', [Number(req.user?.sub)]);
      const pid = row?.id;
      if (!pid) return res.json([]);
      where.patient_id = pid;
    } else if (req.query?.patient_id) {
      where.patient_id = Number(req.query.patient_id);
    }
    const list = await models.LabOrder.findAll({ where, order: [['id','DESC']], limit: 500 });
    res.json(list.map(o => ({ ...o.toJSON(), tests: o.tests ? safeParseJSON(o.tests) : null })));
  } catch (err) {
    console.error('/api/lab-orders GET error:', err);
    res.status(500).json({ message: 'Fetch lab orders failed', details: toDbMessage(err) });
  }
});
// Update status
app.put('/api/lab-orders/:id', requireAuth, requireRole('doctor','admin','laboratorist'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status, tests, notes, completed_at } = req.body || {};
    const row = await models.LabOrder.findByPk(id);
    if (!row) return res.status(404).json({ message: 'Not found' });
    await row.update({ status, tests: tests ? JSON.stringify(tests) : row.tests, notes, completed_at });
    res.json({ ...row.toJSON(), tests: row.tests ? safeParseJSON(row.tests) : null });
  } catch (err) {
    console.error('/api/lab-orders PUT error:', err);
    res.status(500).json({ message: 'Update lab order failed', details: toDbMessage(err) });
  }
});

// ===== Availability =====
// Create/update availability entries
app.post('/api/availability', requireAuth, requireRole('doctor','admin'), async (req, res) => {
  try {
    const { date, start_time, end_time, status } = req.body || {};
    const doctor_user_id = Number(req.user?.sub);
    if (!date) return res.status(400).json({ message: 'date is required' });
    const row = await models.Availability.create({ doctor_user_id, date, start_time, end_time, status });
    res.status(201).json(row);
  } catch (err) {
    console.error('/api/availability POST error:', err);
    res.status(500).json({ message: 'Create availability failed', details: toDbMessage(err) });
  }
});

app.get('/api/availability', requireAuth, async (req, res) => {
  try {
    const { doctor_id, from, to } = req.query || {};
    const role = String(req.user?.role || '').toLowerCase();
    const where = {};
    if (from && to) where.date = { [Op.gte]: String(from), [Op.lte]: String(to) };
    if (doctor_id) where.doctor_user_id = Number(doctor_id);
    if (!doctor_id && role === 'doctor') where.doctor_user_id = Number(req.user?.sub);
    const list = await models.Availability.findAll({ where, order: [['date','ASC']], limit: 500 });
    res.json(list);
  } catch (err) {
    console.error('/api/availability GET error:', err);
    res.status(500).json({ message: 'Fetch availability failed', details: toDbMessage(err) });
  }
});

// ===== Manager/Admin: Occupancy metrics =====
app.get('/api/metrics/occupancy', requireAuth, requireRole('admin','manager'), async (_req, res) => {
  try {
    // Aggregate by department via wards -> beds
    const [totals] = await pool.query("SELECT COUNT(*) AS totalBeds, SUM(CASE WHEN status='occupied' THEN 1 ELSE 0 END) AS occupiedBeds FROM beds");
    const [rows] = await pool.query(`
      SELECT d.name AS department,
             COUNT(b.id) AS total,
             SUM(CASE WHEN b.status='occupied' THEN 1 ELSE 0 END) AS occupied
      FROM departments d
      LEFT JOIN wards w ON w.department_id = d.id
      LEFT JOIN beds b ON b.ward_id = w.id
      GROUP BY d.id, d.name
      ORDER BY d.name ASC`);
    const byDepartment = rows.map(r => ({
      department: r.department,
      total: Number(r.total || 0),
      occupied: Number(r.occupied || 0),
      free: Math.max(Number(r.total || 0) - Number(r.occupied || 0), 0),
    }));
    const totalBeds = Number(totals?.totalBeds || 0);
    const occupiedBeds = Number(totals?.occupiedBeds || 0);
    const freeBeds = Math.max(totalBeds - occupiedBeds, 0);
    res.json({ totalBeds, occupiedBeds, freeBeds, byDepartment });
  } catch (err) {
    console.error('/api/metrics/occupancy error:', err);
    res.status(500).json({ message: 'Fetch occupancy failed', details: toDbMessage(err) });
  }
});

// ===== Manager/Admin: Inventory with low_stock filter =====
app.get('/api/inventory', requireAuth, requireRole('admin','manager'), async (req, res) => {
  try {
    const low = String(req.query.low_stock||'').toLowerCase();
    if (['1','true','yes','on'].includes(low)) {
      const list = await models.InventoryItem.findAll({
        where: sequelize.where(sequelize.col('quantity'), '<=', sequelize.col('reorder_threshold')),
        order: [[sequelize.literal('(reorder_threshold - quantity)'),'DESC'], ['id','DESC']],
      });
      return res.json(list);
    }
    const list = await models.InventoryItem.findAll({ order: [['id','DESC']] });
    res.json(list);
  } catch (err) {
    console.error('/api/inventory GET error:', err);
    res.status(500).json({ message: 'Fetch inventory failed', details: toDbMessage(err) });
  }
});

// ===== Manager/Admin: Staff list =====
app.get('/api/staff', requireAuth, requireRole('admin','manager'), async (req, res) => {
  try {
    const where = {};
    if (req.query?.department_id) where.department_id = Number(req.query.department_id);
    if (req.query?.role) where.role = String(req.query.role);
    const list = await models.Staff.findAll({ where, order: [['id','ASC']], limit: 1000 });
    res.json(list);
  } catch (err) {
    console.error('/api/staff GET error:', err);
    res.status(500).json({ message: 'Fetch staff failed', details: toDbMessage(err) });
  }
});

// ===== Manager/Admin: Departments list =====
app.get('/api/departments', requireAuth, requireRole('admin','manager'), async (_req, res) => {
  try {
    const list = await models.Department.findAll({ order: [['name','ASC']], limit: 1000 });
    res.json(list);
  } catch (err) {
    console.error('/api/departments GET error:', err);
    res.status(500).json({ message: 'Fetch departments failed', details: toDbMessage(err) });
  }
});

// ===== Manager/Admin: Attendance list (filter by date) =====
app.get('/api/attendance', requireAuth, requireRole('admin','manager'), async (req, res) => {
  try {
    const date = String(req.query.date || '').slice(0,10);
    const where = date ? { date } : {};
    const list = await models.Attendance.findAll({ where, include: [{ model: models.Staff, attributes: ['id','name','role','department_id'] }], order: [['date','DESC'],['id','DESC']], limit: 1000 });
    res.json(list);
  } catch (err) {
    console.error('/api/attendance GET error:', err);
    res.status(500).json({ message: 'Fetch attendance failed', details: toDbMessage(err) });
  }
});

// ===== Manager/Admin: Staff department assignment =====
app.put('/api/staff/:id/department', requireAuth, requireRole('admin','manager'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const department_id = Number(req.body?.department_id);
    const staff = await models.Staff.findByPk(id);
    if (!staff) return res.status(404).json({ message: 'Staff not found' });
    await staff.update({ department_id: Number.isFinite(department_id) ? department_id : null });
    res.json(staff);
  } catch (err) {
    console.error('/api/staff/:id/department PUT error:', err);
    res.status(500).json({ message: 'Update staff department failed', details: toDbMessage(err) });
  }
});

// ===== Manager/Admin: Delete shift =====
app.delete('/api/shifts/:id', requireAuth, requireRole('admin','manager'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await models.Shift.findByPk(id);
    if (!row) return res.status(404).json({ message: 'Not found' });
    await row.destroy();
    res.json({ ok: true });
  } catch (err) {
    console.error('/api/shifts/:id DELETE error:', err);
    res.status(500).json({ message: 'Delete shift failed', details: toDbMessage(err) });
  }
});

app.put('/api/availability/:id', requireAuth, requireRole('doctor','admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await models.Availability.findByPk(id);
    if (!row) return res.status(404).json({ message: 'Not found' });
    const { date, start_time, end_time, status } = req.body || {};
    await row.update({ date, start_time, end_time, status });
    res.json(row);
  } catch (err) {
    console.error('/api/availability PUT error:', err);
    res.status(500).json({ message: 'Update availability failed', details: toDbMessage(err) });
  }
});
// ===== Metrics: Doctor (doctor/admin)
app.get('/api/metrics/doctor', requireAuth, requireRole('doctor','admin'), async (req, res) => {
  try {
    const qDoctorId = req.query?.doctor_id ? Number(req.query.doctor_id) : undefined;
    const role = String(req.user?.role || '').toLowerCase();
    const userId = Number(req.user?.sub);
    // App may store appointments.doctor_id as the user's id when role=doctor; if not present in DB, counts will be global
    const doctorId = Number.isInteger(qDoctorId) && qDoctorId > 0 ? qDoctorId : (role === 'doctor' ? userId : undefined);

    const today = new Date().toISOString().slice(0,10);
    const whereAppt = { date: today };
    if (doctorId) whereAppt.doctor_id = doctorId;
    const apptsToday = await models.Appointment.count({ where: whereAppt });

    // Total patients count
    const patientsCount = await models.Patient.count();

    // Medical records count (optionally we could filter by today or by patient associations)
    const recordsCount = await models.MedicalRecord.count();

    // Invoices issued today (overall)
    const invoicesToday = await models.Invoice.count({ where: { date: today } });

    // Common record types top 5
    const [topTypesRows] = await pool.query(
      `SELECT record_type, COUNT(*) as c
       FROM medical_records
       GROUP BY record_type
       ORDER BY c DESC
       LIMIT 5`
    );
    const commonRecordTypes = Array.isArray(topTypesRows) ? topTypesRows : [];

    res.json({
      doctorId: doctorId || null,
      appointmentsToday: apptsToday,
      patientsCount,
      recordsCount,
      invoicesToday,
      commonRecordTypes,
    });
  } catch (err) {
    console.error('/api/metrics/doctor error:', err);
    res.status(500).json({ message: 'Doctor metrics failed', details: toDbMessage(err) });
  }
});

// ===== Metrics: Finance (manager/admin) =====
app.get('/api/metrics/finance', requireAuth, requireRole('admin','manager'), async (req, res) => {
  try {
    const { from, to } = req.query || {};
    const where = {};
    if (from) where.date = { [Op.gte]: String(from) };
    if (to) where.date = where.date ? { ...where.date, [Op.lte]: String(to) } : { [Op.lte]: String(to) };
    const today = new Date().toISOString().slice(0,10);
    const list = await models.Invoice.findAll({ where });
    let total = 0, pending = 0, paid = 0, todayTotal = 0;
    for (const inv of list) {
      const amt = Number(inv.amount || 0);
      total += amt;
      if (String(inv.status) === 'pending') pending += amt;
      if (String(inv.status) === 'paid') paid += amt;
      if (String(inv.date) === today) todayTotal += amt;
    }
    res.json({ total, pending, paid, todayTotal, count: list.length });
  } catch (err) {
    console.error('/api/metrics/finance error:', err);
    res.status(500).json({ message: 'Finance metrics failed', details: toDbMessage(err) });
  }
});

// ===== Metrics: Occupancy (manager/admin) =====
app.get('/api/metrics/occupancy', requireAuth, requireRole('admin','manager'), async (_req, res) => {
  try {
    // total beds and occupied based on current open admissions (discharged_at IS NULL)
    const totalBeds = await models.Bed.count();
    const occupiedAdmissions = await models.Admission.count({ where: { discharged_at: null } });
    const occupiedBeds = Math.min(occupiedAdmissions, totalBeds);
    const freeBeds = Math.max(totalBeds - occupiedBeds, 0);
    // by department (via ward -> department)
    const wards = await models.Ward.findAll({ include: [{ model: models.Department }] });
    const beds = await models.Bed.findAll();
    const admissions = await models.Admission.findAll({ where: { discharged_at: null } });
    const occupiedByBedId = new Set(admissions.map(a => Number(a.bed_id)).filter(Boolean));
    const wardsMap = new Map();
    for (const w of wards) {
      const depName = w.Department?.name || 'Unknown';
      if (!wardsMap.has(depName)) wardsMap.set(depName, { total: 0, occupied: 0 });
    }
    for (const b of beds) {
      const w = wards.find(x => Number(x.id) === Number(b.ward_id));
      const depName = w?.Department?.name || 'Unknown';
      if (!wardsMap.has(depName)) wardsMap.set(depName, { total: 0, occupied: 0 });
      const row = wardsMap.get(depName);
      row.total += 1;
      if (occupiedByBedId.has(Number(b.id)) || String(b.status) === 'occupied') row.occupied += 1;
    }
    const byDepartment = Array.from(wardsMap.entries()).map(([department, v]) => ({ department, total: v.total, occupied: v.occupied, free: Math.max(v.total - v.occupied, 0) }));
    res.json({ totalBeds, occupiedBeds, freeBeds, byDepartment });
  } catch (err) {
    console.error('/api/metrics/occupancy error:', err);
    res.status(500).json({ message: 'Occupancy metrics failed', details: toDbMessage(err) });
  }
});

// ===== Inventory: low stock (manager/admin)
app.get('/api/inventory', requireAuth, requireRole('admin','manager'), async (req, res) => {
  try {
    const low = String(req.query.low_stock || '').toLowerCase() === 'true';
    let where = {};
    if (low) {
      // quantity <= reorder_threshold
      where = sequelize.where(
        sequelize.col('quantity'),
        { [Op.lte]: sequelize.col('reorder_threshold') }
      );
    }
    const list = await models.InventoryItem.findAll({ where: low ? undefined : {}, order: [['name','ASC']], limit: 500 });
    if (low) {
      const filtered = list.filter(i => Number(i.quantity) <= Number(i.reorder_threshold));
      return res.json(filtered);
    }
    res.json(list);
  } catch (err) {
    console.error('/api/inventory GET error:', err);
    res.status(500).json({ message: 'Fetch inventory failed', details: toDbMessage(err) });
  }
});

// ===== Shifts by date (manager/admin)
app.get('/api/shifts', requireAuth, requireRole('admin','manager'), async (req, res) => {
  try {
    const date = String(req.query.date || '').slice(0,10);
    const where = date ? { date } : {};
    const list = await models.Shift.findAll({ where, include: [{ model: models.Staff, attributes: ['id','name','role'] }] , order: [['date','ASC'],['start_time','ASC']], limit: 500 });
    res.json(list);
  } catch (err) {
    console.error('/api/shifts GET error:', err);
    res.status(500).json({ message: 'Fetch shifts failed', details: toDbMessage(err) });
  }
});

// ===== Lab Results (basic endpoints)
app.post('/api/labs', requireAuth, requireRole('doctor','admin','laboratorist'), async (req, res) => {
  try {
    const { patient_id, test_type, value, unit, normal_range, flag, date } = req.body || {};
    const pid = Number(patient_id);
    if (!Number.isInteger(pid) || pid <= 0) return res.status(400).json({ message: 'Invalid patient_id' });
    if (!test_type || !date) return res.status(400).json({ message: 'Missing required fields: test_type, date' });
    const patient = await models.Patient.findByPk(pid);
    if (!patient) return res.status(400).json({ message: 'Invalid patient_id: patient does not exist' });
    const allowed = ['normal','abnormal','critical'];
    const flg = allowed.includes(String(flag)) ? String(flag) : 'normal';
    const row = await models.LabResult.create({ patient_id: pid, test_type, value, unit, normal_range, flag: flg, date });
    res.status(201).json(row);
  } catch (err) {
    console.error('/api/labs POST error:', err);
    res.status(500).json({ message: 'Create lab result failed', details: toDbMessage(err) });
  }
});

app.get('/api/labs', requireAuth, async (req, res) => {
  try {
    const { patient_id, flag } = req.query || {};
    const where = {};
    if (req.user?.role === 'patient') {
      const [[row]] = await pool.query('SELECT id FROM patients WHERE user_id = ? LIMIT 1', [Number(req.user.sub)]);
      const pid = row?.id;
      if (!pid) return res.json([]);
      where.patient_id = pid;
    } else if (patient_id) {
      where.patient_id = Number(patient_id);
    }
    if (flag) where.flag = String(flag);
    const list = await models.LabResult.findAll({ where, include: [{ model: models.Patient, attributes: ['id','name','email'] }], order: [['id','DESC']], limit: 200 });
    res.json(list);
  } catch (err) {
    console.error('/api/labs GET error:', err);
    res.status(500).json({ message: 'Fetch lab results failed', details: toDbMessage(err) });
  }
});

// Labs abnormal metric (manager/doctor)
app.get('/api/metrics/labs/abnormal', requireAuth, requireRole('admin','manager','doctor'), async (_req, res) => {
  try {
    const abnormal = await models.LabResult.count({ where: { flag: { [Op.in]: ['abnormal','critical'] } } });
    res.json({ abnormal });
  } catch (err) {
    console.error('/api/metrics/labs/abnormal GET error:', err);
    res.status(500).json({ message: 'Fetch labs metric failed', details: toDbMessage(err) });
  }
});
// Registration endpoint
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    // Enforce patient self-registration
    const userRole = 'patient';
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (existing && existing.length > 0) {
      return res.status(409).json({ message: 'Email is already registered' });
    }
    const bcrypt = (await import('bcryptjs')).default;
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, email, hash, userRole]
    );
    // Auto-create patient row linked to this user if role is patient
    if (userRole === 'patient') {
      try {
        await pool.query(
          'INSERT INTO patients (user_id, name, email) VALUES (?, ?, ?)',
          [result.insertId, name, email]
        );
      } catch (e) {
        console.warn('Auto-create patient failed:', e?.message || e);
      }
    }
    const newUser = { id: result.insertId, name, email, role: userRole };
    const token = signToken(newUser);
    return res.status(201).json({ token, user: newUser });
  } catch (err) {
    console.error('/api/register error:', err);
    return res.status(500).json({ message: 'Registration failed', details: toDbMessage(err) });
  }
});

// Current user info
app.get('/api/me', requireAuth, (req, res) => {
  const { sub, role, email, name, iat, exp } = req.user || {};
  res.json({ id: Number(sub), role, email, name, iat, exp });
});

// Users list (for UI table)
app.get('/api/users', requireAuth, requireRole('admin'), async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, email, role, created_at FROM users ORDER BY id DESC LIMIT 50');
    res.json(rows);
  } catch (err) {
    console.error('/api/users error:', err);
    res.status(500).json({ message: 'Database error', details: toDbMessage(err) });
  }
});

// ===== Patients =====
app.post('/api/patients', requireAuth, requireRole('doctor', 'admin'), async (req, res) => {
  try {
    const { name, email, phone, notes } = req.body || {};
    if (!name) return res.status(400).json({ message: 'Missing required field: name' });
    const row = await models.Patient.create({ name, email, phone, notes });
    res.status(201).json(row);
  } catch (err) {
    console.error('/api/patients POST error:', err);
    res.status(500).json({ message: 'Create patient failed', details: toDbMessage(err) });
  }
});

app.get('/api/patients', requireAuth, requireRole('doctor', 'admin'), async (_req, res) => {
  try {
    const list = await models.Patient.findAll({ order: [['id', 'DESC']], limit: 100 });
    res.json(list);
  } catch (err) {
    console.error('/api/patients GET error:', err);
    res.status(500).json({ message: 'Fetch patients failed', details: toDbMessage(err) });
  }
});

// Lightweight list for selection (doctor/admin): id, name, email
app.get('/api/patients/simple', requireAuth, requireRole('doctor','admin'), async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, email FROM patients ORDER BY name ASC LIMIT 1000');
    res.json(rows);
  } catch (err) {
    console.error('/api/patients/simple error:', err);
    res.status(500).json({ message: 'Fetch patients failed', details: toDbMessage(err) });
  }
});

// Record status per patient to avoid invalid IDs when creating records
app.get('/api/patients/record-status', requireAuth, requireRole('doctor','admin'), async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT p.id, p.name,
             COALESCE(COUNT(r.id), 0) AS records_count,
             MAX(r.date) AS last_record_date
      FROM patients p
      LEFT JOIN medical_records r ON r.patient_id = p.id
      GROUP BY p.id, p.name
      ORDER BY p.id DESC
      LIMIT 500
    `);
    res.json(rows);
  } catch (err) {
    console.error('/api/patients/record-status error:', err);
    res.status(500).json({ message: 'Fetch record status failed', details: toDbMessage(err) });
  }
});

// Get single patient
app.get('/api/patients/:id', requireAuth, requireRole('doctor','admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });
    const row = await models.Patient.findByPk(id);
    if (!row) return res.status(404).json({ message: 'Patient not found' });
    res.json(row);
  } catch (err) {
    console.error('/api/patients/:id GET error:', err);
    res.status(500).json({ message: 'Fetch patient failed', details: toDbMessage(err) });
  }
});

// Update patient
app.put('/api/patients/:id', requireAuth, requireRole('doctor','admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });
    const { name, email, phone, notes } = req.body || {};
    const row = await models.Patient.findByPk(id);
    if (!row) return res.status(404).json({ message: 'Patient not found' });
    if (name !== undefined) row.name = name;
    if (email !== undefined) row.email = email;
    if (phone !== undefined) row.phone = phone;
    if (notes !== undefined) row.notes = notes;
    await row.save();
    res.json(row);
  } catch (err) {
    console.error('/api/patients/:id PUT error:', err);
    res.status(500).json({ message: 'Update patient failed', details: toDbMessage(err) });
  }
});

// Delete patient (admin only)
app.delete('/api/patients/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });
    // Check dependencies
    const [[a]] = await pool.query('SELECT COUNT(*) AS c FROM appointments WHERE patient_id = ?', [id]);
    const [[m]] = await pool.query('SELECT COUNT(*) AS c FROM medical_records WHERE patient_id = ?', [id]);
    const [[i]] = await pool.query('SELECT COUNT(*) AS c FROM invoices WHERE patient_id = ?', [id]);
    const dependents = Number(a.c) + Number(m.c) + Number(i.c);
    if (dependents > 0) {
      return res.status(409).json({ message: 'Cannot delete patient with related records', details: { appointments: a.c, medical_records: m.c, invoices: i.c } });
    }
    const n = await models.Patient.destroy({ where: { id } });
    if (n === 0) return res.status(404).json({ message: 'Patient not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('/api/patients/:id DELETE error:', err);
    res.status(500).json({ message: 'Delete patient failed', details: toDbMessage(err) });
  }
});

// ===== Appointments =====
app.post('/api/appointments', requireAuth, async (req, res) => {
  try {
    const { patient_id, date, time, notes } = req.body || {};

    const pid = Number(patient_id);
    if (!Number.isInteger(pid) || pid <= 0) {
      return res.status(400).json({ message: 'Invalid patient_id' });
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      return res.status(400).json({ message: 'Invalid or missing date (expected YYYY-MM-DD)' });
    }
    if (!time || !/^\d{2}:\d{2}$/.test(String(time))) {
      return res.status(400).json({ message: 'Invalid or missing time (expected HH:MM)' });
    }

    // Ensure patient exists
    const patient = await models.Patient.findByPk(pid);
    if (!patient) {
      return res.status(400).json({ message: 'Invalid patient_id: patient does not exist' });
    }

    // Patients can only create for their own patient_id
    if (req.user?.role === 'patient') {
      const [rows] = await pool.query('SELECT user_id FROM patients WHERE id = ? LIMIT 1', [pid]);
      const owner = rows && rows[0]?.user_id ? Number(rows[0].user_id) : undefined;
      if (!owner || owner !== Number(req.user.sub)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    }

    const row = await models.Appointment.create({ patient_id: pid, date, time, notes });
    res.status(201).json(row);
  } catch (err) {
    console.error('/api/appointments POST error:', err);
    res.status(500).json({ message: 'Create appointment failed', details: toDbMessage(err) });
  }
});

app.get('/api/appointments', requireAuth, async (req, res) => {
  try {
    const { patient_id, doctor_id } = req.query;
    const where = {};
    if (req.user?.role === 'patient') {
      // Force filter to own patient_id
      const [rows] = await pool.query('SELECT id FROM patients WHERE user_id = ? LIMIT 1', [Number(req.user.sub)]);
      const pid = rows && rows[0]?.id;
      if (!pid) return res.json([]);
      where.patient_id = pid;
    } else {
      if (patient_id) where.patient_id = patient_id;
      if (doctor_id) where.doctor_id = doctor_id;
    }
    const list = await models.Appointment.findAll({
      where,
      include: [{ model: models.Patient, attributes: ['id','name','email'] }],
      order: [['id', 'DESC']],
      limit: 200,
    });
    res.json(list);
  } catch (err) {
    console.error('/api/appointments GET error:', err);
    res.status(500).json({ message: 'Fetch appointments failed', details: toDbMessage(err) });
  }
});

// ===== Medical Records =====
app.post('/api/records', requireAuth, async (req, res) => {
  try {
    const { patient_id, record_type, notes, date } = req.body || {};

    // Patients are not allowed to create medical records
    if (req.user?.role === 'patient') {
      return res.status(403).json({ message: 'Patients cannot create medical records' });
    }

    const pid = Number(patient_id);
    if (!Number.isInteger(pid) || pid <= 0) {
      return res.status(400).json({ message: 'Invalid patient_id' });
    }
    if (!record_type || String(record_type).trim() === '') {
      return res.status(400).json({ message: 'Missing required field: record_type' });
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      return res.status(400).json({ message: 'Invalid or missing date (expected YYYY-MM-DD)' });
    }
    // Ensure patient exists to avoid FK errors
    const patient = await models.Patient.findByPk(pid);
    if (!patient) {
      return res.status(400).json({ message: 'Invalid patient_id: patient does not exist' });
    }

    const row = await models.MedicalRecord.create({ patient_id: pid, record_type, notes, date });
    res.status(201).json(row);
  } catch (err) {
    console.error('/api/records POST error:', err);
    res.status(500).json({ message: 'Create record failed', details: toDbMessage(err) });
  }
});

app.get('/api/records', requireAuth, async (req, res) => {
  try {
    const { patient_id } = req.query;
    const where = {};
    if (req.user?.role === 'patient') {
      const [rows] = await pool.query('SELECT id FROM patients WHERE user_id = ? LIMIT 1', [Number(req.user.sub)]);
      const pid = rows && rows[0]?.id;
      if (!pid) return res.json([]);
      where.patient_id = pid;
    } else {
      if (patient_id) where.patient_id = patient_id;
    }
    const list = await models.MedicalRecord.findAll({
      where,
      include: [{ model: models.Patient, attributes: ['id','name','email'] }],
      order: [['id', 'DESC']],
      limit: 200,
    });
    res.json(list);
  } catch (err) {
    console.error('/api/records GET error:', err);
    res.status(500).json({ message: 'Fetch records failed', details: toDbMessage(err) });
  }
});

// ===== Invoices =====
app.post('/api/invoices', requireAuth, requireRole('doctor', 'admin'), async (req, res) => {
  try {
    const { patient_id, amount, date, status } = req.body || {};

    // Basic validation
    const pid = Number(patient_id);
    const amt = Number(amount);
    if (!Number.isInteger(pid) || pid <= 0) {
      return res.status(400).json({ message: 'Invalid patient_id' });
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      return res.status(400).json({ message: 'Invalid or missing date (expected YYYY-MM-DD)' });
    }

    // Ensure patient exists to avoid FK constraint failure
    const patient = await models.Patient.findByPk(pid);
    if (!patient) {
      return res.status(400).json({ message: 'Invalid patient_id: patient does not exist' });
    }

    const allowed = ['pending','paid','void'];
    const st = allowed.includes(String(status)) ? String(status) : 'pending';

    const row = await models.Invoice.create({ patient_id: pid, amount: amt, date, status: st });
    res.status(201).json(row);
  } catch (err) {
    console.error('/api/invoices POST error:', err);
    res.status(500).json({ message: 'Create invoice failed', details: toDbMessage(err) });
  }
});

app.get('/api/invoices', requireAuth, async (req, res) => {
  try {
    const { patient_id } = req.query;
    const where = {};
    if (req.user?.role === 'patient') {
      const [rows] = await pool.query('SELECT id FROM patients WHERE user_id = ? LIMIT 1', [Number(req.user.sub)]);
      const pid = rows && rows[0]?.id;
      if (!pid) return res.json([]);
      where.patient_id = pid;
    } else {
      if (patient_id) where.patient_id = patient_id;
    }
    const list = await models.Invoice.findAll({
      where,
      include: [{ model: models.Patient, attributes: ['id','name','email'] }],
      order: [['id', 'DESC']],
      limit: 200,
    });
    res.json(list);
  } catch (err) {
    console.error('/api/invoices GET error:', err);
    res.status(500).json({ message: 'Fetch invoices failed', details: toDbMessage(err) });
  }
});

// Invoice metadata (allowed statuses from DB model)
app.get('/api/invoices/meta', requireAuth, requireRole('doctor','admin'), async (_req, res) => {
  try {
    const statuses = models?.Invoice?.rawAttributes?.status?.values || ['pending','paid','void'];
    res.json({ statuses });
  } catch (err) {
    console.error('/api/invoices/meta GET error:', err);
    res.status(500).json({ message: 'Fetch invoice metadata failed', details: toDbMessage(err) });
  }
});

// Download invoice as text attachment (no external deps)
app.get('/api/invoices/:id/download', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });
    const inv = await models.Invoice.findByPk(id, { include: [{ model: models.Patient, attributes: ['id','name','email'] }] });
    if (!inv) return res.status(404).json({ message: 'Invoice not found' });

    // Patients can only download their own invoice
    if (req.user?.role === 'patient') {
      const [rows] = await pool.query('SELECT id FROM patients WHERE user_id = ? LIMIT 1', [Number(req.user.sub)]);
      const pid = rows && rows[0]?.id;
      if (!pid || Number(inv.patient_id) !== Number(pid)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    }

    const filename = `invoice_${id}.txt`;
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const lines = [
      'Clinicare Invoice',
      '=================',
      `Invoice ID: ${inv.id}`,
      `Date: ${inv.date}`,
      `Status: ${inv.status}`,
      '',
      `Patient: ${inv.Patient?.name || ''} (#${inv.patient_id})`,
      `Patient Email: ${inv.Patient?.email || ''}`,
      '',
      `Amount: ${inv.amount}`,
      '',
      'Thank you.',
    ];
    res.send(lines.join('\n'));
  } catch (err) {
    console.error('/api/invoices/:id/download error:', err);
    res.status(500).json({ message: 'Download failed', details: toDbMessage(err) });
  }
});

// Patient-scoped relational endpoints for clarity and simple filtering
app.get('/api/patients/:id/records', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });
    if (req.user?.role === 'patient') {
      const [[row]] = await pool.query('SELECT id FROM patients WHERE user_id = ? LIMIT 1', [Number(req.user.sub)]);
      const ownPid = row?.id;
      if (!ownPid || ownPid !== id) return res.status(403).json({ message: 'Forbidden' });
    }
    const list = await models.MedicalRecord.findAll({
      where: { patient_id: id },
      include: [{ model: models.Patient, attributes: ['id','name','email'] }],
      order: [['id', 'DESC']],
      limit: 200,
    });
    res.json(list);
  } catch (err) {
    console.error('/api/patients/:id/records GET error:', err);
    res.status(500).json({ message: 'Fetch patient records failed', details: toDbMessage(err) });
  }
});

app.get('/api/patients/:id/appointments', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });
    if (req.user?.role === 'patient') {
      const [[row]] = await pool.query('SELECT id FROM patients WHERE user_id = ? LIMIT 1', [Number(req.user.sub)]);
      const ownPid = row?.id;
      if (!ownPid || ownPid !== id) return res.status(403).json({ message: 'Forbidden' });
    }
    const list = await models.Appointment.findAll({
      where: { patient_id: id },
      include: [{ model: models.Patient, attributes: ['id','name','email'] }],
      order: [['id', 'DESC']],
      limit: 200,
    });
    res.json(list);
  } catch (err) {
    console.error('/api/patients/:id/appointments GET error:', err);
    res.status(500).json({ message: 'Fetch patient appointments failed', details: toDbMessage(err) });
  }
});

app.get('/api/patients/:id/invoices', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });
    if (req.user?.role === 'patient') {
      const [[row]] = await pool.query('SELECT id FROM patients WHERE user_id = ? LIMIT 1', [Number(req.user.sub)]);
      const ownPid = row?.id;
      if (!ownPid || ownPid !== id) return res.status(403).json({ message: 'Forbidden' });
    }
    const list = await models.Invoice.findAll({
      where: { patient_id: id },
      include: [{ model: models.Patient, attributes: ['id','name','email'] }],
      order: [['id', 'DESC']],
      limit: 200,
    });
    res.json(list);
  } catch (err) {
    console.error('/api/patients/:id/invoices GET error:', err);
    res.status(500).json({ message: 'Fetch patient invoices failed', details: toDbMessage(err) });
  }
});

// API 404 handler
app.use('/api', (_req, res) => {
  res.status(404).json({ message: 'API route not found' });
});

// Global JSON error handler (must be after routes)
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[api] Unhandled error:', err);
  if (res.headersSent) return;
  res.status(500).json({ message: 'Internal Server Error', details: err?.message || '' });
});

// Start server after DB init/sync
(async () => {
  try {
    // Startup diagnostics for env loading (do not print secret)
    console.log(`[env] Loaded from ${envPath} (JWT_SECRET set: ${Boolean(process.env.JWT_SECRET)})`);
    await initModels();
    await syncSequelize();
    app.listen(PORT, () => {
      console.log(`API server started on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('[db] Startup error:', err);
    process.exit(1);
  }
})();
