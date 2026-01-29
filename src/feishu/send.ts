import { loadConfig } from "../config/config.js";
import type { FeishuTokenSource } from "./accounts.js";
import { resolveFeishuAccount } from "./accounts.js";
import { feishuSendMessage } from "./client.js";
import { parseFeishuTarget, resolveFeishuReceiveIdType } from "./targets.js";

export type FeishuSendResult = {
  messageId: string;
  receiveId: string;
};

type FeishuSendOpts = {
  accountId?: string;
  rootId?: string;
};

export async function sendMessageFeishu(
  to: string,
  message: string,
  opts: FeishuSendOpts = {},
): Promise<FeishuSendResult> {
  const trimmedMessage = message?.trim() ?? "";
  if (!trimmedMessage) {
    throw new Error("Feishu send requires non-empty text");
  }
  const cfg = loadConfig();
  const account = resolveFeishuAccount({
    cfg,
    accountId: opts.accountId,
  });
  if (!account.appId || !account.appSecret) {
    throw new Error(
      `Feishu app credentials missing for account "${account.accountId}" (set channels.feishu.appId/appSecret or FEISHU_APP_ID/FEISHU_APP_SECRET).`,
    );
  }
  const target = parseFeishuTarget(to, { defaultKind: "chat" });
  if (!target) {
    throw new Error("Recipient is required for Feishu sends");
  }
  const receiveIdType = resolveFeishuReceiveIdType(target);
  const { messageId } = await feishuSendMessage({
    appId: account.appId,
    appSecret: account.appSecret,
    receiveIdType,
    receiveId: target.id,
    text: trimmedMessage,
    rootId: opts.rootId,
  });
  return {
    messageId,
    receiveId: target.id,
  };
}
