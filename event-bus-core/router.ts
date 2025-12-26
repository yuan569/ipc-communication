import type { BusEvent, Domain, Target } from '../shared/types';

// —— 动态策略载入（可热更新） ——
interface Policy {
  domain: Record<Domain, { types: string[] }>;
  type: Record<string, { sources?: string[]; targets?: Target[] }>;
}

// 默认内联策略（满足当前 5 个场景）
let policy: Policy = {
  domain: {
    cti:     { types: ['OUTBOUND_DISPATCH', 'CALL_START'] },
    crm:     { types: ['LOCK_CUSTOMER'] },
    ticket:  { types: ['TICKET_ACCEPT', 'TICKET_DONE'] },
    risk:    { types: ['RISK_CHECK', 'RISK_RESULT'] },
    context: { types: ['CONTEXT_UPDATED'] },
    demo:    { types: ['LOG'] },
  } as any,
  type: {
    OUTBOUND_DISPATCH: { sources: ['workbench'], targets: ['dialer'] },
    LOCK_CUSTOMER:     { sources: ['workbench'], targets: ['main'] },
    TICKET_ACCEPT:     { sources: ['workbench'], targets: ['partner:auto'] },
    TICKET_DONE:       { sources: ['partner:auto'], targets: ['workbench'] },
    RISK_CHECK:        { sources: ['workbench'], targets: ['main'] },
  },
};

// 热加载策略文件（可选）
import * as fs from 'fs';
import * as path from 'path';
const policyPath = path.join(process.cwd(), 'router-policy.json');
if (fs.existsSync(policyPath)) {
  try { policy = JSON.parse(fs.readFileSync(policyPath, 'utf8')); } catch (e) { console.error('[router] load policy error', e); }
  // 监听文件变更自动热更新
  fs.watchFile(policyPath, () => {
    try {
      policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
      console.log('[router] policy reloaded');
    } catch (e) { console.error('[router] reload error', e); }
  });
}

export function validateEvent(event: BusEvent) {
  // 基础字段校验
  if (!event || !event.id || !event.type || !event.domain || !event.source || !event.ts) {
    throw new Error('非法事件格式');
  }

  // —— 域校验 ——
  const domainRule = policy.domain[event.domain as Domain];
  if (!domainRule) throw new Error(`未知 domain: ${event.domain}`);
  if (!domainRule.types.includes(event.type)) {
    throw new Error(`事件 ${event.type} 不属于 domain ${event.domain}`);
  }

  // —— 来源白名单 ——
  const allowSrc = policy.type[event.type]?.sources;
  if (allowSrc && !allowSrc.includes(event.source)) {
    throw new Error(`非法来源: ${event.source} 无权发送 ${event.type}`);
  }

  // —— 目标白名单 ——
  const allowTgt = policy.type[event.type]?.targets;
  if (allowTgt && event.target && !allowTgt.includes(event.target as Target)) {
    throw new Error(`非法目标: ${String(event.target)} 不能接收 ${event.type}`);
  }
}
