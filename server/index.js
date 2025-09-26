// ESM Express server with MySQL connection pooling and basic routes.
// Explicitly load the root .env regardless of where the process is started from.
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

// Request OTP during two-step login using temp_token
app.post('/api/login/otp/request', async (req, res) => {
  try {
    const { temp_token } = req.body || {};
    if (!temp_token) return res.status(400).json({ message: 'temp_token required' });
    if (!JWT_SECRET) return res.status(500).json({ message: 'Server is missing JWT_SECRET' });
    let decoded = null;
    try { decoded = jwt.verify(String(temp_token), JWT_SECRET); } catch (e) { return res.status(401).json({ message: 'Invalid or expired temp token' }); }
    if (!decoded?.sub || !decoded?.otp_pending) return res.status(400).json({ message: 'Invalid temp token' });
    const userId = Number(decoded.sub);
    const rec = await models.User2FA.findByPk(userId);
    if (!rec || rec.method !== 'otp' || !rec.contact) return res.status(400).json({ message: 'OTP method not configured' });
    const code = String(Math.floor(100000 + Math.random()*900000));
    const expires = new Date(Date.now() + 5*60*1000);
    const channel = rec.contact.includes('@') ? 'email' : 'sms';
    await models.UserOTP.create({ user_id: userId, channel, code, expires_at: expires });
    // TODO: integrate real email/SMS provider here
    res.json({ sent: true, channel, to: rec.contact, code }); // return code only for development
  } catch (err) {
    console.error('/api/login/otp/request error:', err);
    return res.status(500).json({ message: 'OTP request failed', details: toDbMessage(err) });
  }
});

// Core server imports and initialization must come BEFORE any route declarations
import express from 'express';
import cors from 'cors';
import { pool } from './mysql.js';
import { sequelize, initModels, syncSequelize, models } from './sequelize.js';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import { initiate as zenopayInitiate, verifySignature as zenopayVerify, parseWebhook as zenopayParse } from './providers/zenopay.js';

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

// Temporary OTP token (short-lived) for two-step login
const signTempOtpToken = (userId) => {
  if (!JWT_SECRET) throw new Error('Server is missing JWT_SECRET');
  const payload = { sub: String(userId), otp_pending: true };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '10m' });
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
  } catch (e) { return false; }
}

// (moved) Settings endpoints are registered after middleware below

// List payments (optionally by invoice_id)
app.get('/api/payments', requireAuth, async (req, res) => {
  try {
    const where = {};
    if (req.query.invoice_id) where.invoice_id = Number(req.query.invoice_id);
    const limit = Math.min(100, Number(req.query.limit||10));
    const rows = await models.Payment.findAll({ where, order: [['id','DESC']], limit });
    res.json(rows);
  } catch (err) {
    console.error('/api/payments GET error:', err);
    res.status(500).json({ message: 'Fetch payments failed', details: toDbMessage(err) });
  }
});

// Push-to-pay: sends a payment prompt to user's phone (simulated)
app.post('/api/payments/push', requireAuth, requireRole('admin','manager','doctor'), async (req, res) => {
  try {
    const { invoice_id, provider, phone, amount } = req.body || {};
    const invId = Number(invoice_id);
    if (!invId) return res.status(400).json({ message: 'invoice_id required' });
    if (!provider) return res.status(400).json({ message: 'provider required' });
    if (!phone) return res.status(400).json({ message: 'phone required' });
    const inv = await models.Invoice.findByPk(invId);
    if (!inv) return res.status(404).json({ message: 'Invoice not found' });
    const amt = amount != null ? Number(amount) : Number(inv.amount);
    if (!(amt > 0)) return res.status(400).json({ message: 'amount must be > 0' });
    if (amt > Number(inv.amount)) return res.status(400).json({ message: 'amount cannot exceed invoice amount' });
    const reference = `PUSH-${invId}-${Date.now()}`;
    const row = await models.Payment.create({
      invoice_id: invId,
      patient_id: inv.patient_id,
      amount: amt,
      method: 'mobile_money',
      status: 'initiated',
      reference,
      meta: { provider: String(provider), phone: String(phone) }
    });
    // In a real integration, call the provider API here to push STK/USSD prompt to phone.
    res.status(201).json(row);
  } catch (err) {
    console.error('/api/payments/push POST error:', err);
    res.status(500).json({ message: 'Push payment failed', details: toDbMessage(err) });
  }
});

