const FEISHU_TOKEN_URL = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal";

type TokenResponse = {
  code?: number;
  msg?: string;
  tenant_access_token?: string;
  expire?: number;
};

/** Get Feishu tenant_access_token (cached by caller if needed). */
export async function getFeishuTenantAccessToken(params: {
  appId: string;
  appSecret: string;
}): Promise<string> {
  const { appId, appSecret } = params;
  const res = await fetch(FEISHU_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const data = (await res.json()) as TokenResponse;
  if (data.code !== 0 || !data.tenant_access_token) {
    throw new Error(data.msg ?? `Feishu token failed: ${res.status}`);
  }
  return data.tenant_access_token;
}
