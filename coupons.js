'use strict';
const couponBlobs=new Map();
const couponRequests=new Map();
function clearCouponImages(){
  for(const url of couponBlobs.values())URL.revokeObjectURL(url);
  couponBlobs.clear();couponRequests.clear();
  document.getElementById('couponViewer').classList.add('hide');
  document.getElementById('couponLarge').removeAttribute('src');
}
async function couponImage(path){
  if(couponBlobs.has(path))return couponBlobs.get(path);
  if(couponRequests.has(path))return couponRequests.get(path);
  const generation=authGeneration;
  const promise=(async()=>{
    const {data:blob,error}=await withSyncTimeout(client.storage.from('osaka-coupons').download(path));
    if(error)throw error;
    if(!member||generation!==authGeneration)throw Error('帳號已登出');
    const url=URL.createObjectURL(blob);couponBlobs.set(path,url);return url;
  })();
  couponRequests.set(path,promise);
  try{return await promise;}finally{couponRequests.delete(path);}
}
function renderCoupons(){
  if(page!=='coupons')return;
  const box=document.getElementById('couponList');if(!box)return;
  const list=data.coupons||[];
  document.getElementById('couponCount').textContent=list.length+' 張優惠券';
  box.replaceChildren();
  if(!list.length){box.innerHTML='<div class="empty">還沒有優惠券，選擇圖片或在這一頁貼上截圖 ♡</div>';return;}
  for(const c of list){
    const card=document.createElement('article');card.className='coupon-card';
    const imageButton=document.createElement('button');imageButton.className='coupon-image';imageButton.type='button';imageButton.setAttribute('aria-label','放大查看 '+c.name);
    const image=document.createElement('img');image.alt=c.name||'優惠券';image.loading='lazy';
    const hint=document.createElement('p');hint.className='muted';hint.textContent='圖片載入中…';
    imageButton.append(image);const title=document.createElement('strong');title.textContent=c.name||'優惠券';
    const note=document.createElement('p');note.className='muted';note.textContent=c.note||'';
    const actions=document.createElement('div');actions.className='actions';
    const edit=document.createElement('button');edit.className='textbtn';edit.textContent='✎ 編輯名稱／備註';edit.onclick=()=>openCoupon(c.id);
    const remove=document.createElement('button');remove.className='textbtn';remove.textContent='× 移除';remove.onclick=()=>removeItem('coupons',c.id);
    actions.append(edit,remove);card.append(imageButton,title,note,hint,actions);box.append(card);
    imageButton.onclick=async()=>{
      try {const url=await couponImage(c.imagePath);if(!member)return;
        document.getElementById('couponLarge').src=url;
        document.getElementById('couponViewerTitle').textContent=c.name||'優惠券';
        document.getElementById('couponViewer').classList.remove('hide');
        document.getElementById('couponViewerClose').focus();
      }catch{hint.textContent='圖片無法載入，請確認網路後重試。';}
    };
    if(member)void couponImage(c.imagePath).then(url=>{
      if(image.isConnected&&member){image.src=url;hint.textContent='點圖片放大，可使用雙指縮放查看條碼';}
    }).catch(()=>{hint.textContent='圖片無法載入，請確認網路後按立即同步。';});
  }
}
function openCoupon(id){openModal('coupons',id);}
async function uploadCoupon(file){
  if(!editingAllowed())return;
  const extensions={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
  if(!extensions[file.type])return alert('請選擇 PNG、JPG 或 WebP 圖片。');
  if(file.size>5*1024*1024)return alert('圖片需小於 5 MB，請先用截圖或較小的圖片。');
  if(file.size===0)return alert('圖片檔案是空的。');
  const generation=authGeneration;
  const name=document.getElementById('couponName').value.trim()||file.name?.replace(/\.[^.]+$/,'')||'優惠券';
  const note=document.getElementById('couponNote').value.trim();
  const path=crypto.randomUUID()+'.'+extensions[file.type];
  let staged=false;
  saving=true;updateControls();document.getElementById('couponUpload').disabled=true;status('優惠券圖片上傳中…');
  try {
    const {error}=await withSyncTimeout(client.storage.from('osaka-coupons').upload(path,file,{contentType:file.type,upsert:false}));
    if(error)throw error;
    if(!member||generation!==authGeneration)return;
    data.coupons.push({id:crypto.randomUUID(),name,imagePath:path,note});
    document.getElementById('couponName').value='';document.getElementById('couponNote').value='';
    saving=false;save();staged=true;
  }catch(e){if(generation===authGeneration){status('圖片尚未儲存，請連網後重新上傳。');alert('圖片上傳失敗，請確認網路後重試。');}}
  finally{if(generation===authGeneration){if(!staged)saving=false;updateControls();}}
}
document.getElementById('couponUpload').onclick=()=>{
  if(editingAllowed())document.getElementById('couponFile').click();
};
document.getElementById('couponFile').onchange=async e=>{
  const file=e.target.files[0];if(file)await uploadCoupon(file);e.target.value='';
};
document.addEventListener('paste',e=>{
  if(page!=='coupons'||!member)return;
  const image=Array.from(e.clipboardData?.items||[]).find(x=>x.kind==='file'&&x.type.startsWith('image/'));
  if(image){e.preventDefault();const file=image.getAsFile();if(file)void uploadCoupon(file);}
});
document.getElementById('couponDrop').addEventListener('dragover',e=>e.preventDefault());
document.getElementById('couponDrop').addEventListener('drop',e=>{e.preventDefault();const file=e.dataTransfer?.files[0];if(file)void uploadCoupon(file);});
document.getElementById('couponViewerClose').onclick=()=>{
  document.getElementById('couponViewer').classList.add('hide');document.getElementById('couponLarge').removeAttribute('src');
};
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.getElementById('couponViewerClose').click();});
