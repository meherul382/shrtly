export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { code, visitorId } = req.body || {};
    if (!/^A[a-z0-9]{4}$/.test(String(code || '')) || !/^[a-zA-Z0-9_-]{16,80}$/.test(String(visitorId || ''))) return res.status(400).json({ error: 'Invalid analytics data.' });
    const supabaseUrl = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
    const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Backend is not configured.' });
    const response = await fetch(`${supabaseUrl}/rest/v1/analytics_visitors?on_conflict=code,visitor_id`, {
      method:'POST',
      headers:{Authorization:`Bearer ${serviceKey}`,apikey:serviceKey,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify({code:String(code),visitor_id:String(visitorId),last_seen:new Date().toISOString()})
    });
    if (!response.ok) return res.status(500).json({ error: 'Could not record analytics.' });
    return res.status(204).end();
  } catch(e){console.error(e);return res.status(500).json({error:'Could not record analytics.'});}
}
