(function(){
  // Partner:auto 作为 TICKET_ACCEPT 的响应方，并在接单后主动 emit TICKET_DONE → workbench
  const $ = (id) => document.getElementById(id);
  function log(...args){ const m=args.map(a=>typeof a==='string'?a:JSON.stringify(a)); const line=m.join(' '); console.log(line); const el=$('log'); if(el){ el.textContent+=line+'\n'; el.scrollTop=el.scrollHeight; } }
  const bus = window.BusClient?.createBusClient?.('partner:auto') || null;
  if(!bus){ log('BusClient UMD not available. Ensure ../../../dist-umd/event-bus-client.js is loaded.'); return; }

  const btnClear = $('btn-clear'); if(btnClear) btnClear.onclick = ()=>{ const l=$('log'); if(l) l.textContent=''; };
  function uuid(){ return (Date.now().toString(16)+Math.random().toString(16).slice(2)); }

  // 监听接单请求：TICKET_ACCEPT（request/response）
  bus.on('TICKET_ACCEPT', (e)=>{
    if (e.replyTo) return; // 仅处理请求
    const ticketId = e?.payload?.ticketId;
    const accepted = Boolean(ticketId);
    log('[Partner:auto] 收到 TICKET_ACCEPT:', e.payload, '→ accepted=', accepted);
    // 响应接单结果
    bus.respond(e, { accepted, ticketId, at: Date.now() });
    // 若接单，模拟处理完成后主动通知 Workbench：TICKET_DONE（emit）
    if (accepted) {
      setTimeout(()=>{
        const evt = { id: uuid(), type: 'TICKET_DONE', domain: 'ticket', target: 'workbench', payload: { ticketId, by: 'partner:auto', ts: Date.now() } };
        log('[Partner:auto] 处理完成 → emit TICKET_DONE → workbench', evt.payload);
        bus.emit(evt);
      }, 800);
    }
  });
})();