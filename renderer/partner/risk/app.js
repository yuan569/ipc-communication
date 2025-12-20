(function(){
  const $ = (id) => document.getElementById(id);
  function log(...args){ const m=args.map(a=>typeof a==='string'?a:JSON.stringify(a)); const line=m.join(' '); console.log(line); const el=$('log'); if(el){ el.textContent+=line+'\n'; el.scrollTop=el.scrollHeight; } }
  const bus = window.BusClient && typeof window.BusClient.createBusClient==='function' ? window.BusClient.createBusClient('partner:risk') : null;
  if(!bus){ log('BusClient UMD not available. Ensure ../../../dist-umd/event-bus-client.js is loaded.'); return; }

  bus.on('CONTEXT_UPDATED', (e)=> log('[Risk] CONTEXT_UPDATED', e.payload));
  bus.on('RISK_RESULT', (e)=> log('[Risk] RISK_RESULT', e.payload));

  const customerId = $('customerId');
  const amount = $('amount');
  const btnRisk = $('btn-risk');
  const btnClear = $('btn-clear');
  if(btnClear) btnClear.onclick = ()=>{ const l=$('log'); if(l) l.textContent=''; };

  function uuid(){ return (Date.now().toString(16)+Math.random().toString(16).slice(2)); }

  if(btnRisk) btnRisk.onclick = async ()=>{
    const payload = { customerId: customerId?.value||'C-001', amount: Number(amount?.value||'5000') };
    const req = { id: uuid(), type: 'RISK_CHECK', domain: 'risk', target: 'main', payload };
    log('[Risk] RISK_CHECK → 请求', req);
    const res = await bus.request(req, { timeout: 8000 });
    log('[Risk] RISK_CHECK → 响应', res);
  };
})();
