export type Domain = 'cti' | 'crm' | 'ticket' | 'risk' | 'context' | 'demo';
export type Target = 'workbench' | 'dialer' | 'partner:auto' | 'partner:credit' | 'partner:consumer' | 'partner:risk' | '*' | 'main';

export interface BusEvent<T = any> {
  id: string;
  type: string;
  domain: Domain;         // cti / crm / ticket / risk / context / demo
  source: string;         // 来源系统（workbench / dialer / partner:auto / main ...）
  target?: Target;        // 目标窗口名或广播 '*', 或 'main'（主进程）
  payload: T;
  ts: number;
  replyTo?: string;       // 若为响应消息，指向原请求 id
}

// 事件-负载映射（用于 on/emit 的类型提示）
export type EventMap = {
  // CTI（Workbench ⇄ Dialer）
  OUTBOUND_DISPATCH: { tel: string };
  CALL_START: { caller: string };

  // CRM（Workbench ⇄ Main）
  LOCK_CUSTOMER: { customerId: string };

  // Ticket（Workbench ⇄ Partner:auto；Partner:auto → Workbench）
  TICKET_ACCEPT: { ticketId: string };
  TICKET_DONE: { ticketId: string; by: string; ts?: number };

  // Risk（Workbench ⇄ Main）
  RISK_CHECK: { customerId: string; amount: number };
  RISK_RESULT: { passed: boolean; score: number; amount: number; customerId?: string };

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

export interface BusResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface BusAck {
  id: string;
}

export type RequestOptions = {
  timeout?: number; // ms
};
