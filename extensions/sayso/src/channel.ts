import {
  DEFAULT_ACCOUNT_ID,
  getChatChannelMeta,
  buildChannelConfigSchema,
  SaysoConfigSchema,
  type ChannelPlugin,
  type SaysoConfig,
} from "clawdbot/plugin-sdk";

import { saysoOnboardingAdapter } from "./onboarding.js";

const meta = getChatChannelMeta("sayso");

type ResolvedSaysoAccount = SaysoConfig & { accountId: string };

function getSaysoConfig(cfg: { channels?: { sayso?: SaysoConfig } }): SaysoConfig | undefined {
  const sayso = cfg.channels?.sayso as SaysoConfig | undefined;
  if (!sayso || typeof sayso !== "object") return undefined;
  const userId = (sayso.feishuUserId as string)?.trim();
  const chatId = (sayso.feishuChatId as string)?.trim();
  if (!userId && !chatId) return undefined;
  return sayso;
}

export const saysoPlugin: ChannelPlugin<ResolvedSaysoAccount> = {
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
      if (!sayso) return null;
      return { ...sayso, accountId } as ResolvedSaysoAccount;
    },
    defaultAccountId: () => DEFAULT_ACCOUNT_ID,
    isConfigured: (account) =>
      Boolean(
        (account.feishuUserId as string)?.trim() || (account.feishuChatId as string)?.trim(),
      ),
    describeAccount: (account) => ({
      accountId: account.accountId,
      configured: Boolean(
        (account.feishuUserId as string)?.trim() || (account.feishuChatId as string)?.trim(),
      ),
    }),
  },
};
