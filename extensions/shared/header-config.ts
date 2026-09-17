import { readFile } from "node:fs/promises";
import {
  HeaderColor,
  type HeaderColorConfigValue,
} from "./header-color.ts";

const HEADER_COLOR_KEYS = ["logoGradientBase", "textBase", "textHighlight"] as const;
const HEADER_TEXT_KEYS = ["userName", "welcomeMessage", "locale"] as const;
const HEADER_DATE_TIME_KEYS = ["dateStyle", "timeStyle"] as const;
const HEADER_DISPLAY_KEYS = ["showTimeGreeting", "showTagline"] as const;
const THEME_OVERRIDE_KEYS = ["theme", ...HEADER_COLOR_KEYS] as const;
const GENERAL_CONFIGURATION_KEYS = [
  ...HEADER_COLOR_KEYS,
  ...HEADER_TEXT_KEYS,
  ...HEADER_DATE_TIME_KEYS,
  ...HEADER_DISPLAY_KEYS,
] as const;
const CONFIGURATION_KEYS = [
  "general",
  "themeOverrides",
  ...HEADER_TEXT_KEYS,
  ...HEADER_DATE_TIME_KEYS,
  ...HEADER_DISPLAY_KEYS,
] as const;

const DATE_TIME_STYLE_VALUES = ["full", "long", "medium", "short"] as const;

export type DateTimeStyle = (typeof DATE_TIME_STYLE_VALUES)[number];
type HeaderColorKey = (typeof HEADER_COLOR_KEYS)[number];
type HeaderTextKey = (typeof HEADER_TEXT_KEYS)[number];
type HeaderDateTimeKey = (typeof HEADER_DATE_TIME_KEYS)[number];

type HeaderDisplaySettings = {
  showTimeGreeting?: boolean;
  showTagline?: boolean;
};

export type HeaderColorConfig = Partial<Record<HeaderColorKey, HeaderColorConfigValue>>;
type HeaderColorSettings = Partial<Record<HeaderColorKey, HeaderColor>>;
type HeaderTextSettings = Partial<Record<HeaderTextKey, string>>;
type HeaderDateTimeSettings = Partial<Record<HeaderDateTimeKey, DateTimeStyle>>;
type GeneralHeaderSettings =
  & HeaderColorSettings
  & HeaderTextSettings
  & HeaderDateTimeSettings
  & HeaderDisplaySettings;
export type EffectiveHeaderColorSettings = Required<HeaderColorSettings>;
export type EffectiveHeaderTextSettings = HeaderTextSettings & HeaderDateTimeSettings;
type ThemeOverride = HeaderColorSettings & {
  theme: string;
};
export type StartupHeaderConfig = {
  /** Color and text settings shared by all themes. */
  general?: GeneralHeaderSettings;
  /** Top-level text settings override values in `general`. */
  userName?: string;
  welcomeMessage?: string;
  locale?: string;
  dateStyle?: DateTimeStyle;
  timeStyle?: DateTimeStyle;
  showTimeGreeting?: boolean;
  showTagline?: boolean;
  themeOverrides?: ThemeOverride[];
};

export const CONFIGURATION_WARNING =
  "Failed to load pi-startup-header configuration. Using default header settings.";

export const DEFAULT_WELCOME_MESSAGE = "Welcome, {name}!";
export const DEFAULT_DATE_STYLE: DateTimeStyle = "full";
export const DEFAULT_TIME_STYLE: DateTimeStyle = "long";
export const DEFAULT_SHOW_TIME_GREETING = true;
export const DEFAULT_SHOW_TAGLINE = true;

const DEFAULT_HEADER_COLOR_CONFIG = {
  logoGradientBase: "accent",
  textBase: "accent",
  textHighlight: "mdLink",
} as const satisfies Required<HeaderColorConfig>;

export const DEFAULT_HEADER_COLORS = {
  logoGradientBase: HeaderColor.fromThemeColor(DEFAULT_HEADER_COLOR_CONFIG.logoGradientBase),
  textBase: HeaderColor.fromThemeColor(DEFAULT_HEADER_COLOR_CONFIG.textBase),
  textHighlight: HeaderColor.fromThemeColor(DEFAULT_HEADER_COLOR_CONFIG.textHighlight),
} as const satisfies EffectiveHeaderColorSettings;

export const EMPTY_STARTUP_HEADER_CONFIG: StartupHeaderConfig = {};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertKnownKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  path: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      throw new Error(`${path} contains an unknown field: ${key}`);
    }
  }
}

function expectRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }

  return value;
}

function parseTextSetting(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }

  if (value.includes("\n") || value.includes("\r")) {
    throw new Error(`${path} must be a single-line string`);
  }

  return value.trim();
}

function parseLocaleSetting(value: unknown, path: string): string {
  const locale = parseTextSetting(value, path);

  try {
    new Intl.DateTimeFormat(locale);
  } catch {
    throw new Error(`${path} must be a valid BCP 47 locale`);
  }

  return locale;
}

function parseDateTimeStyle(value: unknown, path: string): DateTimeStyle {
  if (typeof value !== "string" || !DATE_TIME_STYLE_VALUES.includes(value as DateTimeStyle)) {
    throw new Error(`${path} must be one of: ${DATE_TIME_STYLE_VALUES.join(", ")}`);
  }

  return value as DateTimeStyle;
}

