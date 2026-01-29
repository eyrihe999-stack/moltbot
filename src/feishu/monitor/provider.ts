import type { IncomingMessage, ServerResponse } from "node:http";

import { dispatchInboundMessage } from "../../auto-reply/dispatch.js";
import { finalizeInboundContext } from "../../auto-reply/reply/inbound-context.js";
import { createReplyDispatcher } from "../../auto-reply/reply/reply-dispatcher.js";
import { loadConfig } from "../../config/config.js";
import { readJsonBody } from "../../gateway/hooks.js";
import { resolveAgentRoute } from "../../routing/resolve-route.js";
import type { RuntimeEnv } from "../../runtime.js";

import { resolveFeishuAccount } from "../accounts.js";
import { normalizeFeishuWebhookPath, registerFeishuHttpHandler } from "../http/index.js";
import { sendMessageFeishu } from "../send.js";
import type {
  FeishuEventCallbackPayload,
  FeishuImMessageReceiveEvent,
  FeishuSchema2Payload,
  FeishuUrlVerificationPayload,
  FeishuWebhookPayload,
} from "../types.js";

const FEISHU_BODY_MAX_BYTES = 512 * 1024;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function parseMessageContent(contentJson?: string): string {
  if (!contentJson || typeof contentJson !== "string") return "";
  try {
    const parsed = JSON.parse(contentJson) as { text?: string };
    return typeof parsed?.text === "string" ? parsed.text : "";
  } catch {
    return "";
  }
}

export type MonitorFeishuOpts = {
  config?: ReturnType<typeof loadConfig>;
  accountId?: string | null;
  appId?: string;
  appSecret?: string;
  webhookPath?: string | null;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
};

