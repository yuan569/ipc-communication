import { app, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { getMainWindowSpecs, type WindowSpec } from './window-registry';

type WindowBus = {
  registerWindow: (name: string, win: BrowserWindow) => void;
};

// 保留开发期常用快捷键，避免每个窗体重复手动打开 DevTools。
function bindDevtoolsShortcut(win: BrowserWindow) {
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && (input.key === 'I' || input.key === 'i')))) {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
}

function resolveRuntimeRoot() {
  // 优先使用统一构建产物；这样运行时尽量脱离源码目录。
  const candidates = [
    path.join(app.getAppPath(), 'dist-runtime'),
    path.join(__dirname, '..', 'dist-runtime'),
    app.getAppPath(),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'renderer'))) {
      return candidate;
    }
  }

  return app.getAppPath();
}

function resolvePreloadPath(runtimeRoot: string) {
  // preload 会随构建产物复制一份，但开发态仍保留旧路径回退，降低切换风险。
  const candidates = [
    path.join(runtimeRoot, 'event-bus-client', 'preload.js'),
    path.join(app.getAppPath(), 'event-bus-client', 'preload.js'),
    path.join(__dirname, '..', 'event-bus-client', 'preload.js'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  const fallback = candidates[candidates.length - 1];
  console.warn('[main] preload not found in preferred runtime paths, fallback to:', fallback);
  return fallback;
}

export async function createMainWindows(bus: WindowBus) {
  const runtimeRoot = resolveRuntimeRoot();
  const windowSpecs = getMainWindowSpecs();
  const commonPrefs = {
    contextIsolation: true,
    nodeIntegration: false,
    preload: resolvePreloadPath(runtimeRoot),
  } as const;

  async function createAndRegisterWindow(spec: WindowSpec) {
    const win = new BrowserWindow({
      width: spec.size.width,
      height: spec.size.height,
      title: spec.title,
      webPreferences: commonPrefs,
    });
    bindDevtoolsShortcut(win);
    bus.registerWindow(spec.id, win);
    // HTML 统一从 runtimeRoot 加载，保证页面资源和 preload 的来源一致。
    await win.loadFile(path.join(runtimeRoot, ...spec.htmlSegments));
    return win;
  }

  const windows: BrowserWindow[] = [];
  let workbench: BrowserWindow | null = null;

  for (const spec of windowSpecs) {
    const win = await createAndRegisterWindow(spec);
    windows.push(win);
    if (spec.id === 'workbench') workbench = win;
  }

  if (workbench) {
    try {
      // 启动时做一次桥接探测，能更快暴露 preload 路径配置问题。
      const hasBus = await workbench.webContents.executeJavaScript('Boolean(window.__bus)');
      console.log('[main] window.__bus exists (workbench)?', hasBus);
    } catch (e) {
      console.error('[main] executeJavaScript check failed', e);
    }
  }

  return windows;
}
