<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="src/renderer/assets/wydbot-logo-white.svg">
    <source media="(prefers-color-scheme: light)" srcset="src/renderer/assets/wydbot-logo.svg">
    <img alt="WYDBot" src="src/renderer/assets/wydbot-logo.svg" width="305">
  </picture>
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://github.com/wydbot/wydbot/actions/workflows/ci.yml"><img src="https://github.com/wydbot/wydbot/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.electronjs.org/"><img src="https://img.shields.io/badge/Electron-42-blue" alt="Electron"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node-%E2%89%A520-brightgreen" alt="Node"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.9-blue" alt="TypeScript"></a>
</p>

**WYDBot** is a desktop client for **WYD2** with macro automation, built with
Electron. It speaks the game's binary TCP protocol, renders the world, and ships
a JavaScript macro/scripting layer so players can automate their own gameplay.

**🌐 [wydbot.com](https://wydbot.com)** — landing page oficial do projeto.

> **Disclaimer:** WYD2 — including all game content, assets, and trademarks — is the
> property of **JoyImpact** and **RaidHut**. WYDBot is an independent, unofficial
> project and is not affiliated with, endorsed by, or sponsored by them. This
> repository redistributes **no** proprietary game assets: the app downloads them
> from the publisher's official CDN on first launch, the same source the official
> launcher uses (see [INSTALL.md](./INSTALL.md)). Use at your own risk and in
> compliance with the game's terms of service.

---

## Features

- **Binary protocol client** — full packet codec, parsers and builders for the WYD2 wire format.
- **Validated login flow** — Zod-validated channel and credentials, automatic numeric-password submission, and server errors translated through the client string catalog.
- **Optional SOCKS5 routing** — downloads a proxy pool, rejects proxies above the configured latency ceiling, opens the game TCP tunnel, and uses the same selector for login and reconnect.
- **Session hardware identity** — optionally derives a stable, locally administered MAC and adapter GUID from the host MAC plus a per-session UUID without modifying the operating-system adapter.
- **Automatic reconnect** — up to 20 attempts with exponential backoff, proxy revalidation, login, numeric-password submission, character selection, and optional macro restart. Credentials remain in memory only and must be armed from Misc for the current app session.
- **World rendering** — heightmap-based walkability, entity tracking, minimap tiles.
- **Macro system** — step-based macros plus ambient modules (auto-potion, auto-heal, loot, combat) with a visual editor.
- **Script API** — write JavaScript macros against a typed `ctx` API (`ctx.player`, `ctx.monsters`, `ctx.npcs`, `ctx.macro`, …) executed in a sandboxed QuickJS runtime.
- **Game asset pipeline** — parsers for `ItemList.bin`, `SkillData.bin`, `MountData.bin`, `AttributeMap.dat`, `.wyt` atlases, and more, with derived caches for icons and maps.
- **Documentation site** — a VitePress site (`docs-site/`) with the full Script API reference for macro authors (pt-BR).

## Supported platforms

| Platform | Target                | Status                               |
| -------- | --------------------- | ------------------------------------ |
| Windows  | `zip` (x64, portable) | ✅ Released via CI (GitHub Releases) |
| macOS    | `dmg` / `zip`         | 🛠️ Build configured, manual          |
| Linux    | `AppImage`            | 🛠️ Build configured, manual          |

## Requirements

| Tool       | Version  | Notes                           |
| ---------- | -------- | ------------------------------- |
| Node.js    | **20+**  | 22 LTS recommended              |
| npm        | **10+**  | ships with Node                 |
| Electron   | **42.x** | pinned via `package.json`       |
| TypeScript | **5.9+** | strict mode, project references |

Development is actively tested on **Windows 10/11**, **macOS 12+**, and modern Linux
distros (glibc ≥ 2.31).

## Quick start

```bash
git clone https://github.com/wydbot/wydbot.git
cd wydbot
npm install

npm run dev        # Vite dev server + Electron (hot reload)
```

Game resources are downloaded automatically from the official CDN on first
launch (dev and packaged builds alike) — see [INSTALL.md](./INSTALL.md).

## Development

```bash
npm run dev          # Start in dev mode (HMR for renderer)
npm run build        # Bundle main/preload/renderer + build the docs
npm run start        # Preview the production build
npm run test         # Run the Vitest unit suite
npm run lint         # tsc -b --noEmit (full type-check)
npm run lint:eslint  # ESLint over src/ tests/ tools/
npm run lint:all     # type-check + eslint + prettier
```

## Building a distributable

```bash
npm run build:dist   # build + main-process protection + pack:win-zip
```

Output lands in `dist/`. Windows is the primary release target; the macOS and Linux
targets are configured in `package.json` (`build` section) and can be run with
`npx electron-builder --mac` / `--linux`.

## CI & releases

- **Pull requests** — GitHub Actions runs `tsc` + ESLint + Prettier + the full
  Vitest suite (`.github/workflows/ci.yml`).
- **Releases** — [release-please](https://github.com/googleapis/release-please)
  opens a Release PR with the next version and changelog on every push to
  `opensource`. Merging it tags the release and triggers the publish workflow,
  which builds the protected Windows installer and attaches `wyd-bot-X.Y.Z-x64.zip`
  to the GitHub Release (`.github/workflows/release.yml`). Re-publish an existing
  tag manually via **Actions → release → Run workflow**.

## Project layout

```
src/
├── main/          # Electron main process
│   ├── protocol/  # Binary packet codec, parsers, builders
│   ├── session/   # Connection state, action queue
│   ├── ipc/       # IPC handlers (Zod-validated)
│   ├── cache/     # Derived caches (icons, maps, heightmap)
│   └── game-assets/  # Parsers for the game's binary data files
├── preload/       # contextBridge (sandboxed)
├── renderer/      # React 19 UI (Zustand + Tailwind 4)
│   ├── components/
│   ├── stores/
│   └── lib/       # Macro system, Script API, walkability
└── shared/        # Shared types, IPC contracts, constants
docs-site/         # VitePress documentation (Script API, pt-BR)
build/             # electron-builder resources (icons, entitlements)
tests/             # Vitest unit + integration suites
tools/             # Build tooling, Vite plugins, codegen
```

## Documentation

The user-facing Script API docs (for macro authors, in pt-BR) live in
[`docs-site/`](./docs-site). Serve them locally with:

```bash
npm run docs:dev
```

## Contributing

Contributions are welcome:

1. Open an issue first to discuss the change you want to make.
2. Keep changes focused; follow the existing code style (Prettier + ESLint are enforced
   by lefthook on commit).
3. Make sure `npm run lint:all` and `npm run test` pass before opening a PR — CI
   runs both on every pull request.
4. Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`,
   `chore:`, `docs:`, …) — commitlint is enforced.

## License

[MIT](./LICENSE) — © Daniel.
