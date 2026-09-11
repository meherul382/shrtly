export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const base=String(process.env.SUPABASE_URL||'').trim().replace(/\/$/,'');const key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
  const token=readBearer(req.headers.authorization)||readCookie(req.headers.cookie,'shrtigo_session');
  if(!base||!key)return res.status(500).json({error:'Shrtigo backend is not configured.'});
  if(!token)return res.status(401).json({error:'Login required.'});
  try{
    const ur=await fetch(`${base}/auth/v1/user`,{headers:{Authorization:`Bearer ${token}`,apikey:key}});if(!ur.ok)return res.status(401).json({error:'Login required.'});
    const user=await ur.json();const code=String(req.body?.code||'').trim();if(!code)return res.status(400).json({error:'Missing link code.'});
    const check=await fetch(`${base}/rest/v1/links?select=code&code=eq.${encodeURIComponent(code)}&user_id=eq.${encodeURIComponent(user.id)}&deleted_at=is.null&limit=1`,{headers:{Authorization:`Bearer ${key}`,apikey:key}});
    if(!check.ok)return res.status(500).json({error:'Could not verify this link.'});if(!(await check.json()).length)return res.status(404).json({error:'Link not found in your dashboard.'});
    const r=await fetch(`${base}/rest/v1/links?code=eq.${encodeURIComponent(code)}&user_id=eq.${encodeURIComponent(user.id)}&deleted_at=is.null`,{method:'PATCH',headers:{Authorization:`Bearer ${key}`,apikey:key,'Content-Type':'application/json'},body:JSON.stringify({deleted_at:new Date().toISOString()})});
    if(!r.ok)return res.status(500).json({error:'Could not remove this link from your dashboard.'});
    return res.status(200).json({ok:true,code,softDeleted:true});
  }catch(e){console.error(e);return res.status(500).json({error:'Could not remove this link.'})}
}
function readBearer(v){const s=String(v||'');return s.startsWith('Bearer ')?s.slice(7).trim():null}
function readCookie(header,name){for(const part of String(header||'').split(';')){const i=part.indexOf('=');if(i>=0&&part.slice(0,i).trim()===name)return decodeURIComponent(part.slice(i+1).trim())}return null}