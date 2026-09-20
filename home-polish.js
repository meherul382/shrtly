(function(){
  'use strict';
  function init(){
    if(document.documentElement.dataset.shrtigoPolished==='1') return;
    document.documentElement.dataset.shrtigoPolished='1';
    var style=document.createElement('style');
    style.id='shrtigo-polished-style';
    style.textContent=`
      header{position:sticky;top:0;z-index:50;background:rgba(246,248,255,.94);backdrop-filter:blur(16px);border-bottom:1px solid rgba(219,227,240,.8)}
      header .nav{height:auto;min-height:78px;gap:18px;padding:12px 0}
      .brand{display:inline-flex;align-items:center;gap:9px;white-space:nowrap;flex-shrink:0;font-size:24px;letter-spacing:-.7px}
      .brand span{margin-right:0;box-shadow:0 7px 16px rgba(37,99,235,.22)}
      .navlinks{align-items:center;justify-content:flex-end;gap:3px;flex-wrap:wrap;line-height:1.25;min-width:0}
      .navlinks a{padding:9px 10px;border-radius:10px;transition:background .2s,color .2s;white-space:nowrap}
      .navlinks a:hover{background:#eaf0ff;color:#2563eb}
      .navlinks a[href*="analytics"]{color:#52647c}
      .st-account-actions{display:flex;align-items:center;gap:8px;margin-left:auto;flex-shrink:0}
      .st-account-actions a{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:42px;padding:10px 13px;border:1px solid #d9e2f0;border-radius:13px;background:#fff;color:#1d2a44;font-size:13px;font-weight:850;box-shadow:0 6px 18px rgba(23,32,51,.05);transition:transform .2s,box-shadow .2s}
      .st-account-actions a.st-subscription{background:#2563eb;border-color:#2563eb;color:#fff;box-shadow:0 8px 18px rgba(37,99,235,.2)}
      .st-account-actions a:hover{transform:translateY(-1px);box-shadow:0 9px 22px rgba(23,32,51,.1)}
      .st-account-actions a.st-profile{max-width:145px;overflow:hidden;text-overflow:ellipsis}
      @media(max-width:1150px){header .nav{align-items:flex-start;flex-wrap:wrap}.navlinks{flex:1;justify-content:flex-end}.navlinks a{padding:8px 8px;font-size:13px}.st-account-actions{margin-left:auto}}
      @media(max-width:800px){header .nav{align-items:center}.navlinks{display:none}.st-account-actions{margin-left:auto}.st-account-actions a{padding:9px 11px}.st-account-actions .st-dashboard{display:none}}
      @media(max-width:430px){.st-account-actions a.st-subscription{font-size:0}.st-account-actions a.st-subscription:before{content:'💳';font-size:16px}.st-account-actions a.st-profile{max-width:44px;font-size:0}.st-account-actions a.st-profile:before{content:'👤';font-size:16px}}
    `;
    document.head.appendChild(style);
    var nav=document.querySelector('header .nav');
    if(!nav) return;
    var links=nav.querySelector('.navlinks');
    if(!links) return;
    var actions=document.createElement('div');
    actions.className='st-account-actions';
    var existingSub=Array.from(links.querySelectorAll('a')).find(function(a){return /subscription/i.test(a.textContent||'') || /subscription/i.test(a.getAttribute('href')||'');});
    if(existingSub){
      existingSub.className='st-subscription';
      existingSub.textContent='💳 Subscription';
      actions.appendChild(existingSub);
    }else{
      var sub=document.createElement('a');
      sub.className='st-subscription';
      sub.href='/subscription.html';
      sub.textContent='💳 Subscription';
      actions.appendChild(sub);
    }
    var existingProfile=nav.querySelector('button, a[href*="profile"]');
    if(existingProfile){
      existingProfile.classList.add('st-profile');
      if(existingProfile.parentElement!==actions) actions.appendChild(existingProfile);
    }else{
      var profile=document.createElement('a');
      profile.className='st-profile';
      profile.href='/profile.html';
      profile.textContent='👤 Profile';
      actions.appendChild(profile);
    }
    var dash=document.createElement('a');
    dash.className='st-dashboard';
    dash.href='/dashboard.html';
    dash.textContent='📊 Dashboard';
    actions.insertBefore(dash,actions.firstChild);
    nav.appendChild(actions);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
