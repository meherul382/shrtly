import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { url, alias, image, youtubeUrl, linkMode, domain } = req.body || {};
    if (!isHttpUrl(url)) return res.status(400).json({ error: 'Please enter a valid http:// or https:// URL.' });
    const selectedDomain = normalizeDomain(domain || 'shrtigo.xyz');
    if (!selectedDomain) return res.status(400).json({ error: 'Please select a valid Shrtigo domain.' });
    if (youtubeUrl && !isYouTubeUrl(youtubeUrl)) return res.status(400).json({ error: 'Please enter a valid YouTube URL.' });

    const mode = ['simple', 'analytics'].includes(linkMode) ? linkMode : 'advanced';
    const supabaseUrl = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
    const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Shrtigo backend is not configured.' });
    if (mode === 'simple' && (image || youtubeUrl || alias)) return res.status(400).json({ error: 'Simple Short Link only accepts the main website URL.' });

    const userId = await getUserIdFromRequest(req, supabaseUrl, serviceKey);
    if (mode === 'analytics' && !userId) return res.status(401).json({ error: 'Please log in to your Shrtigo account before creating an Analytics Short Link.' });

    const ownerToken = userId ? `user:${userId}` : crypto.createHash('sha256').update(`${getClientIp(req)}|${String(req.headers['user-agent'] || '')}`).digest('hex');

    // Fast path: one database RPC replaces the old subscription + domain-settings
    // + link-count round trips. It keeps the same checks but returns them together.
    const preflightResponse = await supabaseFetch(
      `${supabaseUrl}/rest/v1/rpc/shrtigo_preflight`,
      serviceKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_user_id: userId || null, p_owner_token: ownerToken })
      }
    );
    if (!preflightResponse.ok) {
      console.error('Preflight failed:', preflightResponse.status);
      return res.status(500).json({ error: 'Could not verify your Shrtigo plan. Please try again.' });
    }
    const preflight = await preflightResponse.json();
    const selectedDomains = Array.isArray(preflight?.selected_domains)
      ? preflight.selected_domains.map(d => String(d).toLowerCase())
      : [];
    if (userId && !selectedDomains.includes(selectedDomain)) {
      const maxDomains = Number(preflight?.max_domains || 1);
      const unlimited = Boolean(preflight?.unlimited);
      return res.status(403).json({
        error: unlimited
          ? 'All Shrtigo domains are included with your unlimited plan.'
          : `This domain is not selected for your current ${String(preflight?.plan || 'welcome')} plan. Open Domains and select up to ${maxDomains} domain${maxDomains === 1 ? '' : 's'}.`,
        domainLimit: maxDomains,
        selectedDomains
      });
    }

    const limit = Number(preflight?.limit || 1);
    const used = Number(preflight?.used || 0);
    if (limit < 1000000000 && used >= limit) {
      return res.status(402).json({
        error: 'Your link limit has been used. Please choose a subscription to create more links.',
        subscriptionRequired: true,
        subscriptionUrl: '/subscription',
        used,
        limit
      });
    }

    const clean = cleanAlias(alias);
    // Keep normal links compact (4 chars) while preserving the A-prefix
    // required by the existing Analytics endpoint.
    let code =
      mode === 'simple'
        ? randomCode()
        : mode === 'analytics'
          ? (clean ? `A${clean}` : `A${randomCode()}`)
          : (clean || randomCode());
    if (!/^[a-zA-Z0-9_-]{3,24}$/.test(code)) return res.status(400).json({ error: 'Alias must be 3–24 letters, numbers, hyphens or underscores.' });
    let imageUrl = null;
    const aliasCheck = alias
      ? (async () => {
          const exists = await supabaseFetch(`${supabaseUrl}/rest/v1/links?select=id&code=eq.${encodeURIComponent(code)}&domain=eq.${encodeURIComponent(selectedDomain)}&limit=1`, serviceKey);
          if (!exists.ok) throw new Error('Supabase database check failed.');
          if ((await exists.json()).length) {
            const err = new Error('That custom alias is already in use.');
            err.code = 'ALIAS_TAKEN';
            throw err;
          }
        })()
      : Promise.resolve();

    const imageUpload = image
      ? (async () => {
          const parsed = parseDataUrl(image);
          if (!parsed) throw new Error('Invalid image upload.');
          if (parsed.buffer.length > 3 * 1024 * 1024) throw new Error('Image must be 3 MB or smaller.');
          const path = `interstitial/${code}-${Date.now()}.${extension(parsed.mime)}`;
          const upload = await fetch(`${supabaseUrl}/storage/v1/object/short-images/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': parsed.mime, 'x-upsert': 'true' }, body: parsed.buffer });
          if (!upload.ok) throw new Error(`Image upload failed (${upload.status}).`);
          return `${supabaseUrl}/storage/v1/object/public/short-images/${path}`;
        })()
      : Promise.resolve(null);

    try {
      const [, uploadedImageUrl] = await Promise.all([aliasCheck, imageUpload]);
      imageUrl = uploadedImageUrl;
    } catch (e) {
      if (e?.code === 'ALIAS_TAKEN') return res.status(409).json({ error: e.message });
      return res.status(400).json({ error: e.message || 'Could not prepare the short link.' });
    }

    const payload = { code, url, domain: selectedDomain, image_url: imageUrl, youtube_url: youtubeUrl || null, clicks: 0, link_mode: mode, owner_token: ownerToken, user_id: userId || null };
    const insert = await insertLink(supabaseUrl, serviceKey, payload);
    if (!insert.ok) {
      const detail = await insert.text();
      if (insert.status === 409 && !alias) {
        payload.code = randomCode();
        const retry = await insertLink(supabaseUrl, serviceKey, payload);
        if (retry.ok) return respond(res, req, payload.code, imageUrl, youtubeUrl, mode, selectedDomain, ownerToken);
      }
      if (insert.status === 409) return res.status(409).json({ error: 'That short code is already in use.' });
      return res.status(500).json({ error: `Could not save the short link (${insert.status}). ${detail.slice(0, 180)}` });
    }
    return respond(res, req, code, imageUrl, youtubeUrl, mode, selectedDomain, ownerToken);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Could not create the short link. Please try again.' });
  }
}

async function getDomainAccess(supabaseUrl, serviceKey, userId, selectedDomain) {
  const limits = {
    welcome: 1,
    starter: 2,
    growth: 3,
    pro: 4,
    business: 5,
    enterprise: 6,
    weekly: 7,
    half_month: 9,
    monthly: 9,
    quarterly: 9,
    three_day: 1
  };
  try {
    const sub = await supabaseFetch(
      `${supabaseUrl}/rest/v1/subscriptions?select=plan,status,ends_at,started_at&user_id=eq.${encodeURIComponent(userId)}&status=eq.active&ends_at=gt.${encodeURIComponent(new Date().toISOString())}`,
      serviceKey
    );
    let rows = sub.ok ? await sub.json() : [];
    rows.sort((a,b) => {
      const ap = String(a?.plan || '').toLowerCase() !== 'welcome';
      const bp = String(b?.plan || '').toLowerCase() !== 'welcome';
      if (ap !== bp) return ap ? -1 : 1;
      return new Date(b?.started_at || b?.ends_at || 0) - new Date(a?.started_at || a?.ends_at || 0);
    });
    const plan = String(rows?.[0]?.plan || 'welcome').toLowerCase();
    const unlimited = ['weekly','half_month','monthly','quarterly'].includes(plan);
    const maxDomains = unlimited ? 10 : Math.max(1, Math.min(9, Number(limits[plan] || 1)));

    const settings = await supabaseFetch(
      `${supabaseUrl}/rest/v1/user_domain_settings?select=selected_domains,selection_plan&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
      serviceKey
    );
    let selectedDomains = [];
    let selectionPlan = '';
    if (settings.ok) {
      const saved = await settings.json();
      selectionPlan = String(saved?.[0]?.selection_plan || '').toLowerCase();
      selectedDomains = selectionPlan === plan && Array.isArray(saved?.[0]?.selected_domains)
        ? [...new Set(saved[0].selected_domains.map(d => String(d).toLowerCase()).filter(Boolean))]
        : [];
    }

    // Preserve domains an existing account has already used only when this
    // account has no saved selection yet. Never reuse an old-plan selection.
    if (!selectedDomains.length && !selectionPlan) {
      const used = await supabaseFetch(
        `${supabaseUrl}/rest/v1/links?select=domain&user_id=eq.${encodeURIComponent(userId)}&deleted_at=is.null&domain=not.is.null`,
        serviceKey
      );
      if (used.ok) {
        const rows = await used.json();
        selectedDomains = [...new Set((rows || []).map(x => String(x.domain || '').toLowerCase()).filter(Boolean))];
      }
    }

    if (unlimited) selectedDomains = ['shrtigo.xyz','shrtigo.shop','shrtigo.online','shrtigo.site','shrtigopro.site','shrtigo.world','shrtigo.store','shrtigourl.site','shrtigo.website','shrtigo.com'];

    if (!selectedDomains.length) {
      return {
        allowed: false,
        maxDomains,
        selectedDomains: [],
        error: `No domain is selected for your current ${plan} plan. Open Domains and select your allowed domain${maxDomains === 1 ? '' : 's'} first.`
      };
    }
    selectedDomains = selectedDomains.slice(0, maxDomains);

    if (!selectedDomains.includes(selectedDomain)) {
      return {
        allowed: false,
        maxDomains,
        selectedDomains,
        error: unlimited ? 'All Shrtigo domains are included with your unlimited plan.' : `This domain is not selected for your current ${plan} plan. Open Domains and select up to ${maxDomains} domain${maxDomains === 1 ? '' : 's'}.`
      };
    }

    return { allowed: true, maxDomains, selectedDomains };
  } catch {
    return {
      allowed: selectedDomain === 'shrtigo.xyz',
      maxDomains: 1,
      selectedDomains: ['shrtigo.xyz'],
      error: 'Your selected domain could not be verified. Please select your domain again from the Domains page.'
    };
  }
}

