import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { createEventBus } from './event-bus-core';

/**
 * 主进程入口（Electron Main）
 * - 通过 preload 将受控 API 暴露给渲染进程（window.__bus）
 * - 使用 createEventBus 注册主进程事件处理器，并向渲染进程窗口分发事件
 * - 与 renderer/renderer.js 的各个示例一一对应（单向 / ACK / 请求-响应 / 广播 / 定向 / 主动推送）
 */
const bus = createEventBus<Record<string, any>>();
let mainWindow: BrowserWindow | null = null;

async function createWindow() {
  // 解析并校验 preload 路径（开发/打包均可用）
  let preloadPath = path.join(app.getAppPath(), 'event-bus-client', 'preload.js');
  if (!fs.existsSync(preloadPath)) {
    const alt = path.join(__dirname, '..', 'event-bus-client', 'preload.js');
    console.warn('[main] preload not found at appPath, try __dirname path:', alt);
    if (fs.existsSync(alt)) preloadPath = alt;
  }
  console.log('[main] using preloadPath:', preloadPath, 'exists?', fs.existsSync(preloadPath));

  // 创建主窗口并开启安全隔离
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 1080,
    webPreferences: {
      contextIsolation: true,  // 与 preload 配合，防止直接访问 Node API
      nodeIntegration: false,  // 禁用 require/import（提高安全性）
      preload: preloadPath
    }
  });

  // 将窗口注册到事件总线，便于按 target 名称定向分发（renderer 示例使用 target: 'workbench'）
  bus.registerWindow('workbench', mainWindow);

  /**
   * 主进程事件处理器（与 renderer 示例对应）
   * - LOG：对应“单向通信（One-way）→ Emit one-way LOG”。仅在主进程做日志记录。
   * - PING：对应“ACK / Request-Response”示例。这里仅做日志说明，具体 ACK/R/R 流程由总线与渲染端自动处理。
   * - BROADCAST：对应“广播 BROADCAST”。主进程打印广播内容（也会分发给所有窗口）。
   * - CALL_START：对应“定向发送 CALL_START → workbench”。主进程接收并打印。
   * - REQ_MAIN_PUSH：对应“请求主进程推送 SERVER_PUSH”。主进程收到后主动向目标窗口发送 SERVER_PUSH。
   */
  // 1) LOG：渲染端发来的单向日志
  bus.on('LOG' as any, (e: any) => {
    try { console.log('[main][LOG]', e?.payload); } catch {}
  });

  // 2) PING：记录收到的 PING 请求（ACK/RR 两种路径最终都会进入 emit 分发）
  bus.on('PING' as any, (e: any) => {
    try { console.log('[main][PING]', e?.payload); } catch {}
  });

  // 3) BROADCAST：广播事件也会到主进程，此处仅打印
  bus.on('BROADCAST' as any, (e: any) => {
    try { console.log('[main][BROADCAST]', e?.payload); } catch {}
  });

  // 4) CALL_START：定向事件（target='workbench'）的示例，主进程记录
  bus.on('CALL_START' as any, (e: any) => {
    try { console.log('[main][CALL_START]', e?.payload); } catch {}
  });

  // 5) REQ_MAIN_PUSH：主进程根据请求主动向渲染进程推送 SERVER_PUSH
  bus.on('REQ_MAIN_PUSH' as any, (e: any) => {
    try {
      const target = e?.payload?.target || 'workbench';
      const reply = {
        id: require('uuid').v4(),
        type: 'SERVER_PUSH',
        domain: e?.domain || 'demo',
        source: 'main',
        target,
        payload: { from: 'main', echo: e?.payload, ts: Date.now() },
        ts: Date.now()
      };
      bus.emit(reply as any);
      console.log('[main] pushed SERVER_PUSH to', target);
    } catch (err) {
      try { console.error('[main][REQ_MAIN_PUSH][error]', err); } catch {}
    }
  });

  // 绑定 F12（或 Ctrl+Shift+I）快捷键打开/关闭 DevTools
  // 注意：需要在窗口创建后尽早绑定
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (
      input.type === 'keyDown' && (
        input.key === 'F12' ||
        (input.control && input.shift && (input.key === 'I' || input.key === 'i'))
      )
    ) {
      mainWindow?.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // 加载独立 HTML（renderer/index.html），页面内再加载 UMD SDK 与 renderer.js
  const indexHtml = path.join(app.getAppPath(), 'renderer', 'index.html');
  console.log('[main] indexHtml:', indexHtml);
  await mainWindow.loadFile(indexHtml);

  // 调试：在主进程侧检测 preload 是否成功注入 __bus（供问题定位）
  try {
    const hasBus = await mainWindow.webContents.executeJavaScript('Boolean(window.__bus)');
    console.log('[main] window.__bus exists?', hasBus);
  } catch (e) {
    console.error('[main] executeJavaScript check failed', e);
  }

  // 可选：启动时自动打开 DevTools
  // mainWindow.webContents.openDevTools({ mode: 'detach' });

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
