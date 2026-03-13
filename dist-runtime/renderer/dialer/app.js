(function(){
  // Dialer 作为 OUTBOUND_DISPATCH 的响应方（Responder）
  const $ = (id) => document.getElementById(id);
  function log(...args){ const m=args.map(a=>typeof a==='string'?a:JSON.stringify(a)); const line=m.join(' '); console.log(line); const el=$('log'); if(el){ el.textContent+=line+'\n'; el.scrollTop=el.scrollHeight; } }
  const bus = window.BusClient?.createBusClient?.('dialer') || null;
  if(!bus){ log('BusClient UMD not available. Ensure ../../dist-umd/event-bus-client.js is loaded.'); return; }

  // 清空日志按钮
  const btnClear = $('btn-clear'); if(btnClear) btnClear.onclick = ()=>{ const l=$('log'); if(l) l.textContent=''; };

  // 监听 OUTBOUND_DISPATCH 请求，并进行响应
  bus.on('OUTBOUND_DISPATCH', (e)=>{
    if (e.replyTo) return; // 忽略响应消息
    const tel = e?.payload?.tel || '';
    const accepted = typeof tel === 'string' && tel.length >= 7;
    log('[Dialer] 收到 OUTBOUND_DISPATCH 请求:', e.payload, '→ accepted=', accepted);
    // 使用 respond 进行回包
    bus.respond(e, { accepted, tel, at: Date.now() });
  });
})();