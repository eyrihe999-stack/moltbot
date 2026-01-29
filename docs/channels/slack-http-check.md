# 检查 Slack HTTP 模式与 webhook 注册

要确认 Slack 使用 HTTP 模式且网关已加载 Slack provider、已注册 `/slack/events`，可按下面步骤检查。

## 1. 检查配置：mode 与 signingSecret

### 配置项位置

- **全局**：`channels.slack.mode`、`channels.slack.signingSecret`、`channels.slack.webhookPath`
- **按账号**：`channels.slack.accounts.<accountId>.mode`、`channels.slack.accounts.<accountId>.signingSecret`、`channels.slack.accounts.<accountId>.webhookPath`

HTTP 模式要求：

- `mode` 为 `"http"`（默认是 `"socket"`）
- 必须配置 `signingSecret`（Slack 后台 App 的 Signing Secret）
- `webhookPath` 默认是 `"/slack/events"`，可改

### 如何查看配置

**方式 A：直接看配置文件**

配置文件路径（默认）：

- `~/.clawdbot/moltbot.json` 或
- `~/.moltbot/moltbot.json`

也可通过环境变量指定：`MOLTBOT_CONFIG_PATH` 或 `CLAWDBOT_CONFIG_PATH`。

在配置里确认是否有类似内容：

```json
{
  "channels": {
    "slack": {
      "enabled": true,
      "mode": "http",
      "signingSecret": "你的 Signing Secret",
      "webhookPath": "/slack/events",
      "botToken": "xoxb-...",
      "accounts": {
        "default": {
          "mode": "http",
          "signingSecret": "可选，不写则用上面的"
        }
      }
    }
  }
}
```

- 若没有写 `mode`，则默认为 `"socket"`，**不会**走 HTTP webhook。
- 若 `mode` 为 `"http"` 但没配 `signingSecret`，加载配置时会报错。

**方式 B：通过网关（若已连接）**

若网关已启动且可连接，可通过 WebSocket 调用 `config.get` 拿到当前配置，再在返回的 `channels.slack` 里看 `mode`、`signingSecret`、`webhookPath`。

---

## 2. 检查网关是否已加载 Slack 并注册了 webhook

### 看启动日志

网关启动时会按配置启动各 channel（包括 Slack）。Slack 的 monitor 在 **HTTP 模式** 下会：

1. 创建 Bolt 的 `HTTPReceiver`
2. 调用 `registerSlackHttpHandler` 把 webhook 路径（默认 `/slack/events`）注册到网关的 HTTP 路由
3. 打出一条日志

**HTTP 模式** 会看到类似：

```text
slack http mode listening at /slack/events
```

**Socket 模式** 会看到类似：

```text
slack socket mode connected
```

若看到的是 **“slack socket mode connected”**，说明当前是 Socket 模式，**没有**注册 HTTP webhook，`/slack/events` 不会被 Slack 处理（可能 404 或走到别的 handler）。

**如何看日志**：

- 直接跑网关：在启动网关的终端里看输出（如 `pnpm moltbot gateway run` 或 `moltbot gateway run`）
- macOS 菜单栏 App：用 `./scripts/clawlog.sh` 等看 Moltbot 子系统日志（见 CLAUDE.md）

### 确认 Slack 是否被跳过

若设置了：

- `CLAWDBOT_SKIP_CHANNELS=1` 或
- `CLAWDBOT_SKIP_PROVIDERS=1`

则不会启动任何 channel（包括 Slack），自然也不会注册 `/slack/events`。需保证这两个环境变量未设置或未生效。

---

## 3. 用 status 看 channel 状态（可选）

```bash
pnpm moltbot status
# 或
moltbot status
```

可加 `--all`、`--json` 等。输出里会包含各 channel（含 Slack）的启用、配置、运行状态等。若 Slack 未启用或未配置，这里也能看出；部分输出可能包含 `mode` 信息（视插件实现而定）。

---

## 4. 小结检查清单

| 检查项 | 做法 |
|--------|------|
| Slack 为 HTTP 模式 | 配置里 `channels.slack.mode` 或对应 account 的 `mode` 为 `"http"` |
| 已配 signingSecret | 配置里 `channels.slack.signingSecret` 或 account 的 `signingSecret` 已填 |
| webhook 路径 | 默认 `/slack/events`，对应 `webhookPath`；Slack 后台 Request URL 要一致 |
| 网关已加载 Slack | 启动日志里出现 **“slack http mode listening at /slack/events”**（或你配置的 path） |
| 未跳过 channel | 未设置 `CLAWDBOT_SKIP_CHANNELS` / `CLAWDBOT_SKIP_PROVIDERS` |

若以上都满足，本机用 POST 请求（例如之前的 `curl -X POST ...`）访问 `http://localhost:<port>/slack/events` 应能拿到 200 和 challenge；若仍 405，多半是请求方法不是 POST。
