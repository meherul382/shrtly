export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const base=String(process.env.SUPABASE_URL||'').trim().replace(/\/$/,'');const key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
  const token=readBearer(req.headers.authorization)||readCookie(req.headers.cookie,'shrtigo_session');
  if(!base||!key)return res.status(500).json({error:'Shrtigo backend is not configured.'});
  if(!token)return res.status(401).json({error:'Login required.'});
  try{
    const ur=await fetch(`${base}/auth/v1/user`,{headers:{Authorization:`Bearer ${token}`,apikey:key}});if(!ur.ok)return res.status(401).json({error:'Login required.'});
    const user=await ur.json();const code=String(req.body?.code||'').trim();if(!code)return res.status(400).json({error:'Missing link code.'});
    const check=await fetch(`${base}/rest/v1/links?select=code&code=eq.${encodeURIComponent(code)}&user_id=eq.${encodeURIComponent(user.id)}&limit=1`,{headers:{Authorization:`Bearer ${key}`,apikey:key}});
    if(!check.ok)return res.status(500).json({error:'Could not verify this link.'});if(!(await check.json()).length)return res.status(404).json({error:'Link not found in your dashboard.'});
    await fetch(`${base}/rest/v1/analytics_events?code=eq.${encodeURIComponent(code)}`,{method:'DELETE',headers:{Authorization:`Bearer ${key}`,apikey:key}});
    await fetch(`${base}/rest/v1/analytics_visitors?code=eq.${encodeURIComponent(code)}`,{method:'DELETE',headers:{Authorization:`Bearer ${key}`,apikey:key}});
    const r=await fetch(`${base}/rest/v1/links?code=eq.${encodeURIComponent(code)}&user_id=eq.${encodeURIComponent(user.id)}`,{method:'DELETE',headers:{Authorization:`Bearer ${key}`,apikey:key}});
    if(!r.ok)return res.status(500).json({error:'Could not delete this link.'});return res.status(200).json({ok:true,code});
  }catch(e){console.error(e);return res.status(500).json({error:'Could not delete this link.'})}
}
function readBearer(v){const s=String(v||'');return s.startsWith('Bearer ')?s.slice(7).trim():null}
function readCookie(header,name){for(const part of String(header||'').split(';')){const i=part.indexOf('=');if(i>=0&&part.slice(0,i).trim()===name)return decodeURIComponent(part.slice(i+1).trim())}return null}