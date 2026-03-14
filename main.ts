/**
 * 主进程入口（Electron Main）
 * 职责：初始化 bus、注册 handler、绑定 app 生命周期；窗口创建和业务逻辑已拆分到 main-app。
 */
import { app, BrowserWindow } from 'electron';
import { createEventBus } from './event-bus-core';
import { registerMainHandlers } from './main-app/handlers';
import { createMainWindows } from './main-app/windows';
import type { EventMap } from './shared/types';

const bus = createEventBus<EventMap>();

// —— 极简状态（与新场景相关） ——
const state = {
  locks: { customers: new Map<string, string>() },
  caches: { risk: new Map<string, { passed: boolean; score: number; amount: number; ts: number }>() }
};

registerMainHandlers(bus, state);

app.whenReady().then(() => createMainWindows(bus));

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createMainWindows(bus);
});
