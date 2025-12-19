import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { createEventBus } from './event-bus-core';

// Minimal runnable Electron main entry with window registration
const bus = createEventBus<Record<string, any>>();
let mainWindow: BrowserWindow | null = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '..', 'event-bus-client', 'preload.js')
    }
  });

  // Register window for targeted dispatch from the event bus
  bus.registerWindow('workbench', mainWindow);

  // Load a minimal HTML page. In a real app, replace with file:// URL of your renderer bundle
  await mainWindow.loadURL('data:text/html;charset=utf-8,' +
    encodeURIComponent(`
      <!doctype html>
      <html>
        <head><meta charset="utf-8"/><title>IPC Bus Demo</title></head>
        <body>
          <h1>IPC Bus Demo</h1>
          <div>
            <button id="btn-ack">Send ACK only</button>
            <button id="btn-rr">Send request and wait response</button>
          </div>
          <pre id="log"></pre>
          <script>
            const $ = (id) => document.getElementById(id);
            function log(...args) { const m = args.map(a => typeof a==='string'?a:JSON.stringify(a)); const line = m.join(' '); console.log(line); $('log').textContent += line + '\n'; }
            function uuid(){ return (Date.now().toString(16) + Math.random().toString(16).slice(2)); }

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

              $('btn-ack').onclick = async () => {
                const req = { id: uuid(), type: 'PING', domain: 'demo', target: 'workbench', payload: { msg: 'hello-ack' } };
                log('[Renderer] sending ACK only', req);
                const ack = await window.__bus.ack(req);
                log('[Renderer] ACK result', ack);
              };

              $('btn-rr').onclick = async () => {
                const req = { id: uuid(), type: 'PING', domain: 'demo', target: 'workbench', payload: { msg: 'hello-rr' } };
                log('[Renderer] sending R/R request', req);
                const res = await window.__bus.request(req, { timeout: 5000 });
                log('[Renderer] R/R result', res);
              };
            } else {
              log('window.__bus not found');
            }
          </script>
        </body>
      </html>
    `));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
