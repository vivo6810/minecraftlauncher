use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WindowLaunchAction {
    KeepOpen,
    Minimize,
    MinimizeToTray,
    Close,
}

impl Default for WindowLaunchAction {
    fn default() -> Self {
        // Spec requirement: Default on-launch window action is Minimize
        Self::Minimize
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MonotoneTheme {
    Dark,
    Light,
}

impl Default for MonotoneTheme {
    fn default() -> Self {
        Self::Dark
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct LinuxGamingConfig {
    pub discrete_gpu_dri_prime: bool,
    pub nvidia_prime_offload: bool,
    pub wayland_native_glfw: bool,
    pub feral_gamemode: bool,
    pub mangohud: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct TwilightShieldConfig {
    /// Never pass real Microsoft session tokens to the JVM; broker joins via 127.0.0.1
    pub token_vault: bool,
    /// Confine the JVM to the profile directory via OS sandbox (Linux bubblewrap / Windows ACLs)
    pub os_sandbox: bool,
    /// Scan .jar constant pools in Rust before launch & when importing files
    pub jar_scanner: bool,
    /// Block launch automatically when High/Critical malware signatures are detected
    pub block_high_risk_jars: bool,
}

impl Default for TwilightShieldConfig {
    fn default() -> Self {
        Self {
            token_vault: true,
            os_sandbox: true,
            jar_scanner: true,
            block_high_risk_jars: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct LauncherSettings {
    /// Configurable window action when Minecraft starts. Defaults to Minimize.
    pub window_launch_action: WindowLaunchAction,
    /// Automatically pass --fullscreen to Minecraft on launch. Defaults to false (OFF).
    pub auto_fullscreen: bool,
    /// Restore launcher window when the Minecraft process exits.
    pub restore_on_game_close: bool,
    /// Strict monotone theme (Pure Dark or Crisp Paper Light).
    pub theme: MonotoneTheme,
    /// Default memory allocation for newly created profiles (MB).
    pub default_memory_mb: u32,
    /// Concurrent HTTP download workers.
    pub concurrent_downloads: usize,
    /// Global extra JVM arguments.
    pub global_jvm_args: Vec<String>,
    /// Linux-specific gaming performance & GPU toggles.
    pub linux_gaming: LinuxGamingConfig,
    /// Twilight Shield 3-layer security engine (Token Vault, OS Sandbox, Rust JAR Scanner).
    pub shield: TwilightShieldConfig,
}

impl Default for LauncherSettings {
    fn default() -> Self {
        Self {
            window_launch_action: WindowLaunchAction::Minimize,
            auto_fullscreen: false,
            restore_on_game_close: true,
            theme: MonotoneTheme::Dark,
            default_memory_mb: 4096,
            concurrent_downloads: 24,
            global_jvm_args: vec![
                "-XX:+UnlockExperimentalVMOptions".to_string(),
                "-XX:+UseG1GC".to_string(),
                "-XX:G1NewSizePercent=20".to_string(),
                "-XX:G1ReservePercent=20".to_string(),
                "-XX:MaxGCPauseMillis=50".to_string(),
                "-XX:G1HeapRegionSize=32M".to_string(),
            ],
            linux_gaming: LinuxGamingConfig::default(),
            shield: TwilightShieldConfig::default(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ModLoaderKind {
    None,
    Fabric,
    Quilt,
    Neoforge,
    Forge,
}

impl Default for ModLoaderKind {
    fn default() -> Self {
        // Spec requirement: Mod loader defaults to None (Vanilla)
        Self::None
    }
}

impl ModLoaderKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Fabric => "fabric",
            Self::Quilt => "quilt",
            Self::Neoforge => "neoforge",
            Self::Forge => "forge",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub banner_screenshot: Option<String>,
    pub mc_version: String,
    /// Defaults to ModLoaderKind::None
    pub loader: ModLoaderKind,
    /// Defaults to "latest" when a mod loader is active; None when loader == ModLoaderKind::None
    pub loader_version: String,
    /// Automatically keep the selected mod loader updated to the latest compatible build
    pub auto_update_loader: bool,
    pub allocated_ram_mb: u32,
    pub fullscreen_override: Option<bool>,
    pub sandbox_override: Option<bool>,
    pub custom_jvm_args: Vec<String>,
    pub created_at: String,
    pub last_played: Option<String>,
    pub total_playtime_secs: u64,
    pub linked_modpack_id: Option<String>,
}

impl Default for Profile {
    fn default() -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name: "New Profile".to_string(),
            icon: "cube".to_string(),
            banner_screenshot: None,
            mc_version: "26.3".to_string(),
            loader: ModLoaderKind::None,
            loader_version: "latest".to_string(),
            auto_update_loader: true,
            allocated_ram_mb: 4096,
            fullscreen_override: None,
            sandbox_override: None,
            custom_jvm_args: Vec::new(),
            created_at: chrono::Utc::now().to_rfc3339(),
            last_played: None,
            total_playtime_secs: 0,
            linked_modpack_id: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SkinVariant {
    Classic,
    Slim,
}

impl Default for SkinVariant {
    fn default() -> Self {
        Self::Classic
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WardrobeAssetKind {
    Skin,
    Cape,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WardrobeItem {
    pub sha256: String,
    pub name: String,
    pub kind: WardrobeAssetKind,
    pub variant: SkinVariant,
    pub file_name: String,
    pub added_at: String,
    pub preview_data_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OfficialMojangCape {
    pub id: String,
    pub alias: String,
    pub url: String,
    pub state: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AccountType {
    Microsoft,
    Offline,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub id: String,
    pub username: String,
    pub uuid: String,
    pub account_type: AccountType,
    pub active: bool,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub skin_sha256: Option<String>,
    pub skin_variant: SkinVariant,
    /// For Offline accounts via authlib-injector: SHA-256 of user-provided cape in Wardrobe
    pub custom_cape_sha256: Option<String>,
    /// For Microsoft Premium accounts: selected official Mojang cape ID
    pub official_cape_id: Option<String>,
    pub official_capes: Vec<OfficialMojangCape>,
    /// Optional external Yggdrasil server URL (None = use TwilightLauncher's embedded localhost server)
    pub external_yggdrasil_url: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ModrinthContentKind {
    Mod,
    Modpack,
    Resourcepack,
    Shader,
    Datapack,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "mode", content = "worlds", rename_all = "snake_case")]
pub enum DatapackInstallTarget {
    /// Copies into all existing worlds AND stages in `<profile>/datapacks_global/` for future worlds
    AllWorlds,
    /// Copies into specific world folder names under `<profile>/saves/<world>/datapacks/`
    SpecificWorlds(Vec<String>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModrinthSearchHit {
    pub project_id: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub author: String,
    pub project_type: String,
    pub downloads: u64,
    pub icon_url: Option<String>,
    pub categories: Vec<String>,
    pub versions: Vec<String>,
    pub latest_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileNode {
    pub name: String,
    pub relative_path: String,
    pub is_dir: bool,
    pub size_bytes: u64,
    pub modified_at: String,
    pub editable_config: bool,
    pub is_archive: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenshotItem {
    pub file_name: String,
    pub relative_path: String,
    pub size_bytes: u64,
    pub captured_at: String,
    pub data_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JavaRuntimeInfo {
    pub major_version: u32,
    pub vendor: String,
    pub version_string: String,
    pub executable_path: String,
    pub managed_portable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrashDiagnosis {
    pub title: String,
    pub summary: String,
    pub root_cause: String,
    pub suggested_fix: String,
    pub fix_action_code: Option<String>,
    pub sanitized_log_excerpt: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThreatSeverity {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JarThreatFinding {
    pub class_path: String,
    pub severity: ThreatSeverity,
    pub category: String,
    pub matched_indicator: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JarScanReport {
    pub file_name: String,
    pub classes_scanned: usize,
    pub scan_duration_ms: u64,
    pub safe: bool,
    pub findings: Vec<JarThreatFinding>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LauncherStateSnapshot {
    pub settings: LauncherSettings,
    pub profiles: Vec<Profile>,
    pub accounts: Vec<Account>,
    pub wardrobe: Vec<WardrobeItem>,
}
