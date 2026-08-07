import type { Theme } from "@earendil-works/pi-coding-agent";
import { paintRgb, type HeaderColor, type Rgb } from "./header-color.ts";
import {
  resolveHeaderColorSettings,
  type EffectiveHeaderColorSettings,
  type StartupHeaderConfig,
} from "./header-config.ts";

type StyledPart = {
  raw: string;
  styled: string;
};

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

export function resolveLogoGradientBaseRgb(theme: Theme, color: HeaderColor): Rgb {
  return color.toRgb(theme) ?? FALLBACK_LOGO_GRADIENT_BASE_RGB;
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
      return paintRgb(color, character);
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
        styled: colors.textBase.paint(theme, TAGLINE_LINE_1),
      },
    ],
    width,
  );

  const line2 = createCenteredStyledLine(
    [
      {
        raw: TAGLINE_LINE_2_PREFIX,
        styled: colors.textBase.paint(theme, TAGLINE_LINE_2_PREFIX),
      },
      {
        raw: TAGLINE_LINE_2_HIGHLIGHT,
        styled: theme.bold(colors.textHighlight.paint(theme, TAGLINE_LINE_2_HIGHLIGHT)),
      },
      {
        raw: TAGLINE_LINE_2_SUFFIX,
        styled: colors.textBase.paint(theme, TAGLINE_LINE_2_SUFFIX),
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
