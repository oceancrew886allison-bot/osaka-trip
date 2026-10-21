(function(root) {
  'use strict';
  if(typeof module!=='undefined'&&module.exports)root.OsakaBook=require('./bookkeeping-core.js');
  const groups = ['entries','places','wishes','expenses','flights','hotel','coupons','cards','wallet','cash_topups'];
  const empty = () => Object.fromEntries(groups.map(g => [g, []]));
  const clone = x => JSON.parse(JSON.stringify(x));
  const key = r => r.kind + ':' + r.record_id;
  const canonical = v => v && typeof v === 'object'
    ? Array.isArray(v) ? v.map(canonical) : Object.fromEntries(Object.keys(v).sort().map(k => [k,canonical(v[k])]))
    : v;
  const same = (a,b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  function normalize(input) {
    if (!input || !Array.isArray(input.entries) || !Array.isArray(input.places) || !Array.isArray(input.expenses))
      throw Error('備份格式不正確');
    const out = empty();
    for (const g of groups) {
      const items = input[g] ?? [];
      if (!Array.isArray(items)) throw Error('備份格式不正確');
      const ids = new Set();
      out[g] = items.map(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) throw Error('資料格式不正確');
        const r = clone(item);
        if (typeof r.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(r.id) || ids.has(r.id))
          throw Error('資料編號不正確或重複，請檢查備份');
        ids.add(r.id);
        if (JSON.stringify(r).length > 60000) throw Error('單筆資料過大');
        if(g==='coupons' && (typeof r.imagePath!=='string' || !/^[a-f0-9-]+\.(png|jpg|webp)$/.test(r.imagePath))) throw Error('優惠券圖片路徑不正確');
        if(g==='wishes' && r.imagePath!=null && (typeof r.imagePath!=='string' || !/^[a-f0-9-]+\.(png|jpg|webp)$/.test(r.imagePath))) throw Error('商品圖片路徑不正確');
        if (g === 'entries') {
          if (!Number.isInteger(r.day) || r.day<0 || r.day>4 || typeof r.time !== 'string' || !/^\d{2}:\d{2}$/.test(r.time))
            throw Error('行程日期或時間不正確');
        }
        if (g === 'expenses' && (!['JPY','TWD'].includes(r.currency) || !Number.isFinite(Number(r.amount)) || Number(r.amount)<=0))
          throw Error('記帳金額或幣別不正確');
        if(g==='expenses') root.OsakaBook.validatePayments(r,input.cards||[]);
        if(g==='cards') root.OsakaBook.validateCard(r);
        if(g==='wallet'&&(r.id!=='main'||!Number.isInteger(r.initialJPY)||r.initialJPY<0))throw Error('初始現金格式不正確');
        if(g==='cash_topups'&&(!Number.isInteger(r.amountJPY)||r.amountJPY<=0||!/^\d{4}-\d{2}-\d{2}$/.test(r.date||'')))throw Error('補充現金格式不正確');
        for (const coord of ['lat','lon']) {
          if (r[coord] != null && r[coord] !== '' && !Number.isFinite(Number(r[coord]))) throw Error('地點座標不正確');
        }
        return r;
      });
    }
    if (groups.reduce((n,g)=>n+out[g].length,0)>1000) throw Error('資料超過 1000 筆，請先整理備份');
    return out;
  }
  function fromRows(rows) {
    const out = empty();
    for (const g of groups) out[g] = rows.filter(r=>r.kind===g && !r.deleted)
      .sort((a,b)=>a.position-b.position || a.record_id.localeCompare(b.record_id)).map(r=>clone(r.payload));
    return out;
  }
  // Position is assigned only on insertion. Deleting one item must not rewrite
  // unrelated rows or conflict with someone editing another item.
  function diff(rows, desired, previous=[]) {
    const source = new Map(rows.map(r=>[key(r),r]));
    const prior = new Map(previous.map(r=>[key(r),r]));
    const changes=[]; const present=new Set();
    for (const g of groups) {
      let next = rows.filter(r=>r.kind===g).reduce((n,r)=>Math.max(n,r.position+1),0);
      for (const p of desired[g]) {
        const k=g+':'+p.id, old=source.get(k); present.add(k);
        if (!old || old.deleted || !same(old.payload,p)) changes.push({kind:g,record_id:p.id,
          payload:clone(p),position:old?.position??prior.get(k)?.position??next++,deleted:false,
          expected_revision:prior.get(k)?.expected_revision??old?.revision??0});
      }
    }
    for (const r of rows) if(groups.includes(r.kind) && !r.deleted && !present.has(key(r))) changes.push({kind:r.kind,record_id:r.record_id,
      payload:clone(r.payload),position:r.position,deleted:true,expected_revision:prior.get(key(r))?.expected_revision??r.revision});
    return changes;
  }
  function overlay(rows, pending) {
    const merged = new Map(rows.map(r=>[key(r),clone(r)]));
    for(const c of pending) merged.set(key(c), {...c,revision:c.expected_revision});
    return fromRows([...merged.values()]);
  }
  function conflicts(rows,pending) {
    const byKey=new Map(rows.map(r=>[key(r),r]));
    return pending.filter(p=>(byKey.get(key(p))?.revision??0)!==p.expected_revision);
  }
  function reconcile(rows,pending){
    const byKey=new Map(rows.map(r=>[key(r),r]));
    return pending.filter(p=>{const r=byKey.get(key(p));return !(r&&r.revision>p.expected_revision&&r.deleted===p.deleted&&same(r.payload,p.payload));});
  }
  const api={groups,empty,clone,key,same,normalize,fromRows,diff,overlay,conflicts,reconcile};
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  else root.OsakaSync=api;
})(typeof window!=='undefined'?window:globalThis);
