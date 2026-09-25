const ADMIN_EMAIL = 'meherulhassan62@gmail.com';
const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qbijrkdlaguwlvriaiky.supabase.co').trim();
const PUBLIC_KEY = String(
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_CS7wauVRlHpbsdjJFdWl1g_cNdjogHJ'
).trim();

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify(body));
}

function tokenFrom(req) {
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

async function callRpc(name, token, body) {
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: PUBLIC_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body || {})
  });
}

async function requireAdmin(req) {
  const token = tokenFrom(req);
  if (!token) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: PUBLIC_KEY, Authorization: `Bearer ${token}` }
  });
  if (!r.ok) return null;
  const user = await r.json();
  if (!user?.id || String(user.email || '').toLowerCase() !== ADMIN_EMAIL) return null;
  return { token };
}

module.exports = async (req, res) => {
  if (!['GET', 'PATCH'].includes(req.method)) return json(res, 405, { error: 'Method not allowed' });

  try {
    const admin = await requireAdmin(req);
    if (!admin) return json(res, 403, { error: 'Admin access required.' });

    if (req.method === 'GET') {
      const r = await callRpc('shrtigo_admin_list_subscriptions', admin.token, {});
      const raw = await r.text();
      if (!r.ok) {
        let d = {};
        try { d = JSON.parse(raw); } catch {}
        return json(res, r.status, { error: d.message || d.hint || 'Could not load subscription requests.' });
      }
      let requests = [];
      try { requests = JSON.parse(raw); } catch {}
      return json(res, 200, { requests: Array.isArray(requests) ? requests : [] });
    }

    let body = req.body || {};
    if (typeof body === 'string') body = JSON.parse(body || '{}');
    const id = String(body.id || '').trim();
    const action = String(body.action || '').trim().toLowerCase();
    if (!id || !['approve', 'reject'].includes(action)) return json(res, 400, { error: 'Invalid request.' });

    const r = await callRpc('shrtigo_admin_update_subscription', admin.token, {
      p_id: id,
      p_action: action
    });
    const raw = await r.text();
    let data = null;
    try { data = JSON.parse(raw); } catch {}

    if (!r.ok) return json(res, r.status, { error: data?.message || data?.hint || 'Could not update subscription request.' });
    return json(res, 200, { ok: true, request: data });
  } catch (error) {
    console.error('Admin subscription API error:', error);
    return json(res, 500, { error: error.message || 'Unexpected server error.' });
  }
};
