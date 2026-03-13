/**
 * 发送者身份校验：主进程根据 webContents.id 映射的真实 identity 比对 event.source
 * - 必须在 IPC 入口（bus:emit / bus:ack / bus:request）调用，早于 validateEvent，防止伪造 source
 */
import type { WindowIdentity } from '../shared/protocol';
import type { BusEvent } from '../shared/types';

export function assertSenderIdentity(
  senderIdentityByWebContentsId: Map<number, WindowIdentity>,
  senderId: number,
  event: Pick<BusEvent<any>, 'source'>
) {
  const actualSource = senderIdentityByWebContentsId.get(senderId);
  if (!actualSource) {
    throw new Error('unknown_sender');
  }
  if (event.source !== actualSource) {
    throw new Error('unauthorized_source');
  }
}
