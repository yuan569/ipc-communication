export interface BusEvent<T = any> {
    id: string;
    type: string;
    domain: string;         // call / crm / order / credit / auto
    source: string;         // 来源系统
    target?: string | '*';  // 目标系统
    payload: T;
    ts: number;
  }
  
  export type EmitOptions = {
    ack?: boolean;
  };
  