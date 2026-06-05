# Git Menu

A lightweight macOS menu-bar app for your GitHub work — pull requests, review
requests, a notifications inbox, and your contribution activity — without
leaving the menu bar. Powered entirely by the [`gh`](https://cli.github.com)
CLI, so it uses your existing GitHub auth.

> Status: early (`v0.1.0`). macOS (Apple Silicon) only for now.

## Install

1. Install and authenticate the GitHub CLI:
   ```bash
   brew install gh
   gh auth login
   ```
2. Download the latest **`Git Menu-*.dmg`** from
   [Releases](https://github.com/Artim-Nayas/git-menu/releases).
3. Open the DMG and drag **Git Menu** to Applications.
4. **First launch:** the app is unsigned (free, no Apple Developer account), so
   macOS Gatekeeper will warn you. **Right-click the app → Open** once to allow it.
   After that it launches normally.

The app lives in your menu bar (no Dock icon). Click the icon to see your PRs.

## Features

- **Mine / Reviews / Inbox** tabs — your open PRs, PRs awaiting your review, and
  a smart notifications inbox (review requests, mentions, replies).
- **Contribution activity** — streak, today, and an expandable heatmap.
- **At-a-glance status** — CI state, review decision, diffstat, labels.
- **Menu-bar count** of items that actually need you.
- **Keyboard-first** — global hotkey, `j`/`k` navigation, quick search.
- **Self-updating** — check for and install updates from Settings.

## Build from source

```bash
git clone https://github.com/Artim-Nayas/git-menu.git
cd git-menu
npm install
npm run dev      # run locally
npm run build    # produce an unsigned DMG + ZIP in ./release
```

## Contributing

Issues and PRs welcome. This is an open-source MIT project — see [LICENSE](LICENSE).

## License

[MIT](LICENSE) © 2026 Artim-Nayas
