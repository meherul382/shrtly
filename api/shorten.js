export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { url, alias, image } = req.body || {};
    if (!isHttpUrl(url)) return res.status(400).json({ error: 'Please enter a valid http:// or https:// URL.' });

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ error: 'Shrtly backend is not configured yet. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel.' });
    }

    let code = cleanAlias(alias) || randomCode();
    if (!/^[a-zA-Z0-9_-]{3,24}$/.test(code)) return res.status(400).json({ error: 'Alias must be 3–24 letters, numbers, hyphens or underscores.' });

    const exists = await supabaseFetch(`${supabaseUrl}/rest/v1/links?select=id&code=eq.${encodeURIComponent(code)}&limit=1`, serviceKey);
    if (!exists.ok) throw new Error('Database check failed');
    const existing = await exists.json();
    if (existing.length) {
      if (alias) return res.status(409).json({ error: 'That custom alias is already in use.' });
      do { code = randomCode(); } while (false);
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
      if (!upload.ok) throw new Error('Image upload failed');
      imageUrl = `${supabaseUrl}/storage/v1/object/public/short-images/${path}`;
    }

    const insert = await fetch(`${supabaseUrl}/rest/v1/links`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ code, url, image_url: imageUrl, clicks: 0 })
    });
    if (!insert.ok) {
      const detail = await insert.text();
      if (insert.status === 409) return res.status(409).json({ error: 'That short code is already in use.' });
      throw new Error(detail || 'Database insert failed');
    }

    const origin = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;
    return res.status(200).json({ shortUrl: `${origin}/${encodeURIComponent(code)}`, code, imageUrl });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Could not create the short link. Please try again.' });
  }
}

function isHttpUrl(value) { try { const u = new URL(value); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; } }
function cleanAlias(value) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24); }
function randomCode() { return Math.random().toString(36).slice(2, 8); }
function extension(mime) { return ({ 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp', 'image/gif':'gif' })[mime] || 'jpg'; }
function parseDataUrl(value) {
  const m = String(value).match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return null;
  return { mime: m[1], buffer: Buffer.from(m[2], 'base64') };
}
async function supabaseFetch(url, key) { return fetch(url, { headers: { Authorization: `Bearer ${key}`, apikey: key } }); }
