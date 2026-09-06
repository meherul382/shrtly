export default async function handler(req, res) {
  const code = String(req.query?.code || '').trim();
  if (!code) return res.status(400).send('Missing short code');

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) return res.status(500).send('Shrtly backend is not configured.');

    const response = await fetch(`${supabaseUrl}/rest/v1/links?select=code,url,image_url,clicks&code=eq.${encodeURIComponent(code)}&limit=1`, {
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey }
    });
    if (!response.ok) return res.status(500).send('Database error');
    const rows = await response.json();
    if (!rows.length) return res.status(404).send('Short link not found');
    const link = rows[0];

    await fetch(`${supabaseUrl}/rest/v1/links?code=eq.${encodeURIComponent(code)}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ clicks: Number(link.clicks || 0) + 1 })
    });

    if (!link.image_url) return res.redirect(302, link.url);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    const safeImage = escapeHtml(link.image_url);
    const safeUrl = escapeHtml(link.url);
    return res.status(200).send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="3;url=${safeUrl}"><title>Shrtly — Opening link</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f6f8ff;color:#172033}.box{width:min(620px,100%);background:#fff;border:1px solid #e3e8f0;border-radius:24px;padding:24px;text-align:center;box-shadow:0 20px 70px rgba(23,32,51,.12)}img{display:block;width:100%;max-height:430px;object-fit:contain;border-radius:16px;background:#f7f9fc}.logo{font-weight:900;font-size:22px;margin-bottom:18px}.logo span{display:inline-grid;place-items:center;width:34px;height:34px;border-radius:9px;background:#2563eb;color:#fff;margin-right:7px}.msg{color:#687386;margin:16px 0}.btn{display:inline-block;padding:12px 18px;border-radius:12px;background:#2563eb;color:#fff;text-decoration:none;font-weight:800}</style></head><body><main class="box"><div class="logo"><span>S</span>Shrtly</div><img src="${safeImage}" alt="Shared image"><p class="msg">Your destination will open in a moment…</p><a class="btn" href="${safeUrl}">Continue now</a></main></body></html>`);
  } catch (e) {
    console.error(e);
    return res.status(500).send('Could not open this short link.');
  }
}
function escapeHtml(value) { return String(value).replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c])); }
