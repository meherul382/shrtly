const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qbijrkdlaguwlvriaiky.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_CS7wauVRlHpbsdjJFdWl1g_cNdjogHJ';

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify(body));
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (!supabaseUrl) return json(res, 500, { error: 'Supabase URL is not configured.' });

  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return json(res, 401, { error: 'Please log in first.' });

  const key = serviceKey || publicKey;
  const sb = createClient(supabaseUrl, key, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data: userData, error: userError } = await sb.auth.getUser(token);
  if (userError || !userData?.user) return json(res, 401, { error: 'Your login session is invalid or expired.' });

  const body = req.body || {};
  const requestedPlan = String(body.plan || '').trim().toLowerCase();
  const requestedMethod = String(body.payment_method || '').trim().toLowerCase();
  const transactionId = String(body.transaction_id || '').trim();

  const planMap = {
    '3-days': 'three_day',
    '3_days': 'three_day',
    'three-day': 'three_day',
    'three_day': 'three_day',
    'three-days': 'three_day',
    weekly: 'weekly',
    monthly: 'monthly'
  };
  const paymentMap = {
    bkash: 'bkash',
    'b-kash': 'bkash',
    nagad: 'nagad',
    binance: 'binance',
    manual: 'manual'
  };

  const plan = planMap[requestedPlan];
  const paymentMethod = paymentMap[requestedMethod];

  if (!plan) return json(res, 400, { error: 'Please select a valid subscription plan.' });
  if (!paymentMethod) return json(res, 400, { error: 'Please select a valid payment method.' });
  if (!transactionId) return json(res, 400, { error: 'Please enter the transaction ID.' });
  if (transactionId.length > 120) return json(res, 400, { error: 'Transaction ID is too long.' });

  const { error } = await sb.from('subscriptions').insert({
    user_id: userData.user.id,
    plan,
    status: 'pending',
    payment_method: paymentMethod,
    transaction_id: transactionId
  });

  if (error) {
    console.error('Subscription request insert failed:', error);
    return json(res, 500, { error: `Could not submit your subscription request: ${error.message}` });
  }

  return json(res, 200, { ok: true, message: 'Subscription request submitted for admin approval.' });
};
