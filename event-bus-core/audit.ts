export function auditLog(event) {
    // 可替换为文件 / ELK / Kafka
    console.log('[AUDIT]', JSON.stringify(event));
  }
  