// Look up latest payment by reference
app.get('/api/payments/status/:reference', requireAuth, async (req, res) => {
  try {
    const reference = String(req.params.reference);
    const rows = await models.Payment.findAll({ where: { reference }, order: [['id','DESC']], limit: 1 });
    res.json(rows[0] || null);
  } catch (err) {
    console.error('/api/payments/status GET error:', err);
    res.status(500).json({ message: 'Fetch status failed', details: toDbMessage(err) });
  }
});

// Zenopay webhook
app.post('/api/webhooks/zenopay', async (req, res) => {
  try {
    if (!zenopayVerify(req)) return res.status(401).json({ message: 'invalid signature' });
    const p = zenopayParse(req.body||{});
    if (!p.reference) return res.status(400).json({ message: 'reference required' });
    // Try match by control number first if provided else by reference
    let cn = null;
    if (p.control_number) cn = await models.ControlNumber.findOne({ where: { number: p.control_number } });
    let invoiceId = cn ? cn.invoice_id : null;
    if (!invoiceId) {
      const payment = await models.Payment.findOne({ where: { reference: p.reference } });
      invoiceId = payment?.invoice_id || null;
    }
    if (!invoiceId) return res.status(404).json({ message: 'invoice not found for reference' });
    await models.Payment.create({ invoice_id: invoiceId, patient_id: null, amount: p.amount, method: 'zenopay', status: p.status==='success'?'success':'failed', reference: p.reference, provider_tx_id: p.provider_tx_id||null, meta: req.body||null });
    if (p.status==='success') {
      if (cn) {
        const newRemain = Math.max(0, Number(cn.remaining_balance||0) - Number(p.amount||0));
        await cn.update({ remaining_balance: newRemain });
        if (newRemain === 0) await models.Invoice.update({ status: 'paid' }, { where: { id: invoiceId } });
        else await models.Invoice.update({ status: 'partially_paid' }, { where: { id: invoiceId } });
      } else {
        // If no CN, still mark invoice based on payments sum
        const pays = await models.Payment.findAll({ where: { invoice_id: invoiceId, status: 'success' }, attributes: ['amount'] });
        const paid = pays.reduce((s,r)=>s+Number(r.amount||0),0) + Number(p.amount||0);
        const inv = await models.Invoice.findByPk(invoiceId);
        if (paid >= Number(inv.amount||0)) await models.Invoice.update({ status:'paid' }, { where: { id: invoiceId } });
        else await models.Invoice.update({ status:'partially_paid' }, { where: { id: invoiceId } });
      }
    }
    res.json({ ok: true });
  } catch (err) { console.error('zenopay webhook error', err); res.status(500).json({ message: 'error' }); }
});

// ===== Overdue/Expiry job =====
app.post('/api/jobs/overdue', requireAuth, requireRole('admin','manager'), async (_req, res) => {
  try {
    const today = new Date().toISOString().slice(0,10);
    // Mark overdue invoices: due_date < today and status in pending/partially_paid
    try {
      await models.Invoice.update({ status: 'overdue' }, { where: { status: { [Op.in]: ['pending','partially_paid'] }, date: { [Op.lt]: today } } });
    } catch {}
    // Expire control numbers past expiry_at
    try {
      const expired = await models.ControlNumber.findAll({ where: { status: 'active', expiry_at: { [Op.lt]: new Date() } } });
      for (const cn of expired) await cn.update({ status: 'expired' });
    } catch {}
    res.json({ ok: true });
  } catch (err) { console.error('overdue job error', err); res.status(500).json({ message: 'Failed' }); }
});

// ===== Insurance Claims =====
app.post('/api/insurance-claims', requireAuth, requireRole('admin','manager'), async (req, res) => {
  try {
    const { invoice_id, claim_number, provider, claim_amount, remarks } = req.body || {};
    if (!invoice_id || !claim_number) return res.status(400).json({ message: 'invoice_id and claim_number required' });
    const row = await models.InsuranceClaim.create({ invoice_id: Number(invoice_id), claim_number, provider: provider||null, claim_amount: claim_amount||null, remarks: remarks||null });
    res.status(201).json(row);
  } catch (err) { console.error('/api/insurance-claims POST error:', err); res.status(500).json({ message: 'Failed' }); }
});

