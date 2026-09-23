(function(){
 const URL='https://qbijrkdlaguwlvriaiky.supabase.co',KEY='sb_publishable_CS7wauVRlHpbsdjFjdWl1g_cNdjogHJ';
 const names={three_day:'3 Days','3-days':'3 Days',weekly:'Weekly Unlimited',monthly:'Monthly Unlimited',starter:'Starter Pack',growth:'Growth Pack',pro:'Pro Pack',business:'Business Pack',enterprise:'Enterprise Pack',half_month:'Half-Month Unlimited',quarterly:'Quarterly Unlimited',welcome:'Welcome Gift'};
 function left(ends){
  if(!ends)return 'Unlimited';
  const ms=new Date(ends).getTime()-Date.now(); if(ms<=0)return 'Expired';
  const total=Math.floor(ms/1000),d=Math.floor(total/86400),h=Math.floor(total%86400/3600),m=Math.floor(total%3600/60);
  return d>0?d+'d '+h+'h':h>0?h+'h '+m+'m':Math.max(1,m)+'m';
 }
 async function boot(){
  if(!window.supabase?.createClient)return;
  try{
   const sb=window.supabase.createClient(URL,KEY),s=(await sb.auth.getSession()).data.session;
   if(!s)return;
   const {data,error}=await sb.from('subscriptions').select('plan,status,ends_at,started_at').eq('user_id',s.user.id).eq('status','active').gt('ends_at',new Date().toISOString()).order('ends_at',{ascending:false}).limit(1);
   if(error||!data?.length)return;
   const sub=data[0], name=names[sub.plan]||sub.plan, end=sub.ends_at;
   document.querySelectorAll('.time,.panel-time,.side-bottom,.site-sidebar-bottom').forEach(box=>{
    const b=box.querySelector('b,strong'); if(b)b.textContent=left(end);
    const small=box.querySelector('small'); if(small)small.textContent='TIME LEFT';
    const spans=box.querySelectorAll('span'); spans.forEach(x=>{if(/plan status/i.test(x.textContent))x.textContent=name+' · '+new Date(end).toLocaleDateString();});
    if(box.classList.contains('side-bottom'))box.innerHTML='<div style="line-height:1.7">TIME LEFT<br><strong>'+left(end)+'</strong><br><span>'+name+'</span></div>';
    if(box.classList.contains('panel-time'))box.innerHTML='<small>TIME LEFT</small><b>'+left(end)+'</b><span>'+name+'</span>';
   });
   const update=()=>document.querySelectorAll('[data-time-left]').forEach(x=>x.textContent=left(end));
   update();setInterval(update,60000);
  }catch(e){console.warn('Shrtigo plan status:',e)}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();