async function getEntitlement(supabaseUrl, serviceKey, userId) {
  if (!userId) return { limit: 1 };
  try {
    const r = await supabaseFetch(`${supabaseUrl}/rest/v1/subscriptions?select=plan,status,ends_at,started_at&user_id=eq.${encodeURIComponent(userId)}&status=eq.active&ends_at=gt.${encodeURIComponent(new Date().toISOString())}`, serviceKey);
    let rows = r.ok ? await r.json() : [];
    rows.sort((a,b) => {
      const ap = String(a?.plan || '').toLowerCase() !== 'welcome';
      const bp = String(b?.plan || '').toLowerCase() !== 'welcome';
      if (ap !== bp) return ap ? -1 : 1;
      return new Date(b?.started_at || b?.ends_at || 0) - new Date(a?.started_at || a?.ends_at || 0);
    });
    const plan = String(rows?.[0]?.plan || '').toLowerCase();
    const clickLimits = {
      welcome: 500,
      starter: 10000,
      growth: 50000,
      pro: 100000,
      business: 250000,
      enterprise: 500000,
      three_day: 50
    };
    if (['weekly','half_month','monthly','quarterly'].includes(plan)) return { limit: 1000000000 };
    return { limit: Number(clickLimits[plan] || 1) };
  } catch { return { limit: 1 }; }
}

