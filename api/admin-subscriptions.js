const ADMIN_EMAIL = 'meherulhassan62@gmail.com';
const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qbijrkdlaguwlvriaiky.supabase.co').trim();
const PUBLIC_KEY = String(
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_CS7wauVRlHpbsdjJFdWl1g_cNdjogHJ'
).trim();
const SERVICE_KEY = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  ''
).trim();

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify(body));
}

function tokenFrom(req) {
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

async function supabaseFetch(path, options = {}, key = SERVICE_KEY || PUBLIC_KEY) {
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  const response = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { response, data };
}

async function requireAdmin(req) {
  const token = tokenFrom(req);
  if (!token || !SUPABASE_URL || !PUBLIC_KEY) return null;

  const authResult = await supabaseFetch('/auth/v1/user', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, apikey: PUBLIC_KEY }
  }, PUBLIC_KEY);

  const user = authResult.data;
  const email = String(user?.email || '').toLowerCase();
  if (!authResult.response.ok || !user?.id || email !== ADMIN_EMAIL) return null;

  return { user, serviceConfigured: Boolean(SERVICE_KEY), token };
}

module.exports = async (req, res) => {
  if (!['GET', 'PATCH'].includes(req.method)) {
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    const admin = await requireAdmin(req);
    if (!admin) return json(res, 403, { error: 'Admin access required.' });

    if (req.method === 'GET') {
      const result = await supabaseFetch(
        '/rest/v1/subscriptions?select=*&order=created_at.desc',
        { method: 'GET' },
        SERVICE_KEY || PUBLIC_KEY
      );

      if (!result.response.ok) {
        console.error('Admin subscription load failed:', result.data);
        return json(res, 500, {
          error: admin.serviceConfigured
            ? (result.data?.message || result.data?.hint || 'Could not load subscription requests.')
            : 'SUPABASE_SERVICE_ROLE_KEY is missing in Vercel Environment Variables. Add it, then redeploy.'
        });
      }
      return json(res, 200, { requests: Array.isArray(result.data) ? result.data : [] });
    }

    let body = req.body || {};
    if (typeof body === 'string') body = JSON.parse(body || '{}');
    const id = String(body.id || '').trim();
    const action = String(body.action || '').trim().toLowerCase();
    if (!id || !['approve', 'reject'].includes(action)) {
      return json(res, 400, { error: 'Invalid request.' });
    }

    const existingResult = await supabaseFetch(
      `/rest/v1/subscriptions?select=id,plan,status&id=eq.${encodeURIComponent(id)}&limit=1`,
      { method: 'GET' },
      SERVICE_KEY || PUBLIC_KEY
    );
    const existing = Array.isArray(existingResult.data) ? existingResult.data[0] : null;

    if (!existingResult.response.ok || !existing) {
      return json(res, 404, { error: existingResult.data?.message || 'Subscription request not found.' });
    }

    const durationDays = existing.plan === 'three_day' ? 3 : existing.plan === 'weekly' ? 7 : existing.plan === 'half_month' ? 15 : existing.plan === 'quarterly' ? 90 : existing.plan === 'welcome' ? 30 : existing.plan === 'starter' || existing.plan === 'growth' || existing.plan === 'pro' || existing.plan === 'business' || existing.plan === 'enterprise' ? 30 : 30;
    const now = new Date();
    const patch = action === 'approve'
      ? {
          status: 'active',
          started_at: now.toISOString(),
          ends_at: new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString(),
          updated_at: now.toISOString()
        }
      : { status: 'rejected', updated_at: now.toISOString() };

    const updateResult = await supabaseFetch(
      `/rest/v1/subscriptions?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(patch)
      },
      SERVICE_KEY || PUBLIC_KEY
    );
    const updated = Array.isArray(updateResult.data) ? updateResult.data[0] : null;

    if (!updateResult.response.ok || !updated) {
      console.error('Admin subscription update failed:', updateResult.data);
      return json(res, 500, { error: updateResult.data?.message || 'Could not update subscription request.' });
    }

    return json(res, 200, { ok: true, request: updated });
  } catch (error) {
    console.error('Admin subscription API error:', error);
    return json(res, 500, { error: error.message || 'Unexpected server error.' });
  }
};
