/* R0.3 2026-10-23 - 正式 Firebase 雲端、沿用 EHS Portal Google 登入。 */
(function(){
"use strict";

/* SOURCE: config.js loads separately; never overwrite window.EHS_TYPHOON_CONFIG in bundle. */

/* SOURCE: rules-data.js */

// 文件內容依使用者提供之2025/11/12原始掃描PDF排版整理；有疑義時以原件為準。
const FACTORIES = ['麥寮','彰化','龍德','新港','台北'];
const SLOTS = [
  {id:'08', time:'08:00–09:00', label:'日班第一次', type:'day', attendance:true, patrol:''},
  {id:'12', time:'12:00–13:00', label:'日班第二次', type:'day', attendance:false, patrol:'morning'},
  {id:'16', time:'16:00–16:30', label:'日班第三次', type:'day', attendance:false, patrol:'afternoon'},
  {id:'19', time:'19:00', label:'中／夜班', type:'night', attendance:false, patrol:''},
  {id:'00', time:'00:00', label:'夜班', type:'night', attendance:true, patrol:''},
  {id:'07', time:'07:00', label:'夜班', type:'night', attendance:false, patrol:''},
  {id:'end', time:'備勤結束前', label:'最後確認', type:'end', attendance:false, patrol:''}
];
const SECTIONS = [
  {id:'preparation', title:'一、颱風前準備事項', page:'第1頁', text:`原報告日期：2025/11/12；提出單位：安全永續專案組、安全衛生處。\n\n於颱風及豪大雨符合政府停班規定時，安衛處訂定颱風出勤原則及作業內容。\n\n（一）颱風前準備事宜\n1. 安衛處提報颱風備勤名單，各廠區設定人員，由廠區主管規劃排定出勤輪值表：龍德1人、彰化1人、麥寮2人（職安／環保各規劃1人）、新港1人。\n2. 安衛處主管或輪值人員參加廠區防颱會議；除重申颱風期間安全管理規定外，應針對責任轄區內主要工程工地、施工超高架台（30M以上）、雨水緩衝槽液位（20%以下）及現場電氣機具執行安全巡查，結果回報廠區主管，並回報颱風群組及一級主管群組。\n\n說明：台北廠區為本系統依使用者需求後續增加；原2025/11/12報告未列出台北的人數配置，系統不會擅自設定。`},
  {id:'schedule', title:'二、值勤通報時間與任務', page:'第1頁', text:`（二）颱風期間值勤任務\n1. 每段值勤期間按三個時間點回報。日班：08:00–09:00、12:00–13:00、16:00–16:30。\n2. 通報確認事項：各單位應出勤人員是否正常出勤（含前中夜班出勤及現場狀況）、廠房設備及生產狀況、環保污染防治設備是否正常運轉、各項環保監控數據、時雨量、測站風速、廠區內外積水、施工狀況與巡查所見安全隱患。\n3. 視天氣狀況，值勤人員入廠區巡查，上、下午各一趟；巡查狀況回報於12:00及16:00兩次回報點（正式時段分別為12:00–13:00及16:00–16:30）。\n4. 期間如有狀況，應檢附相片輔以說明，於群組即時回報，並主動聯繫主管說明。\n5. 中、夜班回報時間：19:00、00:00、07:00。颱風備勤結束該班值勤人員，於結束下哨前做最後確認並回報。\n\n系統補充操作條件（非原文）：使用者要求08:00–09:00與00:00兩個時段特別確認各單位值勤人員出勤、應到／實到與前班狀況；其他時段仍可填寫人員狀況。`},
  {id:'incidents', title:'三、異常情況、安全與主管聯繫', page:'第2頁', text:`1. 值勤人員如發現廠區內外已有積水情形且持續暴雨，須提供訊息和照片回報。\n2. 若研判本公司員工到班有安全疑慮（例如風勢太大或路面積水無法通行等安全考量），由安衛處經營主管評估指示上班同仁持續加班一次班人員不到廠接班，或建請總經理室各駐廠經營主管發布交接班應變指示。\n3. 廠區若無發佈成立防颱中心，駐區主管仍須密切關注廠區安衛環及廠區積水狀況，如有狀況須即時回報於一級主管群。\n4. 在廠區未成立防颱中心、未排定中夜班值勤時，各駐區安衛處須主動洽詢警衛室掌握狀況，如有類似淹水等狀況，警衛室除通報管理處及駐廠經營主管外，另請其同步知會安衛處主管。\n\n異常通報不得等待下個固定時段。使用者已選擇不於系統上傳照片，應由使用者在實際通報群組另行附圖。`},
  {id:'close', title:'四、颱風值勤結束確認', page:'第2頁', text:`（三）颱風值勤結束確認\n1. 廠區防颱中心解除後，安衛處值勤人員須針對「值勤工作任務和回報內容」確認後通報。\n2. 下班前須再次確認風勢及雨勢。下班途中如遇風雨加劇，返家後需洽詢警衛室或管理處瞭解廠區狀況（含錄影、拍照等），即時回報一級主管群。\n3. 各駐區安衛處須持續關注廠區內風雨和巡查是否還有積水，並對颱風產生之廢棄物及廢棄物暫存場等可能之污染環境情形，進行全面巡查與管理作為。\n4. 颱風期間發生的異常事件，若無法及時修復，轄區負責人員需紀錄並跟催改善。\n5. 上述事項，各廠區主管須即時於颱風群組中回報，如有異常則提升至一級主管群組。`},
  {id:'organization', title:'五、報告呈准及主管批示', page:'第2頁', text:`原報告續文：報告呈准後，由處長召集各駐區主管及處務室環保、職安機能組同仁說明，並據以實施；「是否可行，呈請核示」。\n\n第2頁有多處主管手寫批示，包括建議使用Checklist、依現況增修Checklist以及以人員安全為優先等事項。因手寫字跡部分不明，為避免誤轉為正式規定，請直接點選「檢視原始核定PDF」閱讀第2頁手寫全文。此章可新增經確認的文字補充與修訂，不會覆蓋原件。`},
  {id:'template', title:'六、通報範例（原附件一）', page:'第3頁', text:`通報範例（參考）\n\n報告 資總、副總及資深經理：\n安衛處（麥寮）回報○○颱風，○○廠區目前動態，重點說明如下：\n\n一、○○廠區由○○颱風備勤，目前○○廠區仍尚無明顯風雨，平均風速為○○m/s，最大風速為○○m/s（風向○○），○○測站時雨量為○○。\n\n二、上午經逐廠確認後，回報\n1. 各單位人員出勤（包含前班人員狀況）\n2. 生產製程設備\n3. 污染防治設備運轉狀況\n4. 線上確認CWMS、CEMS等並至監測中心瞭解本公司監測數據、人員平安、現場設備及環保污染防治設備運轉均正常。\n\n三、本日上午巡查路線重點說明和現場施工狀況巡查狀況矯正後回報。\n\n四、如有異常情況檢附照片和錄影資料說明。`},
  {id:'handwriting', title:'七、原件手寫批示與註記', page:'第2至3頁', text:`本章收錄原PDF第2、3頁的手寫批示所在位置與閱覽指引。\n\n原件第2頁：報告末段下方有多項主管手寫批示，部分關於Checklist、值勤巡查及安全原則，原始影像完整保存。\n原件第3頁：通報範例下方另有主管手寫補充意見，原始影像完整保存。\n\n注意：掃描手寫內容存在辨識不確定性，這裡不將推測文字寫成核定原文。請開啟原PDF核對；經授權後可於下方備註區補充可確認之文字。`},
  {id:'supplement', title:'八、系統使用與修訂管理說明', page:'系統補充（非原PDF規定）', text:`【使用者確認之系統需求】\n1. 廠區：麥寮、彰化、龍德、新港、台北；各廠區人員名單獨立，切換廠區後各時段僅顯示該廠區名單。\n2. 每個回報時段可獨立選擇一位或多位值勤人員，不設「整日值勤人員」欄位。\n3. 08:00–09:00與00:00特別檢核出勤人數、前一班及人員安全狀況。\n4. 三個日班時段各產生完整通報；中夜班19:00、00:00、07:00以及備勤結束前亦可通報。\n5. 所有正式規定以核定PDF為準；備註、補充公告及修訂另存版本歷程，不會回寫原件。\n6. 不使用附件上傳；異常照片須另以實際通報管道檢附。`}
];
const CHECKS = [
  {group:'人員出勤', rows:[['attendance','各單位出勤人數及狀況'],['previous','前一班值勤人員狀況'],['transport','人員安全及交通狀況']]},
  {group:'生產與環保', rows:[['production','生產製程及主要設備'],['pollution','污染防治設備運轉'],['cwms','CWMS 線上監測'],['cems','CEMS 線上監測']]},
  {group:'氣象與防汛', rows:[['storm','風雨現況'],['floodInside','廠區內積水情形'],['floodOutside','廠區外及道路積水'],['buffer','雨水緩衝槽液位']]},
  {group:'施工與巡查', rows:[['construction','施工現場狀況'],['highwork','30m以上高架作業安全'],['electrical','現場電氣機具防颱'],['hazard','巡查安全隱患']]},
  {group:'備勤結束最後確認', onlyEnd:true, rows:[['windCheck','風雨狀況再次確認'],['waterCheck','積水及廠區安全確認'],['waste','颱風廢棄物處理'],['wasteYard','廢棄物暫存場污染風險'],['followup','未改善異常追蹤與交接']]}
];


/* SOURCE: firebase.js */

// R0.3 正式雲端：沿用 EHS 入口 portal/config.js 的 Firebase 設定與 Google/Email登入。
// 路徑與 R0.2 相同，不會自動搬移瀏覽器 DEMO 資料，也不會覆蓋其他 EHS collections。
const DEFAULT_PATHS={staff:'ehs_typhoon_duty_r0/staff/members', events:'ehs_typhoon_duty_r0/events/records', reports:'ehs_typhoon_duty_r0/reports/entries', incidents:'ehs_typhoon_duty_r0/incidents/entries', rules:'ehs_typhoon_duty_r0/rules/sections', notes:'ehs_typhoon_duty_r0/notes/items', revisions:'ehs_typhoon_duty_r0/revisions/entries', settings:'ehs_typhoon_duty_r0/settings/entries'};
const config=window.EHS_TYPHOON_CONFIG;
if(!config || config.mode!=='firebase')throw new Error('正式版 config.js 尚未載入或設定錯誤，請確認上傳了 R0.3 的 config.js 並清除快取。');
let auth=null,db=null,firestore=null,authLib=null,user=null,ownerEmail='';
const mode='firebase';
const paths=DEFAULT_PATHS;
const portalHome=config.portalHome||'../';
const isOwner=()=>Boolean(user?.emailVerified && ownerEmail && user.email?.toLowerCase()===ownerEmail);
const currentUser=()=>user;
async function init(onAuth){
  // 同一 GitHub Pages 網域下直接讀取既有 EHS Portal 的 Web SDK 設定，避免重複維護另一套 Firebase Config。
  let portal;
  try {portal=await import(config.portalConfigModule||'../portal/config.js');}
  catch(error){throw new Error('無法讀取 EHS 入口 portal/config.js：'+error.message);}
  if(!portal.firebaseConfig?.apiKey || !portal.firebaseConfig?.projectId || !portal.firebaseConfig?.appId || !portal.ADMIN_EMAIL)
    throw new Error('既有 EHS Portal 的 Firebase 設定或管理員 Email 不完整。');
  ownerEmail=String(portal.ADMIN_EMAIL).trim().toLowerCase();
  const sdk='https://www.gstatic.com/firebasejs/10.12.5/';
  const [fb,authModule,dbModule]=await Promise.all([
    import(sdk+'firebase-app.js'),import(sdk+'firebase-auth.js'),import(sdk+'firebase-firestore.js')
  ]);
  authLib=authModule;firestore=dbModule;
  // 入口網站使用名為 ehs-portal 的 Firebase App；使用同名可跨同源分頁延續登入狀態。
  const name='ehs-portal';
  const app=fb.getApps().find(a=>a.name===name)||fb.initializeApp(portal.firebaseConfig,name);
  auth=authLib.getAuth(app);db=firestore.getFirestore(app);
  authLib.onAuthStateChanged(auth, u=>{
    user=u;
    Promise.resolve(onAuth(u)).catch(e=>mainError(e));
  }, e=>mainError(new Error('Firebase 登入狀態檢查失敗：'+e.message)));
}
async function signIn(email,password){if(!authLib)throw new Error('Firebase 尚未初始化');await authLib.signInWithEmailAndPassword(auth,email,password);}
async function signInGoogle(){if(!authLib)throw new Error('Firebase 尚未初始化');await authLib.signInWithPopup(auth,new authLib.GoogleAuthProvider());}
async function signOut(){if(authLib)await authLib.signOut(auth);}
function ensureAccess(write=false){
  if(!user)throw new Error('請先登入 EHS Firebase 帳號');
  if(write&&!isOwner())throw new Error('只有已驗證的 EHS 入口管理者帳號可新增、修改或刪除資料');
}
async function listDocs(kind){
  ensureAccess();if(!paths[kind])throw new Error('未知的資料類型：'+kind);
  const snapshot=await firestore.getDocs(firestore.collection(db,paths[kind]));
  return snapshot.docs.map(x=>({id:x.id,...x.data()}));
}
async function saveDoc(kind,item){
  ensureAccess(true);if(!paths[kind])throw new Error('未知的資料類型：'+kind);
  const value={...item};if(!value.id)throw new Error('缺少資料 id');
  await firestore.setDoc(firestore.doc(db,paths[kind],value.id),value);
}
async function deleteDoc(kind,id){
  ensureAccess(true);if(!paths[kind])throw new Error('未知的資料類型：'+kind);
  await firestore.deleteDoc(firestore.doc(db,paths[kind],id));
}
const makeId=()=>crypto.randomUUID?crypto.randomUUID():`${Date.now()}_${Math.random().toString(36).slice(2)}`;

/* SOURCE: excel.js */

// 自含 XLSX 匯出器，免外部 CDN／外掛。使用 ZIP STORE，適合值勤紀錄匯出。
const enc=new TextEncoder();
const xml=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const indexToColumn=n=>{let r='';for(n++;n;n=Math.floor((n-1)/26))r=String.fromCharCode(65+(n-1)%26)+r;return r;};
const sheetXml=(rows)=>`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="17"/><sheetData>${rows.map((r,i)=>`<row r="${i+1}">${r.map((v,j)=>{const ref=indexToColumn(j)+(i+1);if(typeof v==='number'&&Number.isFinite(v))return `<c r="${ref}"><v>${v}</v></c>`;return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;}).join('')}</row>`).join('')}</sheetData></worksheet>`;
function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let j=0;j<8;j++)c=c&1?(c>>>1)^0xedb88320:c>>>1;}return(c^0xffffffff)>>>0;}
function zip(files){const blocks=[],central=[];let offset=0;const u16=n=>[n&255,(n>>>8)&255],u32=n=>[n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];
for(const [name,value] of files){const nb=enc.encode(name),data=enc.encode(value),crc=crc32(data),hdr=new Uint8Array([...u32(0x04034b50),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(nb.length),...u16(0),...nb]);blocks.push(hdr,data);
const c=new Uint8Array([...u32(0x02014b50),...u16(20),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(nb.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset),...nb]);central.push(c);offset+=hdr.length+data.length;}
const centerLen=central.reduce((s,x)=>s+x.length,0),end=new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),...u16(files.length),...u16(files.length),...u32(centerLen),...u32(offset),...u16(0)]);return new Blob([...blocks,...central,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});}
function workbook(tables){const files=[['[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${tables.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],['_rels/.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],['xl/workbook.xml',`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${tables.map((x,i)=>`<sheet name="${xml(x.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`],['xl/_rels/workbook.xml.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${tables.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}</Relationships>`]];
 tables.forEach((x,i)=>files.push([`xl/worksheets/sheet${i+1}.xml`,sheetXml(x.rows)]));return zip(files);}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}


/* SOURCE: app.js */




const $=s=>document.querySelector(s);
const H=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const now=()=>new Date().toLocaleString('zh-TW',{hour12:false});
const clean=x=>String(x??'').trim();
const stText={normal:'正常',abnormal:'異常',na:'不適用',pending:'尚未確認'};
const state={tab:'duty',events:[],staff:[],reports:[],incidents:[],rules:[],notes:[],revisions:[],settings:[],eventId:'',reportDate:'',slotId:'08',sectionId:'preparation',drafts:{},editPeopleId:null,incidentEditId:null,reportPreview:'',authLoading:true};
let reloadBusy=false;
function toast(message,kind='info'){const d=$('#toast');d.textContent=message;d.style.background=kind==='error'?'#ad3737':'#154e78';d.style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>d.style.display='none',4300);}
function ownerBlock(){return !isOwner()?`<div class="banner warning">你目前為唯讀權限。依本系統設定，只有指定管理員可新增、修改及刪除資料。</div>`:'';}
function disabled(){return isOwner()?'':'disabled';}
function warnDemo(){return mode==='demo'?`<div class="banner warning"><b>本機示範模式</b>：資料只存在這個瀏覽器的 localStorage，不會同步到 Firebase，也不能視為正式值勤紀錄。正式部署必須依部署說明設定 config.js 與 Firestore Rules。</div>`:'';}
function userLabel(){let c=currentUser();$('#accountLabel').textContent=c?.email||'未登入';$('#connectionLabel').textContent=c?(isOwner()?'Firebase 正式｜管理者':'Firebase 正式｜唯讀'):'Firebase 正式｜未登入';$('#homeBtn').href=portalHome;}
async function refresh(){if(reloadBusy)return;reloadBusy=true;try{const keys=['events','staff','reports','incidents','rules','notes','revisions','settings'];const data=await Promise.all(keys.map(k=>listDocs(k)));keys.forEach((k,i)=>state[k]=data[i]);state.events.sort((a,b)=>(b.date||'').localeCompare(a.date||''));if(!state.events.some(e=>e.id===state.eventId)){state.eventId=state.events[0]?.id||'';state.reportDate=state.events[0]?.date||today();}if(!state.reportDate)state.reportDate=eventNow()?.date||today();render();}catch(e){mainError(e);}finally{reloadBusy=false;}}
function mainError(e){window.__EHS_TYPHOON_RENDERED=true;console.error(e);$('#main').innerHTML=`<div class="panel"><h2>讀取失敗</h2><p class="danger">${H(e.message)}</p><div class="banner warning">請檢查 Firebase 設定、授權網域、登入狀態及 Firestore Rules；不要直接覆蓋現有正式規則。</div><button class="btn" data-action="refresh">重新讀取</button></div>`;}
function eventNow(){return state.events.find(e=>e.id===state.eventId)||null;}
function staffNow(){const e=eventNow();return state.staff.filter(p=>p.factory===e?.factory&&p.active!==false).sort((a,b)=>(a.name||'').localeCompare(b.name||'','zh-Hant'));}
function reportStored(){return state.reports.find(r=>r.eventId===state.eventId&&r.slotId===state.slotId&&r.reportDate===state.reportDate)||null;}
function draftKey(){return `${state.eventId}__${state.reportDate||eventNow()?.date||today()}__${state.slotId}`;}
function initialDraft(){const saved=reportStored();if(saved)return structuredClone(saved);
 const e=eventNow(),slot=SLOTS.find(x=>x.id===state.slotId);const setting=state.settings.find(x=>x.id==='general')||{};const units=(setting.units?.[e?.factory]||[]).filter(Boolean);
 return {id:draftKey(),eventId:state.eventId,slotId:state.slotId,reportDate:state.reportDate||e?.date||today(),peopleIds:[],checks:{},notes:{},unitAttendance:units.length?units.map(name=>({id:makeId(),unit:name,expected:'',actual:'',note:''})):[{id:makeId(),unit:'',expected:'',actual:'',note:''}],weather:{avg:'',max:'',direction:'',rain:'',station:'',observationTime:'',conditions:''},reportExtra:{executives:'',executivesCount:'',avgUnavailable:false,avgReason:'',maxStation:'',rainStation:'',monitoringVisited:false,storageMin:'',storageMax:'',storageCount:'',storageLimit:'20',constructionSummary:'',constructionOther:''},patrol:{result:'',time:'',note:''},status:'draft',savedAt:'',reportText:''};}