async function countOwnerLinks(supabaseUrl, serviceKey, userId, ownerToken) {
  const filter = userId ? `user_id=eq.${encodeURIComponent(userId)}` : `owner_token=eq.${encodeURIComponent(ownerToken)}`;
  try {
    // Ask PostgREST for the exact count without downloading every link row.
    const r = await fetch(`${supabaseUrl}/rest/v1/links?select=id&${filter}&deleted_at=is.null`, {
      method: 'HEAD',
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, Prefer: 'count=exact' }
    });
    if (!r.ok) return 0;
    const range = r.headers.get('content-range') || '';
    const match = range.match(/\/(\d+)$/);
    return match ? Number(match[1]) : 0;
  } catch { return 0; }
}

function getClientIp(req) { return String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown').split(',')[0].trim() || 'unknown'; }
async function getUserIdFromRequest(req, supabaseUrl, serviceKey) {
  const header = String(req.headers.authorization || '').trim();
  const bearer = header.replace(/^Bearer\s+/i, '').trim();
  const cookieToken = readCookie(req.headers.cookie, 'shrtigo_session');
  const token = bearer || cookieToken;
  if (!token) return null;
  try {
    const r = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: serviceKey } });
    if (!r.ok) return null;
    return (await r.json())?.id || null;
  } catch { return null; }
}
function readCookie(header, name) { for (const part of String(header || '').split(';')) { const i = part.indexOf('='); if (i >= 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim()); } return null; }
async function insertLink(supabaseUrl, serviceKey, payload) { return fetch(`${supabaseUrl}/rest/v1/links`, { method: 'POST', headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(payload) }); }
function respond(res, req, code, imageUrl, youtubeUrl, mode, domain, ownerToken) { return res.status(200).json({ shortUrl: `https://${domain}/${encodeURIComponent(code)}`, code, domain, imageUrl, youtubeUrl: youtubeUrl || null, linkMode: mode, ownerToken }); }
function isHttpUrl(value) { try { const u = new URL(value); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; } }
function isYouTubeUrl(value) { try { const u = new URL(value); return ['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtu.be'].includes(u.hostname.toLowerCase()); } catch { return false; } }
function cleanAlias(value) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 23); }
function normalizeDomain(value) { const domain = String(value || '').trim().toLowerCase().replace(/^https?:\/\//,'').replace(/\/+$/,''); return ['shrtigo.xyz','shrtigo.shop','shrtigo.online','shrtigo.site','shrtigopro.site','shrtigo.world','shrtigo.store','shrtigourl.site','shrtigo.website','shrtigo.com'].includes(domain) ? domain : null; }
function randomCode() {
  return crypto.randomBytes(3).toString('base64url').replace(/[^a-z0-9]/gi,'').toLowerCase().slice(0,4);
}
function extension(mime) { return ({ 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp', 'image/gif':'gif' })[mime] || 'jpg'; }
function parseDataUrl(value) { const m = String(value).match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/); if (!m) return null; return { mime: m[1], buffer: Buffer.from(m[2], 'base64') }; }
async function supabaseFetch(url, key, options = {}) {
  const headers = {
    Authorization: `Bearer ${key}`,
    apikey: key,
    ...(options.headers || {})
  };
  return fetch(url, { ...options, headers });
}
