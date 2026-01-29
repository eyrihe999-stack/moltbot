import type { MoltbotConfig } from "../../config/config.js";
import type { SaysoConfig } from "../../config/types.sayso.js";
import type { ChannelOnboardingAdapter } from "./onboarding-types.js";
import { formatDocsLink } from "../../terminal/links.js";

const channel = "sayso" as const;

function getSaysoConfig(cfg: MoltbotConfig): SaysoConfig | undefined {
  const sayso = cfg.channels?.sayso as SaysoConfig | undefined;
  if (!sayso || typeof sayso !== "object") return undefined;
  const userId = (sayso.feishuUserId as string)?.trim();
  const chatId = (sayso.feishuChatId as string)?.trim();
  if (!userId && !chatId) return undefined;
  return sayso;
}

function isFeishuConfigured(cfg: MoltbotConfig): boolean {
  const feishu = cfg.channels?.feishu as { appId?: string; appSecret?: string } | undefined;
  return Boolean(
    feishu &&
    typeof feishu === "object" &&
    (feishu.appId as string)?.trim() &&
    (feishu.appSecret as string)?.trim(),
  );
}

export const saysoOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg }) => {
    const configured = Boolean(getSaysoConfig(cfg));
    return {
      channel,
      configured,
      statusLines: [
        `Sayso: ${configured ? "configured (webhook → Feishu)" : "needs Feishu user_id / chat_id + app"}`,
      ],
      selectionHint: configured ? "configured" : "needs Feishu target + app",
      quickstartScore: configured ? 1 : 5,
    };
  },
  configure: async ({ cfg, prompter }) => {
    await prompter.note(
      [
        "Sayso 发送文字到网关，网关处理后转发到飞书。只需配置飞书目标与应用信息。",
        "请至少填写 Feishu user_id（私聊）或 chat_id（群聊）之一，以及飞书应用的 App ID / App Secret。",
        "",
        `文档: ${formatDocsLink("/channels/sayso", "docs.molt.bot/channels/sayso")}`,
      ].join("\n"),
      "Sayso 配置",
    );

    let next: MoltbotConfig = { ...cfg };
    const existingSayso = (cfg.channels?.sayso ?? {}) as SaysoConfig;

    if (!isFeishuConfigured(next)) {
      await prompter.note(
        "飞书应用未配置，请填写 App ID 和 App Secret（用于网关向飞书发消息）。",
        "飞书应用",
      );
      const appId = String(
        await prompter.text({
          message: "Feishu App ID",
          initialValue:
            (next.channels?.feishu as { appId?: string } | undefined)?.appId?.trim() ?? "",
        }),
      ).trim();
      const appSecret = String(
        await prompter.text({
          message: "Feishu App Secret",
          initialValue:
            (next.channels?.feishu as { appSecret?: string } | undefined)?.appSecret?.trim() ?? "",
        }),
      ).trim();
      if (appId && appSecret) {
        next = {
          ...next,
          channels: {
            ...next.channels,
            feishu: {
              ...(next.channels?.feishu as object),
              appId,
              appSecret,
            },
          },
        };
      }
    } else {
      await prompter.note("飞书应用已配置 (channels.feishu)，将用于转发到飞书。", "飞书应用");
    }

    const feishuUserId = String(
      await prompter.text({
        message: "Feishu user_id（私聊；不填则仅用 chat_id）",
        initialValue: (existingSayso.feishuUserId as string)?.trim() ?? "",
      }),
    ).trim();

    const feishuChatId = String(
      await prompter.text({
        message: "Feishu chat_id（群聊；不填则仅用 user_id）",
        initialValue: (existingSayso.feishuChatId as string)?.trim() ?? "",
      }),
    ).trim();

    if (!feishuUserId && !feishuChatId) {
      await prompter.note("至少填写 Feishu user_id 或 chat_id 之一。", "Sayso");
      return { cfg: next, accountId: "default" };
    }

    const webhookPath = String(
      await prompter.text({
        message: "Webhook 路径（默认 /sayso/webhook，直接回车跳过）",
        initialValue: (existingSayso.webhookPath as string)?.trim() || "/sayso/webhook",
      }),
    ).trim();

    const secret = String(
      await prompter.text({
        message: "可选：Webhook 校验密钥（X-Sayso-Secret，不设则留空）",
        initialValue: (existingSayso.secret as string)?.trim() ?? "",
      }),
    ).trim();

    next = {
      ...next,
      channels: {
        ...next.channels,
        sayso: {
          ...existingSayso,
          webhookPath: webhookPath || undefined,
          feishuUserId: feishuUserId || undefined,
          feishuChatId: feishuChatId || undefined,
          feishuAccountId: (existingSayso.feishuAccountId as string)?.trim() || undefined,
          secret: secret || undefined,
        },
      },
    };

    return { cfg: next, accountId: "default" };
  },
};
