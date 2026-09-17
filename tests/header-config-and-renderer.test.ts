import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import { HeaderColor } from "../extensions/shared/header-color.ts";
import {
  DEFAULT_HEADER_COLORS,
  EMPTY_STARTUP_HEADER_CONFIG,
  loadStartupHeaderConfig,
  parseStartupHeaderConfig,
  resolveHeaderColorSettings,
  resolveHeaderTextSettings,
  resolveShowTimeGreeting,
} from "../extensions/shared/header-config.ts";
import {
  FALLBACK_LOGO_GRADIENT_BASE_RGB,
  LOGO_BLOCK_WIDTH,
  LOGO_LINES,
  formatLocalDateTime,
  getLogoGradientPosition,
  getTimeGreeting,
  renderHeaderLines,
  resolveLogoGradientBaseRgb,
} from "../extensions/shared/header-renderer.ts";

function createTheme(
  colors: Partial<Record<ThemeColor, string>> = {},
  name = "test-theme",
): Theme {
  return {
    name,
    getFgAnsi(color: ThemeColor): string {
      return colors[color] ?? "\x1b[39m";
    },
    fg(color: ThemeColor, text: string): string {
      return `<${color}>${text}</${color}>`;
    },
    bold(text: string): string {
      return `<bold>${text}</bold>`;
    },
  } as unknown as Theme;
}

test("未配置时使用既有的三种默认 ThemeColor", () => {
  const theme = createTheme();
  const colors = resolveHeaderColorSettings(EMPTY_STARTUP_HEADER_CONFIG, "test-theme");

  assert.equal(colors.logoGradientBase, DEFAULT_HEADER_COLORS.logoGradientBase);
  assert.equal(colors.textBase.paint(theme, "text"), "<accent>text</accent>");
  assert.equal(colors.textHighlight.paint(theme, "text"), "<mdLink>text</mdLink>");
});

test("不存在配置文件时静默使用默认配置", async () => {
  const path = join(tmpdir(), `pi-startup-header-${randomUUID()}.json`);

  assert.equal(await loadStartupHeaderConfig(path), EMPTY_STARTUP_HEADER_CONFIG);
});

test("general 与主题专属配置按字段合并", () => {
  const config = parseStartupHeaderConfig({
    general: {
      logoGradientBase: "success",
      textBase: "#112233",
      textHighlight: 117,
    },
    themeOverrides: [
      {
        theme: "test-theme",
        logoGradientBase: "thinkingMax",
        textHighlight: "mdHeading",
      },
    ],
  });
  const theme = createTheme();
  const matched = resolveHeaderColorSettings(config, "test-theme");
  const unmatched = resolveHeaderColorSettings(config, "other-theme");

  assert.equal(matched.logoGradientBase.paint(theme, "text"), "<thinkingMax>text</thinkingMax>");
  assert.equal(matched.textBase.paint(theme, "text"), "\x1b[38;2;17;34;51mtext\x1b[0m");
  assert.equal(matched.textHighlight.paint(theme, "text"), "<mdHeading>text</mdHeading>");
  assert.equal(unmatched.logoGradientBase.paint(theme, "text"), "<success>text</success>");
  assert.deepEqual(unmatched.textHighlight.toRgb(theme), [135, 215, 255]);
  assert.equal(resolveHeaderColorSettings(config, undefined).logoGradientBase.paint(theme, "text"), "<success>text</success>");
});

test("HeaderColor 接受新增的 thinkingMax ThemeColor", () => {
  assert.doesNotThrow(() => HeaderColor.parse("thinkingMax", "color"));
  assert.throws(() => HeaderColor.parse("selectedBg", "color"));

  const config = parseStartupHeaderConfig({
    general: { textHighlight: "thinkingMax" },
  });
  assert.equal(
    resolveHeaderColorSettings(config, "test-theme").textHighlight.paint(createTheme(), "text"),
    "<thinkingMax>text</thinkingMax>",
  );
});

