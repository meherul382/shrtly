(function(){
  'use strict';
  function init(){
    if(document.documentElement.dataset.shrtigoPolished==='1')return;
    document.documentElement.dataset.shrtigoPolished='1';
    const style=document.createElement('style');
    style.id='shrtigo-polished-style';
    style.textContent=`
      header{position:sticky;top:0;z-index:50;background:rgba(246,248,255,.95);backdrop-filter:blur(16px);border-bottom:1px solid rgba(219,227,240,.8)}
      header .nav{height:auto;min-height:78px;display:flex;align-items:center;gap:20px;padding:12px 0}
      .brand{display:inline-flex;align-items:center;gap:9px;white-space:nowrap;flex:0 0 auto;font-size:24px;letter-spacing:-.7px}
      .brand span{margin-right:0;box-shadow:0 7px 16px rgba(37,99,235,.22)}
      .navlinks{display:flex;align-items:center;justify-content:flex-end;gap:3px;flex:1;min-width:0;flex-wrap:wrap;line-height:1.25}
      .navlinks a{padding:9px 10px;border-radius:10px;transition:background .2s,color .2s;white-space:nowrap}
      .navlinks a:hover{background:#eaf0ff;color:#2563eb}
      .navlinks a[href*="analytics"]{color:#52647c}
      .st-account-actions{display:none!important}
      .sh-profile{margin-left:auto!important;flex:0 0 auto}
      @media(max-width:1150px){header .nav{align-items:flex-start;flex-wrap:wrap}.navlinks{justify-content:flex-end}.navlinks a{padding:8px 8px;font-size:13px}}
      @media(max-width:800px){header .nav{align-items:center;flex-wrap:nowrap;gap:10px}.navlinks{display:none}.sh-profile{margin-left:auto!important}}
    `;
    document.head.appendChild(style);
    const oldActions=document.querySelectorAll('.st-account-actions');
    oldActions.forEach(function(node){node.remove();});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
