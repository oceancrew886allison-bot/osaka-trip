'use strict';
const Sync = window.OsakaSync;
const legacyData = Sync.clone(data);
const hasLegacyData = Boolean(localStorage.getItem(KEY));
data = Sync.empty();
let client, member, memberLabel, rows=[], pending=[], saving=false, loading=false;
let channel, pollTimer, refreshTimer, conflictsNow=[], authGeneration=0, modalVersion=null;
const authPanel=document.getElementById('authPanel');
const statusEl=document.getElementById('syncStatus');
const message=document.getElementById('authMessage');
const appMain=document.querySelector('main.app');
const pendingKey=()=>member?'osaka-v8-pending:'+member.id:null;
let storageWarning='',recoveryBlocked=false,syncQueued=false,refreshQueued=false;
const status=s=>{statusEl.textContent=s+(storageWarning?' · '+storageWarning:'');};
function withSyncTimeout(request){
  let timer;return Promise.race([Promise.resolve(request),new Promise((_,reject)=>{timer=setTimeout(()=>reject({code:'SYNC_TIMEOUT',message:'SYNC_TIMEOUT'}),15000);})]).finally(()=>clearTimeout(timer));
}
function drainSync(){
  if(!member||saving||loading)return;
  if(syncQueued){syncQueued=false;void(pending.length&&!conflictsNow.length?flush():refresh());}
  else if(refreshQueued){refreshQueued=false;requestRefresh();}
}
async function syncNow(){if(saving||loading){syncQueued=true;return;}return pending.length&&!conflictsNow.length?flush():refresh();}

const persistPending=()=>{
  if(!member||recoveryBlocked)return;
  const result=OsakaOutbox.persist(member.id,pending,localStorage,sessionStorage);
  storageWarning=result.durable?'':result.session?'只能暫存在目前分頁，請先下載備份再離開':'暫存空間不足，請立即下載備份並保持頁面開啟';
};

