import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_HEADER_COLORS,
  EMPTY_STARTUP_HEADER_CONFIG,
  THEME_COLOR_VALUES,
  isThemeColor,
  loadStartupHeaderConfig,
  parseStartupHeaderConfig,
  resolveHeaderColorSettings,
} from "../extensions/shared/header-config.ts";
import {
  FALLBACK_LOGO_GRADIENT_BASE_RGB,
  LOGO_BLOCK_WIDTH,
  LOGO_LINES,
  ansi256ToRgb,
  applyConfiguredTextColor,
  getLogoGradientPosition,
  parseHexRgb,
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
  assert.deepEqual(
    resolveHeaderColorSettings(EMPTY_STARTUP_HEADER_CONFIG, "test-theme"),
    DEFAULT_HEADER_COLORS,
  );
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

  assert.deepEqual(resolveHeaderColorSettings(config, "test-theme"), {
    logoGradientBase: "thinkingMax",
    textBase: "#112233",
    textHighlight: "mdHeading",
  });
  assert.deepEqual(resolveHeaderColorSettings(config, "other-theme"), {
    logoGradientBase: "success",
    textBase: "#112233",
    textHighlight: 117,
  });
  assert.deepEqual(resolveHeaderColorSettings(config, undefined), {
    logoGradientBase: "success",
    textBase: "#112233",
    textHighlight: 117,
  });
});

test("支持新增的 thinkingMax ThemeColor", () => {
  assert.ok(THEME_COLOR_VALUES.includes("thinkingMax"));
  assert.ok(isThemeColor("thinkingMax"));
  assert.equal(isThemeColor("selectedBg"), false);

  const config = parseStartupHeaderConfig({
    general: { textHighlight: "thinkingMax" },
  });
  assert.equal(resolveHeaderColorSettings(config, "test-theme").textHighlight, "thinkingMax");
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

test("Hex 与 256 色输入会解析为预期 RGB", () => {
  assert.deepEqual(parseHexRgb("#12AbEf"), [18, 171, 239]);
  assert.deepEqual(ansi256ToRgb(39), [0, 175, 255]);
  assert.deepEqual(ansi256ToRgb(255), [238, 238, 238]);
});

test("Logo base 保留 ThemeColor ANSI 解析失败时的 fallback", () => {
  const resolvableTheme = createTheme({ accent: "\x1b[38;2;12;34;56m" });
  const unresolvedTheme = createTheme();

  assert.deepEqual(resolveLogoGradientBaseRgb(resolvableTheme, "accent"), [12, 34, 56]);
  assert.deepEqual(resolveLogoGradientBaseRgb(resolvableTheme, "#abcdef"), [171, 205, 239]);
  assert.deepEqual(resolveLogoGradientBaseRgb(resolvableTheme, 39), [0, 175, 255]);
  assert.deepEqual(
    resolveLogoGradientBaseRgb(unresolvedTheme, "accent"),
    FALLBACK_LOGO_GRADIENT_BASE_RGB,
  );
});

test("文本 ThemeColor 保持 theme.fg 路径，直接颜色输出 truecolor ANSI", () => {
  const theme = createTheme({ accent: "\x1b[38;2;12;34;56m" });

  assert.equal(applyConfiguredTextColor(theme, "accent", "text"), "<accent>text</accent>");
  assert.equal(
    applyConfiguredTextColor(theme, "#010203", "text"),
    "\x1b[38;2;1;2;3mtext\x1b[0m",
  );
  assert.equal(
    applyConfiguredTextColor(theme, 39, "text"),
    "\x1b[38;2;0;175;255mtext\x1b[0m",
  );
});

test("Logo 渐变始终以最大行宽计算横向位置", () => {
  assert.equal(LOGO_BLOCK_WIDTH, 17);
  assert.equal(LOGO_BLOCK_WIDTH, Math.max(...LOGO_LINES.map((line) => [...line].length)));
  assert.equal(getLogoGradientPosition(12, 0), 0.75);
  assert.equal(getLogoGradientPosition(16, 0), 1);
});
