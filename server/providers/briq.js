// Simple Briq SMS provider wrapper
// Env:
//  - BRIQ_BASE_URL (default: https://api.briq.com) — replace with actual Briq endpoint
//  - BRIQ_API_KEY
//  - BRIQ_SENDER_ID (alphanumeric or short code provisioned by Briq)

const BASE_URL = (process.env.BRIQ_BASE_URL || 'https://api.briq.com').replace(/\/$/, '');
const API_KEY = process.env.BRIQ_API_KEY || '';
const SENDER_ID = process.env.BRIQ_SENDER_ID || 'CLINIC';

// Normalize phone to international; naive +255 format helper
function normalizeMsisdn(msisdn) {
  const s = String(msisdn || '').replace(/\s+/g, '');
  if (s.startsWith('+')) return s;
  if (s.startsWith('0')) return `+255${s.slice(1)}`; // TZ local to E. Africa example
  if (/^255\d+$/.test(s)) return `+${s}`;
  return s;
}

export async function sendSms(to, message) {
  if (!API_KEY) throw new Error('Missing BRIQ_API_KEY');
  const msisdn = normalizeMsisdn(to);
  const url = `${BASE_URL}/sms/send`;
  const payload = { from: SENDER_ID, to: msisdn, text: String(message || '') };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  let data = null;
  try { data = await res.json(); } catch { data = await res.text(); }
  if (!res.ok) {
    throw new Error((data && data.message) ? data.message : `Briq SMS send failed (${res.status})`);
  }
  return data;
}
