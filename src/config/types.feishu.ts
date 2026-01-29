/** Feishu (飞书/Lark) channel configuration. */
export type FeishuAccountConfig = {
  /** Optional display name. */
  name?: string;
  /** App ID from Feishu open platform. */
  appId?: string;
  /** App Secret from Feishu open platform. */
  appSecret?: string;
  /** Encrypt key (optional, for encrypted event payloads). */
  encryptKey?: string;
  /** Verification token (optional, for event signature). */
  verificationToken?: string;
  /** Webhook path (default: /feishu/events). */
  webhookPath?: string;
  /** If false, do not start this account. Default: true. */
  enabled?: boolean;
};

export type FeishuConfig = FeishuAccountConfig & {
  /** Per-account overrides. */
  accounts?: Record<string, FeishuAccountConfig | undefined>;
};
