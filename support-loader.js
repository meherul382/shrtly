(function(){
'use strict';
function loadChat(){
  if(document.querySelector('script[data-shrtigo-support-chat]'))return;
  const script=document.createElement('script');
  script.src='/support-chat.js';
  script.async=true;
  script.dataset.shrtigoSupportChat='1';
  document.head.appendChild(script);
}
function start(){
  if(window.supabase&&window.supabase.createClient){loadChat();return;}
  const existing=document.querySelector('script[data-shrtigo-supabase]');
  if(existing){existing.addEventListener('load',loadChat,{once:true});return;}
  const script=document.createElement('script');
  script.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  script.async=true;
  script.dataset.shrtigoSupabase='1';
  script.onload=loadChat;
  document.head.appendChild(script);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();