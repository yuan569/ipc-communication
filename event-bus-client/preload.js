// 预加载脚本（Preload）：运行在独立上下文，作为 Renderer 与主进程之间的安全桥梁
// 安全要点：
// 1) 只暴露必要的最小 API 到 window（__bus），不要把 ipcRenderer 整个暴露给页面脚本；
// 2) 建议在 BrowserWindow 中开启 contextIsolation: true、enableRemoteModule: false；
// 3) 通过 contextBridge.exposeInMainWorld 控制导出接口的形状与参数；

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('__bus', {
  // 发送事件到主进程：主进程会统一进行校验/审计/分发
  emit: (e) => ipcRenderer.send('bus:emit', e),

  // 订阅来自主进程的事件推送：主进程通过 'bus:event' 渠道广播或定向发送
  // 这里不做类型过滤，类型过滤交由渲染端 client（本地二次分发）处理
  on: (cb) => ipcRenderer.on('bus:event', (_, e) => cb(e))
});
