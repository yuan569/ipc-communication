(function(){
  const $ = (id) => document.getElementById(id);
  function log(...args){ const m=args.map(a=>typeof a==='string'?a:JSON.stringify(a)); const line=m.join(' '); console.log(line); const el=$('log'); if(el){ el.textContent+=line+'\n'; el.scrollTop=el.scrollHeight; } }
  const bus = window.BusClient && typeof window.BusClient.createBusClient==='function' ? window.BusClient.createBusClient('partner:consumer') : null;
  if(!bus){ log('BusClient UMD not available. Ensure ../../../dist-umd/event-bus-client.js is loaded.'); return; }

  bus.on('CONTEXT_UPDATED', (e)=> log('[Consumer] CONTEXT_UPDATED', e.payload));

  const amount = $('amount');
  const term = $('term');
  const btnApply = $('btn-apply');
  const btnClear = $('btn-clear');
  if(btnClear) btnClear.onclick = ()=>{ const l=$('log'); if(l) l.textContent=''; };

  [amount, term, btnApply].forEach((el) => {
    if (el) el.disabled = true;
  });

  log('[Consumer] Placeholder window only. LOAN_* flows are intentionally disabled until the shared protocol and main-process handlers are implemented.');
})();
