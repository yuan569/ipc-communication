/**
 * 共享类型与事件契约（主进程与渲染端共用）
 * - BusEvent / EventMap / RequestMap / ResponseMap：供主进程、渲染端统一引用
 * - BusErrorCode：稳定错误码；主进程通过 normalizeBusError 归一化异常消息
 */
import type { Domain, Target } from './protocol';

export type { Domain, EventType, Target, WindowIdentity } from './protocol';

export interface BusEvent<T = any> {
  id: string;
  type: string;
  domain: Domain;
  source: string;
  target?: Target;
  payload: T;
  ts: number;
  /** 响应消息指向原请求 id；请求/响应同 type + replyTo，无独立响应事件类型 */
  replyTo?: string;
}

// 约定：出现在 RequestMap 中的事件，本表 payload 表示请求体，响应体见 ResponseMap。
export type EventMap = {
  OUTBOUND_DISPATCH: { tel: string };
  LOCK_CUSTOMER: { customerId: string };
  TICKET_ACCEPT: { ticketId: string };
  TICKET_DONE: { ticketId: string; by: string; ts?: number };
  RISK_CHECK: { customerId: string; amount: number };
};

export type RequestMap = Pick<
  EventMap,
  'OUTBOUND_DISPATCH' | 'LOCK_CUSTOMER' | 'TICKET_ACCEPT' | 'RISK_CHECK'
>;

export type ResponseMap = {
  OUTBOUND_DISPATCH: { accepted: boolean; tel: string; at?: number };
  LOCK_CUSTOMER: { locked: boolean; customerId: string; ts?: number };
  TICKET_ACCEPT: { accepted: boolean; ticketId: string; at?: number };
  RISK_CHECK: { passed: boolean; score: number; amount: number; customerId?: string };
};

export type BusErrorCode =
  | 'timeout'
  | 'over_capacity'
  | 'duplicate_request'
  | 'invalid_event'
  | 'unknown_domain'
  | 'invalid_domain_type'
  | 'unauthorized_source'
  | 'unauthorized_reply'
  | 'reply_type_mismatch'
  | 'invalid_target'
  | 'unknown_sender'
  | 'internal_error';

export interface BusResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: BusErrorCode;
}

export interface BusAck {
  id: string;
  error?: BusErrorCode;
}

export type RequestOptions = {
  timeout?: number; // ms
};
