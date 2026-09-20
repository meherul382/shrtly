export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const base = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const token = readBearer(req.headers.authorization) || readCookie(req.headers.cookie, 'shrtigo_session');
  if (!base || !key) return res.status(500).json({ error: 'Shrtigo backend is not configured.' });
  if (!token) return res.status(401).json({ error: 'Login required.' });

  try {
    const userResponse = await fetch(`${base}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: key } });
    if (!userResponse.ok) return res.status(401).json({ error: 'Login required.' });
    const user = await userResponse.json();
    const query = `${base}/rest/v1/subscriptions?select=id,plan,status,started_at,ends_at,payment_method,transaction_id,created_at&user_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc&limit=20`;
    const response = await fetch(query, { headers: { Authorization: `Bearer ${key}`, apikey: key } });
    if (!response.ok) return res.status(500).json({ error: 'Could not load subscription status.' });
    const subscriptions = await response.json();
    const now = Date.now();
    const active = subscriptions.find(item => item.status === 'active' && (!item.ends_at || new Date(item.ends_at).getTime() > now)) || null;
    return res.status(200).json({ user: { id: user.id, email: user.email || '' }, active, subscriptions });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Could not load subscription status.' });
  }
}

function readBearer(value) { const text = String(value || ''); return text.startsWith('Bearer ') ? text.slice(7).trim() : null; }
function readCookie(header, name) { for (const part of String(header || '').split(';')) { const i = part.indexOf('='); if (i >= 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim()); } return null; }
