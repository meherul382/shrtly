export default async function handler(req, res) {
  const code = String(req.query?.code || '').trim();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!/^A[a-z0-9]{4}$/.test(code)) return res.status(400).json({ error: 'Invalid analytics link.' });
  try {
    const { supabaseUrl, serviceKey } = config();
    const linkResponse = await supabaseFetch(`${supabaseUrl}/rest/v1/links?select=url,clicks,link_mode&code=eq.${encodeURIComponent(code)}&limit=1`, serviceKey);
    if (!linkResponse.ok) return res.status(500).json({ error: 'Database error.' });
    const links = await linkResponse.json();
    if (!links.length || links[0].link_mode !== 'analytics') return res.status(404).json({ error: 'Analytics link not found.' });

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const allResponse = await supabaseFetch(`${supabaseUrl}/rest/v1/analytics_visitors?select=visitor_id,last_seen&code=eq.${encodeURIComponent(code)}&order=last_seen.desc&limit=1000`, serviceKey);
    if (!allResponse.ok) return res.status(500).json({ error: 'Analytics data is not ready yet. Please run the latest Supabase SQL setup.' });
    const visitors = await allResponse.json();
    const active = visitors.filter(v => v.last_seen && v.last_seen >= fiveMinutesAgo);
    return res.status(200).json({ url: links[0].url, clicks: Number(links[0].clicks || 0), uniqueVisitors: visitors.length, activeVisitors: active.length, recent: active.slice(0, 20) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Could not load analytics.' });
  }
}
function config(){const supabaseUrl=String(process.env.SUPABASE_URL||'').trim().replace(/\/$/,'');const serviceKey=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();if(!supabaseUrl||!serviceKey)throw new Error('Supabase not configured');return{supabaseUrl,serviceKey};}
async function supabaseFetch(url,key){return fetch(url,{headers:{Authorization:`Bearer ${key}`,apikey:key}});}
