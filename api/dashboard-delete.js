export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const base = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!base || !key) return res.status(500).json({ error: 'Shrtigo backend is not configured.' });
  try {
    const user = await getUser(req, base, key);
    if (!user) return res.status(401).json({ error: 'Login required.' });
    const code = String(req.body?.code || '').trim();
    if (!code) return res.status(400).json({ error: 'Missing link code.' });
    const r = await fetch(`${base}/rest/v1/links?code=eq.${encodeURIComponent(code)}&user_id=eq.${encodeURIComponent(user.id)}`, {
      method:'DELETE', headers:{ Authorization:`Bearer ${key}`, apikey:key, Prefer:'return=representation' }
    });
    if (!r.ok) return res.status(500).json({ error:'Could not delete this link.' });
    const deleted = await r.json();
    if (!deleted.length) return res.status(404).json({ error:'Link not found in your dashboard.' });
    return res.status(200).json({ ok:true, code });
  } catch(e) { console.error(e); return res.status(500).json({ error:'Could not delete this link.' }); }
}
async function getUser(req, base, key) {
  const token = readCookie(req.headers.cookie,'shrtigo_session');
  if (!token) return null;
  const r = await fetch(`${base}/auth/v1/user`, { headers:{Authorization:`Bearer ${token}`,apikey:key} });
  return r.ok ? await r.json() : null;
}
function readCookie(header,name){for(const part of String(header||'').split(';')){const i=part.indexOf('=');if(i>=0&&part.slice(0,i).trim()===name)return decodeURIComponent(part.slice(i+1).trim())}return null}
