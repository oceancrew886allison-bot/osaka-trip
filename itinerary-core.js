(function(root){
  'use strict';
  const ordered=(entries,day)=>entries.filter(e=>e.day===day).map((e,i)=>({e,i})).sort((a,b)=>a.e.time.localeCompare(b.e.time)||(Number.isInteger(a.e.scheduleOrder)?a.e.scheduleOrder:a.i)-(Number.isInteger(b.e.scheduleOrder)?b.e.scheduleOrder:b.i)||a.i-b.i).map(x=>x.e);
  function minutes(time){
    if(typeof time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('請先修正行程中的時間格式');
    const [h,m]=time.split(':').map(Number);return h*60+m;
  }
  function propose(entries,day,ids){
    const before=ordered(entries,day),oldIds=before.map(e=>e.id);
    if(ids.length!==before.length||new Set(ids).size!==ids.length||ids.some(id=>!oldIds.includes(id)))throw Error('當天行程已更新，請重新開啟編輯行程');
    if(ids.every((id,i)=>id===oldIds[i]))return [];
    before.forEach(e=>minutes(e.time));const byId=new Map(before.map(e=>[e.id,e]));
    return ids.map((id,i)=>({id,name:byId.get(id).name,before:byId.get(id).time,after:before[i].time}));
  }
  function apply(entries,day,proposal){
    const before=ordered(entries,day),ids=before.map(e=>e.id);
    if(proposal.length!==ids.length||new Set(proposal.map(p=>p.id)).size!==ids.length||proposal.some(p=>!ids.includes(p.id)))throw Error('行程已更新，請重新開啟編輯行程');
    const changes=new Map(proposal.map((p,i)=>{if(p.after!==before[i].time)throw Error('時間格已更新，請重新開啟編輯行程');return [p.id,{p,i}];}));
    return entries.map(e=>{const c=changes.get(e.id);if(!c||e.day!==day)return e;const {p,i}=c;if(e.time!==p.before)throw Error('行程已更新，請重新開啟編輯行程');minutes(p.after);const oldIndex=ids.indexOf(e.id),oldPrev=ids[oldIndex-1],newPrev=proposal[i-1]?.id;
      return {...e,time:p.after,scheduleOrder:i,...(i>0&&oldPrev!==newPrev?{routeNeedsReview:true}:{})};});
  }
  const api={ordered,propose,apply,minutes};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.OsakaSchedule=api;
})(typeof window!=='undefined'?window:globalThis);