function parseGeneralSettings(value: unknown, path: string): GeneralHeaderSettings {
  const settings = expectRecord(value, path);
  assertKnownKeys(settings, GENERAL_CONFIGURATION_KEYS, path);

  const result: GeneralHeaderSettings = {};
  for (const key of HEADER_COLOR_KEYS) {
    if (Object.hasOwn(settings, key)) {
      result[key] = HeaderColor.parse(settings[key], `${path}.${key}`);
    }
  }
  for (const key of HEADER_TEXT_KEYS) {
    if (Object.hasOwn(settings, key)) {
      result[key] =
        key === "locale"
          ? parseLocaleSetting(settings[key], `${path}.${key}`)
          : parseTextSetting(settings[key], `${path}.${key}`);
    }
  }
  for (const key of HEADER_DATE_TIME_KEYS) {
    if (Object.hasOwn(settings, key)) {
      result[key] = parseDateTimeStyle(settings[key], `${path}.${key}`);
    }
  }
  for (const key of HEADER_DISPLAY_KEYS) {
    if (Object.hasOwn(settings, key)) {
      if (typeof settings[key] !== "boolean") {
        throw new Error(`${path}.${key} must be a boolean`);
      }
      result[key] = settings[key];
    }
  }

  return result;
}

function parseThemeOverride(value: unknown, index: number): ThemeOverride {
  const path = `themeOverrides[${index}]`;
  const override = expectRecord(value, path);
  assertKnownKeys(override, THEME_OVERRIDE_KEYS, path);

  if (typeof override.theme !== "string" || override.theme.length === 0) {
    throw new Error(`${path}.theme must be a non-empty string`);
  }

  const colors: HeaderColorSettings = {};
  for (const key of HEADER_COLOR_KEYS) {
    if (Object.hasOwn(override, key)) {
      colors[key] = HeaderColor.parse(override[key], `${path}.${key}`);
    }
  }

  return { theme: override.theme, ...colors };
}

export function parseStartupHeaderConfig(value: unknown): StartupHeaderConfig {
  const config = expectRecord(value, "configuration");
  assertKnownKeys(config, CONFIGURATION_KEYS, "configuration");

  const result: StartupHeaderConfig = {};

  if (Object.hasOwn(config, "general")) {
    result.general = parseGeneralSettings(config.general, "general");
  }

  for (const key of HEADER_TEXT_KEYS) {
    if (Object.hasOwn(config, key)) {
      const path = `configuration.${key}`;
      result[key] =
        key === "locale"
          ? parseLocaleSetting(config[key], path)
          : parseTextSetting(config[key], path);
    }
  }
  for (const key of HEADER_DATE_TIME_KEYS) {
    if (Object.hasOwn(config, key)) {
      const path = `configuration.${key}`;
      result[key] = parseDateTimeStyle(config[key], path);
    }
  }
  for (const key of HEADER_DISPLAY_KEYS) {
    if (Object.hasOwn(config, key)) {
      if (typeof config[key] !== "boolean") {
        throw new Error(`configuration.${key} must be a boolean`);
      }
      result[key] = config[key];
    }
  }

  if (Object.hasOwn(config, "themeOverrides")) {
    if (!Array.isArray(config.themeOverrides)) {
      throw new Error("themeOverrides must be an array");
    }

    const themeNames = new Set<string>();
    result.themeOverrides = config.themeOverrides.map((override, index) => {
      const parsedOverride = parseThemeOverride(override, index);
      if (themeNames.has(parsedOverride.theme)) {
        throw new Error(`themeOverrides contains a duplicate theme: ${parsedOverride.theme}`);
      }
      themeNames.add(parsedOverride.theme);
      return parsedOverride;
    });
  }

  return result;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

export async function loadStartupHeaderConfig(path: string): Promise<StartupHeaderConfig> {
  let content: string;

  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return EMPTY_STARTUP_HEADER_CONFIG;
    }

    throw error;
  }

  return parseStartupHeaderConfig(JSON.parse(content) as unknown);
}

export function resolveHeaderColorSettings(
  config: StartupHeaderConfig,
  themeName: string | undefined,
): EffectiveHeaderColorSettings {
  const themeOverride = themeName
    ? config.themeOverrides?.find((override) => override.theme === themeName)
    : undefined;

  return {
    logoGradientBase:
      themeOverride?.logoGradientBase ??
      config.general?.logoGradientBase ??
      DEFAULT_HEADER_COLORS.logoGradientBase,
    textBase: themeOverride?.textBase ?? config.general?.textBase ?? DEFAULT_HEADER_COLORS.textBase,
    textHighlight:
      themeOverride?.textHighlight ??
      config.general?.textHighlight ??
      DEFAULT_HEADER_COLORS.textHighlight,
  };
}

export function resolveHeaderTextSettings(
  config: StartupHeaderConfig,
): EffectiveHeaderTextSettings {
  return {
    userName: config.userName ?? config.general?.userName,
    welcomeMessage:
      config.welcomeMessage ?? config.general?.welcomeMessage ?? DEFAULT_WELCOME_MESSAGE,
    locale: config.locale ?? config.general?.locale,
    dateStyle: config.dateStyle ?? config.general?.dateStyle ?? DEFAULT_DATE_STYLE,
    timeStyle: config.timeStyle ?? config.general?.timeStyle ?? DEFAULT_TIME_STYLE,
  };
}

export function resolveShowTimeGreeting(config: StartupHeaderConfig): boolean {
  return config.showTimeGreeting ?? config.general?.showTimeGreeting ?? DEFAULT_SHOW_TIME_GREETING;
}

export function resolveShowTagline(config: StartupHeaderConfig): boolean {
  return config.showTagline ?? config.general?.showTagline ?? DEFAULT_SHOW_TAGLINE;
}
