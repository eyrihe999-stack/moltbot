import type { SaysoConfig } from "../../config/types.sayso.js";
import { SaysoConfigSchema } from "../../config/zod-schema.providers-core.js";
import { DEFAULT_ACCOUNT_ID } from "../../routing/session-key.js";
import { getChatChannelMeta } from "../registry.js";
import { buildChannelConfigSchema } from "./config-schema.js";
import type { ChannelPlugin } from "./types.js";
import { saysoOnboardingAdapter } from "./sayso-onboarding.js";
import {
  startSaysoGatewayAccount,
  toUserTargetString,
  toChatTargetString,
} from "./sayso-gateway.js";

type ResolvedSaysoAccount = SaysoConfig & { accountId: string };

function getSaysoConfig(cfg: { channels?: { sayso?: SaysoConfig } }): SaysoConfig | undefined {
  const sayso = cfg.channels?.sayso as SaysoConfig | undefined;
  if (!sayso || typeof sayso !== "object") return undefined;
  const userId = (sayso.feishuUserId as string)?.trim();
  const chatId = (sayso.feishuChatId as string)?.trim();
  if (!userId && !chatId) return undefined;
  return sayso;
}

const meta = getChatChannelMeta("sayso");

export const saysoChannelPlugin: ChannelPlugin<ResolvedSaysoAccount> = {
  id: "sayso",
  meta: { ...meta },
  capabilities: {
    chatTypes: [],
    reactions: false,
    threads: false,
    media: false,
    nativeCommands: false,
  },
  reload: { configPrefixes: ["channels.sayso"] },
  configSchema: buildChannelConfigSchema(SaysoConfigSchema),
  onboarding: saysoOnboardingAdapter,
  config: {
    listAccountIds: () => [DEFAULT_ACCOUNT_ID],
    resolveAccount: (cfg, accountId) => {
      const sayso = getSaysoConfig(cfg);
      const id = accountId?.trim() || DEFAULT_ACCOUNT_ID;
      if (!sayso) return { accountId: id } as ResolvedSaysoAccount;
      return { ...sayso, accountId: id } as ResolvedSaysoAccount;
    },
    defaultAccountId: () => DEFAULT_ACCOUNT_ID,
    // Always "configured" so startAccount runs and /sayso/events is registered; handler returns 503 when no reply target.
    isConfigured: () => true,
    describeAccount: (account) => ({
      accountId: account.accountId,
      configured: Boolean(
        (account.feishuUserId as string)?.trim() || (account.feishuChatId as string)?.trim(),
      ),
    }),
  },
  gateway: {
    startAccount: (ctx) => startSaysoGatewayAccount(ctx),
  },
  messaging: {
    targetResolver: {
      // Accept any Feishu-style target; validation is done at Sayso ingress.
      looksLikeId: (raw: string) => /^(open_id|user_id|chat_id):/i.test(raw.trim()),
    },
  },
  directory: {
    listPeers: async ({ cfg, accountId }) => {
      const sayso = getSaysoConfig(cfg);
      const userId = (sayso?.feishuUserId as string)?.trim();
      if (!userId) return [];
      const id = toUserTargetString(userId);
      return [{ kind: "user" as const, id, name: "Feishu user", handle: userId }];
    },
    listGroups: async ({ cfg }) => {
      const sayso = getSaysoConfig(cfg);
      const chatId = (sayso?.feishuChatId as string)?.trim();
      if (!chatId) return [];
      const id = toChatTargetString(chatId);
      return [{ kind: "group" as const, id, name: "Feishu chat", handle: chatId }];
    },
  },
};
