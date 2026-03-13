/**
 * Partner:credit 信贷窗（占位）
 * 当前仅监听 CONTEXT_UPDATED；CREDIT_* 流程在协议与 handler 完备前禁用。
 */
(function(){
  const $ = (id) => document.getElementById(id);
  function log(...args){ const m=args.map(a=>typeof a==='string'?a:JSON.stringify(a)); const line=m.join(' '); console.log(line); const el=$('log'); if(el){ el.textContent+=line+'\n'; el.scrollTop=el.scrollHeight; } }
  const bus = window.BusClient && typeof window.BusClient.createBusClient==='function' ? window.BusClient.createBusClient('partner:credit') : null;
  if(!bus){ log('BusClient UMD not available. Ensure ../../../dist-umd/event-bus-client.js is loaded.'); return; }

  bus.on('CONTEXT_UPDATED', (e)=> log('[Credit] CONTEXT_UPDATED', e.payload));

  const product = $('product');
  const amount = $('amount');
  const btnApply = $('btn-apply');
  const btnApprove = $('btn-approve');
  const btnClear = $('btn-clear');
  if(btnClear) btnClear.onclick = ()=>{ const l=$('log'); if(l) l.textContent=''; };

  [product, amount, btnApply, btnApprove].forEach((el) => {
    if (el) el.disabled = true;
  });

  log('[Credit] Placeholder window only. CREDIT_* flows are intentionally disabled until the shared protocol and main-process handlers are implemented.');
})();
