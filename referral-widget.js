(()=>{const URL='https://qbijrkdlaguwlvriaiky.supabase.co',KEY='sb_publishable_CS7wauVRlHpbsdjJFdWl1g_cNdjogHJ';
const boot=async()=>{
  if(!window.supabase)return;
  const sb=supabase.createClient(URL,KEY);
  const {data:{session}}=await sb.auth.getSession();
  if(!session)return;
  const card=document.getElementById('referralCard');
  if(!card)return;
  const codeEl=document.getElementById('refRewardBadge');
  const countEl=document.getElementById('refCount');
  const completedEl=document.getElementById('refCompleted');
  const nextEl=document.getElementById('refNext');
  const linkEl=document.getElementById('refLink');
  const progressEl=document.getElementById('refProgressBar');
  const statusEl=document.getElementById('refStatus');
  try{await sb.rpc('shrtigo_activate_due_referral_rewards',{p_user_id:session.user.id})}catch(e){}
  const {data,error}=await sb.rpc('shrtigo_get_referral_account',{p_user_id:session.user.id});
  if(error||!data){statusEl.textContent='Referral status could not be loaded right now.';return}
  const count=Number(data.count||0),completed=Number(data.completed||0),next=Math.max(10,Number(data.next_target||10));
  const code=String(data.referral_code||'');
  const link=location.origin+'/central-login.html?signup=1&ref='+encodeURIComponent(code);
  countEl.textContent=count.toLocaleString();
  completedEl.textContent=completed.toLocaleString();
  nextEl.textContent=next.toLocaleString();
  codeEl.textContent=(count%10)+' / 10';
  progressEl.style.width=((count%10)*10)+'%';
  linkEl.value=link;
  statusEl.textContent=count>=10
    ? (completed+' reward(s) earned • '+(count%10===0?'Your next reward starts with the next successful referral.':(10-(count%10))+' more successful referral(s) to the next reward.'))
    : ((10-count)+' more successful paid referral(s) = 30 days Monthly Unlimited.');
  const copy=async(btn)=>{try{await navigator.clipboard.writeText(link);btn.textContent='✓ Copied';setTimeout(()=>btn.textContent='Copy',1500)}catch(e){linkEl.select();document.execCommand('copy');btn.textContent='✓ Copied';setTimeout(()=>btn.textContent='Copy',1500)}};
  document.getElementById('refCopy').onclick=()=>copy(document.getElementById('refCopy'));
  document.getElementById('refShare').onclick=async()=>{
    if(navigator.share){try{await navigator.share({title:'Join Shrtigo',text:'Create your Shrtigo account with my referral link.',url:link})}catch(e){}}
    else await copy(document.getElementById('refShare'));
  };
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot()})();