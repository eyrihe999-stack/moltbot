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
  /**
   * Allow Sayso → Feishu cross-context sending and optional target allowlist.
   * When enabled, webhook replies are sent to Feishu; when targets is set, only those receive.
   */
  sendToFeishu?: {
    /** Allow sending to Feishu from Sayso (default: false). */
    enabled?: boolean;
    /** Allowed Feishu target(s): open_id:xx, user_id:xx, chat_id:xx. When set, only these receive. */
    targets?: string[];
  };
};
