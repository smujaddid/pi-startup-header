import { getAgentDir, VERSION, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CONFIGURATION_WARNING,
  EMPTY_STARTUP_HEADER_CONFIG,
  loadStartupHeaderConfig,
  parseStartupHeaderConfig,
  resolveHeaderTextSettings,
} from "./shared/header-config.ts";
import { renderHeaderLines } from "./shared/header-renderer.ts";

const CONFIG_FILE_NAME = "pi-startup-header.json";

function getDefaultUserName(): string | undefined {
  return process.env.USER?.trim() || process.env.USERNAME?.trim();
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

const INITIAL_CONFIGURATION = JSON.stringify(
  {
    userName: getDefaultUserName() ?? "Your name",
    welcomeMessage: "Welcome, {name}!",
    locale: "en-US",
    dateStyle: "full",
    timeStyle: "long",
    general: {
      logoGradientBase: "accent",
      textBase: "accent",
      textHighlight: "mdLink",
    },
  },
  null,
  2,
);

export default function piStartupHeader(pi: ExtensionAPI) {
  let config = EMPTY_STARTUP_HEADER_CONFIG;
  let headerInstalled = false;

  function installHeader(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;

    headerInstalled = true;
    ctx.ui.setHeader((_tui, theme) => ({
      render(width: number): string[] {
        const model = ctx.model;
        const textSettings = resolveHeaderTextSettings(config);

        return renderHeaderLines(width, theme, config, {
          piVersion: VERSION,
          provider: model?.provider,
          model: model?.id,
          thinkingLevel: ctx.thinkingLevel,
          userName: textSettings.userName ?? getDefaultUserName(),
          locale: textSettings.locale,
          dateStyle: textSettings.dateStyle,
          timeStyle: textSettings.timeStyle,
        });
      },
      invalidate() {},
    }));
  }

  pi.registerCommand("startup-header", {
    description: "Configure the Pi startup header",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;

      const configPath = join(getAgentDir(), CONFIG_FILE_NAME);
      if (args.trim().toLowerCase() === "reset") {
        try {
          await unlink(configPath);
        } catch (error) {
          if (!isMissingFileError(error)) {
            ctx.ui.notify("Failed to reset pi-startup-header configuration.", "error");
            return;
          }
        }

        config = EMPTY_STARTUP_HEADER_CONFIG;
        installHeader(ctx);
        ctx.ui.notify("Startup header configuration reset.", "info");
        return;
      }

      if (args.trim().length > 0) {
        ctx.ui.notify("Use /startup-header with no arguments, or /startup-header reset.", "warning");
        return;
      }

      let initialConfiguration = INITIAL_CONFIGURATION;
      try {
        initialConfiguration = await readFile(configPath, "utf8");
      } catch (error) {
        if (!isMissingFileError(error)) {
          ctx.ui.notify("Failed to read pi-startup-header configuration.", "error");
          return;
        }
      }

      const editedConfiguration = await ctx.ui.editor(
        "Edit startup header configuration (JSON)",
        initialConfiguration,
      );
      if (editedConfiguration === undefined) return;

      let rawConfiguration: unknown;
      let parsedConfiguration: typeof EMPTY_STARTUP_HEADER_CONFIG;
      try {
        rawConfiguration = JSON.parse(editedConfiguration) as unknown;
        parsedConfiguration = parseStartupHeaderConfig(rawConfiguration);
      } catch {
        ctx.ui.notify("Invalid startup header configuration. Nothing was saved.", "warning");
        return;
      }

      try {
        await writeFile(configPath, `${JSON.stringify(rawConfiguration, null, 2)}\n`, "utf8");
      } catch {
        ctx.ui.notify("Failed to save pi-startup-header configuration.", "error");
        return;
      }

      config = parsedConfiguration;
      installHeader(ctx);
      ctx.ui.notify("Startup header configuration saved.", "info");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    config = EMPTY_STARTUP_HEADER_CONFIG;

    try {
      config = await loadStartupHeaderConfig(join(getAgentDir(), CONFIG_FILE_NAME));
    } catch {
      ctx.ui.notify(CONFIGURATION_WARNING, "warning");
    }

    installHeader(ctx);
  });

  pi.on("model_select", async (_event, ctx) => {
    if (headerInstalled) installHeader(ctx);
  });

  pi.on("thinking_level_select", async (_event, ctx) => {
    if (headerInstalled) installHeader(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    headerInstalled = false;
    ctx.ui.setHeader(undefined);
  });
}
