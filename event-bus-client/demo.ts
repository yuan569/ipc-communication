import { createBusClient } from './client';
import { v4 as uuidv4 } from 'uuid';

// 定义事件-负载映射，获得类型安全
// 可根据业务扩展 payload 结构
export type EventMap = {
  CALL_START: { caller: string; ticketId: string };
  CREDIT_APPROVE: { orderId: string };
};

const bus = createBusClient<EventMap>('credit-system');

// once：仅触发一次
bus.once('CREDIT_APPROVE', (e) => {
  console.log('[once] 信用卡审批完成', e.payload.orderId);
});

// on：订阅；返回 off 函数用于取消订阅
const offCallStart = bus.on('CALL_START', (e) => {
  console.log('收到通话事件', e.payload.caller, e.payload.ticketId);
});

// emit：带有类型安全 payload，source/ts 由 client 自动注入
bus.emit({
  id: uuidv4(),
  type: 'CREDIT_APPROVE',
  domain: 'credit',
  target: 'workbench',
  payload: { orderId: 'O123' }
});

// 示例：不再需要时取消订阅
// offCallStart();
