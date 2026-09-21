(function(){
'use strict';
function loadSupport(){
 if(document.querySelector('script[data-shrtigo-support-loader]'))return;
 const script=document.createElement('script');
 script.src='/support-loader.js';
 script.defer=true;
 script.dataset.shrtigoSupportLoader='1';
 document.head.appendChild(script);
}
function init(){
 if(document.documentElement.dataset.shrtigoPolished==='1')return;
 document.documentElement.dataset.shrtigoPolished='1';
 const style=document.createElement('style');style.id='shrtigo-polished-style';style.textContent=`
 header{position:sticky;top:0;z-index:50;background:rgba(246,248,255,.97);backdrop-filter:blur(16px);border-bottom:1px solid rgba(219,227,240,.8)}
 header .nav{height:auto;min-height:78px;display:flex;align-items:center;gap:20px;padding:12px 0}
 .brand{display:inline-flex;align-items:center;gap:9px;white-space:nowrap;flex:0 0 auto;font-size:24px;letter-spacing:-.7px}
 .brand span{margin-right:0;box-shadow:0 7px 16px rgba(37,99,235,.22)}
 .navlinks{display:flex;align-items:center;justify-content:flex-end;gap:3px;flex:1;min-width:0;flex-wrap:wrap;line-height:1.25}
 .navlinks a{padding:9px 10px;border-radius:10px;transition:background .2s,color .2s;white-space:nowrap}
 .navlinks a:hover{background:#eaf0ff;color:#2563eb}
 .sh-profile{margin-left:12px!important;flex:0 0 auto!important}
 @media(max-width:1150px){header .nav{align-items:center;flex-wrap:nowrap;gap:12px}.navlinks{justify-content:flex-end}.navlinks a{padding:8px 7px;font-size:13px}}
 @media(max-width:800px){header .nav{align-items:center;flex-wrap:nowrap;gap:10px}.navlinks{display:none}.sh-profile{margin-left:auto!important}}
 `;document.head.appendChild(style);
 function cleanHeader(){
  document.querySelectorAll('header .navlinks > a').forEach(function(node){
   const text=(node.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
   if(text.includes('subscription')||text.includes('dashboard'))node.remove();
  });
  document.querySelectorAll('header .nav > a, header .nav > button').forEach(function(node){
   if(node.id==='shProfile'||node.closest('#shProfile'))return;
   const text=(node.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
   if(text.includes('subscription')||text.includes('dashboard'))node.remove();
  });
  document.querySelectorAll('.st-account-actions').forEach(function(node){node.remove();});
 }
 cleanHeader();
 function fixAnalyticsNavigation(){
  document.querySelectorAll('a[href*="/analytics-login.html"]').forEach(function(link){
   if(link.dataset.analyticsDirectFixed==='1')return;
   link.dataset.analyticsDirectFixed='1';
   link.addEventListener('click',function(event){
    event.preventDefault();
    window.location.href='/analytics-shortener.html';
   });
  });
 }
 fixAnalyticsNavigation();
 loadSupport();
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){cleanHeader();fixAnalyticsNavigation();loadSupport();});else setTimeout(function(){cleanHeader();fixAnalyticsNavigation();loadSupport();},80);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();