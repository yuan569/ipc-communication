import * as fs from 'fs';
import * as path from 'path';
import type { BusEvent } from '../shared/types';

// 简单文件审计：将关键域事件按 JSONL 追加到 logs/ipc-audit-YYYY-MM-DD.log
// 生产可替换成 Kafka / ELK / SaaS 日志服务
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

function logFilePath(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return path.join(logDir, `ipc-audit-${day}.log`);
}

export function auditLog(event: BusEvent) {
  // 仅记录关键业务域，减少文件量
  if (!['crm', 'risk', 'ticket'].includes(event.domain)) return;
  try {
    fs.appendFileSync(logFilePath(), JSON.stringify(event) + '\n');
  } catch (err) {
    // 避免抛错阻塞主流程
    try { console.error('[audit][write_err]', err); } catch {}
  }
}
