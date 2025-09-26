// server/providers/zenopay.js
// ESM provider adapter for Zenopay (stubbed). Replace endpoints/fields per real API.

import crypto from 'crypto';

const BASE_URL = (process.env.ZENOPAY_BASE_URL || 'https://api.zeno.africa').replace(/\/$/, '');
const API_KEY = process.env.ZENOPAY_API_KEY || '';
const SECRET_KEY = process.env.ZENOPAY_SECRET_KEY || '';
const ACCOUNT_ID = process.env.ZENOPAY_ACCOUNT_ID || process.env.ZENOPAY_MERCHANT_ID || '';
const CALLBACK_URL = process.env.ZENOPAY_CALLBACK_URL || '';
const RETURN_URL = process.env.ZENOPAY_RETURN_URL || '';

// Create order with ZenoPay using x-www-form-urlencoded per docs.
export async function initiate({ invoiceId, amount, buyer_name, buyer_phone, buyer_email, controlNumber }) {
  const endpoint = BASE_URL; // Docs show base URL; if a specific path is required, set in .env
  const params = new URLSearchParams();
  if (buyer_name) params.append('buyer_name', String(buyer_name));
  if (buyer_phone) params.append('buyer_phone', String(buyer_phone));
  if (buyer_email) params.append('buyer_email', String(buyer_email));
  params.append('amount', String(Number(amount || 0)));
  if (ACCOUNT_ID) params.append('account_id', ACCOUNT_ID);
  if (SECRET_KEY) params.append('secret_key', SECRET_KEY);
  if (API_KEY) params.append('api_key', API_KEY);
  // Optional fields
  if (controlNumber) params.append('order_id', String(controlNumber));
  if (CALLBACK_URL) params.append('callback_url', CALLBACK_URL);
  if (RETURN_URL) params.append('return_url', RETURN_URL);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.message || data?.error || text || 'ZenoPay initiate failed';
    throw new Error(msg);
  }
  // Try to normalize expected fields
  const reference = data?.reference || data?.order_id || `ZP-${invoiceId}-${Date.now()}`;
  const checkout_url = data?.checkout_url || data?.link || data?.payment_url || undefined;
  return { reference, checkout_url, provider: 'zenopay', raw: data };
}

export function verifySignature(req) {
  try {
    const secret = process.env.ZENOPAY_WEBHOOK_SECRET || '';
    const sig = req.headers['x-zenopay-signature'] || req.headers['x-signature'] || '';
    if (!secret || !sig) return false;
    const body = JSON.stringify(req.body || {});
    const h = crypto.createHmac('sha256', secret).update(body).digest('hex');
    return sig === h;
  } catch { return false; }
}

export function parseWebhook(body) {
  // Normalize provider payload into our canonical shape
  // Expect body like: { reference, amount, status: 'success'|'failed', control_number, provider_tx_id }
  return {
    reference: String(body.reference || ''),
    amount: Number(body.amount || 0),
    status: String(body.status || 'pending'),
    control_number: body.control_number ? String(body.control_number) : undefined,
    provider_tx_id: body.provider_tx_id ? String(body.provider_tx_id) : undefined,
  };
}
