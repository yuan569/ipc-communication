/**
 * 事件路由校验
 * 按共享协议（或 router-policy.json 覆盖）校验事件的 domain、type、source、target。
 * 所有来自 renderer 的事件在进入 emit 流程前必须通过 validateEvent。
 */
import type { BusEvent } from '../shared/types';
import { BUS_POLICY, type Domain, type Target } from '../shared/protocol';

// —— 动态策略载入（可选）：项目根目录下 router-policy.json 存在时覆盖默认策略 ——
interface Policy {
  domain: Record<Domain, { types: readonly string[] }>;
  type: Record<string, { sources?: readonly string[]; targets?: readonly Target[] }>;
}

// 默认策略来自共享协议，避免路由层和类型层各维护一份事实来源。
let policy: Policy = BUS_POLICY;

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
