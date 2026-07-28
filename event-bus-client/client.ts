/**
 * 渲染进程事件总线客户端（类型安全）
 * - 通过 preload 暴露的 window.__bus 与主进程通信
 * - 支持 on/emit/ack/request/respond；本地 registry 按 type 二次分发
 * - 通过 EM / Req / Res 泛型提供端到端类型提示
 */
import { BusAck, BusEvent, BusResponse, RequestOptions, RequestMap, ResponseMap } from '../shared/types';
import { v4 as uuidv4 } from 'uuid';

declare global {
  interface Window {
    __bus: {
      emit: (e: any) => void;
      on: (cb: (e: any) => void) => (() => void) | void;
      ack: (e: any) => Promise<{ id: string; error?: string } | import('../shared/types').BusAck>;
      request: (e: any, options?: RequestOptions) => Promise<BusResponse<any>>;
    }
  }
}

/**
 * createBusClient
 * @param identity 渲染端身份（写入 event.source）
 */
export function createBusClient<
  EM extends Record<string, any> = Record<string, any>,
  Req extends Record<string, any> = RequestMap,
  Res extends Record<string, any> = ResponseMap
>(identity: string) {
  type Handler<K extends keyof EM & string> = (event: BusEvent<EM[K]>) => void;
  const registry = new Map<string, Set<(e: BusEvent<any>) => void>>();

  let subscribed = false;
  let unsubscribeBridge: (() => void) | null = null;

  function ensureSubscribed() {
    if (subscribed) return;
    subscribed = true;
    const maybeOff = window.__bus.on((event: BusEvent<any>) => {
      const set = registry.get(event.type);
      if (!set || set.size === 0) return;
      set.forEach(fn => fn(event));
    });
    if (typeof maybeOff === 'function') {
      unsubscribeBridge = maybeOff;
    }
  }

  function emit<K extends keyof EM & string>(event: Omit<BusEvent<EM[K]>, 'source' | 'ts'>) {
    const full: BusEvent<EM[K]> = {
      ...(event as any),
      source: identity,
      ts: Date.now()
    };
    window.__bus.emit(full);
  }

  function ack<K extends keyof EM & string>(event: Omit<BusEvent<EM[K]>, 'source' | 'ts'>) {
    const full: BusEvent<EM[K]> = {
      ...(event as any),
      source: identity,
      ts: Date.now()
    };
    return window.__bus.ack(full) as Promise<BusAck>;
  }

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

  /** 对请求回包：同 type + replyTo；走 ack 通道以回传授权错误码 */
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
    return window.__bus.ack(reply) as Promise<BusAck>;
  }

  function on<K extends keyof EM & string>(type: K, handler: Handler<K>) {
    ensureSubscribed();
    const set = registry.get(type) || new Set();
    set.add(handler as (e: BusEvent<any>) => void);
    registry.set(type, set);
    return () => {
      const current = registry.get(type);
      if (!current) return;
      current.delete(handler as any);
      if (current.size === 0) registry.delete(type);
      if (registry.size === 0 && unsubscribeBridge) {
        unsubscribeBridge();
        unsubscribeBridge = null;
        subscribed = false;
      }
    };
  }

  return { emit, ack, request, respond, on };
}
