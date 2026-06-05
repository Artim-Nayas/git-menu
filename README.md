# Git Menu

[![Release](https://img.shields.io/github/v/release/Artim-Nayas/git-menu?sort=semver)](https://github.com/Artim-Nayas/git-menu/releases/latest)
[![CI](https://github.com/Artim-Nayas/git-menu/actions/workflows/ci.yml/badge.svg)](https://github.com/Artim-Nayas/git-menu/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/Artim-Nayas/git-menu)](LICENSE)
![Platform: macOS](https://img.shields.io/badge/platform-macOS-lightgrey)

A lightweight macOS menu-bar app for your GitHub work — pull requests, review
requests, a notifications inbox, and your contribution activity — without
leaving the menu bar. Powered entirely by the [`gh`](https://cli.github.com)
CLI, so it uses your existing GitHub auth.

> Status: early. macOS (Apple Silicon) only for now.

## Screenshot

<p align="center"><img src="docs/screenshot.png" alt="Git Menu popover" width="380"></p>

## Install

1. Install and authenticate the GitHub CLI:
   ```bash
   brew install gh
   gh auth login
   ```
2. Download the latest **`Git Menu-*.dmg`** from
   [Releases](https://github.com/Artim-Nayas/git-menu/releases).
3. Open the DMG and drag **Git Menu** to Applications.
4. **First launch:** the app is ad-hoc signed but not notarized (free, no Apple
   Developer account), so macOS gates the first open. **Surest way** — clear the
   download quarantine once, then open normally:
   ```bash
   xattr -dr com.apple.quarantine "/Applications/Git Menu.app"
   ```
   **Or, without Terminal:**
   - **macOS 15 (Sequoia) and newer:** double-click → on "Apple could not verify…"
     click **Done**, then go to **System Settings → Privacy & Security**, scroll to
     **Security**, and click **Open Anyway** next to Git Menu → authenticate → **Open Anyway**.
   - **Older macOS:** **right-click the app → Open → Open**.

   Do **not** click "Move to Bin" — the app is fine, just not Apple-notarized.

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

## Releasing (maintainers)

Releases are built and published automatically by GitHub Actions on any `v*` tag.

```bash
git checkout main && git pull   # release from a clean, up-to-date main
npm run release                 # bumps the patch version, tags, and pushes the tag
# or, for a minor/major bump:
npm version minor && git push --follow-tags
```

The `Release` workflow builds the unsigned `.dmg` + `.zip` on a macOS runner and
attaches them to a new GitHub Release for that tag. (The app is unsigned — see the
first-launch note under Install.)

## License

[MIT](LICENSE) © 2026 Artim-Nayas
