(function() {
  const $ = (id) => document.getElementById(id);
  function log(...args) {
    const m = args.map(a => typeof a === 'string' ? a : JSON.stringify(a));
    const line = m.join(' ');
    console.log(line);
    const el = $('log');
    if (el) el.textContent += line + '\n';
  }
  function uuid() {
    return (Date.now().toString(16) + Math.random().toString(16).slice(2));
  }

  if (window.__bus) {
    // Listen all events and auto-respond to PING (request-response demo)
    window.__bus.on((e) => {
      log('[Renderer] received', e);
      if (e.type === 'PING' && !e.replyTo) {
        const reply = { id: uuid(), type: e.type, domain: e.domain, source: 'renderer', payload: { pong: true, echo: e.payload }, ts: Date.now(), replyTo: e.id };
        window.__bus.emit(reply);
        log('[Renderer] responded with PONG for', e.id);
      }
    });
    log('window.__bus ready');

    const btnAck = $('btn-ack');
    if (btnAck) {
      btnAck.onclick = async () => {
        const req = { id: uuid(), type: 'PING', domain: 'demo', target: 'workbench', payload: { msg: 'hello-ack' } };
        log('[Renderer] sending ACK only', req);
        const ack = await window.__bus.ack(req);
        log('[Renderer] ACK result', ack);
      };
    }

    const btnRR = $('btn-rr');
    if (btnRR) {
      btnRR.onclick = async () => {
        const req = { id: uuid(), type: 'PING', domain: 'demo', target: 'workbench', payload: { msg: 'hello-rr' } };
        log('[Renderer] sending R/R request', req);
        const res = await window.__bus.request(req, { timeout: 5000 });
        log('[Renderer] R/R result', res);
      };
    }
  } else {
    log('window.__bus not found');
  }
})();

