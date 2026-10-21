'use strict';
let tripSort=null,tripDrag=null,tripBound=false,tripScroll=0;
const tripFingerprint=d=>JSON.stringify(OsakaSchedule.ordered(data.entries,d).map(e=>[e,currentRevision('entries',e.id)]));
function cancelTripDrag(){
  const s=tripDrag;tripDrag=null;
  if(tripScroll&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(tripScroll);tripScroll=0;
  if(!s)return;s.node.classList.remove('dragging');s.node.setAttribute('aria-grabbed','false');
  try{if(s.capture?.hasPointerCapture?.(s.pointer))s.capture.releasePointerCapture(s.pointer);}catch(_){}
}
function openTripSort(){
  if(!editingAllowed())return;
  const items=OsakaSchedule.ordered(data.entries,day);
  if(items.length<2){alert('當天至少需要兩個行程才能調整順序。');return;}
  tripSort={day,fingerprint:tripFingerprint(day),ids:items.map(e=>e.id),slots:items.map(e=>e.time)};
  $('#tripSortTimes').innerHTML=tripSort.slots.map(t=>`<div class="sort-time">${esc(t)}</div>`).join('');
  $('#tripSortNames').innerHTML=items.map(e=>`<div class="sort-name" data-sort-id="${esc(e.id)}" tabindex="0" role="button" aria-label="拖曳 ${esc(e.name)}；鍵盤 Alt 加上或下鍵" aria-grabbed="false">${esc(e.name)}</div>`).join('');
  $('#tripSort').classList.add('show');$('#tripSortScroll').scrollTop=0;bindItineraryDrag();
}
function closeTripSort(){cancelTripDrag();tripSort=null;$('#tripSort').classList.remove('show');}
// Compatibility with existing session cleanup; old per-card move controls are removed.
function closeTripPreview(){closeTripSort();}
function refreshTripSortOrder(){
  if(tripSort)tripSort.ids=[...$('#tripSortNames').querySelectorAll('[data-sort-id]')].map(n=>n.dataset.sortId);
}
function applyTripSort(){
  if(!tripSort||!editingAllowed())return;
  if(tripFingerprint(tripSort.day)!==tripSort.fingerprint){alert('當天行程已被另一人更新，請重新開啟編輯行程。');closeTripSort();return;}
  try{const p=OsakaSchedule.propose(data.entries,tripSort.day,tripSort.ids);if(!p.length){closeTripSort();return;}data.entries=OsakaSchedule.apply(data.entries,tripSort.day,p);}catch(e){alert(e.message);return;}
  closeTripSort();save();
}
function tripMoveAt(y){
  const s=tripDrag;if(!s?.active)return;const box=$('#tripSortNames');
  const next=[...box.querySelectorAll('[data-sort-id]')].filter(n=>n!==s.node).find(n=>{const r=n.getBoundingClientRect();return y<r.top+r.height/2;});
  box.insertBefore(s.node,next||null);refreshTripSortOrder();
}
function bindItineraryDrag(){
  if(tripBound)return;tripBound=true;const box=$('#tripSortNames');
  for(const type of ['contextmenu','selectstart','dragstart'])box.addEventListener(type,e=>e.preventDefault());
  box.addEventListener('pointerdown',e=>{
    const node=e.target.closest?.('[data-sort-id]');if(!tripSort||!node||e.isPrimary===false||(e.button!=null&&e.button!==0))return;
    if(e.cancelable)e.preventDefault();window.getSelection?.()?.removeAllRanges();cancelTripDrag();
    tripDrag={node,capture:box,pointer:e.pointerId,x:e.clientX,y:e.clientY,lastY:e.clientY,active:false};
    try{box.setPointerCapture?.(e.pointerId);}catch(_){}
  });
  document.addEventListener('pointermove',e=>{
    const s=tripDrag;if(!s||s.pointer!==e.pointerId)return;s.lastY=e.clientY;
    if(!s.active){if(Math.hypot(e.clientX-s.x,e.clientY-s.y)<6)return;s.active=true;s.node.classList.add('dragging');s.node.setAttribute('aria-grabbed','true');
      const scroll=()=>{if(tripDrag!==s)return;const wrap=$('#tripSortScroll'),r=wrap.getBoundingClientRect();const step=s.lastY<r.top+40?-7:s.lastY>r.top+r.height-40?7:0;if(step){wrap.scrollTop+=step;tripMoveAt(s.lastY);}tripScroll=requestAnimationFrame(scroll);};
      if(typeof requestAnimationFrame==='function')tripScroll=requestAnimationFrame(scroll);
    }
    if(e.cancelable)e.preventDefault();tripMoveAt(e.clientY);
  },{passive:false});
  document.addEventListener('pointerup',e=>{if(tripDrag?.pointer===e.pointerId){refreshTripSortOrder();cancelTripDrag();}});
  document.addEventListener('pointercancel',()=>cancelTripDrag());box.addEventListener('lostpointercapture',()=>cancelTripDrag());window.addEventListener('blur',()=>cancelTripDrag());
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){closeTripSort();return;}
    const node=e.target.closest?.('[data-sort-id]');if(!tripSort||!node||!e.altKey||!['ArrowUp','ArrowDown'].includes(e.key))return;
    const nodes=[...box.querySelectorAll('[data-sort-id]')],i=nodes.indexOf(node),j=i+(e.key==='ArrowUp'?-1:1);if(i<0||j<0||j>=nodes.length)return;
    e.preventDefault();box.insertBefore(node,j<i?nodes[j]:nodes[j+1]||null);refreshTripSortOrder();node.focus();
  });
}
