import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import {
  isHexRgb,
  resolveHeaderColorSettings,
  type EffectiveHeaderColorSettings,
  type HeaderColor,
  type Rgb,
  type StartupHeaderConfig,
} from "./header-config.ts";

type StyledPart = {
  raw: string;
  styled: string;
};

const ANSI_RESET = "\x1b[0m";
const ANSI_PATTERN =
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

export const LOGO_LINES = [
  "████████████╗",
  "████████████║",
  "████╔═══████║",
  "████║   ████║",
  "████████╬═══████╗",
  "████████║   ████║",
  "████╔═══╝   ████║",
  "████║       ████║",
  "╚═══╝       ╚═══╝",
];

const TAGLINE_LINE_1 = "There are many agent harnesses,";
const TAGLINE_LINE_2_PREFIX = "but this one is ";
const TAGLINE_LINE_2_HIGHLIGHT = "yours";
const TAGLINE_LINE_2_SUFFIX = ".";

export const FALLBACK_LOGO_GRADIENT_BASE_RGB: Rgb = [80, 160, 255];
export const LOGO_BLOCK_WIDTH = Math.max(...LOGO_LINES.map((line) => [...line].length));

const PALETTE_STEPS = 24;
const PALETTE_MAX_DARKEN = 0.18;
const PALETTE_MAX_LIGHTEN = 0.18;
const LOGO_ROW_PHASE_STEP = 0.12;

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

function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

