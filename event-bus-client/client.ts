import { BusAck, BusEvent, BusResponse, RequestOptions } from '../shared/types';

/**
 * 渲染进程事件总线客户端（类型安全）
 * - 通过 preload 暴露的 window.__bus 与主进程通信
 * - 支持 on/once/off/emit，并使用本地 registry 做二次分发，避免重复绑定底层 IPC 监听
 * - 通过 EM 泛型约束不同事件 type 对应的 payload 类型，提供端到端类型安全
 *
 * 使用示例：
 *   type EM = { CALL_START: { caller: string; ticketId: string } };
 *   const bus = createBusClient<EM>('credit-system');
 *   const off = bus.on('CALL_START', (e) => console.log(e.payload.caller));
 *   bus.emit({ id, type: 'CALL_START', domain: 'call', target: '*', payload: { caller: '10086', ticketId: 'T1' } });
 */
import { v4 as uuidv4 } from 'uuid';

declare global {
  interface Window {
    __bus: {
      emit: (e: any) => void;
      on: (cb: (e: any) => void) => void;
      ack: (e: any) => Promise<{ id: string; error?: string } | import('../shared/types').BusAck>;
      request: (e: any, options?: RequestOptions) => Promise<BusResponse<any>>;
    }
  }
}

export function createBusClient<EM extends Record<string, any> = Record<string, any>>(identity: string) {
  // 针对每个事件类型维护一组处理器（Set 避免重复注册，且便于删除）
  type Handler<K extends keyof EM & string> = (event: BusEvent<EM[K]>) => void;
  const registry = new Map<string, Set<(e: BusEvent<any>) => void>>();

  // 是否已订阅底层 __bus 事件，仅需订阅一次，后续在本地二次分发
  let subscribed = false;

  /**
   * 确保仅绑定一次底层 __bus.on 监听
   * - 将主进程转发来的事件，按 event.type 分发给本地注册的处理器集合
   */
  function ensureSubscribed() {
    if (subscribed) return;
    subscribed = true;
    // 只订阅一次底层总线，内部做二次分发
    window.__bus.on((event: BusEvent<any>) => {
      const set = registry.get(event.type);
      if (!set || set.size === 0) return;
      set.forEach(fn => fn(event));
    });
  }

  /**
   * 发送事件到主进程（fire-and-forget）
   * - 会自动补齐 source=identity 与 ts=Date.now()
   */
  function emit<K extends keyof EM & string>(event: Omit<BusEvent<EM[K]>, 'source' | 'ts'>) {
    const full: BusEvent<EM[K]> = {
      ...(event as any),
      source: identity,
      ts: Date.now()
    };
    window.__bus.emit(full);
  }

  /**
   * ACK：仅请求分发确认，不等待业务响应
   */
  function ack<K extends keyof EM & string>(event: Omit<BusEvent<EM[K]>, 'source' | 'ts'>) {
    const full: BusEvent<EM[K]> = {
      ...(event as any),
      source: identity,
      ts: Date.now()
    };
    return window.__bus.ack(full) as Promise<BusAck>;
  }

  /**
   * request：请求-响应（等待 replyTo，支持超时）
   * - 发出请求事件，等待某个渲染端 emit 带 replyTo=原 id 的响应
   * - 超时返回 { ok: false, error: 'timeout' }
   */
  function request<K extends keyof EM & string, R = any>(event: Omit<BusEvent<EM[K]>, 'source' | 'ts'>, options?: RequestOptions) {
    const full: BusEvent<EM[K]> = {
      ...(event as any),
      source: identity,
      ts: Date.now()
    };
    return window.__bus.request(full, options) as Promise<BusResponse<R>>;
  }

  /**
   * respond：对某个请求事件进行响应（通过 replyTo 关联）
   */
  function respond<K extends keyof EM & string, R = any>(to: BusEvent<EM[K]>, payload: R) {
    const reply: BusEvent<R> = {
      id: uuidv4(),
      type: to.type,
      domain: to.domain,
      source: identity,
      payload,
      ts: Date.now(),
      replyTo: to.id
    };
    window.__bus.emit(reply);
  }

  /**
   * 订阅指定类型的事件
   * - 返回取消订阅函数，便于主动释放，避免内存泄漏
   */
  function on<K extends keyof EM & string>(type: K, handler: Handler<K>) {
    ensureSubscribed();
    const set = registry.get(type) || new Set();
    set.add(handler as (e: BusEvent<any>) => void);
    registry.set(type, set);
    // 返回取消订阅函数
    return () => off(type, handler);
  }

  /**
   * 一次性订阅：触发一次后自动取消订阅
   */
  function once<K extends keyof EM & string>(type: K, handler: Handler<K>) {
    const wrapper = (e: BusEvent<EM[K]>) => {
      off(type, wrapper as any);
      handler(e);
    };
    return on(type, wrapper as any);
  }

  /**
   * 取消订阅
   * - 若传入 handler，则仅移除此处理器
   * - 若未传 handler，则清空该 type 下所有处理器
   */
  function off<K extends keyof EM & string>(type: K, handler?: Handler<K>) {
    const set = registry.get(type);
    if (!set) return;
    if (handler) {
      set.delete(handler as any);
      if (set.size === 0) registry.delete(type);
    } else {
      registry.delete(type);
    }
  }

  return { emit, ack, request, respond, on, once, off };
}
