import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { createEventBus } from './event-bus-core';

/**
 * 主进程入口（Electron Main）
 * - 事件总线：统一 ACK / Request-Response、广播/定向分发、replyTo 关联
 * - 简易状态：本文件内仅保留与新示例相关的状态（locks/risk 缓存）
 * - 多窗口：Workbench、Dialer、Partner:auto（另外 partner:credit/consumer/risk 仅占位展示日志）
 */
const bus = createEventBus<Record<string, any>>();

// —— 极简状态（与新场景相关） ——
const state = {
  locks: { customers: new Map<string, string>() },
  caches: { risk: new Map<string, { passed: boolean; score: number; amount: number; ts: number }>() }
};

function v4() { return require('uuid').v4(); }

// —— 窗口管理 ——
let workbench: BrowserWindow | null = null;
let dialer: BrowserWindow | null = null;
let partnerAuto: BrowserWindow | null = null;
let partnerCredit: BrowserWindow | null = null;
let partnerConsumer: BrowserWindow | null = null;
let partnerRisk: BrowserWindow | null = null;

function bindDevtoolsShortcut(win: BrowserWindow) {
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && (input.key === 'I' || input.key === 'i')))) {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
}

async function createWindows() {
  // 解析并校验 preload 路径（开发/打包均可用）
  let preloadPath = path.join(app.getAppPath(), 'event-bus-client', 'preload.js');
  if (!fs.existsSync(preloadPath)) {
    const alt = path.join(__dirname, '..', 'event-bus-client', 'preload.js');
    console.warn('[main] preload not found at appPath, try __dirname path:', alt);
    if (fs.existsSync(alt)) preloadPath = alt;
  }
  const base = app.getAppPath();
  const commonPrefs = { contextIsolation: true, nodeIntegration: false, preload: preloadPath };

  // Workbench（发起方）
  workbench = new BrowserWindow({ width: 1100, height: 800, title: 'Workbench', webPreferences: commonPrefs });
  bindDevtoolsShortcut(workbench);
  bus.registerWindow('workbench', workbench);
  await workbench.loadFile(path.join(base, 'renderer', 'workbench', 'index.html'));

  // Dialer（外呼下发的响应方）
  dialer = new BrowserWindow({ width: 480, height: 600, title: 'Dialer', webPreferences: commonPrefs });
  bindDevtoolsShortcut(dialer);
  bus.registerWindow('dialer', dialer);
  await dialer.loadFile(path.join(base, 'renderer', 'dialer', 'index.html'));

  // Partner:auto（接单响应 + 主动通知完成）
  partnerAuto = new BrowserWindow({ width: 560, height: 620, title: 'Partner - Auto', webPreferences: commonPrefs });
  bindDevtoolsShortcut(partnerAuto);
  bus.registerWindow('partner:auto', partnerAuto);
  await partnerAuto.loadFile(path.join(base, 'renderer', 'partner', 'auto', 'index.html'));

  // 其他 Partner 作为占位（仅日志展示，便于对比多窗体同步）
  partnerCredit = new BrowserWindow({ width: 480, height: 520, title: 'Partner - Credit (placeholder)', webPreferences: commonPrefs });
  bindDevtoolsShortcut(partnerCredit);
  bus.registerWindow('partner:credit', partnerCredit);
  await partnerCredit.loadFile(path.join(base, 'renderer', 'partner', 'credit', 'index.html'));

  partnerConsumer = new BrowserWindow({ width: 480, height: 520, title: 'Partner - Consumer (placeholder)', webPreferences: commonPrefs });
  bindDevtoolsShortcut(partnerConsumer);
  bus.registerWindow('partner:consumer', partnerConsumer);
  await partnerConsumer.loadFile(path.join(base, 'renderer', 'partner', 'consumer', 'index.html'));

  partnerRisk = new BrowserWindow({ width: 480, height: 520, title: 'Partner - Risk (placeholder)', webPreferences: commonPrefs });
  bindDevtoolsShortcut(partnerRisk);
  bus.registerWindow('partner:risk', partnerRisk);
  await partnerRisk.loadFile(path.join(base, 'renderer', 'partner', 'risk', 'index.html'));

  // 调试：确认 __bus 是否注入（检查 workbench）
  try {
    const hasBus = await workbench.webContents.executeJavaScript('Boolean(window.__bus)');
    console.log('[main] window.__bus exists (workbench)?', hasBus);
  } catch (e) { console.error('[main] executeJavaScript check failed', e); }

  const clear = (name: string) => () => { (global as any)[name] = null; };
  workbench.on('closed', clear('workbench'));
  dialer.on('closed', clear('dialer'));
  partnerAuto.on('closed', clear('partnerAuto'));
  partnerCredit.on('closed', clear('partnerCredit'));
  partnerConsumer.on('closed', clear('partnerConsumer'));
  partnerRisk.on('closed', clear('partnerRisk'));
}

// —— 主进程仅处理“客户锁定、风控校验”（新示例 2 与 5） ——
// 2) 客户锁定：Workbench ⇄ Main（request/response）
bus.on('LOCK_CUSTOMER' as any, (e: any) => {
  console.log('[main][LOCK_CUSTOMER][req]', e?.payload);
  setTimeout(() => {
    const customerId = e?.payload?.customerId;
    const locked = Boolean(customerId);
    if (locked) state.locks.customers.set(customerId, 'workbench');
    bus.emit({ id: v4(), type: e.type, domain: e.domain, source: 'main', payload: { locked, customerId, ts: Date.now() }, ts: Date.now(), replyTo: e.id });
  }, 200);
});

// 5) 风控校验：Workbench ⇄ Main（request/response）
bus.on('RISK_CHECK' as any, (e: any) => {
  console.log('[main][RISK_CHECK][req]', e?.payload);
  setTimeout(() => {
    const amount = Number(e?.payload?.amount) || 0;
    const key = `${e?.payload?.customerId || 'na'}:${amount}`;
    let cached = state.caches.risk.get(key);
    if (!cached) {
      const passed = amount <= 10000;
      const score = Math.max(0, Math.min(100, Math.round(100 - amount / 150)));
      cached = { passed, score, amount, ts: Date.now() };
      state.caches.risk.set(key, cached);
    }
    bus.emit({ id: v4(), type: e.type, domain: e.domain, source: 'main', payload: cached, ts: Date.now(), replyTo: e.id });
  }, 300);
});

app.whenReady().then(createWindows);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindows();
});
