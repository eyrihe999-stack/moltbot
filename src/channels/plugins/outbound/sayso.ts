/**
 * Sayso outbound: delegates to Feishu channel default config.
 * Sayso is inbound-only; outbound uses Feishu (to = open_id/user_id/chat_id from Sayso message).
 */
import { sendMessageFeishu } from "../../../feishu/send.js";
import type { ChannelOutboundAdapter } from "../types.js";

export const saysoOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  chunker: null,
  textChunkLimit: 4000,
  sendText: async ({ to, text, deps, replyToId, threadId }) => {
    const send = deps?.sendFeishu ?? sendMessageFeishu;
    const rootId = replyToId ?? (threadId != null ? String(threadId) : undefined);
    const result = await send(to, text, {
      accountId: undefined,
      rootId,
    });
    return { channel: "sayso", ...result };
  },
  sendMedia: async ({ to, text, deps, replyToId, threadId }) => {
    const send = deps?.sendFeishu ?? sendMessageFeishu;
    const rootId = replyToId ?? (threadId != null ? String(threadId) : undefined);
    const result = await send(to, text ?? "", {
      accountId: undefined,
      rootId,
    });
    return { channel: "sayso", ...result };
  },
};
