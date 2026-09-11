export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const base=String(process.env.SUPABASE_URL||'').trim().replace(/\/$/,'');
  const key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
  const token=readBearer(req.headers.authorization)||readCookie(req.headers.cookie,'shrtigo_session');
  if(!base||!key)return res.status(500).json({error:'Shrtigo backend is not configured.'});
  if(!token)return res.status(401).json({error:'Login required.'});
  try{
    const ur=await fetch(`${base}/auth/v1/user`,{headers:{Authorization:`Bearer ${token}`,apikey:key}});
    if(!ur.ok)return res.status(401).json({error:'Login required.'});
    const user=await ur.json();
    const lr=await fetch(`${base}/rest/v1/links?select=code,url,clicks,link_mode,created_at,user_id&user_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc`,{headers:{Authorization:`Bearer ${key}`,apikey:key}});
    if(!lr.ok)return res.status(500).json({error:'Could not load your links.'});
    const links=await lr.json();
    const analytics=links.filter(x=>x.link_mode==='analytics').map(x=>x.code);
    let events=[];
    if(analytics.length){
      const inq=analytics.join(',');
      const er=await fetch(`${base}/rest/v1/analytics_events?select=code,visitor_id,visited_at&code=in.(${encodeURIComponent(inq)})&visited_at=gte.${encodeURIComponent(new Date(Date.now()-90*86400000).toISOString())}&order=visited_at.desc`,{headers:{Authorization:`Bearer ${key}`,apikey:key}});
      if(er.ok)events=await er.json();
    }
    const period=String(req.query?.period||'7');
    const from=String(req.query?.from||'');
    const to=String(req.query?.to||'');
    let since,end;
    if(isDate(from)&&isDate(to)){
      since=new Date(`${from}T00:00:00`);
      end=new Date(`${to}T23:59:59.999`);
      if(end<since)return res.status(400).json({error:'End date must be on or after start date.'});
    }else if(period==='today'){
      since=startOfDay(); end=new Date();
    }else{
      const days=[7,30,90].includes(Number(period))?Number(period):7;
      since=new Date(Date.now()-days*86400000); end=new Date();
    }
    const selected=events.filter(e=>{const t=new Date(e.visited_at);return t>=since&&t<=end});
    const activeCut=Date.now()-5*60*1000;
    const active=new Set(events.filter(e=>new Date(e.visited_at).getTime()>=activeCut).map(e=>e.visitor_id)).size;
    const isFull90=!from&&!to&&period==='90';
    const clicks=isFull90?analytics.reduce((s,c)=>s+Number(links.find(x=>x.code===c)?.clicks||0),0):selected.length;
    const visitors=new Set(selected.map(e=>e.visitor_id)).size;
    return res.status(200).json({user:{id:user.id,email:user.email||''},period,from:isDate(from)?from:null,to:isDate(to)?to:null,summary:{active,clicks,uniqueVisitors:visitors},links:links.map(x=>({code:x.code,url:x.url,clicks:Number(x.clicks||0),linkMode:x.link_mode,createdAt:x.created_at,analytics:x.link_mode==='analytics'}))});
  }catch(e){console.error(e);return res.status(500).json({error:'Could not load dashboard.'})}
}
function isDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(String(v||''))}
function startOfDay(){const d=new Date();d.setHours(0,0,0,0);return d}
function readBearer(v){const s=String(v||'');return s.startsWith('Bearer ')?s.slice(7).trim():null}
function readCookie(header,name){for(const part of String(header||'').split(';')){const i=part.indexOf('=');if(i>=0&&part.slice(0,i).trim()===name)return decodeURIComponent(part.slice(i+1).trim())}return null}