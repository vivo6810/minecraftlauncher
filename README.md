# TwilightLauncher

> **Ultra-lightweight, strict monotone Minecraft: Java Edition launcher built from scratch with Rust, Tauri v2, and React.**

[![Build & Release TwilightLauncher](https://github.com/vivo6810/minecraftlauncher/actions/workflows/build.yml/badge.svg)](https://github.com/vivo6810/minecraftlauncher/actions/workflows/build.yml)

---

## Highlights

- **Ultra-Lightweight Footprint:** Native **Rust (`twilight-core`) + Tauri v2** desktop architecture (~80–120 MB RAM) with concurrent async SHA-1 asset & library verification.
- **Monotone UI & Spring Physics:** Frameless custom window (`decorations: false`), obsidian/paper monotone chrome while preserving full original colors on all mods, skins, capes, and screenshots, plus a **`Ctrl + K` Command Palette**.
- **Window & Launch Controls:** User-configurable on-launch window behavior (**defaults to Minimize on Launch**, with options for *Keep Open*, *Minimize to System Tray*, and *Close Launcher*) + **Auto-Enable Fullscreen** toggle (**OFF** by default).
- **Twilight Shield (3-Layer Anti-Malware Mod Confinement):**
  1. **Native Session Token Vault:** Never passes real Microsoft `accessToken` strings into JVM memory or CLI arguments—brokers `/session/minecraft/join` over `127.0.0.1` in Rust.
  2. **OS Filesystem Sandbox (~0% FPS Overhead):** Uses **`bubblewrap` (`bwrap`)** on Linux and **AppContainer / Restricted ACLs** on Windows to lock JVM read-write strictly to `instances/<profile>/`, hiding `$HOME`, `.ssh`, browser cookies/passwords, Discord tokens, and wallets.
  3. **Fast Rust `.jar` Threat Scanner:** Inspects `.class` Constant Pool UTF-8 entries in milliseconds before launch and on file import to flag Discord/Telegram exfiltration webhooks, credential theft paths, and shell execution.
- **Multi-Account + Skins, Capes & Persistent Wardrobe:**
  - **Java Premium (Microsoft OAuth):** Upload user-provided `.png` skins (`Classic` / `Slim`) and switch official Mojang Capes.
  - **Offline Mode (`authlib-injector`):** Built-in zero-config **localhost Yggdrasil skin & cape server** in Rust (plus optional external Yggdrasil URL) so user-provided `.png` skins and custom `.png` capes render in-game offline.
  - **Previously Used Wardrobe:** Deduplicates and stores every skin and cape by SHA-256 for 1-click re-equipping anytime.
- **Multi-Profile, Live Version Switcher & All Mod Loaders:**
  - Automatically syncs new Minecraft releases & snapshots from Mojang's live `version_manifest_v2.json`.
  - Supports **`None (Vanilla)`** *(default)*, **Fabric**, **Quilt**, **NeoForge**, and **Forge**.
  - Configurable loader version (**defaults to `Latest`**) with per-profile **Auto-Update Mod Loader**.
- **Dual-Entry Modrinth Suite (`Mods` • `Modpacks` • `Resource Packs` • `Shader Packs` • `Data Packs`):**
  - **From Inside a Profile:** Pre-locked to that profile's Minecraft version & mod loader; Data Packs let you pick specific worlds or **All Worlds** (staged automatically even if 0 worlds exist yet).
  - **From the Home Screen (Universal):** Prompts for a compatible Target Profile (plus 2-step Profile → World/All-Worlds picker for Data Packs), while **Modpacks (`.mrpack`)** automatically create a brand-new standalone profile.
- **Built-In Directory Explorer, Config Editor & Screenshots Lightbox:**
  - Manage profile files directly inside TwilightLauncher: add `.jar`s, extract `.zip` archives, create folders, rename, delete, and edit `.toml` / `.json` / `.properties` / `.txt` files in the built-in **Monotone Config Editor**.
  - Dedicated **Screenshots** gallery per profile with zoom Lightbox, **1-click Copy Image to Clipboard**, and **Set as Profile Banner**.
- **Automatic Portable Java Manager, Crash Doctor & Linux Gaming Tools:**
  - Auto-downloads isolated portable Eclipse Temurin OpenJDK **8 / 17 / 21 / 25+** runtimes matching Mojang's `javaVersion` metadata per Minecraft release.
  - **Human-Readable Crash Doctor** translates JVM stack traces into plain English with 1-click fixes and privacy-scrubbed `mclo.gs` sharing.
  - First-class **Linux Gaming Toggles**: `DRI_PRIME=1` dGPU, NVIDIA Prime Offload, Native Wayland GLFW, Feral `gamemoderun`, and `mangohud`.

---

## Strict Storage Isolation Architecture

TwilightLauncher avoids cross-profile config/mod collisions by only sharing files that are **100% identical across all mod loaders**:

```text
TwilightLauncherData/
├── shared/
│   ├── assets/          # Common Mojang sound/lang objects (identical across all loaders)
│   ├── java/            # Portable OpenJDK 8 / 17 / 21 runtimes (identical across all loaders)
│   └── vanilla/         # Untouched Mojang client.jar & pure Vanilla libraries
├── loaders/
│   ├── fabric/          # Isolated Fabric loader JARs (never touches shared/vanilla)
│   ├── quilt/           # Isolated Quilt loader JARs
│   ├── neoforge/        # Isolated NeoForge JARs & installer outputs
│   └── forge/           # Isolated Forge JARs & installer outputs
├── instances/
│   └── <profile-id>/    # 100% standalone mods/, config/, resourcepacks/, shaderpacks/, saves/, screenshots/
└── wardrobe/
    ├── skins/           # SHA-256 history of user-provided .png skins
    └── capes/           # SHA-256 history of user-provided .png capes
```

---

## Repository Structure

```text
.
├── .github/workflows/build.yml   # CI/CD compiling Windows (.exe, NSIS, .msi) & Linux (.AppImage, .deb, .rpm)
├── crates/twilight-core/         # Pure Rust UI-independent launcher engine & unit tests
├── src-tauri/                    # Tauri v2 desktop bridge, capabilities & window controls
└── src/                          # React + TypeScript + Tailwind CSS + Framer Motion monotone UI
```

---

## Development & Building Locally

### Prerequisites
- **Rust** (stable via `rustup`)
- **Node.js** 20+ & `npm`
- **Linux system packages** (Ubuntu/Debian):
  ```bash
  sudo apt-get update
  sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
    libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf rpm bubblewrap
  ```

### Run in Development
```bash
npm install
cargo test -p twilight-core
npm run tauri dev
```

### Build Native Installers (`.exe`, `.msi`, `.AppImage`, `.deb`, `.rpm`)
```bash
npm run tauri build
```

---

## Automated GitHub Actions Builds

Every push to `main` (or manual **Run workflow** dispatch in GitHub Actions) compiles:
- **Windows (`windows-latest`):** Portable `twilight-launcher.exe`, NSIS `*-setup.exe`, and WiX `*.msi`
- **Linux (`ubuntu-22.04`):** `*.AppImage`, `*.deb`, and `*.rpm`

Pushing a version tag publishes a full **GitHub Release** automatically:
```bash
git tag v0.1.0
git push origin v0.1.0
```

---

## License

Licensed under the [Apache License, Version 2.0](./LICENSE).
