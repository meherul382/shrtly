(function(){
function init(){
 if(document.documentElement.dataset.shrtigoUiReady)return;
 document.documentElement.dataset.shrtigoUiReady='1';
 var main=document.querySelector('.main,.site-content')||document.body;
 var existing=main.querySelector('.topbar');
 if(existing){existing.classList.add('shrtigo-enhanced-topbar');addControls(existing);}
 else{
  var oldTop=main.querySelector(':scope > .top');
  if(oldTop){oldTop.classList.add('shrtigo-enhanced-topbar');addControls(oldTop);}
  else{var bar=document.createElement('div');bar.className='shrtigo-global-topbar';bar.innerHTML=topMarkup();main.insertBefore(bar,main.firstChild);wire(bar);}
 }
 if(localStorage.getItem('shrtigo-theme')==='light')document.body.classList.add('shrtigo-light');
}
function topMarkup(){return '<div class="shrtigo-search-wrap"><span class="shrtigo-search-icon">⌕</span><input class="shrtigo-search" placeholder="Search links, domains, invoices..." aria-label="Search"></div><button class="shrtigo-util" data-shrtigo-theme title="Dark mode">☾</button><a class="shrtigo-util" href="/notifications.html" title="Notifications">♧</a><a class="shrtigo-profile-pill" href="/profile.html"><span class="shrtigo-profile-avatar">S</span><span class="shrtigo-profile-copy"><b>Profile</b><small>Account</small></span></a>';}
function addControls(bar){if(!bar.querySelector('.shrtigo-search-wrap')){var temp=document.createElement('div');temp.innerHTML=topMarkup();while(temp.firstChild)bar.insertBefore(temp.firstChild,bar.firstChild);}wire(bar);}
function wire(root){
 var t=root.querySelector('[data-shrtigo-theme]');
 if(t&&!t.dataset.bound){t.dataset.bound='1';t.onclick=function(){var light=document.body.classList.toggle('shrtigo-light');localStorage.setItem('shrtigo-theme',light?'light':'dark');t.textContent=light?'☀':'☾';t.title=light?'Light mode':'Dark mode';};}
 var s=root.querySelector('.shrtigo-search');
 if(s&&!s.dataset.bound){s.dataset.bound='1';s.addEventListener('keydown',function(e){if(e.key==='Enter'&&s.value.trim())location.href='/links.html?search='+encodeURIComponent(s.value.trim());});}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();