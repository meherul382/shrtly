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
    const supportedDomains = ['shrtigo.xyz','shrtigo.shop','shrtigo.online','shrtigo.site','shrtigopro.site','shrtigo.world','shrtigo.store','shrtigourl.site','shrtigo.website','shrtigo.com'];
    const domainLimits = { welcome:1, starter:2, growth:3, pro:4, business:5, enterprise:6, weekly:7, half_month:9, monthly:9, quarterly:9 };
    const unlimitedPlans = new Set(['weekly','half_month','monthly','quarterly']);
    let selected_domains = Array.isArray(body.selected_domains) ? [...new Set(body.selected_domains.map(String).map(x=>x.trim()).filter(Boolean))] : [];
    if (unlimitedPlans.has(plan)) selected_domains = supportedDomains.slice();
    else {
      const limit = domainLimits[plan] || 1;
      if (!selected_domains.length) return json(res, 400, { error: 'Please select your domains before submitting the plan.' });
      if (selected_domains.some(d=>!supportedDomains.includes(d))) return json(res, 400, { error: 'One or more selected domains are not supported.' });
      if (selected_domains.length > limit) return json(res, 400, { error: `This plan allows up to ${limit} domain${limit===1?'':'s'}.` });
    }

    if (!plan) return json(res, 400, { error: 'Please select a valid subscription plan.' });
    if (!payment_method) return json(res, 400, { error: 'Please select a valid payment method.' });
    if (plan !== 'welcome' && !transaction_id) return json(res, 400, { error: 'Please enter the transaction ID.' });
    if (transaction_id.length > 120) return json(res, 400, { error: 'Transaction ID is too long.' });

    if (plan === 'welcome') {
      const existing = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions?select=id&user_id=eq.${encodeURIComponent(user.id)}&plan=eq.welcome&limit=1`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` } });
      const rows = existing.ok ? await existing.json() : [];
      if (rows.length) return json(res, 409, { error: 'Welcome Gift has already been claimed.' });
    }

    const insertResponse = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(plan === 'welcome' ? { user_id: user.id, plan, status: 'active', started_at: new Date().toISOString(), ends_at: new Date(Date.now()+30*24*60*60*1000).toISOString(), payment_method: null, transaction_id: null, click_limit: 500, clicks_used: 0, selected_domains } : { user_id: user.id, plan, status: 'pending', payment_method, transaction_id, selected_domains })
    });

    if (insertResponse.ok) {
      if (plan === 'welcome') {
        await fetch(SUPABASE_URL + '/rest/v1/user_domain_settings?on_conflict=user_id', {
          method: 'POST',
          headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ user_id: user.id, selected_domains, selection_plan: plan, updated_at: new Date().toISOString() })
        });
      }
      return json(res, 200, { ok: true, message: plan === 'welcome' ? 'Welcome Gift activated: 500 free clicks.' : 'Subscription request submitted for admin approval.', selected_domains });
    }

    const raw = await insertResponse.text();
    if (plan === 'welcome' && (insertResponse.status === 409 || raw.includes('subscriptions_one_welcome_per_user_idx'))) return json(res, 409, { error: 'Welcome Gift has already been claimed for this account.' });
    let details = raw;
    try { details = JSON.parse(raw); } catch (_) {}
    console.error('Supabase subscription insert failed:', insertResponse.status, details);
    return json(res, 500, { error: details?.message || details?.hint || 'Subscription request could not be saved. Please try again.' });
  } catch (error) {
    console.error('Subscription request error:', error);
    return json(res, 500, { error: 'Server error while submitting request.' });
  }
};
