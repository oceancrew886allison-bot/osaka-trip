'use strict';
let wishImageDraft={file:null,imagePath:null,preview:null};
let wishImageGeneration=0;
function resetWishImageDraft(){
  wishImageGeneration++;
  if(wishImageDraft.preview)URL.revokeObjectURL(wishImageDraft.preview);
  wishImageDraft={file:null,imagePath:null,preview:null};
}
function initWishImageEditor(item){
  resetWishImageDraft();wishImageDraft.imagePath=item?.imagePath||null;
  const generation=wishImageGeneration;
  document.getElementById('wishChooseImage').onclick=()=>{
    if(editingAllowed())document.getElementById('wishImageFile').click();
  };
  document.getElementById('wishImageFile').onchange=e=>{
    const file=e.target.files[0];if(file)setWishImage(file);e.target.value='';
  };
  document.getElementById('wishRemoveImage').onclick=()=>{
    if(!editingAllowed())return;
    wishImageGeneration++;
    if(wishImageDraft.preview)URL.revokeObjectURL(wishImageDraft.preview);
    wishImageDraft={file:null,imagePath:null,preview:null};
    showWishDraftPreview(null);document.getElementById('wishImageHint').textContent='可新增圖片，也可以只填文字。';
  };
  const area=document.getElementById('wishImageArea');
  area.addEventListener('dragover',e=>e.preventDefault());
  area.addEventListener('drop',e=>{e.preventDefault();const file=e.dataTransfer?.files[0];if(file)setWishImage(file);});
  if(wishImageDraft.imagePath)void couponImage(wishImageDraft.imagePath).then(url=>{
    if(generation===wishImageGeneration)showWishDraftPreview(url);
  }).catch(()=>{if(generation===wishImageGeneration)document.getElementById('wishImageHint').textContent='原圖片暫時無法載入；仍可保留它，或選擇新圖片。';});
}
function showWishDraftPreview(url){
  const image=document.getElementById('wishDraftImage');if(!image)return;
  image.classList.toggle('hide',!url);
  if(url)image.src=url;else image.removeAttribute('src');
  document.getElementById('wishRemoveImage').classList.toggle('hide',!wishImageDraft.file&&!wishImageDraft.imagePath);
}
function setWishImage(file){
  if(!editingAllowed())return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))return alert('請選擇 PNG、JPG 或 WebP 圖片。');
  if(!file.size||file.size>5*1024*1024)return alert('請選擇大小不超過 5 MB 的圖片。');
  wishImageGeneration++;
  if(wishImageDraft.preview)URL.revokeObjectURL(wishImageDraft.preview);
  wishImageDraft.file=file;wishImageDraft.preview=URL.createObjectURL(file);
  showWishDraftPreview(wishImageDraft.preview);
  document.getElementById('wishImageHint').textContent='圖片已選好，按「儲存」後會與老公同步。';
}
async function attachWishImage(obj){
  if(!wishImageDraft.file){obj.imagePath=wishImageDraft.imagePath;return true;}
  const draft=wishImageDraft,generation=wishImageGeneration,account=authGeneration;
  const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[draft.file.type];
  const path=crypto.randomUUID()+'.'+ext;
  saving=true;updateControls();status('商品圖片上傳中…');
  try {
    const {error}=await withSyncTimeout(client.storage.from('osaka-coupons').upload(path,draft.file,{contentType:draft.file.type,upsert:false}));
    if(error)throw error;
    if(account!==authGeneration||generation!==wishImageGeneration||!member)return false;
    draft.file=null;draft.imagePath=path;obj.imagePath=path;return true;
  }catch(e){
    if(account===authGeneration&&generation===wishImageGeneration){
      document.getElementById('wishImageHint').textContent='圖片尚未上傳，請確認網路後再次儲存。';
      status('圖片上傳未完成，文字與選好的圖片仍保留在編輯視窗。');
    }
    return false;
  }finally{if(account===authGeneration){saving=false;updateControls();}}
}
function loadWishImages(){
  if(collection!=='wish'||!member)return;
  const generation=authGeneration;
  for(const item of data.wishes){
    if(!item.imagePath)continue;
    const button=document.querySelector('[data-wish-image="'+item.id+'"]');if(!button)continue;
    const image=button.querySelector('img');
    button.onclick=async()=>{
      try {const url=await couponImage(item.imagePath);if(generation!==authGeneration||!member)return;
        document.getElementById('couponLarge').src=url;document.getElementById('couponLarge').alt='放大的商品圖片';
        document.getElementById('couponViewerTitle').textContent=item.name||'想買的東西';
        document.getElementById('couponViewer').classList.remove('hide');document.getElementById('couponViewerClose').focus();
      }catch{alert('圖片暫時無法載入，請連網後再試。');}
    };
    void couponImage(item.imagePath).then(url=>{
      if(generation===authGeneration&&image?.isConnected){image.src=url;image.alt=item.name||'商品圖片';}
    }).catch(()=>{if(image?.isConnected)image.alt='圖片暫時無法載入，點此重試';});
  }
}
document.addEventListener('paste',e=>{
  if(group!=='wishes'||!document.getElementById('modalback').classList.contains('show')||!member)return;
  const item=Array.from(e.clipboardData?.items||[]).find(x=>x.kind==='file'&&x.type.startsWith('image/'));
  if(item){e.preventDefault();const file=item.getAsFile();if(file)setWishImage(file);}
});
