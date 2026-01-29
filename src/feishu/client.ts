import { getFeishuTenantAccessToken } from "./token.js";

const FEISHU_API_BASE = "https://open.feishu.cn/open-apis";

type SendMessageBody = {
  receive_id: string;
  msg_type: "text";
  content: string;
  root_id?: string;
};

type SendMessageResponse = {
  code?: number;
  msg?: string;
  data?: { message_id?: string };
};

/** Send a text message via Feishu API (uses tenant_access_token from app_id/app_secret). */
export async function feishuSendMessage(params: {
  appId: string;
  appSecret: string;
  receiveIdType: "chat_id" | "open_id" | "user_id";
  receiveId: string;
  text: string;
  rootId?: string;
}): Promise<{ messageId: string }> {
  const token = await getFeishuTenantAccessToken({
    appId: params.appId,
    appSecret: params.appSecret,
  });
  const url = `${FEISHU_API_BASE}/im/v1/messages?receive_id_type=${params.receiveIdType}`;
  const body: SendMessageBody = {
    receive_id: params.receiveId,
    msg_type: "text",
    content: JSON.stringify({ text: params.text }),
  };
  if (params.rootId) body.root_id = params.rootId;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as SendMessageResponse;
  if (data.code !== 0) {
    throw new Error(data.msg ?? `Feishu send failed: ${res.status}`);
  }
  const messageId = data.data?.message_id ?? "";
  return { messageId };
}
