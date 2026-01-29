import {
  formatDocsLink,
  type MoltbotConfig,
  type ChannelOnboardingAdapter,
  type SaysoConfig,
} from "clawdbot/plugin-sdk";

const channel = "sayso" as const;

function getSaysoConfig(cfg: MoltbotConfig): SaysoConfig | undefined {
  const sayso = cfg.channels?.sayso as SaysoConfig | undefined;
  if (!sayso || typeof sayso !== "object") return undefined;
  const userId = (sayso.feishuUserId as string)?.trim();
  const chatId = (sayso.feishuChatId as string)?.trim();
  if (!userId && !chatId) return undefined;
  return sayso;
}

export const saysoOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg }) => {
    const configured = Boolean(getSaysoConfig(cfg));
    return {
      channel,
      configured,
      statusLines: [
        `Sayso: ${configured ? "configured (webhook → Feishu)" : "needs Feishu user_id or chat_id"}`,
      ],
      selectionHint: configured ? "configured" : "needs Feishu target",
      quickstartScore: configured ? 1 : 5,
    };
  },
  configure: async ({ cfg, prompter }) => {
    await prompter.note(
      [
        "Sayso sends text to the gateway; the gateway forwards it to Feishu.",
        "Configure at least one Feishu target (user_id for DM, chat_id for group).",
        "Feishu must already be configured (channels.feishu with appId/appSecret).",
        "",
        `Docs: ${formatDocsLink("/channels/sayso", "docs.molt.bot/channels/sayso")}`,
      ].join("\n"),
      "Sayso setup",
    );

    const existing = (cfg.channels?.sayso ?? {}) as SaysoConfig;

    const feishuUserId = String(
      await prompter.text({
        message: "Feishu user_id (for DM; optional if you set chat_id)",
        initialValue: (existing.feishuUserId as string)?.trim() ?? "",
      }),
    ).trim();

    const feishuChatId = String(
      await prompter.text({
        message: "Feishu chat_id (for group; optional if you set user_id)",
        initialValue: (existing.feishuChatId as string)?.trim() ?? "",
      }),
    ).trim();

    if (!feishuUserId && !feishuChatId) {
      await prompter.note("At least one of Feishu user_id or chat_id is required.", "Sayso");
      return { cfg };
    }

    const webhookPath = String(
      await prompter.text({
        message: "Webhook path (default: /sayso/webhook)",
        initialValue: (existing.webhookPath as string)?.trim() || "/sayso/webhook",
      }),
    ).trim();

    const secret = String(
      await prompter.text({
        message: "Optional secret for webhook (X-Sayso-Secret header; leave empty to skip)",
        initialValue: (existing.secret as string)?.trim() ?? "",
      }),
    ).trim();

    const feishuAccountId = String(
      await prompter.text({
        message: "Optional Feishu account id (when multiple Feishu accounts)",
        initialValue: (existing.feishuAccountId as string)?.trim() ?? "",
      }),
    ).trim();

    const next: MoltbotConfig = {
      ...cfg,
      channels: {
        ...cfg.channels,
        sayso: {
          ...existing,
          webhookPath: webhookPath || undefined,
          feishuUserId: feishuUserId || undefined,
          feishuChatId: feishuChatId || undefined,
          feishuAccountId: feishuAccountId || undefined,
          secret: secret || undefined,
        },
      },
    };

    return { cfg: next, accountId: "default" };
  },
};
