(function(root){
  'use strict';
  const durableKey=id=>'osaka-v15-pending:'+id,legacyKey=id=>'osaka-v8-pending:'+id;
  function valid(changes,groups){
    return Array.isArray(changes)&&changes.every(c=>c&&groups.includes(c.kind)&&typeof c.record_id==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(c.record_id)&&c.payload?.id===c.record_id&&Number.isInteger(c.expected_revision)&&c.expected_revision>=0&&Number.isInteger(c.position)&&c.position>=0&&typeof c.deleted==='boolean');
  }
  function load(id,durable,session,groups){
    let raw=null;try{raw=durable.getItem(durableKey(id));}catch{}
    if(raw==null)try{raw=session.getItem(legacyKey(id));}catch{}
    if(raw==null)return [];
    const result=JSON.parse(raw);if(!valid(result,groups))throw Error('待同步暫存格式不正確；原內容已保留，請先回報處理。');return result;
  }
  function persist(id,changes,durable,session){
    const text=JSON.stringify(changes);let disk=false,tab=false;
    try{if(changes.length)durable.setItem(durableKey(id),text);else durable.removeItem(durableKey(id));disk=true;}catch{}
    try{if(changes.length)session.setItem(legacyKey(id),text);else session.removeItem(legacyKey(id));tab=true;}catch{}
    return {durable:disk,session:tab};
  }
  const api={load,persist,durableKey,legacyKey,valid};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.OsakaOutbox=api;
})(typeof window!=='undefined'?window:globalThis);
