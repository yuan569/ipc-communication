// 预加载脚本（Preload）：运行在独立上下文，作为 Renderer 与主进程之间的安全桥梁
// 安全要点：
// 1) 只暴露必要的最小 API 到 window（__bus），不要把 ipcRenderer 整个暴露给页面脚本；
// 2) 建议在 BrowserWindow 中开启 contextIsolation: true、enableRemoteModule: false；
// 3) 通过 contextBridge.exposeInMainWorld 控制导出接口的形状与参数；

const { contextBridge, ipcRenderer } = require('electron');

try {
  console.log('[preload] starting, contextIsolation=%s, nodeIntegration=%s', true, false);
  contextBridge.exposeInMainWorld('__bus', {
    // 单向发送（对应客户端 emit）
    emit: (e) => ipcRenderer.send('bus:emit', e),

    // 可回传结果的投递（对应客户端 respond；不对外暴露为业务 API）
    ack: (e) => ipcRenderer.invoke('bus:ack', e),

    // 请求-响应（对应客户端 request）
    request: (e, options) => ipcRenderer.invoke('bus:request', e, options),

    // 订阅来自主进程的事件推送：主进程通过 'bus:event' 渠道广播或定向发送
    // 返回取消订阅函数，避免重复绑定导致监听泄漏
    on: (cb) => {
      const listener = (_event, e) => cb(e);
      ipcRenderer.on('bus:event', listener);
      return () => {
        ipcRenderer.removeListener('bus:event', listener);
      };
    }
  });
  console.log('[preload] __bus exposed');
} catch (err) {
  console.error('[preload] failed to expose __bus', err);
}
