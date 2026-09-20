(function(){
  'use strict';
  function init(){
    if(document.documentElement.dataset.shrtigoPolished==='1') return;
    document.documentElement.dataset.shrtigoPolished='1';
    var style=document.createElement('style');
    style.id='shrtigo-polished-style';
    style.textContent=`
      header{position:sticky;top:0;z-index:50;background:rgba(246,248,255,.92);backdrop-filter:blur(16px);border-bottom:1px solid rgba(219,227,240,.8)}
      header .nav{height:auto;min-height:78px;gap:20px;padding:12px 0}
      .brand{display:inline-flex;align-items:center;gap:9px;white-space:nowrap;flex-shrink:0;font-size:24px;letter-spacing:-.7px}
      .brand span{margin-right:0;box-shadow:0 7px 16px rgba(37,99,235,.22)}
      .navlinks{align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap;line-height:1.25}
      .navlinks a{padding:10px 11px;border-radius:10px;transition:background .2s,color .2s;white-space:nowrap}
      .navlinks a:hover{background:#eaf0ff;color:#2563eb}
      .navlinks a[href*="analytics"]{color:#52647c}
      .st-account-actions{display:flex;align-items:center;gap:8px;margin-left:4px;flex-shrink:0}
      .st-account-actions a{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:42px;padding:10px 14px;border:1px solid #d9e2f0;border-radius:13px;background:#fff;color:#1d2a44;font-size:13px;font-weight:850;box-shadow:0 6px 18px rgba(23,32,51,.05)}
      .st-account-actions a.st-subscription{background:#2563eb;border-color:#2563eb;color:#fff;box-shadow:0 8px 18px rgba(37,99,235,.2)}
      .st-account-actions a:hover{transform:translateY(-1px);box-shadow:0 9px 22px rgba(23,32,51,.1)}
      .st-account-actions a.st-profile{max-width:150px;overflow:hidden;text-overflow:ellipsis}
      @media(max-width:1100px){header .nav{align-items:flex-start;flex-wrap:wrap}.navlinks{flex:1;justify-content:flex-end;gap:2px}.navlinks a{padding:8px 9px;font-size:13px}.st-account-actions{margin-left:auto}}
      @media(max-width:800px){header .nav{align-items:center}.navlinks{display:none}.st-account-actions{margin-left:auto}.st-account-actions a{padding:9px 11px}.st-account-actions .st-dashboard{display:none}.st-account-actions a.st-subscription{font-size:12px}}
      @media(max-width:430px){.st-account-actions a.st-subscription{font-size:0}.st-account-actions a.st-subscription:before{content:'💳';font-size:16px}.st-account-actions a.st-profile{max-width:44px;font-size:0}.st-account-actions a.st-profile:before{content:'👤';font-size:16px}}
    `;
    document.head.appendChild(style);
    var nav=document.querySelector('header .nav');
    if(!nav) return;
    var links=nav.querySelector('.navlinks');
    if(!links) return;
    var actions=document.createElement('div');
    actions.className='st-account-actions';
    actions.innerHTML='<a class="st-dashboard" href="/dashboard.html">📊 Dashboard</a><a class="st-subscription" href="/subscription.html">💳 Subscription</a><a class="st-profile" href="/profile.html">👤 Profile</a>';
    nav.appendChild(actions);
    var oldSub=Array.from(links.querySelectorAll('a')).find(function(a){return /subscription/i.test(a.textContent||'') || /subscription/i.test(a.getAttribute('href')||'');});
    if(oldSub) oldSub.remove();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
