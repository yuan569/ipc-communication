import { BrowserWindow, ipcMain } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { BusEvent, BusResponse, RequestOptions } from '../shared/types';
import type { WindowIdentity } from '../shared/protocol';
import { auditLog } from './audit';
import { normalizeBusError } from './errors';
import { createRequestTracker } from './request-tracker';
import { validateEvent } from './router';
import { assertSenderIdentity } from './sender-auth';

/**
 * 事件总线（主进程）
 * - 负责：
 *   1) 接收 Renderer 通过 IPC 发送的事件并做校验/审计
 *   2) 调用主进程内注册的处理器（handlers）——仅当 target 为 main / *
 *   3) 将事件转发给指定或全部 Renderer 窗口
 * - 类型安全：通过 EM 泛型约束不同事件 type 对应的 payload 类型
 */
export function createEventBus<EM extends Record<string, any> = Record<string, any>>() {
  /**
   * 已注册的窗口列表（按窗口名索引），用于向对应 Renderer 分发事件
   */
  const windows = new Map<string, BrowserWindow>();
  // sender 与窗口 identity 的绑定只保存在主进程，避免信任 renderer 自报身份。
  const senderIdentityByWebContentsId = new Map<number, WindowIdentity>();

  /**
   * 事件处理器注册表：key 为事件 type，value 为该 type 下的处理函数集合
   * 使用 Set 避免重复注册同一函数，同时方便删除
   */
  const handlers = new Map<string, Set<(event: BusEvent<any>) => void>>();

  // 参数与守卫
  const PENDING_CAP = 1000; // 最大并发请求等待数
  const SWEEP_INTERVAL_MS = 60_000; // 定期清扫周期


  /**
   * 注册窗口引用，便于后续按目标名定向分发事件
   * @param name 窗口名（与事件 target 对应）
   * @param win BrowserWindow 实例
   */
  function registerWindow(name: string, win: BrowserWindow) {
    windows.set(name, win);
    senderIdentityByWebContentsId.set(win.webContents.id, name as WindowIdentity);
    // 当窗口关闭时，从列表中移除
    win.on('closed', () => {
      windows.delete(name);
      senderIdentityByWebContentsId.delete(win.webContents.id);
    });
  }

  /**
   * 订阅指定类型事件（可多次订阅）。返回值为取消订阅函数。
   */
  function on<K extends keyof EM & string>(type: K, handler: (event: BusEvent<EM[K]>) => void) {
    const set = handlers.get(type) || new Set();
    set.add(handler as (event: BusEvent<any>) => void);
    handlers.set(type, set);
    return () => {
      const current = handlers.get(type);
      if (!current) return;
      current.delete(handler as any);
      if (current.size === 0) handlers.delete(type);
    };
  }

  const requestTracker = createRequestTracker({ capacity: PENDING_CAP });

  function shouldRunMainHandlers(target: BusEvent['target']): boolean {
    // 主进程 handler 只处理明确发给 main 或广播的事件，避免误处理定向到其它窗体的请求。
    return !target || target === 'main' || target === '*';
  }

  /**
   * 发送事件（主进程内调用）
   * 流程：校验 -> 审计 -> 主进程内部处理 -> 分发给 Renderer
   * 带 replyTo 时：先做授权校验，合法则完成 pending 并返回（不再二次分发）
   */
  function emit<K extends keyof EM & string>(event: BusEvent<EM[K]>) {
    // 若为响应（带 replyTo），优先按授权完成等待中的请求
    if (event.replyTo) {
      const resolved = requestTracker.resolveReply({
        replyTo: event.replyTo,
        type: event.type,
        source: event.source,
        payload: (event as any).payload,
      });
      if (resolved) return;
      // 无对应 pending：继续走校验/分发（例如迟到回包或误带 replyTo）
    }

    // 1) 事件校验（来源/域/字段等规则）
    validateEvent(event);
    // 2) 审计日志（可替换为 ELK/Kafka 等）
    auditLog(event);

    // 3) 主进程内部处理（仅 target 为 main / * / 空时调用）
    if (shouldRunMainHandlers(event.target)) {
      (handlers.get(event.type as string) || new Set()).forEach(fn => {
        try {
          fn(event as any);
        } catch (err) {
          try { console.error('[bus][handler][error]', err); } catch {}
        }
      });
    }

    // 4) 分发给 Renderer（目标窗口或广播）；target === 'main' 时无对应窗体，跳过即可
    dispatch(event as any);
  }

  /**
   * 将事件分发给 Renderer：
   * - target === '*' => 广播到所有窗口
   * - 否则按目标窗口名定向发送
   */
  function dispatch(event: BusEvent<any>) {
    if (event.target === 'main') return;
    if (event.target === '*') {
      windows.forEach(win =>
        win.webContents.send('bus:event', event)
      );
    } else {
      windows.get((event.target as string) || '')
        ?.webContents.send('bus:event', event);
    }
  }

  /**
   * 请求-响应：注册 pending，等待目标用同 type + replyTo 回包；支持超时与容量限制。
   */
  function request<T = any>(event: BusEvent<any>, options?: RequestOptions): Promise<BusResponse<T>> {
    const timeout = (options?.timeout ?? 10000);

    // 补齐必要字段（若调用方未补齐）
    if (!event.id) event.id = uuidv4();

    // 容量守卫
    return new Promise<BusResponse<T>>((resolve) => {
      const expectedResponder = event.target;
      if (!expectedResponder || expectedResponder === '*') {
        resolve({ ok: false, error: 'invalid_target' });
        return;
      }

      // requestTracker 负责超时与 replyTo 生命周期；bus 本身只负责编排。
      const registrationError = requestTracker.register(
        event.id,
        timeout,
        resolve as any,
        { type: event.type, expectedResponder: String(expectedResponder) }
      );
      if (registrationError) {
        resolve(registrationError);
        return;
      }
      try {
        emit(event as any);
      } catch (err) {
        // emit 同步失败时结束 pending，避免调用方空等超时
        requestTracker.failPending(event.id, normalizeBusError(err));
      }
    });
  }



  // IPC 桥接：接收来自 Renderer 的 "bus:emit"，交由主进程 emit 统一处理
  ipcMain.on('bus:emit', (ipcEvent, event: BusEvent<any>) => {
    try {
      // 所有来自 renderer 的入口都先做 sender 校验，再进入统一总线流程。
      assertSenderIdentity(senderIdentityByWebContentsId, ipcEvent.sender.id, event);
      emit(event as any);
    } catch (err) {
      try { console.error('[bus][emit][error]', normalizeBusError(err), err); } catch {}
    }
  });

  // IPC 桥接（ACK）：仅返回分发确认，不等待业务响应；也用于 respond 回传授权错误
  ipcMain.handle('bus:ack', async (ipcEvent, event: BusEvent<any>) => {
    try {
      if (!event.id) event.id = uuidv4();
      assertSenderIdentity(senderIdentityByWebContentsId, ipcEvent.sender.id, event);
      // 走统一 emit 流程（校验/审计/主进程处理/分发），但不等待任何业务响应
      emit(event as any);
      return { id: event.id };
    } catch (err: any) {
      return { id: event?.id, error: normalizeBusError(err) };
    }
  });

  // IPC 桥接（REQUEST）：等待业务响应（通过 replyTo=原 id 的事件触发）
  ipcMain.handle('bus:request', async (ipcEvent, event: BusEvent<any>, options?: RequestOptions) => {
    try {
      assertSenderIdentity(senderIdentityByWebContentsId, ipcEvent.sender.id, event);
      return await request(event, options);
    } catch (err: any) {
      return { ok: false, error: normalizeBusError(err) };
    }
  });

  // 定期清扫 pending，防御异常堆积
  setInterval(() => {
    const cleaned = requestTracker.sweepExpired();
    if (cleaned > 0) {
      // 这里出现日志通常意味着某些请求没有正常回包，便于排查 handler 或 renderer 问题。
      try { console.warn(`[bus][sweep] cleaned ${cleaned}, remaining ${requestTracker.size()}`); } catch {}
    }
  }, SWEEP_INTERVAL_MS).unref?.();

  return { registerWindow, on, emit, request };
}