function draft(){const k=draftKey();if(!state.drafts[k])state.drafts[k]=initialDraft();return state.drafts[k];}
const slotNow=()=>SLOTS.find(s=>s.id===state.slotId)||SLOTS[0];
function setTab(t){state.tab=t;$('#sidebar').classList.remove('open');render();window.scrollTo(0,0);}
function render(){window.__EHS_TYPHOON_RENDERED=true;userLabel();$$nav();const c=$('#main');c.innerHTML=warnDemo()+(state.tab==='duty'?renderDuty():state.tab==='events'?renderEvents():state.tab==='people'?renderPeople():state.tab==='rules'?renderRules():state.tab==='history'?renderHistory():renderSettings());if(state.tab==='duty'&&eventNow())updateValidationUI();}
function $$nav(){document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.tab));}
function panel(n,title,body,cls=''){return `<section class="panel ${cls}"><h2 class="section-title"><span class="number">${n}</span>${title}</h2>${body}</section>`;}
function empty(t){return `<div class="empty">${t}</div>`;}
const opts=(items,selected)=>items.map(([v,t])=>`<option value="${H(v)}" ${String(v)===String(selected)?'selected':''}>${H(t)}</option>`).join('');
function renderDuty(){const e=eventNow();if(!e)return panel('1','值勤作業',`<div class="banner">目前沒有颱風事件，請先建立事件，再設定各廠區值勤人員及各時段Checklist。</div><button class="btn" data-action="open-event" ${disabled()}>＋建立第一筆颱風事件</button>`);
 const d=draft(),s=slotNow(),saved=reportStored(),allStaff=staffNow();const summary=`${e.name}｜${e.factory}｜${e.date}`;const issues=validateDraftDetails(d);
 const header=panel('1','颱風事件基本資料',`<div class="toolbar"><div class="field" style="min-width:230px"><label>選擇颱風事件（含廠區）</label><select data-global="event">${opts(state.events.map(e=>[e.id,`${e.name}／${e.factory}／${e.date}`]),e.id)}</select></div><div class="field"><label>目前廠區</label><input readonly value="${H(e.factory)}"></div><div class="field"><label>本次回報日期</label><input type="date" data-global="reportDate" value="${H(state.reportDate)}"></div><button class="btn secondary" data-action="open-event">＋事件</button><button class="btn secondary" data-tab="people">值勤人員管理</button></div><div class="hint">事件：${H(summary)}。各廠區值勤人員名單與資料獨立；這裡不設置「整日值勤人員」，一律在下方各時段個別選擇。</div>`);
 const slots=panel('2','通報時段與值勤人員設定',`<div class="slot-grid">${SLOTS.map(p=>{const f=state.reports.find(r=>r.eventId===e.id&&r.slotId===p.id&&r.reportDate===state.reportDate),thisDraft=p.id===s.id?d:state.drafts[e.id+'__'+state.reportDate+'__'+p.id]||f||{peopleIds:[]};const selected=thisDraft.peopleIds||[];return `<div class="slot ${p.type} ${p.id===s.id?'selected':''}"><button class="choose-slot" data-slot="${p.id}" aria-pressed="${p.id===s.id}"><span class="slot-time">${p.time}</span><span class="slot-label">${p.label}</span></button><div class="duty-picker"><label class="hint">值勤人員（可多選）</label><details><summary>${selected.length?H(selected.map(id=>allStaff.find(x=>x.id===id)?.name||'(原人員已停用)').join('、')):'請選擇人員'}</summary><div class="picker-choices">${allStaff.length?allStaff.map(person=>`<label><input type="checkbox" data-staff-slot="${p.id}" data-person="${person.id}" ${selected.includes(person.id)?'checked':''} ${disabled()}>${H(person.name)}${person.job?'（'+H(person.job)+'）':''}</label>`).join(''):'<span class="none">本廠區尚未建立人員名單</span>'}</div></details></div>${p.attendance?'<div class="attention">需確認各單位出勤人數</div>':''}${p.patrol?`<div class="attention">應納入${p.patrol==='morning'?'上午':'下午'}巡查</div>`:''}${f?`<div class="saved">${f.status==='final'?'✓ 已完成通報':'○ 已存草稿'}</div>`:''}</div>`}).join('')}</div><div class="banner">選定時段後，在下方編輯該時段的Checklist及出勤人員；每個時段可選一人或多人，且不會自動沿用上一班。<b>00:00請用實際回報日期</b>。</div>`);
 const issuesPanel=`<section class="panel validation-panel" id="validationPanel" aria-live="polite">${issueSummary(issues)}</section>`;
 const checks=panel('3',`值勤檢查項目（${s.time} ${s.label}）`,`${ownerBlock()}<div class="tabs">${['人員出勤','生產與環保','氣象與防汛','施工與巡查','通報補充資料',...(s.id==='end'?['備勤結束最後確認']:[])].map((v,i)=>`<button class="tab ${state.checkTab===v||(!state.checkTab&&i===0)?'active':''}" data-check-tab="${H(v)}">${H(v)} <span class="tab-issue" data-issue-count-for="${H(v)}">${issueTabCount(issues,v)}</span></button>`).join('')}</div>${renderCheckTab(d,s)}<div class="footerbar"><button class="btn grey" data-action="draft-save" ${disabled()}>儲存本時段草稿</button><button class="btn" data-action="final-save" ${disabled()}>完成檢查並儲存通報</button></div>`);
 const preview=panel('4','通報內容預覽',`<div class="hint">依當前Checklist及人員狀況產生，格式比照核定通報範例；缺漏資料會標示「【待填】」，不可複製成正式通報。</div><div class="preview" id="reportPreview">${H(buildReport(d))}</div><div class="preview-buttons"><button class="btn secondary" data-action="preview">重新預覽</button><button class="btn green" data-action="copy-report" ${disabled()}>複製完整通報（供貼至LINE）</button></div>`,`sticky`);
 const incidents=panel('5','本次颱風異常事項（不受通報時段限制）',`${ownerBlock()}<div class="toolbar"><button class="btn red" data-action="open-incident" ${disabled()}>＋新增異常即時通報</button></div>${renderIncidentTable(e.id)}`);
 return `<div class="columns"><div>${header}${issuesPanel}${slots}${checks}${incidents}</div><div>${preview}${panel('i','原報告重點提醒',`<div class="time-note">08:00–09:00 與 00:00 特別確認各單位出勤人數及前一班人員狀況。</div><div class="time-note">12:00、16:00 回報應分別納入上午、下午實際巡查結果；天候不安全不得勉強巡查。</div><div class="time-note">發現異常應即時群組通報並主動聯絡主管、另附照片（照片不存本系統）。</div><div class="time-note">中、夜班依19:00、00:00、07:00回報；颱風備勤結束前另作最後確認。</div><button class="btn secondary" data-tab="rules">查看完整值勤規定</button>`)}</div></div>`;}
