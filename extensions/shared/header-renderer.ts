import type { Theme } from "@earendil-works/pi-coding-agent";
import { paintRgb, type HeaderColor, type Rgb } from "./header-color.ts";
import {
  DEFAULT_DATE_STYLE,
  DEFAULT_TIME_STYLE,
  resolveHeaderColorSettings,
  resolveHeaderTextSettings,
  resolveShowTimeGreeting,
  type DateTimeStyle,
  type EffectiveHeaderColorSettings,
  type StartupHeaderConfig,
} from "./header-config.ts";

type StyledPart = {
  raw: string;
  styled: string;
};

export type HeaderRuntimeInfo = {
  piVersion: string;
  provider?: string;
  model?: string;
  thinkingLevel?: string;
  userName?: string;
  welcomeMessage?: string;
  /** Date used for the clock; defaults to the current local date and time. */
  now?: Date;
  /** Optional locale override for deterministic rendering or user preference. */
  locale?: string;
  /** Optional date style override; configuration defaults to `full`. */
  dateStyle?: DateTimeStyle;
  /** Optional time style override; configuration defaults to `long`. */
  timeStyle?: DateTimeStyle;
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
const UNKNOWN_VALUE = "unknown";

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

export function formatLocalDateTime(
  date = new Date(),
  locale?: string,
  dateStyle: DateTimeStyle = DEFAULT_DATE_STYLE,
  timeStyle: DateTimeStyle = DEFAULT_TIME_STYLE,
): string {
  return date.toLocaleString(locale, { dateStyle, timeStyle });
}

export function getTimeGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 5) return "Good night!";
  if (hour < 12) return "Good morning!";
  if (hour < 18) return "Good afternoon!";
  return "Good evening!";
}

function renderHeaderInfoLines(
  width: number,
  theme: Theme,
  colors: EffectiveHeaderColorSettings,
  config: StartupHeaderConfig,
  runtimeInfo: HeaderRuntimeInfo,
): string[] {
  const textSettings = resolveHeaderTextSettings(config);
  const provider = runtimeInfo.provider ?? UNKNOWN_VALUE;
  const model = runtimeInfo.model ?? UNKNOWN_VALUE;
  const thinkingLevel = runtimeInfo.thinkingLevel ?? UNKNOWN_VALUE;
  const userName = runtimeInfo.userName ?? textSettings.userName;
  const welcomeMessage = runtimeInfo.welcomeMessage ?? textSettings.welcomeMessage;
  const welcomeText = userName
    ? welcomeMessage?.replaceAll("{name}", userName)
    : undefined;
  const now = runtimeInfo.now ?? new Date();
  const timeGreeting = getTimeGreeting(now);
  const greetingLine = [welcomeText, resolveShowTimeGreeting(config) ? timeGreeting : undefined]
    .filter((text): text is string => Boolean(text))
    .join(" ");

  const lines = [
    createCenteredStyledLine(
      [
        {
          raw: `pi v${runtimeInfo.piVersion}`,
          styled: theme.bold(colors.textHighlight.paint(theme, `pi v${runtimeInfo.piVersion}`)),
        },
        {
          raw: " · provider: ",
          styled: colors.textBase.paint(theme, " · provider: "),
        },
        {
          raw: provider,
          styled: colors.textHighlight.paint(theme, provider),
        },
      ],
      width,
    ),
    createCenteredStyledLine(
      [
        {
          raw: "model: ",
          styled: colors.textBase.paint(theme, "model: "),
        },
        {
          raw: model,
          styled: colors.textHighlight.paint(theme, model),
        },
        {
          raw: " · thinking: ",
          styled: colors.textBase.paint(theme, " · thinking: "),
        },
        {
          raw: thinkingLevel,
          styled: colors.textHighlight.paint(theme, thinkingLevel),
        },
      ],
      width,
    ),
  ];

  if (greetingLine) {
    lines.push("");
    lines.push(
      createCenteredStyledLine(
        [
          {
            raw: greetingLine,
            styled: colors.textBase.paint(theme, greetingLine),
          },
        ],
        width,
      ),
    );
  }

  const localDateTime = formatLocalDateTime(
    now,
    runtimeInfo.locale ?? textSettings.locale,
    runtimeInfo.dateStyle ?? textSettings.dateStyle,
    runtimeInfo.timeStyle ?? textSettings.timeStyle,
  );
  lines.push(
    createCenteredStyledLine(
      [
        {
          raw: "local time: ",
          styled: colors.textBase.paint(theme, "local time: "),
        },
        {
          raw: localDateTime,
          styled: colors.textHighlight.paint(theme, localDateTime),
        },
      ],
      width,
    ),
  );

  return lines;
}

export function renderHeaderLines(
  width: number,
  theme: Theme,
  config: StartupHeaderConfig,
  runtimeInfo: HeaderRuntimeInfo = { piVersion: UNKNOWN_VALUE },
): string[] {
  const colors = resolveHeaderColorSettings(config, theme.name);
  const logoLines = renderLogoLines(width, theme, colors);
  const taglineLines = renderTaglineLines(width, theme, colors);
  const infoLines = renderHeaderInfoLines(width, theme, colors, config, runtimeInfo);

  return ["", ...logoLines, "", ...infoLines, "", ...taglineLines, ""].map((line) =>
    fitLineToWidth(line, width),
  );
}
