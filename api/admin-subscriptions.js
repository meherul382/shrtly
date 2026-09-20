const { createClient } = require('@supabase/supabase-js');

const ADMIN_EMAIL = 'meherulhassan62@gmail.com';
const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qbijrkdlaguwlvriaiky.supabase.co').trim();
const SUPABASE_KEY = String(
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

async function requireAdmin(req) {
  const token = tokenFrom(req);
  if (!token || !SUPABASE_URL || !SUPABASE_KEY) return null;

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data, error } = await sb.auth.getUser(token);
  const email = String(data?.user?.email || '').toLowerCase();
  if (error || !data?.user || email !== ADMIN_EMAIL) return null;
  return { sb, user: data.user };
}

module.exports = async (req, res) => {
  if (!['GET', 'PATCH'].includes(req.method)) {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const admin = await requireAdmin(req);
  if (!admin) return json(res, 403, { error: 'Admin access required.' });

  if (req.method === 'GET') {
    const { data, error } = await admin.sb
      .from('subscriptions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Admin subscription load failed:', error);
      return json(res, 500, { error: error.message || 'Could not load subscription requests.' });
    }
    return json(res, 200, { requests: data || [] });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const id = String(body.id || '').trim();
  const action = String(body.action || '').trim().toLowerCase();
  if (!id || !['approve', 'reject'].includes(action)) {
    return json(res, 400, { error: 'Invalid request.' });
  }

  const { data: existing, error: existingError } = await admin.sb
    .from('subscriptions')
    .select('id,plan,status')
    .eq('id', id)
    .single();

  if (existingError || !existing) {
    return json(res, 404, { error: existingError?.message || 'Subscription request not found.' });
  }

  const durationDays = existing.plan === 'three_day' ? 3 : existing.plan === 'weekly' ? 7 : 30;
  const patch = action === 'approve'
    ? {
        status: 'active',
        started_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString()
      }
    : { status: 'rejected', updated_at: new Date().toISOString() };

  const { data, error } = await admin.sb
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
};
