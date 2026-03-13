import { v4 as uuidv4 } from 'uuid';
import type { BusEvent, EventMap } from '../shared/types';

type MainBus = {
  on: <K extends keyof EventMap & string>(type: K, handler: (event: BusEvent<EventMap[K]>) => void) => (() => void);
  emit: (event: BusEvent<any>) => void;
};

type MainState = {
  locks: {
    customers: Map<string, string>;
  };
  caches: {
    risk: Map<string, { passed: boolean; score: number; amount: number; ts: number }>;
  };
};

export function registerMainHandlers(bus: MainBus, state: MainState) {
  // 示例 handler 保持“收到请求 -> 异步回包”的固定模式，便于后续业务模块照此扩展。
  bus.on('LOCK_CUSTOMER', (event) => {
    console.log('[main][LOCK_CUSTOMER][req]', event.payload);
    setTimeout(() => {
      const customerId = event.payload.customerId;
      const locked = Boolean(customerId);
      if (locked) state.locks.customers.set(customerId, 'workbench');
      // replyTo 指回原请求 id，bus 会把它识别成一次 request 的响应。
      bus.emit({
        id: uuidv4(),
        type: event.type,
        domain: event.domain,
        source: 'main',
        payload: { locked, customerId, ts: Date.now() },
        ts: Date.now(),
        replyTo: event.id,
      });
    }, 200);
  });

  bus.on('RISK_CHECK', (event) => {
    console.log('[main][RISK_CHECK][req]', event.payload);
    setTimeout(() => {
      const amount = Number(event.payload.amount) || 0;
      const key = `${event.payload.customerId || 'na'}:${amount}`;
      let cached = state.caches.risk.get(key);
      if (!cached) {
        // 这里先保留进程内缓存，后续如果接数据库/服务端，可在这一层平滑替换。
        const passed = amount <= 10000;
        const score = Math.max(0, Math.min(100, Math.round(100 - amount / 150)));
        cached = { passed, score, amount, ts: Date.now() };
        state.caches.risk.set(key, cached);
      }
      bus.emit({
        id: uuidv4(),
        type: event.type,
        domain: event.domain,
        source: 'main',
        payload: cached,
        ts: Date.now(),
        replyTo: event.id,
      });
    }, 300);
  });
}
