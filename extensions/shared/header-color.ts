import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";

export type Rgb = [number, number, number];
export type HeaderColorConfigValue = ThemeColor | `#${string}` | number;

type HeaderColorSource =
  | {
      kind: "theme";
      token: ThemeColor;
    }
  | {
      kind: "rgb";
      value: Rgb;
    };

const ANSI_RESET = "\x1b[0m";
const HEX_RGB_PATTERN = /^#[0-9a-fA-F]{6}$/;

const ANSI_16_RGB_TABLE: Rgb[] = [
  [0, 0, 0],
  [128, 0, 0],
  [0, 128, 0],
  [128, 128, 0],
  [0, 0, 128],
  [128, 0, 128],
  [0, 128, 128],
  [192, 192, 192],
  [128, 128, 128],
  [255, 0, 0],
  [0, 255, 0],
  [255, 255, 0],
  [0, 0, 255],
  [255, 0, 255],
  [0, 255, 255],
  [255, 255, 255],
];

const THEME_COLOR_VALUES = [
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

function isHexRgb(value: unknown): value is `#${string}` {
  return typeof value === "string" && HEX_RGB_PATTERN.test(value);
}

function isThemeColor(value: unknown): value is ThemeColor {
  return typeof value === "string" && THEME_COLOR_SET.has(value);
}

function ansi16ToRgb(index: number): Rgb {
  return ANSI_16_RGB_TABLE[index] ?? [255, 255, 255];
}

function ansi256ToRgb(index: number): Rgb {
  if (index < 16) return ansi16ToRgb(index);

  if (index >= 232) {
    const gray = 8 + (index - 232) * 10;
    return [gray, gray, gray];
  }

  const cubeIndex = index - 16;
  const redIndex = Math.floor(cubeIndex / 36);
  const greenIndex = Math.floor((cubeIndex % 36) / 6);
  const blueIndex = cubeIndex % 6;
  const values = [0, 95, 135, 175, 215, 255];

  return [values[redIndex]!, values[greenIndex]!, values[blueIndex]!];
}

function parseHexRgb(hex: `#${string}`): Rgb {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function parseTruecolorAnsi(ansi: string): Rgb | undefined {
  const match = ansi.match(/38;2;(\d+);(\d+);(\d+)/);
  if (!match) return undefined;

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function parseAnsi256Foreground(ansi: string): Rgb | undefined {
  const match = ansi.match(/38;5;(\d+)/);
  if (!match) return undefined;

  return ansi256ToRgb(Number(match[1]));
}

function parseAnsi16Foreground(ansi: string): Rgb | undefined {
  const normalMatch = ansi.match(/(?:\[|;)(3[0-7])(?:;|m)/);
  if (normalMatch) {
    return ansi16ToRgb(Number(normalMatch[1]) - 30);
  }

  const brightMatch = ansi.match(/(?:\[|;)(9[0-7])(?:;|m)/);
  if (brightMatch) {
    return ansi16ToRgb(Number(brightMatch[1]) - 90 + 8);
  }

  return undefined;
}

function parseForegroundRgbFromAnsi(ansi: string): Rgb | undefined {
  return parseTruecolorAnsi(ansi) ?? parseAnsi256Foreground(ansi) ?? parseAnsi16Foreground(ansi);
}

export function paintRgb(rgb: Rgb, text: string): string {
  const [red, green, blue] = rgb;
  return `\x1b[38;2;${red};${green};${blue}m${text}${ANSI_RESET}`;
}

export class HeaderColor {
  private constructor(private readonly source: HeaderColorSource) {}

  static fromThemeColor(token: ThemeColor): HeaderColor {
    return new HeaderColor({ kind: "theme", token });
  }

  static parse(value: unknown, path: string): HeaderColor {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255) {
      return new HeaderColor({ kind: "rgb", value: ansi256ToRgb(value) });
    }

    if (isHexRgb(value)) {
      return new HeaderColor({ kind: "rgb", value: parseHexRgb(value) });
    }

    if (isThemeColor(value)) {
      return HeaderColor.fromThemeColor(value);
    }

    throw new Error(`${path} must be a ThemeColor, #RRGGBB value, or integer from 0 to 255`);
  }

  toRgb(theme: Theme): Rgb | undefined {
    if (this.source.kind === "rgb") {
      return this.source.value;
    }

    return parseForegroundRgbFromAnsi(theme.getFgAnsi(this.source.token));
  }

  paint(theme: Theme, text: string): string {
    if (this.source.kind === "theme") {
      return theme.fg(this.source.token, text);
    }

    return paintRgb(this.source.value, text);
  }
}