function issueTabCount(issues,tab){return issues.filter(x=>x.tab===tab).length||'';}
function issueSummary(issues){if(!issues.length)return `<div class="validation-pass">✓ 本時段必填項目均已完成，可進行正式通報儲存。</div>`;return `<div class="validation-heading"><b>尚有 <span id="issueTotal">${issues.length}</span> 項未完成／待確認</b><span>點選項目，可跳至對應欄位（紅框提示）</span></div><div class="issue-items">${issues.map(x=>`<button type="button" class="issue-item" data-focus-issue="${H(x.id)}" title="點選定位至輸入欄位"><span>!</span>${H(x.label)} <small>→ ${H(x.tab)}</small></button>`).join('')}</div>`;}
function focusIssue(issue){if(!issue)return;const d=draft();if(issue.tab && state.checkTab!==issue.tab){state.checkTab=issue.tab;render();}
 let target=document.querySelector(issue.selector);if(!target)return;
 const details=target.closest('details');if(details)details.open=true;
 target.scrollIntoView({block:'center',behavior:'smooth'});
 (target.closest('.status-set')||target).classList.add('issue-flash');if(!target.disabled&&target.focus)target.focus({preventScroll:true});}
function updateValidationUI(){if(state.tab!=='duty'||!eventNow())return;const issues=validateDraftDetails(draft());const panel=document.querySelector('#validationPanel');if(panel)panel.innerHTML=issueSummary(issues);
 document.querySelectorAll('[data-issue-count-for]').forEach(el=>{const n=issueTabCount(issues,el.dataset.issueCountFor);el.textContent=n;el.hidden=!n;});
 document.querySelectorAll('.needs-input').forEach(el=>el.classList.remove('needs-input'));
 for(const issue of issues){const el=document.querySelector(issue.selector);if(el){(el.closest('.status-set')||el).classList.add('needs-input');}}
}
function renderCheckTab(d,s){const current=state.checkTab||'人員出勤';if(!['人員出勤','生產與環保','氣象與防汛','施工與巡查','通報補充資料','備勤結束最後確認'].includes(current))state.checkTab='人員出勤';
 const issues=validateDraftDetails(d),marked=selector=>issues.some(x=>x.selector===selector)?' needs-input':'';
 if(state.checkTab==='通報補充資料'){const x=d.reportExtra||{},check=(key)=>x[key]===true?'checked':'';
 return `<div class="banner">這裡補足正式 LINE 敘述通報需要的細節。<b>未提供的資料不會自動捏造。</b>經營主管及儲槽數據可依實際狀況填寫，不適用可留白。</div>
 <h3 class="subheading">出勤主管與氣象測站資訊</h3><div class="datapair">
 <div class="field"><label>本日出勤經營主管（姓名、職稱，可選）</label><input data-extra="executives" value="${H(x.executives||'')}" placeholder="例：洪副總及張資深經理" ${disabled()}></div>
 <div class="field"><label>經營主管出勤人數（有填姓名須填）</label><input type="number" min="0" data-extra="executivesCount" value="${H(x.executivesCount||'')}" placeholder="例：2" ${disabled()}></div>
 <div class="field"><label>最大風速測站（可選）</label><input data-extra="maxStation" value="${H(x.maxStation||'')}" placeholder="例：北水閘門" ${disabled()}></div>
 <div class="field"><label>時雨量測站（可選）</label><input data-extra="rainStation" value="${H(x.rainStation||'')}" placeholder="例：臺西" ${disabled()}></div>
 </div><div class="toolbar form-row"><label class="checkboxline"><input type="checkbox" data-extra="avgUnavailable" ${check('avgUnavailable')} ${disabled()}>平均風速設備故障／無法取得（不填數字，須說明原因）</label></div>
 <div class="field"><label>平均風速未取得原因</label><input data-extra="avgReason" value="${H(x.avgReason||'')}" placeholder="例：中央氣象署六輕測站風速計故障離線" ${disabled()}></div>
 <h3 class="subheading">環保監測與暴雨儲槽</h3><label class="checkboxline"><input type="checkbox" data-extra="monitoringVisited" ${check('monitoringVisited')} ${disabled()}>已親自／線上洽監測中心確認本公司監測數據（未勾選不會寫入報告）</label>
 <div class="datapair" style="margin-top:12px">
 <div class="field"><label>暴雨儲槽液位最小值 (%)</label><input data-extra="storageMin" inputmode="decimal" value="${H(x.storageMin||'')}" placeholder="例：0.2" ${disabled()}></div>
 <div class="field"><label>暴雨儲槽液位最大值 (%)</label><input data-extra="storageMax" inputmode="decimal" value="${H(x.storageMax||'')}" placeholder="例：16.4" ${disabled()}></div>
 <div class="field"><label>儲槽總數／符合門檻數</label><input data-extra="storageCount" inputmode="numeric" value="${H(x.storageCount||'')}" placeholder="例：14" ${disabled()}></div>
 <div class="field"><label>液位上限 (%)</label><input data-extra="storageLimit" inputmode="decimal" value="${H(x.storageLimit??'20')}" placeholder="例：20" ${disabled()}></div>
 </div><div class="hint">儲槽數值需確認全部符合液位上限，才能產生「皆於○%以下」文字；若最大值超過門檻，系統會註明超標，且不能宣稱皆符合。</div>
 <h3 class="subheading">工程施工敘述</h3><div class="datapair"><div class="field"><label>本日施工情形（可選）</label><select data-extra="constructionSummary" ${disabled()}>${opts([['','依 Checklist 概述'],['none','本日廠處皆無工程施工'],['ongoing','目前仍有工程施工'],['stopped','相關工程已暫停'],['other','其他（自行填寫）']],x.constructionSummary||'')}</select></div><div class="field" style="grid-column:span 2"><label>施工補充敘述</label><input data-extra="constructionOther" value="${H(x.constructionOther||'')}" placeholder="施工地點、措施、異常等" ${disabled()}></div></div>`;}
 const group=CHECKS.find(g=>g.group===(state.checkTab||'人員出勤'));if(!group||group.onlyEnd&&s.id!=='end'){state.checkTab='人員出勤';return renderCheckTab(d,s);}
 const rows=group.rows.map(([id,title])=>{const selected=d.checks[id]||'pending';return `<div class="check-row${selected==='pending'?' row-pending':''}"><b>${H(title)}${selected==='pending'?'<span class="missing-label">待確認</span>':''}</b><div class="status-set${marked(`[data-status="${id}"]`)}">${[['normal','正常'],['abnormal','異常'],['na','不適用'],['pending','未確認']].map(([k,v])=>`<label><input type="radio" name="status_${id}" value="${k}" data-status="${id}" ${k===selected?'checked':''} ${disabled()}>${v}</label>`).join('')}</div><input class="note-input${marked(`[data-note="${id}"]`)}" data-note="${id}" placeholder="備註；異常時必填說明" value="${H(d.notes[id]||'')}" ${disabled()}></div>`}).join('');
 if(group.group==='人員出勤')return `<div class="banner">${s.attendance?'此時段須逐單位確認應到／實到人數及前班狀況。':'此時段仍須完成各單位出勤與人員安全確認。'}</div><h3 class="subheading">各單位值勤人員出勤確認</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>單位</th><th>應到人數</th><th>實到人數</th><th>未正常出勤原因／備註</th><th>操作</th></tr></thead><tbody>${d.unitAttendance.map((r,i)=>`<tr><td><input data-unit="${i}" data-prop="unit" placeholder="請輸入單位" value="${H(r.unit)}" ${disabled()}></td><td><input type="number" min="0" step="1" data-unit="${i}" data-prop="expected" value="${H(r.expected)}" ${disabled()}></td><td><input type="number" min="0" step="1" data-unit="${i}" data-prop="actual" value="${H(r.actual)}" ${disabled()}></td><td><input data-unit="${i}" data-prop="note" placeholder="異常原因" value="${H(r.note)}" ${disabled()}></td><td><button class="btn red small" data-delete-unit="${i}" ${disabled()}>移除</button></td></tr>`).join('')}</tbody></table></div><div class="footerbar"><button class="btn secondary small" data-action="add-unit" ${disabled()}>＋新增單位</button></div><h3 class="subheading">人員確認 Checklist</h3>${rows}`;
 if(group.group==='氣象與防汛')return `<h3 class="subheading">氣象資料（手動輸入，不自動推測即時天氣）</h3><div class="datapair">${[['avg','平均風速 (m/s)'],['max','最大風速 (m/s)'],['direction','最大風速風向'],['rain','時雨量 (mm)'],['station','氣象測站（選填）'],['observationTime','觀測時間'],['conditions','天氣描述']].map(([id,label])=>`<div class="field"><label>${label}</label><input data-weather="${id}" value="${H(d.weather[id]||'')}" placeholder="未填" ${id==='avg'&&d.reportExtra?.avgUnavailable?'disabled title="已選擇設備故障，請至通報補充資料填原因"':disabled()}></div>`).join('')}</div><div class="hint">平均風速如因測站設備故障無數字，至「通報補充資料」勾選設備故障並填原因；不可填入假數字。</div><h3 class="subheading">氣象與防汛 Checklist</h3>${rows}`;
 if(group.group==='施工與巡查')return `<h3 class="subheading">巡查紀錄（視安全條件執行）</h3><div class="toolbar"><div class="field"><label>本時段巡查結果${s.patrol?'（本時段需填）':''}</label><select data-patrol="result" ${disabled()}>${opts([['','尚未選擇'],['done','已入廠巡查'],['unsafe','因天候不佳，安全考量未入廠巡查'],['na','本時段不適用']],d.patrol.result)}</select></div><div class="field"><label>實際巡查時間</label><input data-patrol="time" type="text" placeholder="例如 11:20" value="${H(d.patrol.time)}" ${disabled()}></div><div class="field" style="flex:2"><label>巡查說明／未巡查原因</label><input data-patrol="note" placeholder="請填寫巡查結果或天候安全原因" value="${H(d.patrol.note)}" ${disabled()}></div></div><div class="banner warning">依原核定報告「視天氣狀況」上、下午各巡查一趟，颱風期間切勿為了完成打勾而冒險巡查。</div><h3 class="subheading">施工與巡查 Checklist</h3>${rows}`;
 if(group.onlyEnd)return `<div class="banner">備勤結束該班值勤人員，必須在下哨前再次確認並通報；無法改善的異常事項需持續跟催與交接。</div>${rows}`;
 return rows;
}
function renderIncidentTable(eventId){const items=state.incidents.filter(x=>x.eventId===eventId).sort((a,b)=>(b.at||'').localeCompare(a.at||''));if(!items.length)return `<p class="hint">目前無異常事項。請注意：此敘述只表示系統尚未登錄異常，不代表現場已完成檢查。</p>`;
 return `<div class="table-wrap"><table class="data-table"><thead><tr><th>發現時間</th><th>異常項目</th><th>說明／處置</th><th>照片及通報</th><th>追蹤</th><th>管理</th></tr></thead><tbody>${items.map(x=>`<tr><td>${H(x.at)}</td><td>${H(x.title)}</td><td>${H(x.details)}<hr>${H(x.action)}</td><td>群組：${x.groupNotified?'是':'否'}<br>主管：${x.supervisorContacted?'是':'否'}<br>照片：${x.photoAttached?'是':'否'}</td><td><span class="tag ${x.closed?'ok':'bad'}">${x.closed?'已結案':'未結案'}</span></td><td><button class="btn small secondary" data-edit-incident="${x.id}" ${disabled()}>編輯</button></td></tr>`).join('')}</tbody></table></div>`;}
