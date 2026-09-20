const { createClient } = require('@supabase/supabase-js');

const ADMIN_EMAIL = 'meherulhassan62@gmail.com';
const supabaseUrl = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

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
  if (!token || !supabaseUrl || !serviceKey) return null;
  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.getUser(token);
  const email = String(data?.user?.email || '').toLowerCase();
  if (error || !data?.user || email !== ADMIN_EMAIL) return null;
  return { sb, user: data.user };
}

module.exports = async (req, res) => {
  if (!['GET', 'PATCH'].includes(req.method)) return json(res, 405, { error: 'Method not allowed' });
  if (!supabaseUrl || !serviceKey) return json(res, 500, { error: 'Server configuration is incomplete.' });

  const admin = await requireAdmin(req);
  if (!admin) return json(res, 403, { error: 'Admin access required.' });

  if (req.method === 'GET') {
    const { data, error } = await admin.sb.from('subscriptions').select('*').order('created_at', { ascending: false });
    if (error) return json(res, 500, { error: 'Could not load subscription requests.' });
    return json(res, 200, { requests: data || [] });
  }

  const id = String(req.body?.id || '').trim();
  const action = String(req.body?.action || '').trim().toLowerCase();
  if (!id || !['approve', 'reject'].includes(action)) return json(res, 400, { error: 'Invalid request.' });

  const patch = action === 'approve'
    ? { status: 'active', expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() }
    : { status: 'rejected' };

  const { data, error } = await admin.sb.from('subscriptions').update(patch).eq('id', id).select('*').single();
  if (error) return json(res, 500, { error: 'Could not update subscription request.' });
  return json(res, 200, { ok: true, request: data });
};
