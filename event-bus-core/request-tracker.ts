import type { BusResponse } from '../shared/types';

type PendingEntry = {
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
    resolve: (res: BusResponse<any>) => void
  ) {
    // 超过容量时立即失败，避免主进程无限积压等待中的 request。
    if (pending.size >= options.capacity) {
      return { ok: false, error: 'over_capacity' as const };
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
    });

    return null;
  }

  function resolveReply(replyTo: string | undefined, payload: unknown) {
    if (!replyTo || !pending.has(replyTo)) return false;
    // 一旦匹配到 replyTo，请求就在这里完成，后续 bus 不再继续分发该响应事件。
    const entry = pending.get(replyTo)!;
    clearTimer(entry.timer);
    pending.delete(replyTo);
    entry.resolve({ ok: true, data: payload });
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
    sweepExpired,
  };
}
