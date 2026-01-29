import {
  DEFAULT_ACCOUNT_ID,
  getChatChannelMeta,
  listFeishuAccountIds,
  resolveDefaultFeishuAccountId,
  resolveFeishuAccount,
  buildChannelConfigSchema,
  FeishuConfigSchema,
  type ChannelPlugin,
  type ResolvedFeishuAccount,
} from "clawdbot/plugin-sdk";

import { getFeishuRuntime } from "./runtime.js";
import { feishuOnboardingAdapter } from "./onboarding.js";

const meta = getChatChannelMeta("feishu");

export const feishuPlugin: ChannelPlugin<ResolvedFeishuAccount> = {
  id: "feishu",
  meta: { ...meta },
  capabilities: {
    chatTypes: ["direct", "channel"],
    reactions: false,
    threads: false,
    media: false,
    nativeCommands: false,
  },
  reload: { configPrefixes: ["channels.feishu"] },
  configSchema: buildChannelConfigSchema(FeishuConfigSchema),
  onboarding: feishuOnboardingAdapter,
  messaging: {
    targetResolver: {
      hint: "Bare id auto: oc_=chat, ou_=user(open_id), else=user(user_id); or use user_id:/open_id:/chat_id:",
      looksLikeId: (raw: string) => {
        const trimmed = raw.trim();
        if (!trimmed) return false;
        if (/^(chat_id:|chat:|open_id:|user_id:|user:|feishu:)/i.test(trimmed)) return true;
        // Feishu open_id (ou_xxx), chat_id (oc_xxx), user_id are alphanumeric (and may include underscore).
        return /^[a-zA-Z0-9_-]+$/.test(trimmed);
      },
    },
  },
  config: {
    listAccountIds: (cfg) => listFeishuAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveFeishuAccount({ cfg, accountId }),
    defaultAccountId: (cfg) => resolveDefaultFeishuAccountId(cfg),
    isConfigured: (account) => Boolean(account.appId && account.appSecret),
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.appId && account.appSecret),
      appIdSource: account.appIdSource,
      appSecretSource: account.appSecretSource,
    }),
  },
  outbound: {
    deliveryMode: "direct",
    chunker: null,
    textChunkLimit: 4000,
    sendText: async ({ to, text, accountId, deps, replyToId, threadId }) => {
      const send = deps?.sendFeishu ?? getFeishuRuntime().channel.feishu.sendMessageFeishu;
      const rootId = replyToId ?? (threadId != null ? String(threadId) : undefined);
      const result = await send(to, text ?? "", {
        accountId: accountId ?? undefined,
        rootId,
      });
      return { channel: "feishu", ...result };
    },
    sendMedia: async ({ to, text, accountId, deps, replyToId, threadId }) => {
      const send = deps?.sendFeishu ?? getFeishuRuntime().channel.feishu.sendMessageFeishu;
      const rootId = replyToId ?? (threadId != null ? String(threadId) : undefined);
      const result = await send(to, text ?? "", {
        accountId: accountId ?? undefined,
        rootId,
      });
      return { channel: "feishu", ...result };
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastError: null,
    },
    buildAccountSnapshot: ({ account, runtime }) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.appId && account.appSecret),
      appIdSource: account.appIdSource,
      appSecretSource: account.appSecretSource,
      running: runtime?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastError: runtime?.lastError ?? null,
    }),
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      ctx.log?.info(`[${account.accountId}] starting Feishu provider`);
      return getFeishuRuntime().channel.feishu.monitorFeishuProvider({
        config: ctx.cfg,
        accountId: account.accountId,
        appId: account.appId,
        appSecret: account.appSecret,
        webhookPath: account.webhookPath,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
      });
    },
  },
};
