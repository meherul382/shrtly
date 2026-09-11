export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const code = String(req.query?.code || '').trim();
  const token = String(req.query?.token || '').trim();
  const all = req.query?.all === '1' || req.query?.all === 'true';
  if (!/^[a-f0-9]{48}$/.test(token)) return res.status(403).json({ error: 'Private analytics access required. Open the dashboard from your saved analytics link.' });
  try {
    const { supabaseUrl, serviceKey } = config();
    const now = new Date();
    const to = validDate(req.query?.to) ? new Date(String(req.query.to)) : now;
    const from = validDate(req.query?.from) ? new Date(String(req.query.from)) : startOfBangladeshDay();
    if (from >= to) return res.status(400).json({ error: 'Invalid analytics date range.' });
    const fromIso = from.toISOString();
    const toIso = to.toISOString();

    if (all) {
      const rpc = await fetch(`${supabaseUrl}/rest/v1/rpc/shrtigo_analytics_summary`, {
        method:'POST',
        headers:{Authorization:`Bearer ${serviceKey}`,apikey:serviceKey,'Content-Type':'application/json'},
        body:JSON.stringify({p_owner_token:token,p_from:fromIso,p_to:toIso})
      });
      if (!rpc.ok) return res.status(500).json({ error: 'Could not load analytics report.' });
      const data = await rpc.json();
      return res.status(200).json({...data,from:fromIso,to:toIso});
    }

    if (!/^A[a-z0-9]{4,23}$/.test(code)) return res.status(400).json({ error: 'Invalid analytics link.' });
    let linkResponse = await supabaseFetch(`${supabaseUrl}/rest/v1/links?select=url,clicks,link_mode,owner_token&code=eq.${encodeURIComponent(code)}&owner_token=eq.${encodeURIComponent(token)}&limit=1`, serviceKey);
    if (!linkResponse.ok) return res.status(500).json({ error: 'Database error.' });
    let links = await linkResponse.json();
    if (!links.length) {
      const legacyResponse = await supabaseFetch(`${supabaseUrl}/rest/v1/links?select=url,clicks,link_mode,owner_token&code=eq.${encodeURIComponent(code)}&owner_token=is.null&limit=1`, serviceKey);
      if (!legacyResponse.ok) return res.status(500).json({ error: 'Database error.' });
      const legacy = await legacyResponse.json();
      if (legacy.length && legacy[0].link_mode === 'analytics') {
        const claim = await fetch(`${supabaseUrl}/rest/v1/links?code=eq.${encodeURIComponent(code)}&owner_token=is.null`, {method:'PATCH',headers:{Authorization:`Bearer ${serviceKey}`,apikey:serviceKey,'Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify({owner_token:token})});
        if (!claim.ok) return res.status(500).json({ error: 'Could not restore legacy analytics access.' });
        links = await claim.json();
      }
    }
    if (!links.length || links[0].link_mode !== 'analytics') return res.status(403).json({ error: 'Private analytics access denied.' });

    const eventsResponse = await supabaseFetch(`${supabaseUrl}/rest/v1/analytics_events?select=visitor_id,visited_at&code=eq.${encodeURIComponent(code)}&visited_at=gte.${encodeURIComponent(fromIso)}&visited_at=lt.${encodeURIComponent(toIso)}&order=visited_at.desc&limit=10000`, serviceKey);
    if (!eventsResponse.ok) return res.status(500).json({ error: 'Analytics history is not ready yet.' });
    const events = await eventsResponse.json();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const visitorsResponse = await supabaseFetch(`${supabaseUrl}/rest/v1/analytics_visitors?select=visitor_id,last_seen&code=eq.${encodeURIComponent(code)}&limit=5000`, serviceKey);
    if (!visitorsResponse.ok) return res.status(500).json({ error: 'Analytics data is not ready yet.' });
    const visitors = await visitorsResponse.json();
    return res.status(200).json({
      url: links[0].url,
      clicks: events.length,
      uniqueVisitors: new Set(events.map(e=>e.visitor_id)).size,
      activeVisitors: visitors.filter(v=>v.last_seen && v.last_seen >= fiveMinutesAgo).length,
      recent: visitors.filter(v=>v.last_seen && v.last_seen >= fiveMinutesAgo).slice(0,20),
      from:fromIso,to:toIso
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Could not load analytics.' });
  }
}
function validDate(value){if(!value)return false;const d=new Date(String(value));return Number.isFinite(d.getTime());}
function startOfBangladeshDay(){const now=new Date();const bd=new Date(now.getTime()+6*60*60*1000);bd.setUTCHours(0,0,0,0);return new Date(bd.getTime()-6*60*60*1000)}
function config(){const supabaseUrl=String(process.env.SUPABASE_URL||'').trim().replace(/\/$/,'');const serviceKey=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();if(!supabaseUrl||!serviceKey)throw new Error('Supabase not configured');return{supabaseUrl,serviceKey};}
async function supabaseFetch(url,key){return fetch(url,{headers:{Authorization:`Bearer ${key}`,apikey:key}});}