export async function monitorFeishuProvider(opts: MonitorFeishuOpts = {}): Promise<void> {
  const cfg = opts.config ?? loadConfig();
  const account = resolveFeishuAccount({ cfg, accountId: opts.accountId });

  if (!account.appId || !account.appSecret) {
    throw new Error(
      `Feishu app credentials missing for account "${account.accountId}" (set channels.feishu.appId/appSecret or FEISHU_APP_ID/FEISHU_APP_SECRET).`,
    );
  }

  const webhookPath = normalizeFeishuWebhookPath(opts.webhookPath ?? account.webhookPath);
  const runtime: RuntimeEnv = opts.runtime ?? {
    log: console.log,
    error: console.error,
    exit: (code: number): never => {
      throw new Error(`exit ${code}`);
    },
  };

  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    const path = (req.url ?? "/").split("?")[0];
    runtime.log?.(`feishu: http request ${req.method} ${path}`);

    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Allow", "POST");
      res.end("Method Not Allowed");
      return;
    }

    const bodyResult = await readJsonBody(req, FEISHU_BODY_MAX_BYTES);
    if (!bodyResult.ok) {
      res.statusCode = bodyResult.error === "payload too large" ? 413 : 400;
      sendJson(res, res.statusCode, { error: bodyResult.error });
      return;
    }

    const payload = bodyResult.value as FeishuWebhookPayload;
    const raw = payload as Record<string, unknown> | undefined;

    // URL 校验（含旧版 type + challenge）
    if (raw?.type === "url_verification") {
      runtime.log?.("feishu: url_verification");
      const challenge = (payload as FeishuUrlVerificationPayload).challenge;
      sendJson(res, 200, { challenge: challenge ?? "" });
      return;
    }

    // Schema 2.0：schema + header.event_type + event
    if (raw?.schema === "2.0" && raw?.header != null && typeof raw.header === "object") {
      const header = raw.header as FeishuSchema2Payload["header"];
      const eventType = header?.event_type ?? "unknown";
      if (eventType !== "im.message.receive_v1") {
        runtime.log?.(`feishu: ignored event_type ${eventType}`);
        sendJson(res, 200, {});
        return;
      }
      const schema2Event = (raw.event ??
        (payload as FeishuSchema2Payload).event) as FeishuSchema2Payload["event"];
      if (!schema2Event?.message?.message_id || !schema2Event.message.chat_id) {
        runtime.log?.("feishu: ignored event (missing message_id or chat_id)");
        sendJson(res, 200, {});
        return;
      }
      sendJson(res, 200, {});
      void handleMessageEvent(
        schema2Event.message,
        schema2Event.sender,
        account.accountId,
        cfg,
        runtime,
      );
      return;
    }

    // 旧版 event_callback：payload.type + event.type
    if (raw?.type === "event_callback") {
      const eventPayload = payload as FeishuEventCallbackPayload;
      const event = eventPayload.event;
      if (!event || event.type !== "im.message.receive_v1") {
        const eventType = event?.type ?? "unknown";
        runtime.log?.(`feishu: ignored event type ${eventType}`);
        sendJson(res, 200, {});
        return;
      }
      sendJson(res, 200, {});
      const imEvent = event as FeishuImMessageReceiveEvent;
      void handleMessageEvent(imEvent.message, imEvent.sender, account.accountId, cfg, runtime);
      return;
    }

    const payloadType = raw?.type ?? "unknown";
    runtime.log?.(`feishu: ignored payload type ${payloadType}`);
    if (payload != null && typeof payload === "object") {
      const keys = Object.keys(payload).join(", ") || "(empty)";
      runtime.log?.(`feishu: payload keys: ${keys}`);
    }
    sendJson(res, 200, {});
  };

  async function handleMessageEvent(
    message: FeishuImMessageReceiveEvent["message"],
    sender: FeishuImMessageReceiveEvent["sender"],
    accountId: string,
    cfg: ReturnType<typeof loadConfig>,
    runtime: RuntimeEnv,
  ): Promise<void> {
    if (!message?.message_id || !message.chat_id) {
      runtime.log?.("feishu: ignored event (missing message_id or chat_id)");
      return;
    }

    const text = parseMessageContent(message.content);
    if (!text.trim()) {
      runtime.log?.("feishu: ignored event (empty message content)");
      return;
    }

    runtime.log?.(
      `feishu: received message from ${sender?.sender_id?.open_id ?? sender?.sender_id?.user_id ?? "?"} in ${message.chat_id}: ${text.slice(0, 80)}${text.length > 80 ? "…" : ""}`,
    );

    const chatType = message.chat_type === "p2p" ? "direct" : "channel";
    const senderId = sender?.sender_id?.open_id ?? sender?.sender_id?.user_id ?? "unknown";
    const route = resolveAgentRoute({
      cfg,
      channel: "feishu",
      accountId,
      peer: { kind: chatType === "direct" ? "dm" : "channel", id: message.chat_id },
    });
    runtime.log?.(
      `feishu: route agent=${route.agentId} sessionKey=${route.sessionKey.slice(0, 24)}… matchedBy=${route.matchedBy}`,
    );

    const ctxPayload = finalizeInboundContext({
      Body: text,
      RawBody: text,
      CommandBody: text,
      From: `feishu:${senderId}`,
      To: message.chat_id,
      SessionKey: route.sessionKey,
      AccountId: accountId,
      ChatType: chatType,
      ConversationLabel: message.chat_id,
      SenderId: senderId,
      Provider: "feishu",
      Surface: "feishu",
      MessageSid: message.message_id,
      OriginatingChannel: "feishu",
      OriginatingTo: message.chat_id,
      CommandAuthorized: true,
      Timestamp: message.create_time ? parseInt(message.create_time, 10) * 1000 : undefined,
    });

    const replyTarget = ctxPayload.To ?? message.chat_id;
    const dispatcher = createReplyDispatcher({
      deliver: async (payload) => {
        const t = payload.text?.trim() ?? "";
        if (!t) return;
        try {
          await sendMessageFeishu(replyTarget, t, {
            accountId,
            rootId: undefined,
          });
          runtime.log?.(`feishu: delivered reply to ${replyTarget}`);
        } catch (err) {
          runtime.error?.(`feishu: failed to send reply to ${replyTarget}: ${String(err)}`);
        }
      },
    });

    try {
      await dispatchInboundMessage({
        ctx: ctxPayload,
        cfg,
        dispatcher,
      });
    } catch (err) {
      runtime.error?.(`feishu: dispatch failed: ${String(err)}`);
    }
  }

  const unregister = registerFeishuHttpHandler({
    path: webhookPath,
    handler,
    log: runtime.log,
    accountId: account.accountId,
  });

  runtime.log?.(`feishu http mode listening at ${webhookPath}`);

  opts.abortSignal?.addEventListener(
    "abort",
    () => {
      unregister();
    },
    { once: true },
  );

  await new Promise<void>((resolve) => {
    opts.abortSignal?.addEventListener("abort", () => resolve(), { once: true });
    if (opts.abortSignal?.aborted) resolve();
  });
}
