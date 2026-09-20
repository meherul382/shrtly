(function(){
  const SUPABASE_URL='https://qbijrkdlaguwlvriaiky.supabase.co';
  const SUPABASE_KEY='sb_publishable_CS7wauVRlHpbsdjJFdWl1g_cNdjogHJ';
  const ADMIN='meherulhassan62@gmail.com';

  function boot(){
    if(!window.supabase||!window.supabase.createClient)return;
    const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
    const style=document.createElement('style');
    style.textContent='.sh-profile{position:relative;display:flex;align-items:center;gap:8px;margin-left:12px}.sh-profile-btn{border:1px solid #dce3ee;background:#fff;color:#172033;border-radius:12px;padding:10px 13px;font-weight:800;cursor:pointer}.sh-profile-menu{position:absolute;right:0;top:48px;width:270px;background:#fff;border:1px solid #e2e8f1;border-radius:16px;padding:12px;box-shadow:0 18px 45px #17203322;z-index:99}.sh-profile-menu button,.sh-profile-menu a{display:block;width:100%;text-align:left;padding:11px;border:0;background:transparent;color:#172033;text-decoration:none;font-weight:800;border-radius:9px;cursor:pointer}.sh-profile-menu button:hover,.sh-profile-menu a:hover{background:#f1f5ff}.sh-profile-email{font-size:12px;color:#687386;padding:8px 11px;word-break:break-all}.sh-profile-name{font-size:14px;font-weight:900;padding:4px 11px}.sh-profile-menu hr{border:0;border-top:1px solid #edf1f6;margin:6px 0}.sh-subscription-link{display:inline-block!important;color:#2563eb!important;font-weight:900!important}';
    document.head.appendChild(style);

    function addSubscription(nav){
      if(!nav||nav.querySelector('[data-sh-subscription]'))return;
      const link=document.createElement('a');
      link.href='/subscription.html';
      link.dataset.shSubscription='true';
      link.className='sh-subscription-link';
      link.textContent='💳 Subscription';
      nav.appendChild(link);
    }

    function escapeHtml(v){return String(v).replace(/[&<>\\\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\\\"':'&quot;',"'":'&#39;'}[c]));}

    function addProfile(user){
      const nav=document.querySelector('.navlinks');
      if(!nav)return;
      addSubscription(nav);
      if(document.getElementById('shProfile'))return;
      const email=String(user.email||'');
      const name=user.user_metadata?.full_name||user.user_metadata?.name||email.split('@')[0]||'User';
      const wrap=document.createElement('div');
      wrap.id='shProfile';
      wrap.className='sh-profile';
      wrap.innerHTML='<button class="sh-profile-btn" id="shProfileBtn">👤 '+escapeHtml(name)+'</button><div class="sh-profile-menu" id="shProfileMenu" hidden><div class="sh-profile-name">'+escapeHtml(name)+'</div><div class="sh-profile-email">'+escapeHtml(email)+'</div><hr><a href="/dashboard.html">📊 Dashboard</a><a href="/subscription.html">💳 Subscription</a>'+(email.toLowerCase()===ADMIN?'<a href="/admin.html">🛠 Admin Panel</a>':'')+'<button id="shLogout">↪ Log out</button></div>';
      nav.appendChild(wrap);
      const btn=wrap.querySelector('#shProfileBtn'),menu=wrap.querySelector('#shProfileMenu');
      btn.onclick=()=>{menu.hidden=!menu.hidden};
      document.addEventListener('click',e=>{if(!wrap.contains(e.target))menu.hidden=true});
      wrap.querySelector('#shLogout').onclick=async()=>{await sb.auth.signOut();try{await fetch('/api/auth/session',{method:'DELETE'})}catch{}location.replace('/central-login.html?next=%2Findex.html')};
    }

    const nav=document.querySelector('.navlinks');
    if(nav)addSubscription(nav);
    sb.auth.getSession().then(({data})=>{if(data.session)addProfile(data.session.user)});
  }

  function loadSupabase(){
    if(window.supabase&&window.supabase.createClient){boot();return;}
    const script=document.createElement('script');
    script.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.onload=boot;
    script.onerror=()=>console.warn('Supabase library could not load');
    document.head.appendChild(script);
  }
  loadSupabase();
})();