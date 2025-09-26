// Minimal SendGrid API client (no external deps)
// Env:
//  - SENDGRID_API_KEY
//  - SENDGRID_FROM_EMAIL
//  - SENDGRID_FROM_NAME (optional)

const SG_API_KEY = process.env.SENDGRID_API_KEY || '';
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || '';
const FROM_NAME = process.env.SENDGRID_FROM_NAME || 'Clinicare HMS';

export async function sendEmail(to, subject, text) {
  if (!SG_API_KEY) throw new Error('Missing SENDGRID_API_KEY');
  if (!FROM_EMAIL) throw new Error('Missing SENDGRID_FROM_EMAIL');
  const url = 'https://api.sendgrid.com/v3/mail/send';
  const payload = {
    personalizations: [ { to: [ { email: String(to) } ] } ],
    from: { email: FROM_EMAIL, name: FROM_NAME },
    subject: String(subject || ''),
    content: [ { type: 'text/plain', value: String(text || '') } ],
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SG_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let body; try { body = await res.text(); } catch {}
    throw new Error(`SendGrid send failed (${res.status}): ${body || ''}`);
  }
  return { ok: true };
}
