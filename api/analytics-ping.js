export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { code, visitorId } = req.body || {};
    if (!/^A[a-z0-9]{4,23}$/.test(String(code || '')) || !/^[a-zA-Z0-9_-]{16,80}$/.test(String(visitorId || ''))) return res.status(400).json({ error: 'Invalid analytics data.' });
    const supabaseUrl = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
    const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Backend is not configured.' });

    const linkResponse = await fetch(`${supabaseUrl}/rest/v1/links?select=code,owner_token,link_mode&code=eq.${encodeURIComponent(String(code))}&limit=1`, {
      headers:{Authorization:`Bearer ${serviceKey}`,apikey:serviceKey}
    });
    if (!linkResponse.ok) return res.status(500).json({ error: 'Could not validate analytics link.' });
    const links = await linkResponse.json();
    if (!links.length || links[0].link_mode !== 'analytics' || !/^[a-f0-9]{48}$/.test(String(links[0].owner_token || ''))) return res.status(403).json({ error: 'Analytics link is not configured.' });
    const ownerToken = String(links[0].owner_token);
    const now = new Date().toISOString();

    const response = await fetch(`${supabaseUrl}/rest/v1/analytics_visitors?on_conflict=code,visitor_id`, {
      method:'POST',
      headers:{Authorization:`Bearer ${serviceKey}`,apikey:serviceKey,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify({code:String(code),visitor_id:String(visitorId),last_seen:now})
    });
    if (!response.ok) return res.status(500).json({ error: 'Could not record analytics.' });

    const eventResponse = await fetch(`${supabaseUrl}/rest/v1/analytics_events`, {
      method:'POST',
      headers:{Authorization:`Bearer ${serviceKey}`,apikey:serviceKey,'Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify({code:String(code),owner_token:ownerToken,visitor_id:String(visitorId),visited_at:now})
    });
    if (!eventResponse.ok) return res.status(500).json({ error: 'Could not store analytics history.' });

    // Keep the detailed event table limited to the requested 90-day retention window.
    await fetch(`${supabaseUrl}/rest/v1/analytics_events?visited_at=lt.${encodeURIComponent(new Date(Date.now()-90*24*60*60*1000).toISOString())}`, {
      method:'DELETE', headers:{Authorization:`Bearer ${serviceKey}`,apikey:serviceKey,Prefer:'return=minimal'}
    });
    return res.status(204).end();
  } catch(e){console.error(e);return res.status(500).json({error:'Could not record analytics.'});}
}
