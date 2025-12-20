(function() {
  // Workbench: 展示五类通信模式的发起方/接收方
  const $ = (id) => document.getElementById(id);
  function log(...args) { const m=args.map(a=>typeof a==='string'?a:JSON.stringify(a)); const line=m.join(' '); console.log(line); const el=$('log'); if(el){ el.textContent+=line+'\n'; el.scrollTop=el.scrollHeight; } }
  function clearLog(){ const el=$('log'); if(el) el.textContent=''; }
  function uuid(){ return (Date.now().toString(16)+Math.random().toString(16).slice(2)); }
  const getVal = (id, fb='') => { const el=$(id); return (el && 'value' in el) ? (el.value || fb) : fb; };

  const bus = window.BusClient?.createBusClient?.('workbench') || null;
  if(!bus){ log('BusClient UMD not available. Ensure ../../dist-umd/event-bus-client.js is loaded.'); return; }

  // 监听来自 Partner:auto 的工单完成事件（emit）
  bus.on('TICKET_DONE', (e)=>{
    log('[Workbench] TICKET_DONE received:', e.payload);
  });

  // 1) 外呼下发：Workbench ⇄ Dialer（request/response）
  const btnOutbound = $('btn-outbound');
  if(btnOutbound) btnOutbound.onclick = async ()=>{
    const tel = getVal('tel','');
    const req = { id: uuid(), type: 'OUTBOUND_DISPATCH', domain: 'cti', target: 'dialer', payload: { tel } };
    log('[Workbench] OUTBOUND_DISPATCH → 请求 → dialer', req);
    const res = await bus.request(req, { timeout: 8000 });
    log('[Workbench] OUTBOUND_DISPATCH → 响应', res);
  };

  // 2) 客户锁定：Workbench ⇄ Main（request/response）
  const btnLock = $('btn-lock');
  if(btnLock) btnLock.onclick = async ()=>{
    const customerId = getVal('customerId','C-001');
    const req = { id: uuid(), type: 'LOCK_CUSTOMER', domain: 'crm', target: 'main', payload: { customerId } };
    log('[Workbench] LOCK_CUSTOMER → 请求 → main', req);
    const res = await bus.request(req, { timeout: 8000 });
    log('[Workbench] LOCK_CUSTOMER → 响应', res);
  };

  // 3) 工单流转（接单）：Workbench ⇄ Partner:auto（request/response）
  const btnAccept = $('btn-accept');
  if(btnAccept) btnAccept.onclick = async ()=>{
    const ticketId = getVal('ticketId','T-100');
    const req = { id: uuid(), type: 'TICKET_ACCEPT', domain: 'ticket', target: 'partner:auto', payload: { ticketId } };
    log('[Workbench] TICKET_ACCEPT → 请求 → partner:auto', req);
    const res = await bus.request(req, { timeout: 8000 });
    log('[Workbench] TICKET_ACCEPT → 响应', res);
  };

  // 5) 风控校验：Workbench ⇄ Main（request/response）
  const btnRisk = $('btn-risk');
  if(btnRisk) btnRisk.onclick = async ()=>{
    const amount = Number(getVal('amount','5000')) || 0;
    const customerId = getVal('customerId','C-001');
    const req = { id: uuid(), type: 'RISK_CHECK', domain: 'risk', target: 'main', payload: { customerId, amount } };
    log('[Workbench] RISK_CHECK → 请求 → main', req);
    const res = await bus.request(req, { timeout: 8000 });
    log('[Workbench] RISK_CHECK → 响应', res);
  };

  // Logs 清空
  const btnClear = $('btn-clear'); if(btnClear) btnClear.onclick = ()=> clearLog();
})();