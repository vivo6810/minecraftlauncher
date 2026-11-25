# TwilightLauncher — Architecture & Product Specification

## 1. Core Identity & Tech Stack
- **Name:** TwilightLauncher
- **Repository:** `https://github.com/vivo6810/minecraftlauncher`
- **Stack:** Rust (`crates/twilight-core`) + Tauri v2 (`src-tauri`) + React / TypeScript / Tailwind CSS / Framer Motion (`src`).
- **Platforms:** Windows (`.exe` portable, NSIS `-setup.exe`, `.msi`) & Linux (`.AppImage`, `.deb`, `.rpm`) built automatically via GitHub Actions (`.github/workflows/build.yml`).
- **Visual Style:** Strict Monotone palette (Pure Obsidian Dark default + Crisp Paper Light toggle), GPU-accelerated stretch/bounce spring animations, dedicated Start Screen, Dynamic Island activity pill, and `Ctrl + K` Command Palette.

## 2. Window & Launch Defaults
- **On-Launch Action:** Default = **Minimize on Launch** (user-configurable: Keep Open, Minimize, Minimize to System Tray, Close Launcher + Restore on Game Exit).
- **Auto-Enable Fullscreen:** Default = **OFF** (user-configurable toggle passing `--fullscreen`).

## 3. Twilight Shield (3-Layer Mod Malware Confinement)
1. **Native Session Token Vault:** Never passes real Microsoft `accessToken` into the JVM; uses a random placeholder token and brokers `/session/minecraft/join` over `127.0.0.1` in Rust.
2. **OS Filesystem Sandbox:** Confines JVM read-write strictly to `instances/<profile>/` via `bubblewrap` (`bwrap`) on Linux and AppContainer/Restricted ACLs on Windows, hiding `$HOME`, `.ssh`, Chrome/Firefox cookies & passwords, Discord tokens, and wallets with ~0% FPS overhead.
3. **Fast Rust `.jar` Threat Scanner:** Scans `.class` Constant Pool UTF-8 entries in milliseconds before launch and on file upload to flag exfiltration webhooks, browser credential theft, and shell execution.

## 4. Accounts, Skins, Capes & Wardrobe History
- Multiple accounts saved simultaneously with 1-click switching.
- **Java Premium (Microsoft):** User-provided `.png` skin upload + official Mojang Cape selector.
- **Offline (`authlib-injector`):** Built-in localhost Yggdrasil server in Rust (plus optional external Yggdrasil URL) serving user-provided `.png` skins and `.png` capes in-game.
- **Persistent Wardrobe:** Automatically saves previously used skins & capes (deduplicated by SHA-256) for instant reuse.

## 5. Multi-Profile, Live Version Switcher & Mod Loaders
- Live Mojang `version_manifest_v2.json` Version Switcher (new releases & snapshots appear automatically).
- Mod Loaders: `None (Vanilla)` *(default)*, `Fabric`, `Quilt`, `NeoForge`, `Forge`.
- Configurable loader version (**defaults to `Latest`**) + **Auto-Update Mod Loader** toggle.

## 6. Dual-Mode Modrinth Integration
- Supports **Mods, Modpacks (`.mrpack`), Resource Packs, Shader Packs, Data Packs**.
- **Profile-Scoped Mode:** Locked to that profile's MC version & loader; Data Packs prompt for specific worlds or **All Worlds** (staged in `datapacks_global/`).
- **Universal Home Screen Mode:** Prompts for Target Profile on install (2-step Profile -> Worlds/All-Worlds for Data Packs); Modpacks create a brand-new standalone profile.

## 7. In-Profile File Explorer, Config Editor, Screenshots & Diagnostics
- **Built-in File Explorer:** Add `.jar`s/files, extract `.zip` archives, create folders, rename, delete, and edit config files in the **Monotone Config Editor**.
- **Screenshots Lightbox:** Gallery from `/screenshots`, zoom Lightbox, 1-click **Copy Image to Clipboard**, **Set as Profile Banner**.
- **Automatic Portable Java Manager:** Managed Eclipse Temurin OpenJDK 8 / 17 / 21 in `shared/java/`.
- **Human-Readable Crash Doctor** + privacy-scrubbed `mclo.gs` sharing.
- **Linux Gaming Tools:** `DRI_PRIME=1`, NVIDIA Prime, Native Wayland GLFW, `gamemoderun`, `mangohud`.

## 8. Strict Storage Isolation (No Hardlink Cache)
- Shared globally ONLY when 100% common across all loaders: `shared/assets/`, `shared/java/`, `shared/vanilla/`.
- Mod loaders isolated in `loaders/<loader>/`.
- Profiles 100% standalone in `instances/<profile>/`.
- Deferred to Phase 2: Quick-Play straight into world/server.
