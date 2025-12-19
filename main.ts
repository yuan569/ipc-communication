import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { createEventBus } from './event-bus-core';

// Minimal runnable Electron main entry with window registration
const bus = createEventBus<Record<string, any>>();
let mainWindow: BrowserWindow | null = null;

async function createWindow() {
  let preloadPath = path.join(app.getAppPath(), 'event-bus-client', 'preload.js');
  if (!fs.existsSync(preloadPath)) {
    const alt = path.join(__dirname, '..', 'event-bus-client', 'preload.js');
    console.warn('[main] preload not found at appPath, try __dirname path:', alt);
    if (fs.existsSync(alt)) preloadPath = alt;
  }
  console.log('[main] using preloadPath:', preloadPath, 'exists?', fs.existsSync(preloadPath));

  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath
    }
  });

  // Register window for targeted dispatch from the event bus
  bus.registerWindow('workbench', mainWindow);

  // Load an external HTML file instead of an inline data URL
  // Use app.getAppPath() so it works in dev and after packaging
  const indexHtml = path.join(app.getAppPath(), 'renderer', 'index.html');
  console.log('[main] indexHtml:', indexHtml);
  await mainWindow.loadFile(indexHtml);

  // Debug: verify __bus existence from main
  try {
    const hasBus = await mainWindow.webContents.executeJavaScript('Boolean(window.__bus)');
    console.log('[main] window.__bus exists?', hasBus);
  } catch (e) {
    console.error('[main] executeJavaScript check failed', e);
  }

  // Optionally open devtools for debugging
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
