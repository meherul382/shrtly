const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qbijrkdlaguwlvriaiky.supabase.co';
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();

const SUPPORTED_DOMAINS = [
  'shrtigo.xyz',
  'shrtigo.shop',
  'shrtigo.online',
  'shrtigo.site',
  'shrtigopro.site',
  'shrtigo.world',
  'shrtigo.store',
  'shrtigourl.site',
  'shrtigo.website',
  'shrtigo.com'
];

const PLAN_DOMAIN_LIMITS = {
  welcome: 1,
  starter: 2,
  growth: 3,
  pro: 4,
  business: 5,
  enterprise: 6,
  weekly: 7,
  half_month: SUPPORTED_DOMAINS.length,
  // Plans not specified in the requested domain ladder keep the safe default.
  monthly: SUPPORTED_DOMAINS.length,
  quarterly: SUPPORTED_DOMAINS.length,
  three_day: 1
};

// All supported Shrtigo domains are available on every plan.
function domainsForPlan(plan) {
  return SUPPORTED_DOMAINS;
}

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify(body));
}

function readBearer(req) {
  const value = String(req.headers.authorization || '');
  return value.replace(/^Bearer\s+/i, '').trim();
}

async function getUserId(token) {
  if (!token || !SERVICE_KEY) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` }
    });
    if (!r.ok) return null;
    return (await r.json())?.id || null;
  } catch {
    return null;
  }
}

async function dbFetch(path, options = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      ...(options.headers || {})
    }
  });
}

async function getActivePlan(userId) {
  const r = await dbFetch(`subscriptions?select=plan,status,ends_at&user_id=eq.${encodeURIComponent(userId)}&status=eq.active&ends_at=gt.${encodeURIComponent(new Date().toISOString())}&order=ends_at.desc&limit=1`);
  if (!r.ok) return 'welcome';
  const rows = await r.json();
  return String(rows?.[0]?.plan || 'welcome').toLowerCase();
}

function domainLimit(plan) {
  return Math.max(1, Math.min(SUPPORTED_DOMAINS.length, Number(PLAN_DOMAIN_LIMITS[plan] || 1)));
}

async function getSavedSelection(userId) {
  const r = await dbFetch(`user_domain_settings?select=selected_domains,selection_plan&user_id=eq.${encodeURIComponent(userId)}&limit=1`);
  if (!r.ok) return null;
  const rows = await r.json();
  if (!rows?.length) return null;
  return {
    selectedDomains: Array.isArray(rows[0]?.selected_domains) ? rows[0].selected_domains : [],
    selectionPlan: String(rows[0]?.selection_plan || '').toLowerCase()
  };
}

async function seedSelection(userId, max) {
  const used = await dbFetch(`links?select=domain&user_id=eq.${encodeURIComponent(userId)}&deleted_at=is.null&domain=not.is.null`);
  let selected = [];
  if (used.ok) {
    const rows = await used.json();
    selected = [...new Set((rows || []).map(x => String(x.domain || '').toLowerCase()).filter(x => SUPPORTED_DOMAINS.includes(x)))].slice(0, max);
  }
  if (!selected.length) selected = ['shrtigo.xyz'];
  selected = selected.slice(0, max);

  await dbFetch('user_domain_settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: userId, selected_domains: selected })
  });

  return selected;
}

module.exports = async (req, res) => {
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'Method not allowed' });
  if (!SERVICE_KEY) return json(res, 500, { error: 'Shrtigo backend is not configured.' });

  const token = readBearer(req);
  const userId = await getUserId(token);
  if (!userId) return json(res, 401, { error: 'Please log in first.' });

  try {
    const plan = await getActivePlan(userId);
    const maxDomains = domainLimit(plan);
    const availableDomains = domainsForPlan(plan);

    const unlimited = ['weekly', 'half_month', 'monthly', 'quarterly'].includes(plan);

    if (req.method === 'GET') {
      if (unlimited) {
        return json(res, 200, {
          ok: true,
          plan,
          maxDomains: SUPPORTED_DOMAINS.length,
          unlimited: true,
          locked: true,
          selectedDomains: availableDomains,
          availableDomains,
        supportedDomains: SUPPORTED_DOMAINS,
        comAllowed: availableDomains.includes('shrtigo.com'),
          message: 'Unlimited plan includes all Shrtigo domains. No domain selection is required.'
        });
      }

      const saved = await getSavedSelection(userId);
      const cleaned = [...new Set((saved?.selectedDomains || [])
        .filter(d => SUPPORTED_DOMAINS.includes(String(d).toLowerCase()))
        .map(d => String(d).toLowerCase()))];

      return json(res, 200, {
        ok: true,
        plan,
        maxDomains,
        unlimited: false,
        locked: cleaned.length > 0,
        selectionPlan: saved?.selectionPlan || null,
        selectedDomains: cleaned.slice(0, maxDomains),
        availableDomains,
        supportedDomains: SUPPORTED_DOMAINS,
        comAllowed: availableDomains.includes('shrtigo.com'),
        message: cleaned.length > 0
          ? 'Your domain selection is locked for this plan. Change your plan to select different domains.'
          : 'Select your domains and save once. The selection will then be locked for this plan.'
      });
    }

    if (unlimited) {
      return json(res, 200, {
        ok: true,
        message: 'All Shrtigo domains are included with your unlimited plan. No domain selection is required.',
        plan,
        maxDomains: SUPPORTED_DOMAINS.length,
        unlimited: true,
        locked: true,
        selectedDomains: SUPPORTED_DOMAINS,
        availableDomains: SUPPORTED_DOMAINS
      });
    }

    const saved = await getSavedSelection(userId);
    if (saved && saved.selectionPlan === plan && Array.isArray(saved.selectedDomains) && saved.selectedDomains.length > 0) {
      return json(res, 409, {
        error: 'Your domain selection is locked for this active plan. Change your plan to select different domains.',
        locked: true,
        selectedDomains: saved.selectedDomains
      });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const selected = Array.isArray(body.selectedDomains) ? body.selectedDomains : [];
    const cleaned = [...new Set(selected.map(d => String(d || '').trim().toLowerCase()).filter(Boolean))];

    if (!cleaned.length) return json(res, 400, { error: 'Select at least one domain.' });
    if (cleaned.some(d => !availableDomains.includes(d))) return json(res, 400, { error: 'One or more selected domains are not supported.' });
    if (cleaned.length > maxDomains) {
      return json(res, 400, {
        error: `Your ${plan} plan allows up to ${maxDomains} domain${maxDomains === 1 ? '' : 's'}.`,
        maxDomains
      });
    }

    const existing = await dbFetch(`user_domain_settings?select=user_id&user_id=eq.${encodeURIComponent(userId)}&limit=1`);
    const exists = existing.ok && (await existing.json()).length > 0;

    const response = await dbFetch(exists
      ? `user_domain_settings?user_id=eq.${encodeURIComponent(userId)}`
      : 'user_domain_settings', {
        method: exists ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ user_id: userId, selected_domains: cleaned, selection_plan: plan, updated_at: new Date().toISOString() })
      });

    if (!response.ok) return json(res, 500, { error: 'Could not save your domain selection.' });

    return json(res, 200, {
      ok: true,
      message: `${cleaned.length} domain${cleaned.length === 1 ? '' : 's'} selected successfully for your ${plan} plan. You can change the selection anytime.`,
      plan,
      maxDomains,
      selectedDomains: cleaned,
      availableDomains
    });
  } catch (error) {
    console.error('Domain settings error:', error);
    return json(res, 500, { error: 'Could not load or save your domain settings.' });
  }
};