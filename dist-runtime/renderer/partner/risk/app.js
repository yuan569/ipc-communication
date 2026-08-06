/**
 * Partner:risk 风控窗（占位）
 * 当前仅监听 CONTEXT_UPDATED；交互式风控请求在 partner:risk 纳入协议前禁用。请求/响应统一为同 type + replyTo，无 RISK_RESULT 事件。
 */
(function(){
  const $ = (id) => document.getElementById(id);
  function log(...args){ const m=args.map(a=>typeof a==='string'?a:JSON.stringify(a)); const line=m.join(' '); console.log(line); const el=$('log'); if(el){ el.textContent+=line+'\n'; el.scrollTop=el.scrollHeight; } }
  const bus = window.BusClient && typeof window.BusClient.createBusClient==='function' ? window.BusClient.createBusClient('partner:risk') : null;
  if(!bus){ log('BusClient UMD not available. Ensure ../../../dist-umd/event-bus-client.js is loaded.'); return; }

  bus.on('CONTEXT_UPDATED', (e)=> log('[Risk] CONTEXT_UPDATED', e.payload));

  const customerId = $('customerId');
  const amount = $('amount');
  const btnRisk = $('btn-risk');
  const btnClear = $('btn-clear');
  if(btnClear) btnClear.onclick = ()=>{ const l=$('log'); if(l) l.textContent=''; };

  [customerId, amount, btnRisk].forEach((el) => {
    if (el) el.disabled = true;
  });

  log('[Risk] Placeholder window only. Interactive risk requests stay disabled until partner:risk becomes a first-class source in the shared protocol.');
})();
