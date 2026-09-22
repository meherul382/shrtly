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
    const entitlement = await getEntitlement(supabaseUrl, serviceKey, userId);
    const used = await countOwnerLinks(supabaseUrl, serviceKey, userId, ownerToken);
    if (used >= entitlement.limit) return res.status(402).json({ error: 'Your link limit has been used. Please choose a subscription to create more links.', subscriptionRequired: true, subscriptionUrl: '/subscription', used, limit: entitlement.limit });

    const clean = cleanAlias(alias);
    let code = mode === 'simple' ? `S${randomCode()}` : mode === 'analytics' ? (clean ? `A${clean}` : `A${randomCode()}`) : (clean || randomCode());
    if (!/^[a-zA-Z0-9_-]{3,24}$/.test(code)) return res.status(400).json({ error: 'Alias must be 3–24 letters, numbers, hyphens or underscores.' });
    if (alias) {
      const exists = await supabaseFetch(`${supabaseUrl}/rest/v1/links?select=id&code=eq.${encodeURIComponent(code)}&limit=1`, serviceKey);
      if (!exists.ok) return res.status(500).json({ error: 'Supabase database check failed.' });
      if ((await exists.json()).length) return res.status(409).json({ error: 'That custom alias is already in use.' });
    }

    let imageUrl = null;
    if (image) {
      const parsed = parseDataUrl(image);
      if (!parsed) return res.status(400).json({ error: 'Invalid image upload.' });
      if (parsed.buffer.length > 3 * 1024 * 1024) return res.status(400).json({ error: 'Image must be 3 MB or smaller.' });
      const path = `interstitial/${code}-${Date.now()}.${extension(parsed.mime)}`;
      const upload = await fetch(`${supabaseUrl}/storage/v1/object/short-images/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': parsed.mime, 'x-upsert': 'true' }, body: parsed.buffer });
      if (!upload.ok) return res.status(500).json({ error: `Image upload failed (${upload.status}).` });
      imageUrl = `${supabaseUrl}/storage/v1/object/public/short-images/${path}`;
    }

    const payload = { code, url, domain: selectedDomain, image_url: imageUrl, youtube_url: youtubeUrl || null, clicks: 0, link_mode: mode, owner_token: ownerToken, user_id: userId || null };
    const insert = await insertLink(supabaseUrl, serviceKey, payload);
    if (!insert.ok) {
      const detail = await insert.text();
      if (insert.status === 409 && !alias) {
        payload.code = mode === 'simple' ? `S${randomCode()}` : mode === 'analytics' ? `A${randomCode()}` : randomCode();
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

async function getEntitlement(supabaseUrl, serviceKey, userId) {
  if (!userId) return { limit: 1 };
  try {
    const r = await supabaseFetch(`${supabaseUrl}/rest/v1/subscriptions?select=plan,status,ends_at&user_id=eq.${encodeURIComponent(userId)}&status=eq.active&ends_at=gt.${encodeURIComponent(new Date().toISOString())}&order=ends_at.desc&limit=1`, serviceKey);
    if (!r.ok) return { limit: 1 };
    const rows = await r.json();
    const plan = String(rows?.[0]?.plan || '').toLowerCase();
    if (plan === 'three_day') return { limit: 50 };
    if (plan === 'weekly' || plan === 'monthly') return { limit: 1000000000 };
    return { limit: 1 };
  } catch { return { limit: 1 }; }
}

async function countOwnerLinks(supabaseUrl, serviceKey, userId, ownerToken) {
  const filter = userId ? `user_id=eq.${encodeURIComponent(userId)}` : `owner_token=eq.${encodeURIComponent(ownerToken)}`;
  try {
    const r = await supabaseFetch(`${supabaseUrl}/rest/v1/links?select=id&${filter}&deleted_at=is.null`, serviceKey);
    if (!r.ok) return 0;
    const rows = await r.json();
    return Array.isArray(rows) ? rows.length : 0;
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
function normalizeDomain(value) { const domain = String(value || '').trim().toLowerCase().replace(/^https?:\\/\\//,'').replace(/\\/+$/,''); return ['shrtigo.xyz','adpage-builder.xyz'].includes(domain) ? domain : null; }
function randomCode() { return Math.random().toString(36).slice(2, 6); }
function extension(mime) { return ({ 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp', 'image/gif':'gif' })[mime] || 'jpg'; }
function parseDataUrl(value) { const m = String(value).match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/); if (!m) return null; return { mime: m[1], buffer: Buffer.from(m[2], 'base64') }; }
async function supabaseFetch(url, key) { return fetch(url, { headers: { Authorization: `Bearer ${key}`, apikey: key } }); }
