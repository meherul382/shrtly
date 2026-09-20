const PLANS = {
  three_day: { durationDays: 3 },
  weekly: { durationDays: 7 },
  monthly: { durationDays: 30 }
};

export default async function handler(req, res) {
  const base = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const token = readBearer(req.headers.authorization) || readCookie(req.headers.cookie, 'shrtigo_session');
  if (!base || !serviceKey || !adminEmail) return res.status(500).json({ error: 'Admin backend is not configured. Set ADMIN_EMAIL.' });
  if (!token) return res.status(401).json({ error: 'Login required.' });

  try {
    const userResponse = await fetch(`${base}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: serviceKey } });
    if (!userResponse.ok) return res.status(401).json({ error: 'Login required.' });
    const user = await userResponse.json();
    if (String(user.email || '').toLowerCase() !== adminEmail) return res.status(403).json({ error: 'Admin access denied.' });

    if (req.method === 'GET') {
      const response = await rest(base, serviceKey, '/subscriptions?select=*&order=created_at.desc');
      if (!response.ok) return res.status(500).json({ error: 'Could not load subscription requests.' });
      return res.status(200).json({ requests: await response.json() });
    }

    if (req.method === 'PATCH') {
      const body = req.body || {};
      const id = String(body.id || '').trim();
      const status = String(body.status || '').trim().toLowerCase();
      if (!id || !['active', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid request.' });

      const existingResponse = await rest(base, serviceKey, `/subscriptions?id=eq.${encodeURIComponent(id)}&select=*`);
      if (!existingResponse.ok) return res.status(500).json({ error: 'Could not read subscription request.' });
      const existing = await existingResponse.json();
      const item = existing[0];
      if (!item) return res.status(404).json({ error: 'Subscription request not found.' });

      const patch = { status, updated_at: new Date().toISOString() };
      if (status === 'active') {
        const plan = PLANS[item.plan];
        if (!plan) return res.status(400).json({ error: 'Unsupported plan.' });
        const start = new Date();
        const end = new Date(start.getTime() + plan.durationDays * 86400000);
        patch.started_at = start.toISOString();
        patch.ends_at = end.toISOString();
      } else {
        patch.started_at = null;
        patch.ends_at = null;
      }

      const updateResponse = await rest(base, serviceKey, `/subscriptions?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch), prefer: 'return=representation' });
      if (!updateResponse.ok) return res.status(500).json({ error: 'Could not update subscription request.' });
      const updated = await updateResponse.json();
      return res.status(200).json({ subscription: updated[0] || { ...item, ...patch } });
    }

    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Admin request failed.' });
  }
}

function rest(base, key, path, options = {}) {
  const headers = { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' };
  if (options.prefer) headers.Prefer = options.prefer;
  return fetch(`${base}/rest/v1${path}`, { ...options, headers });
}
function readBearer(value) { const text = String(value || ''); return text.startsWith('Bearer ') ? text.slice(7).trim() : null; }
function readCookie(header, name) { for (const part of String(header || '').split(';')) { const i = part.indexOf('='); if (i >= 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim()); } return null; }
