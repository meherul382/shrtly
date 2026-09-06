export default async function handler(req, res) {
  const code = String(req.query?.code || '').trim();
  if (!code) return res.status(400).send('Missing short code');
  try {
    const supabaseUrl = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
    const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!supabaseUrl || !serviceKey) return res.status(500).send('Backend is not configured.');

    const response = await fetch(`${supabaseUrl}/rest/v1/links?select=code,url,image_url,youtube_url,clicks&code=eq.${encodeURIComponent(code)}&limit=1`, {
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

    if (!link.image_url && !link.youtube_url) return res.redirect(302, link.url);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');

    const safeImage = link.image_url ? escapeHtml(link.image_url) : '';
    const safeUrl = escapeHtml(link.url);
    const videoId = getYouTubeId(link.youtube_url);

    const image = link.image_url
      ? `<img src="${safeImage}" alt="" loading="eager">`
      : '';

    const video = videoId
      ? `<div class="video"><iframe src="https://www.youtube.com/embed/${encodeURIComponent(videoId)}?rel=0&autoplay=1&mute=1" title="" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`
      : '';

    return res.status(200).send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="2;url=${safeUrl}">
<title></title>
<style>
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;background:#fff}
body{display:flex;align-items:center;justify-content:center;padding:12px}
.wrap{width:min(900px,100%);display:flex;flex-direction:column;gap:12px}
img{display:block;width:100%;max-height:85vh;object-fit:contain;border-radius:12px;background:#fff}
.video{position:relative;width:100%;padding-top:56.25%;overflow:hidden;border-radius:12px;background:#000}
.video iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
</style>
</head>
<body>
<main class="wrap">${image}${video}</main>
<script>
setTimeout(function(){ window.location.replace(${JSON.stringify(link.url)}); },2000);
</script>
</body>
</html>`);
  } catch (e) {
    console.error(e);
    return res.status(500).send('Could not open this short link.');
  }
}

function getYouTubeId(value) {
  if (!value) return null;
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    if (host === 'youtu.be' || host === 'www.youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (['youtube.com','www.youtube.com','m.youtube.com'].includes(host)) {
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const m = u.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/);
      return m ? m[1] : null;
    }
  } catch {}
  return null;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>\"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'
  }[c]));
}
