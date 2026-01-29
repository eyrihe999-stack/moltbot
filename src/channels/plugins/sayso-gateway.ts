import type { IncomingMessage, ServerResponse } from "node:http";

import { dispatchInboundMessage } from "../../auto-reply/dispatch.js";
import { finalizeInboundContext } from "../../auto-reply/reply/inbound-context.js";
import { createReplyDispatcher } from "../../auto-reply/reply/reply-dispatcher.js";
import { loadConfig } from "../../config/config.js";
import { readJsonBody } from "../../gateway/hooks.js";
import { resolveAgentRoute } from "../../routing/resolve-route.js";
import { defaultRuntime } from "../../runtime.js";
import { sendMessageFeishu } from "../../feishu/send.js";
import { registerFeishuHttpHandler } from "../../feishu/http/index.js";
import type { MoltbotConfig } from "../../config/config.js";
import type { SaysoConfig } from "../../config/types.sayso.js";
import type { ChannelGatewayContext } from "./types.adapters.js";

/** Account shape needed for sayso webhook (avoids circular dependency on sayso-plugin). */
type SaysoGatewayAccount = {
  accountId: string;
  webhookPath?: string;
  feishuUserId?: string;
  feishuChatId?: string;
  feishuAccountId?: string;
};

const SAYSO_BODY_MAX_BYTES = 512 * 1024;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

const INVALID_ID_VALUES = new Set(["undefined", "null", ""]);

function isValidFeishuId(value: string | undefined): value is string {
  const s = (value ?? "").trim();
  return s.length > 0 && !INVALID_ID_VALUES.has(s.toLowerCase());
}

/**
 * Build Feishu target string and set receive_id_type by prefix:
 * ou_ -> open_id, else -> user_id. Pass through if already has user_id:/open_id:.
 * Exported for Sayso directory (target resolver).
 */
export function toUserTargetString(userId: string): string {
  const s = userId.trim();
  if (/^(user_id|open_id):/i.test(s)) return s;
  if (s.startsWith("ou_")) return `open_id:${s}`;
  return `user_id:${s}`;
}

/**
 * Build Feishu target string and set receive_id_type to chat_id.
 * Pass through if already has chat_id:/chat:; else add chat_id: prefix.
 * Exported for Sayso directory (target resolver).
 */
export function toChatTargetString(chatId: string): string {
  const s = chatId.trim();
  if (/^(chat_id|chat):/i.test(s)) return s;
  if (s.startsWith("oc_")) return `chat_id:${s}`;
  return `chat_id:${s}`;
}

/** Collect Feishu target strings from request body user_id/userId and chat_id/chatId. */
function collectTargetsFromBody(raw: Record<string, unknown> | undefined): string[] {
  const targets: string[] = [];
  const userId =
    (typeof raw?.user_id === "string" ? raw.user_id : undefined) ??
    (typeof raw?.userId === "string" ? raw.userId : undefined);
  const chatId =
    (typeof raw?.chat_id === "string" ? raw.chat_id : undefined) ??
    (typeof raw?.chatId === "string" ? raw.chatId : undefined);
  if (isValidFeishuId(userId)) targets.push(toUserTargetString(userId));
  if (isValidFeishuId(chatId)) targets.push(toChatTargetString(chatId));
  return targets;
}

/** Normalize Feishu target to canonical form for allowlist comparison. Exported for outbound-policy. */
export function normalizeFeishuTargetForAllowlist(t: string): string {
  const s = t.trim();
  if (/^(open_id|user_id|chat_id):/i.test(s)) return s.toLowerCase();
  if (/^ou_/i.test(s)) return `open_id:${s}`;
  if (/^oc_/i.test(s)) return `chat_id:${s}`;
  return `user_id:${s}`.toLowerCase();
}

/** Filter targets to only those in allowlist (when set). Allowlist entries can be with or without prefix. */
function filterTargetsByAllowlist(targets: string[], allowlist: string[]): string[] {
  if (allowlist.length === 0) return targets;
  const set = new Set(allowlist.map(normalizeFeishuTargetForAllowlist));
  return targets.filter((to) => set.has(normalizeFeishuTargetForAllowlist(to)));
}

