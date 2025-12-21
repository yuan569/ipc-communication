import type { BusEvent, Domain, Target } from '../shared/types'

// 事件类型 → 约定域
const domainByType: Record<string, Domain> = {
  OUTBOUND_DISPATCH: 'cti',
  CALL_START: 'cti',
  LOCK_CUSTOMER: 'crm',
  TICKET_ACCEPT: 'ticket',
  TICKET_DONE: 'ticket',
  RISK_CHECK: 'risk',
  RISK_RESULT: 'risk',
  CONTEXT_UPDATED: 'context',
  LOG: 'demo',
};

// 可选：来源白名单（仅对关键请求进行限定）
const allowedSources: Record<string, string[] | undefined> = {
  OUTBOUND_DISPATCH: ['workbench'],
  LOCK_CUSTOMER: ['workbench'],
  TICKET_ACCEPT: ['workbench'],
  RISK_CHECK: ['workbench'],
  TICKET_DONE: ['partner:auto', 'main'],
};

// 可选：目标白名单（仅对需要固定目标的事件进行限定）
const allowedTargets: Record<string, Target[] | undefined> = {
  OUTBOUND_DISPATCH: ['dialer'],
  LOCK_CUSTOMER: ['main'],
  TICKET_ACCEPT: ['partner:auto'],
  RISK_CHECK: ['main'],
  TICKET_DONE: ['workbench'],
};

export function validateEvent(event: BusEvent) {
  // 基础字段校验
  if (!event || !event.id || !event.type || !event.domain || !event.source || !event.ts) {
    throw new Error('非法事件格式');
  }

  // 域校验：type 对应的 domain 必须一致
  const expectedDomain = domainByType[event.type];
  if (expectedDomain && event.domain !== expectedDomain) {
    throw new Error(`事件域不匹配: ${event.type} 应属于 ${expectedDomain}，实际 ${event.domain}`);
  }

  // 来源白名单（仅对有约束的事件检查）
  const src = allowedSources[event.type];
  if (src && !src.includes(event.source)) {
    throw new Error(`非法来源: ${event.source} 不允许发送 ${event.type}`);
  }

  // 目标白名单（仅当事件声明了 target 且存在约束时检查）
  const tgts = allowedTargets[event.type];
  if (tgts && event.target && !tgts.includes(event.target)) {
    throw new Error(`非法目标: ${String(event.target)} 不允许接收 ${event.type}`);
  }
}
