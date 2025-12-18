import { BrowserWindow, ipcMain } from 'electron';
import { BusEvent } from '../shared/types.ts';
import { auditLog } from './audit';
import { validateEvent } from './router';

/**
 * 事件总线（主进程）
 * - 负责：
 *   1) 接收 Renderer 通过 IPC 发送的事件并做校验/审计
 *   2) 调用主进程内注册的处理器（handlers）
 *   3) 将事件转发给指定或全部 Renderer 窗口
 * - 类型安全：通过 EM 泛型约束不同事件 type 对应的 payload 类型
 *
 * 使用示例：
 *   type EM = { CALL_START: { caller: string }, CREDIT_APPROVE: { orderId: string } };
 *   const bus = createEventBus<EM>();
 *   const off = bus.on('CALL_START', (e) => console.log(e.payload.caller));
 *   bus.emit({ id, type: 'CALL_START', domain: 'call', source: 'main', target: '*', payload: { caller: '10086' }, ts: Date.now() });
 */
export function createEventBus<EM extends Record<string, any> = Record<string, any>>() {
  /**
   * 已注册的窗口列表（按窗口名索引），用于向对应 Renderer 分发事件
   */
  const windows = new Map<string, BrowserWindow>();

  /**
   * 事件处理器注册表：key 为事件 type，value 为该 type 下的处理函数集合
   * 使用 Set 避免重复注册同一函数，同时方便删除
   */
  const handlers = new Map<string, Set<(event: BusEvent<any>) => void>>();

  /**
   * 注册窗口引用，便于后续按目标名定向分发事件
   * @param name 窗口名（与事件 target 对应）
   * @param win BrowserWindow 实例
   */
  function registerWindow(name: string, win: BrowserWindow) {
    windows.set(name, win);
    // 当窗口关闭时，从列表中移除
    win.on('closed', () => windows.delete(name));
  }

  /**
   * 订阅指定类型事件（可多次订阅）。返回值为取消订阅函数。
   * @param type 事件类型（受 EM 泛型约束）
   * @param handler 事件处理器，参数为完整 BusEvent
   */
  function on<K extends keyof EM & string>(type: K, handler: (event: BusEvent<EM[K]>) => void) {
    const set = handlers.get(type) || new Set();
    set.add(handler as (event: BusEvent<any>) => void);
    handlers.set(type, set);
    // 返回取消订阅函数，便于调用方释放资源/避免内存泄漏
    return () => off(type, handler as any);
  }

  /**
   * 订阅一次性事件：触发一次后自动取消订阅
   */
  function once<K extends keyof EM & string>(type: K, handler: (event: BusEvent<EM[K]>) => void) {
    const wrapper = (event: BusEvent<EM[K]>) => {
      off(type, wrapper as any);
      handler(event);
    };
    return on(type, wrapper as any);
  }

  /**
   * 取消订阅
   * @param type 要取消的事件类型
   * @param handler 可选；若不传则清空该类型下的所有处理器
   */
  function off<K extends keyof EM & string>(type: K, handler?: (event: BusEvent<EM[K]>) => void) {
    const set = handlers.get(type);
    if (!set) return;
    if (handler) {
      set.delete(handler as any);
      if (set.size === 0) handlers.delete(type);
    } else {
      handlers.delete(type);
    }
  }

  /**
   * 发送事件（主进程内调用）
   * 流程：校验 -> 审计 -> 主进程内部处理 -> 分发给 Renderer
   */
  function emit<K extends keyof EM & string>(event: BusEvent<EM[K]>) {
    // 1) 事件校验（来源/域/字段等规则）
    validateEvent(event);
    // 2) 审计日志（可替换为 ELK/Kafka 等）
    auditLog(event);

    // 3) 主进程内部处理（仅调用注册在主进程的 handlers）
    (handlers.get(event.type as string) || new Set()).forEach(fn => fn(event as any));

    // 4) 分发给 Renderer（目标窗口或广播）
    dispatch(event as any);
  }

  /**
   * 将事件分发给 Renderer：
   * - target === '*' => 广播到所有窗口
   * - 否则按目标窗口名定向发送
   */
  function dispatch(event: BusEvent<any>) {
    if (event.target === '*') {
      windows.forEach(win =>
        win.webContents.send('bus:event', event)
      );
    } else {
      windows.get((event.target as string) || '')
        ?.webContents.send('bus:event', event);
    }
  }

  // IPC 桥接：接收来自 Renderer 的 "bus:emit"，交由主进程 emit 统一处理
  ipcMain.on('bus:emit', (_, event: BusEvent<any>) => emit(event as any));

  return { registerWindow, on, once, off, emit };
}
