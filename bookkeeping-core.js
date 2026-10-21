(function(root){
  'use strict';
  const RATE=1/4.9;
  const categories=['吃飯','交通','購物','老公','老婆','門票','機票','住宿','其他'];
  const defaults=[
    {id:'dbs-eco',name:'星展 eco 卡',rate:3.5,cap:12000,note:'原始回饋 5%；扣除海外手續費後預估 3.5%。',url:'',start:'',end:'',archived:false},
    {id:'taishin-payplus',name:'台新 Pay+',rate:3.8,cap:null,note:'搭配台新信用卡；PayPay 合作商家；免海外交易手續費。獨立付款選項。',url:'https://paypay.ne.jp/shop/',start:'',end:'',archived:false},
    {id:'cathay-cube',name:'國泰 CUBE 卡',rate:3.5,cap:null,note:'原始回饋 5%；部分日本指定通路；扣除海外手續費後預估 3.5%。',url:'https://www.cathaybk.com.tw/cathaybk/promo/event/credit-card/product/japanrewards/index.html#pop-cate7-13',start:'',end:'',archived:false},
    {id:'jihe',name:'吉鶴卡',rate:5.5,cap:20000,note:'原始回饋 7%；大阪環球影城限定；扣除海外手續費後預估 5.5%。',url:'',start:'',end:'',archived:false}
  ];
  const amount=n=>Number.isFinite(Number(n))&&Number(n)>0;
  const minor=n=>Math.round(Number(n)*100);
  function sum(values){let total=0,error=0;for(const value of values){const y=Number(value)-error,next=total+y;error=(next-total)-y;total=next;}return total;}
  function paymentInputs(expense){
    return (expense.payments||[{type:'cash',amount:expense.amount??'',cardId:''}]).map(p=>{
      const currency=p.inputCurrency||expense.currency||'JPY',value=p.inputAmount??p.amount;
      return {...p,amountJPY:currency==='JPY'?String(value??''):'',amountTWD:currency==='TWD'?String(value??''):'',inputCurrency:currency};
    });
  }
  function combineInputs(inputs,previous){
    const parsed=inputs.map(p=>{
      const j=String(p.amountJPY??'').trim(),t=String(p.amountTWD??'').trim();
      if((!j&&!t)||(j&&t))throw Error('每項付款請填日圓或台幣其中一格');
      const inputCurrency=j?'JPY':'TWD',inputAmount=Number(j||t);
      if(!amount(inputAmount)||Math.abs(inputAmount*100-minor(inputAmount))>0.000001)throw Error('付款金額請填大於零的數字，最多兩位小數');
      const inputFx=inputCurrency==='TWD'?1:p.inputCurrency==='JPY'&&amount(p.inputFx)?p.inputFx:previous?.currency==='JPY'&&amount(previous.paymentFx)?previous.paymentFx:RATE;
      return {type:p.type,...(p.type==='card'?{cardId:p.cardId}:{}),inputCurrency,inputAmount,inputFx,inputTwd:inputAmount*inputFx};
    });
    if(!parsed.length)throw Error('請至少填寫一種付款方式');
    const currency=parsed.every(p=>p.inputCurrency==='JPY')?'JPY':'TWD';
    const payments=parsed.map(p=>({...p,amount:currency==='JPY'?p.inputAmount:minor(p.inputTwd)/100}));
    if(payments.some(p=>p.amount<=0))throw Error('換算後付款金額須至少 NT$0.01');
    const total=payments.reduce((n,p)=>n+minor(p.amount),0)/100;
    return {currency,amount:total,payments,paymentInputVersion:12,paymentFx:currency==='JPY'?payments[0].inputFx:1,paymentTwd:currency==='JPY'?total*payments[0].inputFx:total};
  }
  function unassignedInput(p){
    const j=String(p.amountJPY??'').trim(),t=String(p.amountTWD??'').trim();
    if((!j&&!t)||(j&&t))throw Error('請填日圓或台幣其中一格');
    const value=Number(j||t);if(!amount(value))throw Error('請輸入大於零的金額');
    return {amount:value,currency:j?'JPY':'TWD'};
  }
  function validatePayments(e,cards){
    if(e.payments==null)return;
    if(!Array.isArray(e.payments)||!e.payments.length||e.payments.length>30)throw Error('請至少填寫一種付款方式（最多 30 項）');
    if(Math.abs(Number(e.amount)*100-minor(e.amount))>0.000001)throw Error('有付款方式的消費金額最多兩位小數');
    let sum=0;
    for(const p of e.payments){
      if(!p||!['cash','card'].includes(p.type)||!Number.isFinite(p.amount)||!amount(p.amount))throw Error('請輸入正確付款方式及大於零的金額');
      if(Math.abs(Number(p.amount)*100-minor(p.amount))>0.000001)throw Error('付款金額最多兩位小數');
      if(p.type==='card'&&(!p.cardId||!cards.some(c=>c.id===p.cardId)))throw Error('請選擇信用卡');
      if(e.paymentInputVersion===12){
        if(!['JPY','TWD'].includes(p.inputCurrency)||!Number.isFinite(p.inputAmount)||!amount(p.inputAmount)||Math.abs(p.inputAmount*100-minor(p.inputAmount))>0.000001||!Number.isFinite(p.inputFx)||!amount(p.inputFx)||!Number.isFinite(p.inputTwd)||Math.abs(p.inputTwd-p.inputAmount*p.inputFx)>0.000001||(p.inputCurrency==='TWD'&&p.inputFx!==1))throw Error('付款原幣換算不正確');
        const normalized=e.currency==='JPY'?p.inputAmount:minor(p.inputTwd)/100;
        if((e.currency==='JPY'&&(p.inputCurrency!=='JPY'||Math.abs(p.inputFx-e.paymentFx)>1e-12))||Math.abs(p.amount-normalized)>0.000001)throw Error('付款原幣金額與合計不符');
      }
      sum+=minor(p.amount);
    }
    if(sum!==minor(e.amount))throw Error('付款金額加總必須等於消費總額');
    if(!Number.isFinite(e.paymentFx)||!amount(e.paymentFx)||!Number.isFinite(e.paymentTwd)||Math.abs(e.paymentTwd-Number(e.amount)*e.paymentFx)>0.000001||(e.currency==='TWD'&&e.paymentFx!==1))throw Error('付款換算金額不正確');
  }
  function snapshot(e,previous){
    if(e.payments==null)return e;
    // Preserve the transaction's existing basis on edits. Travel totals retain V10's fixed rate.
    const fx=e.currency==='TWD'?1:previous?.currency==='JPY'&&amount(previous.paymentFx)?previous.paymentFx:RATE;
    e.paymentFx=fx;e.paymentTwd=Number(e.amount)*fx;return e;
  }
  function balances(data){
    const invested=Number(data.wallet?.find(w=>w.id==='main')?.initialJPY||0)+(data.cash_topups||[]).reduce((s,t)=>s+Number(t.amountJPY||0),0);
    let cashMinor=0;const cardValues=Object.fromEntries((data.cards||[]).map(c=>[c.id,[]]));
    for(const e of data.expenses||[])for(const p of e.payments||[]){
      if(p.type==='cash'&&(p.inputCurrency||e.currency)==='JPY')cashMinor+=minor(p.inputAmount??p.amount);
      if(p.type==='card')(cardValues[p.cardId]??=[]).push(p.inputTwd??Number(p.amount)*(e.currency==='TWD'?1:e.paymentFx??RATE));
    }
    const cashSpent=cashMinor/100,cards=Object.fromEntries(Object.entries(cardValues).map(([id,values])=>[id,sum(values)]));
    const remaining=invested-cashSpent;
    return {invested,cashSpent,remaining:Math.abs(remaining)<1e-8?0:remaining,cards};
  }
  function validateCard(c){
    if(!c.name?.trim()||c.name.length>100)throw Error('請輸入信用卡名稱（100 字以內）');
    if(!Number.isFinite(Number(c.rate))||Number(c.rate)<0||Number(c.rate)>100)throw Error('回饋率請填 0 至 100');
    if(c.cap!=null&&(!amount(c.cap)))throw Error('優惠消費上限請填正數，無上限請留空');
    if(typeof c.archived!=='boolean')throw Error('信用卡封存設定不正確');
    if(c.start&&c.end&&c.start>c.end)throw Error('優惠結束日期不可早於開始日期');
    if(c.url){let u;try{u=new URL(c.url);}catch{throw Error('查詢連結格式不正確');}if(u.protocol!=='https:')throw Error('查詢連結請使用 https');}
  }
  const atCap=(value,cap)=>cap!=null&&Number(value)+1e-8>=Number(cap);
  const api={RATE,categories,defaults,validatePayments,snapshot,balances,validateCard,atCap,paymentInputs,combineInputs,unassignedInput,sum};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.OsakaBook=api;
})(typeof window!=='undefined'?window:globalThis);
