'use strict';
const Book=window.OsakaBook;
let paymentDraft=[],paymentAuto=false,paymentEnabled=true;
let cardEditVersion=null;
function renderMoneyManagement(){
  const b=Book.balances(data);
  $('#walletBalance').textContent='剩餘現金：¥'+money(b.remaining)+' / ¥'+money(b.invested);
  $('#walletBalance').classList.toggle('over-cap',b.remaining<0);
  $('#cashWarning').textContent=b.remaining<0?'日幣現金不足，請確認付款紀錄或補充現金。':'';
  $('#cardProgress').innerHTML=(data.cards||[]).map(c=>`<div class="card-progress"><strong>💳 ${esc(c.name)}${c.archived?'（已封存）':''}</strong><div class="card-amount ${Book.atCap(b.cards[c.id],c.cap)?'over-cap':''}">NT$${money(b.cards[c.id])} / ${c.cap==null?'無上限':'NT$'+money(c.cap)}</div>${c.note?`<small>${esc(c.note)}</small>`:''}${c.url?`<a class="textbtn" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">適用通路查詢 ↗</a>`:''}</div>`).join('');
}
function paymentDetails(e){
  return (e.payments||[]).map(p=>`<small>${p.type==='cash'?'💴 現金':'💳 '+esc(data.cards?.find(c=>c.id===p.cardId)?.name||'信用卡')} ${(p.inputCurrency||e.currency)==='JPY'?'¥':'NT$'} ${money(p.inputAmount??p.amount)}</small>`).join('');
}
let legacyPaymentDraft=[];
function initPayments(v){
  paymentEnabled=!editing||v.payments!=null;
  paymentDraft=Book.paymentInputs(v);
  legacyPaymentDraft=Book.paymentInputs({...v,payments:null});
  $('#formFields').insertAdjacentHTML('beforeend',`<div class="payments-section"><h3>付款方式</h3>${editing?'<label class="payment-toggle"><input id="paymentEnabled" type="checkbox"> 登記付款方式</label><p class="muted">舊紀錄可維持付款方式空白；勾選後才計入錢包及信用卡。</p>':''}<div id="paymentRows"></div><button id="addPaymentButton" type="button" class="btn soft tiny" onclick="addPayment()">＋ 增加付款方式</button><div id="paymentSum" class="fx-preview" role="status"></div></div>`);
  const toggle=$('#paymentEnabled');if(editing&&toggle){toggle.checked=paymentEnabled;toggle.onchange=()=>{paymentEnabled=toggle.checked;renderPaymentRows();};}
  renderPaymentRows();
}
function renderPaymentRows(){
  if(group!=='expenses'||!$('#paymentRows'))return;
  const drafts=paymentEnabled?paymentDraft:legacyPaymentDraft;
  $('#addPaymentButton').classList.toggle('hide',!paymentEnabled);
  $('#paymentRows').innerHTML=drafts.map((p,i)=>{
    const options=(data.cards||[]).filter(c=>!c.archived||c.id===p.cardId).map(c=>({value:c.id,label:c.name+(c.archived?'（已封存）':'')}));
    return `<div class="payment-row">${paymentEnabled?field('付款方式 '+(i+1),'payType'+i,p.type,'text',[{value:'cash',label:'現金'},{value:'card',label:'信用卡'}]):'<p class="muted">此筆付款方式留空，不扣錢包或累積信用卡。</p>'}<div class="row payment-amounts">${field('付款金額（日圓 ¥）','payJPY'+i,p.amountJPY??'','number')}${field('付款金額（台幣 NT$）','payTWD'+i,p.amountTWD??'','number')}</div><p class="muted">日圓、台幣擇一填寫，自動換算。</p>${paymentEnabled&&p.type==='card'?field('選擇信用卡','payCard'+i,p.cardId,'text',[{value:'',label:'請選擇信用卡'},...options])+'<button type="button" class="textbtn" onclick="openCardManager()">⚙️ 管理信用卡</button>':''}${paymentEnabled&&drafts.length>1?`<button type="button" class="textbtn" onclick="removePayment(${i})">移除此付款</button>`:''}</div>`;
  }).join('');
  drafts.forEach((p,i)=>{
    if(paymentEnabled)$('#f_payType'+i).onchange=e=>{p.type=e.target.value;renderPaymentRows();};
    $('#f_payJPY'+i).oninput=e=>{p.amountJPY=e.target.value;updatePaymentSum();};
    $('#f_payTWD'+i).oninput=e=>{p.amountTWD=e.target.value;updatePaymentSum();};
    if(paymentEnabled&&p.type==='card')$('#f_payCard'+i).onchange=e=>{p.cardId=e.target.value;};
  });updatePaymentSum();
}
function addPayment(){if(paymentDraft.length>=30)return alert('每筆最多 30 種付款');paymentDraft.push({type:'card',amountJPY:'',amountTWD:'',cardId:''});renderPaymentRows();}
function removePayment(i){paymentDraft.splice(i,1);renderPaymentRows();}
function updatePaymentSum(){
  try{
    const combined=paymentEnabled?Book.combineInputs(paymentDraft,editing):(()=>{const e=Book.unassignedInput(legacyPaymentDraft[0]);return {...e,payments:[{inputCurrency:e.currency,inputAmount:e.amount}],paymentTwd:e.amount*(e.currency==='JPY'?Book.RATE:1)};})();
    const yen=combined.payments.filter(p=>p.inputCurrency==='JPY').reduce((n,p)=>n+p.inputAmount,0),nt=combined.payments.filter(p=>p.inputCurrency==='TWD').reduce((n,p)=>n+p.inputAmount,0);
    $('#paymentSum').textContent='花費合計：'+(yen?'¥ '+yen.toLocaleString('zh-TW',{maximumFractionDigits:2}):'')+(yen&&nt?' ＋ ':'')+(nt?'NT$ '+nt.toLocaleString('zh-TW',{maximumFractionDigits:2}):'')+' ≈ NT$ '+money(combined.paymentTwd);
    $('#paymentSum').classList.remove('over-cap');
  }catch(e){$('#paymentSum').textContent=e.message;$('#paymentSum').classList.add('over-cap');}
}
function attachPayments(obj){
  for(const key of Object.keys(obj))if(/^pay(Type|JPY|TWD|Card)\d+$/.test(key)||key==='paymentEnabled')delete obj[key];
  try{
    const combined=paymentEnabled?Book.combineInputs(paymentDraft,editing):Book.unassignedInput(legacyPaymentDraft[0]);
    Object.assign(obj,combined);
    if(!paymentEnabled){obj.payments=null;obj.paymentFx=null;obj.paymentTwd=null;obj.paymentInputVersion=null;}
    else Book.validatePayments(obj,data.cards||[]);
  }catch(e){alert(e.message);return false;}
  const provisional={...data,expenses:data.expenses.filter(e=>e.id!==editing?.id).concat(obj)};
  if(Book.balances(provisional).remaining<0&&obj.payments?.some(p=>p.type==='cash'&&p.inputCurrency==='JPY'))alert('日幣現金不足；此筆仍會保留，請確認錢包初始金額或補充現金。');
  return true;
}
function openWallet(){
  if(!prepareModal('wallet','main'))return;group='wallet';editing=data.wallet?.find(w=>w.id==='main')||null;
  $('#modalTitle').textContent='✏️ 修改初始日幣金額';
  $('#formFields').innerHTML=field('出發時攜帶的日幣（¥）','initialJPY',editing?.initialJPY??0,'number')+'<p class="muted">只修改初始金額，補充現金與花費紀錄會保留。</p>';
  $('#modalback').classList.add('show');
}
function openTopup(id){
  if(!prepareModal('cash_topups',id))return;group='cash_topups';editing=data.cash_topups?.find(t=>t.id===id)||null;
  $('#modalTitle').textContent=(id?'✎ 編輯':'＋ 補充')+'日幣現金';
  $('#formFields').innerHTML=field('補充日幣（¥）','amountJPY',editing?.amountJPY??'','number')+field('日期','date',editing?.date||data.flights.find(f=>f.id==='outbound')?.date||new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10),'date')+field('備註（選填）','note',editing?.note||'');$('#modalback').classList.add('show');
}
function openTopupHistory(){
  if(!editingAllowed())return;
  $('#cardManagerTitle').textContent='補充現金紀錄';$('#cardManagerEditor').innerHTML='';
  $('#cardManagerList').innerHTML=(data.cash_topups||[]).map(t=>`<div class="card-progress"><strong>¥${money(t.amountJPY)}</strong><small>${esc(t.date)} ${esc(t.note)}</small><div class="actions"><button class="btn soft tiny" onclick="closeCardManager();openTopup('${esc(t.id)}')">編輯</button><button class="btn soft tiny" onclick="removeTopup('${esc(t.id)}')">刪除</button></div></div>`).join('')||'<p class="muted">尚無補充現金紀錄</p>';
  $('#cardManagerAdd').classList.add('hide');$('#cardManager').classList.add('show');
}
function removeTopup(id){if(!editingAllowed()||!confirm('刪除此筆補充現金紀錄？'))return;data.cash_topups=data.cash_topups.filter(t=>t.id!==id);save();openTopupHistory();}
function submitMoneyRecord(obj){
  if(group==='wallet'){
    obj.initialJPY=Number(obj.initialJPY);if(!Number.isFinite(obj.initialJPY)||obj.initialJPY<0||!Number.isInteger(obj.initialJPY))return alert('初始日幣請填零或正整數');obj.id='main';
  }else{obj.amountJPY=Number(obj.amountJPY);if(!Number.isInteger(obj.amountJPY)||obj.amountJPY<=0)return alert('補充日幣請填正整數');if(!/^\d{4}-\d{2}-\d{2}$/.test(obj.date||''))return alert('請填寫日期');obj.id=editing?.id||uid();}
  if(!ensureModalCurrent())return;
  const index=data[group].findIndex(r=>r.id===obj.id);if(index>=0)data[group][index]={...data[group][index],...obj};else data[group].push(obj);
  closeModal();save();
}
function openCardManager(){
  if(!editingAllowed())return;
  $('#cardManagerTitle').textContent='⚙️ 管理信用卡';$('#cardManagerEditor').innerHTML='';
  $('#cardManagerList').innerHTML=(data.cards||[]).map(c=>`<div class="card-progress"><strong>${esc(c.name)}${c.archived?'（已封存）':''}</strong><small>預估實際回饋 ${esc(c.rate)}% · ${c.cap==null?'無上限':'優惠消費上限 NT$'+money(c.cap)}</small><small>${esc(c.note)}${c.start||c.end?' · '+esc(c.start||'未設定')+'～'+esc(c.end||'未設定'):''}</small><div class="actions"><button class="btn soft tiny" onclick="editCard('${esc(c.id)}')">編輯</button><button class="btn soft tiny" onclick="archiveCard('${esc(c.id)}')">${c.archived?'恢復使用':'封存'}</button></div></div>`).join('');
  $('#cardManagerAdd').classList.remove('hide');$('#cardManager').classList.add('show');
}
function closeCardManager(){$('#cardManager').classList.remove('show');$('#cardManagerEditor').innerHTML='';cardEditVersion=null;if(group==='expenses'&&$('#modalback').classList.contains('show'))renderPaymentRows();}
function editCard(id){
  if(!editingAllowed())return;const c=(data.cards||[]).find(c=>c.id===id)||{id:uid(),name:'',rate:0,cap:null,note:'',url:'',start:'',end:'',archived:false};
  cardEditVersion={id:c.id,revision:currentRevision('cards',c.id)};
  $('#cardManagerEditor').innerHTML=`<form id="cardForm"><h3>${id?'編輯':'新增'}信用卡</h3>${field('信用卡名稱 *','cardName',c.name)}${field('預估實際回饋率（%）','cardRate',c.rate,'number')}${field('優惠消費上限（NT$；無上限留空）','cardCap',c.cap??'','number')}${field('適用通路說明','cardNote',c.note)}${field('優惠開始日期（選填）','cardStart',c.start,'date')}${field('優惠結束日期（選填）','cardEnd',c.end,'date')}${field('查詢連結（https，選填）','cardUrl',c.url,'url')}<button type="submit" class="btn">儲存信用卡</button><button type="button" class="btn soft" onclick="openCardManager()">取消</button></form>`;
  $('#cardForm').onsubmit=e=>{
    e.preventDefault();if(!editingAllowed())return;
    if(currentRevision('cards',c.id)!==cardEditVersion?.revision){alert('信用卡已被另一人修改，請重新開啟。');openCardManager();return;}
    const f=Object.fromEntries(new FormData(e.currentTarget).entries());const next={...c,name:f.cardName.trim(),rate:Number(f.cardRate),cap:f.cardCap.trim()===''?null:Number(f.cardCap),note:f.cardNote,start:f.cardStart,end:f.cardEnd,url:f.cardUrl.trim()};
    try{Book.validateCard(next);}catch(err){return alert(err.message);}
    const index=data.cards.findIndex(x=>x.id===next.id);if(index<0)data.cards.push(next);else data.cards[index]=next;
    save();$('#cardManagerEditor').innerHTML='';closeCardManager();
  };
  $('#f_cardName').focus();
}
function archiveCard(id){if(!editingAllowed())return;const c=data.cards.find(x=>x.id===id);if(!c)return;c.archived=!c.archived;save();closeCardManager();}
