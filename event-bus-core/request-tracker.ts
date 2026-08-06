import type { BusResponse } from '../shared/types';

export type PendingRequestMeta = {
  type: string;
  /** 唯一允许回包的身份：窗口 identity 或 'main' */
  expectedResponder: string;
};

type PendingEntry = PendingRequestMeta & {
  resolve: (res: BusResponse<any>) => void;
  timer: ReturnType<typeof setTimeout>;
  createdAt: number;
  expireAt: number;
};

type RequestTrackerOptions = {
  capacity: number;
  now?: () => number;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
};

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

  function register(
    id: string,
    timeout: number,
    resolve: (res: BusResponse<any>) => void,
    meta: PendingRequestMeta
  ) {
    // 超过容量时立即失败，避免主进程无限积压等待中的 request。
    if (pending.size >= options.capacity) {
      return { ok: false, error: 'over_capacity' as const };
    }

    // 同 id 重复注册会覆盖旧 timer，导致竞态；直接拒绝。
    if (pending.has(id)) {
      return { ok: false, error: 'duplicate_request' as const };
    }

    if (!meta.type || !meta.expectedResponder) {
      return { ok: false, error: 'invalid_event' as const };
    }

    // 广播目标无法确定唯一回包方，拒绝作为 request。
    if (meta.expectedResponder === '*') {
      return { ok: false, error: 'invalid_target' as const };
    }

    const createdAt = now();
    const timer = setTimer(() => {
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      resolve({ ok: false, error: 'timeout' });
    }, timeout);

    pending.set(id, {
      resolve,
      timer,
      createdAt,
      expireAt: createdAt + timeout,
      type: meta.type,
      expectedResponder: meta.expectedResponder,
    });

    return null;
  }

  function resolveReply(input: ResolveReplyInput): ResolveReplyResult {
    const { replyTo, type, source, payload } = input;
    if (!replyTo || !pending.has(replyTo)) return false;

    const entry = pending.get(replyTo)!;

    // 有 pending 但回包不合法：抛错拒绝，不消费 pending，防止劫持/错配。
    if (entry.type !== type) {
      throw new Error('reply_type_mismatch');
    }
    if (entry.expectedResponder !== source) {
      throw new Error('unauthorized_reply');
    }

    clearTimer(entry.timer);
    pending.delete(replyTo);
    entry.resolve({ ok: true, data: payload });
    return true;
  }

  /** 主动以错误结束 pending（例如 emit 同步校验失败），避免调用方空等超时。 */
  function failPending(id: string, error: BusResponse<any>['error']) {
    const entry = pending.get(id);
    if (!entry) return false;
    clearTimer(entry.timer);
    pending.delete(id);
    entry.resolve({ ok: false, error });
    return true;
  }

  function sweepExpired(currentTime = now()) {
    // sweep 兜底处理“计时器没机会清理”的异常场景，避免 pending 长期泄漏。
    let cleaned = 0;
    for (const [id, entry] of pending) {
      if (entry.expireAt > currentTime) continue;
      clearTimer(entry.timer);
      pending.delete(id);
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
