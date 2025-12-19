import type { BusEvent } from '../shared/types'
export function validateEvent(event:BusEvent) {
    // 示例规则
    if (event.domain === 'credit' && !event.source.startsWith('credit')) {
      throw new Error('非法信用卡事件来源');
    }
  
    if (!event.id || !event.type) {
      throw new Error('非法事件格式');
    }
  }
  