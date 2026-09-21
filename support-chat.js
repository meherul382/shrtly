(function(){
'use strict';
const SUPABASE_URL='https://qbijrkdlaguwlvriaiky.supabase.co';
const PUBLIC_KEY='sb_publishable_CS7wauVRlHpbsdjJFdWl1g_cNdjogHJ';
function start(){
 if(document.getElementById('shrtigoSupportRoot'))return;
 if(!window.supabase)return;
 const sb=window.supabase.createClient(SUPABASE_URL,PUBLIC_KEY);
 const root=document.createElement('div');root.id='shrtigoSupportRoot';
 root.innerHTML=`<style>
#shrtigoSupportRoot{font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}#shrtigoSupportRoot *{box-sizing:border-box}.sc-launch{position:fixed;right:22px;bottom:22px;z-index:9998;border:0;border-radius:999px;background:#2563eb;color:#fff;padding:14px 18px;font-weight:800;box-shadow:0 12px 30px #2563eb44;cursor:pointer}.sc-launch{position:fixed}.sc-notify-dot{display:none;position:absolute;right:5px;top:2px;width:12px;height:12px;border-radius:50%;background:#22c55e;border:2px solid #fff;box-shadow:0 0 0 3px #22c55e44;animation:scPulse 1.5s infinite}.sc-notify-dot.show{display:block}@keyframes scPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.25);opacity:.65}}.sc-panel{display:none;position:fixed;right:22px;bottom:82px;width:min(370px,calc(100vw - 28px));height:510px;z-index:9999;background:#fff;border:1px solid #dfe6f2;border-radius:20px;box-shadow:0 22px 65px #1720332b;overflow:hidden}.sc-panel.open{display:flex;flex-direction:column}.sc-head{background:#2563eb;color:#fff;padding:17px 18px;display:flex;align-items:center;justify-content:space-between}.sc-head strong{font-size:16px}.sc-close{border:0;background:#ffffff25;color:#fff;border-radius:8px;padding:6px 10px;cursor:pointer}.sc-messages{flex:1;overflow:auto;padding:14px;background:#f7f9ff;display:flex;flex-direction:column;gap:9px}.sc-empty{color:#718096;font-size:13px;text-align:center;margin:auto 0}.sc-msg{max-width:85%;padding:10px 12px;border-radius:14px;font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-word}.sc-msg.user{align-self:flex-end;background:#2563eb;color:#fff;border-bottom-right-radius:4px}.sc-msg.admin{align-self:flex-start;background:#fff;color:#172033;border:1px solid #e2e8f1;border-bottom-left-radius:4px}.sc-foot{padding:12px;border-top:1px solid #e5eaf2;display:flex;gap:8px;background:#fff}.sc-input{flex:1;min-width:0;resize:none;border:1px solid #d6deeb;border-radius:12px;padding:11px;font:inherit;font-size:13px}.sc-send{border:0;border-radius:12px;background:#2563eb;color:#fff;padding:0 14px;font-weight:800;cursor:pointer}.sc-note{padding:18px;color:#718096;font-size:13px;text-align:center}.sc-login{display:block;margin:12px auto;background:#2563eb;color:#fff;border:0;border-radius:10px;padding:11px 15px;font-weight:800;cursor:pointer}
@media(max-width:500px){.sc-launch{right:14px;bottom:14px}.sc-panel{right:14px;bottom:75px;height:470px}}
</style><button class="sc-launch" type="button">💬 Support<span class="sc-notify-dot" aria-label="New support reply"></span></button><section class="sc-panel" aria-label="Shrtigo Support Chat"><div class="sc-head"><strong>💬 Shrtigo Support</strong><button class="sc-close" type="button">✕</button></div><div class="sc-messages"><div class="sc-empty">Loading chat…</div></div><div class="sc-foot"><textarea class="sc-input" rows="1" maxlength="2000" placeholder="Write your message…"></textarea><button class="sc-send" type="button">Send</button></div></section>`;
 document.body.appendChild(root);
 const launch=root.querySelector('.sc-launch'),dot=root.querySelector('.sc-notify-dot'),panel=root.querySelector('.sc-panel'),close=root.querySelector('.sc-close'),messages=root.querySelector('.sc-messages'),input=root.querySelector('.sc-input'),send=root.querySelector('.sc-send');
 let session=null,busy=false,lastSignature='',firstLoad=true,knownAdminIds=new Set();
 function goLogin(){location.href='/central-login.html?next='+encodeURIComponent(location.pathname+location.search)}
 function draw(items){
  const signature=items.map(x=>String(x.id||'')+':'+String(x.message||'')).join('|');
  const adminIds=items.filter(x=>x.sender_role==='admin').map(x=>String(x.id||x.created_at||x.message));
  if(!firstLoad&&adminIds.some(id=>!knownAdminIds.has(id)))dot.classList.add('show');
  adminIds.forEach(id=>knownAdminIds.add(id));
  if(signature===lastSignature){firstLoad=false;return;}
  lastSignature=signature;messages.innerHTML='';
  if(!items.length){messages.innerHTML='<div class="sc-empty">No messages yet. How can we help?</div>';firstLoad=false;return;}
  items.forEach(item=>{const bubble=document.createElement('div');bubble.className='sc-msg '+(item.sender_role==='admin'?'admin':'user');bubble.textContent=item.message;messages.appendChild(bubble)});
  messages.scrollTop=messages.scrollHeight;firstLoad=false;
 }
 async function load(){if(!session)return;try{const r=await fetch('/api/support-messages',{headers:{Authorization:'Bearer '+session.access_token}});const data=await r.json();if(!r.ok)throw new Error(data.error||'Could not load messages.');draw(Array.isArray(data.messages)?data.messages:[]);}catch(error){messages.innerHTML='<div class="sc-empty">'+String(error.message||'Chat unavailable.')+'</div>';}}
 async function init(){const result=await sb.auth.getSession();session=result.data.session;if(!session){messages.innerHTML='<div class="sc-note">Please log in to start a private support chat.</div><button class="sc-login" type="button">Log in</button>';root.querySelector('.sc-login').onclick=goLogin;input.disabled=true;send.disabled=true;return;}await load();setInterval(load,5000);}
 async function submit(){const text=input.value.trim();if(!session||!text||busy)return;busy=true;send.disabled=true;try{const r=await fetch('/api/support-messages',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({message:text})});const data=await r.json();if(!r.ok)throw new Error(data.error||'Could not send message.');input.value='';await load();}catch(error){alert(error.message||'Could not send message.');}finally{busy=false;send.disabled=false;}}
 launch.onclick=()=>{const opening=!panel.classList.contains('open');panel.classList.toggle('open');if(opening)dot.classList.remove('show');};close.onclick=()=>panel.classList.remove('open');send.onclick=submit;input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submit();}});init();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
