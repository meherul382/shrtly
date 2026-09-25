export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const base=String(process.env.SUPABASE_URL||'').trim().replace(/\/$/,'');const key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
  const token=readBearer(req.headers.authorization)||readCookie(req.headers.cookie,'shrtigo_session');
  if(!base||!key)return res.status(500).json({error:'Shrtigo backend is not configured.'});
  if(!token)return res.status(401).json({error:'Login required.'});
  try{
    const ur=await fetch(`${base}/auth/v1/user`,{headers:{Authorization:`Bearer ${token}`,apikey:key}});
    if(!ur.ok)return res.status(401).json({error:'Login required.'});
    const user=await ur.json();
    const body=req.body||{};
    const rawCodes=Array.isArray(body.codes)?body.codes:[body.code];
    const codes=[...new Set(rawCodes.map(x=>String(x||'').trim()).filter(Boolean))];
    if(!codes.length)return res.status(400).json({error:'Missing link code(s).'});
    if(codes.length>100)return res.status(400).json({error:'You can delete up to 100 links at once.'});

    const inFilter=`in.(${codes.map(code=>`"${code.replace(/"/g,'\\"')}"`).join(',')})`;
    const check=await fetch(`${base}/rest/v1/links?select=code&code=${encodeURIComponent(inFilter)}&user_id=eq.${encodeURIComponent(user.id)}&deleted_at=is.null`,{headers:{Authorization:`Bearer ${key}`,apikey:key}});
    if(!check.ok)return res.status(500).json({error:'Could not verify the selected links.'});
    const owned=await check.json();
    const ownedCodes=new Set((owned||[]).map(x=>String(x.code)));
    const missing=codes.filter(code=>!ownedCodes.has(code));
    if(missing.length)return res.status(404).json({error:'One or more selected links were not found in your account.'});

    const r=await fetch(`${base}/rest/v1/links?code=${encodeURIComponent(inFilter)}&user_id=eq.${encodeURIComponent(user.id)}&deleted_at=is.null`,{
      method:'PATCH',
      headers:{Authorization:`Bearer ${key}`,apikey:key,'Content-Type':'application/json'},
      body:JSON.stringify({deleted_at:new Date().toISOString()})
    });
    if(!r.ok)return res.status(500).json({error:'Could not remove the selected links.'});
    return res.status(200).json({ok:true,codes,deletedCount:codes.length,softDeleted:true});
  }catch(e){console.error(e);return res.status(500).json({error:'Could not remove the selected links.'})}
}
function readBearer(v){const s=String(v||'');return s.startsWith('Bearer ')?s.slice(7).trim():null}
function readCookie(header,name){for(const part of String(header||'').split(';')){const i=part.indexOf('=');if(i>=0&&part.slice(0,i).trim()===name)return decodeURIComponent(part.slice(i+1).trim())}return null}