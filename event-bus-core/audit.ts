import type { BusEvent } from '../shared/types'
export function auditLog(event:BusEvent) {
    // 可替换为文件 / ELK / Kafka
    console.log('[AUDIT]', JSON.stringify(event));
  }
  