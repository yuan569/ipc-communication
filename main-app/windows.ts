import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { getMainWindowSpecs } from './window-registry';

type WindowBus = {
  registerWindow: (name: string, win: BrowserWindow) => void;
};

/**
 * 资源根目录约定（与 package.json scripts 对齐）：
 * - 开发（npm start → build:dev）：项目根，直接读 renderer/ + event-bus-client/preload.js
 * - 打包（build:all → dist-runtime）：安装包内 dist-runtime/
 */
function resolveRuntimeRoot(): string {
  if (app.isPackaged) {
    return path.join(app.getAppPath(), 'dist-runtime');
  }
  // electron . 时 appPath 即 package.json 所在目录
  return app.getAppPath();
}

function bindDevtoolsShortcut(win: BrowserWindow) {
  if (app.isPackaged) return;
  win.webContents.on('before-input-event', (event, input) => {
    if (
      input.type === 'keyDown' &&
      (input.key === 'F12' || (input.control && input.shift && (input.key === 'I' || input.key === 'i')))
    ) {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
}

export async function createMainWindows(bus: WindowBus) {
  const runtimeRoot = resolveRuntimeRoot();
  const preload = path.join(runtimeRoot, 'event-bus-client', 'preload.js');
  const windowSpecs = getMainWindowSpecs();
  const webPreferences = {
    contextIsolation: true,
    nodeIntegration: false,
    preload,
  } as const;

  const windows: BrowserWindow[] = [];

  for (const spec of windowSpecs) {
    const win = new BrowserWindow({
      width: spec.size.width,
      height: spec.size.height,
      title: spec.title,
      webPreferences,
    });
    bindDevtoolsShortcut(win);
    bus.registerWindow(spec.id, win);
    await win.loadFile(path.join(runtimeRoot, ...spec.htmlSegments));
    windows.push(win);
  }

  return windows;
}
