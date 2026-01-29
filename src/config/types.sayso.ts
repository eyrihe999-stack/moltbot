/** Sayso integration: receive messages via webhook; outbound uses Feishu channel default. */
export type SaysoConfig = {
  /** Webhook path for Sayso POST (default: /sayso/events). */
  webhookPath?: string;
};
