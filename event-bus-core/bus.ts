import { BrowserWindow, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
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
 * emit 管线：完成回包 → 校验 → 审计 → 主进程 handler → 分发 Renderer
 */
export function createEventBus<EM extends Record<string, any> = Record<string, any>>() {
  const windows = new Map<string, BrowserWindow>();
  const senderIdentityByWebContentsId = new Map<number, WindowIdentity>();
  const handlers = new Map<string, Set<(event: BusEvent<any>) => void>>();

  const PENDING_CAP = 1000;
  const SWEEP_INTERVAL_MS = 60_000;
  const requestTracker = createRequestTracker({ capacity: PENDING_CAP });

  function registerWindow(name: string, win: BrowserWindow) {
    windows.set(name, win);
    senderIdentityByWebContentsId.set(win.webContents.id, name as WindowIdentity);
    win.on('closed', () => {
      windows.delete(name);
      senderIdentityByWebContentsId.delete(win.webContents.id);
    });
  }

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

  function shouldRunMainHandlers(target: BusEvent['target']): boolean {
    return !target || target === 'main' || target === '*';
  }

  /**
   * 阶段 1：若带 replyTo，尝试完成 pending。
   * - true：已合法回包（已审计），emit 应结束
   * - false：不是回包，继续普通投递
   * - throw：授权失败 / 无对应 pending（orphan），不落入普通投递
   */
  function tryCompletePendingReply(event: BusEvent<any>): boolean {
    if (!event.replyTo) return false;

    const resolved = requestTracker.resolveReply({
      replyTo: event.replyTo,
      type: event.type,
      source: event.source,
      payload: event.payload,
    });

    if (resolved) {
      // 决策结果也要进审计（event.replyTo 可区分请求/响应）
      auditLog(event);
      return true;
    }

    // 无 pending：丢弃，避免迟到/误带 replyTo 被当成新事件分发
    throw new Error('orphan_reply');
  }

  function invokeMainHandlers(event: BusEvent<any>) {
    (handlers.get(event.type) || new Set()).forEach(fn => {
      try {
        fn(event);
      } catch (err) {
        try { console.error('[bus][handler][error]', err); } catch {}
      }
    });
  }

  function dispatch(event: BusEvent<any>) {
    if (event.target === 'main') return;
    if (event.target === '*') {
      windows.forEach(win => win.webContents.send('bus:event', event));
      return;
    }
    windows.get(event.target || '')?.webContents.send('bus:event', event);
  }

  /** 普通事件投递：校验 → 审计 → handler → 分发 */
  function deliver(event: BusEvent<any>) {
    validateEvent(event);
    auditLog(event);
    if (shouldRunMainHandlers(event.target)) invokeMainHandlers(event);
    dispatch(event);
  }

  function emit<K extends keyof EM & string>(event: BusEvent<EM[K]>) {
    if (tryCompletePendingReply(event as any)) return;
    deliver(event as any);
  }

  function request<T = any>(event: BusEvent<any>, options?: RequestOptions): Promise<BusResponse<T>> {
    const timeout = options?.timeout ?? 10000;
    if (!event.id) event.id = uuidv4();

    return new Promise<BusResponse<T>>((resolve) => {
      const expectedResponder = event.target;
      if (!expectedResponder || expectedResponder === '*') {
        resolve({ ok: false, error: 'invalid_target' });
        return;
      }

      const registration = requestTracker.register(
        event.id,
        timeout,
        resolve as any,
        { type: event.type, expectedResponder: String(expectedResponder) }
      );
      if (!registration.ok) {
        resolve(registration);
        return;
      }
      try {
        emit(event as any);
      } catch (err) {
        requestTracker.failPending(event.id, normalizeBusError(err));
      }
    });
  }

  /** IPC 入口统一：先校验 sender，再执行业务 */
  function fromRenderer<T>(
    ipcEvent: IpcMainEvent | IpcMainInvokeEvent,
    event: BusEvent<any>,
    run: () => T
  ): T {
    assertSenderIdentity(senderIdentityByWebContentsId, ipcEvent.sender.id, event);
    return run();
  }

  // 允许重复 createEventBus 时覆盖旧 handler，避免监听叠加
  ipcMain.removeAllListeners('bus:emit');
  try { ipcMain.removeHandler('bus:ack'); } catch {}
  try { ipcMain.removeHandler('bus:request'); } catch {}

  ipcMain.on('bus:emit', (ipcEvent, event: BusEvent<any>) => {
    try {
      fromRenderer(ipcEvent, event, () => emit(event as any));
    } catch (err) {
      try { console.error('[bus][emit][error]', normalizeBusError(err), err); } catch {}
    }
  });

  ipcMain.handle('bus:ack', async (ipcEvent, event: BusEvent<any>) => {
    try {
      if (!event.id) event.id = uuidv4();
      fromRenderer(ipcEvent, event, () => emit(event as any));
      return { id: event.id };
    } catch (err: any) {
      return { id: event?.id, error: normalizeBusError(err) };
    }
  });

  ipcMain.handle('bus:request', async (ipcEvent, event: BusEvent<any>, options?: RequestOptions) => {
    try {
      return await fromRenderer(ipcEvent, event, () => request(event, options));
    } catch (err: any) {
      return { ok: false, error: normalizeBusError(err) };
    }
  });

  setInterval(() => {
    const cleaned = requestTracker.sweepExpired();
    if (cleaned > 0) {
      try { console.warn(`[bus][sweep] cleaned ${cleaned}, remaining ${requestTracker.size()}`); } catch {}
    }
  }, SWEEP_INTERVAL_MS).unref?.();

  return { registerWindow, on, emit, request };
}
