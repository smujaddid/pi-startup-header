import {
  DynamicBorder,
  getAgentDir,
  getSettingsListTheme,
  VERSION,
  type ExtensionAPI,
  type ExtensionContext,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import {
  Container,
  Input,
  SettingsList,
  Spacer,
  Text,
  type SettingItem,
} from "@earendil-works/pi-tui";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CONFIGURATION_WARNING,
  EMPTY_STARTUP_HEADER_CONFIG,
  loadStartupHeaderConfig,
  parseStartupHeaderConfig,
  resolveHeaderTextSettings,
  resolveShowTagline,
  resolveShowTimeGreeting,
  type StartupHeaderConfig,
} from "./shared/header-config.ts";
import { renderHeaderLines } from "./shared/header-renderer.ts";

const SYSTEM_DEFAULT_LABEL = "(system default)";
const DEFAULT_VALUE_LABEL = "(default)";
const COLOR_SETTING_IDS = ["logoGradientBase", "textBase", "textHighlight"] as const;
type ColorSettingId = (typeof COLOR_SETTING_IDS)[number];
type EditableSettingId =
  | "userName"
  | "welcomeMessage"
  | "locale"
  | "tagline"
  | "dateStyle"
  | "timeStyle"
  | "showTimeGreeting"
  | "showTagline"
  | ColorSettingId;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getGeneralSetting(rawConfiguration: Record<string, unknown>, id: string): unknown {
  const general = rawConfiguration.general;
  return isRecord(general) && Object.hasOwn(general, id) ? general[id] : undefined;
}

function getRawSetting(
  rawConfiguration: Record<string, unknown>,
  id: EditableSettingId,
): unknown {
  if (Object.hasOwn(rawConfiguration, id)) return rawConfiguration[id];
  return getGeneralSetting(rawConfiguration, id);
}

function setGeneralSetting(
  rawConfiguration: Record<string, unknown>,
  id: ColorSettingId,
  value: string | number | undefined,
): void {
  const general = isRecord(rawConfiguration.general) ? { ...rawConfiguration.general } : {};

  if (value === undefined) {
    delete general[id];
  } else {
    general[id] = value;
  }

  if (Object.keys(general).length === 0) {
    delete rawConfiguration.general;
  } else {
    rawConfiguration.general = general;
  }
}

function updateRawSetting(
  rawConfiguration: Record<string, unknown>,
  id: EditableSettingId,
  value: string | number | boolean | undefined,
): Record<string, unknown> {
  const nextConfiguration = { ...rawConfiguration };

  if (COLOR_SETTING_IDS.includes(id as ColorSettingId)) {
    setGeneralSetting(
      nextConfiguration,
      id as ColorSettingId,
      value as string | number | undefined,
    );
  } else if (value === undefined) {
    delete nextConfiguration[id];
    const general = isRecord(nextConfiguration.general) ? { ...nextConfiguration.general } : {};
    delete general[id];
    if (Object.keys(general).length === 0) {
      delete nextConfiguration.general;
    } else {
      nextConfiguration.general = general;
    }
  } else {
    nextConfiguration[id] = value;
  }

  return nextConfiguration;
}

function parseColorInput(value: string): string | number {
  const trimmedValue = value.trim();
  return /^\d+$/.test(trimmedValue) ? Number(trimmedValue) : trimmedValue;
}

function colorDisplayValue(
  rawConfiguration: Record<string, unknown>,
  id: ColorSettingId,
): string {
  const value = getRawSetting(rawConfiguration, id);
  if (typeof value === "string" || typeof value === "number") return String(value);

  return id === "textHighlight" ? "mdLink" : "accent";
}

function taglineDisplayValue(rawConfiguration: Record<string, unknown>): string {
  const value = getRawSetting(rawConfiguration, "tagline");
  if (typeof value === "string" && value.trim().length > 0) return value.trim();

  return DEFAULT_VALUE_LABEL;
}

class TextSettingSubmenu extends Container {
  private readonly input: Input;

