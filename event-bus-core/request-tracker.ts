import type { BusErrorCode, BusResponse } from '../shared/types';

export type PendingRequestMeta = {
  type: string;
  /** 唯一允许回包的身份：窗口 identity 或 'main' */
  expectedResponder: string;
};

type PendingEntry = PendingRequestMeta & {
  resolve: (res: BusResponse<unknown>) => void;
  timer: ReturnType<typeof setTimeout>;
  expireAt: number;
};

type RequestTrackerOptions = {
  capacity: number;
  now?: () => number;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
};

/** register 失败码：均为可立即返回给调用方的稳定 BusErrorCode */
export type RegisterErrorCode = Extract<
  BusErrorCode,
  'over_capacity' | 'duplicate_request' | 'invalid_event' | 'invalid_target'
>;

export type RegisterResult =
  | { ok: true }
  | { ok: false; error: RegisterErrorCode };

export type ResolveReplyInput = {
  replyTo: string | undefined;
  type: string;
  source: string;
  payload: unknown;
};

/**
 * 尝试用 reply 完成 pending：
 * - false：没有对应 pending（不是一次有效回包）
 * - true：已成功 resolve
 * - throw：有 pending 但 type/授权不匹配（拒绝劫持，请求继续等待）
 *
 * 故意与 register 的 `{ ok }` 返回风格不同：非法回包必须 throw，
 * 既不消费 pending，又能沿用 Bus 侧现有 catch → normalizeBusError 路径。
 */
export type ResolveReplyResult = boolean;

export function createRequestTracker(options: RequestTrackerOptions) {
  // 这里单独抽成纯逻辑模块，目的是让 request/replyTo/timeout 能脱离 Electron 做单测。
  const pending = new Map<string, PendingEntry>();
  const now = options.now ?? Date.now;
  const setTimer = options.setTimer ?? global.setTimeout;
  const clearTimer = options.clearTimer ?? global.clearTimeout;

  function size() {
    return pending.size;
  }

  function register<T = unknown>(
    id: string,
    timeout: number,
    resolve: (res: BusResponse<T>) => void,
    meta: PendingRequestMeta
  ): RegisterResult {
    // 超过容量时立即失败，避免主进程无限积压等待中的 request。
    if (pending.size >= options.capacity) {
      return { ok: false, error: 'over_capacity' };
    }

    // 同 id 重复注册会覆盖旧 timer，导致竞态；直接拒绝。
    if (pending.has(id)) {
      return { ok: false, error: 'duplicate_request' };
    }

    if (!meta.type || !meta.expectedResponder) {
      return { ok: false, error: 'invalid_event' };
    }

    // 广播目标无法确定唯一回包方，拒绝作为 request。
    if (meta.expectedResponder === '*') {
      return { ok: false, error: 'invalid_target' };
    }

    const expireAt = now() + timeout;
    const timer = setTimer(() => {
      // 超时必须 delete：否则 pending 泄漏，且迟到的合法回包会错误命中已过期请求。
      disposePending(id, { ok: false, error: 'timeout' });
    }, timeout);

    pending.set(id, {
      resolve: resolve as (res: BusResponse<unknown>) => void,
      timer,
      expireAt,
      type: meta.type,
      expectedResponder: meta.expectedResponder,
    });

    return { ok: true };
  }

  function resolveReply(input: ResolveReplyInput): ResolveReplyResult {
    const { replyTo, type, source, payload } = input;
    if (!replyTo || !pending.has(replyTo)) return false;

    const entry = pending.get(replyTo)!;

    // 有 pending 但回包不合法：必须 throw 且不 delete。
    // 若此处消费 pending，攻击方/错配方可先发一条非法 reply 把槽位清掉，
    // 真正的合法回包方将永远无法完成（或变成 orphan）。
    if (entry.type !== type) {
      throw new Error('reply_type_mismatch' satisfies BusErrorCode);
    }
    if (entry.expectedResponder !== source) {
      throw new Error('unauthorized_reply' satisfies BusErrorCode);
    }

    disposePending(replyTo, { ok: true, data: payload });
    return true;
  }

  /** 主动以错误结束 pending（例如 emit 同步校验失败），避免调用方空等超时。 */
  function failPending(id: string, error: BusErrorCode): boolean {
    return disposePending(id, { ok: false, error });
  }

  /**
   * 统一结束 pending：清 timer → 移出 map → 可选 resolve。
   * - 带 response：正常完成 / 超时 / 主动失败
   * - 不带 response：仅清理（sweep），不通知调用方（避免把“兜底清理”伪装成业务结果）
   */
  function disposePending(id: string, response?: BusResponse<unknown>): boolean {
    const entry = pending.get(id);
    if (!entry) return false;
    clearTimer(entry.timer);
    pending.delete(id);
    if (response !== undefined) {
      entry.resolve(response);
    }
    return true;
  }

  function sweepExpired(currentTime = now()) {
    // sweep 只是兜底：正常路径靠 setTimeout 清理。
    // 处理计时器被挂起/漏触发等异常场景，避免 pending 长期泄漏。
    // 只 delete、不 resolve，防止与随后触发的 timeout resolve 双重回调。
    let cleaned = 0;
    for (const [id, entry] of pending) {
      if (entry.expireAt > currentTime) continue;
      disposePending(id);
      cleaned++;
    }
    return cleaned;
  }

  return {
    size,
    register,
    resolveReply,
    failPending,
    sweepExpired,
  };
}
