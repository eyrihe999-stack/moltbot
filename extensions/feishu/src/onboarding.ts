import {
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
  formatDocsLink,
  promptAccountId,
  type MoltbotConfig,
  type ChannelOnboardingAdapter,
  type WizardPrompter,
} from "clawdbot/plugin-sdk";

import {
  listFeishuAccountIds,
  resolveDefaultFeishuAccountId,
  resolveFeishuAccount,
} from "../../../src/feishu/accounts.js";

const channel = "feishu" as const;

async function noteFeishuAppCredentialsHelp(prompter: WizardPrompter) {
  await prompter.note(
    [
      "Feishu (飞书) requires App ID and App Secret from the Feishu open platform.",
      "",
      "1. Go to https://open.feishu.cn/app",
      "2. Create a new app or select an existing one",
      "3. Go to 'Credentials & Basic Info' → 'App Credentials'",
      "4. Copy the App ID and App Secret",
      "",
      `Docs: ${formatDocsLink("/channels/feishu", "docs.molt.bot/channels/feishu")}`,
    ].join("\n"),
    "Feishu setup",
  );
}

export const feishuOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg }) => {
    const configured = listFeishuAccountIds(cfg).some((accountId) => {
      const account = resolveFeishuAccount({ cfg, accountId });
      return Boolean(account.appId && account.appSecret);
    });
    return {
      channel,
      configured,
      statusLines: [`Feishu: ${configured ? "configured" : "needs App ID + App Secret"}`],
      selectionHint: configured ? "configured" : "needs credentials",
      quickstartScore: configured ? 1 : 5,
    };
  },
  configure: async ({
    cfg,
    prompter,
    accountOverrides,
    shouldPromptAccountIds,
  }) => {
    const feishuOverride = accountOverrides.feishu?.trim();
    const defaultFeishuAccountId = resolveDefaultFeishuAccountId(cfg);
    let feishuAccountId = feishuOverride
      ? normalizeAccountId(feishuOverride)
      : defaultFeishuAccountId;
    if (shouldPromptAccountIds && !feishuOverride) {
      feishuAccountId = await promptAccountId({
        cfg,
        prompter,
        label: "Feishu",
        currentId: feishuAccountId,
        listAccountIds: listFeishuAccountIds,
        defaultAccountId: defaultFeishuAccountId,
      });
    }

    let next = cfg;
    const resolvedAccount = resolveFeishuAccount({
      cfg: next,
      accountId: feishuAccountId,
    });
    const accountConfigured = Boolean(resolvedAccount.appId && resolvedAccount.appSecret);
    const allowEnv = feishuAccountId === DEFAULT_ACCOUNT_ID;
    const canUseEnv = allowEnv && Boolean(
      process.env.FEISHU_APP_ID?.trim() && process.env.FEISHU_APP_SECRET?.trim(),
    );
    const hasConfigCreds = Boolean(
      resolvedAccount.config.appId || resolvedAccount.config.appSecret,
    );

    let appId: string | null = null;
    let appSecret: string | null = null;
    if (!accountConfigured) {
      await noteFeishuAppCredentialsHelp(prompter);
    }
    if (canUseEnv && !resolvedAccount.config.appId && !resolvedAccount.config.appSecret) {
      const keepEnv = await prompter.confirm({
        message: "FEISHU_APP_ID + FEISHU_APP_SECRET detected. Use env vars?",
        initialValue: true,
      });
      if (!keepEnv) {
        appId = String(
          await prompter.text({
            message: "Enter Feishu App ID",
            validate: (value) => (value?.trim() ? undefined : "Required"),
          }),
        ).trim();
        appSecret = String(
          await prompter.text({
            message: "Enter Feishu App Secret",
            validate: (value) => (value?.trim() ? undefined : "Required"),
          }),
        ).trim();
      }
    } else if (hasConfigCreds) {
      const keep = await prompter.confirm({
        message: "Feishu credentials already configured. Keep them?",
        initialValue: true,
      });
      if (!keep) {
        appId = String(
          await prompter.text({
            message: "Enter Feishu App ID",
            validate: (value) => (value?.trim() ? undefined : "Required"),
          }),
        ).trim();
        appSecret = String(
          await prompter.text({
            message: "Enter Feishu App Secret",
            validate: (value) => (value?.trim() ? undefined : "Required"),
          }),
        ).trim();
      }
    } else {
      appId = String(
        await prompter.text({
          message: "Enter Feishu App ID",
          validate: (value) => (value?.trim() ? undefined : "Required"),
        }),
      ).trim();
      appSecret = String(
        await prompter.text({
          message: "Enter Feishu App Secret",
          validate: (value) => (value?.trim() ? undefined : "Required"),
        }),
      ).trim();
    }

    if (appId && appSecret) {
      if (feishuAccountId === DEFAULT_ACCOUNT_ID) {
        next = {
          ...next,
          channels: {
            ...next.channels,
            feishu: {
              ...next.channels?.feishu,
              enabled: true,
              appId,
              appSecret,
            },
          },
        };
      } else {
        next = {
          ...next,
          channels: {
            ...next.channels,
            feishu: {
              ...next.channels?.feishu,
              enabled: true,
              accounts: {
                ...next.channels?.feishu?.accounts,
                [feishuAccountId]: {
                  ...next.channels?.feishu?.accounts?.[feishuAccountId],
                  enabled: next.channels?.feishu?.accounts?.[feishuAccountId]?.enabled ?? true,
                  appId,
                  appSecret,
                },
              },
            },
          },
        };
      }
    } else if (canUseEnv && !resolvedAccount.config.appId && !resolvedAccount.config.appSecret) {
      // User chose to use env vars, just enable the channel
      next = {
        ...next,
        channels: {
          ...next.channels,
          feishu: {
            ...next.channels?.feishu,
            enabled: true,
          },
        },
      };
    }

    return { cfg: next, accountId: feishuAccountId };
  },
  disable: (cfg) => ({
    ...cfg,
    channels: {
      ...cfg.channels,
      feishu: { ...cfg.channels?.feishu, enabled: false },
    },
  }),
};
