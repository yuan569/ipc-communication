import * as fs from 'fs';
import * as path from 'path';
import type { BusEvent } from '../shared/types';

// 简单文件审计：将关键域事件按 JSONL 追加到 logs/ipc-audit-YYYY-MM-DD.log
// 生产可替换成 Kafka / ELK / SaaS 日志服务
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

// 审计日志先入内存队列，再批量异步落盘，避免每次事件都阻塞主线程。
const pendingLines: string[] = [];
let flushScheduled = false;
let flushInFlight = false;

function logFilePath(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return path.join(logDir, `ipc-audit-${day}.log`);
}

export function auditLog(event: BusEvent) {
  // 仅记录关键业务域，减少文件量
  if (!['crm', 'risk', 'ticket'].includes(event.domain)) return;
  pendingLines.push(JSON.stringify(event) + '\n');
  scheduleFlush();
}

function scheduleFlush() {
  if (flushScheduled) return;
  flushScheduled = true;
  // 合并同一事件循环内的多次写入请求，降低 appendFile 调用频率。
  setImmediate(() => {
    flushScheduled = false;
    void flushAuditQueue();
  });
}

async function flushAuditQueue() {
  if (flushInFlight || pendingLines.length === 0) return;

  flushInFlight = true;
  // 一次性取走当前批次，避免写盘过程中又被新事件打乱顺序。
  const batch = pendingLines.splice(0, pendingLines.length).join('');

  try {
    await fs.promises.appendFile(logFilePath(), batch);
  } catch (err) {
    // 写失败时把本批数据放回队列头部，避免日志静默丢失。
    pendingLines.unshift(batch);
    try { console.error('[audit][write_err]', err); } catch {}
  } finally {
    flushInFlight = false;
    if (pendingLines.length > 0) scheduleFlush();
  }
}
