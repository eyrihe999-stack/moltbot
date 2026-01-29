export type FeishuReceiveIdType = "chat_id" | "open_id" | "user_id";

export type FeishuTarget = {
  kind: "chat" | "user";
  id: string;
  raw: string;
  /** When set, use this for API receive_id_type; otherwise derived from kind. */
  receiveIdType?: FeishuReceiveIdType;
};

function buildTarget(
  kind: "chat" | "user",
  id: string,
  raw: string,
  receiveIdType?: FeishuReceiveIdType,
): FeishuTarget {
  return { kind, id, raw, receiveIdType };
}

/** Parse Feishu recipient (chat_id, open_id, or user_id). For user DMs, use open_id:xxx or user_id:xxx. */
export function parseFeishuTarget(
  raw: string,
  options: { defaultKind?: "chat" | "user" } = {},
): FeishuTarget | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("chat_id:") || trimmed.startsWith("chat:")) {
    const id = trimmed.replace(/^(chat_id:|chat:)/i, "").trim();
    return id ? buildTarget("chat", id, trimmed, "chat_id") : undefined;
  }
  if (trimmed.startsWith("user_id:")) {
    const id = trimmed.replace(/^user_id:/i, "").trim();
    return id ? buildTarget("user", id, trimmed, "user_id") : undefined;
  }
  if (
    trimmed.startsWith("open_id:") ||
    trimmed.startsWith("user:") ||
    trimmed.startsWith("feishu:")
  ) {
    const id = trimmed.replace(/^(open_id:|user:|feishu:)/i, "").trim();
    return id ? buildTarget("user", id, trimmed, "open_id") : undefined;
  }
  if (options.defaultKind) {
    const type = options.defaultKind === "user" ? "open_id" : "chat_id";
    return buildTarget(options.defaultKind, trimmed, trimmed, type);
  }
  // Bare ID: infer from Feishu format (oc_ = chat_id, ou_ = open_id, else = user_id for user DM).
  if (trimmed.startsWith("oc_")) return buildTarget("chat", trimmed, trimmed, "chat_id");
  if (trimmed.startsWith("ou_")) return buildTarget("user", trimmed, trimmed, "open_id");
  return buildTarget("user", trimmed, trimmed, "user_id");
}

export function resolveFeishuReceiveIdType(target: FeishuTarget): FeishuReceiveIdType {
  if (target.receiveIdType) return target.receiveIdType;
  return target.kind === "user" ? "open_id" : "chat_id";
}
