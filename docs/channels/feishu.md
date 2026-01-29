# Feishu (飞书) 集成

简单飞书集成：通过事件订阅接收消息，通过开放平台 API 发送回复。

## 配置

在 `channels.feishu` 下配置：

- **appId**：飞书开放平台应用的 App ID
- **appSecret**：飞书开放平台应用的 App Secret
- **webhookPath**（可选）：事件订阅请求 URL 路径，默认 `/feishu/events`

也可使用环境变量（默认账号）：`FEISHU_APP_ID`、`FEISHU_APP_SECRET`。

示例：

```json
{
  "channels": {
    "feishu": {
      "enabled": true,
      "appId": "your_app_id",
      "appSecret": "your_app_secret",
      "webhookPath": "/feishu/events"
    }
  }
}
```

## 飞书后台配置

1. 打开 [飞书开放平台](https://open.feishu.cn)，创建企业自建应用，获取 **App ID** 和 **App Secret**。
2. 在「事件订阅」中配置 **请求网址 URL**：`https://你的网关域名/feishu/events`（如使用 ngrok：`https://xxx.ngrok-free.dev/feishu/events`）。
3. URL 校验：飞书会发送 `type: "url_verification"` 的 POST，本端会返回 `{"challenge": "..."}` 完成校验。
4. 订阅 **接收消息**（`im.message.receive_v1`）等所需事件。事件推送使用 **Schema 2.0**（顶层 `schema`、`header`、`event`，事件类型在 `header.event_type`），本端已支持。
5. 发布应用并启用机器人能力，将机器人加入群聊或发起单聊。

## 发送目标格式

- 群聊/单聊：`chat_id:xxx` 或直接 `xxx`（默认按 chat_id 解析）
- 用户：`open_id:xxx` 或 `user:xxx`

## 与 Slack 的差异

- 仅支持 **HTTP 事件订阅**（无 Socket 模式）
- 鉴权使用 **tenant_access_token**（由 app_id + app_secret 换取）
- 事件统一推送到一个 URL，通过 `type` 区分 url_verification 与 event_callback

## 收不到回复 / 事件不触发

按下面逐项检查：

1. **网关必须在本机运行且已启用飞书**
   - 运行 `pnpm run moltbot gateway run`（或 `moltbot gateway run`），且 `moltbot.json` 里已配置 `channels.feishu`（appId、appSecret）。
   - 只有网关启动并加载飞书渠道后，才会注册 `/feishu/events` 的 HTTP 处理器；否则飞书请求会 404。

2. **飞书事件订阅**
   - 请求网址必须与网关对外地址一致，例如：`https://你的ngrok域名/feishu/events`。
   - 事件列表里必须勾选 **「接收消息」**（`im.message.receive_v1`），否则收不到消息事件。

3. **ngrok 免费版「浏览器警告」页**
   - 飞书服务器请求你的 URL 时，若 ngrok 返回的是「Visit Site」页面（HTML）而不是网关的 JSON，飞书会认为校验/回调失败。
   - 解决：在 ngrok 配置里为该隧道添加请求头 `ngrok-skip-browser-warning: true`（若支持）；或换用 cloudflared、付费 ngrok 等不展示该页的隧道。

4. **事件加密**
   - 若在飞书后台开启了「事件加密」，目前需先关闭加密，或使用未加密的请求网址；后续版本会支持解密。
   - 若日志里出现 `feishu: ignored payload type unknown` 且下一行为 `feishu: payload keys: encrypt`，说明飞书发来的是加密 body，需在飞书开放平台 → 事件订阅 → 关闭「事件加密」。

5. **看网关日志（推荐）**
   - 每次请求进入处理器都会打一条：`feishu: http request POST /feishu/events`。若**请求返回 200 但终端没有任何 feishu 日志**，说明请求没进本网关（例如 ngrok 指到了别的端口/进程），或飞书渠道未启动——启动时应有一条 `feishu http mode listening at /feishu/events`。
   - 发一条消息给机器人后，看是否出现：
     - `feishu: url_verification`：飞书 URL 校验，正常。
     - `feishu: ignored payload type ...` / `feishu: ignored event type ...`：当前请求不是「接收消息」事件，不会触发回复（检查飞书后台是否订阅了 `im.message.receive_v1`）。
     - `feishu: received message from ...`：事件已收到。
     - `feishu: route agent=... sessionKey=... matchedBy=...`：路由到的 Agent 和会话。
     - `feishu: delivered reply to ...`：回复已成功发出。
     - `feishu: dispatch failed: ...` 或 `feishu: failed to send reply to ...`：错误原因。
   - 若**有 received + route 但没有 delivered reply**：多半是 Agent 没有产生回复（检查 `agents.list`、默认模型、AI 接口/API Key 等）。
   - 若有 **dispatch failed** 或 **failed to send reply**：按报错信息排查（如飞书 API 报错、网络等）。
