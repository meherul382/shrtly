export default async function handler(req,res){
  const code=String(req.query?.code||'').trim();
  if(!code)return res.status(400).send('Missing short code');

  try{
    const supabaseUrl=String(process.env.SUPABASE_URL||'').trim().replace(/\/$/,'');
    const serviceKey=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
    if(!supabaseUrl||!serviceKey)return res.status(500).send('Backend is not configured.');

    const response=await fetch(
      `${supabaseUrl}/rest/v1/links?select=code,url,image_url,youtube_url,clicks,link_mode,user_id&code=eq.${encodeURIComponent(code)}&limit=1`,
      {headers:{Authorization:`Bearer ${serviceKey}`,apikey:serviceKey}}
    );
    if(!response.ok)return res.status(500).send('Database error');

    const rows=await response.json();
    if(!rows.length)return res.status(404).send('Short link not found');

    const link=rows[0];

    const consumedResponse=await fetch(`${supabaseUrl}/rest/v1/rpc/shrtigo_consume_click`,{
      method:'POST',
      headers:{
        Authorization:`Bearer ${serviceKey}`,
        apikey:serviceKey,
        'Content-Type':'application/json'
      },
      body:JSON.stringify({p_user_id:link.user_id,p_code:code})
    });

    let consumed=true;
    if(consumedResponse.ok){
      const value=await consumedResponse.json();
      consumed=value===true;
    }

    if(!consumed){
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.setHeader('Cache-Control','no-store');
      return res.status(200).send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Upgrade Required | Shrtigo</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#090812;color:#f8fafc;font-family:Inter,system-ui,Arial}.card{width:min(520px,calc(100% - 36px));padding:38px;border:1px solid #2b2940;border-radius:24px;background:linear-gradient(145deg,#171329,#0d1018);text-align:center;box-shadow:0 25px 80px #0008}.logo{font-size:28px;font-weight:900;margin-bottom:12px}.logo span{display:inline-grid;place-items:center;width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,#2563eb,#7c3aed);margin-right:8px}.card h1{font-size:30px;margin:12px 0}.card p{color:#a9b1c3;line-height:1.6}.btn{display:inline-block;margin-top:16px;padding:13px 22px;border-radius:12px;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;text-decoration:none;font-weight:800}</style></head><body><main class="card"><div class="logo"><span>S</span>Shrtigo</div><h1>Your free clicks are finished</h1><p>You have reached the click limit for your current plan. Upgrade your plan to continue receiving visitors through this short link.</p><a class="btn" href="https://shrtigo.xyz/subscription.html">View Plans &amp; Upgrade</a></main></body></html>`);
    }

    const videoId=getYouTubeId(link.youtube_url);
    const hasMedia=Boolean(link.image_url||videoId);

    // Fast path: normal links go directly to the destination without an HTML redirect page.
    if(link.link_mode!=='analytics'&&!hasMedia){
      res.statusCode=302;
      res.setHeader('Location',link.url);
      res.setHeader('Cache-Control','no-store');
      return res.end();
    }

    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
    res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');

    const safeImage=link.image_url?escapeHtml(link.image_url):'';
    const safeShortUrl=escapeHtml(`https://shrtigo.xyz/${encodeURIComponent(code)}`);
    const image=link.image_url?`<img src="${safeImage}" alt="Shrtigo preview" loading="eager">`:'';
    const video=videoId?`<div class="video"><iframe src="https://www.youtube.com/embed/${encodeURIComponent(videoId)}?rel=0&autoplay=1&mute=1" title="Shrtigo video preview" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`:'';
    const ogImage=link.image_url?`<meta property="og:image" content="${safeImage}"><meta property="og:image:alt" content="Shrtigo preview"><meta property="og:image:type" content="image/jpeg">`:'';
    const analyticsPing=link.link_mode==='analytics'?`<script>(function(){try{var k='shrtigo_visitor_id',v=localStorage.getItem(k);if(!v){v=(crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)+Date.now().toString(36));localStorage.setItem(k,v)}var body=JSON.stringify({code:${JSON.stringify(code)},visitorId:v});fetch('/api/analytics-ping',{method:'POST',headers:{'Content-Type':'application/json'},body:body,keepalive:true}).catch(function(){})}catch(e){}})();</script>`:'';
    const redirectDelay=link.link_mode==='analytics'?500:(hasMedia?2500:0);
    const redirectScript=`<script>setTimeout(function(){window.location.replace(${JSON.stringify(link.url)});},${redirectDelay});</script>`;

    return res.status(200).send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shrtigo — Short Link</title><meta name="description" content="A clean short link created with Shrtigo."><meta name="robots" content="noindex,nofollow,noarchive"><link rel="canonical" href="${safeShortUrl}"><meta property="og:type" content="website"><meta property="og:title" content="Shrtigo — Short Link"><meta property="og:description" content="A clean, shareable link from Shrtigo."><meta property="og:url" content="${safeShortUrl}"><meta property="og:site_name" content="Shrtigo"><meta property="og:locale" content="en_US">${ogImage}<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="Shrtigo — Short Link"><meta name="twitter:description" content="A clean, shareable link from Shrtigo.">${link.image_url?`<meta name="twitter:image" content="${safeImage}">`:''}<style>*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#fff}body{display:block;padding:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111}.wrap{width:min(900px,100%);display:flex;flex-direction:column;gap:12px}img{display:block;width:100%;max-height:82vh;object-fit:contain;border-radius:12px;background:#fff}.video{position:relative;width:100%;padding-top:56.25%;overflow:hidden;border-radius:12px;background:#000}.video iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style></head><body><main class="wrap">${image}${video}</main>${analyticsPing}${redirectScript}</body></html>`);
  }catch(e){
    console.error(e);
    return res.status(500).send('Could not open this short link.');
  }
}

function getYouTubeId(value){
  if(!value)return null;
  try{
    const u=new URL(value),host=u.hostname.toLowerCase();
    if(host==='youtu.be'||host==='www.youtu.be')return u.pathname.slice(1).split('/')[0]||null;
    if(['youtube.com','www.youtube.com','m.youtube.com'].includes(host)){
      if(u.searchParams.get('v'))return u.searchParams.get('v');
      const m=u.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/);
      return m?m[1]:null;
    }
  }catch{}
  return null;
}

function escapeHtml(value){
  return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