app.put('/api/insurance-claims/:id', requireAuth, requireRole('admin','manager'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const row = await models.InsuranceClaim.findByPk(id);
    if (!row) return res.status(404).json({ message: 'Not found' });
    const { status, claim_amount, remarks } = req.body || {};
    await row.update({ status: status || row.status, claim_amount: claim_amount ?? row.claim_amount, remarks: remarks ?? row.remarks });
    res.json(row);
  } catch (err) { console.error('/api/insurance-claims PUT error:', err); res.status(500).json({ message: 'Failed' }); }
});

app.get('/api/insurance-claims', requireAuth, requireRole('admin','manager'), async (req, res) => {
  try {
    const where = {};
    if (req.query.invoice_id) where.invoice_id = Number(req.query.invoice_id);
    if (req.query.status) where.status = String(req.query.status);
    const list = await models.InsuranceClaim.findAll({ where, order: [['id','DESC']], limit: 100 });
    res.json(list);
  } catch (err) { res.status(500).json({ message: 'Failed' }); }
});

// ===== Finance: invoice status metrics =====
app.get('/api/metrics/invoices-status', requireAuth, async (_req, res) => {
  try {
    const q = async (status) => {
      const [rows] = await pool.query('SELECT COUNT(*) c FROM invoices WHERE status = ?', [status]);
      return Number(rows?.[0]?.c || 0);
    };
    const [pnd, pd, ppd, ovr] = await Promise.all([
      q('pending'), q('paid'), q('partially_paid'), q('overdue')
    ]);
    // claims count (pending)
    let claims = 0;
    try {
      const [r] = await pool.query("SELECT COUNT(*) c FROM insurance_claims WHERE status IN ('submitted','pending')");
      claims = Number(r?.[0]?.c || 0);
    } catch {}
    res.json({ pending: pnd, paid: pd, partially_paid: ppd, overdue: ovr, claims });
  } catch (err) {
    console.error('/api/metrics/invoices-status error:', err);
    res.status(500).json({ message: 'Failed' });
  }
});

// ===== Control Number helpers =====
function randomControlNumber() {
  const n = Date.now().toString().slice(-8) + Math.floor(Math.random()*10000).toString().padStart(4,'0');
  return `CN${n}`;
}

async function getInvoiceOutstanding(invoiceId) {
  const inv = await models.Invoice.findByPk(Number(invoiceId));
  if (!inv) throw new Error('Invoice not found');
  const pays = await models.Payment.findAll({ where: { invoice_id: Number(invoiceId), status: 'success' }, attributes: ['amount'] });
  const paid = pays.reduce((s,p)=> s + Number(p.amount||0), 0);
  return Math.max(0, Number(inv.amount||0) - paid);
}

// ===== Control Numbers API =====
// Create (generate) control number
app.post('/api/control-numbers', requireAuth, requireRole('admin','manager'), async (req, res) => {
  try {
    const { invoice_id, provider, expiry_at } = req.body || {};
    const invoiceId = Number(invoice_id);
    if (!invoiceId) return res.status(400).json({ message: 'invoice_id required' });
    const outstanding = await getInvoiceOutstanding(invoiceId);
    if (outstanding <= 0) return res.status(400).json({ message: 'Invoice already settled' });
    const number = randomControlNumber();
    const row = await models.ControlNumber.create({ invoice_id: invoiceId, number, status:'active', total_amount: outstanding, remaining_balance: outstanding, provider: provider||null, expiry_at: expiry_at||null });
    res.status(201).json(row);
  } catch (err) {
    console.error('/api/control-numbers POST error:', err);
    res.status(500).json({ message: 'Create control number failed' });
  }
});

