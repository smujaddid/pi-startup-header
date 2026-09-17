# Pi Startup Header

[English](README.md) | 简体中文

每次打开 Pi TUI，迎接你的总是那段平平无奇的浅色文本：

```
pi v0.xx.x
escape interrupt · ctrl+c/ctrl+d clear/exit · / commands · ! bash · ctrl+o more
Press ctrl+o to show full startup help and loaded resources.

Pi can explain its own features and look up its docs. Ask it how to use or extend Pi.
```

它契合 Pi 在设计上独有的克制，却让人略感无聊。终于有一天，你彻底厌倦了。

## 概要

`pi-startup-header` 用一个跟随主题的渐变 ASCII Header 替换 Pi 默认启动头部，并显示运行信息、可配置的欢迎语和本地时钟。

## 安装

### npm package

```bash
pi install npm:pi-startup-header
```

### Git repository

```bash
pi install git:github.com/EnderLiquid/pi-startup-header
```

## 在 Pi 中配置

使用 `/startup-header` 斜杠命令打开类似 Pi `/settings` 的交互式设置列表。日期和时间样式及时间问候语可用 Enter/Space 循环切换；在文本或颜色设置上按 Enter 可打开单行编辑器。有效修改会立即保存并应用：

```text
/startup-header
```

使用 `/startup-header reset` 删除配置文件并恢复默认设置。

## 功能

优秀的 AI 编码终端，理应搭配优雅的启动页头部——`pi-startup-header` 正是为此而生。

既然 [Pi 的官网主页](https://pi.dev/) 设计让人印象深刻，我们为什么不把它搬进终端呢？

`pi-startup-header` 会在会话开始时把默认顶部 header 替换成 Pi 风格的渐变 ASCII Logo、运行信息和官网标语。Header 会显示当前 Pi 版本、Provider、选中的模型、Thinking 等级、根据本地时间变化的问候语、可配置的欢迎语，以及当前本地日期和时间。切换模型或 Thinking 等级时，信息也会更新。

默认情况下，Logo 和标语的取色完全基于当前主题，无需额外配置，就能得到协调的视觉效果。

从启动 Pi 的那一刻起，界面就会有一点不一样。

## 配置

设置界面会自动写入以下文件。如需配置主题专属颜色覆盖，或直接使用高级 JSON 格式，请编辑：

```text
~/.pi/agent/pi-startup-header.json
```

使用自定义 Pi agent 目录时，配置文件位于对应目录。

配置文件格式：

```json
{
  "userName": "Ada Lovelace",
  "welcomeMessage": "Welcome, {name}!",
  "tagline": "A custom tagline goes here",
  "timeZone": "UTC",
  "locale": "en-GB",
  "dateStyle": "full",
  "timeStyle": "long",
  "showTimeGreeting": true,
  "showTagline": true,
  "showTimeZoneName": true,
  "showLabels": true,
  "general": {
    "logoGradientBase": "accent",
    "textBase": "accent",
    "textHighlight": "mdLink"
  },
  "themeOverrides": [
    {
      "theme": "my-dark-theme",
      "logoGradientBase": "#7aa2f7",
      "textHighlight": "success"
    }
  ]
}
```

`userName`、`welcomeMessage`、`tagline`、`locale`、`dateStyle`、`timeStyle`、`timeZone`、`showTimeGreeting`、`showTagline`、`showTimeZoneName` 和 `showLabels` 均为可选配置；`welcomeMessage` 中的 `{name}` 会替换为配置的用户名。如果没有配置 `userName`，插件会在可用时使用当前本地账户名。`tagline` 可以替换默认标语；为空时回退到默认的两行标语。`locale` 使用 BCP 47 格式，例如 `en-GB` 或 `de-DE`；省略时使用系统 locale。`dateStyle` 和 `timeStyle` 可使用 `full`、`long`、`medium` 或 `short`，默认分别为 `full` 和 `long`。`timeZone` 可使用 `UTC`、`Asia/Makassar` 或 `America/New_York` 等 IANA 时区；省略或为空时使用本地时区。`showTimeGreeting` 默认为 `true`，用于控制根据本地时间显示的问候语（`Good morning!`、`Good afternoon!`、`Good evening!` 或 `Good night!`）。`showTagline` 默认为 `true`，用于控制运行信息下方的标语。`showTimeZoneName` 默认为 `true`，用于控制时间字段标签中是否显示配置的时区名称。`showLabels` 默认为 `true`，用于统一控制所有运行信息字段标签，不提供单独的标签开关。文本和显示配置也可以放在 `general` 中，顶层配置优先。

每个颜色可填写以下三类值之一：

- Pi 的前景 `ThemeColor`，例如 `"accent"`、`"mdLink"`、`"success"`；
- 6 位 RGB Hex 值，例如 `"#7aa2f7"`；
- `0` 至 `255` 的 xterm 256 色调色板索引，例如 `117`。

每个颜色字段独立按优先级解析：

- `themeOverrides` 中 `theme` 与当前主题名完全匹配（区分大小写）的覆盖项优先于 `general`，主题覆盖中省略的字段继承 `general`；
- 无命中的覆盖项时使用 `general` 配置，`general` 中省略的字段继承内置默认值。
- 内置默认值中，Logo 渐变和普通标语文字使用 `accent`，高亮文字使用 `mdLink`。

通过 `/startup-header` 修改会立即生效。直接编辑 JSON 文件后请执行 `/reload`。JSON 或配置值无效时，插件会显示警告，并回退到内置默认配置。

## 预览

一张图胜过千言万语：

![Pi Startup Header 预览图](https://fastly.jsdelivr.net/gh/EnderLiquid/pi-startup-header@main/assets/preview.png)

## 依赖

本插件需要 Pi 0.84.0 或更高版本。

## 许可证

MIT License
