import {registeredRows} from './builtins.js';
import {categories,validateRows,sorted} from './model.js';
import {CLOUD_ENABLED,ADMIN_EMAIL} from './config.js';
const $=id=>document.getElementById(id);
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let rows=[],version=0,cloud,ready=false,authorized=false,editingVersion=0,editingRows=[],adminOpen=false;
const cat=id=>categories.find(c=>c.id===id);
const icon=c=>`<span class="icon" style="--accent:${c.color};--tint:${c.tint}" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${c.path}"/></svg></span>`;
const link=r=>`<a class="shortcut" href="${esc(r.href)}" target="_blank" rel="noopener noreferrer">${icon(cat(r.category))}<span>${esc(r.title)}</span><span class="arrow" aria-hidden="true">↗</span></a>`;
function notice(text){$('notice').textContent=text;$('notice').hidden=!text;}
function render(){
 $('search').disabled=!authorized||!ready;
 $('manage').hidden=!authorized;
 $('close-admin').hidden=!authorized||!ready;
 $('total').hidden=!authorized||!ready;
 if(!authorized||!ready){
  $('home').hidden=true;$('listing').hidden=true;$('admin-panel').hidden=false;
  $('page-title').textContent='登入入口平台';
  $('editor').hidden=true;
  for(const id of ['favorites','categories','systems','admin-list'])$(id).replaceChildren();
  return;
 }
 $('editor').hidden=false;
 const visible=sorted(rows.filter(r=>r.visible));
 const query=$('search').value.trim().toLocaleLowerCase();
 const selected=cat(location.hash.slice(1));
 $('total').textContent=`${visible.length} 個系統`;
 $('home').hidden=adminOpen||!!query||!!selected;
 $('listing').hidden=adminOpen||(!query&&!selected);
 $('admin-panel').hidden=!adminOpen;
 $('page-title').textContent=adminOpen?'管理者後台':query?'搜尋系統':selected?selected.title:'工作首頁';
 $('favorites').innerHTML=visible.filter(r=>r.favorite).map(link).join('');
 $('favorites-panel').hidden=!visible.some(r=>r.favorite);
 $('categories').innerHTML=categories.map(c=>`<a class="category" href="#${c.id}">${icon(c)}<span><strong>${c.title}</strong><small>${visible.filter(r=>r.category===c.id).length} 個系統</small><em>查看系統 →</em></span></a>`).join('');
 $('category-nav').innerHTML=`<a href="#">工作首頁</a>`+categories.map(c=>`<a href="#${c.id}" ${selected?.id===c.id&&!query?'aria-current="page"':''}>${c.title}</a>`).join('');
 const results=visible.filter(r=>query?`${r.title} ${r.description} ${cat(r.category).title}`.toLocaleLowerCase().includes(query):r.category===selected?.id);
 $('list-title').textContent=query?`「${$('search').value.trim()}」的搜尋結果`:selected?.title||'';
 $('list-count').textContent=`${results.length} 個系統`;
 $('systems').innerHTML=results.length?results.map(r=>`<article class="system">${icon(cat(r.category))}<h3>${esc(r.title)}</h3><p>${esc(r.description)}</p><a class="open-link" href="${esc(r.href)}" target="_blank" rel="noopener noreferrer">進入系統 ↗</a></article>`).join(''):`<p class="empty">${query?'找不到符合的系統，請換個關鍵字。':'此分類目前尚無系統。'}</p>`;
 if(authorized)renderAdmin();
}
function renderAdmin(){
 $('admin-list').innerHTML=sorted(rows).map(r=>`<div class="admin-row"><div><strong>${esc(r.title)}</strong><small>${cat(r.category).title} · 順序 ${r.order} · ${r.visible?'顯示':'隱藏'}${r.favorite?' · 常用':''}</small></div><button class="quiet" data-edit="${esc(r.id)}">編輯</button></div>`).join('');
}
function edit(id){
 if(!authorized||!ready)return;
 editingVersion=version;editingRows=structuredClone(rows);
 const r=rows.find(r=>r.id===id)||{id:crypto.randomUUID(),title:'',category:'safety',href:'',description:'',order:100,visible:true,favorite:false};
 const f=$('system-form');
 for(const key of ['id','title','category','href','description','order'])f.elements[key].value=r[key];
 for(const key of ['visible','favorite'])f.elements[key].checked=r[key];
 $('form-title').textContent=id?'編輯系統':'新增系統';f.hidden=false;f.elements.title.focus();
}
$('system-form').elements.category.innerHTML=categories.map(c=>`<option value="${c.id}">${c.title}</option>`).join('');
$('search').addEventListener('input',()=>{adminOpen=false;render();});
window.addEventListener('hashchange',()=>{adminOpen=false;$('search').value='';render();});
$('category-nav').addEventListener('click',e=>{if(e.target.closest('a')){$('search').value='';adminOpen=false;setTimeout(render,0);}});
$('manage').onclick=()=>{adminOpen=true;render();};
$('close-admin').onclick=()=>{adminOpen=false;render();};
$('add').onclick=()=>edit();
$('admin-list').onclick=e=>{const b=e.target.closest('[data-edit]');if(b)edit(b.dataset.edit);};
$('cancel-edit').onclick=()=>{$('system-form').hidden=true;};
$('login').onclick=async()=>{try{await cloud.login();}catch(e){$('auth-status').textContent=`登入未完成：${e.message}`;}};
$('logout').onclick=async()=>{try{await cloud.logout();}catch(e){$('auth-status').textContent=e.message;}};
$('system-form').onsubmit=async e=>{
 e.preventDefault();if(!authorized||!ready)return;
 const f=e.target;const r={};for(const k of ['id','title','category','href','description'])r[k]=f.elements[k].value.trim();
 r.order=Number(f.elements.order.value);r.visible=f.elements.visible.checked;r.favorite=f.elements.favorite.checked;
 const next=editingRows.filter(x=>x.id!==r.id).concat(r);const button=f.querySelector('[type=submit]');
 try{validateRows(next);button.disabled=true;await cloud.save(next,editingVersion);f.hidden=true;notice('已儲存至雲端。');}
 catch(error){notice(`儲存未完成：${error.message}`);}finally{button.disabled=false;}
};
let unsubscribe,authGeneration=0,snapshotGeneration=0;
async function start(){
 render();$('login').hidden=true;
 $('auth-status').textContent='正在連接登入服務…';
 if(!CLOUD_ENABLED||!ADMIN_EMAIL){$('auth-status').textContent='入口登入尚未設定完成。';return;}
 try{
  cloud=await import('./cloud.js');$('login').hidden=false;
  cloud.observeAuth(async user=>{
   const generation=++authGeneration;++snapshotGeneration;
   if(unsubscribe){unsubscribe();unsubscribe=null;}
   authorized=false;ready=false;rows=[];version=0;editingRows=[];adminOpen=false;
   $('system-form').reset();$('system-form').hidden=true;
   $('logout').hidden=!user;$('login').hidden=!!user;notice('');render();
   if(!user){$('auth-status').textContent='請登入 Google 帳號以查看入口。目前僅開放 doublewater0804@gmail.com。';return;}
   try{
    await cloud.verifyAdmin();if(generation!==authGeneration)return;
    authorized=true;$('auth-status').textContent='登入成功，正在讀取系統清單…';
    unsubscribe=cloud.watch(async data=>{
     const snapshot=++snapshotGeneration;
     if(generation!==authGeneration)return;
     try{
      let next;
      if(data){next=validateRows(data.modules);if(!Number.isInteger(data.version)||data.version<1)throw Error('版本無效');}
      else{
       const response=await fetch('portal/defaults.json');
       if(!response.ok)throw Error('預設清單載入失敗');
       next=validateRows(await response.json());
      }
      if(generation!==authGeneration||snapshot!==snapshotGeneration)return;
      rows=validateRows(registeredRows(next));version=data?.version||0;ready=true;
      $('auth-status').textContent=`已登入：${user.email}`;notice('');render();
     }catch(e){if(generation!==authGeneration||snapshot!==snapshotGeneration)return;ready=false;rows=[];render();$('auth-status').textContent=`清單載入失敗，請重新整理：${e.message}`;}
    },()=>{
     ++snapshotGeneration;
     if(generation!==authGeneration)return;
     ready=false;rows=[];render();$('auth-status').textContent='無法讀取雲端清單，請確認網路後重新整理。';
    });
   }catch(e){if(generation!==authGeneration)return;$('auth-status').textContent=`${e.message}\n目前帳號：${user.email||''}\n請登出後切換帳號。`;render();}
  });
 }catch(e){$('auth-status').textContent='無法連接登入服務，請確認網路後重新整理。';$('login').hidden=true;render();}
}
start();
