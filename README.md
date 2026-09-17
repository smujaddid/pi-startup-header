# Pi Startup Header

English | [简体中文](README.zh-CN.md)

Every time you open the Pi TUI, you are greeted by the same plain, pale block of startup text:

```
pi v0.xx.x
escape interrupt · ctrl+c/ctrl+d clear/exit · / commands · ! bash · ctrl+o more
Press ctrl+o to show full startup help and loaded resources.

Pi can explain its own features and look up its docs. Ask it how to use or extend Pi.
```

It fits Pi's signature restraint perfectly, but after a while, it can start to feel a little dull. And one day, you finally get tired of it.

## Summary

`pi-startup-header` replaces Pi's default startup header with a theme-aware gradient ASCII header that also shows runtime details, a time-aware greeting, a configurable welcome, and the local clock.

## Install

### npm package

```bash
pi install npm:pi-startup-header
```

### Git repository

```bash
pi install git:github.com/EnderLiquid/pi-startup-header
```

## Configure from Pi

Use the `/startup-header` slash command to open an interactive settings list, similar to Pi's `/settings` command. Use Enter/Space to cycle date and time styles or toggle the time greeting; Enter on a text or color setting opens a single-line editor. Valid changes are saved and applied immediately:

```text
/startup-header
```

Use `/startup-header reset` to remove the configuration file and restore defaults.

## What it does

A great AI coding terminal deserves a better startup header — that is exactly what `pi-startup-header` is for.

[Pi's official website](https://pi.dev/) already leaves a strong visual impression. Why not bring some of that feeling into the terminal?

`pi-startup-header` replaces the default top header at session start with a Pi-style gradient ASCII logo, runtime details, and tagline. The header shows the running Pi version, provider, selected model, thinking level, a time-aware greeting, a configurable welcome message, and the current local date and time. Model and thinking details are refreshed when they change.

By default, the logo and tagline colors come entirely from your current Pi theme, so the result stays visually consistent without any extra configuration.

From the moment Pi starts, the interface feels just a little different.

## Configuration

The settings UI writes this file for you. To configure theme-specific color overrides, or to use the advanced JSON format directly, edit:

```text
~/.pi/agent/pi-startup-header.json
```

If you use a custom Pi agent directory, the configuration file is located in that directory.

Configuration file format:

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

`userName`, `welcomeMessage`, `tagline`, `locale`, `dateStyle`, `timeStyle`, `timeZone`, `showTimeGreeting`, `showTagline`, `showTimeZoneName`, and `showLabels` are optional. `{name}` in `welcomeMessage` is replaced with the configured name. If no `userName` is configured, the extension uses the local account name when available. `tagline` replaces the default tagline text; an empty value falls back to the default two-line tagline. `locale` is a BCP 47 locale such as `en-GB` or `de-DE`; when omitted, the system locale is used. `dateStyle` and `timeStyle` accept `full`, `long`, `medium`, or `short`; they default to `full` and `long`. `timeZone` accepts an IANA time zone such as `UTC`, `Asia/Makassar`, or `America/New_York`; when omitted or empty, the local time zone is used. `showTimeGreeting` defaults to `true` and controls the local-time greeting (`Good morning!`, `Good afternoon!`, `Good evening!`, or `Good night!`). `showTagline` defaults to `true` and controls the tagline below the runtime information. `showTimeZoneName` defaults to `true` and controls whether the configured time zone appears in the time field label. `showLabels` defaults to `true` and controls all runtime field labels together; it does not provide individual label toggles. Text and display settings can also be placed inside `general`; top-level values take precedence.

Each color can use one of the following value types:

- A Pi foreground `ThemeColor`, such as `"accent"`, `"mdLink"`, or `"success"`.
- A six-digit RGB hex value, such as `"#7aa2f7"`.
- An xterm 256-color palette index from `0` to `255`, such as `117`.

Each color field is resolved independently according to the following precedence:

- An override whose `theme` exactly matches the current theme name, including case, takes precedence over `general`; omitted fields inherit from `general`.
- When no override matches, values from `general` are used; omitted `general` fields inherit the built-in defaults.
- The built-in defaults use `accent` for the Logo gradient and normal tagline text, and `mdLink` for highlighted text.

Changes made through `/startup-header` apply immediately. If you edit the JSON file directly, run `/reload` afterward. If the JSON or configuration values are invalid, the plugin shows a warning at startup and falls back to the built-in defaults.

## Preview

A picture is worth a thousand words:

![Pi Startup Header preview](https://fastly.jsdelivr.net/gh/EnderLiquid/pi-startup-header@main/assets/preview.png)

## Requirements

This plugin requires Pi 0.84.0 or later.

## License

MIT License
