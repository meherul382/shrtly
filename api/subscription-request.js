const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify(body));
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (!supabaseUrl || !serviceKey) return json(res, 500, { error: 'Server configuration is incomplete.' });

  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return json(res, 401, { error: 'Please log in first.' });

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await sb.auth.getUser(token);
  if (userError || !userData?.user) return json(res, 401, { error: 'Your login session is invalid or expired.' });

  const body = req.body || {};
  const plan = String(body.plan || '').trim();
  const paymentMethod = String(body.payment_method || '').trim();
  const transactionId = String(body.transaction_id || '').trim();
  const plans = {
    '3-days': { amount: 150 },
    weekly: { amount: 350 },
    monthly: { amount: 900 }
  };

  if (!plans[plan]) return json(res, 400, { error: 'Please select a valid subscription plan.' });
  if (!paymentMethod || !transactionId) return json(res, 400, { error: 'Payment method and transaction ID are required.' });
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
    return json(res, 500, { error: 'Could not submit your subscription request.' });
  }
  return json(res, 200, { ok: true, message: 'Subscription request submitted for admin approval.' });
};
