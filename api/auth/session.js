export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const base=String(process.env.SUPABASE_URL||'').trim().replace(/\/$/,'');
  const key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
  const token=String(req.body?.access_token||'').trim();
  if(!base||!key)return res.status(500).json({error:'Shrtigo backend is not configured.'});
  if(!token)return res.status(400).json({error:'Missing access token.'});
  try{
    const r=await fetch(`${base}/auth/v1/user`,{headers:{Authorization:`Bearer ${token}`,apikey:key}});
    if(!r.ok)return res.status(401).json({error:'Invalid login session.'});
    const user=await r.json();
    const cookie=`shrtigo_session=${encodeURIComponent(token)}; Path=/; Max-Age=3600; HttpOnly; Secure; SameSite=Lax`;
    res.setHeader('Set-Cookie',cookie);
    return res.status(200).json({ok:true,user:{id:user.id,email:user.email||''}});
  }catch(e){return res.status(500).json({error:'Could not create login session.'})}
}