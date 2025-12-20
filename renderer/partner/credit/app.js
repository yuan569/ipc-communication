(function(){
  const $ = (id) => document.getElementById(id);
  function log(...args){ const m=args.map(a=>typeof a==='string'?a:JSON.stringify(a)); const line=m.join(' '); console.log(line); const el=$('log'); if(el){ el.textContent+=line+'\n'; el.scrollTop=el.scrollHeight; } }
  const bus = window.BusClient && typeof window.BusClient.createBusClient==='function' ? window.BusClient.createBusClient('partner:credit') : null;
  if(!bus){ log('BusClient UMD not available. Ensure ../../../dist-umd/event-bus-client.js is loaded.'); return; }

  bus.on('CONTEXT_UPDATED', (e)=> log('[Credit] CONTEXT_UPDATED', e.payload));
  bus.on('CREDIT_RESULT', (e)=> log('[Credit] CREDIT_RESULT', e.payload));

  const product = $('product');
  const amount = $('amount');
  const btnApply = $('btn-apply');
  const btnApprove = $('btn-approve');
  const btnClear = $('btn-clear');
  if(btnClear) btnClear.onclick = ()=>{ const l=$('log'); if(l) l.textContent=''; };

  function uuid(){ return (Date.now().toString(16)+Math.random().toString(16).slice(2)); }

  if(btnApply) btnApply.onclick = async ()=>{
    const payload = { product: product?.value||'gold-card', amount: Number(amount?.value||'8000') };
    const req = { id: uuid(), type: 'CREDIT_APPLY', domain: 'credit', target: 'main', payload };
    log('[Credit] CREDIT_APPLY → 请求', req);
    const res = await bus.request(req, { timeout: 8000 });
    log('[Credit] CREDIT_APPLY → 响应', res);
  };

  if(btnApprove) btnApprove.onclick = async ()=>{
    const payload = { approved: true, amount: Number(amount?.value||'8000') };
    const req = { id: uuid(), type: 'CREDIT_APPROVE', domain: 'credit', target: 'main', payload };
    log('[Credit] CREDIT_APPROVE → 请求', req);
    const res = await bus.request(req, { timeout: 8000 });
    log('[Credit] CREDIT_APPROVE → 响应', res);
  };
})();
