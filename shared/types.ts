export interface BusEvent<T = any> {
  id: string;
  type: string;
  domain: string;         // call / crm / order / credit / auto
  source: string;         // 来源系统
  target?: string | '*';  // 目标系统
  payload: T;
  ts: number;
  replyTo?: string;       // 若为响应消息，指向原请求 id
}

// 1) 定义事件-负载映射，获得类型安全
export type EventMap = {
  CALL_START: { caller: string; ticketId: string };
  CREDIT_APPROVE: { orderId: string };
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
