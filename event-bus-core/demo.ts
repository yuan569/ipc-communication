/**
 * 主进程 Event Bus 使用示例（Demo）
 * - 展示：类型安全事件映射、on/once/off、emit、registerWindow
 * - 提示：示例中涉及 BrowserWindow 的部分，需在实际应用中替换为真实窗口实例
 */

import { createEventBus } from './index.ts'
import type { BrowserWindow } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import type { BusEvent } from '../shared/types.ts'

// 1) 定义事件-负载映射，获得类型安全
export type EventMap = {
  CALL_START: { caller: string; ticketId: string };
  CREDIT_APPROVE: { orderId: string };
};

// 2) 创建主进程事件总线（带泛型）
const bus = createEventBus<EventMap>();

// 3) （可选）注册窗口，便于定向分发到 Renderer
//    示例：在主进程创建 BrowserWindow 后执行如下代码
export function attachWindows(workbenchWindow: BrowserWindow, otherWindow?: BrowserWindow) {
  bus.registerWindow('workbench', workbenchWindow);
  if (otherWindow) bus.registerWindow('other', otherWindow);
}

// 4) 订阅事件（返回 off 用于取消订阅）
const offCallStart = bus.on('CALL_START', (e) => {
  // e: BusEvent<{ caller: string; ticketId: string }>
  console.log('[Main] CALL_START', e.payload.caller, e.payload.ticketId);
});

// 一次性订阅
bus.once('CREDIT_APPROVE', (e) => {
  // e: BusEvent<{ orderId: string }>
  console.log('[Main][once] CREDIT_APPROVE', e.payload.orderId);
});

// 5) 在主进程内部发事件（通常由 Renderer 通过 IPC 发起，这里做演示）
export function demoEmitToRenderer(target: string | '*') {
  const event: BusEvent<EventMap['CREDIT_APPROVE']> = {
    id: uuidv4(),
    type: 'CREDIT_APPROVE',
    domain: 'credit',
    source: 'main',         // 主进程发事件需自行填写 source/ts
    target,                 // '*' 广播 或 指定 registerWindow 的名称
    payload: { orderId: 'O123' },
    ts: Date.now()
  };
  bus.emit(event);
}

// 6) 取消订阅示例（使用时机：不再需要监听或模块卸载）
export function cleanup() {
  offCallStart();         // 取消 CALL_START 订阅
  // 或者：bus.off('CALL_START'); // 清空某类型所有处理器
}

// 备注：
// - Renderer 侧使用 createBusClient<EventMap>('identity') 即可与本总线配合；
// - Renderer 发出的事件由 preload 暴露的 __bus.emit 走 IPC 到主进程，再由本总线校验/审计/分发；