function createSaysoWebhookHandler(
  ctx: ChannelGatewayContext<SaysoGatewayAccount>,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const { cfg, accountId, account, runtime } = ctx;
  const feishuAccountId = (account.feishuAccountId as string)?.trim() || undefined;

  return async (req: IncomingMessage, res: ServerResponse) => {
    const path = (req.url ?? "/").split("?")[0];
    runtime.log?.(`sayso: http request ${req.method} ${path}`);

    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Allow", "POST");
      res.end("Method Not Allowed");
      return;
    }

    const bodyResult = await readJsonBody(req, SAYSO_BODY_MAX_BYTES);
    if (!bodyResult.ok) {
      res.statusCode = bodyResult.error === "payload too large" ? 413 : 400;
      sendJson(res, res.statusCode, { error: bodyResult.error });
      return;
    }

    const raw = bodyResult.value as Record<string, unknown> | undefined;
    runtime.log?.(`sayso: request body\n${JSON.stringify(raw, null, 2)}`);

    // 飞书事件订阅 URL 校验：必须原样返回 challenge，否则飞书报「Challenge code没有返回」
    if (raw?.type === "url_verification") {
      const challenge = typeof raw.challenge === "string" ? raw.challenge : "";
      runtime.log?.("sayso: feishu url_verification");
      sendJson(res, 200, { challenge });
      return;
    }

    const text = typeof raw?.text === "string" ? raw.text.trim() : "";
    if (!text) {
      sendJson(res, 400, { error: "missing or empty text" });
      return;
    }

    const targets = collectTargetsFromBody(raw);
    if (targets.length === 0) {
      runtime.log?.(`sayso: 找不到id，请求体中未包含有效的 user_id 或 chat_id`);
      sendJson(res, 200, { ok: false, error: "missing user_id or chat_id in request body" });
      return;
    }

    runtime.log?.(
      `sayso: received text (${text.length} chars), replying to Feishu [${targets.join(", ")}]`,
    );

    const peerId = targets[0];
    const route = resolveAgentRoute({
      cfg,
      channel: "sayso",
      accountId,
      peer: { kind: "dm", id: peerId },
    });

    const ctxPayload = finalizeInboundContext({
      Body: text,
      RawBody: text,
      CommandBody: text,
      From: "sayso:webhook",
      To: peerId,
      SessionKey: route.sessionKey,
      AccountId: accountId,
      ChatType: "direct",
      ConversationLabel: peerId,
      SenderId: "sayso:webhook",
      Provider: "sayso",
      Surface: "sayso",
      MessageSid: "",
      OriginatingChannel: "sayso",
      OriginatingTo: peerId,
      CommandAuthorized: true,
    });

    const deliveredChunks: string[] = [];
    const dispatcher = createReplyDispatcher({
      deliver: async (payload) => {
        const t = payload.text?.trim() ?? "";
        if (t) deliveredChunks.push(t);
      },
    });

    sendJson(res, 200, { ok: true });
    try {
      await dispatchInboundMessage({
        ctx: ctxPayload,
        cfg,
        dispatcher,
      });
    } catch (err) {
      runtime.error?.(`sayso: dispatch failed: ${String(err)}`);
      return;
    }

    const fullReply = deliveredChunks.join("").trim();
    if (!fullReply) return;

    const sayso = cfg.channels?.sayso as SaysoConfig | undefined;
    const sendToFeishu = sayso?.sendToFeishu;
    if (sendToFeishu?.enabled !== true) {
      runtime.log?.("sayso: sendToFeishu.enabled is not true; skipping Feishu delivery");
      return;
    }

    const allowedTargets =
      sendToFeishu.targets && sendToFeishu.targets.length > 0
        ? filterTargetsByAllowlist(targets, sendToFeishu.targets)
        : targets;
    if (allowedTargets.length === 0) {
      runtime.log?.(
        "sayso: no targets in sendToFeishu.targets allowlist; skipping Feishu delivery",
      );
      return;
    }

    await Promise.all(
      allowedTargets.map(async (to) => {
        try {
          await sendMessageFeishu(to, fullReply, {
            accountId: feishuAccountId,
            rootId: undefined,
          });
          runtime.log?.(`sayso: delivered reply to ${to}`);
        } catch (err) {
          runtime.error?.(`sayso: failed to send reply to ${to}: ${String(err)}`);
        }
      }),
    );
  };
}

/** Default webhook path for Sayso (matches startup log). */
export const DEFAULT_SAYSO_WEBHOOK_PATH = "/sayso/events";

/**
 * Handler that loads config at request time and runs sayso webhook logic.
 * Used to register /sayso/events at server init so the route exists even before channel start.
 */
export function createSaysoStandaloneHandler(
  loadConfig: () => MoltbotConfig,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const cfg = loadConfig();
    const sayso = cfg.channels?.sayso as SaysoConfig | undefined;
    const account: SaysoGatewayAccount = {
      accountId: "default",
      webhookPath: sayso?.webhookPath,
      feishuUserId: sayso?.feishuUserId,
      feishuChatId: sayso?.feishuChatId,
      feishuAccountId: sayso?.feishuAccountId,
    };
    const ctx: ChannelGatewayContext<SaysoGatewayAccount> = {
      cfg,
      accountId: "default",
      account,
      runtime: defaultRuntime,
      abortSignal: new AbortController().signal,
      log: undefined,
      getStatus: () => ({ accountId: "default" }),
      setStatus: () => {},
    };
    const handler = createSaysoWebhookHandler(ctx);
    return handler(req, res);
  };
}

export function startSaysoGatewayAccount(
  ctx: ChannelGatewayContext<SaysoGatewayAccount>,
): Promise<void> {
  const webhookPath = (ctx.account.webhookPath as string)?.trim() || DEFAULT_SAYSO_WEBHOOK_PATH;

  const handler = createSaysoWebhookHandler(ctx);
  const unregister = registerFeishuHttpHandler({
    path: webhookPath,
    handler,
    log: ctx.runtime.log,
    accountId: ctx.accountId,
  });

  ctx.runtime.log?.(
    `sayso: http mode listening at ${webhookPath.startsWith("/") ? webhookPath : `/${webhookPath}`}`,
  );

  ctx.abortSignal?.addEventListener(
    "abort",
    () => {
      unregister();
    },
    { once: true },
  );

  return new Promise<void>((resolve) => {
    ctx.abortSignal?.addEventListener("abort", () => resolve(), { once: true });
    if (ctx.abortSignal?.aborted) resolve();
  });
}
