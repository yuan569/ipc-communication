import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { createEventBus } from './event-bus-core';
import type { EventMap } from './shared/types';

/**
 * 主进程入口（Electron Main）
 * - 事件总线：统一 ACK / Request-Response、广播/定向分发、replyTo 关联
 * - 简易状态：本文件内仅保留与新示例相关的状态（locks/risk 缓存）
 * - 多窗口：Workbench、Dialer、Partner:auto（另外 partner:credit/consumer/risk 仅占位展示日志）
 */
const bus = createEventBus<EventMap>();

// —— 极简状态（与新场景相关） ——
const state = {
  locks: { customers: new Map<string, string>() },
  caches: { risk: new Map<string, { passed: boolean; score: number; amount: number; ts: number }>() }
};

function v4() { return require('uuid').v4(); }

// —— 窗口引用 ——
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
  const commonPrefs = { contextIsolation: true, nodeIntegration: false, preload: preloadPath } as const;

  // 通用创建函数：创建窗口 → 绑定快捷键 → 注册到总线 → 加载页面
  async function createAndRegisterWindow(spec: {
    id: string;
    title: string;
    size: { width: number; height: number };
    htmlSegments: string[]; // e.g. ['renderer','workbench','index.html']
  }): Promise<BrowserWindow> {
    const win = new BrowserWindow({
      width: spec.size.width,
      height: spec.size.height,
      title: spec.title,
      webPreferences: commonPrefs
    });
    bindDevtoolsShortcut(win);
    bus.registerWindow(spec.id, win);
    await win.loadFile(path.join(base, ...spec.htmlSegments));
    return win;
  }

  // 创建各窗口（配置化）
  workbench = await createAndRegisterWindow({
    id: 'workbench',
    title: 'Workbench',
    size: { width: 1100, height: 800 },
    htmlSegments: ['renderer', 'workbench', 'index.html']
  });

  dialer = await createAndRegisterWindow({
    id: 'dialer',
    title: 'Dialer',
    size: { width: 480, height: 600 },
    htmlSegments: ['renderer', 'dialer', 'index.html']
  });

  partnerAuto = await createAndRegisterWindow({
    id: 'partner:auto',
    title: 'Partner - Auto',
    size: { width: 560, height: 620 },
    htmlSegments: ['renderer', 'partner', 'auto', 'index.html']
  });

  partnerCredit = await createAndRegisterWindow({
    id: 'partner:credit',
    title: 'Partner - Credit (placeholder)',
    size: { width: 480, height: 520 },
    htmlSegments: ['renderer', 'partner', 'credit', 'index.html']
  });

  partnerConsumer = await createAndRegisterWindow({
    id: 'partner:consumer',
    title: 'Partner - Consumer (placeholder)',
    size: { width: 480, height: 520 },
    htmlSegments: ['renderer', 'partner', 'consumer', 'index.html']
  });

  partnerRisk = await createAndRegisterWindow({
    id: 'partner:risk',
    title: 'Partner - Risk (placeholder)',
    size: { width: 480, height: 520 },
    htmlSegments: ['renderer', 'partner', 'risk', 'index.html']
  });

  // 调试：确认 __bus 是否注入（检查 workbench）
  try {
    const hasBus = await workbench.webContents.executeJavaScript('Boolean(window.__bus)');
    console.log('[main] window.__bus exists (workbench)?', hasBus);
  } catch (e) { console.error('[main] executeJavaScript check failed', e); }

  // 关闭引用清理
  workbench.on('closed', () => { workbench = null; });
  dialer.on('closed', () => { dialer = null; });
  partnerAuto.on('closed', () => { partnerAuto = null; });
  partnerCredit.on('closed', () => { partnerCredit = null; });
  partnerConsumer.on('closed', () => { partnerConsumer = null; });
  partnerRisk.on('closed', () => { partnerRisk = null; });
}

// —— 主进程仅处理“客户锁定、风控校验”（新示例 2 与 5） ——
// 2) 客户锁定：Workbench ⇄ Main（request/response）
bus.on('LOCK_CUSTOMER', (e) => {
  console.log('[main][LOCK_CUSTOMER][req]', e?.payload);
  setTimeout(() => {
    const customerId = (e as any)?.payload?.customerId as string;
    const locked = Boolean(customerId);
    if (locked) state.locks.customers.set(customerId, 'workbench');
    bus.emit({ id: v4(), type: e.type, domain: e.domain, source: 'main', payload: { locked, customerId, ts: Date.now() }, ts: Date.now(), replyTo: e.id } as any);
  }, 200);
});

// 5) 风控校验：Workbench ⇄ Main（request/response）
bus.on('RISK_CHECK', (e) => {
  console.log('[main][RISK_CHECK][req]', (e as any)?.payload);
  setTimeout(() => {
    const amount = Number((e as any)?.payload?.amount) || 0;
    const key = `${(e as any)?.payload?.customerId || 'na'}:${amount}`;
    let cached = state.caches.risk.get(key);
    if (!cached) {
      const passed = amount <= 10000;
      const score = Math.max(0, Math.min(100, Math.round(100 - amount / 150)));
      cached = { passed, score, amount, ts: Date.now() };
      state.caches.risk.set(key, cached);
    }
    bus.emit({ id: v4(), type: e.type, domain: e.domain, source: 'main', payload: cached, ts: Date.now(), replyTo: e.id } as any);
  }, 300);
});

app.whenReady().then(createWindows);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindows();
});
