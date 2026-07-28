// 协议中心：窗口 identity、domain、target 和事件路由规则都从这里导出，
// 其他模块只消费这里的定义，避免协议事实来源分散。
export const WINDOW_IDENTITIES = [
  'workbench',
  'dialer',
  'partner:auto',
  'partner:credit',
  'partner:consumer',
  'partner:risk',
] as const;

export type WindowIdentity = typeof WINDOW_IDENTITIES[number];

export const DOMAINS = [
  'cti',
  'crm',
  'ticket',
  'risk',
  'context',
  'demo',
] as const;

export type Domain = typeof DOMAINS[number];

export const TARGETS = [
  ...WINDOW_IDENTITIES,
  '*',
  'main',
] as const;

export type Target = typeof TARGETS[number];

// 每个 domain 允许出现哪些事件类型；router 会直接使用这份映射做校验。
// 请求/响应统一为同 type + replyTo，不单独列响应事件类型。
export const DOMAIN_TYPES = {
  cti: ['OUTBOUND_DISPATCH', 'CALL_START'],
  crm: ['LOCK_CUSTOMER'],
  ticket: ['TICKET_ACCEPT', 'TICKET_DONE'],
  risk: ['RISK_CHECK'],
  context: ['CONTEXT_UPDATED'],
  demo: ['LOG'],
} as const satisfies Record<Domain, readonly string[]>;

type SourceIdentity = WindowIdentity | 'main';

// 事件级白名单：限制某个事件只能由哪些 source 发出、只能流向哪些 target。
export const EVENT_POLICY = {
  OUTBOUND_DISPATCH: {
    domain: 'cti',
    sources: ['workbench'],
    targets: ['dialer'],
  },
  CALL_START: {
    domain: 'cti',
    sources: ['workbench'],
    targets: ['*', 'dialer'],
  },
  LOCK_CUSTOMER: {
    domain: 'crm',
    sources: ['workbench'],
    targets: ['main'],
  },
  TICKET_ACCEPT: {
    domain: 'ticket',
    sources: ['workbench'],
    targets: ['partner:auto'],
  },
  TICKET_DONE: {
    domain: 'ticket',
    sources: ['partner:auto'],
    targets: ['workbench'],
  },
  RISK_CHECK: {
    domain: 'risk',
    sources: ['workbench'],
    targets: ['main'],
  },
  CONTEXT_UPDATED: {
    domain: 'context',
    sources: ['main'],
    targets: TARGETS,
  },
  LOG: {
    domain: 'demo',
    sources: [...WINDOW_IDENTITIES, 'main'],
    targets: TARGETS,
  },
} as const satisfies Record<
  string,
  {
    domain: Domain;
    sources?: readonly SourceIdentity[];
    targets?: readonly Target[];
  }
>;

export type EventType = keyof typeof EVENT_POLICY;

// bus 层消费的最终策略对象，保留 domain/type 两个维度便于做快速校验。
export const BUS_POLICY = {
  domain: {
    cti: { types: DOMAIN_TYPES.cti },
    crm: { types: DOMAIN_TYPES.crm },
    ticket: { types: DOMAIN_TYPES.ticket },
    risk: { types: DOMAIN_TYPES.risk },
    context: { types: DOMAIN_TYPES.context },
    demo: { types: DOMAIN_TYPES.demo },
  },
  type: EVENT_POLICY,
} as const;
