# Git Menu — Phase 8: CI/CD — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GitHub Actions so that pushing a `v*` tag builds the unsigned macOS **dmg + zip** and publishes them to a **GitHub Release**, plus a CI workflow that runs tests + a build sanity check on PRs and `main`. Cut the first release (`v0.1.0`).

**Architecture:** `.github/workflows/release.yml` runs on `macos-latest` on `v*` tags: `npm ci` → `vite build` → `electron-builder --publish always` (publishes to the GitHub Release for the tag using the `publish: github` config already in `package.json`), with signing explicitly disabled. `.github/workflows/ci.yml` runs `npm test` + `vite build` on PRs and pushes to `main`. A `release` npm script + README docs make cutting a release one command. No new runtime deps.

**Tech Stack:** GitHub Actions, electron-builder 26 (GitHub publish), Node 20.

**Spec:** `docs/superpowers/specs/2026-06-05-git-menu-redesign-design.md` §11 (CI/CD). The custom updater (Phase 9) consumes the published dmg/zip assets via the Releases API.

**Branch:** subagent-driven-development should create/work on `phase-8-ci` off `main`.

> **Why `macos-latest` for both:** the app is macOS-only and `canvas` (a native dep used by the
> tray-icon compositor + tests) builds cleanly on macOS runners without extra system libs. Public
> repos get unlimited free Actions minutes, so the macOS runner cost is not a concern here.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `.github/workflows/release.yml` | Create | Build + publish unsigned dmg+zip to a GitHub Release on `v*` tags |
| `.github/workflows/ci.yml` | Create | `npm test` + `vite build` on PRs and pushes to `main` |
| `package.json` | Modify | add a `release` helper script |
| `README.md` | Modify | "Releasing" section |

---

## Task 1: Release workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

jobs:
  release:
    runs-on: macos-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build renderer
        run: npx vite build

      - name: Build + publish (unsigned)
        run: npx electron-builder --publish always
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          CSC_IDENTITY_AUTO_DISCOVERY: 'false'
```

> Notes: `permissions: contents: write` lets the default `GITHUB_TOKEN` create the Release.
> electron-builder reads `GH_TOKEN` and the `build.publish` GitHub config in `package.json`.
> `CSC_IDENTITY_AUTO_DISCOVERY: 'false'` (plus `mac.identity: null` already set) guarantees an
> unsigned build with no keychain lookups.

- [ ] **Step 2: Verify it's well-formed YAML**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/release.yml')); print('release.yml OK')"`
Expected: `release.yml OK`.
(If `python3`/pyyaml is unavailable, skip — GitHub validates the workflow on push; the first tag in Task 5 is the real test.)

---

## Task 2: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches:
      - main

jobs:
  test:
    runs-on: macos-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Unit tests
        run: npm test

      - name: Build sanity (renderer + unpackaged app)
        run: npm run pack
```

- [ ] **Step 2: Verify it's well-formed YAML**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('ci.yml OK')"`
Expected: `ci.yml OK` (or skip if pyyaml unavailable).

---

## Task 3: Release helper + README

**Files:**
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Add the `release` script**

In `package.json` `scripts`, add a `release` entry so it reads:

```json
  "scripts": {
    "dev": "concurrently \"vite\" \"sleep 2 && cross-env NODE_ENV=development electron .\"",
    "build": "vite build && electron-builder",
    "pack": "vite build && electron-builder --dir",
    "preview": "vite preview",
    "test": "node --test",
    "release": "npm version patch && git push --follow-tags"
  },
```

- [ ] **Step 2: Publish full releases (not drafts) so the updater can find them**

In `package.json` `build.publish`, add `"releaseType": "release"` to the GitHub entry so it reads:

```json
    "publish": [
      {
        "provider": "github",
        "owner": "Artim-Nayas",
        "repo": "git-menu",
        "releaseType": "release"
      }
    ]
```

> electron-builder's GitHub publisher defaults to a **draft** release; the Phase 9 self-updater
> queries `releases/latest`, which excludes drafts. `releaseType: "release"` publishes immediately.

- [ ] **Step 3: Verify the script + publish config are valid**

