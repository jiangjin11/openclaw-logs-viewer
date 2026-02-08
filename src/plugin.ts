import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { createLogsViewerRoute, createLogsApiRoute, createLogsClearRoute } from "./logs-viewer.js";

export function registerLogsViewer(api: OpenClawPluginApi) {
  api.registerHttpRoute(createLogsViewerRoute());
  api.registerHttpRoute(createLogsApiRoute());
  api.registerHttpRoute(createLogsClearRoute());

  api.logger.info("[logs-viewer] Plugin registered: 3 http routes");
  api.logger.info("[logs-viewer] Logs viewer available at: https://localhost:8004/logs");
}