function buildReport(d){const e=eventNow(),s=slotNow();if(!e)return '';const settings=state.settings.find(x=>x.id==='general')||{};const recipient=settings.recipient||'資總、副總及資深經理';const extra=d.reportExtra||{},w=d.weather||{},cases=d.checks||{},persons=state.staff.filter(x=>(d.peopleIds||[]).includes(x.id));const names=persons.map(x=>x.name).join('、')||'【待選值勤人員】';
 const weatherDescription=clean(w.conditions)?clean(w.conditions):'【待填風雨現況】';const stormName=/颱風$/.test(e.name)?e.name:e.name+'颱風';
 const executive=clean(extra.executives)&&clean(extra.executivesCount)?`本日${clean(extra.executives)}等${clean(extra.executivesCount)}位經營主管出勤，`:'';
 const avg=extra.avgUnavailable?`平均風速-m/s（${clean(extra.avgReason)||'【待填設備故障原因】'}）`:`平均風速${clean(w.avg)||'【待填】'}m/s`;
 const wind=`最大風速為${clean(extra.maxStation)||''}${clean(extra.maxStation)?'測站':''}${clean(w.max)||'【待填】'}m/s（風向${clean(w.direction)||'【待填】'}）`;
 const rain=`${clean(extra.rainStation)||clean(w.station)||''}${clean(extra.rainStation||w.station)?'測站':''}時雨量為${clean(w.rain)||'【待填】'}mm`;
 const intro=`${executive}安衛處(${e.factory})由${names}輪值颱風值勤，目前${e.factory}廠區${weatherDescription}，${avg}、${wind}，${rain}。`;
 const attRows=(d.unitAttendance||[]).filter(r=>clean(r.unit));const allAtt=attRows.length&&attRows.every(r=>r.expected!==''&&r.actual!=='');const actual=attRows.reduce((n,r)=>n+Number(r.actual||0),0);
 const shift=s.id==='08'?'早班':s.id==='00'?'夜班':'本時段';
 const attendance=allAtt?`各單位人員${shift}出勤${actual}人`:`各單位人員${shift}出勤【${s.attendance?'待填應到／實到人數':'依本時段確認'}】`;
 const st=k=>cases[k]||'pending';const single=(k,name)=>st(k)==='normal'?`${name}正常`:st(k)==='abnormal'?`${name}異常${clean(d.notes?.[k])?'（'+clean(d.notes[k])+'）':''}`:st(k)==='na'?`${name}不適用`:`${name}【待確認】`;
 const equipment=(st('production')==='normal'&&st('pollution')==='normal')?'生產製程設備及環保污染防治設備運轉狀況正常':`${single('production','生產製程設備')}、${single('pollution','環保污染防治設備')}`;
 const monitor=(st('cwms')==='normal'&&st('cems')==='normal')?`線上確認CWMS、CEMS${extra.monitoringVisited?'並至監測中心瞭解本公司監測數據':''}均正常`:`${single('cwms','CWMS線上監測')}、${single('cems','CEMS線上監測')}${extra.monitoringVisited?'（另已向監測中心確認）':''}`;
 const tankFields=['storageMin','storageMax','storageCount'];const tanksComplete=tankFields.every(k=>clean(extra[k]));const tankAny=tankFields.some(k=>clean(extra[k]));let tank='';
 if(tanksComplete){const min=Number(extra.storageMin),max=Number(extra.storageMax),limit=Number(extra.storageLimit||20);tank=`${e.factory}廠區暴雨儲槽目前液位介於${min}%〜${max}%間，${Number(extra.storageCount)}個儲槽${max<=limit?`液位皆於${limit}%以下`:`最高液位已超過${limit}%門檻，須確認並處置`}`;}
 else if(tankAny){tank=`${e.factory}廠區暴雨儲槽液位資料尚未填寫完整【請補齊液位區間及儲槽數】`;}
 else {tank=`${e.factory}廠區暴雨儲槽${st('buffer')==='normal'?'液位檢查正常（未填液位數據）':st('buffer')==='abnormal'?'液位異常'+(d.notes?.buffer?'（'+d.notes.buffer+'）':''):st('buffer')==='na'?'不適用':'狀況【待確認】'}`;}
 const construction=extra.constructionSummary==='none'?'本日廠處皆無工程施工':extra.constructionSummary==='ongoing'?`本日仍有工程施工${clean(extra.constructionOther)?'，'+clean(extra.constructionOther):''}`:extra.constructionSummary==='stopped'?`本日相關工程已暫停${clean(extra.constructionOther)?'，'+clean(extra.constructionOther):''}`:extra.constructionSummary==='other'?clean(extra.constructionOther)||'【待填本日施工情況】':single('construction','施工現場狀況');
 const p=d.patrol||{};let patrol='值勤人員將依計畫入廠巡視現場狀況並適時回報';
 if(p.result==='done')patrol=`值勤人員已於${clean(p.time)||'【待填巡查時間】'}完成${s.patrol==='morning'?'上午':s.patrol==='afternoon'?'下午':'本時段'}廠區巡查，${clean(p.note)||'巡查結果已依Checklist確認'}`;
 else if(p.result==='unsafe')patrol=`因風雨及現場安全考量，暫緩入廠巡查，原因：${clean(p.note)||'【待填未巡查原因】'}；將持續掌握廠區狀況並適時回報`;
 else if(p.result==='na'&&s.patrol)patrol=`本時段巡查記錄為不適用${clean(p.note)?'（'+clean(p.note)+'）':''}，請確認實際天候及值勤規定`;
 else if(s.patrol)patrol=`${s.patrol==='morning'?'上午':'下午'}巡查結果【尚未確認】`;
 const incidents=state.incidents.filter(x=>x.eventId===e.id);const bad=incidents.length?'\n三、異常事項及後續處理\n'+incidents.map((x,i)=>`${i+1}.${x.title}：${x.details}；處置：${x.action||'尚未填寫'}；${x.closed?'已改善':'持續追蹤'}。`).join('\n'):'';
 const end=s.id==='end'?'\n三、備勤結束最後確認\n'+CHECKS.find(x=>x.onlyEnd).rows.map(([id,label],i)=>`${i+1}.${single(id,label)}。`).join('\n'):'';
 return `報告  ${recipient}:
安衛處(${e.factory})回報${stormName}來襲期間，${e.factory}廠區目前動態重點說明如下:
${intro}

一、廠區狀況
1.${attendance}、${equipment}。
2.${monitor}。
3.${tank}。
4.${construction}。

二、${patrol}。${bad}${end}`;
}
function validateDraftDetails(d){const issues=[],s=slotNow();const checks=d.checks||{},w=d.weather||{},x=d.reportExtra||{};
 const add=(id,tab,label,selector)=>issues.push({id,tab,label,selector});
 if(!d.peopleIds?.length)add('people','人員出勤','請選擇本時段值勤人員','.slot.selected .duty-picker summary');
 if(!d.reportDate)add('date','人員出勤','請選擇回報日期','[data-global="reportDate"]');
 for(const section of CHECKS){if(section.onlyEnd&&s.id!=='end')continue;for(const [id,title] of section.rows){const v=checks[id]||'pending';if(v==='pending')add('status:'+id,section.group,`${title}：尚未確認`,`[data-status="${id}"]`);if(v==='abnormal'&&!clean(d.notes?.[id]))add('note:'+id,section.group,`${title}：異常必填說明`,`[data-note="${id}"]`);}}
 if(s.attendance){if(!d.unitAttendance?.length)add('units','人員出勤','至少建立一個出勤單位','[data-action="add-unit"]');for(let i=0;i<(d.unitAttendance||[]).length;i++){const r=d.unitAttendance[i];if(!clean(r.unit))add('unit:'+i+':unit','人員出勤',`第${i+1}列：未填單位名稱`,`[data-unit="${i}"][data-prop="unit"]`);
 for(const field of ['expected','actual']){if(r[field]===''||!Number.isInteger(Number(r[field]))||Number(r[field])<0)add(`unit:${i}:${field}`,'人員出勤',`第${i+1}列：${field==='expected'?'應到':'實到'}人數須為非負整數`,`[data-unit="${i}"][data-prop="${field}"]`);}
 if(r.expected!==''&&r.actual!==''&&Number(r.expected)!==Number(r.actual)&&!clean(r.note))add(`unit:${i}:note`,'人員出勤',`第${i+1}列：人數差異須填原因`,`[data-unit="${i}"][data-prop="note"]`);}
 if(d.unitAttendance?.some(r=>r.expected!==''&&r.actual!==''&&Number(r.expected)!==Number(r.actual))&&checks.attendance==='normal')add('attendance-mismatch','人員出勤','出勤人數有差異，不可勾選正常','[data-status="attendance"]');}
 if(s.patrol&&!d.patrol?.result)add('patrol:result','施工與巡查','本時段必須確認巡查結果','[data-patrol="result"]');
 if(d.patrol?.result==='unsafe'&&!clean(d.patrol.note))add('patrol:note','施工與巡查','因天候未巡查必填安全原因','[data-patrol="note"]');
 if(d.patrol?.result==='done'&&s.patrol&&!clean(d.patrol.time))add('patrol:time','施工與巡查','完成巡查必填實際時間','[data-patrol="time"]');
 for(const [key,name] of [['avg','平均風速'],['max','最大風速'],['direction','風向'],['rain','時雨量'],['observationTime','觀測時間'],['conditions','天氣描述']]){
 if(key==='avg'&&x.avgUnavailable)continue;
 if(!clean(w[key]))add('weather:'+key,'氣象與防汛',`氣象資料：${name}未填`,`[data-weather="${key}"]`);
 }
 if(x.avgUnavailable&&!clean(x.avgReason))add('extra:avgReason','通報補充資料','平均風速設備異常須填原因','[data-extra="avgReason"]');
 for(const key of ['avg','max','rain']){if(key==='avg'&&x.avgUnavailable)continue;if(clean(w[key])&&(!Number.isFinite(Number(w[key]))||Number(w[key])<0))add('weather-number:'+key,'氣象與防汛',`${key==='avg'?'平均風速':key==='max'?'最大風速':'時雨量'}須為非負數值`,`[data-weather="${key}"]`);}
 if((clean(x.executives)||clean(x.executivesCount))&&(!clean(x.executives)||!Number.isInteger(Number(x.executivesCount))||Number(x.executivesCount)<1))add('extra:executives','通報補充資料','已填經營主管資料，須同時填姓名與正整數人數',!clean(x.executives)?'[data-extra="executives"]':'[data-extra="executivesCount"]');
 const tankKeys=['storageMin','storageMax','storageCount'];if(tankKeys.some(k=>clean(x[k])))for(const k of tankKeys){if(!clean(x[k])||!Number.isFinite(Number(x[k]))||Number(x[k])<0||(k==='storageCount'&&(!Number.isInteger(Number(x[k]))||Number(x[k])<1)))add('extra:'+k,'通報補充資料',`暴雨儲槽${{storageMin:'最低液位',storageMax:'最高液位',storageCount:'儲槽總數'}[k]}須填正確數值`,`[data-extra="${k}"]`);}
 if(tankKeys.every(k=>clean(x[k])&&Number.isFinite(Number(x[k])))){if(Number(x.storageMin)>Number(x.storageMax))add('extra:storageRange','通報補充資料','儲槽最低液位不可大於最高液位','[data-extra="storageMin"]');if(Number(x.storageMax)>100)add('extra:storageRangeMax','通報補充資料','儲槽液位不可超過100%','[data-extra="storageMax"]');if(Number(x.storageMax)>Number(x.storageLimit||20)&&checks.buffer==='normal')add('extra:tankOverflow','氣象與防汛','儲槽最大液位超過設定門檻，不能將液位狀況勾選正常','[data-status="buffer"]');}
 if(x.constructionSummary==='other'&&!clean(x.constructionOther))add('extra:constructionOther','通報補充資料','施工情形選其他，須填補充說明','[data-extra="constructionOther"]');
 return issues;}
