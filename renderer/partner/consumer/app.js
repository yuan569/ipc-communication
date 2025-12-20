(function(){
  const $ = (id) => document.getElementById(id);
  function log(...args){ const m=args.map(a=>typeof a==='string'?a:JSON.stringify(a)); const line=m.join(' '); console.log(line); const el=$('log'); if(el){ el.textContent+=line+'\n'; el.scrollTop=el.scrollHeight; } }
  const bus = window.BusClient && typeof window.BusClient.createBusClient==='function' ? window.BusClient.createBusClient('partner:consumer') : null;
  if(!bus){ log('BusClient UMD not available. Ensure ../../../dist-umd/event-bus-client.js is loaded.'); return; }

  bus.on('CONTEXT_UPDATED', (e)=> log('[Consumer] CONTEXT_UPDATED', e.payload));
  bus.on('LOAN_RESULT', (e)=> log('[Consumer] LOAN_RESULT', e.payload));

  const amount = $('amount');
  const term = $('term');
  const btnApply = $('btn-apply');
  const btnClear = $('btn-clear');
  if(btnClear) btnClear.onclick = ()=>{ const l=$('log'); if(l) l.textContent=''; };

  function uuid(){ return (Date.now().toString(16)+Math.random().toString(16).slice(2)); }

  if(btnApply) btnApply.onclick = async ()=>{
    const payload = { amount: Number(amount?.value||'15000'), term: Number(term?.value||'12'), product: 'consumer' };
    const req = { id: uuid(), type: 'LOAN_APPLY', domain: 'consumer', target: 'main', payload };
    log('[Consumer] LOAN_APPLY → 请求', req);
    const res = await bus.request(req, { timeout: 8000 });
    log('[Consumer] LOAN_APPLY → 响应', res);
  };
})();