// List by invoice or status
app.get('/api/control-numbers', requireAuth, requireRole('admin','manager'), async (req, res) => {
  try {
    const where = {};
    if (req.query.invoice_id) where.invoice_id = Number(req.query.invoice_id);
    if (req.query.status) where.status = String(req.query.status);
    const list = await models.ControlNumber.findAll({ where, order: [['id','DESC']], limit: 100 });
    res.json(list);
  } catch (err) { res.status(500).json({ message: 'Failed' }); }
});

// Cancel a control number
app.post('/api/control-numbers/:id/cancel', requireAuth, requireRole('admin','manager'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const cn = await models.ControlNumber.findByPk(id);
    if (!cn) return res.status(404).json({ message: 'Not found' });
    await cn.update({ status: 'cancelled' });
    res.json(cn);
  } catch (err) { res.status(500).json({ message: 'Cancel failed' }); }
});

// Reissue: mark old and create a new control number for remaining balance
app.post('/api/control-numbers/:id/reissue', requireAuth, requireRole('admin','manager'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const old = await models.ControlNumber.findByPk(id);
    if (!old) return res.status(404).json({ message: 'Not found' });
    const outstanding = await getInvoiceOutstanding(old.invoice_id);
    await old.update({ status: 'reissued' });
    if (outstanding <= 0) return res.json({ old, new: null });
    const number = randomControlNumber();
    const row = await models.ControlNumber.create({ invoice_id: old.invoice_id, number, status:'active', total_amount: outstanding, remaining_balance: outstanding, provider: old.provider||null, expiry_at: old.expiry_at||null });
    res.json({ old, new: row });
  } catch (err) { res.status(500).json({ message: 'Reissue failed' }); }
});

// ===== Webhook stubs =====
function verifySignature(req, provider) {
  try {
    const secret = provider === 'bank' ? (process.env.BANK_WEBHOOK_SECRET||'') : (process.env.MOMO_WEBHOOK_SECRET||'');
    const sig = req.headers['x-signature'] || '';
    if (!secret || !sig) return false; // if not configured, reject; set to true to relax in dev
    const body = JSON.stringify(req.body||{});
    const h = crypto.createHmac('sha256', secret).update(body).digest('hex');
    return sig === h;
  } catch { return false; }
}

app.post('/api/webhooks/mobile-money', async (req, res) => {
  try {
    if (!verifySignature(req, 'momo')) return res.status(401).json({ message: 'invalid signature' });
    const { control_number, amount, provider_tx_id, status } = req.body || {};
    if (!control_number) return res.status(400).json({ message: 'control_number required' });
    const cn = await models.ControlNumber.findOne({ where: { number: String(control_number) } });
    if (!cn) return res.status(404).json({ message: 'Control number not found' });
    const amt = Number(amount||0);
    await models.Payment.create({ invoice_id: cn.invoice_id, patient_id: null, amount: amt, method: 'mobile_money', status: status==='success'?'success':'failed', reference: control_number, provider_tx_id: provider_tx_id||null, meta: req.body || null });
    if (status==='success') {
      const newRemain = Math.max(0, Number(cn.remaining_balance||0) - amt);
      await cn.update({ remaining_balance: newRemain });
      if (newRemain === 0) {
        await models.Invoice.update({ status: 'paid' }, { where: { id: cn.invoice_id } });
      } else {
        await models.Invoice.update({ status: 'partially_paid' }, { where: { id: cn.invoice_id } });
      }
    }
    res.json({ ok: true });
  } catch (err) { console.error('mobile-money webhook error', err); res.status(500).json({ message: 'error' }); }
});

app.post('/api/webhooks/bank', async (req, res) => {
  try {
    if (!verifySignature(req, 'bank')) return res.status(401).json({ message: 'invalid signature' });
    const { control_number, amount, provider_tx_id, status } = req.body || {};
    if (!control_number) return res.status(400).json({ message: 'control_number required' });
    const cn = await models.ControlNumber.findOne({ where: { number: String(control_number) } });
    if (!cn) return res.status(404).json({ message: 'Control number not found' });
    const amt = Number(amount||0);
    await models.Payment.create({ invoice_id: cn.invoice_id, patient_id: null, amount: amt, method: 'bank_transfer', status: status==='success'?'success':'failed', reference: control_number, provider_tx_id: provider_tx_id||null, meta: req.body || null });
    if (status==='success') {
      const newRemain = Math.max(0, Number(cn.remaining_balance||0) - amt);
      await cn.update({ remaining_balance: newRemain });
      if (newRemain === 0) {
        await models.Invoice.update({ status: 'paid' }, { where: { id: cn.invoice_id } });
      } else {
        await models.Invoice.update({ status: 'partially_paid' }, { where: { id: cn.invoice_id } });
      }
    }
    res.json({ ok: true });
  } catch (err) { console.error('bank webhook error', err); res.status(500).json({ message: 'error' }); }
});

