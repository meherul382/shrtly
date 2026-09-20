export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const base = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const token = readBearer(req.headers.authorization) || readCookie(req.headers.cookie, 'shrtigo_session');
  if (!base || !key || !adminEmail) return res.status(500).json({ error: 'Admin backend is not configured.' });
  if (!token) return res.status(401).json({ error: 'Login required.' });
  try {
    const userResponse = await fetch(`${base}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: key } });
    if (!userResponse.ok) return res.status(401).json({ error: 'Login required.' });
    const user = await userResponse.json();
    if (String(user.email || '').toLowerCase() !== adminEmail) return res.status(403).json({ error: 'Admin access required.' });
    const { id, action } = req.body || {};
    if (!id || !['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'Invalid request.' });
    const patch = action === 'approve' ? { status: 'active', started_at: new Date().toISOString(), updated_at: new Date().toISOString() } : { status: 'rejected', updated_at: new Date().toISOString() };
    const response = await fetch(`${base}/rest/v1/subscriptions?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(patch) });
    if (!response.ok) return res.status(500).json({ error: 'Could not update subscription.' });
    return res.status(200).json({ ok: true, subscription: (await response.json())[0] || null });
  } catch (error) { console.error(error); return res.status(500).json({ error: 'Could not update subscription.' }); }
}
function readBearer(value) { const text = String(value || ''); return text.startsWith('Bearer ') ? text.slice(7).trim() : null; }
function readCookie(header, name) { for (const part of String(header || '').split(';')) { const i = part.indexOf('='); if (i >= 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim()); } return null; }