function getVisibleLength(text: string): number {
  return [...stripAnsi(text)].length;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function interpolateChannel(start: number, end: number, factor: number): number {
  return Math.round(start + (end - start) * factor);
}

function interpolateRgb(start: Rgb, end: Rgb, factor: number): Rgb {
  return [
    interpolateChannel(start[0], end[0], factor),
    interpolateChannel(start[1], end[1], factor),
    interpolateChannel(start[2], end[2], factor),
  ];
}

function darkenRgb(rgb: Rgb, amount: number): Rgb {
  return [
    clampByte(rgb[0] * (1 - amount)),
    clampByte(rgb[1] * (1 - amount)),
    clampByte(rgb[2] * (1 - amount)),
  ];
}

function lightenRgb(rgb: Rgb, amount: number): Rgb {
  return [
    clampByte(rgb[0] + (255 - rgb[0]) * amount),
    clampByte(rgb[1] + (255 - rgb[1]) * amount),
    clampByte(rgb[2] + (255 - rgb[2]) * amount),
  ];
}

function applyTruecolor(rgb: Rgb, text: string): string {
  const [red, green, blue] = rgb;
  return `\x1b[38;2;${red};${green};${blue}m${text}${ANSI_RESET}`;
}

function ansi16ToRgb(index: number): Rgb {
  return ANSI_16_RGB_TABLE[index] ?? [255, 255, 255];
}

export function ansi256ToRgb(index: number): Rgb {
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

export function parseHexRgb(hex: string): Rgb {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function resolveHeaderColorRgb(theme: Theme, color: HeaderColor, fallback: Rgb): Rgb {
  if (typeof color === "number") {
    return ansi256ToRgb(color);
  }

  if (isHexRgb(color)) {
    return parseHexRgb(color);
  }

  return parseForegroundRgbFromAnsi(theme.getFgAnsi(color as ThemeColor)) ?? fallback;
}

export function resolveLogoGradientBaseRgb(theme: Theme, color: HeaderColor): Rgb {
  return resolveHeaderColorRgb(theme, color, FALLBACK_LOGO_GRADIENT_BASE_RGB);
}

export function applyConfiguredTextColor(theme: Theme, color: HeaderColor, text: string): string {
  if (typeof color === "number") {
    return applyTruecolor(ansi256ToRgb(color), text);
  }

  if (isHexRgb(color)) {
    return applyTruecolor(parseHexRgb(color), text);
  }

  return theme.fg(color as ThemeColor, text);
}

function buildGradientPalette(base: Rgb): Rgb[] {
  return Array.from({ length: PALETTE_STEPS }, (_, index) => {
    const progress = index / PALETTE_STEPS;
    const wave = -Math.cos(progress * Math.PI * 2);

    if (wave < 0) {
      return darkenRgb(base, PALETTE_MAX_DARKEN * -wave);
    }

    return lightenRgb(base, PALETTE_MAX_LIGHTEN * wave);
  });
}

function sampleGradientColor(palette: Rgb[], position: number): Rgb {
  const wrappedPosition = ((position % 1) + 1) % 1;
  const scaledPosition = wrappedPosition * palette.length;
  const baseIndex = Math.floor(scaledPosition) % palette.length;
  const nextIndex = (baseIndex + 1) % palette.length;
  const factor = scaledPosition - Math.floor(scaledPosition);

  return interpolateRgb(palette[baseIndex]!, palette[nextIndex]!, factor);
}

export function getLogoGradientPosition(index: number, phase: number): number {
  const span = Math.max(LOGO_BLOCK_WIDTH - 1, 1);
  return index / span + phase;
}

function renderLogoGradientText(text: string, palette: Rgb[], phase: number): string {
  return [...text]
    .map((character, index) => {
      if (character === " ") return character;
      const color = sampleGradientColor(palette, getLogoGradientPosition(index, phase));
      return applyTruecolor(color, character);
    })
    .join("");
}

function createCenteredBlockLine(text: string, width: number, blockWidth: number): string {
  const leftPadding = Math.max(0, Math.floor((width - blockWidth) / 2));
  return `${" ".repeat(leftPadding)}${text}`;
}

function createCenteredStyledLine(parts: StyledPart[], width: number): string {
  const rawText = parts.map((part) => part.raw).join("");
  const leftPadding = Math.max(0, Math.floor((width - [...rawText].length) / 2));
  const styledText = parts.map((part) => part.styled).join("");
  return `${" ".repeat(leftPadding)}${styledText}`;
}

function fitLineToWidth(line: string, width: number): string {
  if (getVisibleLength(line) <= width) {
    return line;
  }

  return stripAnsi(line).slice(0, width);
}

function renderLogoLines(
  width: number,
  theme: Theme,
  colors: EffectiveHeaderColorSettings,
): string[] {
  const palette = buildGradientPalette(resolveLogoGradientBaseRgb(theme, colors.logoGradientBase));

  return LOGO_LINES.map((line, rowIndex) => {
    const phasedLine = renderLogoGradientText(line, palette, rowIndex * LOGO_ROW_PHASE_STEP);
    return createCenteredBlockLine(phasedLine, width, LOGO_BLOCK_WIDTH);
  });
}

function renderTaglineLines(
  width: number,
  theme: Theme,
  colors: EffectiveHeaderColorSettings,
): string[] {
  const line1 = createCenteredStyledLine(
    [
      {
        raw: TAGLINE_LINE_1,
        styled: applyConfiguredTextColor(theme, colors.textBase, TAGLINE_LINE_1),
      },
    ],
    width,
  );

  const line2 = createCenteredStyledLine(
    [
      {
        raw: TAGLINE_LINE_2_PREFIX,
        styled: applyConfiguredTextColor(theme, colors.textBase, TAGLINE_LINE_2_PREFIX),
      },
      {
        raw: TAGLINE_LINE_2_HIGHLIGHT,
        styled: theme.bold(
          applyConfiguredTextColor(theme, colors.textHighlight, TAGLINE_LINE_2_HIGHLIGHT),
        ),
      },
      {
        raw: TAGLINE_LINE_2_SUFFIX,
        styled: applyConfiguredTextColor(theme, colors.textBase, TAGLINE_LINE_2_SUFFIX),
      },
    ],
    width,
  );

  return [line1, line2];
}

export function renderHeaderLines(
  width: number,
  theme: Theme,
  config: StartupHeaderConfig,
): string[] {
  const colors = resolveHeaderColorSettings(config, theme.name);
  const logoLines = renderLogoLines(width, theme, colors);
  const taglineLines = renderTaglineLines(width, theme, colors);

  return ["", ...logoLines, "", ...taglineLines, ""].map((line) => fitLineToWidth(line, width));
}