// ===== Reconciliation (simulation) =====
app.post('/api/reconcile/payments', requireAuth, requireRole('admin','manager'), async (_req, res) => {
  try {
    // For demo: set random initiated payments to success
    const inits = await models.Payment.findAll({ where: { status: 'initiated' }, limit: 10 });
    for (const p of inits) {
      const success = Math.random() > 0.3;
      if (!success) continue;
      await p.update({ status: 'success', provider_tx_id: p.provider_tx_id || `SIM-${Date.now()}` });
      if (p.invoice_id) {
        const cn = await models.ControlNumber.findOne({ where: { invoice_id: p.invoice_id, status: 'active' }, order: [['id','DESC']] });
        if (cn) {
          const newRemain = Math.max(0, Number(cn.remaining_balance||0) - Number(p.amount||0));
          await cn.update({ remaining_balance: newRemain });
          if (newRemain === 0) await models.Invoice.update({ status: 'paid' }, { where: { id: p.invoice_id } });
          else await models.Invoice.update({ status: 'partially_paid' }, { where: { id: p.invoice_id } });
        } else {
          // No control number: update invoice status based on paid sum
          const pays = await models.Payment.findAll({ where: { invoice_id: p.invoice_id, status: 'success' }, attributes: ['amount'] });
          const paid = pays.reduce((s,r)=> s + Number(r.amount||0), 0);
          const inv = await models.Invoice.findByPk(p.invoice_id);
          if (inv) {
            if (paid >= Number(inv.amount||0)) await models.Invoice.update({ status: 'paid' }, { where: { id: p.invoice_id } });
            else await models.Invoice.update({ status: 'partially_paid' }, { where: { id: p.invoice_id } });
          }
        }
      }
    }
    res.json({ ok: true, updated: inits.length });
  } catch (err) { console.error('reconcile error', err); res.status(500).json({ message: 'Failed' }); }
});

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
    const { invoice_id, method, buyer_name: bName, buyer_phone: bPhone, buyer_email: bEmail, provider: reqProvider, amount: reqAmount } = req.body || {};
    const invId = Number(invoice_id);
    if (!invId) return res.status(400).json({ message: 'invoice_id required' });
    const inv = await models.Invoice.findByPk(invId);
    if (!inv) return res.status(404).json({ message: 'Invoice not found' });
    // Amount validation (allow override but not more than invoice amount, and >0)
    const amt = reqAmount != null ? Number(reqAmount) : Number(inv.amount);
    if (!(amt > 0)) return res.status(400).json({ message: 'amount must be > 0' });
    if (amt > Number(inv.amount)) return res.status(400).json({ message: 'amount cannot exceed invoice amount' });
    // default control-number style reference
    let reference = `CN-${invId}-${Date.now()}`;
    let checkout_url = undefined;
    let payMethod = method || 'control';
    if (String(method).toLowerCase() === 'zenopay') {
      // Pull buyer info from patient record but allow override from request body
      let buyer_name = bName, buyer_phone = bPhone, buyer_email = bEmail;
      try {
        if (!buyer_name || !buyer_phone || !buyer_email) {
          const p = await models.Patient.findByPk(inv.patient_id);
          if (p) {
            if (!buyer_name) buyer_name = p.name || undefined;
            if (!buyer_phone) buyer_phone = p.phone || undefined;
            if (!buyer_email) buyer_email = p.email || undefined;
          }
        }
      } catch {}
      const z = await zenopayInitiate({ invoiceId: invId, amount: amt, controlNumber: reference, buyer_name, buyer_phone, buyer_email });
      reference = z.reference || reference;
      checkout_url = z.checkout_url;
      payMethod = 'zenopay';
    }
    const meta = {};
    if (checkout_url) meta.checkout_url = checkout_url;
    if (reqProvider) meta.provider = String(reqProvider);
    if (bName) meta.buyer_name = String(bName);
    if (bPhone) meta.buyer_phone = String(bPhone);
    if (bEmail) meta.buyer_email = String(bEmail);
    const row = await models.Payment.create({ invoice_id: invId, patient_id: inv.patient_id, amount: amt, method: payMethod, status: 'initiated', reference, meta: Object.keys(meta).length ? meta : null });
    res.status(201).json({ ...row.toJSON(), checkout_url });
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

