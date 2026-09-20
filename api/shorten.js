import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { url, alias, image, youtubeUrl, linkMode, ownerToken: requestedOwnerToken } = req.body || {};
    if (!isHttpUrl(url)) return res.status(400).json({ error: 'Please enter a valid http:// or https:// URL.' });
    if (youtubeUrl && !isYouTubeUrl(youtubeUrl)) return res.status(400).json({ error: 'Please enter a valid YouTube URL.' });

    const mode = ['simple', 'analytics'].includes(linkMode) ? linkMode : 'advanced';
    const supabaseUrl = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
    const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!supabaseUrl || !serviceKey) {
      const missing = [!supabaseUrl && 'SUPABASE_URL', !serviceKey && 'SUPABASE_SERVICE_ROLE_KEY'].filter(Boolean).join(' and ');
      return res.status(500).json({ error: `Shrtigo backend is not configured. Missing ${missing} in this Vercel deployment.` });
    }

    if (mode === 'simple' && (image || youtubeUrl || alias)) {
      return res.status(400).json({ error: 'Simple Short Link only accepts the main website URL.' });
    }

    const userId = await getUserIdFromRequest(req, supabaseUrl, serviceKey);
    if (!userId) return res.status(401).json({ error: 'Please log in first. Link creation is available only to signed-in users.' });

    const access = await getCreationAccess(supabaseUrl, serviceKey, userId);
    if (!access.ok) return res.status(500).json({ error: access.error });
    if (!access.allowed) {
      return res.status(402).json({ error: 'Your free link has expired or has already been used. Please subscribe to create more links.', code: 'SUBSCRIPTION_REQUIRED', freeLinkExpired: true });
    }

    const clean = cleanAlias(alias);
    let code = mode === 'simple' ? `S${randomCode()}` : mode === 'analytics' ? (clean ? `A${clean}` : `A${randomCode()}`) : (clean || randomCode());
    if (!/^[a-zA-Z0-9_-]{3,24}$/.test(code)) return res.status(400).json({ error: 'Alias must be 3–24 letters, numbers, hyphens or underscores.' });
    const ownerToken = mode === 'analytics' && /^[a-f0-9]{48}$/.test(String(requestedOwnerToken || '')) ? String(requestedOwnerToken) : mode === 'analytics' ? crypto.randomBytes(24).toString('hex') : null;

    if (alias) {
      const exists = await supabaseFetch(`${supabaseUrl}/rest/v1/links?select=id&code=eq.${encodeURIComponent(code)}&limit=1`, serviceKey);
      if (!exists.ok) return res.status(500).json({ error: `Supabase database check failed (${exists.status}). Run supabase.sql in SQL Editor and confirm the service-role secret.` });
      const existing = await exists.json();
      if (existing.length) return res.status(409).json({ error: 'That custom alias is already in use.' });
    }

    let imageUrl = null;
    if (image) {
      const parsed = parseDataUrl(image);
      if (!parsed) return res.status(400).json({ error: 'Invalid image upload.' });
      if (parsed.buffer.length > 3 * 1024 * 1024) return res.status(400).json({ error: 'Image must be 3 MB or smaller.' });
      const ext = extension(parsed.mime);
      const path = `interstitial/${code}-${Date.now()}.${ext}`;
      const upload = await fetch(`${supabaseUrl}/storage/v1/object/short-images/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': parsed.mime, 'x-upsert': 'true' }, body: parsed.buffer });
      if (!upload.ok) return res.status(500).json({ error: `Image upload failed (${upload.status}). Make sure the short-images bucket exists.` });
      imageUrl = `${supabaseUrl}/storage/v1/object/public/short-images/${path}`;
    }

    const payload = { code, url, image_url: imageUrl, youtube_url: youtubeUrl || null, clicks: 0, link_mode: mode, owner_token: ownerToken, user_id: userId };
    const insert = await insertLink(supabaseUrl, serviceKey, payload);
    if (!insert.ok) {
      const detail = await insert.text();
      if (insert.status === 409 && !alias) {
        code = mode === 'simple' ? `S${randomCode()}` : mode === 'analytics' ? `A${randomCode()}` : randomCode();
        payload.code = code;
        const retry = await insertLink(supabaseUrl, serviceKey, payload);
        if (retry.ok) return finishCreatedLink(res, req, supabaseUrl, serviceKey, userId, access, code, imageUrl, youtubeUrl, mode, ownerToken);
      }
      if (insert.status === 409) return res.status(409).json({ error: 'That short code is already in use.' });
      return res.status(500).json({ error: `Could not save the short link (${insert.status}). ${detail.slice(0, 180)}` });
    }

    return finishCreatedLink(res, req, supabaseUrl, serviceKey, userId, access, code, imageUrl, youtubeUrl, mode, ownerToken);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Could not create the short link. Please try again.' });
  }
}

async function finishCreatedLink(res, req, supabaseUrl, serviceKey, userId, access, code, imageUrl, youtubeUrl, mode, ownerToken) {
  if (!access.subscribed) {
    const lookup = await supabaseFetch(`${supabaseUrl}/rest/v1/links?select=id&code=eq.${encodeURIComponent(code)}&limit=1`, serviceKey);
    if (!lookup.ok) return res.status(500).json({ error: 'Could not find the created link record.' });
    const rows = await lookup.json();
    const linkId = rows[0]?.id;
    if (linkId === undefined || linkId === null) return res.status(500).json({ error: 'Could not find the created link record.' });

    const locksAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const entitlement = await fetch(`${supabaseUrl}/rest/v1/free_link_entitlements`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: userId, link_id: linkId, locks_at: locksAt })
    });
    if (!entitlement.ok) {
      console.error('Could not record free-link entitlement:', entitlement.status, await entitlement.text());
      return res.status(500).json({ error: 'Link was created, but its free-link access record could not be saved. Please contact support.' });
    }
  }
  return respond(res, req, code, imageUrl, youtubeUrl, mode, ownerToken);
}

async function getCreationAccess(supabaseUrl, serviceKey, userId) {
  const headers = { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey };
  const activeResponse = await fetch(`${supabaseUrl}/rest/v1/subscriptions?select=id,plan,status,ends_at&user_id=eq.${encodeURIComponent(userId)}&status=eq.active&order=created_at.desc&limit=20`, { headers });
  if (!activeResponse.ok) return { ok: false, error: 'Could not verify subscription status.' };
  const subscriptions = await activeResponse.json();
  const now = Date.now();
  const subscribed = subscriptions.some(item => !item.ends_at || new Date(item.ends_at).getTime() > now);
  if (subscribed) return { ok: true, allowed: true, subscribed: true };

  const entitlementResponse = await fetch(`${supabaseUrl}/rest/v1/free_link_entitlements?select=link_id,locks_at&user_id=eq.${encodeURIComponent(userId)}&limit=1`, { headers });
  if (!entitlementResponse.ok) return { ok: false, error: 'Could not verify your free-link access.' };
  const entitlements = await entitlementResponse.json();
  if (!entitlements.length) return { ok: true, allowed: true, subscribed: false };
  return { ok: true, allowed: false, subscribed: false, locksAt: entitlements[0].locks_at };
}

async function getUserIdFromRequest(req, supabaseUrl, serviceKey) {
  const header = String(req.headers.authorization || '').trim();
  const bearer = header.replace(/^Bearer\s+/i, '').trim();
  const cookieToken = readCookie(req.headers.cookie, 'shrtigo_session');
  const token = bearer || cookieToken;
  if (!token) return null;
  try {
    const r = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: serviceKey } });
    if (!r.ok) return null;
    const user = await r.json();
    return user?.id || null;
  } catch { return null; }
}

function readCookie(header, name) { const parts = String(header || '').split(';'); for (const part of parts) { const i = part.indexOf('='); if (i < 0) continue; if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim()); } return null; }
async function insertLink(supabaseUrl, serviceKey, payload) { return fetch(`${supabaseUrl}/rest/v1/links`, { method: 'POST', headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(payload) }); }
function respond(res, req, code, imageUrl, youtubeUrl, mode, ownerToken) { const origin = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`; return res.status(200).json({ shortUrl: `${origin}/${encodeURIComponent(code)}`, code, imageUrl, youtubeUrl: youtubeUrl || null, linkMode: mode, ...(ownerToken ? { ownerToken } : {}) }); }
function isHttpUrl(value) { try { const u = new URL(value); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; } }
function isYouTubeUrl(value) { try { const u = new URL(value); return ['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtu.be'].includes(u.hostname.toLowerCase()); } catch { return false; } }
function cleanAlias(value) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 23); }
function randomCode() { return Math.random().toString(36).slice(2, 6); }
function extension(mime) { return ({ 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp', 'image/gif':'gif' })[mime] || 'jpg'; }
function parseDataUrl(value) { const m = String(value).match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/); if (!m) return null; return { mime: m[1], buffer: Buffer.from(m[2], 'base64') }; }
async function supabaseFetch(url, key) { return fetch(url, { headers: { Authorization: `Bearer ${key}`, apikey: key } }); }
