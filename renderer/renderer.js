(function() {
  /**
   * 渲染进程 Demo（仅使用 UMD SDK，不做 window.__bus 兼容）
   *
   * 与主进程 main.ts 的示例一一对应关系：
   * - 单向通信（Emit one-way LOG） → 事件类型 LOG → 主进程 bus.on('LOG') 打印
   * - ACK（仅分发确认）/ 请求-响应（R/R） → 事件类型 PING → 主进程 bus.on('PING') 打印；
   *   R/R 的响应由渲染端在收到非 replyTo 的 PING 时自动回 PONG（见 onPing）
   * - 广播（Broadcast BROADCAST） → 事件类型 BROADCAST → 主进程 bus.on('BROADCAST') 打印
   * - 定向发送（Emit CALL_START → workbench） → 事件类型 CALL_START → 主进程 bus.on('CALL_START') 打印
   * - 请求主进程推送（REQ_MAIN_PUSH） → 主进程收到后 emit SERVER_PUSH → 渲染端 bus.on('SERVER_PUSH') 打印
   */

  const $ = (id) => document.getElementById(id);

  // 简易日志输出到页面（并同步到控制台）
  function log(...args) {
    const m = args.map(a => typeof a === 'string' ? a : JSON.stringify(a));
    const line = m.join(' ');
    console.log(line);
    const el = $('log');
    if (el) {
      el.textContent += line + '\n';
      el.scrollTop = el.scrollHeight;
    }
  }
  function clearLog() {
    const el = $('log');
    if (el) el.textContent = '';
  }
  function uuid() {
    return (Date.now().toString(16) + Math.random().toString(16).slice(2));
  }

  // UI helpers：获取输入框的值
  const getVal = (id, fallback = '') => {
    const el = $(id);
    return (el && 'value' in el) ? (el.value || fallback) : fallback;
  };

  // 仅使用 UMD 导出的 SDK（window.BusClient），不做回退
  const bus = window.BusClient && typeof window.BusClient.createBusClient === 'function'
    ? window.BusClient.createBusClient('renderer')
    : null;

  if (!bus) {
    // 若看到此提示，说明 UMD 没有正确加载（请确认 ../dist-umd/event-bus-client.js 存在且路径无误）
    log('BusClient UMD not available. Ensure ../dist-umd/event-bus-client.js is loaded.');
    return;
  }

  // 本地“订阅开关”（仅用于演示渲染端过滤效果）
  let subCallStart = false;

  /**
   * 收到 PING（且不是响应消息：没有 replyTo）时，自动回 PONG
   * - 用于演示“请求-响应”流程：renderer A 发送 PING；renderer B 收到后回复 PONG；A 收到结果
   * - 在本 Demo 中，同一个渲染器做了自动回复（方便演示）
   */
  const onPing = (e) => {
    if (e && !e.replyTo) {
      const reply = { id: uuid(), type: e.type, domain: e.domain, source: 'renderer', payload: { pong: true, echo: e.payload }, ts: Date.now(), replyTo: e.id };
      bus.emit(reply);
      log('[Renderer] auto-responded PONG for', e.id);
    }
  };

  // 事件订阅（与主进程 handlers 对应）
  bus.on('PING', onPing);                          // 对应 main.ts 内的 bus.on('PING') 日志
  bus.on('SERVER_PUSH', (e) =>                     // 对应 main.ts 内的 REQ_MAIN_PUSH → SERVER_PUSH
    log('[Renderer] SERVER_PUSH:', e)
  );
  bus.on('BROADCAST', (e) =>                       // 对应 main.ts 内的 bus.on('BROADCAST') 日志
    log('[Renderer] BROADCAST received:', e.payload)
  );
  bus.on('CALL_START', (e) => {                    // 对应 main.ts 内的 bus.on('CALL_START') 日志
    if (subCallStart) log('[Renderer][CALL_START]', e.payload);
  });

  log('SDK BusClient ready');

  // ————— 按钮绑定（与页面分区一致） —————

  // Logs：清空日志
  const btnClear = $('btn-clear');
  if (btnClear) btnClear.onclick = () => clearLog();

  // 单向通信（One-way）：仅到主进程，不分发到任何窗口（target 留空）
  // 对应 main.ts：bus.on('LOG') 打印
  const btnLog = $('btn-emit-log-oneway');
  if (btnLog) btnLog.onclick = () => {
    const message = getVal('msg-input', 'hello');
    const evt = { id: uuid(), type: 'LOG', domain: 'demo', payload: { message, from: 'renderer' } };
    log('[Renderer] emit one-way LOG', evt);
    bus.emit(evt);
  };

  // ACK：仅请求分发确认（不等业务响应）
  // 对应 main.ts：bus.on('PING') 会打印该请求的 payload（ACK 完成后即返回）
  const btnAck = $('btn-ack');
  if (btnAck) btnAck.onclick = async () => {
    const req = { id: uuid(), type: 'PING', domain: 'demo', target: 'workbench', payload: { msg: getVal('msg-input', 'hello-ack') } };
    log('[Renderer] sending ACK only', req);
    const ack = await bus.ack(req);
    log('[Renderer] ACK result', ack);
  };

  // 请求-响应（Request-Response）：等待某一方用 replyTo=原 id 响应
  // 对应 main.ts：bus.on('PING') 日志能看到请求；响应结果在此打印
  const btnRR = $('btn-rr');
  if (btnRR) btnRR.onclick = async () => {
    const req = { id: uuid(), type: 'PING', domain: 'demo', target: 'workbench', payload: { msg: getVal('msg-input', 'hello-rr') } };
    log('[Renderer] sending R/R request', req);
    const res = await bus.request(req, { timeout: 5000 });
    log('[Renderer] R/R result', res);
  };

  // 广播（Broadcast）：target='*'，发给所有窗口
  // 对应 main.ts：bus.on('BROADCAST') 打印；本渲染器也会在 bus.on('BROADCAST') 打印
  const btnBroadcast = $('btn-broadcast');
  if (btnBroadcast) btnBroadcast.onclick = () => {
    const evt = { id: uuid(), type: 'BROADCAST', domain: 'demo', target: '*', payload: { message: getVal('msg-input', 'hello all') } };
    log('[Renderer] broadcasting', evt);
    bus.emit(evt);
  };

  // 定向（Targeted）：发送到指定窗口（workbench）
  // 对应 main.ts：bus.on('CALL_START') 打印
  const btnCallStart = $('btn-emit-callstart');
  if (btnCallStart) btnCallStart.onclick = () => {
    const payload = { caller: getVal('caller-input', '10086'), ticketId: getVal('ticket-input', 'T-001') };
    const evt = { id: uuid(), type: 'CALL_START', domain: 'call', target: 'workbench', payload };
    log('[Renderer] emit CALL_START', evt);
    bus.emit(evt);
  };

  // 订阅/取消订阅（渲染端本地过滤演示）
  const btnSub = $('btn-sub-callstart');
  if (btnSub) btnSub.onclick = () => {
    subCallStart = true;
    log('[Renderer] subscribed CALL_START');
  };
  const btnUnsub = $('btn-unsub-callstart');
  if (btnUnsub) btnUnsub.onclick = () => {
    subCallStart = false;
    log('[Renderer] unsubscribed CALL_START');
  };

  // 请求主进程主动推送：发 REQ_MAIN_PUSH，请主进程用 SERVER_PUSH 回给本窗体
  // 对应 main.ts：bus.on('REQ_MAIN_PUSH') → bus.emit('SERVER_PUSH')；本渲染器在 bus.on('SERVER_PUSH') 打印
  const btnReqPush = $('btn-req-main-push');
  if (btnReqPush) btnReqPush.onclick = () => {
    const req = { id: uuid(), type: 'REQ_MAIN_PUSH', domain: 'demo', target: undefined, payload: { msg: getVal('msg-input', 'please push'), target: 'workbench' } };
    log('[Renderer] requesting main to push', req);
    bus.emit(req);
  };
})();
