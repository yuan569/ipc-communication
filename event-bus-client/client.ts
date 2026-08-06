/**
 * 渲染进程事件总线客户端
 * 对外 API：emit（单向）/ request（请求响应）/ respond（回包）/ on（订阅）
 * preload 的 ack 通道仅作 respond 内部实现，不对外暴露
 */
import { BusAck, BusEvent, BusResponse, RequestOptions, RequestMap, ResponseMap } from '../shared/types';
import { v4 as uuidv4 } from 'uuid';

declare global {
  interface Window {
    __bus: {
      emit: (e: any) => void;
      on: (cb: (e: any) => void) => (() => void) | void;
      /** 内部通道：分发确认 / respond 回传错误码 */
      ack: (e: any) => Promise<BusAck>;
      request: (e: any, options?: RequestOptions) => Promise<BusResponse<any>>;
    }
  }
}

export function createBusClient<
  EM extends Record<string, any> = Record<string, any>,
  Req extends Record<string, any> = RequestMap,
  Res extends Record<string, any> = ResponseMap
>(identity: string) {
  type Handler<K extends keyof EM & string> = (event: BusEvent<EM[K]>) => void;
  const registry = new Map<string, Set<(e: BusEvent<any>) => void>>();

  let subscribed = false;
  let unsubscribeBridge: (() => void) | null = null;

  function enrich<T>(event: Omit<BusEvent<T>, 'source' | 'ts'>): BusEvent<T> {
    return {
      ...(event as any),
      source: identity,
      ts: Date.now(),
    };
  }

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

  /** 单向发送（fire-and-forget） */
  function emit<K extends keyof EM & string>(event: Omit<BusEvent<EM[K]>, 'source' | 'ts'>) {
    window.__bus.emit(enrich(event as any));
  }

  /** 请求-响应：等待目标同 type + replyTo 回包 */
  function request<K extends keyof Req & string>(
    event: Omit<BusEvent<Req[K]>, 'source' | 'ts'>,
    options?: RequestOptions
  ) {
    return window.__bus.request(enrich(event as any), options) as Promise<BusResponse<Res[K]>>;
  }

  /** 对请求回包：同 type + replyTo；走 invoke 通道以拿到授权/校验错误码 */
  function respond<K extends keyof EM & string, R = any>(to: BusEvent<EM[K]>, payload: R) {
    const reply = enrich({
      id: uuidv4(),
      type: to.type,
      domain: to.domain,
      payload,
      replyTo: to.id,
    });
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

  return { emit, request, respond, on };
}
