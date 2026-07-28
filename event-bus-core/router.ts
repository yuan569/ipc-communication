/**
 * 事件路由校验
 * 按 shared/protocol.ts 的 EVENT_POLICY 校验 domain、type、source、target。
 */
import type { BusEvent } from '../shared/types';
import { EVENT_POLICY, type Target } from '../shared/protocol';

export function validateEvent(event: BusEvent) {
  if (!event || !event.id || !event.type || !event.domain || !event.source || !event.ts) {
    throw new Error('非法事件格式');
  }

  const rule = (EVENT_POLICY as Record<string, {
    domain: string;
    sources?: readonly string[];
    targets?: readonly Target[];
  }>)[event.type];

  if (!rule) {
    throw new Error(`未知事件类型: ${event.type}`);
  }

  if (rule.domain !== event.domain) {
    throw new Error(`事件 ${event.type} 不属于 domain ${event.domain}`);
  }

  if (rule.sources && !rule.sources.includes(event.source)) {
    throw new Error(`非法来源: ${event.source} 无权发送 ${event.type}`);
  }

  if (rule.targets && event.target && !rule.targets.includes(event.target as Target)) {
    throw new Error(`非法目标: ${String(event.target)} 不能接收 ${event.type}`);
  }
}
