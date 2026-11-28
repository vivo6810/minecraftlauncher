export type WindowLaunchAction =
  | "keep_open"
  | "minimize"
  | "minimize_to_tray"
  | "close";

export type MonotoneTheme = "dark" | "light";

export type ModLoaderKind = "none" | "fabric" | "quilt" | "neoforge" | "forge";

export type SkinVariant = "classic" | "slim";

export type WardrobeAssetKind = "skin" | "cape";

export type AccountType = "microsoft" | "offline";

export type ModrinthContentKind =
  | "mod"
  | "modpack"
  | "resourcepack"
  | "shader"
  | "datapack";

export interface LinuxGamingConfig {
  discrete_gpu_dri_prime: boolean;
  nvidia_prime_offload: boolean;
  wayland_native_glfw: boolean;
  feral_gamemode: boolean;
  mangohud: boolean;
}

export interface TwilightShieldConfig {
  token_vault: boolean;
  os_sandbox: boolean;
  jar_scanner: boolean;
  block_high_risk_jars: boolean;
}

export interface LauncherSettings {
  window_launch_action: WindowLaunchAction;
  auto_fullscreen: boolean;
  restore_on_game_close: boolean;
  theme: MonotoneTheme;
  accent_color?: string | null;
  background_image?: string | null;
  background_blur?: number;
  default_memory_mb: number;
  concurrent_downloads: number;
  global_jvm_args: string[];
  linux_gaming: LinuxGamingConfig;
  shield: TwilightShieldConfig;
}

export interface Profile {
  id: string;
  name: string;
  icon: string;
  banner_screenshot: string | null;
  mc_version: string;
  loader: ModLoaderKind;
  loader_version: string;
  auto_update_loader: boolean;
  allocated_ram_mb: number;
  fullscreen_override: boolean | null;
  sandbox_override: boolean | null;
  custom_jvm_args: string[];
  created_at: string;
  last_played: string | null;
  total_playtime_secs: number;
  linked_modpack_id: string | null;
}

export interface WardrobeItem {
  sha256: string;
  name: string;
  kind: WardrobeAssetKind;
  variant: SkinVariant;
  file_name: string;
  added_at: string;
  preview_data_url: string;
}

export interface OfficialMojangCape {
  id: string;
  alias: string;
  url: string;
  state: string;
}

export interface Account {
  id: string;
  username: string;
  uuid: string;
  account_type: AccountType;
  active: boolean;
  access_token?: string | null;
  skin_sha256: string | null;
  skin_variant: SkinVariant;
  custom_cape_sha256: string | null;
  official_cape_id: string | null;
  official_capes: OfficialMojangCape[];
  external_yggdrasil_url: string | null;
}

export interface LauncherStateSnapshot {
  settings: LauncherSettings;
  profiles: Profile[];
  accounts: Account[];
  wardrobe: WardrobeItem[];
}

export interface MinecraftVersionEntry {
  id: string;
  type: "release" | "snapshot" | "old_beta" | "old_alpha" | string;
  url: string;
  time: string;
  releaseTime: string;
}

export interface VersionManifest {
  latest: {
    release: string;
    snapshot: string;
  };
  versions: MinecraftVersionEntry[];
}

export interface LoaderVersionOption {
  version: string;
  stable: boolean;
  loader: ModLoaderKind;
}

export type DatapackInstallTarget =
  | { mode: "all_worlds" }
  | { mode: "specific_worlds"; worlds: string[] };

export interface ModrinthSearchHit {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  project_type: string;
  downloads: number;
  icon_url: string | null;
  categories: string[];
  versions: string[];
  latest_version: string | null;
}

export interface FileNode {
  name: string;
  relative_path: string;
  is_dir: boolean;
  size_bytes: number;
  modified_at: string;
  editable_config: boolean;
  is_archive: boolean;
}

export interface ScreenshotItem {
  file_name: string;
  relative_path: string;
  size_bytes: number;
  captured_at: string;
  data_url: string;
}

export interface JavaRuntimeInfo {
  major_version: number;
  vendor: string;
  version_string: string;
  executable_path: string;
  managed_portable: boolean;
}

export interface CrashDiagnosis {
  title: string;
  summary: string;
  root_cause: string;
  suggested_fix: string;
  fix_action_code: string | null;
  sanitized_log_excerpt: string;
}

export type ThreatSeverity = "low" | "medium" | "high" | "critical";

export interface JarThreatFinding {
  class_path: string;
  severity: ThreatSeverity;
  category: string;
  matched_indicator: string;
  description: string;
}

export interface JarScanReport {
  file_name: string;
  classes_scanned: number;
  scan_duration_ms: number;
  safe: boolean;
  findings: JarThreatFinding[];
}

export interface SandboxCapabilityStatus {
  platform: string;
  available: boolean;
  backend_name: string;
  details: string;
}

export interface IslandActivity {
  status: string;
  progress: number;
  active: boolean;
  runningProfileName?: string | null;
  startedAtMs?: number | null;
}

/** Shared GPU-friendly stretch & bounce spring curves */
export const ELASTIC_SPRING = {
  type: "spring" as const,
  stiffness: 420,
  damping: 26,
  mass: 0.75,
};

export const BOUNCE_SPRING = {
  type: "spring" as const,
  stiffness: 500,
  damping: 24,
  mass: 0.65,
};

export const ISLAND_SPRING = {
  type: "spring" as const,
  stiffness: 380,
  damping: 25,
  mass: 0.8,
};
