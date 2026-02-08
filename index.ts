import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { registerLogsViewer } from "./src/plugin.js";

const plugin = {
  id: "logs-viewer",
  name: "Logs Viewer",
  description: "Web UI for viewing OpenClaw LLM payload logs and raw streams",
  register(api: OpenClawPluginApi) {
    registerLogsViewer(api);
  },
};

export default plugin;
