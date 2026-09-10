export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const supabaseUrl = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Shrtigo backend is not configured.' });

  try {
    const user = await getUser(req, supabaseUrl, serviceKey);
    if (!user) return res.status(401).json({ error: 'Login required.' });

    const code = String(req.query?.code || '').trim();
    const period = String(req.query?.period || 'today').trim().toLowerCase();
    const { from, to } = range(period);

    const linksResponse = await supabaseFetch(`${supabaseUrl}/rest/v1/links?select=id,code,url,image_url,youtube_url,clicks,created_at,link_mode,owner_token&user_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc&limit=1000`, serviceKey);
    if (!linksResponse.ok) return res.status(500).json({ error: 'Could not load your links.' });
    const links = await linksResponse.json();

    if (code) {
      const link = links.find(x => x.code === code);
      if (!link) return res.status(404).json({ error: 'Link not found in your dashboard.' });
      return res.status(200).json(await linkAnalytics(supabaseUrl, serviceKey, link, from, to));
    }

    const codes = links.filter(x => x.link_mode === 'analytics').map(x => x.code);
    let events = [];
    let visitors = [];
    if (codes.length) {
      const inList = codes.map(c => `"${String(c).replace(/"/g, '\\"')}"`).join(',');
      const eventsResponse = await supabaseFetch(`${supabaseUrl}/rest/v1/analytics_events?select=code,visitor_id,visited_at&code=in.(${encodeURIComponent(inList)})&visited_at=gte.${encodeURIComponent(from)}&visited_at=lt.${encodeURIComponent(to)}&order=visited_at.desc&limit=50000`, serviceKey);
      if (eventsResponse.ok) events = await eventsResponse.json();
      const visitorsResponse = await supabaseFetch(`${supabaseUrl}/rest/v1/analytics_visitors?select=code,visitor_id,last_seen&code=in.(${encodeURIComponent(inList)})&limit=50000`, serviceKey);
      if (visitorsResponse.ok) visitors = await visitorsResponse.json();
    }

    const activeCutoff = new Date(Date.now() - 5 * 60 * 1000).getTime();
    const unique = new Set(events.map(e => `${e.code}:${e.visitor_id}`));
    const active = new Set(visitors.filter(v => v.last_seen && new Date(v.last_seen).getTime() >= activeCutoff).map(v => `${v.code}:${v.visitor_id}`));
    const byCode = {};
    for (const e of events) byCode[e.code] = (byCode[e.code] || 0) + 1;

    return res.status(200).json({
      user: { id: user.id, email: user.email || '', name: user.user_metadata?.full_name || user.user_metadata?.name || '' },
      links: links.map(l => ({ code:l.code, url:l.url, created_at:l.created_at, clicks:Number(l.clicks||0), link_mode:l.link_mode, image_url:l.image_url, youtube_url:l.youtube_url, analyticsAvailable:l.link_mode === 'analytics', periodClicks:byCode[l.code] || 0 })),
      metrics: { activeOnline: active.size, totalClicks: events.length, uniqueVisitors: unique.size },
      from, to, period
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Could not load dashboard.' });
  }
}

async function linkAnalytics(base, key, link, from, to) {
  const eventsResponse = await supabaseFetch(`${base}/rest/v1/analytics_events?select=visitor_id,visited_at&code=eq.${encodeURIComponent(link.code)}&visited_at=gte.${encodeURIComponent(from)}&visited_at=lt.${encodeURIComponent(to)}&order=visited_at.desc&limit=20000`, key);
  const visitorsResponse = await supabaseFetch(`${base}/rest/v1/analytics_visitors?select=visitor_id,last_seen&code=eq.${encodeURIComponent(link.code)}&limit=20000`, key);
  const events = eventsResponse.ok ? await eventsResponse.json() : [];
  const visitors = visitorsResponse.ok ? await visitorsResponse.json() : [];
  const cutoff = Date.now() - 5 * 60 * 1000;
  return {
    code:link.code, url:link.url, clicks:Number(link.clicks||0), periodClicks:events.length,
    uniqueVisitors:new Set(events.map(e=>e.visitor_id)).size,
    activeOnline:visitors.filter(v=>v.last_seen && new Date(v.last_seen).getTime()>=cutoff).length,
    recent:visitors.filter(v=>v.last_seen && new Date(v.last_seen).getTime()>=cutoff).slice(0,20), from, to
  };
}

function range(period) {
  const now = new Date();
  if (period === 'today') {
    const dh = new Date(now.getTime() + 6 * 60 * 60 * 1000);
    const start = new Date(Date.UTC(dh.getUTCFullYear(), dh.getUTCMonth(), dh.getUTCDate()) - 6 * 60 * 60 * 1000);
    return { from:start.toISOString(), to:now.toISOString() };
  }
  const days = period === '30days' || period === '30' ? 30 : period === '90days' || period === '90' ? 90 : 7;
  return { from:new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString(), to:now.toISOString() };
}

async function getUser(req, base, key) {
  const token = readCookie(req.headers.cookie, 'shrtigo_session');
  if (!token) return null;
  const r = await fetch(`${base}/auth/v1/user`, { headers:{ Authorization:`Bearer ${token}`, apikey:key } });
  if (!r.ok) return null;
  return await r.json();
}
function readCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i >= 0 && part.slice(0,i).trim() === name) return decodeURIComponent(part.slice(i+1).trim());
  }
  return null;
}
async function supabaseFetch(url, key) { return fetch(url, { headers:{ Authorization:`Bearer ${key}`, apikey:key } }); }
