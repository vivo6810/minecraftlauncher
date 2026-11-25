import { invoke } from "@tauri-apps/api/core";
import type {
  CrashDiagnosis,
  DatapackInstallTarget,
  FileNode,
  JarScanReport,
  JavaRuntimeInfo,
  LauncherSettings,
  LauncherStateSnapshot,
  LoaderVersionOption,
  ModLoaderKind,
  ModrinthContentKind,
  ModrinthSearchHit,
  Profile,
  SandboxCapabilityStatus,
  ScreenshotItem,
  SkinVariant,
  VersionManifest,
  WardrobeAssetKind,
} from "../types/launcher";

export function isTauriDesktop(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

// --- Web Preview Persistence & Sample Monotone Assets (only used when !isTauriDesktop()) ---
const STORAGE_KEY = "twilight_launcher_web_state_v1";
const VFS_KEY = "twilight_launcher_web_vfs_v1";

function makeMonotoneScreenshotSvgDataUrl(title: string, seed: number): string {
  const shadeA = seed % 2 === 0 ? "#121216" : "#18181e";
  const shadeB = seed % 2 === 0 ? "#e4e4e7" : "#d4d4d8";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#09090b"/>
        <stop offset="65%" stop-color="#1f1f26"/>
        <stop offset="100%" stop-color="#2e2e38"/>
      </linearGradient>
    </defs>
    <rect width="960" height="540" fill="url(#sky)"/>
    <circle cx="${720 - seed * 90}" cy="135" r="46" fill="#fafafa" opacity="0.92"/>
    <rect x="0" y="340" width="960" height="200" fill="${shadeA}"/>
    <rect x="90" y="260" width="140" height="80" fill="#23232b"/>
    <rect x="230" y="210" width="190" height="130" fill="#2c2c35"/>
    <rect x="420" y="280" width="160" height="60" fill="#1d1d24"/>
    <rect x="610" y="230" width="220" height="110" fill="#272730"/>
    <rect x="285" y="245" width="22" height="22" fill="${shadeB}" opacity="0.85"/>
    <rect x="330" y="245" width="22" height="22" fill="${shadeB}" opacity="0.6"/>
    <text x="36" y="498" fill="#a1a1aa" font-family="monospace" font-size="16">TWILIGHT // ${title}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function makeSampleSkinPngDataUrl(primary = "#fafafa", secondary = "#27272a"): string {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = secondary;
  ctx.fillRect(0, 0, 64, 64);
  // Head front (8,8,8,8)
  ctx.fillStyle = primary;
  ctx.fillRect(8, 8, 8, 8);
  // Eyes
  ctx.fillStyle = "#09090b";
  ctx.fillRect(9, 12, 2, 2);
  ctx.fillRect(13, 12, 2, 2);
  // Torso & limbs
  ctx.fillStyle = "#d4d4d8";
  ctx.fillRect(20, 20, 8, 12);
  ctx.fillStyle = "#52525b";
  ctx.fillRect(44, 20, 4, 12);
  ctx.fillRect(4, 20, 4, 12);
  return canvas.toDataURL("image/png");
}

function makeSampleCapePngDataUrl(): string {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#141418";
  ctx.fillRect(0, 0, 64, 32);
  ctx.fillStyle = "#fafafa";
  ctx.fillRect(1, 1, 10, 16);
  ctx.fillStyle = "#18181b";
  ctx.fillRect(2, 2, 8, 14);
  ctx.fillStyle = "#fafafa";
  ctx.fillRect(4, 5, 4, 4);
  return canvas.toDataURL("image/png");
}

interface WebVfsEntry {
  isDir: boolean;
  content?: string;
  size: number;
  modifiedAt: string;
}

type WebVfsMap = Record<string, Record<string, WebVfsEntry>>;

function loadWebVfs(profiles: Profile[]): WebVfsMap {
  try {
    const raw = localStorage.getItem(VFS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  const now = new Date().toISOString();
  const init: WebVfsMap = {};
  for (const p of profiles) {
    init[p.id] = {
      mods: { isDir: true, size: 0, modifiedAt: now },
      config: { isDir: true, size: 0, modifiedAt: now },
      resourcepacks: { isDir: true, size: 0, modifiedAt: now },
      shaderpacks: { isDir: true, size: 0, modifiedAt: now },
      saves: { isDir: true, size: 0, modifiedAt: now },
      "saves/Twilight Survival": { isDir: true, size: 0, modifiedAt: now },
      "saves/Creative Redstone Lab": { isDir: true, size: 0, modifiedAt: now },
      screenshots: { isDir: true, size: 0, modifiedAt: now },
      datapacks_global: { isDir: true, size: 0, modifiedAt: now },
      "options.txt": {
        isDir: false,
        size: 168,
        modifiedAt: now,
        content:
          "fov:0.75\ngamma:1.0\nguiScale:2\nmaxFps:240\nfullscreen:false\nrenderDistance:16\nsoundCategory_master:0.8\n",
      },
      "config/sodium-options.json": {
        isDir: false,
        size: 215,
        modifiedAt: now,
        content: JSON.stringify(
          {
            quality: { weather_quality: "FAST", leaves_quality: "FANCY" },
            performance: { chunk_builder_threads: 4, always_defer_chunk_updates: true },
          },
          null,
          2
        ),
      },
    };
    if (p.loader !== "none") {
      init[p.id]["mods/sodium-fabric-0.6.5+mc1.21.4.jar"] = {
        isDir: false,
        size: 1_142_800,
        modifiedAt: now,
      };
      init[p.id]["mods/iris-fabric-1.8.4+mc1.21.4.jar"] = {
        isDir: false,
        size: 2_310_400,
        modifiedAt: now,
      };
    }
  }
  localStorage.setItem(VFS_KEY, JSON.stringify(init));
  return init;
}

function saveWebVfs(vfs: WebVfsMap) {
  localStorage.setItem(VFS_KEY, JSON.stringify(vfs));
}

function getInitialWebState(): LauncherStateSnapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }

  const sampleSkin = makeSampleSkinPngDataUrl("#fafafa", "#1f1f24");
  const sampleSkinAlt = makeSampleSkinPngDataUrl("#d4d4d8", "#09090b");
  const sampleCape = makeSampleCapePngDataUrl();

  const initial: LauncherStateSnapshot = {
    settings: {
      window_launch_action: "minimize", // Spec default: Minimize on launch
      auto_fullscreen: false, // Spec default: Auto-Fullscreen OFF
      restore_on_game_close: true,
      theme: "dark",
      default_memory_mb: 4096,
      concurrent_downloads: 24,
      global_jvm_args: [
        "-XX:+UnlockExperimentalVMOptions",
        "-XX:+UseG1GC",
        "-XX:MaxGCPauseMillis=50",
      ],
      linux_gaming: {
        discrete_gpu_dri_prime: true,
        nvidia_prime_offload: false,
        wayland_native_glfw: false,
        feral_gamemode: true,
        mangohud: false,
      },
      shield: {
        token_vault: true,
        os_sandbox: true,
        jar_scanner: true,
        block_high_risk_jars: true,
      },
    },
    profiles: [
      {
        id: "vanilla-latest",
        name: "Vanilla Crisp",
        icon: "cube",
        banner_screenshot: null,
        mc_version: "1.21.4",
        loader: "none", // Spec default: None
        loader_version: "latest", // Spec default: Latest
        auto_update_loader: true,
        allocated_ram_mb: 4096,
        fullscreen_override: null,
        sandbox_override: null,
        custom_jvm_args: [],
        created_at: new Date().toISOString(),
        last_played: new Date().toISOString(),
        total_playtime_secs: 8420,
        linked_modpack_id: null,
      },
      {
        id: "fabric-shaders",
        name: "Monolith Shaders",
        icon: "sparkles",
        banner_screenshot: null,
        mc_version: "1.21.4",
        loader: "fabric",
        loader_version: "0.16.10",
        auto_update_loader: true,
        allocated_ram_mb: 6144,
        fullscreen_override: null,
        sandbox_override: null,
        custom_jvm_args: [],
        created_at: new Date().toISOString(),
        last_played: null,
        total_playtime_secs: 3120,
        linked_modpack_id: null,
      },
    ],
    accounts: [
      {
        id: "offline-1",
        username: "TwilightRogue",
        uuid: "e41f8b1c-4d23-3910-811a-9f88e72a1102",
        account_type: "offline",
        active: true,
        skin_sha256: "sha256-monolith-classic",
        skin_variant: "classic",
        custom_cape_sha256: "sha256-eclipse-cape",
        official_cape_id: null,
        official_capes: [],
        external_yggdrasil_url: null,
      },
      {
        id: "msa-premium-1",
        username: "VivoPrime",
        uuid: "5a88c991-0e12-4c9a-9f81-1182c7d40a99",
        account_type: "microsoft",
        active: false,
        skin_sha256: "sha256-ivory-slim",
        skin_variant: "slim",
        custom_cape_sha256: null,
        official_cape_id: "migrator-cape",
        official_capes: [
          { id: "migrator-cape", alias: "Migrator", url: sampleCape, state: "ACTIVE" },
          { id: "vanilla-cape", alias: "Vanilla", url: sampleCape, state: "INACTIVE" },
          { id: "cherry-blossom", alias: "Cherry Blossom", url: sampleCape, state: "INACTIVE" },
        ],
        external_yggdrasil_url: null,
      },
    ],
    wardrobe: [
      {
        sha256: "sha256-monolith-classic",
        name: "Obsidian Wanderer",
        kind: "skin",
        variant: "classic",
        file_name: "obsidian_wanderer.png",
        added_at: new Date().toISOString(),
        preview_data_url: sampleSkin,
      },
      {
        sha256: "sha256-ivory-slim",
        name: "Ivory Phantom",
        kind: "skin",
        variant: "slim",
        file_name: "ivory_phantom.png",
        added_at: new Date().toISOString(),
        preview_data_url: sampleSkinAlt,
      },
      {
        sha256: "sha256-eclipse-cape",
        name: "Twilight Eclipse Cape",
        kind: "cape",
        variant: "classic",
        file_name: "twilight_eclipse_cape.png",
        added_at: new Date().toISOString(),
        preview_data_url: sampleCape,
      },
    ],
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
  loadWebVfs(initial.profiles);
  return initial;
}

function saveWebState(next: LauncherStateSnapshot) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

// ============================================================================
// UNIFIED LAUNCHER API (Native Rust Tauri IPC + Live Web Preview Fallback)
// ============================================================================

export const LauncherBridge = {
  async getState(): Promise<LauncherStateSnapshot> {
    if (isTauriDesktop()) return invoke("get_launcher_state");
    return getInitialWebState();
  },

  async updateSettings(settings: LauncherSettings): Promise<LauncherSettings> {
    if (isTauriDesktop()) return invoke("update_launcher_settings", { settings });
    const s = getInitialWebState();
    s.settings = settings;
    saveWebState(s);
    return settings;
  },

  async upsertProfile(profile: Profile): Promise<Profile[]> {
    if (isTauriDesktop()) return invoke("upsert_profile", { profile });
    const s = getInitialWebState();
    const idx = s.profiles.findIndex((p) => p.id === profile.id);
    if (idx >= 0) s.profiles[idx] = profile;
    else s.profiles.push(profile);
    saveWebState(s);

    const vfs = loadWebVfs(s.profiles);
    if (!vfs[profile.id]) {
      const now = new Date().toISOString();
      vfs[profile.id] = {
        mods: { isDir: true, size: 0, modifiedAt: now },
        config: { isDir: true, size: 0, modifiedAt: now },
        resourcepacks: { isDir: true, size: 0, modifiedAt: now },
        shaderpacks: { isDir: true, size: 0, modifiedAt: now },
        saves: { isDir: true, size: 0, modifiedAt: now },
        screenshots: { isDir: true, size: 0, modifiedAt: now },
        datapacks_global: { isDir: true, size: 0, modifiedAt: now },
        "options.txt": { isDir: false, size: 84, modifiedAt: now, content: "fov:0.75\nmaxFps:240\nfullscreen:false\n" },
      };
      saveWebVfs(vfs);
    }
    return s.profiles;
  },

  async deleteProfile(profileId: string): Promise<Profile[]> {
    if (isTauriDesktop()) return invoke("delete_profile", { profileId });
    const s = getInitialWebState();
    s.profiles = s.profiles.filter((p) => p.id !== profileId);
    saveWebState(s);
    return s.profiles;
  },

  async fetchMcVersions(): Promise<VersionManifest> {
    if (isTauriDesktop()) return invoke("fetch_mc_versions");
    try {
      const r = await fetch("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json");
      if (r.ok) return await r.json();
    } catch {
      // Fallback if preview iframe blocks external network
    }
    return {
      latest: { release: "1.21.4", snapshot: "25w09b" },
      versions: [
        { id: "1.21.4", type: "release", url: "", time: "", releaseTime: "2024-12-03T10:00:00Z" },
        { id: "1.21.3", type: "release", url: "", time: "", releaseTime: "2024-10-23T10:00:00Z" },
        { id: "1.21.1", type: "release", url: "", time: "", releaseTime: "2024-08-08T10:00:00Z" },
        { id: "1.20.6", type: "release", url: "", time: "", releaseTime: "2024-04-29T10:00:00Z" },
        { id: "1.20.4", type: "release", url: "", time: "", releaseTime: "2023-12-07T10:00:00Z" },
        { id: "1.20.1", type: "release", url: "", time: "", releaseTime: "2023-06-12T10:00:00Z" },
        { id: "1.19.4", type: "release", url: "", time: "", releaseTime: "2023-03-14T10:00:00Z" },
        { id: "1.18.2", type: "release", url: "", time: "", releaseTime: "2022-02-28T10:00:00Z" },
        { id: "1.16.5", type: "release", url: "", time: "", releaseTime: "2021-01-15T10:00:00Z" },
        { id: "1.12.2", type: "release", url: "", time: "", releaseTime: "2017-09-18T10:00:00Z" },
        { id: "1.8.9", type: "release", url: "", time: "", releaseTime: "2015-12-09T10:00:00Z" },
        { id: "25w09b", type: "snapshot", url: "", time: "", releaseTime: "2025-02-27T10:00:00Z" },
      ],
    };
  },

  async fetchLoaderVersions(loader: ModLoaderKind, mcVersion: string): Promise<LoaderVersionOption[]> {
    if (loader === "none") return [];
    if (isTauriDesktop()) {
      return invoke("fetch_loader_versions", { loader, mcVersion });
    }
    try {
      if (loader === "fabric") {
        const r = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${mcVersion}`);
        if (r.ok) {
          const data = await r.json();
          return data.slice(0, 15).map((item: { loader: { version: string; stable?: boolean } }) => ({
            version: item.loader.version,
            stable: item.loader.stable ?? true,
            loader: "fabric",
          }));
        }
      }
      if (loader === "quilt") {
        const r = await fetch(`https://meta.quiltmc.org/v3/versions/loader/${mcVersion}`);
        if (r.ok) {
          const data = await r.json();
          return data.slice(0, 15).map((item: { loader: { version: string } }) => ({
            version: item.loader.version,
            stable: !item.loader.version.includes("beta"),
            loader: "quilt",
          }));
        }
      }
    } catch {
      // Fallback below
    }
    const defaults: Record<Exclude<ModLoaderKind, "none">, string[]> = {
      fabric: ["0.16.10", "0.16.9", "0.16.7", "0.15.11"],
      quilt: ["0.27.1", "0.26.4", "0.25.0"],
      neoforge: ["21.4.88-beta", "21.4.76-beta", "21.1.92"],
      forge: ["54.0.18", "47.3.12", "47.2.20"],
    };
    return defaults[loader].map((v, i) => ({
      version: v,
      stable: i === 0,
      loader,
    }));
  },

  async createOfflineAccount(username: string, externalYggdrasilUrl: string | null): Promise<LauncherStateSnapshot> {
    if (isTauriDesktop()) {
      return invoke("create_offline_account_cmd", { username, externalYggdrasilUrl });
    }
    const s = getInitialWebState();
    s.accounts.forEach((a) => (a.active = false));
    s.accounts.push({
      id: `offline-${Date.now()}`,
      username: username.trim(),
      uuid: crypto.randomUUID(),
      account_type: "offline",
      active: true,
      skin_sha256: s.wardrobe.find((w) => w.kind === "skin")?.sha256 ?? null,
      skin_variant: "classic",
      custom_cape_sha256: null,
      official_cape_id: null,
      official_capes: [],
      external_yggdrasil_url: externalYggdrasilUrl || null,
    });
    saveWebState(s);
    return s;
  },

  async connectMicrosoftToken(mcAccessToken: string): Promise<LauncherStateSnapshot> {
    if (isTauriDesktop()) {
      return invoke("connect_microsoft_token_cmd", { mcAccessToken });
    }
    const s = getInitialWebState();
    s.accounts.forEach((a) => (a.active = false));
    s.accounts.push({
      id: `msa-${Date.now()}`,
      username: mcAccessToken.trim() || "PremiumPlayer",
      uuid: crypto.randomUUID(),
      account_type: "microsoft",
      active: true,
      skin_sha256: s.wardrobe.find((w) => w.kind === "skin")?.sha256 ?? null,
      skin_variant: "slim",
      custom_cape_sha256: null,
      official_cape_id: "migrator-cape",
      official_capes: [
        { id: "migrator-cape", alias: "Migrator", url: "", state: "ACTIVE" },
        { id: "vanilla-cape", alias: "Vanilla", url: "", state: "INACTIVE" },
      ],
      external_yggdrasil_url: null,
    });
    saveWebState(s);
    return s;
  },

  async setActiveAccount(accountId: string): Promise<LauncherStateSnapshot> {
    if (isTauriDesktop()) return invoke("set_active_account", { accountId });
    const s = getInitialWebState();
    s.accounts.forEach((a) => (a.active = a.id === accountId));
    saveWebState(s);
    return s;
  },

  async removeAccount(accountId: string): Promise<LauncherStateSnapshot> {
    if (isTauriDesktop()) return invoke("remove_account", { accountId });
    const s = getInitialWebState();
    s.accounts = s.accounts.filter((a) => a.id !== accountId);
    if (s.accounts.length > 0 && !s.accounts.some((a) => a.active)) {
      s.accounts[0].active = true;
    }
    saveWebState(s);
    return s;
  },

  async importAndEquipWardrobePng(
    accountId: string,
    name: string,
    base64Png: string,
    kind: WardrobeAssetKind,
    variant: SkinVariant
  ): Promise<LauncherStateSnapshot> {
    if (isTauriDesktop()) {
      return invoke("import_and_equip_wardrobe_png", {
        accountId,
        name,
        base64Png,
        kind,
        variant,
      });
    }
    const s = getInitialWebState();
    const hash = `sha256-${btoa(name + base64Png.slice(-32)).slice(0, 18)}`;
    if (!s.wardrobe.some((w) => w.sha256 === hash && w.kind === kind)) {
      s.wardrobe.unshift({
        sha256: hash,
        name,
        kind,
        variant,
        file_name: `${name.toLowerCase().replace(/\s+/g, "_")}.png`,
        added_at: new Date().toISOString(),
        preview_data_url: base64Png,
      });
    }
    const acct = s.accounts.find((a) => a.id === accountId);
    if (acct) {
      if (kind === "skin") {
        acct.skin_sha256 = hash;
        acct.skin_variant = variant;
      } else {
        acct.custom_cape_sha256 = hash;
      }
    }
    saveWebState(s);
    return s;
  },

  async equipExistingWardrobeItem(
    accountId: string,
    sha256: string,
    kind: WardrobeAssetKind,
    variant: SkinVariant
  ): Promise<LauncherStateSnapshot> {
    if (isTauriDesktop()) {
      return invoke("equip_existing_wardrobe_item", { accountId, sha256, kind, variant });
    }
    const s = getInitialWebState();
    const acct = s.accounts.find((a) => a.id === accountId);
    if (acct) {
      if (kind === "skin") {
        acct.skin_sha256 = sha256 || null;
        acct.skin_variant = variant;
      } else {
        acct.custom_cape_sha256 = sha256 || null;
      }
    }
    saveWebState(s);
    return s;
  },

  async selectOfficialCape(accountId: string, capeId: string | null): Promise<LauncherStateSnapshot> {
    if (isTauriDesktop()) return invoke("select_official_cape_cmd", { accountId, capeId });
    const s = getInitialWebState();
    const acct = s.accounts.find((a) => a.id === accountId);
    if (acct) acct.official_cape_id = capeId;
    saveWebState(s);
    return s;
  },

  async searchModrinth(
    query: string,
    kind: ModrinthContentKind,
    mcVersion: string | null,
    loader: ModLoaderKind | null
  ): Promise<ModrinthSearchHit[]> {
    if (isTauriDesktop()) {
      return invoke("search_modrinth_cmd", { query, kind, mcVersion, loader });
    }
    try {
      const facets: string[][] = [[`project_type:${kind}`]];
      if (mcVersion) facets.push([`versions:${mcVersion}`]);
      if ((kind === "mod" || kind === "modpack") && loader && loader !== "none") {
        facets.push([`categories:${loader}`]);
      }
      const url = new URL("https://api.modrinth.com/v2/search");
      url.searchParams.set("query", query);
      url.searchParams.set("facets", JSON.stringify(facets));
      url.searchParams.set("limit", "20");
      const r = await fetch(url.toString());
      if (r.ok) {
        const json = await r.json();
        return json.hits;
      }
    } catch {
      // Fallback curated catalog when offline
    }
    return FALLBACK_MODRINTH_CATALOG.filter(
      (item) =>
        item.project_type === kind &&
        (!query || item.title.toLowerCase().includes(query.toLowerCase()))
    );
  },

  async installModrinthToProfile(
    profileId: string,
    projectId: string,
    titleSlug: string,
    kind: ModrinthContentKind,
    datapackTarget?: DatapackInstallTarget
  ): Promise<string[]> {
    if (isTauriDesktop()) {
      return invoke("install_modrinth_to_profile_cmd", {
        profileId,
        projectId,
        kind,
        datapackTarget: datapackTarget ?? null,
      });
    }
    const s = getInitialWebState();
    const vfs = loadWebVfs(s.profiles);
    const pMap = (vfs[profileId] = vfs[profileId] || {});
    const now = new Date().toISOString();
    const ext = kind === "mod" ? "jar" : "zip";
    const fileName = `${titleSlug.toLowerCase().replace(/\s+/g, "-")}.${ext}`;

    if (kind === "mod") {
      pMap[`mods/${fileName}`] = { isDir: false, size: 842_000, modifiedAt: now };
    } else if (kind === "resourcepack") {
      pMap[`resourcepacks/${fileName}`] = { isDir: false, size: 4_120_000, modifiedAt: now };
    } else if (kind === "shader") {
      pMap[`shaderpacks/${fileName}`] = { isDir: false, size: 1_950_000, modifiedAt: now };
    } else if (kind === "datapack") {
      if (!datapackTarget || datapackTarget.mode === "all_worlds") {
        pMap[`datapacks_global/${fileName}`] = { isDir: false, size: 320_000, modifiedAt: now };
        for (const k of Object.keys(pMap)) {
          if (k.startsWith("saves/") && k.split("/").length === 2 && pMap[k].isDir) {
            pMap[`${k}/datapacks`] = { isDir: true, size: 0, modifiedAt: now };
            pMap[`${k}/datapacks/${fileName}`] = { isDir: false, size: 320_000, modifiedAt: now };
          }
        }
      } else {
        for (const w of datapackTarget.worlds) {
          pMap[`saves/${w}/datapacks`] = { isDir: true, size: 0, modifiedAt: now };
          pMap[`saves/${w}/datapacks/${fileName}`] = { isDir: false, size: 320_000, modifiedAt: now };
        }
      }
    }
    saveWebVfs(vfs);
    return [fileName];
  },

  async installModpackNewProfile(projectId: string, customName: string): Promise<Profile> {
    if (isTauriDesktop()) {
      return invoke("install_modpack_new_profile_cmd", { projectId, customName });
    }
    const s = getInitialWebState();
    const created: Profile = {
      id: `modpack-${Date.now()}`,
      name: customName,
      icon: "layers",
      banner_screenshot: null,
      mc_version: "1.21.4",
      loader: "fabric",
      loader_version: "0.16.10",
      auto_update_loader: true,
      allocated_ram_mb: s.settings.default_memory_mb,
      fullscreen_override: null,
      sandbox_override: null,
      custom_jvm_args: [],
      created_at: new Date().toISOString(),
      last_played: null,
      total_playtime_secs: 0,
      linked_modpack_id: projectId,
    };
    await this.upsertProfile(created);
    return created;
  },

  async listDir(profileId: string, relativeDir: string): Promise<FileNode[]> {
    if (isTauriDesktop()) return invoke("explorer_list_dir", { profileId, relativeDir });
    const s = getInitialWebState();
    const vfs = loadWebVfs(s.profiles)[profileId] || {};
    const cleanPrefix = relativeDir.replace(/^\/+|\/+$/g, "");
    const nodes: FileNode[] = [];

    for (const [path, meta] of Object.entries(vfs)) {
      const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      if (parent !== cleanPrefix) continue;
      const name = path.includes("/") ? path.slice(path.lastIndexOf("/") + 1) : path;
      const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
      nodes.push({
        name,
        relative_path: path,
        is_dir: meta.isDir,
        size_bytes: meta.size,
        modified_at: meta.modifiedAt,
        editable_config:
          !meta.isDir &&
          ["toml", "json", "json5", "properties", "txt", "cfg", "yml", "yaml", "ini"].includes(ext),
        is_archive: !meta.isDir && ext === "zip",
      });
    }
    return nodes.sort((a, b) => Number(b.is_dir) - Number(a.is_dir) || a.name.localeCompare(b.name));
  },

  async createDir(profileId: string, relativeDir: string): Promise<void> {
    if (isTauriDesktop()) return invoke("explorer_create_dir", { profileId, relativeDir });
    const s = getInitialWebState();
    const vfs = loadWebVfs(s.profiles);
    const p = (vfs[profileId] = vfs[profileId] || {});
    p[relativeDir.replace(/^\/+|\/+$/g, "")] = {
      isDir: true,
      size: 0,
      modifiedAt: new Date().toISOString(),
    };
    saveWebVfs(vfs);
  },

  async uploadFile(
    profileId: string,
    relativeDir: string,
    fileName: string,
    base64Bytes: string
  ): Promise<JarScanReport | null> {
    if (isTauriDesktop()) {
      return invoke("explorer_upload_file", {
        profileId,
        relativeDir,
        fileName,
        base64Bytes,
      });
    }
    const s = getInitialWebState();
    const vfs = loadWebVfs(s.profiles);
    const p = (vfs[profileId] = vfs[profileId] || {});
    const cleanDir = relativeDir.replace(/^\/+|\/+$/g, "");
    const full = cleanDir ? `${cleanDir}/${fileName}` : fileName;
    p[full] = {
      isDir: false,
      size: Math.round(base64Bytes.length * 0.75),
      modifiedAt: new Date().toISOString(),
      content: base64Bytes.startsWith("data:text") ? atob(base64Bytes.split(",")[1] || "") : undefined,
    };
    saveWebVfs(vfs);

    if (fileName.toLowerCase().endsWith(".jar")) {
      const suspicious = /steal|webhook|token|rat|grabber/i.test(fileName);
      return {
        file_name: fileName,
        classes_scanned: 48,
        scan_duration_ms: 4,
        safe: !suspicious,
        findings: suspicious
          ? [
              {
                class_path: "dev/loader/WebhookExfil.class",
                severity: "critical",
                category: "Data Exfiltration Webhook",
                matched_indicator: "discord.com/api/webhooks/",
                description: "Hardcoded Discord webhook URL commonly used by session-stealer malware.",
              },
            ]
          : [],
      };
    }
    return null;
  },

  async extractArchive(profileId: string, archiveRelativePath: string): Promise<number> {
    if (isTauriDesktop()) {
      return invoke("explorer_extract_archive", { profileId, archiveRelativePath });
    }
    const s = getInitialWebState();
    const vfs = loadWebVfs(s.profiles);
    const p = (vfs[profileId] = vfs[profileId] || {});
    const folder = archiveRelativePath.replace(/\.zip$/i, "");
    const now = new Date().toISOString();
    p[folder] = { isDir: true, size: 0, modifiedAt: now };
    p[`${folder}/pack.mcmeta`] = {
      isDir: false,
      size: 128,
      modifiedAt: now,
      content: '{\n  "pack": {\n    "pack_format": 46,\n    "description": "Extracted inside TwilightLauncher"\n  }\n}\n',
    };
    saveWebVfs(vfs);
    return 1;
  },

  async renameOrMove(profileId: string, fromRel: string, toRel: string): Promise<void> {
    if (isTauriDesktop()) return invoke("explorer_rename_or_move", { profileId, fromRel, toRel });
    const s = getInitialWebState();
    const vfs = loadWebVfs(s.profiles);
    const p = vfs[profileId] || {};
    if (p[fromRel]) {
      p[toRel] = p[fromRel];
      delete p[fromRel];
      saveWebVfs(vfs);
    }
  },

  async deleteEntry(profileId: string, relativePath: string): Promise<void> {
    if (isTauriDesktop()) return invoke("explorer_delete_entry", { profileId, relativePath });
    const s = getInitialWebState();
    const vfs = loadWebVfs(s.profiles);
    const p = vfs[profileId] || {};
    for (const k of Object.keys(p)) {
      if (k === relativePath || k.startsWith(`${relativePath}/`)) delete p[k];
    }
    saveWebVfs(vfs);
  },

  async readConfigText(profileId: string, relativePath: string): Promise<string> {
    if (isTauriDesktop()) return invoke("config_read_text", { profileId, relativePath });
    const s = getInitialWebState();
    const vfs = loadWebVfs(s.profiles);
    return vfs[profileId]?.[relativePath]?.content ?? "# Empty config file\n";
  },

  async writeConfigText(profileId: string, relativePath: string, content: string): Promise<void> {
    if (isTauriDesktop()) return invoke("config_write_text", { profileId, relativePath, content });
    const s = getInitialWebState();
    const vfs = loadWebVfs(s.profiles);
    const p = (vfs[profileId] = vfs[profileId] || {});
    p[relativePath] = {
      isDir: false,
      size: content.length,
      modifiedAt: new Date().toISOString(),
      content,
    };
    saveWebVfs(vfs);
  },

  async listProfileWorlds(profileId: string): Promise<string[]> {
    if (isTauriDesktop()) return invoke("list_profile_worlds_cmd", { profileId });
    const s = getInitialWebState();
    const vfs = loadWebVfs(s.profiles)[profileId] || {};
    return Object.entries(vfs)
      .filter(([k, v]) => v.isDir && k.startsWith("saves/") && k.split("/").length === 2)
      .map(([k]) => k.slice("saves/".length));
  },

  async listProfileScreenshots(profileId: string): Promise<ScreenshotItem[]> {
    if (isTauriDesktop()) return invoke("list_profile_screenshots_cmd", { profileId });
    return [
      {
        file_name: "2026-11-24_21.14.08.png",
        relative_path: "screenshots/2026-11-24_21.14.08.png",
        size_bytes: 1_420_880,
        captured_at: new Date(Date.now() - 3600_000).toISOString(),
        data_url: makeMonotoneScreenshotSvgDataUrl("OBSIDIAN CITADEL • NIGHTFALL", 1),
      },
      {
        file_name: "2026-11-23_18.02.41.png",
        relative_path: "screenshots/2026-11-23_18.02.41.png",
        size_bytes: 1_198_200,
        captured_at: new Date(Date.now() - 86400_000).toISOString(),
        data_url: makeMonotoneScreenshotSvgDataUrl("MONOLITH VALLEY • SHADERS ON", 2),
      },
      {
        file_name: "2026-11-20_09.45.12.png",
        relative_path: "screenshots/2026-11-20_09.45.12.png",
        size_bytes: 980_440,
        captured_at: new Date(Date.now() - 240000_000).toISOString(),
        data_url: makeMonotoneScreenshotSvgDataUrl("REDSTONE PERIMETER • DAY 140", 3),
      },
    ];
  },

  async scanProfileMods(profileId: string): Promise<JarScanReport[]> {
    if (isTauriDesktop()) return invoke("scan_profile_mods_cmd", { profileId });
    const nodes = await this.listDir(profileId, "mods");
    return nodes
      .filter((n) => !n.is_dir && n.name.toLowerCase().endsWith(".jar"))
      .map((n) => {
        const bad = /steal|webhook|token|rat/i.test(n.name);
        return {
          file_name: n.name,
          classes_scanned: 142,
          scan_duration_ms: 6,
          safe: !bad,
          findings: bad
            ? [
                {
                  class_path: "com/stealer/Init.class",
                  severity: "critical",
                  category: "Data Exfiltration Webhook",
                  matched_indicator: "discord.com/api/webhooks/",
                  description: "Hardcoded Discord webhook URL detected in bytecode Constant Pool.",
                },
                {
                  class_path: "com/stealer/ChromeDump.class",
                  severity: "critical",
                  category: "Browser Credential Theft",
                  matched_indicator: "Google/Chrome/User Data",
                  description: "References Chrome credential SQLite path.",
                },
              ]
            : [],
        };
      });
  },

  async getSandboxStatus(): Promise<SandboxCapabilityStatus> {
    if (isTauriDesktop()) return invoke("get_sandbox_status_cmd");
    return {
      platform: "linux / windows",
      available: true,
      backend_name: "bubblewrap (Linux) • AppContainer ACL (Windows)",
      details:
        "Active: Confines JVM RW strictly to instances/<profile>/; mounts shared/ RO; hides $HOME / %APPDATA% credentials.",
    };
  },

  async listPortableJavas(): Promise<JavaRuntimeInfo[]> {
    if (isTauriDesktop()) return invoke("list_portable_javas_cmd");
    return [
      {
        major_version: 21,
        vendor: "Eclipse Temurin (Portable)",
        version_string: "21.0.5+11-jre",
        executable_path: "shared/java/temurin-21/bin/java",
        managed_portable: true,
      },
      {
        major_version: 17,
        vendor: "Eclipse Temurin (Portable)",
        version_string: "17.0.13+11-jre",
        executable_path: "shared/java/temurin-17/bin/java",
        managed_portable: true,
      },
    ];
  },

  async installPortableJava(majorVersion: number): Promise<JavaRuntimeInfo> {
    if (isTauriDesktop()) return invoke("install_portable_java_cmd", { majorVersion });
    return {
      major_version: majorVersion,
      vendor: "Eclipse Temurin (Portable)",
      version_string: `${majorVersion}.0.2-jre`,
      executable_path: `shared/java/temurin-${majorVersion}/bin/java`,
      managed_portable: true,
    };
  },

  async diagnoseCrash(rawLog: string): Promise<CrashDiagnosis> {
    if (isTauriDesktop()) return invoke("diagnose_crash_cmd", { rawLog });
    const lower = rawLog.toLowerCase();
    if (lower.includes("outofmemoryerror")) {
      return {
        title: "Out of Allocated RAM",
        summary: "Minecraft exhausted its JVM heap while loading mods or high-res assets.",
        root_cause: "java.lang.OutOfMemoryError: Java heap space",
        suggested_fix: "Increase this profile's allocated RAM by +2048 MB in 1 click.",
        fix_action_code: "bump_ram_2048",
        sanitized_log_excerpt: rawLog.replace(/--accessToken\s+\S+/g, "--accessToken <REDACTED>"),
      };
    }
    if (lower.includes("fabric-api")) {
      return {
        title: "Missing Required Dependency: Fabric API",
        summary: "An installed mod requires `fabric-api`, which was not found in `/mods`.",
        root_cause: "Unmet dependency: fabric-api",
        suggested_fix: "Install Fabric API directly from Modrinth into this profile.",
        fix_action_code: "install_fabric_api",
        sanitized_log_excerpt: rawLog,
      };
    }
    return {
      title: "Incompatible Mod Mixin / Version Mismatch",
      summary: "A mod attempted to patch a class signature from a different Minecraft release.",
      root_cause: "MixinTransformerError during client bootstrap",
      suggested_fix: "Inspect `/mods` in the built-in File Explorer or switch Mod Loader build.",
      fix_action_code: "open_mods_folder",
      sanitized_log_excerpt: rawLog,
    };
  },

  async launchProfile(profileId: string): Promise<number> {
    if (isTauriDesktop()) return invoke("launch_profile_cmd", { profileId });
    await new Promise((r) => setTimeout(r, 900));
    return 0;
  },
};

const FALLBACK_MODRINTH_CATALOG: ModrinthSearchHit[] = [
  {
    project_id: "AANobbMI",
    slug: "sodium",
    title: "Sodium",
    description: "The fastest and most compatible rendering optimization mod for Minecraft.",
    author: "jellysquid3",
    project_type: "mod",
    downloads: 48_200_000,
    icon_url: null,
    categories: ["fabric", "neoforge", "quilt", "optimization"],
    versions: ["1.21.4", "1.21.1", "1.20.1"],
    latest_version: "0.6.5",
  },
  {
    project_id: "P7dR8mSH",
    slug: "fabric-api",
    title: "Fabric API",
    description: "Lightweight and modular API providing common hooks for Fabric mods.",
    author: "modmuss50",
    project_type: "mod",
    downloads: 94_100_000,
    icon_url: null,
    categories: ["fabric", "library"],
    versions: ["1.21.4", "1.21.1", "1.20.1"],
    latest_version: "0.114.0",
  },
  {
    project_id: "YL57xq9U",
    slug: "iris",
    title: "Iris Shaders",
    description: "Modern shader pack loader for Minecraft paired seamlessly with Sodium.",
    author: "coderbot",
    project_type: "mod",
    downloads: 36_400_000,
    icon_url: null,
    categories: ["fabric", "neoforge", "quilt"],
    versions: ["1.21.4", "1.21.1", "1.20.1"],
    latest_version: "1.8.4",
  },
  {
    project_id: "1KVo5zza",
    slug: "fabulously-optimized",
    title: "Fabulously Optimized",
    description: "Performance and graphics enhancement modpack matching Vanilla feel.",
    author: "robotkoer",
    project_type: "modpack",
    downloads: 11_900_000,
    icon_url: null,
    categories: ["fabric", "optimization", "multiplayer"],
    versions: ["1.21.4", "1.21.1"],
    latest_version: "6.4.0",
  },
  {
    project_id: "HVnmMxH1",
    slug: "complementary-unbound",
    title: "Complementary Shaders - Unbound",
    description: "High-contrast atmospheric shaderpack with crisp lighting and water.",
    author: "EminGT",
    project_type: "shader",
    downloads: 29_500_000,
    icon_url: null,
    categories: ["iris", "optifine"],
    versions: ["1.21.4", "1.20.1"],
    latest_version: "r5.3",
  },
  {
    project_id: "w0TnApzs",
    slug: "bare-bones",
    title: "Bare Bones",
    description: "Clean, crisp minimalist texture pack stripping visual noise to essentials.",
    author: "RobotPants",
    project_type: "resourcepack",
    downloads: 6_800_000,
    icon_url: null,
    categories: ["simplistic", "16x"],
    versions: ["1.21.4", "1.20.1"],
    latest_version: "1.21.4",
  },
  {
    project_id: "8ooWzSQP",
    slug: "terralith",
    title: "Terralith",
    description: "Overworld world-generation datapack adding 95+ biomes using purely Vanilla blocks.",
    author: "StardustLabs",
    project_type: "datapack",
    downloads: 14_200_000,
    icon_url: null,
    categories: ["worldgen"],
    versions: ["1.21.4", "1.21.1", "1.20.1"],
    latest_version: "2.5.7",
  },
];
