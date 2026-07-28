/**
 * 共享类型与事件契约（主进程与渲染端共用）
 * - BusEvent / EventMap / RequestMap / ResponseMap：供主进程、渲染端、路由校验统一引用
 * - BusErrorCode：稳定错误码，便于调用方按码分支；主进程通过 normalizeBusError 归一化异常消息
 */
import type { Domain, Target } from './protocol';

export type { Domain, EventType, Target, WindowIdentity } from './protocol';

export interface BusEvent<T = any> {
  id: string;
  type: string;
  domain: Domain;         // cti / crm / ticket / risk / context / demo
  source: string;         // 来源系统（workbench / dialer / partner:auto / main ...）
  target?: Target;        // 目标窗口名或广播 '*', 或 'main'（主进程）
  payload: T;
  ts: number;
  replyTo?: string;       // 若为响应消息，指向原请求 id；请求/响应统一为同 type + replyTo，无独立响应事件类型
}

// 事件-负载映射（用于 on/emit 的类型提示）
// 约定：request/response 一律用「响应事件 type 与请求相同 + replyTo 指回请求 id」，不定义 *_RESULT 类独立响应事件。
// 出现在 RequestMap 中的事件，本表 payload 表示请求体，响应体形状见 ResponseMap。
export type EventMap = {
  // CTI（Workbench ⇄ Dialer）
  OUTBOUND_DISPATCH: { tel: string };
  CALL_START: { caller: string };

  // CRM（Workbench ⇄ Main）
  LOCK_CUSTOMER: { customerId: string };

  // Ticket（Workbench ⇄ Partner:auto；Partner:auto → Workbench）
  TICKET_ACCEPT: { ticketId: string };
  TICKET_DONE: { ticketId: string; by: string; ts?: number };

  // Risk（Workbench ⇄ Main）：请求与响应均为 type=RISK_CHECK，响应通过 replyTo 关联；payload 请求态见本项，响应态见 ResponseMap.RISK_CHECK
  RISK_CHECK: { customerId: string; amount: number };

  // 上下文广播（可选）
  CONTEXT_UPDATED: {
    call: null | { tel: string; startTs: number };
    cti: { status: 'idle' | 'dialing' | 'ringing' | 'talking' };
    ticket: { id: string; assignee: string; status: string };
    locks: { customers: [string, string][] };
    ts: number;
  };

  // 工具类（日志）
  LOG: { message: string; from?: string; level?: 'info' | 'warn' | 'error' };
};

// Request/Response Map：为 request/response 提供更强类型
export type RequestMap = {
  OUTBOUND_DISPATCH: { tel: string };
  LOCK_CUSTOMER: { customerId: string };
  TICKET_ACCEPT: { ticketId: string };
  RISK_CHECK: { customerId: string; amount: number };
};

export type ResponseMap = {
  OUTBOUND_DISPATCH: { accepted: boolean; tel: string; at?: number };
  LOCK_CUSTOMER: { locked: boolean; customerId: string; ts?: number };
  TICKET_ACCEPT: { accepted: boolean; ticketId: string; at?: number };
  RISK_CHECK: { passed: boolean; score: number; amount: number; customerId?: string };
};

export type EmitOptions = {
  ack?: boolean;
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
