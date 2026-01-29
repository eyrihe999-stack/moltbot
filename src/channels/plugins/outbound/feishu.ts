import { sendMessageFeishu } from "../../../feishu/send.js";
import type { ChannelOutboundAdapter } from "../types.js";

export const feishuOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  chunker: null,
  textChunkLimit: 4000,
  sendText: async ({ to, text, accountId, deps, replyToId, threadId }) => {
    const send = deps?.sendFeishu ?? sendMessageFeishu;
    const rootId = replyToId ?? (threadId != null ? String(threadId) : undefined);
    const result = await send(to, text, {
      accountId: accountId ?? undefined,
      rootId,
    });
    return { channel: "feishu", ...result };
  },
  sendMedia: async ({ to, text, mediaUrl, accountId, deps, replyToId, threadId }) => {
    const send = deps?.sendFeishu ?? sendMessageFeishu;
    const rootId = replyToId ?? (threadId != null ? String(threadId) : undefined);
    const result = await send(to, text ?? "", {
      accountId: accountId ?? undefined,
      rootId,
    });
    return { channel: "feishu", ...result };
  },
};
