/** Feishu event subscription: URL verification request. */
export type FeishuUrlVerificationPayload = {
  type: "url_verification";
  challenge: string;
};

/** Feishu event: im.message.receive_v1 (message content). */
export type FeishuMessageContent = {
  text?: string;
};

/** Feishu event: im.message.receive_v1 sender. */
export type FeishuMessageSender = {
  sender_id?: { user_id?: string; open_id?: string };
  sender_type?: string;
};

/** Feishu event: im.message.receive_v1. */
export type FeishuImMessageReceiveEvent = {
  type: "im.message.receive_v1";
  message?: {
    message_id?: string;
    chat_id?: string;
    chat_type?: "p2p" | "group";
    content?: string; // JSON string of FeishuMessageContent
    create_time?: string;
  };
  sender?: FeishuMessageSender;
};

/** Feishu event_callback wrapper (legacy). */
export type FeishuEventCallbackPayload = {
  type: "event_callback";
  event?: FeishuImMessageReceiveEvent & { type: string };
  uuid?: string;
  ts?: string;
  token?: string;
};

/** Feishu Schema 2.0: event type in header.event_type, body in event. */
export type FeishuSchema2Payload = {
  schema?: string;
  header?: {
    event_id?: string;
    event_type?: string;
    create_time?: string;
    token?: string;
    app_id?: string;
    tenant_key?: string;
  };
  event?: {
    sender?: FeishuMessageSender;
    message?: FeishuImMessageReceiveEvent["message"];
  };
};

export type FeishuWebhookPayload =
  | FeishuUrlVerificationPayload
  | FeishuEventCallbackPayload
  | FeishuSchema2Payload;
