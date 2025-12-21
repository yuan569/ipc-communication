import { BusAck, BusEvent, BusResponse, RequestOptions, RequestMap, ResponseMap } from '../shared/types';

/**
 * 渲染进程事件总线客户端（类型安全）
 * - 通过 preload 暴露的 window.__bus 与主进程通信
 * - 支持 on/once/off/emit，并使用本地 registry 做二次分发，避免重复绑定底层 IPC 监听
 * - 通过 EM 泛型约束不同事件 type 对应的 payload 类型，提供端到端类型安全
 * - 通过 ReqMap/ResMap 为 request/respond 提供更强类型（可选）
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

/**
 * createBusClient
 * @param identity 渲染端身份（将写入 event.source）
 * @template EM  事件映射（on/emit 使用）
 * @template Req 请求映射（request 入参 payload 类型）
 * @template Res 响应映射（request 返回 data 类型）
 */
export function createBusClient<
  EM extends Record<string, any> = Record<string, any>,
  Req extends Record<string, any> = RequestMap,
  Res extends Record<string, any> = ResponseMap
>(identity: string) {
  // 针对每个事件类型维护一组处理器（Set 避免重复注册，且便于删除）
  type Handler<K extends keyof EM & string> = (event: BusEvent<EM[K]>) => void;
  const registry = new Map<string, Set<(e: BusEvent<any>) => void>>();

  // 是否已订阅底层 __bus 事件，仅需订阅一次，后续在本地二次分发
  let subscribed = false;

  function ensureSubscribed() {
    if (subscribed) return;
    subscribed = true;
    window.__bus.on((event: BusEvent<any>) => {
      const set = registry.get(event.type);
      if (!set || set.size === 0) return;
      set.forEach(fn => fn(event));
    });
  }

  // fire-and-forget
  function emit<K extends keyof EM & string>(event: Omit<BusEvent<EM[K]>, 'source' | 'ts'>) {
    const full: BusEvent<EM[K]> = { 
      ...(event as any), 
      source: identity, 
      ts: Date.now() 
    };
    window.__bus.emit(full);
  }

  // ACK（仅分发确认）
  function ack<K extends keyof EM & string>(event: Omit<BusEvent<EM[K]>, 'source' | 'ts'>) {
    const full: BusEvent<EM[K]> = { 
      ...(event as any), 
      source: identity, 
      ts: Date.now() 
    };
    return window.__bus.ack(full) as Promise<BusAck>;
  }

  /**
   * 请求-响应（带强类型）：
   * K 为请求事件类型，入参 payload 类型来自 Req[K]，返回 data 类型来自 Res[K]
   * 如需自定义响应类型，可在调用端用 as 断言或对 Res 泛型参数做重载。
   */
  function request<K extends keyof Req & string>(
    event: Omit<BusEvent<Req[K]>, 'source' | 'ts'>,
    options?: RequestOptions
  ) {
    const full: BusEvent<Req[K]> = { 
      ...(event as any), 
      source: identity, 
      ts: Date.now() 
    };
    return window.__bus.request(full, options) as Promise<BusResponse<Res[K]>>;
  }

  // 对某个请求事件进行响应（通过 replyTo 关联）
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

  // 订阅相关 API
  function on<K extends keyof EM & string>(type: K, handler: Handler<K>) {
    ensureSubscribed();
    const set = registry.get(type) || new Set();
    set.add(handler as (e: BusEvent<any>) => void);
    registry.set(type, set);
    return () => off(type, handler);
  }

  function once<K extends keyof EM & string>(type: K, handler: Handler<K>) {
    const wrapper = (e: BusEvent<EM[K]>) => {
      off(type, wrapper as any);
      handler(e);
    };
    return on(type, wrapper as any);
  }

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
