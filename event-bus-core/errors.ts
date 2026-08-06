/**
 * 错误码归一化：将主进程抛出的异常或字符串映射为稳定 BusErrorCode
 * - 供 IPC 桥接层在 catch 中调用，便于 renderer 按 error 字段做分支处理
 */
import type { BusErrorCode } from '../shared/types';

export function normalizeBusError(err: unknown): BusErrorCode {
  const message = String((err as { message?: string } | undefined)?.message || err || '');
  if (message === 'timeout') return 'timeout';
  if (message === 'over_capacity') return 'over_capacity';
  if (message === 'duplicate_request') return 'duplicate_request';
  if (message === 'unknown_sender') return 'unknown_sender';
  if (message === 'unauthorized_source') return 'unauthorized_source';
  if (message === 'unauthorized_reply') return 'unauthorized_reply';
  if (message === 'reply_type_mismatch') return 'reply_type_mismatch';
  if (message === 'orphan_reply') return 'orphan_reply';
  if (message.includes('非法事件格式')) return 'invalid_event';
  if (message.includes('未知事件类型')) return 'invalid_event';
  if (message.includes('未知 domain')) return 'unknown_domain';
  if (message.includes('不属于 domain')) return 'invalid_domain_type';
  if (message.includes('非法来源')) return 'unauthorized_source';
  if (message.includes('非法目标')) return 'invalid_target';
  return 'internal_error';
}
