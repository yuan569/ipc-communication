// 协议中心：窗口 identity 与事件路由白名单的唯一事实来源。
// 新增事件时只改 EVENT_POLICY；domain / source / target 校验都从这里读。

export const WINDOW_IDENTITIES = [
  'workbench',
  'dialer',
  'partner:auto',
] as const;

export type WindowIdentity = typeof WINDOW_IDENTITIES[number];

export const DOMAINS = [
  'cti',
  'crm',
  'ticket',
  'risk',
] as const;

export type Domain = typeof DOMAINS[number];

export const TARGETS = [
  ...WINDOW_IDENTITIES,
  '*',
  'main',
] as const;

export type Target = typeof TARGETS[number];

type SourceIdentity = WindowIdentity | 'main';

// 事件级白名单：type → domain / 允许的 source / 允许的 target。
// 请求/响应统一为同 type + replyTo，不单独列响应事件类型。
export const EVENT_POLICY = {
  OUTBOUND_DISPATCH: {
    domain: 'cti',
    sources: ['workbench'],
    targets: ['dialer'],
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
} as const satisfies Record<
  string,
  {
    domain: Domain;
    sources?: readonly SourceIdentity[];
    targets?: readonly Target[];
  }
>;

export type EventType = keyof typeof EVENT_POLICY;
