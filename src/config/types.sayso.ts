/** Sayso integration: receive text from Sayso webhook and forward to Feishu. */
export type SaysoConfig = {
  /** Webhook path for Sayso POST (default: /sayso/webhook). */
  webhookPath?: string;
  /** Feishu user_id for DM (open_id or user_id). Use when sending to a user. */
  feishuUserId?: string;
  /** Feishu chat_id for group chat. Use when sending to a chat. */
  feishuChatId?: string;
  /** Feishu account id when multiple Feishu accounts exist. */
  feishuAccountId?: string;
  /** Optional secret for webhook verification (e.g. X-Sayso-Secret header). */
  secret?: string;
};