// Simple HTML receipt (for printing)
app.get('/api/payments/:id/receipt', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const pay = await models.Payment.findByPk(id);
    if (!pay) return res.status(404).send('Payment not found');
    const inv = await models.Invoice.findByPk(pay.invoice_id);
    const cn = await models.ControlNumber.findOne({ where: { invoice_id: pay.invoice_id }, order: [['id','DESC']] });
    const dt = new Date(pay.created_at || Date.now()).toLocaleString();
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Receipt #${id}</title>
    <style>body{font-family:system-ui,Segoe UI,Arial,sans-serif;padding:24px;color:#111}h1{margin:0 0 8px}table{border-collapse:collapse;margin-top:12px}td{padding:4px 8px}small{color:#555}</style></head><body>
    <h1>Payment Receipt</h1>
    <small>Secure Payment • ${dt}</small>
    <table>
      <tr><td><b>Payment ID</b></td><td>#${id}</td></tr>
      <tr><td><b>Invoice ID</b></td><td>#${pay.invoice_id}</td></tr>
      <tr><td><b>Amount</b></td><td>${pay.amount}</td></tr>
      <tr><td><b>Status</b></td><td>${pay.status}</td></tr>
      <tr><td><b>Method</b></td><td>${pay.method}</td></tr>
      <tr><td><b>Reference</b></td><td>${pay.reference || ''}</td></tr>
      <tr><td><b>Control Number</b></td><td>${cn?.number || ''}</td></tr>
      <tr><td><b>Timestamp</b></td><td>${dt}</td></tr>
    </table>
    <p style="margin-top:16px"><small>For support contact your billing office.</small></p>
    </body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('/api/payments/:id/receipt GET error:', err);
    res.status(500).send('Failed to generate receipt');
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


// Settings endpoints (registered post-middleware)
app.get('/api/settings', requireAuth, requireRole('admin','manager'), async (_req, res) => {
  try { res.json(loadSettings()); } catch (e) { res.status(500).json({ message: 'Failed to load settings' }); }
});
app.put('/api/settings', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const current = loadSettings();
    const next = { ...current, ...(req.body||{}) };
    if (!saveSettings(next)) return res.status(500).json({ message: 'Failed to save settings' });
    res.json(next);
  } catch (e) { res.status(500).json({ message: 'Failed to save settings' }); }
});

// ===== Simple file-backed 2FA (TOTP) =====
const twoFaPath = path.resolve(__dirname, '2fa.json');
function load2fa() {
  try { if (fs.existsSync(twoFaPath)) return JSON.parse(fs.readFileSync(twoFaPath,'utf8')||'{}'); } catch {}
  return {};
}
function save2fa(obj) { try { fs.writeFileSync(twoFaPath, JSON.stringify(obj,null,2),'utf8'); return true; } catch { return false; } }
// Base32 helpers
const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf) {
  let bits = 0, value = 0, output = '';
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      output += base32Alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += base32Alphabet[(value << (5 - bits)) & 31];
  return output;
}
function base32Decode(str) {
  let bits = 0, value = 0; const out = [];
  for (const c of str.replace(/=+$/,'')) {
    const idx = base32Alphabet.indexOf(c.toUpperCase());
    if (idx === -1) continue;
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
function hotp(secretBase32, counter, digits=6) {
  const key = base32Decode(secretBase32);
  const buf = Buffer.alloc(8);
  for (let i=7;i>=0;i--) { buf[i] = counter & 0xff; counter = counter >>> 8; }
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length-1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset+1] & 0xff) << 16) | ((hmac[offset+2] & 0xff) << 8) | (hmac[offset+3] & 0xff);
  const mod = code % (10 ** digits);
  return String(mod).padStart(digits,'0');
}
function totp(secretBase32, period=30, digits=6, skew=1) {
  const now = Math.floor(Date.now() / 1000);
  const steps = Math.floor(now / period);
  const codes = [];
  for (let k=-skew; k<=skew; k++) {
    codes.push(hotp(secretBase32, steps + k, digits));
  }
  return codes;
}

