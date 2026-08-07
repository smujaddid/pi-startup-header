import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import {
  CONFIGURATION_WARNING,
  EMPTY_STARTUP_HEADER_CONFIG,
  loadStartupHeaderConfig,
} from "./shared/header-config.ts";
import { renderHeaderLines } from "./shared/header-renderer.ts";

const CONFIG_FILE_NAME = "pi-startup-header.json";

export default function piStartupHeader(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    let config = EMPTY_STARTUP_HEADER_CONFIG;

    try {
      config = await loadStartupHeaderConfig(join(getAgentDir(), CONFIG_FILE_NAME));
    } catch {
      ctx.ui.notify(CONFIGURATION_WARNING, "warning");
    }

    ctx.ui.setHeader((_tui, theme) => ({
      render(width: number): string[] {
        return renderHeaderLines(width, theme, config);
      },
      invalidate() {},
    }));
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    ctx.ui.setHeader(undefined);
  });
}
