use std::path::{Path, PathBuf};
use anyhow::{Context, Result};
use directories::ProjectDirs;
use crate::models::ModLoaderKind;

/// Enforces TwilightLauncher's strict storage isolation architecture:
///
/// 1. `shared/` — ONLY 100% engine-common read-only files identical across ALL mod loaders:
///    - `shared/assets/`   (Mojang sounds, textures, lang objects & indexes)
///    - `shared/java/`     (Portable OpenJDK 8 / 17 / 21+ runtimes)
///    - `shared/vanilla/`  (Unmodified Mojang `versions/<mc>/client.jar` & pure Vanilla `libraries/`)
///
/// 2. `loaders/` — Strictly isolated mod-loader binaries & Forge/NeoForge patched JARs:
///    - `loaders/<loader>/<mc_version>-<loader_version>/`
///    Never touches or overwrites `shared/vanilla/` or other mod loaders.
///
/// 3. `instances/<profile_id>/` — 100% standalone per-profile files (no hardlink sharing):
///    - `mods/`, `config/`, `resourcepacks/`, `shaderpacks/`, `saves/`, `screenshots/`, `datapacks_global/`
///
/// 4. `wardrobe/` — Persistent history of user-provided `.png` skins & capes indexed by SHA-256.
#[derive(Debug, Clone)]
pub struct LauncherPaths {
    pub root: PathBuf,
}

impl LauncherPaths {
    pub fn resolve_default() -> Result<Self> {
        let proj = ProjectDirs::from("io", "vivo6810", "TwilightLauncher")
            .context("Could not determine OS application data directory")?;
        Self::from_root(proj.data_dir().to_path_buf())
    }

    pub fn from_root(root: PathBuf) -> Result<Self> {
        let paths = Self { root };
        paths.ensure_base_dirs()?;
        Ok(paths)
    }

    pub fn ensure_base_dirs(&self) -> Result<()> {
        for dir in [
            self.shared_assets_dir(),
            self.shared_java_dir(),
            self.shared_vanilla_libraries_dir(),
            self.shared_vanilla_versions_dir(),
            self.loaders_root_dir(),
            self.instances_dir(),
            self.wardrobe_skins_dir(),
            self.wardrobe_capes_dir(),
            self.tools_dir(),
        ] {
            std::fs::create_dir_all(&dir)
                .with_context(|| format!("Failed creating directory {}", dir.display()))?;
        }
        Ok(())
    }

    pub fn state_file(&self) -> PathBuf {
        self.root.join("state.json")
    }

    // --- 1. Strictly Common Shared Engine Directories ---
    pub fn shared_dir(&self) -> PathBuf {
        self.root.join("shared")
    }

    pub fn shared_assets_dir(&self) -> PathBuf {
        self.shared_dir().join("assets")
    }

    pub fn shared_java_dir(&self) -> PathBuf {
        self.shared_dir().join("java")
    }

    pub fn shared_vanilla_dir(&self) -> PathBuf {
        self.shared_dir().join("vanilla")
    }

    pub fn shared_vanilla_libraries_dir(&self) -> PathBuf {
        self.shared_vanilla_dir().join("libraries")
    }

    pub fn shared_vanilla_versions_dir(&self) -> PathBuf {
        self.shared_vanilla_dir().join("versions")
    }

    pub fn vanilla_client_jar(&self, mc_version: &str) -> PathBuf {
        self.shared_vanilla_versions_dir()
            .join(mc_version)
            .join(format!("{mc_version}.jar"))
    }

    pub fn vanilla_version_json(&self, mc_version: &str) -> PathBuf {
        self.shared_vanilla_versions_dir()
            .join(mc_version)
            .join(format!("{mc_version}.json"))
    }

    // --- 2. Isolated Mod-Loader Directories ---
    pub fn loaders_root_dir(&self) -> PathBuf {
        self.root.join("loaders")
    }

    pub fn isolated_loader_dir(
        &self,
        loader: ModLoaderKind,
        mc_version: &str,
        loader_version: &str,
    ) -> PathBuf {
        self.loaders_root_dir()
            .join(loader.as_str())
            .join(format!("{mc_version}-{loader_version}"))
    }

    // --- 3. Standalone Per-Profile Directories ---
    pub fn instances_dir(&self) -> PathBuf {
        self.root.join("instances")
    }

    pub fn profile_dir(&self, profile_id: &str) -> PathBuf {
        let safe_id: String = profile_id
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
            .collect();
        self.instances_dir().join(safe_id)
    }

    pub fn ensure_profile_layout(&self, profile_id: &str) -> Result<PathBuf> {
        let base = self.profile_dir(profile_id);
        for sub in [
            "mods",
            "config",
            "resourcepacks",
            "shaderpacks",
            "saves",
            "screenshots",
            "datapacks_global",
            "logs",
        ] {
            std::fs::create_dir_all(base.join(sub))?;
        }
        Ok(base)
    }

    /// Safely resolves a user-supplied relative path inside a profile directory,
    /// blocking any `..` traversal outside the profile sandbox.
    pub fn resolve_inside_profile(&self, profile_id: &str, rel: &str) -> Result<PathBuf> {
        let profile_root = self.ensure_profile_layout(profile_id)?.canonicalize()?;
        let cleaned = rel.trim_start_matches(['/', '\\']);
        let candidate = profile_root.join(cleaned);

        // Normalize parent components before existence check
        let mut normalized = PathBuf::new();
        for comp in candidate.components() {
            match comp {
                std::path::Component::ParentDir => {
                    normalized.pop();
                }
                std::path::Component::CurDir => {}
                other => normalized.push(other.as_os_str()),
            }
        }

        anyhow::ensure!(
            normalized.starts_with(&profile_root),
            "Access outside profile directory is forbidden"
        );
        Ok(normalized)
    }

    // --- 4. Wardrobe & Auxiliary Tools (authlib-injector) ---
    pub fn wardrobe_skins_dir(&self) -> PathBuf {
        self.root.join("wardrobe").join("skins")
    }

    pub fn wardrobe_capes_dir(&self) -> PathBuf {
        self.root.join("wardrobe").join("capes")
    }

    pub fn tools_dir(&self) -> PathBuf {
        self.root.join("tools")
    }

    pub fn authlib_injector_jar(&self) -> PathBuf {
        self.tools_dir().join("authlib-injector.jar")
    }

    pub fn root_path(&self) -> &Path {
        &self.root
    }
}