function validateDraft(d){return validateDraftDetails(d).map(x=>x.label);}
function renderEvents(){return panel('1','颱風事件管理',`${ownerBlock()}<div class="toolbar"><button class="btn" data-action="open-event" ${disabled()}>＋新增颱風事件</button><button class="btn secondary" data-action="excel">匯出完整 Excel</button></div><div class="banner">相同颱風可依不同廠區分別建事件。廠區包含麥寮、彰化、龍德、新港、台北；颱風事件與各時段通報均個別留存。</div>${state.events.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>颱風</th><th>廠區</th><th>事件日期</th><th>已存回報</th><th>操作</th></tr></thead><tbody>${state.events.map(e=>`<tr><td>${H(e.name)}</td><td>${H(e.factory)}</td><td>${H(e.date)}</td><td>${state.reports.filter(r=>r.eventId===e.id).length} / ${SLOTS.length}</td><td><button class="btn small secondary" data-open-event="${e.id}">開啟</button> <button class="btn small secondary" data-edit-event="${e.id}" ${disabled()}>修改</button> <button class="btn small red" data-delete-event="${e.id}" ${disabled()}>刪除</button></td></tr>`).join('')}</tbody></table></div>`:empty('尚未建立事件')}`);}
function renderPeople(){const filter=state.staffFilter||'全部';const people=state.staff.filter(p=>filter==='全部'||p.factory===filter);return panel('1','值勤人員基本資料管理',`${ownerBlock()}<div class="toolbar"><div class="field" style="max-width:250px"><label>篩選廠區</label><select data-global="staffFilter">${opts([['全部','全部廠區'],...FACTORIES.map(x=>[x,x])],filter)}</select></div><button class="btn" data-action="open-person" ${disabled()}>＋新增值勤人員</button></div><div class="hint">可新增、修改、停用人員；各時段下拉選單僅顯示所選廠區的啟用人員。既有通報內容另存文字快照，日後修改人員不會改寫已完成通報。</div>${people.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>姓名</th><th>廠區</th><th>單位</th><th>職稱／職務</th><th>電話</th><th>狀態</th><th>操作</th></tr></thead><tbody>${people.map(x=>`<tr><td>${H(x.name)}</td><td>${H(x.factory)}</td><td>${H(x.unit)}</td><td>${H(x.job)}</td><td>${H(x.phone)}</td><td><span class="tag ${x.active!==false?'ok':'warn'}">${x.active!==false?'啟用':'停用'}</span></td><td><button class="btn secondary small" data-edit-person="${x.id}" ${disabled()}>編輯</button> <button class="btn red small" data-delete-person="${x.id}" ${disabled()}>刪除</button></td></tr>`).join('')}</tbody></table></div>`:empty('此廠區目前沒有值勤人員資料')}`);}
function renderRules(){const section=SECTIONS.find(s=>s.id===state.sectionId)||SECTIONS[0],revision=state.rules.find(r=>r.id===section.id),notes=state.notes.filter(n=>n.sectionId===section.id).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')),revisions=state.revisions.filter(r=>r.sectionId===section.id).sort((a,b)=>(b.at||'').localeCompare(a.at||''));const href='assets/安全衛生處颱風出勤作業原則報告_原件.pdf';return panel('1','颱風值勤規定公告欄',`<div class="banner">本公告收錄原始PDF的所有章節、通報範例與主管手寫批示閱覽指引。<b>核定原文與增修訂公告分離保存。</b>手寫批示部分字跡不明者，請對照原始掃描，不能將推測轉錄視為核定內容。 <a href="${href}" target="_blank" rel="noopener">檢視原始核定PDF（3頁） ↗</a></div><div class="rule-layout"><div class="rules-list">${SECTIONS.map(s=>`<button data-rule-section="${s.id}" class="${s.id===section.id?'active':''}">${H(s.title)}<br><span class="hint">${H(s.page)}</span></button>`).join('')}</div><div><h3 class="subheading">${H(section.title)} <span class="tag">${H(section.page)}</span></h3><div class="hint">下方為原報告排版整理文字（掃描辨識有疑義時以原件為準）。</div><div class="rule-source">${H(section.text)}</div><h3 class="subheading">增修訂公告（獨立於核定原文）</h3>${revision?`<div class="banner">第 ${H(revision.version||1)} 版｜更新：${H(revision.updatedAt||'')}<br><span class="inline-data">${H(revision.text||'')}</span></div>`:'<p class="hint">此章目前尚無增修訂公告。</p>'}${isOwner()?`<div class="field"><label>編輯本章補充／修訂公告（不影響原PDF）</label><textarea id="ruleEdit" rows="5" placeholder="請輸入新增或修訂內容">${H(revision?.text||'')}</textarea></div><div class="footerbar"><button class="btn" data-action="save-rule">儲存修訂並保留版本歷程</button></div>`:ownerBlock()}<h3 class="subheading">備註管理</h3>${notes.map(n=>`<div class="comment"><div class="meta">${H(n.createdAt)}｜${H(n.author||'管理員')}</div><div class="inline-data">${H(n.text)}</div>${isOwner()?`<div class="actions"><button class="btn small secondary" data-edit-note="${n.id}">修改</button><button class="btn small red" data-delete-note="${n.id}">刪除</button></div>`:''}</div>`).join('')||'<p class="hint">尚無備註。</p>'}${isOwner()?`<div class="field form-row"><label>新增備註（可獨立增修訂）</label><textarea id="newNote" rows="3" placeholder="例如：值勤執行補充事項"></textarea></div><button class="btn secondary" data-action="add-note">＋新增備註</button>`:''}<h3 class="subheading">增修訂歷程（${revisions.length}筆）</h3>${revisions.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>日期</th><th>版本／動作</th><th>內容快照</th></tr></thead><tbody>${revisions.map(r=>`<tr><td>${H(r.at)}</td><td>${H(r.action)} ${H(r.version||'')}</td><td class="inline-data">${H(r.text).slice(0,300)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="hint">尚無修訂紀錄。</p>'}</div></div>`);}
function renderHistory(){const history=state.reports.filter(r=>!state.historyFactory||r.factory===state.historyFactory||state.events.find(e=>e.id===r.eventId)?.factory===state.historyFactory).sort((a,b)=>(b.savedAt||'').localeCompare(a.savedAt||''));return panel('1','歷史通報與Excel紀錄',`<div class="toolbar"><div class="field" style="max-width:230px"><label>篩選廠區</label><select data-global="historyFactory">${opts([['','全部廠區'],...FACTORIES.map(x=>[x,x])],state.historyFactory||'')}</select></div><button class="btn green" data-action="excel">匯出完整 Excel（.xlsx）</button></div>${history.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>颱風／廠區</th><th>時段</th><th>回報日期</th><th>狀態</th><th>保存時間</th><th>操作</th></tr></thead><tbody>${history.map(r=>{const e=state.events.find(x=>x.id===r.eventId);return `<tr><td>${H(e?.name||'已刪事件')}／${H(e?.factory||'')}</td><td>${H(SLOTS.find(s=>s.id===r.slotId)?.time||r.slotId)}</td><td>${H(r.reportDate)}</td><td><span class="tag ${r.status==='final'?'ok':'warn'}">${r.status==='final'?'正式通報':'草稿'}</span></td><td>${H(r.savedAt)}</td><td><button class="btn secondary small" data-view-report="${r.id}">檢視文字</button> <button class="btn small secondary" data-load-report="${r.id}">回到Checklist</button></td></tr>`;}).join('')}</tbody></table></div>`:empty('尚無儲存過的通報紀錄')}`);}
function renderSettings(){const s=state.settings.find(x=>x.id==='general')||{},units=s.units||{};return panel('1','系統設定',`<div class="banner warning">正式模式採用既有 EHS Firebase 登入，寫入權限僅限已驗證的 EHS 入口管理員帳號，並須由 Firestore Rules 實際強制執行。登入頁面本身不能取代安全規則。</div><div class="field" style="max-width:460px"><label>通報稱謂（可由管理員修改）</label><input id="recipientSetting" value="${H(s.recipient||'資總、副總及資深經理')}" ${disabled()}></div><h3 class="subheading">各廠區預設出勤單位（選填）</h3><div class="hint">僅供新增時段Checklist時建立空白人數列，不代表當次實到。每行一個單位名稱，手動變更已存通報不會受影響。</div><div class="staff-grid">${FACTORIES.map(f=>`<div class="field"><label>${f}</label><textarea data-setting-units="${H(f)}" rows="4" placeholder="每行一個單位名稱" ${disabled()}>${H((units[f]||[]).join('\n'))}</textarea></div>`).join('')}</div><div class="footerbar"><button class="btn" data-action="save-settings" ${disabled()}>儲存系統設定</button></div><hr><p><b>運作模式：</b>${mode==='demo'?'本機示範（非正式資料）':'正式 Firebase Firestore'}</p><p><b>目前登入：</b>${H(currentUser()?.email||'未登入')}</p><p><b>管理者帳號：</b>${H(ownerEmail||'尚未取得')}</p>${mode==='firebase'?`<button class="btn secondary" data-action="logout">登出 Firebase</button>`:''}<p class="hint">更新程式不會自動刪除 Firestore 資料。請先閱讀部署說明再進行正式上線。</p>`);}
function dialog(content){const e=document.createElement('div');e.className='modal-shade';e.id='dialog';e.innerHTML=`<div class="modal" role="dialog" aria-modal="true">${content}</div>`;document.body.appendChild(e);e.addEventListener('click',event=>{if(event.target===e)e.remove();});}
const closeDialog=()=>$('#dialog')?.remove();
function modalEvent(id){const e=state.events.find(x=>x.id===id)||{id:'',name:'',factory:'麥寮',date:today()};dialog(`<h2>${id?'修改':'新增'}颱風事件</h2><form id="eventForm"><input type="hidden" name="id" value="${H(e.id)}"><div class="field form-row"><label>颱風名稱</label><input name="name" required value="${H(e.name)}" placeholder="例如：山陀兒颱風"></div><div class="field form-row"><label>廠區</label><select name="factory">${opts(FACTORIES.map(x=>[x,x]),e.factory)}</select></div><div class="field form-row"><label>事件日期</label><input name="date" type="date" required value="${H(e.date)}"></div><div class="actions"><button type="submit" class="btn">${id?'儲存修改':'建立事件'}</button><button type="button" class="btn secondary" data-action="close-dialog">取消</button></div></form>`);}
function modalPerson(id){const p=state.staff.find(x=>x.id===id)||{id:'',name:'',factory:eventNow()?.factory||'麥寮',unit:'',job:'',phone:'',active:true};dialog(`<h2>${id?'修改':'新增'}值勤人員</h2><form id="personForm"><input name="id" type="hidden" value="${H(p.id)}"><div class="field form-row"><label>姓名（必填）</label><input name="name" required value="${H(p.name)}"></div><div class="field form-row"><label>廠區</label><select name="factory">${opts(FACTORIES.map(x=>[x,x]),p.factory)}</select></div><div class="field form-row"><label>單位</label><input name="unit" value="${H(p.unit)}"></div><div class="field form-row"><label>職務／職稱</label><input name="job" value="${H(p.job)}"></div><div class="field form-row"><label>聯絡電話（選填）</label><input name="phone" value="${H(p.phone)}"></div><label class="checkboxline form-row"><input type="checkbox" name="active" ${p.active!==false?'checked':''}> 啟用（顯示於該廠區值勤選單）</label><div class="actions"><button class="btn" type="submit">儲存</button><button class="btn secondary" type="button" data-action="close-dialog">取消</button></div></form>`);}
function modalIncident(id){const inc=state.incidents.find(x=>x.id===id)||{id:'',eventId:state.eventId,at:now(),title:'',details:'',action:'',groupNotified:false,supervisorContacted:false,photoAttached:false,closed:false};dialog(`<h2>${id?'修改':'新增'}異常即時通報</h2><div class="banner warning">異常發生應即時於群組回報並主動聯絡主管；本系統不會自動發送LINE，亦不儲存照片。</div><form id="incidentForm"><input type="hidden" name="id" value="${H(inc.id)}"><div class="field form-row"><label>發現時間</label><input name="at" value="${H(inc.at)}" required></div><div class="field form-row"><label>異常項目</label><input name="title" value="${H(inc.title)}" required></div><div class="field form-row"><label>異常情況描述</label><textarea name="details" rows="3" required>${H(inc.details)}</textarea></div><div class="field form-row"><label>處置措施／後續追蹤</label><textarea name="action" rows="3">${H(inc.action)}</textarea></div><div class="form-row"><label class="checkboxline"><input name="groupNotified" type="checkbox" ${inc.groupNotified?'checked':''}>已即時群組通報</label></div><div class="form-row"><label class="checkboxline"><input name="supervisorContacted" type="checkbox" ${inc.supervisorContacted?'checked':''}>已主動聯絡主管</label></div><div class="form-row"><label class="checkboxline"><input name="photoAttached" type="checkbox" ${inc.photoAttached?'checked':''}>已在外部群組附照片／影片</label></div><div class="form-row"><label class="checkboxline"><input name="closed" type="checkbox" ${inc.closed?'checked':''}>本事件已完成改善／結案</label></div><div class="actions"><button type="submit" class="btn">儲存異常紀錄</button>${id?`<button type="button" class="btn red" data-delete-incident="${id}">刪除本異常</button>`:''}<button type="button" class="btn secondary" data-action="close-dialog">取消</button></div></form>`);}
function modalText(title,text){dialog(`<h2>${H(title)}</h2><div class="preview" style="max-height:65vh">${H(text)}</div><div class="actions form-row"><button class="btn green" data-copy-text="${H(text)}">複製此筆原始通報</button><button class="btn secondary" data-action="close-dialog">關閉</button></div>`);}
function formValues(form){const fd=new FormData(form),obj=Object.fromEntries(fd.entries());for(const c of ['active','groupNotified','supervisorContacted','photoAttached','closed'])if(form.elements.namedItem(c))obj[c]=Boolean(form.elements.namedItem(c).checked);return obj;}
async function guarded(f){if(!isOwner()){toast('此帳號為唯讀，無法修改','error');return;}try{await f();}catch(e){console.error(e);toast('操作失敗：'+e.message,'error');}}
async function saveReport(final=false){await guarded(async()=>{const e=eventNow(),d=draft();if(!e)throw Error('請先建立事件');if(final){const errs=validateDraft(d);if(errs.length){updateValidationUI();document.querySelector('#validationPanel')?.scrollIntoView({behavior:'smooth',block:'center'});dialog(`<h2>無法完成通報</h2><p>尚有 ${errs.length} 項需要修正：</p><div class="preview" style="max-height:45vh">${H(errs.map((x,i)=>`${i+1}. ${x}`).join('\n'))}</div><button class="btn secondary form-row" data-action="close-dialog">返回修正</button>`);return;}}
 const stored=state.reports.find(x=>x.id===d.id);if(stored?.status==='final'&&!final&&!confirm('這筆已完成通報，重新儲存草稿會改為草稿狀態，確定嗎？'))return;
 const value=structuredClone(d);value.status=final?'final':'draft';value.savedAt=now();value.factory=e.factory;value.name=e.name;value.personnelSnapshot=value.peopleIds.map(id=>state.staff.find(p=>p.id===id)).filter(Boolean).map(p=>({name:p.name,unit:p.unit,job:p.job,id:p.id}));value.reportText=buildReport(d);await saveDoc('reports',value);state.reports=state.reports.filter(x=>x.id!==value.id).concat(value);state.drafts[draftKey()]=structuredClone(value);toast(final?'正式通報已保存（請自行複製並發送LINE）':'草稿已保存');render();});}