test("拒绝无效颜色、未知字段和重复主题覆盖", () => {
  const invalidConfigs = [
    { general: { textBase: "#fff" } },
    { general: { textBase: "39" } },
    { general: { textBase: -1 } },
    { general: { textBase: 256 } },
    { general: { textBase: "not-a-theme-variable" } },
    { general: { textBase: "" } },
    { general: { selectedBg: "accent" } },
    { locale: "en_US" },
    { dateStyle: "invalid" },
    { timeStyle: "invalid" },
    { showTimeGreeting: "true" },
    { general: { showTimeGreeting: "true" } },
    {
      themeOverrides: [
        { theme: "duplicate", textBase: "accent" },
        { theme: "duplicate", textHighlight: "mdLink" },
      ],
    },
  ];

  for (const config of invalidConfigs) {
    assert.throws(() => parseStartupHeaderConfig(config));
  }
});

test("HeaderColor 在解析时统一转换 Hex 与 256 色输入", () => {
  const theme = createTheme();

  assert.deepEqual(HeaderColor.parse("#12AbEf", "color").toRgb(theme), [18, 171, 239]);
  assert.deepEqual(HeaderColor.parse(39, "color").toRgb(theme), [0, 175, 255]);
  assert.deepEqual(HeaderColor.parse(255, "color").toRgb(theme), [238, 238, 238]);
});

test("Logo base 保留 ThemeColor ANSI 解析失败时的 fallback", () => {
  const resolvableTheme = createTheme({ accent: "\x1b[38;2;12;34;56m" });
  const unresolvedTheme = createTheme();

  assert.deepEqual(
    resolveLogoGradientBaseRgb(resolvableTheme, HeaderColor.parse("accent", "color")),
    [12, 34, 56],
  );
  assert.deepEqual(
    resolveLogoGradientBaseRgb(resolvableTheme, HeaderColor.parse("#abcdef", "color")),
    [171, 205, 239],
  );
  assert.deepEqual(
    resolveLogoGradientBaseRgb(resolvableTheme, HeaderColor.parse(39, "color")),
    [0, 175, 255],
  );
  assert.deepEqual(
    resolveLogoGradientBaseRgb(unresolvedTheme, HeaderColor.parse("accent", "color")),
    FALLBACK_LOGO_GRADIENT_BASE_RGB,
  );
});

test("HeaderColor 委托 ThemeColor 和直接 RGB 的文本渲染", () => {
  const theme = createTheme({ accent: "\x1b[38;2;12;34;56m" });

  assert.equal(HeaderColor.parse("accent", "color").paint(theme, "text"), "<accent>text</accent>");
  assert.equal(
    HeaderColor.parse("#010203", "color").paint(theme, "text"),
    "\x1b[38;2;1;2;3mtext\x1b[0m",
  );
  assert.equal(
    HeaderColor.parse(39, "color").paint(theme, "text"),
    "\x1b[38;2;0;175;255mtext\x1b[0m",
  );
});

test("Logo 渐变始终以最大行宽计算横向位置", () => {
  assert.equal(LOGO_BLOCK_WIDTH, 17);
  assert.equal(LOGO_BLOCK_WIDTH, Math.max(...LOGO_LINES.map((line) => [...line].length)));
  assert.equal(getLogoGradientPosition(12, 0), 0.75);
  assert.equal(getLogoGradientPosition(16, 0), 1);
});

test("欢迎语配置支持用户名和 {name} 占位符", () => {
  const config = parseStartupHeaderConfig({
    userName: "  Ada Lovelace  ",
    welcomeMessage: "Hello, {name}.",
  });

  assert.deepEqual(resolveHeaderTextSettings(config), {
    userName: "Ada Lovelace",
    welcomeMessage: "Hello, {name}.",
    locale: undefined,
    dateStyle: "full",
    timeStyle: "long",
  });
});

test("欢迎语也可以放在 general 中，并拒绝空文本", () => {
  const config = parseStartupHeaderConfig({
    general: {
      userName: "Grace",
      welcomeMessage: "Welcome back, {name}!",
    },
  });

  assert.deepEqual(resolveHeaderTextSettings(config), {
    userName: "Grace",
    welcomeMessage: "Welcome back, {name}!",
    locale: undefined,
    dateStyle: "full",
    timeStyle: "long",
  });
  assert.throws(() => parseStartupHeaderConfig({ userName: "   " }));
  assert.throws(() => parseStartupHeaderConfig({ welcomeMessage: "line 1\nline 2" }));
});

