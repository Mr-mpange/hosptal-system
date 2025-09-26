// Briq OTP API wrapper based on https://docs.briq.tz
// Env:
//  - BRIQ_OTP_BASE_URL (e.g., https://api.briq.tz)
//  - BRIQ_DEVELOPER_APP_ID
//  - BRIQ_API_KEY (Bearer token)

const BASE_URL = (process.env.BRIQ_OTP_BASE_URL || process.env.BRIQ_BASE_URL || 'https://api.briq.tz').replace(/\/$/, '');
const API_KEY = process.env.BRIQ_API_KEY || '';
const DEV_APP_ID = process.env.BRIQ_DEVELOPER_APP_ID || '';

function normalizeMsisdn(msisdn) {
  const s = String(msisdn || '').replace(/\s+/g, '');
  if (s.startsWith('+')) return s;
  if (s.startsWith('0')) return `+255${s.slice(1)}`;
  if (/^255\d+$/.test(s)) return `+${s}`;
  return s;
}

export async function requestOtp(phone_number) {
  if (!API_KEY) throw new Error('Missing BRIQ_API_KEY');
  if (!DEV_APP_ID) throw new Error('Missing BRIQ_DEVELOPER_APP_ID');
  const url = `${BASE_URL}/otp/request`;
  const payload = { phone_number: normalizeMsisdn(phone_number), developer_app_id: DEV_APP_ID };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify(payload),
  });
  let data = null; try { data = await res.json(); } catch { data = await res.text(); }
  if (!res.ok || (data && data.success === false)) {
    const msg = (data && (data.error || data.message)) || `Briq OTP request failed (${res.status})`;
    throw new Error(msg);
  }
  return data; // { success:true, data:{ expires_at }, ... }
}

export async function validateOtp(phone_number, code) {
  if (!API_KEY) throw new Error('Missing BRIQ_API_KEY');
  if (!DEV_APP_ID) throw new Error('Missing BRIQ_DEVELOPER_APP_ID');
  const url = `${BASE_URL}/otp/validate`;
  const payload = { phone_number: normalizeMsisdn(phone_number), code: String(code), developer_app_id: DEV_APP_ID };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify(payload),
  });
  let data = null; try { data = await res.json(); } catch { data = await res.text(); }
  if (!res.ok || (data && data.success === false)) {
    const msg = (data && (data.error || data.message)) || `Briq OTP validate failed (${res.status})`;
    throw new Error(msg);
  }
  return data; // { success:true, data:..., ... }
}
