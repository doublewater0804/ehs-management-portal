// R0.1: EHS Portal navigation is rebuilt dynamically by portal/app.js.
// Observe only the category nav; preserve all existing categories and cloud catalog rows.
(()=>{
  const insert=()=>{
    const nav=document.getElementById('category-nav');if(!nav||nav.querySelector('.supervisor-board-nav'))return;
    const a=document.createElement('a');a.className='supervisor-board-nav';
    a.href='supervisor-board/index.html';a.textContent='主管交辦布告欄';
    a.setAttribute('aria-label','進入主管交辦布告欄');
    nav.appendChild(a);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  function init(){
    const nav=document.getElementById('category-nav');if(!nav)return;
    const observer=new MutationObserver(insert);
    observer.observe(nav,{childList:true});insert();
  }
})();
