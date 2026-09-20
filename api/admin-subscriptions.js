const { createClient } = require('@supabase/supabase-js');

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

async function requireAdmin(req) {
  const token = tokenFrom(req);
  if (!token || !SUPABASE_URL || !PUBLIC_KEY) return null;

  const authClient = createClient(SUPABASE_URL, PUBLIC_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data, error } = await authClient.auth.getUser(token);
  const email = String(data?.user?.email || '').toLowerCase();
  if (error || !data?.user || email !== ADMIN_EMAIL) return null;

  const dbClient = createClient(SUPABASE_URL, SERVICE_KEY || PUBLIC_KEY, {
    auth: { persistSession: false },
    global: SERVICE_KEY ? {} : { headers: { Authorization: `Bearer ${token}` } }
  });

  return { db: dbClient, user: data.user, serviceConfigured: Boolean(SERVICE_KEY) };
}

module.exports = async (req, res) => {
  if (!['GET', 'PATCH'].includes(req.method)) {
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    const admin = await requireAdmin(req);
    if (!admin) return json(res, 403, { error: 'Admin access required.' });

    if (req.method === 'GET') {
      const { data, error } = await admin.db
        .from('subscriptions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Admin subscription load failed:', error);
        return json(res, 500, {
          error: admin.serviceConfigured
            ? (error.message || 'Could not load subscription requests.')
            : 'SUPABASE_SERVICE_ROLE_KEY is missing in Vercel Environment Variables. Add it, then redeploy.'
        });
      }
      return json(res, 200, { requests: data || [] });
    }

    let body = req.body || {};
    if (typeof body === 'string') body = JSON.parse(body || '{}');
    const id = String(body.id || '').trim();
    const action = String(body.action || '').trim().toLowerCase();
    if (!id || !['approve', 'reject'].includes(action)) {
      return json(res, 400, { error: 'Invalid request.' });
    }

    const { data: existing, error: existingError } = await admin.db
      .from('subscriptions')
      .select('id,plan,status')
      .eq('id', id)
      .single();

    if (existingError || !existing) {
      return json(res, 404, { error: existingError?.message || 'Subscription request not found.' });
    }

    const durationDays = existing.plan === 'three_day' ? 3 : existing.plan === 'weekly' ? 7 : 30;
    const now = new Date();
    const patch = action === 'approve'
      ? {
          status: 'active',
          started_at: now.toISOString(),
          ends_at: new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString(),
          updated_at: now.toISOString()
        }
      : { status: 'rejected', updated_at: now.toISOString() };

    const { data, error } = await admin.db
      .from('subscriptions')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('Admin subscription update failed:', error);
      return json(res, 500, { error: error.message || 'Could not update subscription request.' });
    }

    return json(res, 200, { ok: true, request: data });
  } catch (error) {
    console.error('Admin subscription API error:', error);
    return json(res, 500, { error: error.message || 'Unexpected server error.' });
  }
};
