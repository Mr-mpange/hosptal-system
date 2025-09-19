// ESM Express server with MySQL connection pooling and basic routes.
// Explicitly load the root .env regardless of where the process is started from.
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });
import express from 'express';
import cors from 'cors';
import { pool } from './mysql.js';
import { sequelize, initModels, syncSequelize, models } from './sequelize.js';
import jwt from 'jsonwebtoken';

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
    if (!['patient', 'doctor', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (existing && existing.length > 0) {
      return res.status(409).json({ message: 'Email is already registered' });
    }
    // Hash using bcryptjs (dynamic import to keep top-level ESM clean)
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

// ===== Appointments =====
app.post('/api/appointments', requireAuth, async (req, res) => {
  try {
    const { patient_id, date, time, notes } = req.body || {};
    if (!patient_id || !date || !time) {
      return res.status(400).json({ message: 'Missing required fields: patient_id, date, time' });
    }
    // Patients can only create for their own patient_id
    if (req.user?.role === 'patient') {
      const [rows] = await pool.query('SELECT user_id FROM patients WHERE id = ? LIMIT 1', [patient_id]);
      const owner = rows && rows[0]?.user_id ? Number(rows[0].user_id) : undefined;
      if (!owner || owner !== Number(req.user.sub)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    }
    const row = await models.Appointment.create({ patient_id, date, time, notes });
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
    const list = await models.Appointment.findAll({ where, order: [['id', 'DESC']], limit: 200 });
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
    if (!patient_id || !record_type || !date) {
      return res.status(400).json({ message: 'Missing required fields: patient_id, record_type, date' });
    }
    // Patients can only create records for themselves; doctors/admin allowed
    if (req.user?.role === 'patient') {
      const [rows] = await pool.query('SELECT user_id FROM patients WHERE id = ? LIMIT 1', [patient_id]);
      const owner = rows && rows[0]?.user_id ? Number(rows[0].user_id) : undefined;
      if (!owner || owner !== Number(req.user.sub)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    }
    const row = await models.MedicalRecord.create({ patient_id, record_type, notes, date });
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
    const list = await models.MedicalRecord.findAll({ where, order: [['id', 'DESC']], limit: 200 });
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
    if (!patient_id || !amount || !date) {
      return res.status(400).json({ message: 'Missing required fields: patient_id, amount, date' });
    }
    const row = await models.Invoice.create({ patient_id, amount, date, status });
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
    const list = await models.Invoice.findAll({ where, order: [['id', 'DESC']], limit: 200 });
    res.json(list);
  } catch (err) {
    console.error('/api/invoices GET error:', err);
    res.status(500).json({ message: 'Fetch invoices failed', details: toDbMessage(err) });
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