Run: `node -e "const p=require('./package.json'); console.log(p.scripts.release, p.build.publish[0].releaseType)"`
Expected: `npm version patch && git push --follow-tags release`

- [ ] **Step 4: Add a "Releasing" section to the README**

In `README.md`, add this section just before the `## License` section:

```markdown
## Releasing (maintainers)

Releases are built and published automatically by GitHub Actions on any `v*` tag.

```bash
npm run release          # bumps the patch version, tags, and pushes the tag
# or, for a minor/major bump:
npm version minor && git push --follow-tags
```

The `Release` workflow builds the unsigned `.dmg` + `.zip` on a macOS runner and
attaches them to a new GitHub Release for that tag. (The app is unsigned — see the
first-launch note under Install.)
```

- [ ] **Step 5: Verify**

Run: `grep -c "Releasing (maintainers)" README.md`
Expected: `1`

- [ ] **Step 6: Commit everything**

```bash
git add .github/workflows/release.yml .github/workflows/ci.yml package.json README.md
git commit -m "ci: GitHub Actions release (dmg+zip on v* tags) + PR/main CI + release helper"
```

---

## Task 4: Local verification

**Files:** none (verification)

- [ ] **Step 1: Tests + packaging still green locally**

Run: `npm test && npm run pack`
Expected: tests pass; `release/mac-arm64/Git Menu.app` is produced. (This mirrors what the CI build does.)

- [ ] **Step 2: Confirm the workflow files are in place**

Run: `ls .github/workflows/`
Expected: `ci.yml` and `release.yml`.

---

## Task 5: Integrate + cut the first release

> This task is run by the controller (not a fresh implementer subagent), because it merges to
> `main` and then watches a live GitHub Actions run.

- [ ] **Step 1: Finish the branch**

Use **superpowers:finishing-a-development-branch** to merge `phase-8-ci` into `main` and push, then delete the feature branch. Pushing to `main` triggers the **CI** workflow — confirm it succeeds:

```bash
gh run list --workflow=ci.yml --limit 1
gh run watch <run-id>   # or: gh run list and open the latest
```
Expected: the CI run is green (tests + pack on the macOS runner).

- [ ] **Step 2: Cut `v0.1.0`**

From `main` (clean tree):

```bash
git tag -a v0.1.0 -m "Git Menu v0.1.0"
git push origin v0.1.0
```
(Or `npm run release` to bump to `0.1.1` and tag — but for the first release, tag the existing `0.1.0` explicitly as above so the tag matches `package.json`.)

- [ ] **Step 3: Watch the Release workflow**

```bash
gh run list --workflow=release.yml --limit 1
gh run watch <run-id>
```
Expected: the Release run is green. If the `canvas` native build fails on the runner, capture the log and fix (e.g. pin a node version or add a build step) before retrying.

- [ ] **Step 4: Confirm the GitHub Release + assets**

```bash
gh release view v0.1.0 --json name,assets -q '.name, (.assets[].name)'
```
Expected: a `v0.1.0` release exists with a `.dmg` and a `.zip` asset (plus electron-builder metadata like `latest-mac.yml`/blockmaps, which are harmless).

- [ ] **Step 5: Sanity-download the dmg (optional)**

```bash
gh release download v0.1.0 --pattern '*.dmg' --dir /tmp/gm-release && ls -la /tmp/gm-release
```
Expected: the dmg downloads and is a non-trivial size (hundreds of MB).

---

## Phase 8 Acceptance

- `.github/workflows/release.yml` publishes an unsigned `.dmg` + `.zip` to a GitHub Release on `v*` tags (signing disabled, `GITHUB_TOKEN` with `contents: write`).
- `.github/workflows/ci.yml` runs `npm test` + `npm run pack` on PRs and `main`.
- `npm run release` (+ README "Releasing") makes cutting a release one command.
- `main` is merged and **`v0.1.0` is published** with downloadable dmg/zip assets; CI is green.

**Next phase:** Phase 9 — in-app self-updater (check the Releases API, surface "Update available" in Settings, download + install the new version, with a DMG-open fallback).