  constructor(
    theme: Theme,
    title: string,
    description: string,
    currentValue: string,
    onSubmit: (value: string) => void,
    onCancel: () => void,
  ) {
    super();
    this.input = new Input();
    this.input.setValue(currentValue);
    this.input.focused = true;
    this.input.onSubmit = onSubmit;
    this.input.onEscape = onCancel;

    this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    this.addChild(new Text(theme.fg("accent", theme.bold(title)), 1, 0));
    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.fg("muted", description), 1, 0));
    this.addChild(new Spacer(1));
    this.addChild(this.input);
    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.fg("dim", "  Enter to save · Esc to cancel"), 1, 0));
    this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
  }

  handleInput(data: string): void {
    this.input.handleInput(data);
  }
}

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

      if (ctx.mode !== "tui") {
        ctx.ui.notify("/startup-header settings require TUI mode.", "warning");
        return;
      }

      let rawConfiguration: Record<string, unknown> = {};
      let parsedConfiguration: StartupHeaderConfig;
      let content: string;
      let configurationMissing = false;
      try {
        content = await readFile(configPath, "utf8");
      } catch (error) {
        if (!isMissingFileError(error)) {
          ctx.ui.notify("Failed to read pi-startup-header configuration.", "error");
          return;
        }
        configurationMissing = true;
        content = "";
      }

      if (configurationMissing) {
        parsedConfiguration = EMPTY_STARTUP_HEADER_CONFIG;
      } else {
        try {
          const parsed = JSON.parse(content) as unknown;
          parsedConfiguration = parseStartupHeaderConfig(parsed);
          if (!isRecord(parsed)) throw new Error("Configuration must be an object");
          rawConfiguration = parsed;
        } catch {
          ctx.ui.notify(
            "Invalid startup header configuration. Use /startup-header reset to restore defaults.",
            "warning",
          );
          return;
        }
      }

      config = parsedConfiguration;
      installHeader(ctx);

      let draftConfiguration = rawConfiguration;
      let saveQueue = Promise.resolve();
      let changed = false;
      let saveFailed = false;

      const result = await ctx.ui.custom<void>((tui, theme, _keybindings, done) => {
        const textSettings = resolveHeaderTextSettings(parsedConfiguration);
        const items: SettingItem[] = [
          {
            id: "userName",
            label: "User name",
            description: "Name shown in the welcome message. Leave empty to use your system user name.",
            currentValue: textSettings.userName ?? SYSTEM_DEFAULT_LABEL,
            submenu: (_currentValue, done) =>
              new TextSettingSubmenu(
                theme,
                "User name",
                "Enter the name to show in the startup header.",
                currentTextInputValue("userName"),
                (value) => {
                  const submittedValue = validateSetting("userName", value);
                  if (submittedValue !== undefined) done(submittedValue);
                },
                () => done(undefined),
              ),
          },
          {
            id: "welcomeMessage",
            label: "Welcome message",
            description: "Use {name} as a placeholder for the configured user name.",
            currentValue: textSettings.welcomeMessage ?? "Welcome, {name}!",
            submenu: (_currentValue, done) =>
              new TextSettingSubmenu(
                theme,
                "Welcome message",
                "Enter the message to show above the runtime information.",
                currentTextInputValue("welcomeMessage"),
                (value) => {
                  const submittedValue = validateSetting("welcomeMessage", value);
                  if (submittedValue !== undefined) done(submittedValue);
                },
                () => done(undefined),
              ),
          },
          {
            id: "tagline",
            label: "Tagline text",
            description: "Text shown below the runtime information. Leave empty to use the default tagline.",
            currentValue: taglineDisplayValue(draftConfiguration),
            submenu: (_currentValue, done) =>
              new TextSettingSubmenu(
                theme,
                "Tagline text",
                "Enter a single-line tagline. Leave empty to use the default tagline.",
                currentTextInputValue("tagline"),
                (value) => {
                  const submittedValue = validateSetting("tagline", value);
                  if (submittedValue !== undefined) done(submittedValue);
                },
                () => done(undefined),
              ),
          },
          {
            id: "locale",
            label: "Locale",
            description: "BCP 47 locale used for the local date and time.",
            currentValue: textSettings.locale ?? SYSTEM_DEFAULT_LABEL,
            submenu: (_currentValue, done) =>
              new TextSettingSubmenu(
                theme,
                "Locale",
                "Enter a locale such as en-US, en-GB, or zh-CN. Leave empty for the system locale.",
                currentTextInputValue("locale"),
                (value) => {
                  const submittedValue = validateSetting("locale", value);
                  if (submittedValue !== undefined) done(submittedValue);
                },
                () => done(undefined),
              ),
          },
          {
            id: "dateStyle",
            label: "Date style",
            description: "Detail level for the local date.",
            currentValue: textSettings.dateStyle ?? "full",
            values: ["full", "long", "medium", "short"],
          },
          {
            id: "timeStyle",
            label: "Time style",
            description: "Detail level for the local time.",
            currentValue: textSettings.timeStyle ?? "long",
            values: ["full", "long", "medium", "short"],
          },
          {
            id: "showTimeGreeting",
            label: "Time greeting",
            description: "Show Good morning!, Good afternoon!, or Good evening! based on local time.",
            currentValue: resolveShowTimeGreeting(parsedConfiguration) ? "enabled" : "disabled",
            values: ["enabled", "disabled"],
          },
          {
            id: "showTagline",
            label: "Tagline",
            description: "Show the tagline below the startup header information.",
            currentValue: resolveShowTagline(parsedConfiguration) ? "enabled" : "disabled",
            values: ["enabled", "disabled"],
          },
          ...COLOR_SETTING_IDS.map((id): SettingItem => ({
            id,
            label:
              id === "logoGradientBase"
                ? "Logo gradient color"
                : id === "textBase"
                  ? "Text color"
                  : "Highlight color",
            description: "Theme color name, #RRGGBB, or ANSI 256-color number (0-255).",
            currentValue: colorDisplayValue(draftConfiguration, id),
            submenu: (_currentValue, done) =>
              new TextSettingSubmenu(
                theme,
                id === "logoGradientBase"
                  ? "Logo gradient color"
                  : id === "textBase"
                    ? "Text color"
                    : "Highlight color",
                "Enter a theme color name, #RRGGBB value, or ANSI 256-color number.",
                colorDisplayValue(draftConfiguration, id),
                (value) => {
                  const submittedValue = validateSetting(id, value);
                  if (submittedValue !== undefined) done(submittedValue);
                },
                () => done(undefined),
              ),
          })),
        ];

        const container = new Container();
        container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
        container.addChild(new Text(theme.fg("accent", theme.bold("Startup Header")), 1, 0));
        container.addChild(new Text(theme.fg("muted", "Changes are saved immediately."), 1, 0));
        container.addChild(new Spacer(1));

        let settingsList: SettingsList;
        const previousValues = new Map(items.map((item) => [item.id, item.currentValue]));
        settingsList = new SettingsList(
          items,
          Math.min(items.length, 10),
          getSettingsListTheme(),
          (id, newValue) => {
            const settingId = id as EditableSettingId;
            const settingValue = COLOR_SETTING_IDS.includes(settingId as ColorSettingId)
              ? parseColorInput(newValue)
              : settingId === "showTimeGreeting" || settingId === "showTagline"
                ? newValue === "enabled"
                : (settingId === "userName" || settingId === "locale") && newValue.trim().length === 0
                  ? undefined
                  : newValue;
            const displayValue = applySetting(settingId, settingValue);
            if (displayValue === undefined) {
              settingsList.updateValue(id, previousValues.get(id) ?? newValue);
            } else {
              settingsList.updateValue(id, displayValue);
              previousValues.set(id, displayValue);
            }
          },
          () => done(undefined),
          { enableSearch: true },
        );

        container.addChild(settingsList);
        container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

        return {
          render(width: number) {
            return container.render(width);
          },
          invalidate() {
            container.invalidate();
          },
          handleInput(data: string) {
            settingsList.handleInput(data);
            tui.requestRender();
          },
        };

        function currentTextInputValue(
          id: "userName" | "welcomeMessage" | "locale" | "tagline",
        ): string {
          if (id === "tagline") {
            const value = getRawSetting(draftConfiguration, "tagline");
            return typeof value === "string" ? value.trim() : "";
          }

          const currentSettings = resolveHeaderTextSettings(parsedConfiguration);
          if (id === "userName") return currentSettings.userName ?? getDefaultUserName() ?? "";
          if (id === "locale") return currentSettings.locale ?? "";
          return currentSettings.welcomeMessage ?? "Welcome, {name}!";
        }

        function validateSetting(id: EditableSettingId, value: string): string | undefined {
          const trimmedValue = value.trim();
          const candidateValue: string | number | undefined = COLOR_SETTING_IDS.includes(
            id as ColorSettingId,
          )
            ? parseColorInput(trimmedValue)
            : id === "userName" || id === "locale"
              ? trimmedValue.length > 0
                ? trimmedValue
                : undefined
              : trimmedValue;
          const nextConfiguration = updateRawSetting(draftConfiguration, id, candidateValue);

          try {
            parseStartupHeaderConfig(nextConfiguration);
          } catch (error) {
            ctx.ui.notify(error instanceof Error ? error.message : "Invalid setting value.", "warning");
            return undefined;
          }

          return candidateValue === undefined ? "" : String(candidateValue);
        }

        function applySetting(
          id: EditableSettingId,
          value: string | number | boolean | undefined,
        ): string | undefined {
          const nextConfiguration = updateRawSetting(draftConfiguration, id, value);
          let nextParsedConfiguration: StartupHeaderConfig;
          try {
            nextParsedConfiguration = parseStartupHeaderConfig(nextConfiguration);
          } catch (error) {
            ctx.ui.notify(error instanceof Error ? error.message : "Invalid setting value.", "warning");
            return undefined;
          }

          draftConfiguration = nextConfiguration;
          parsedConfiguration = nextParsedConfiguration;
          config = nextParsedConfiguration;
          changed = true;
          installHeader(ctx);

          const serializedConfiguration = `${JSON.stringify(draftConfiguration, null, 2)}\n`;
          saveQueue = saveQueue
            .then(() => writeFile(configPath, serializedConfiguration, "utf8"))
            .catch(() => {
              saveFailed = true;
              ctx.ui.notify("Failed to save pi-startup-header configuration.", "error");
            });

          if (COLOR_SETTING_IDS.includes(id as ColorSettingId)) {
            return colorDisplayValue(draftConfiguration, id as ColorSettingId);
          }
          if (id === "tagline") return taglineDisplayValue(draftConfiguration);
          if (id === "showTimeGreeting" || id === "showTagline") {
            return value === true ? "enabled" : "disabled";
          }
          if (value === undefined) return SYSTEM_DEFAULT_LABEL;
          return String(value);
        }
      });

      await saveQueue;
      if (result === undefined && changed) {
        ctx.ui.notify(
          saveFailed
            ? "Startup header changes could not be saved."
            : "Startup header configuration saved.",
          saveFailed ? "error" : "info",
        );
      }
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