// 2FA endpoints
app.get('/api/2fa/status', requireAuth, async (req, res) => {
  try {
    const userId = Number(req.user?.sub || req.user?.id || 0);
    if (!userId) return res.status(400).json({ message: 'Invalid user' });
    const row = await models.User2FA.findByPk(userId);
    res.json({ enabled: !!row?.enabled });
  } catch (e) { res.status(500).json({ message: 'Failed' }); }
});
app.post('/api/2fa/setup', requireAuth, async (req, res) => {
  try {
    const userId = Number(req.user?.sub || req.user?.id || 0);
    if (!userId) return res.status(400).json({ message: 'Invalid user' });
    const secretBuf = crypto.randomBytes(20);
    const secret = base32Encode(secretBuf);
    const issuer = encodeURIComponent((process.env.APP_NAME || 'CareLink HMS'));
    const label = encodeURIComponent(`${issuer}:${req.user?.email || String(userId)}`);
    const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
    // Save or update DB record with temp secret (enabled=false until verified)
    const existing = await models.User2FA.findByPk(userId);
    if (existing) await existing.update({ totp_secret: secret, method: 'totp', enabled: false });
    else await models.User2FA.create({ user_id: userId, totp_secret: secret, method: 'totp', enabled: false });
    res.json({ secret, otpauth });
  } catch (e) { res.status(500).json({ message: 'Setup failed' }); }
});
app.post('/api/2fa/verify', requireAuth, async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ message: 'code required' });
    const userId = Number(req.user?.sub || req.user?.id || 0);
    if (!userId) return res.status(400).json({ message: 'Invalid user' });
    const rec = await models.User2FA.findByPk(userId);
    const secret = rec?.totp_secret;
    if (!secret) return res.status(400).json({ message: 'No secret set' });
    const validCodes = totp(secret);
    const ok = validCodes.includes(String(code));
    if (!ok) return res.status(400).json({ message: 'Invalid code' });
    await models.User2FA.upsert({ user_id: userId, totp_secret: secret, enabled: true });
    res.json({ enabled: true });
  } catch (e) { res.status(500).json({ message: 'Verify failed' }); }
});
app.post('/api/2fa/disable', requireAuth, async (req, res) => {
  try {
    const userId = Number(req.user?.sub || req.user?.id || 0);
    if (!userId) return res.status(400).json({ message: 'Invalid user' });
    await models.User2FA.destroy({ where: { user_id: userId } });
    res.json({ enabled: false });
  } catch (e) { res.status(500).json({ message: 'Disable failed' }); }
});

// Set preferred 2FA method and contact (for OTP)
app.post('/api/2fa/method', requireAuth, async (req, res) => {
  try {
    const userId = Number(req.user?.sub || req.user?.id || 0);
    if (!userId) return res.status(400).json({ message: 'Invalid user' });
    const method = String(req.body?.method||'').toLowerCase();
    const contact = req.body?.contact ? String(req.body.contact) : null;
    if (!['totp','otp'].includes(method)) return res.status(400).json({ message: 'Invalid method' });
    if (method === 'otp' && !contact) return res.status(400).json({ message: 'contact required for otp' });
    const existing = await models.User2FA.findByPk(userId);
    if (existing) await existing.update({ method, contact: contact||null }); else await models.User2FA.create({ user_id: userId, method, contact: contact||null, enabled: false });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: 'Failed to set method' }); }
});

