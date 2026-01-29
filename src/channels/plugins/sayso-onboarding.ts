import type { MoltbotConfig } from "../../config/config.js";
import type { SaysoConfig } from "../../config/types.sayso.js";
import type { ChannelOnboardingAdapter } from "./onboarding-types.js";
import { formatDocsLink } from "../../terminal/links.js";

const channel = "sayso" as const;

function getSaysoConfig(cfg: MoltbotConfig): SaysoConfig | undefined {
  const sayso = cfg.channels?.sayso as SaysoConfig | undefined;
  if (!sayso || typeof sayso !== "object") return undefined;
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
        `Sayso: ${configured ? "configured (webhook → Feishu)" : "needs webhook path; outbound uses Feishu default"}`,
      ],
      selectionHint: configured ? "configured" : "needs webhook path",
      quickstartScore: configured ? 1 : 5,
    };
  },
  configure: async ({ cfg, prompter }) => {
    await prompter.note(
      [
        "Sayso 仅做入站：配置 webhook 路径接收消息；出站统一走飞书通道默认配置。",
        "请确保 channels.feishu 已配置（App ID / App Secret），以便网关向飞书发回复。",
        "",
        `文档: ${formatDocsLink("/channels/sayso", "docs.molt.bot/channels/sayso")}`,
      ].join("\n"),
      "Sayso 配置",
    );

    let next: MoltbotConfig = { ...cfg };
    const existingSayso = (cfg.channels?.sayso ?? {}) as SaysoConfig;

    if (!isFeishuConfigured(next)) {
      await prompter.note(
        "飞书应用未配置，请填写 App ID 和 App Secret（出站发消息用）。",
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
      await prompter.note("飞书应用已配置 (channels.feishu)，出站将使用默认账号。", "飞书应用");
    }

    const webhookPath = String(
      await prompter.text({
        message: "Webhook 路径（默认 /sayso/events，直接回车使用默认）",
        initialValue: (existingSayso.webhookPath as string)?.trim() || "/sayso/events",
      }),
    ).trim();

    next = {
      ...next,
      channels: {
        ...next.channels,
        sayso: {
          webhookPath: webhookPath || undefined,
        },
      },
    };

    return { cfg: next, accountId: "default" };
  },
};