function updateControls() {
  document.querySelectorAll('#wishChooseImage,#wishRemoveImage,#wishImageFile').forEach(b=>b.disabled=saving||loading);
  document.getElementById('couponUpload').disabled=saving||loading||!member||conflictsNow.length>0;
  document.getElementById('retrySync').disabled=saving||loading||!member;
  document.getElementById('retrySync').textContent=saving?'同步中…':loading?'檢查中…':'立即同步';
  document.getElementById('logout').disabled=saving||loading;
  document.getElementById('legacyImport').disabled=saving||loading||pending.length>0;
  document.getElementById('legacyImport').classList.toggle('hide',!hasLegacyData&&rows.length>0);
  document.querySelectorAll('main button[onclick],#collectionAdd,#editor button[type=submit],#cardManager button').forEach(b=>{
    b.disabled=saving||loading||recoveryBlocked||conflictsNow.length>0;
  });
}
function repaint() {render(); updateControls();}
function editingAllowed() {
  if(!member||saving||loading||recoveryBlocked) return false;
  if(conflictsNow.length) {alert('有同時修改的資料，請先處理同步提示。');return false;}
  return true;
}
function currentRevision(g,id) {return rows.find(r=>r.kind===g&&r.record_id===id)?.revision??0;}
function prepareModal(g,id) {
  if(!editingAllowed()) return false;
  modalVersion=id?{kind:g,id,revision:currentRevision(g,id)}:null;
  return true;
}
function ensureModalCurrent() {
  if(!editingAllowed())return false;
  if(modalVersion&&currentRevision(modalVersion.kind,modalVersion.id)!==modalVersion.revision) {
    alert('這筆資料已被另一人更新，請重新開啟編輯後再儲存。');closeModal();return false;
  }
  return true;
}
function errorText(e) {
  if(e?.message?.includes('OSAKA_SCHEMA_NOT_READY'))return '記帳升級尚未設定完成，請先執行已核對的 V12 資料庫更新 SQL。既有資料沒有改動。';
  if(e?.message?.includes('OSAKA_FORBIDDEN')||e?.code==='42501')return '這個帳號沒有旅行手帳權限，請確認登入 Email。';
  if(e?.message?.includes('OSAKA_UPDATE_REQUIRED'))return '請重新整理兩人的網站到 V12；舊版不能修改含新付款幣別的紀錄。';
  if(e?.message?.includes('OSAKA_INVALID'))return '資料格式不正確，請下載備份後檢查。';
  if(e?.message?.includes('Invalid login credentials'))return 'Email 或密碼不正確，或帳號尚未建立。';
  if(e?.message?.includes('Email not confirmed'))return '帳號尚未完成確認，請至 Supabase 檢查帳號設定。';
  return '暫時無法連線，請確認網路後重試。';
}
function syncFailureText(e){
  if(e?.code==='SYNC_TIMEOUT')return '連線逾時：修改尚未確認存入雲端，已保留待同步；連線恢復後會核對並重試。';
  const kept=pending.length+' 筆修改仍保留在此裝置。';
  if(e?.message?.includes('OSAKA_UPDATE_REQUIRED')||e?.message?.includes('OSAKA_INVALID')||e?.message?.includes('OSAKA_FORBIDDEN')||e?.code==='42501')return '尚未同步：'+errorText(e)+' '+kept;
  const code=String(e?.code||'');
  if(/^[A-Z0-9]{5,12}$/.test(code))return '尚未同步：伺服器寫入失敗（'+code+'）。'+kept+' 請下載備份，並回報此錯誤碼。';
  return '尚未同步：'+kept+' 暫時無法連線，恢復連線後會重試。';
}
function showConflicts() {
  const box=document.getElementById('conflictPanel');
  box.classList.toggle('hide',conflictsNow.length===0);
  document.getElementById('conflictList').replaceChildren();
  for(const p of conflictsNow) {
    const remote=rows.find(r=>Sync.key(r)===Sync.key(p));
    const wrap=document.createElement('div');wrap.className='conflict-item';
    const title=document.createElement('strong');title.textContent=({entries:'行程',places:'收藏',wishes:'願望',expenses:'記帳',flights:'航班',hotel:'飯店',coupons:'優惠券',cards:'信用卡',wallet:'初始現金',cash_topups:'補充現金'})[p.kind]+'：'+(p.payload.name||p.record_id);
    const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='比較內容';
    const local=document.createElement('pre');local.textContent='這台裝置：\n'+(p.deleted?'已刪除':JSON.stringify(p.payload,null,2));
    const cloud=document.createElement('pre');cloud.textContent='雲端：\n'+(!remote||remote.deleted?'已刪除':JSON.stringify(remote.payload,null,2));
    details.append(summary,local,cloud);wrap.append(title,details);
    for(const [label,keepLocal] of [['保留雲端版本',false],['保留這台裝置版本',true]]) {
      const btn=document.createElement('button');btn.className='btn soft tiny';btn.textContent=label;
      btn.onclick=()=>{
        if(saving)return;
        if(keepLocal) p.expected_revision=remote?.revision??0;
        else pending=pending.filter(x=>Sync.key(x)!==Sync.key(p));
        conflictsNow=Sync.conflicts(rows,pending);persistPending();data=Sync.overlay(rows,pending);
        showConflicts();repaint();
        if(!conflictsNow.length) void flush();
      };wrap.append(btn);
    }
    document.getElementById('conflictList').append(wrap);
  }
  updateControls();
}
async function fetchRows() {
  let all=[];
  for(let offset=0;;offset+=500) {
    const {data:part,error}=await withSyncTimeout(client.from('osaka_records').select('*').order('kind').order('record_id').range(offset,offset+499));
    if(error)throw error;all.push(...part);if(part.length<500)break;
  }
  return all;
}
async function refresh() {
  if(!member||recoveryBlocked)return;if(saving||loading){refreshQueued=true;return;}
  loading=true;updateControls();const generation=authGeneration;
  try {
    // Recheck membership, so an account whose access was removed cannot retain
    // the previously rendered private data by simply staying on this page.
    const {data:label,error:identityError}=await withSyncTimeout(client.rpc('osaka_identity'));
    if(identityError)throw identityError;
    if(!label) {await lock();message.textContent='這個帳號沒有旅行手帳權限。';return;}
    const incoming=await fetchRows();if(generation!==authGeneration)return;
    rows=incoming;pending=Sync.reconcile(rows,pending);persistPending();conflictsNow=Sync.conflicts(rows,pending);
    data=Sync.overlay(rows,pending);showConflicts();
    status(conflictsNow.length?'有同時修改的資料，請選擇要保留的版本':pending.length?'尚有 '+pending.length+' 筆待同步':'已同步 · '+new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'}));
    repaint();
  } catch(e) {if(generation===authGeneration)status(pending.length?'連線中斷，'+pending.length+' 筆修改保留待同步':'無法取得最新資料，請稍後重試');}
  finally {loading=false;updateControls();drainSync();}
}
function requestRefresh(){if(saving||loading){refreshQueued=true;return;}clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>void refresh(),400);}
async function flush() {
  if(!member||recoveryBlocked||conflictsNow.length)return;if(saving||loading){syncQueued=true;return;}
  if(!pending.length){await refresh();return;}
  saving=true;updateControls();status('正在同步 '+pending.length+' 筆修改…');
  const generation=authGeneration;
  try {
    const {data:result,error}=await withSyncTimeout(client.rpc('osaka_commit',{p_changes:pending.map(c=>({...c,client_version:12}))}));
    if(error)throw error;if(generation!==authGeneration)return;
    rows=result;pending=[];persistPending();data=Sync.fromRows(rows);
    status('已同步 · '+new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'}));repaint();
  } catch(e) {
    if(generation!==authGeneration)return;
    if(e?.message?.includes('OSAKA_CONFLICT')) {
      try { rows=await fetchRows();
        // A request can commit but lose its response. Treat a matching next
        // revision as acknowledged rather than reporting a false conflict.
        pending=Sync.reconcile(rows,pending);
        conflictsNow=Sync.conflicts(rows,pending);data=Sync.overlay(rows,pending);persistPending();showConflicts();repaint();
        status(conflictsNow.length?'另一人已修改相同資料，請先處理版本衝突':'已取得最新資料，按「立即同步」重試');
      } catch {status('無法取得衝突版本；修改已保留，請稍後重試');}
    } else {status(syncFailureText(e));}
  } finally {saving=false;updateControls();drainSync();}
}
function save() {
  if(!member)return;
  try {data=Sync.normalize(data);pending=Sync.diff(rows,data,pending);persistPending();repaint();void flush();}
  catch(e){alert(e.message);data=Sync.overlay(rows,pending);repaint();}
}
async function importData(input,description) {
  if(!editingAllowed()||pending.length) {alert('請先完成待同步修改。');return;}
  let normalized;
  try {normalized=Sync.normalize({...input,coupons:input.coupons??data.coupons,cards:input.cards??data.cards,wallet:input.wallet??data.wallet,cash_topups:input.cash_topups??data.cash_topups});}catch(e){alert(e.message);return;}
  for(const e of normalized.expenses){const old=data.expenses.find(x=>x.id===e.id);if(old&&e.payments==null&&old.payments!=null){e.payments=Sync.clone(old.payments);e.paymentFx=old.paymentFx;e.paymentTwd=old.paymentTwd;e.paymentInputVersion=old.paymentInputVersion;}}
  try{normalized=Sync.normalize(normalized);}catch(e){alert('舊備份與現有付款金額不一致，請先編輯處理：'+e.message);return;}
  if(!confirm(description+'會取代兩人共用的雲端手帳。請先下載目前備份，確定繼續？'))return;
  data=normalized;save();
}
async function lock() {
  authGeneration++;clearInterval(pollTimer);clearTimeout(refreshTimer);
  if(channel){void client.removeChannel(channel);channel=null;}
  member=null;memberLabel=null;storageWarning='';recoveryBlocked=false;syncQueued=false;refreshQueued=false;rows=[];pending=[];conflictsNow=[];data=Sync.empty();
  closeModal();closeCardManager();closeTripPreview();cancelTripDrag();clearCouponImages();render();appMain.classList.add('hide');appMain.inert=true;document.getElementById('bottomNav').classList.add('hide');document.getElementById('bottomNav').inert=true;
  document.getElementById('accountBar').classList.add('hide');authPanel.classList.remove('hide');
}
async function openSession(session) {
  const generation=++authGeneration;
  if(!session) {await lock();return;}
  appMain.classList.add('hide');appMain.inert=true;document.getElementById('bottomNav').classList.add('hide');document.getElementById('bottomNav').inert=true;message.textContent='正在確認帳號權限…';
  try {
    const {data:label,error}=await withSyncTimeout(client.rpc('osaka_identity'));
    if(error)throw error;if(!label){await client.auth.signOut();await lock();message.textContent='這個帳號沒有旅行手帳權限。';return;}
    const {data:incoming,error:initError}=await withSyncTimeout(client.rpc('osaka_bookkeeping_init'));if(initError){if(['PGRST202','42883'].includes(initError.code))throw Error('OSAKA_SCHEMA_NOT_READY');throw initError;}if(generation!==authGeneration)return;
    member=session.user;memberLabel=label;rows=incoming;
    recoveryBlocked=false;
    try{pending=OsakaOutbox.load(member.id,localStorage,sessionStorage,Sync.groups);pending=Sync.reconcile(rows,pending);persistPending();}
    catch(err){pending=[];recoveryBlocked=true;storageWarning=err.message;}
    conflictsNow=Sync.conflicts(rows,pending);data=Sync.overlay(rows,pending);
    document.getElementById('accountName').textContent=label+' · '+session.user.email;
    document.getElementById('accountBar').classList.remove('hide');authPanel.classList.add('hide');
    appMain.classList.remove('hide');appMain.inert=false;document.getElementById('bottomNav').classList.remove('hide');document.getElementById('bottomNav').inert=false;
    document.getElementById('legacyImport').textContent=hasLegacyData?'匯入這台裝置的 V7 資料':'建立五天旅行手帳';
    document.getElementById('legacyImport').classList.toggle('hide',!hasLegacyData&&rows.length>0);
    status(pending.length?'有 '+pending.length+' 筆待同步修改':'已載入共用旅行手帳');showConflicts();repaint();
    if(channel)void client.removeChannel(channel);
    channel=client.channel('osaka-v8').on('postgres_changes',{event:'*',schema:'public',table:'osaka_records'},requestRefresh)
      .subscribe(s=>{if(s==='SUBSCRIBED')requestRefresh();});
    clearInterval(pollTimer);pollTimer=setInterval(()=>void syncNow(),12000);
    if(pending.length&&!conflictsNow.length)void flush();
  } catch(e) {if(generation===authGeneration){await lock();message.textContent=errorText(e);}}
}
document.getElementById('loginForm').onsubmit=async e=>{
  e.preventDefault();const button=document.getElementById('loginButton');button.disabled=true;message.textContent='登入中…';
  try {
    if(!client)throw Error('連線元件尚未載入');
    const email=document.getElementById('loginEmail').value.trim().toLowerCase();
    const password=document.getElementById('loginPassword').value;
    const {data:result,error}=await withSyncTimeout(client.auth.signInWithPassword({email,password}));
    document.getElementById('loginPassword').value='';
    if(error)throw error;await openSession(result.session);
  } catch(e){message.textContent=errorText(e);}finally{button.disabled=false;}
};
document.getElementById('logout').onclick=async()=>{
  if(saving||loading)return;
  if(recoveryBlocked){alert(storageWarning);return;}
  if(pending.length){alert('還有尚未同步的修改，請先同步或下載備份後再登出。');return;}
  try {const {error}=await withSyncTimeout(client.auth.signOut({scope:'local'}));if(error)throw error;
    if(member)sessionStorage.removeItem(pendingKey());await lock();message.textContent='已登出，這台裝置已隱藏雲端旅行資料。';
  }catch(e){status('登出未完成，請確認網路後再試。');}
};
document.getElementById('retrySync').onclick=()=>void syncNow();
document.getElementById('legacyImport').onclick=()=>void importData(legacyData,hasLegacyData?'匯入這台裝置的 V7 資料':'建立五天旅行手帳');
document.getElementById('importFile').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try {const input=JSON.parse(await file.text());
    if(!input.flights)input.flights=data.flights;if(!input.hotel)input.hotel=data.hotel;if(!input.coupons)input.coupons=data.coupons;
    await importData(input,'匯入備份');
  }catch(err){alert(err.message||'備份格式不正確');}finally{e.target.value='';}
};
window.addEventListener('online',()=>void syncNow());
window.addEventListener('focus',()=>void syncNow());
window.addEventListener('pagehide',()=>{if(member&&pending.length)persistPending();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void syncNow();});
window.addEventListener('beforeunload',e=>{if(pending.length){e.preventDefault();e.returnValue='';}});
async function startCloud() {
  try {
    client=window.supabase.createClient(OSAKA_CONFIG.url,OSAKA_CONFIG.publishableKey,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'osaka-v8-auth'}
    });
    client.auth.onAuthStateChange((event,session)=>{
      if(event==='SIGNED_OUT')setTimeout(()=>void lock(),0);
      if(event==='TOKEN_REFRESHED')requestRefresh();
    });
    const {data:session,error}=await withSyncTimeout(client.auth.getSession());if(error)throw error;
    await openSession(session.session);
  } catch(e){message.textContent='登入服務暫時無法連線，請重新整理後再試。';}
}
void startCloud();