// Request OTP (email/SMS) - dev: returns code in response; replace with real sender
app.post('/api/2fa/otp/request', requireAuth, async (req, res) => {
  try {
    const userId = Number(req.user?.sub || req.user?.id || 0);
    if (!userId) return res.status(400).json({ message: 'Invalid user' });
    const rec = await models.User2FA.findByPk(userId);
    if (!rec || rec.method !== 'otp' || !rec.contact) return res.status(400).json({ message: 'OTP method not configured' });
    const code = String(Math.floor(100000 + Math.random()*900000));
    const expires = new Date(Date.now() + 5*60*1000);
    const channel = rec.contact.includes('@') ? 'email' : 'sms';
    await models.UserOTP.create({ user_id: userId, channel, code, expires_at: expires });
    // TODO: integrate real email/SMS provider here
    res.json({ sent: true, channel, to: rec.contact, code }); // return code only for development
  } catch (e) { res.status(500).json({ message: 'OTP request failed' }); }
});

// Verify OTP and enable method
app.post('/api/2fa/otp/verify', requireAuth, async (req, res) => {
  try {
    const userId = Number(req.user?.sub || req.user?.id || 0);
    const code = String(req.body?.code||'').trim();
    if (!userId || !code) return res.status(400).json({ message: 'Invalid request' });
    const now = new Date();
    const row = await models.UserOTP.findOne({ where: { user_id: userId, code, used_at: null, expires_at: { [Op.gt]: now } }, order: [['id','DESC']] });
    if (!row) return res.status(400).json({ message: 'Invalid or expired code' });
    await row.update({ used_at: new Date() });
    // Enable 2FA as OTP method
    const rec = await models.User2FA.findByPk(userId);
    if (rec) await rec.update({ method: 'otp', enabled: true }); else await models.User2FA.create({ user_id: userId, method: 'otp', enabled: true });
    res.json({ enabled: true, method: 'otp' });
  } catch (e) { res.status(500).json({ message: 'OTP verify failed' }); }
});

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
    // If user has 2FA enabled, require OTP second step
    let requires_otp = false;
    try {
      const rec = await models.User2FA.findByPk(Number(user.id));
      requires_otp = !!rec?.enabled;
    } catch {}
    if (requires_otp) {
      const temp_token = signTempOtpToken(user.id);
      return res.json({ requires_otp: true, temp_token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    }
    const token = signToken(user);
    return res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error('/api/login error:', err);
    return res.status(500).json({ message: 'Login failed', details: toDbMessage(err) });
  }
});

// Verify OTP for two-step login
app.post('/api/login/verify-otp', async (req, res) => {
  try {
    const { temp_token, code } = req.body || {};
    if (!temp_token || !code) return res.status(400).json({ message: 'temp_token and code required' });
    if (!JWT_SECRET) return res.status(500).json({ message: 'Server is missing JWT_SECRET' });
    let decoded = null;
    try { decoded = jwt.verify(String(temp_token), JWT_SECRET); } catch (e) { return res.status(401).json({ message: 'Invalid or expired temp token' }); }
    if (!decoded?.sub || !decoded?.otp_pending) return res.status(400).json({ message: 'Invalid temp token' });
    const userId = Number(decoded.sub);
    const [rows] = await pool.query('SELECT id, name, email, role FROM users WHERE id = ? LIMIT 1', [userId]);
    const user = rows && rows[0];
    if (!user) return res.status(404).json({ message: 'User not found' });
    const rec = await models.User2FA.findByPk(userId);
    if (!rec?.enabled) return res.status(400).json({ message: '2FA not enabled' });
    let ok = false;
    if (rec.method === 'totp') {
      const secret = rec?.totp_secret;
      if (!secret) return res.status(400).json({ message: '2FA secret missing' });
      const validCodes = totp(secret);
      ok = validCodes.includes(String(code));
    } else if (rec.method === 'otp') {
      const now = new Date();
      const row = await models.UserOTP.findOne({ where: { user_id: userId, code: String(code), used_at: null, expires_at: { [Op.gt]: now } }, order: [['id','DESC']] });
      if (row) { ok = true; await row.update({ used_at: new Date() }); }
    } else {
      return res.status(400).json({ message: 'Unsupported 2FA method' });
    }
    if (!ok) return res.status(400).json({ message: 'Invalid code' });
    const token = signToken(user);
    return res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error('/api/login/verify-otp error:', err);
    return res.status(500).json({ message: 'Verify OTP failed', details: toDbMessage(err) });
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