test("showTimeGreeting 控制问候语，并按本地小时生成文本", () => {
  assert.equal(getTimeGreeting(new Date(2026, 8, 17, 4, 0)), "Good night!");
  assert.equal(getTimeGreeting(new Date(2026, 8, 17, 5, 0)), "Good morning!");
  assert.equal(getTimeGreeting(new Date(2026, 8, 17, 11, 59)), "Good morning!");
  assert.equal(getTimeGreeting(new Date(2026, 8, 17, 12, 0)), "Good afternoon!");
  assert.equal(getTimeGreeting(new Date(2026, 8, 17, 17, 59)), "Good afternoon!");
  assert.equal(getTimeGreeting(new Date(2026, 8, 17, 18, 0)), "Good evening!");

  assert.equal(resolveShowTimeGreeting(parseStartupHeaderConfig({})), true);
  assert.equal(resolveShowTimeGreeting(parseStartupHeaderConfig({ showTimeGreeting: false })), false);
  assert.equal(
    resolveShowTimeGreeting(parseStartupHeaderConfig({ general: { showTimeGreeting: false } })),
    false,
  );

  const now = new Date(2026, 8, 17, 9, 0);
  const enabledLines = renderHeaderLines(300, createTheme(), parseStartupHeaderConfig({}), {
    piVersion: "0.85.1",
    now,
  });
  const disabledLines = renderHeaderLines(
    300,
    createTheme(),
    parseStartupHeaderConfig({ showTimeGreeting: false }),
    { piVersion: "0.85.1", now },
  );

  assert.ok(enabledLines.some((line) => line.includes("Good morning!")));
  assert.ok(!disabledLines.some((line) => line.includes("Good morning!")));
});

test("locale 配置控制日期格式，省略时使用系统 locale", () => {
  const config = parseStartupHeaderConfig({ locale: "en-GB" });
  const now = new Date("2026-09-17T01:30:00.000Z");
  const lines = renderHeaderLines(300, createTheme(), config, {
    piVersion: "0.85.1",
    now,
  });

  assert.ok(lines.some((line) => line.includes(formatLocalDateTime(now, "en-GB"))));
  assert.equal(resolveHeaderTextSettings(config).locale, "en-GB");
});

test("dateStyle 和 timeStyle 配置控制日期时间格式", () => {
  const config = parseStartupHeaderConfig({
    locale: "en-GB",
    dateStyle: "short",
    timeStyle: "short",
  });
  const now = new Date("2026-09-17T01:30:00.000Z");
  const lines = renderHeaderLines(300, createTheme(), config, {
    piVersion: "0.85.1",
    now,
  });

  assert.equal(resolveHeaderTextSettings(config).dateStyle, "short");
  assert.equal(resolveHeaderTextSettings(config).timeStyle, "short");
  assert.ok(
    lines.some(
      (line) =>
        line.includes("local time:") &&
        line.includes(formatLocalDateTime(now, "en-GB", "short", "short")),
    ),
  );
});

test("Header 显示 Pi 运行信息、欢迎语和本地时间", () => {
  const theme = createTheme();
  const config = parseStartupHeaderConfig({
    userName: "Ada",
    welcomeMessage: "Welcome, {name}!",
  });
  const now = new Date(2026, 8, 17, 9, 30);
  const lines = renderHeaderLines(300, theme, config, {
    piVersion: "0.85.1",
    provider: "openai-codex",
    model: "gpt-5.6-luna",
    thinkingLevel: "medium",
    now,
    locale: "en-US",
  });

  assert.ok(lines.some((line) => line.includes("pi v0.85.1")));
  assert.ok(lines.some((line) => line.includes("provider:") && line.includes("openai-codex")));
  assert.ok(lines.some((line) => line.includes("model:") && line.includes("gpt-5.6-luna")));
  assert.ok(lines.some((line) => line.includes("thinking:") && line.includes("medium")));
  const welcomeLineIndex = lines.findIndex((line) =>
    line.includes(`Welcome, Ada! ${getTimeGreeting(now)}`),
  );
  assert.notEqual(welcomeLineIndex, -1);
  assert.equal(lines[welcomeLineIndex - 1], "");
  assert.equal(
    formatLocalDateTime(now, "en-US"),
    now.toLocaleString("en-US", { dateStyle: "full", timeStyle: "long" }),
  );
  assert.ok(
    lines.some(
      (line) =>
        line.includes("local time:") && line.includes(formatLocalDateTime(now, "en-US")),
    ),
  );
});
