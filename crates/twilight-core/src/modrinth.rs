use std::collections::HashSet;
use std::io::Read;
use std::path::PathBuf;
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use crate::models::{
    DatapackInstallTarget, ModLoaderKind, ModrinthContentKind, ModrinthSearchHit, Profile,
};
use crate::mojang::{download_verified_batch, DownloadTask};
use crate::paths::LauncherPaths;

const MODRINTH_API_V2: &str = "https://api.modrinth.com/v2";

#[derive(Debug, Serialize, Deserialize)]
pub struct ModrinthSearchResponse {
    pub hits: Vec<ModrinthSearchHit>,
    pub total_hits: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModrinthProjectVersion {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub version_number: String,
    pub game_versions: Vec<String>,
    pub loaders: Vec<String>,
    pub files: Vec<ModrinthVersionFile>,
    pub dependencies: Vec<ModrinthDependency>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModrinthVersionFile {
    pub url: String,
    pub filename: String,
    pub primary: bool,
    pub size: u64,
    pub hashes: ModrinthHashes,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModrinthHashes {
    pub sha1: Option<String>,
    pub sha512: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModrinthDependency {
    pub version_id: Option<String>,
    pub project_id: Option<String>,
    pub dependency_type: String,
}

#[derive(Debug, Deserialize)]
struct MrpackIndex {
    name: String,
    dependencies: std::collections::HashMap<String, String>,
    files: Vec<MrpackFile>,
}

#[derive(Debug, Deserialize)]
struct MrpackFile {
    path: String,
    hashes: ModrinthHashes,
    downloads: Vec<String>,
}

/// Searches Modrinth v2 across Mods, Modpacks, Resource Packs, Shader Packs, or Data Packs.
/// Supports both:
/// - Profile-Scoped mode (`mc_version` & `loader` pre-locked to the active profile)
/// - Universal Home Screen mode (`mc_version = None`, `loader = None`)
pub async fn search_modrinth(
    client: &reqwest::Client,
    query: &str,
    kind: ModrinthContentKind,
    mc_version: Option<&str>,
    loader: Option<ModLoaderKind>,
    limit: u32,
    offset: u32,
) -> Result<ModrinthSearchResponse> {
    let project_type = match kind {
        ModrinthContentKind::Mod => "mod",
        ModrinthContentKind::Modpack => "modpack",
        ModrinthContentKind::Resourcepack => "resourcepack",
        ModrinthContentKind::Shader => "shader",
        ModrinthContentKind::Datapack => "datapack",
    };

    let mut facets: Vec<Vec<String>> = vec![vec![format!("project_type:{project_type}")]];

    if let Some(ver) = mc_version {
        if !ver.is_empty() {
            facets.push(vec![format!("versions:{ver}")]);
        }
    }

    if matches!(kind, ModrinthContentKind::Mod | ModrinthContentKind::Modpack) {
        if let Some(ldr) = loader {
            if ldr != ModLoaderKind::None {
                facets.push(vec![format!("categories:{}", ldr.as_str())]);
            }
        }
    }

    let facets_json = serde_json::to_string(&facets)?;
    let resp: ModrinthSearchResponse = client
        .get(format!("{MODRINTH_API_V2}/search"))
        .query(&[
            ("query", query),
            ("facets", facets_json.as_str()),
            ("limit", &limit.to_string()),
            ("offset", &offset.to_string()),
        ])
        .send()
        .await
        .context("Modrinth search request failed")?
        .error_for_status()?
        .json()
        .await?;

    Ok(resp)
}

pub async fn fetch_compatible_versions(
    client: &reqwest::Client,
    project_id: &str,
    mc_version: Option<&str>,
    loader: Option<ModLoaderKind>,
) -> Result<Vec<ModrinthProjectVersion>> {
    let mut req = client.get(format!("{MODRINTH_API_V2}/project/{project_id}/version"));
    if let Some(v) = mc_version {
        let ver_json = serde_json::to_string(&vec![v])?;
        req = req.query(&[("game_versions", ver_json)]);
    }
    if let Some(l) = loader {
        if l != ModLoaderKind::None {
            let ldr_json = serde_json::to_string(&vec![l.as_str()])?;
            req = req.query(&[("loaders", ldr_json)]);
        }
    }

    let versions: Vec<ModrinthProjectVersion> = req.send().await?.error_for_status()?.json().await?;
    Ok(versions)
}

/// Installs a Mod, Resource Pack, Shader Pack, or Data Pack into the target profile.
/// - Mods recursively resolve `required` Modrinth dependencies into `<profile>/mods/`.
/// - Data Packs support both `SpecificWorlds` and `AllWorlds` (staging in `datapacks_global/`
///   even if the profile currently has 0 worlds created!).
pub async fn install_content_into_profile(
    client: &reqwest::Client,
    paths: &LauncherPaths,
    profile: &Profile,
    project_id: &str,
    kind: ModrinthContentKind,
    datapack_target: Option<DatapackInstallTarget>,
) -> Result<Vec<String>> {
    let profile_dir = paths.ensure_profile_layout(&profile.id)?;
    let loader_filter = match kind {
        ModrinthContentKind::Mod => Some(profile.loader),
        _ => None,
    };

    let mut installed_files = Vec::new();
    let mut visited = HashSet::new();
    let mut stack = vec![project_id.to_string()];

    while let Some(current_proj) = stack.pop() {
        if !visited.insert(current_proj.clone()) {
            continue;
        }

        let versions = fetch_compatible_versions(
            client,
            &current_proj,
            Some(&profile.mc_version),
            loader_filter,
        )
        .await?;

        let chosen = versions.first().with_context(|| {
            format!(
                "No compatible Modrinth version found for project {current_proj} on MC {}",
                profile.mc_version
            )
        })?;

        let file = chosen
            .files
            .iter()
            .find(|f| f.primary)
            .or_else(|| chosen.files.first())
            .context("Modrinth version has no downloadable files")?;

        let safe_filename = std::path::Path::new(&file.filename)
            .file_name()
            .and_then(|n| n.to_str())
            .context("Invalid Modrinth filename")?
            .to_string();

        match kind {
            ModrinthContentKind::Mod => {
                let dest = profile_dir.join("mods").join(&safe_filename);
                download_verified_batch(
                    client,
                    vec![DownloadTask {
                        url: file.url.clone(),
                        destination: dest,
                        expected_sha1: file.hashes.sha1.clone(),
                        label: safe_filename.clone(),
                    }],
                    1,
                    |_, _, _| {},
                )
                .await?;
                installed_files.push(safe_filename);

                for dep in &chosen.dependencies {
                    if dep.dependency_type == "required" {
                        if let Some(dep_proj) = &dep.project_id {
                            stack.push(dep_proj.clone());
                        }
                    }
                }
            }
            ModrinthContentKind::Resourcepack => {
                let dest = profile_dir.join("resourcepacks").join(&safe_filename);
                download_verified_batch(
                    client,
                    vec![DownloadTask {
                        url: file.url.clone(),
                        destination: dest,
                        expected_sha1: file.hashes.sha1.clone(),
                        label: safe_filename.clone(),
                    }],
                    1,
                    |_, _, _| {},
                )
                .await?;
                installed_files.push(safe_filename);
            }
            ModrinthContentKind::Shader => {
                let dest = profile_dir.join("shaderpacks").join(&safe_filename);
                download_verified_batch(
                    client,
                    vec![DownloadTask {
                        url: file.url.clone(),
                        destination: dest,
                        expected_sha1: file.hashes.sha1.clone(),
                        label: safe_filename.clone(),
                    }],
                    1,
                    |_, _, _| {},
                )
                .await?;
                installed_files.push(safe_filename);
            }
            ModrinthContentKind::Datapack => {
                let target = datapack_target
                    .clone()
                    .unwrap_or(DatapackInstallTarget::AllWorlds);
                let staging_file = profile_dir.join("datapacks_global").join(&safe_filename);
                download_verified_batch(
                    client,
                    vec![DownloadTask {
                        url: file.url.clone(),
                        destination: staging_file.clone(),
                        expected_sha1: file.hashes.sha1.clone(),
                        label: safe_filename.clone(),
                    }],
                    1,
                    |_, _, _| {},
                )
                .await?;

                match target {
                    DatapackInstallTarget::AllWorlds => {
                        sync_global_datapacks_to_worlds(&profile_dir)?;
                    }
                    DatapackInstallTarget::SpecificWorlds(worlds) => {
                        for world in worlds {
                            let safe_world = std::path::Path::new(&world)
                                .file_name()
                                .context("Invalid world folder name")?;
                            let world_dp = profile_dir.join("saves").join(safe_world).join("datapacks");
                            std::fs::create_dir_all(&world_dp)?;
                            std::fs::copy(&staging_file, world_dp.join(&safe_filename))?;
                        }
                        // Remove from global staging if it was strictly per-world
                        let _ = std::fs::remove_file(&staging_file);
                    }
                }
                installed_files.push(safe_filename);
            }
            ModrinthContentKind::Modpack => {
                anyhow::bail!("Use install_modpack_as_new_profile for .mrpack modpacks");
            }
        }
    }

    Ok(installed_files)
}

/// Syncs staged `"All Worlds"` Data Packs from `<profile>/datapacks_global/` into every
/// world inside `<profile>/saves/*/datapacks/` (called on install and before every game launch).
pub fn sync_global_datapacks_to_worlds(profile_dir: &PathBuf) -> Result<()> {
    let global_dir = profile_dir.join("datapacks_global");
    let saves_dir = profile_dir.join("saves");
    if !global_dir.exists() || !saves_dir.exists() {
        return Ok(());
    }

    let staged: Vec<PathBuf> = std::fs::read_dir(&global_dir)?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_file())
        .collect();

    if staged.is_empty() {
        return Ok(());
    }

    for world_entry in std::fs::read_dir(&saves_dir)?.flatten() {
        let world_path = world_entry.path();
        if world_path.is_dir() {
            let dp_dir = world_path.join("datapacks");
            std::fs::create_dir_all(&dp_dir)?;
            for pack in &staged {
                if let Some(name) = pack.file_name() {
                    let target = dp_dir.join(name);
                    if !target.exists() {
                        std::fs::copy(pack, target)?;
                    }
                }
            }
        }
    }
    Ok(())
}

/// Downloads a Modrinth `.mrpack` modpack and creates a brand-new standalone Profile
/// configured with the modpack's exact Minecraft version, Mod Loader, mods, and overrides.
pub async fn install_modpack_as_new_profile(
    client: &reqwest::Client,
    paths: &LauncherPaths,
    project_id: &str,
    custom_profile_name: Option<String>,
    default_ram_mb: u32,
) -> Result<Profile> {
    let versions = fetch_compatible_versions(client, project_id, None, None).await?;
    let latest = versions
        .first()
        .context("Modpack project has no published versions")?;
    let mrpack_file = latest
        .files
        .iter()
        .find(|f| f.filename.ends_with(".mrpack"))
        .or_else(|| latest.files.first())
        .context("No .mrpack archive found in Modrinth release")?;

    let archive_bytes = client
        .get(&mrpack_file.url)
        .send()
        .await?
        .error_for_status()?
        .bytes()
        .await?;

    let profile_id = uuid::Uuid::new_v4().to_string();
    paths.ensure_profile_layout(&profile_id)?;

    let cursor = std::io::Cursor::new(archive_bytes);
    let mut zip_arch = zip::ZipArchive::new(cursor)?;

    let index: MrpackIndex = {
        let mut idx_file = zip_arch
            .by_name("modrinth.index.json")
            .context(".mrpack is missing modrinth.index.json")?;
        let mut raw = String::new();
        idx_file.read_to_string(&mut raw)?;
        serde_json::from_str(&raw)?
    };

    // Extract overrides/ and client-overrides/ directly into the standalone profile folder
    for i in 0..zip_arch.len() {
        let mut entry = zip_arch.by_index(i)?;
        let entry_name = entry.name().to_string();
        let rel = entry_name
            .strip_prefix("overrides/")
            .or_else(|| entry_name.strip_prefix("client-overrides/"));
        if let Some(clean_rel) = rel {
            if clean_rel.is_empty() {
                continue;
            }
            let Ok(out_path) = paths.resolve_inside_profile(&profile_id, clean_rel) else {
                continue;
            };
            if entry.is_dir() {
                std::fs::create_dir_all(&out_path)?;
            } else {
                if let Some(p) = out_path.parent() {
                    std::fs::create_dir_all(p)?;
                }
                let mut out_file = std::fs::File::create(&out_path)?;
                std::io::copy(&mut entry, &mut out_file)?;
            }
        }
    }

    let mc_version = index
        .dependencies
        .get("minecraft")
        .cloned()
        .unwrap_or_else(|| "1.21.4".to_string());

    let (loader, loader_version) = if let Some(v) = index.dependencies.get("fabric-loader") {
        (ModLoaderKind::Fabric, v.clone())
    } else if let Some(v) = index.dependencies.get("quilt-loader") {
        (ModLoaderKind::Quilt, v.clone())
    } else if let Some(v) = index.dependencies.get("neoforge") {
        (ModLoaderKind::Neoforge, v.clone())
    } else if let Some(v) = index.dependencies.get("forge") {
        (ModLoaderKind::Forge, v.clone())
    } else {
        (ModLoaderKind::None, "latest".to_string())
    };

    let mut tasks = Vec::new();
    for item in index.files {
        let Ok(dest) = paths.resolve_inside_profile(&profile_id, &item.path) else {
            continue;
        };
        if let Some(url) = item.downloads.first() {
            tasks.push(DownloadTask {
                url: url.clone(),
                destination: dest,
                expected_sha1: item.hashes.sha1,
                label: item.path,
            });
        }
    }
    download_verified_batch(client, tasks, 16, |_, _, _| {}).await?;

    Ok(Profile {
        id: profile_id,
        name: custom_profile_name.unwrap_or(index.name),
        icon: "layers".to_string(),
        banner_screenshot: None,
        mc_version,
        loader,
        loader_version,
        auto_update_loader: false,
        allocated_ram_mb: default_ram_mb,
        fullscreen_override: None,
        sandbox_override: None,
        custom_jvm_args: Vec::new(),
        created_at: chrono::Utc::now().to_rfc3339(),
        last_played: None,
        total_playtime_secs: 0,
        linked_modpack_id: Some(project_id.to_string()),
    })
}
