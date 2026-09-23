const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qbijrkdlaguwlvriaiky.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_CS7wauVRlHpbsdjJFdWl1g_cNdjogHJ';

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify(body));
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const authorization = String(req.headers.authorization || '');
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!token) return json(res, 401, { error: 'Please log in first.' });

    const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` }
    });
    const user = await userResponse.json();
    if (!userResponse.ok || !user?.id) return json(res, 401, { error: 'Your login session is invalid or expired.' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const planMap = { '3-days': 'three_day', '3_days': 'three_day', 'three-day': 'three_day', 'three_day': 'three_day', 'three-days': 'three_day', weekly: 'weekly', monthly: 'monthly', starter: 'starter', growth: 'growth', pro: 'pro', business: 'business', enterprise: 'enterprise', 'half-month': 'half_month', half_month: 'half_month', quarterly: 'quarterly', welcome: 'welcome' };
    const methodMap = { bkash: 'bkash', 'b-kash': 'bkash', nagad: 'nagad', binance: 'binance', manual: 'manual' };
    const plan = planMap[String(body.plan || '').trim().toLowerCase()];
    const payment_method = methodMap[String(body.payment_method || '').trim().toLowerCase()];
    const transaction_id = String(body.transaction_id || '').trim();

    if (!plan) return json(res, 400, { error: 'Please select a valid subscription plan.' });
    if (!payment_method) return json(res, 400, { error: 'Please select a valid payment method.' });
    if (!transaction_id) return json(res, 400, { error: 'Please enter the transaction ID.' });
    if (transaction_id.length > 120) return json(res, 400, { error: 'Transaction ID is too long.' });

    const insertResponse = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: user.id, plan, status: 'pending', payment_method, transaction_id })
    });

    if (insertResponse.ok) return json(res, 200, { ok: true, message: 'Subscription request submitted for admin approval.' });

    const raw = await insertResponse.text();
    let details = raw;
    try { details = JSON.parse(raw); } catch (_) {}
    console.error('Supabase subscription insert failed:', insertResponse.status, details);
    return json(res, 500, { error: details?.message || details?.hint || 'Subscription request could not be saved. Please try again.' });
  } catch (error) {
    console.error('Subscription request error:', error);
    return json(res, 500, { error: 'Server error while submitting request.' });
  }
};
