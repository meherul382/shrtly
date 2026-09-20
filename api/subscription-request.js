const PLANS = {
  three_day: { price: 150, durationDays: 3 },
  weekly: { price: 350, durationDays: 7 },
  monthly: { price: 900, durationDays: 30 }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const base = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const token = readBearer(req.headers.authorization) || readCookie(req.headers.cookie, 'shrtigo_session');
  if (!base || !key) return res.status(500).json({ error: 'Shrtigo backend is not configured.' });
  if (!token) return res.status(401).json({ error: 'Login required.' });

  const { plan, paymentMethod, transactionId } = req.body || {};
  const selected = PLANS[String(plan || '')];
  if (!selected) return res.status(400).json({ error: 'Choose a valid subscription plan.' });
  if (!['bkash', 'nagad', 'manual'].includes(String(paymentMethod || ''))) return res.status(400).json({ error: 'Choose bKash or Nagad.' });
  if (!/^[A-Za-z0-9._-]{4,80}$/.test(String(transactionId || '').trim())) return res.status(400).json({ error: 'Enter a valid transaction ID.' });

  try {
    const userResponse = await fetch(`${base}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: key } });
    if (!userResponse.ok) return res.status(401).json({ error: 'Login required.' });
    const user = await userResponse.json();
    const payload = {
      user_id: user.id,
      plan,
      status: 'pending',
      payment_method: paymentMethod,
      transaction_id: String(transactionId).trim()
    };
    const response = await fetch(`${base}/rest/v1/subscriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) return res.status(500).json({ error: 'Could not submit subscription request.' });
    const result = await response.json();
    return res.status(201).json({ request: result[0] || payload, amount: selected.price, durationDays: selected.durationDays });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Could not submit subscription request.' });
  }
}

function readBearer(value) { const text = String(value || ''); return text.startsWith('Bearer ') ? text.slice(7).trim() : null; }
function readCookie(header, name) { for (const part of String(header || '').split(';')) { const i = part.indexOf('='); if (i >= 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim()); } return null; }
