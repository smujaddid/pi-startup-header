import { readFile } from "node:fs/promises";
import type { ThemeColor } from "@earendil-works/pi-coding-agent";

export type Rgb = [number, number, number];
type HexRgb = `#${string}`;

export type HeaderColor = ThemeColor | HexRgb | number;
export type HeaderColorSettings = {
  logoGradientBase?: HeaderColor;
  textBase?: HeaderColor;
  textHighlight?: HeaderColor;
};
export type EffectiveHeaderColorSettings = Required<HeaderColorSettings>;
type ThemeOverride = HeaderColorSettings & {
  theme: string;
};
export type StartupHeaderConfig = {
  general?: HeaderColorSettings;
  themeOverrides?: ThemeOverride[];
};

const HEADER_COLOR_KEYS = ["logoGradientBase", "textBase", "textHighlight"] as const;
const THEME_OVERRIDE_KEYS = ["theme", ...HEADER_COLOR_KEYS] as const;
const CONFIGURATION_KEYS = ["general", "themeOverrides"] as const;
const HEX_RGB_PATTERN = /^#[0-9a-fA-F]{6}$/;

export const CONFIGURATION_WARNING =
  "Failed to load pi-startup-header configuration. Using default colors.";

export const DEFAULT_HEADER_COLORS = {
  logoGradientBase: "accent",
  textBase: "accent",
  textHighlight: "mdLink",
} as const satisfies EffectiveHeaderColorSettings;

export const THEME_COLOR_VALUES = [
  "accent",
  "border",
  "borderAccent",
  "borderMuted",
  "success",
  "error",
  "warning",
  "muted",
  "dim",
  "text",
  "thinkingText",
  "userMessageText",
  "customMessageText",
  "customMessageLabel",
  "toolTitle",
  "toolOutput",
  "mdHeading",
  "mdLink",
  "mdLinkUrl",
  "mdCode",
  "mdCodeBlock",
  "mdCodeBlockBorder",
  "mdQuote",
  "mdQuoteBorder",
  "mdHr",
  "mdListBullet",
  "toolDiffAdded",
  "toolDiffRemoved",
  "toolDiffContext",
  "syntaxComment",
  "syntaxKeyword",
  "syntaxFunction",
  "syntaxVariable",
  "syntaxString",
  "syntaxNumber",
  "syntaxType",
  "syntaxOperator",
  "syntaxPunctuation",
  "thinkingOff",
  "thinkingMinimal",
  "thinkingLow",
  "thinkingMedium",
  "thinkingHigh",
  "thinkingXhigh",
  "thinkingMax",
  "bashMode",
] as const satisfies readonly ThemeColor[];

type AssertNever<T extends never> = T;
type MissingThemeColors = AssertNever<Exclude<ThemeColor, (typeof THEME_COLOR_VALUES)[number]>>;

const THEME_COLOR_SET = new Set<string>(THEME_COLOR_VALUES);

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

export function isHexRgb(value: unknown): value is HexRgb {
  return typeof value === "string" && HEX_RGB_PATTERN.test(value);
}

export function isThemeColor(value: unknown): value is ThemeColor {
  return typeof value === "string" && THEME_COLOR_SET.has(value);
}

function parseHeaderColor(value: unknown, path: string): HeaderColor {
  if (isThemeColor(value) || isHexRgb(value)) {
    return value;
  }

  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255) {
    return value;
  }

  throw new Error(`${path} must be a ThemeColor, #RRGGBB value, or integer from 0 to 255`);
}

function parseHeaderColorSettings(value: unknown, path: string): HeaderColorSettings {
  const settings = expectRecord(value, path);
  assertKnownKeys(settings, HEADER_COLOR_KEYS, path);

  const result: HeaderColorSettings = {};
  for (const key of HEADER_COLOR_KEYS) {
    if (Object.hasOwn(settings, key)) {
      result[key] = parseHeaderColor(settings[key], `${path}.${key}`);
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
      colors[key] = parseHeaderColor(override[key], `${path}.${key}`);
    }
  }

  return { theme: override.theme, ...colors };
}

export function parseStartupHeaderConfig(value: unknown): StartupHeaderConfig {
  const config = expectRecord(value, "configuration");
  assertKnownKeys(config, CONFIGURATION_KEYS, "configuration");

  const result: StartupHeaderConfig = {};

  if (Object.hasOwn(config, "general")) {
    result.general = parseHeaderColorSettings(config.general, "general");
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
