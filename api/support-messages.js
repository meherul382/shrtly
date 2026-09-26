const ADMIN_EMAIL = 'meherulhassan62@gmail.com';
const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qbijrkdlaguwlvriaiky.supabase.co').trim().replace(/\/$/, '');
const PUBLIC_KEY = String(process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_CS7wauVRlHpbsdjJFdWl1g_cNdjogHJ').trim();
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify(body));
}
function tokenFrom(req) {
  const value = String(req.headers.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}
async function supabaseFetch(path, options = {}) {
  if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing in Vercel Environment Variables.');
  return fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
}
async function authenticate(req) {
  const token = tokenFrom(req);
  if (!token) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: PUBLIC_KEY, Authorization: `Bearer ${token}` } });
  if (!response.ok) return null;
  const user = await response.json();
  return user?.id ? { id: user.id, email: String(user.email || '').toLowerCase(), isAdmin: String(user.email || '').toLowerCase() === ADMIN_EMAIL } : null;
}
module.exports = async (req, res) => {
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'Method not allowed.' });
  try {
    const actor = await authenticate(req);
    if (!actor) return json(res, 401, { error: 'Please log in to use support chat.' });

    if (req.method === 'GET') {
      const requestedUser = String(req.query?.user_id || '').trim();
      if (actor.isAdmin) {
        const path = requestedUser
          ? `/rest/v1/support_messages?select=*&user_id=eq.${encodeURIComponent(requestedUser)}&order=created_at.asc&limit=500`
          : '/rest/v1/support_messages?select=*&order=created_at.desc&limit=1000';
        const response = await supabaseFetch(path);
        const data = await response.json();
        if (!response.ok) return json(res, 500, { error: data?.message || 'Could not load support messages.' });
        return json(res, 200, { messages: Array.isArray(data) ? data : [] });
      }
      const response = await supabaseFetch(`/rest/v1/support_messages?select=*&user_id=eq.${encodeURIComponent(actor.id)}&order=created_at.asc&limit=500`);
      const data = await response.json();
      if (!response.ok) return json(res, 500, { error: data?.message || 'Could not load support messages.' });
      const unreadResponse = await supabaseFetch(`/rest/v1/support_messages?select=id&user_id=eq.${encodeURIComponent(actor.id)}&sender_role=eq.admin&read_at=is.null&limit=1000`);
      const unreadData = await unreadResponse.json();
      return json(res, 200, {
        messages: Array.isArray(data) ? data : [],
        unread_count: unreadResponse.ok && Array.isArray(unreadData) ? unreadData.length : 0
      });
    }

    let body = req.body || {};
    if (typeof body === 'string') body = JSON.parse(body || '{}');

    if (!actor.isAdmin && body.mark_read === true) {
      const markResponse = await supabaseFetch(`/rest/v1/support_messages?user_id=eq.${encodeURIComponent(actor.id)}&sender_role=eq.admin&read_at=is.null`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ read_at: new Date().toISOString() })
      });
      if (!markResponse.ok) {
        const markData = await markResponse.json().catch(() => ({}));
        return json(res, 500, { error: markData?.message || 'Could not mark support messages as read.' });
      }
      return json(res, 200, { marked_read: true });
    }

    const message = String(body.message || '').trim();
    if (!message || message.length > 2000) return json(res, 400, { error: 'Message must be between 1 and 2000 characters.' });
    if (actor.isAdmin && body.broadcast === true) {
      const broadcastResponse = await supabaseFetch('/rest/v1/rpc/shrtigo_admin_broadcast_support', {
        method: 'POST',
        body: JSON.stringify({ p_admin_email: actor.email, p_message: message })
      });
      const broadcastData = await broadcastResponse.json();
      if (!broadcastResponse.ok) return json(res, 500, { error: broadcastData?.message || broadcastData?.hint || 'Could not broadcast support message.' });
      return json(res, 201, { broadcast: true, sent_count: Number(broadcastData) || 0 });
    }

    const targetUser = actor.isAdmin ? String(body.user_id || '').trim() : actor.id;
    const senderRole = actor.isAdmin ? 'admin' : 'user';
    if (!targetUser) return json(res, 400, { error: 'Select a user before replying.' });
    const response = await supabaseFetch('/rest/v1/support_messages', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: targetUser, sender_role: senderRole, message })
    });
    const data = await response.json();
    if (!response.ok) return json(res, 500, { error: data?.message || 'Could not send message.' });
    return json(res, 201, { message: Array.isArray(data) ? data[0] : data });
  } catch (error) {
    console.error('Support chat API error:', error);
    return json(res, 500, { error: error.message || 'Unexpected server error.' });
  }
};
