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

    // Resolve the signed-in account from the Authorization bearer token first,
    // then fall back to the private HttpOnly session cookie. Analytics creation
    // sends the Supabase access token explicitly, so this remains reliable even
    // if the browser has not yet persisted the cookie.
    const userId = await getUserIdFromRequest(req, supabaseUrl, serviceKey);

    // Analytics links are private account-owned resources. Never create an
    // Analytics link without a verified signed-in user, otherwise its clicks
    // and live visitors cannot be safely assigned to the correct dashboard.
    if (mode === 'analytics' && !userId) {
      return res.status(401).json({ error: 'Please log in to your Shrtigo account before creating an Analytics Short Link.' });
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
      const upload = await fetch(`${supabaseUrl}/storage/v1/object/short-images/${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': parsed.mime, 'x-upsert': 'true' },
        body: parsed.buffer
      });
      if (!upload.ok) return res.status(500).json({ error: `Image upload failed (${upload.status}). Make sure the short-images bucket exists.` });
      imageUrl = `${supabaseUrl}/storage/v1/object/public/short-images/${path}`;
    }

    const payload = { code, url, image_url: imageUrl, youtube_url: youtubeUrl || null, clicks: 0, link_mode: mode, owner_token: ownerToken, user_id: userId || null };
    const insert = await insertLink(supabaseUrl, serviceKey, payload);
    if (!insert.ok) {
      const detail = await insert.text();
      if (insert.status === 409 && !alias) {
        code = mode === 'simple' ? `S${randomCode()}` : mode === 'analytics' ? `A${randomCode()}` : randomCode();
        payload.code = code;
        const retry = await insertLink(supabaseUrl, serviceKey, payload);
        if (retry.ok) return respond(res, req, code, imageUrl, youtubeUrl, mode, ownerToken);
      }
      if (insert.status === 409) return res.status(409).json({ error: 'That short code is already in use.' });
      return res.status(500).json({ error: `Could not save the short link (${insert.status}). ${detail.slice(0, 180)}` });
    }

    return respond(res, req, code, imageUrl, youtubeUrl, mode, ownerToken);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Could not create the short link. Please try again.' });
  }
}

async function getUserIdFromRequest(req, supabaseUrl, serviceKey) {
  const header = String(req.headers.authorization || '').trim();
  const bearer = header.replace(/^Bearer\s+/i, '').trim();
  const cookieToken = readCookie(req.headers.cookie, 'shrtigo_session');
  const token = bearer || cookieToken;
  if (!token) return null;
  try {
    const r = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: serviceKey }
    });
    if (!r.ok) return null;
    const user = await r.json();
    return user?.id || null;
  } catch { return null; }
}

function readCookie(header, name) {
  const parts = String(header || '').split(';');
  for (const part of parts) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

async function insertLink(supabaseUrl, serviceKey, payload) {
  return fetch(`${supabaseUrl}/rest/v1/links`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(payload)
  });
}

function respond(res, req, code, imageUrl, youtubeUrl, mode, ownerToken) {
  const origin = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;
  return res.status(200).json({ shortUrl: `${origin}/${encodeURIComponent(code)}`, code, imageUrl, youtubeUrl: youtubeUrl || null, linkMode: mode, ...(ownerToken ? { ownerToken } : {}) });
}
function isHttpUrl(value) { try { const u = new URL(value); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; } }
function isYouTubeUrl(value) { try { const u = new URL(value); return ['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtu.be'].includes(u.hostname.toLowerCase()); } catch { return false; } }
function cleanAlias(value) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 23); }
function randomCode() { return Math.random().toString(36).slice(2, 6); }
function extension(mime) { return ({ 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp', 'image/gif':'gif' })[mime] || 'jpg'; }
function parseDataUrl(value) { const m = String(value).match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/); if (!m) return null; return { mime: m[1], buffer: Buffer.from(m[2], 'base64') }; }
async function supabaseFetch(url, key) { return fetch(url, { headers: { Authorization: `Bearer ${key}`, apikey: key } }); }
