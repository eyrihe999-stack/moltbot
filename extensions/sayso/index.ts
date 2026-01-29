import type { MoltbotPluginApi } from "clawdbot/plugin-sdk";
import { emptyPluginConfigSchema } from "clawdbot/plugin-sdk";

import { saysoPlugin } from "./src/channel.js";

const plugin = {
  id: "sayso",
  name: "Sayso",
  description: "Sayso: receive text from webhook and forward to Feishu",
  configSchema: emptyPluginConfigSchema(),
  register(api: MoltbotPluginApi) {
    api.registerChannel({ plugin: saysoPlugin });
  },
};

export default plugin;