function saveFormToDraft(el){if(!state.eventId||!isOwner())return;const d=draft();if(el.dataset.field)d[el.dataset.field]=el.value;
 if(el.dataset.status){d.checks[el.dataset.status]=el.value;}
 if(el.dataset.note)d.notes[el.dataset.note]=el.value;
 if(el.dataset.weather)d.weather[el.dataset.weather]=el.value;
 if(el.dataset.patrol)d.patrol[el.dataset.patrol]=el.value;
 if(el.dataset.extra){d.reportExtra ||= {};d.reportExtra[el.dataset.extra]=el.type==='checkbox'?el.checked:el.value;}
 if(el.dataset.unit!==undefined){const row=d.unitAttendance[Number(el.dataset.unit)];if(row)row[el.dataset.prop]=el.value;}
 const preview=$('#reportPreview');if(preview)preview.textContent=buildReport(d);
 updateValidationUI();
}
async function exportExcel(){try{const all=state.events.map(e=>[e.id,e.name,e.factory,e.date]),r=state.reports,inc=state.incidents;const filtered=state.historyFactory?state.events.filter(e=>e.factory===state.historyFactory):state.events;const eventIds=new Set(filtered.map(e=>e.id));const tables=[{name:'颱風事件',rows:[['事件ID','颱風名稱','廠區','事件日期'],...filtered.map(e=>[e.id,e.name,e.factory,e.date])]},{name:'各時段回報',rows:[['事件','廠區','回報日期','時段','狀態','值勤人員','儲存時間','完整通報內容'],...r.filter(x=>eventIds.has(x.eventId)).map(x=>[x.name,x.factory,x.reportDate,SLOTS.find(s=>s.id===x.slotId)?.time||x.slotId,x.status==='final'?'正式':'草稿',(x.personnelSnapshot||[]).map(p=>p.name).join('、'),x.savedAt,x.reportText])]},{name:'Checklist',rows:[['颱風事件ID','回報日期','時段','檢查項目','結果','備註'],...r.filter(x=>eventIds.has(x.eventId)).flatMap(x=>CHECKS.flatMap(c=>c.rows.map(([id,label])=>[x.eventId,x.reportDate,x.slotId,label,stText[x.checks?.[id]||'pending'],x.notes?.[id]||''])))]},{name:'出勤人數',rows:[['事件ID','日期','時段','單位','應到','實到','備註'],...r.filter(x=>eventIds.has(x.eventId)).flatMap(x=>(x.unitAttendance||[]).map(u=>[x.eventId,x.reportDate,x.slotId,u.unit,u.expected,u.actual,u.note]))]},{name:'異常事件',rows:[['事件ID','時間','異常項目','說明','處置','群組已通報','主管已聯絡','外部照片已附','已結案'],...inc.filter(x=>eventIds.has(x.eventId)).map(x=>[x.eventId,x.at,x.title,x.details,x.action,x.groupNotified?'是':'否',x.supervisorContacted?'是':'否',x.photoAttached?'是':'否',x.closed?'是':'否'])]},{name:'值勤人員名單',rows:[['姓名','廠區','單位','職務','電話','啟用'],...state.staff.filter(p=>!state.historyFactory||p.factory===state.historyFactory).map(p=>[p.name,p.factory,p.unit,p.job,p.phone,p.active!==false?'是':'否'])]}];downloadBlob(workbook(tables),`安衛處颱風值勤紀錄_${today()}.xlsx`);toast('已產生 Excel 活頁簿');}catch(e){toast('Excel 匯出失敗：'+e.message,'error');}}
// 以事件委派方式綁定控制項，切換畫面後仍維持操作。
document.addEventListener('click',async ev=>{const login=ev.target.closest('[data-action="google-login"]');if(login){login.disabled=true;try{await signInGoogle();toast('Google 登入成功');}catch(e){toast('Google 登入未完成：'+e.message,'error');}finally{login.disabled=false;}return;}

 const b=ev.target.closest('[data-tab],[data-action],[data-slot],[data-check-tab],[data-rule-section],[data-edit-person],[data-delete-person],[data-edit-event],[data-delete-event],[data-open-event],[data-edit-incident],[data-delete-incident],[data-view-report],[data-load-report],[data-delete-unit],[data-edit-note],[data-delete-note],[data-copy-text],[data-focus-issue]');if(!b)return;
 if(b.dataset.focusIssue){const item=validateDraftDetails(draft()).find(x=>x.id===b.dataset.focusIssue);focusIssue(item);return;}
 if(b.dataset.tab){setTab(b.dataset.tab);return;}
 if(b.dataset.slot){state.slotId=b.dataset.slot;state.checkTab='人員出勤';render();return;}
 if(b.dataset.checkTab){state.checkTab=b.dataset.checkTab;render();return;}
 if(b.dataset.ruleSection){state.sectionId=b.dataset.ruleSection;render();return;}
 if(b.dataset.openEvent){state.eventId=b.dataset.openEvent;state.reportDate=eventNow()?.date||today();state.slotId='08';setTab('duty');return;}
 if(b.dataset.editEvent){modalEvent(b.dataset.editEvent);return;}
 if(b.dataset.editPerson){modalPerson(b.dataset.editPerson);return;}
 if(b.dataset.editIncident){modalIncident(b.dataset.editIncident);return;}
 if(b.dataset.viewReport){const r=state.reports.find(x=>x.id===b.dataset.viewReport);if(r)modalText(`${r.name} ${SLOTS.find(s=>s.id===r.slotId)?.time||''}－原始儲存通報`,r.reportText||'無報告快照');return;}
 if(b.dataset.loadReport){const r=state.reports.find(x=>x.id===b.dataset.loadReport);if(r){state.eventId=r.eventId;state.reportDate=r.reportDate;state.slotId=r.slotId;delete state.drafts[draftKey()];setTab('duty');}return;}
 if(b.dataset.deleteUnit!==undefined){await guarded(async()=>{const rows=draft().unitAttendance;if(rows.length<=1){toast('請至少保留一個單位輸入列','error');return;}rows.splice(Number(b.dataset.deleteUnit),1);draft().status='draft';render();});return;}
 if(b.dataset.editNote){const item=state.notes.find(n=>n.id===b.dataset.editNote);if(!item)return;dialog(`<h2>修改本章備註</h2><form id="editNoteForm"><input type="hidden" name="id" value="${H(item.id)}"><textarea class="plain-input" name="text" rows="6" required>${H(item.text)}</textarea><div class="actions form-row"><button class="btn" type="submit">儲存備註</button><button type="button" class="btn secondary" data-action="close-dialog">取消</button></div></form>`);return;}
 if(b.dataset.deleteNote){await guarded(async()=>{if(!confirm('確定刪除此筆備註？修訂歷程仍會保留刪除記錄。'))return;const n=state.notes.find(x=>x.id===b.dataset.deleteNote);await saveDoc('revisions',{id:makeId(),sectionId:n.sectionId,at:now(),action:'刪除備註',text:n.text,version:''});await deleteDoc('notes',n.id);toast('備註已刪除，保留修訂紀錄');await refresh();});return;}
 if(b.dataset.deletePerson){await guarded(async()=>{const id=b.dataset.deletePerson;const inUse=state.reports.some(r=>r.peopleIds?.includes(id));if(inUse){toast('此人員已有值勤紀錄，請改為「停用」以保留歷史關聯','error');return;}if(!confirm('確定刪除此人員？'))return;await deleteDoc('staff',id);for(const key of Object.keys(state.drafts))state.drafts[key].peopleIds=state.drafts[key].peopleIds?.filter(x=>x!==id)||[];toast('已刪除');await refresh();});return;}
 if(b.dataset.deleteEvent){await guarded(async()=>{const id=b.dataset.deleteEvent;const r=state.reports.filter(x=>x.eventId===id),incc=state.incidents.filter(x=>x.eventId===id);if(!confirm(`確定永久刪除這筆颱風事件、其 ${r.length} 筆通報與 ${incc.length} 筆異常？此操作不可還原。建議先匯出Excel備份。`))return;for(const x of r)await deleteDoc('reports',x.id);for(const x of incc)await deleteDoc('incidents',x.id);await deleteDoc('events',id);state.eventId='';state.reportDate='';Object.keys(state.drafts).filter(k=>k.startsWith(id+'__')).forEach(k=>delete state.drafts[k]);toast('事件已刪除');await refresh();});return;}
 if(b.dataset.deleteIncident){await guarded(async()=>{if(!confirm('確定刪除此異常紀錄？'))return;await deleteDoc('incidents',b.dataset.deleteIncident);closeDialog();await refresh();});return;}
 if(b.dataset.copyText!==undefined){try{await navigator.clipboard.writeText(b.dataset.copyText);toast('已複製原始通報內容');}catch(e){toast('複製失敗，請手動選取內容','error');}return;}
 const action=b.dataset.action;if(!action)return;
 if(action==='close-dialog'){closeDialog();return;}
 if(action==='refresh'){await refresh();return;}
 if(action==='open-event'){modalEvent();return;}
 if(action==='open-person'){modalPerson();return;}
 if(action==='open-incident'){if(!eventNow()){toast('請先建立事件','error');return;}modalIncident();return;}
 if(action==='add-unit'){await guarded(async()=>{draft().unitAttendance.push({id:makeId(),unit:'',expected:'',actual:'',note:''});draft().status='draft';render();});return;}
 if(action==='draft-save'){await saveReport(false);return;}
 if(action==='final-save'){await saveReport(true);return;}
 if(action==='preview'){const p=$('#reportPreview');if(p)p.textContent=buildReport(draft());toast('預覽已更新（未確認項目仍會如實呈現）');return;}
 if(action==='copy-report'){const d=draft(),problems=validateDraft(d),saved=reportStored();if(problems.length){updateValidationUI();document.querySelector('#validationPanel')?.scrollIntoView({behavior:'smooth',block:'center'});toast(`尚有 ${problems.length} 項未完成，禁止複製作為正式通報。請先完成Checklist。`,'error');return;}if(!saved||saved.status!=='final'||saved.reportText!==buildReport(d)){toast('請先點選「完成檢查並儲存通報」，以確保複製的是已存正式版','error');return;}
 try{await navigator.clipboard.writeText(saved.reportText);toast('已複製正式通報文字，請自行貼至LINE並檢查發送對象');}catch(e){toast('瀏覽器不支援自動複製，請手動選取通報文字','error');}return;}
 if(action==='excel'){exportExcel();return;}
 if(action==='save-rule'){await guarded(async()=>{const text=clean($('#ruleEdit')?.value),old=state.rules.find(x=>x.id===state.sectionId);if(old?.text===text){toast('未偵測到修訂內容變化');return;}const v=(old?.version||0)+1;await saveDoc('rules',{id:state.sectionId,text,version:v,updatedAt:now(),updatedBy:currentUser()?.uid||'DEMO'});await saveDoc('revisions',{id:makeId(),sectionId:state.sectionId,at:now(),action:'修訂公告',version:v,text,previousText:old?.text||''});toast('修訂已儲存，原始核定內容不受影響');await refresh();});return;}
 if(action==='add-note'){await guarded(async()=>{const text=clean($('#newNote')?.value);if(!text)throw Error('備註不得空白');const id=makeId();await saveDoc('notes',{id,sectionId:state.sectionId,text,createdAt:now(),author:currentUser()?.email||'管理員'});await saveDoc('revisions',{id:makeId(),sectionId:state.sectionId,at:now(),action:'新增備註',text,version:''});toast('備註已新增');await refresh();});return;}
 if(action==='save-settings'){await guarded(async()=>{const units={};document.querySelectorAll('[data-setting-units]').forEach(x=>units[x.dataset.settingUnits]=x.value.split(/\r?\n/).map(clean).filter(Boolean));await saveDoc('settings',{id:'general',recipient:clean($('#recipientSetting').value)||'資總、副總及資深經理',units});toast('設定已儲存');await refresh();});return;}
 if(action==='logout'){await signOut();return;}
});
document.addEventListener('input',ev=>{const e=ev.target;if(e.matches('[data-field],[data-status],[data-note],[data-weather],[data-patrol],[data-unit],[data-extra]'))saveFormToDraft(e);});
document.addEventListener('change',ev=>{const e=ev.target;
 if(e.dataset.global==='event'){state.eventId=e.value;state.reportDate=eventNow()?.date||today();state.slotId='08';state.checkTab='人員出勤';render();return;}
 if(e.dataset.global==='reportDate'){state.reportDate=e.value||today();state.checkTab='人員出勤';render();return;}
 if(e.dataset.global==='staffFilter'){state.staffFilter=e.value;render();return;}
 if(e.dataset.global==='historyFactory'){state.historyFactory=e.value;render();return;}
 if(e.dataset.staffSlot){if(!isOwner())return;const old=state.slotId;state.slotId=e.dataset.staffSlot;const d=draft();const id=e.dataset.person;if(e.checked&&!d.peopleIds.includes(id))d.peopleIds.push(id);if(!e.checked)d.peopleIds=d.peopleIds.filter(x=>x!==id);d.status='draft';state.slotId=old;render();return;}
 if(e.matches('[data-field],[data-status],[data-note],[data-weather],[data-patrol],[data-unit],[data-extra]')){saveFormToDraft(e);if(e.dataset.extra==='avgUnavailable')render();}
});
document.addEventListener('submit',async ev=>{const f=ev.target;const formId=f.getAttribute('id');if(!['eventForm','personForm','incidentForm','editNoteForm','loginForm'].includes(formId))return;ev.preventDefault();if(formId==='loginForm'){try{await signIn(f.elements.email.value,f.elements.password.value);toast('登入成功');}catch(e){toast('登入失敗：'+e.message,'error');}return;}
 await guarded(async()=>{const v=formValues(f);
 if(formId==='eventForm'){if(!clean(v.name))throw Error('請填寫颱風名稱');const old=state.events.find(e=>e.id===v.id);if(old&&old.factory!==v.factory&&state.reports.some(r=>r.eventId===v.id))throw Error('此事件已經有時段通報，為保護歷史資料不可更改廠區；請另建事件。');const id=v.id||makeId();await saveDoc('events',{id,name:clean(v.name),factory:v.factory,date:v.date,createdAt:old?.createdAt||now()});state.eventId=id;state.reportDate=v.date;state.slotId='08';state.drafts={};state.tab='duty';}
 if(formId==='personForm'){if(!clean(v.name))throw Error('姓名不可空白');const old=state.staff.find(x=>x.id===v.id);if(old&&old.factory!==v.factory&&state.reports.some(r=>r.peopleIds?.includes(v.id)))throw Error('此人員已被歷史通報使用，不能直接改變所屬廠區；請停用原人員並在新廠區另建。');await saveDoc('staff',{id:v.id||makeId(),name:clean(v.name),factory:v.factory,unit:clean(v.unit),job:clean(v.job),phone:clean(v.phone),active:v.active});}
 if(formId==='incidentForm'){if(!clean(v.title)||!clean(v.details))throw Error('異常標題及說明為必填');const prev=state.incidents.find(x=>x.id===v.id);await saveDoc('incidents',{id:v.id||makeId(),eventId:prev?.eventId||state.eventId,at:clean(v.at),title:clean(v.title),details:clean(v.details),action:clean(v.action),groupNotified:v.groupNotified,supervisorContacted:v.supervisorContacted,photoAttached:v.photoAttached,closed:v.closed});}
 if(formId==='editNoteForm'){if(!clean(v.text))throw Error('備註不可空白');const old=state.notes.find(x=>x.id===v.id);await saveDoc('notes',{...old,text:clean(v.text),updatedAt:now()});await saveDoc('revisions',{id:makeId(),sectionId:old.sectionId,at:now(),action:'修改備註',text:clean(v.text),previousText:old.text,version:''});}
 closeDialog();toast('資料已儲存');await refresh();});});
$('#menuToggle').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
function showLogin(){window.__EHS_TYPHOON_RENDERED=true;userLabel();$('#main').innerHTML=`<div class="panel" style="max-width:550px;margin:5vh auto"><h2>登入 EHS Firebase 帳號</h2><p>正式版使用與 EHS 入口網站相同的 Firebase 專案及登入狀態。請優先使用現有 Google 帳號登入。</p><button class="btn" type="button" data-action="google-login">使用 Google 帳號登入</button><details style="margin-top:16px"><summary>使用既有 Email／Password 帳號</summary><form id="loginForm"><div class="field form-row"><label>Email</label><input name="email" type="email" required autocomplete="username"></div><div class="field form-row"><label>密碼</label><input name="password" type="password" required autocomplete="current-password"></div><button class="btn" type="submit">登入</button></form></details><div class="banner warning" style="margin-top:16px">本版已連接正式 Firebase。管理者須使用 EHS 入口已驗證帳號；其他已登入使用者僅能閱讀。不得將帳號密碼放進 GitHub 程式碼。</div></div>`;}
async function boot(){try{await init(async user=>{if(mode==='firebase'&&!user){showLogin();return;}await refresh();});}catch(e){mainError(e);}}
boot();


})();
