use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use anyhow::{Context, Result};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use tokio::io::AsyncWriteExt;
use tokio::sync::Semaphore;

use crate::paths::LauncherPaths;

pub const MOJANG_MANIFEST_V2_URL: &str =
    "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
pub const MOJANG_RESOURCES_BASE: &str = "https://resources.download.minecraft.net";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionManifest {
    pub latest: LatestVersions,
    pub versions: Vec<MinecraftVersionEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LatestVersions {
    pub release: String,
    pub snapshot: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MinecraftVersionEntry {
    pub id: String,
    #[serde(rename = "type")]
    pub version_type: String,
    pub url: String,
    pub time: String,
    #[serde(rename = "releaseTime")]
    pub release_time: String,
    pub sha1: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionDetail {
    pub id: String,
    #[serde(rename = "mainClass")]
    pub main_class: String,
    #[serde(rename = "assetIndex")]
    pub asset_index: AssetIndexRef,
    pub downloads: VersionDownloads,
    pub libraries: Vec<LibraryEntry>,
    #[serde(rename = "javaVersion")]
    pub java_version: Option<JavaVersionSpec>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JavaVersionSpec {
    #[serde(rename = "majorVersion")]
    pub major_version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetIndexRef {
    pub id: String,
    pub sha1: String,
    pub size: u64,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionDownloads {
    pub client: DownloadArtifact,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadArtifact {
    pub path: Option<String>,
    pub sha1: String,
    pub size: u64,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryEntry {
    pub name: String,
    pub downloads: Option<LibraryDownloads>,
    pub rules: Option<Vec<OsRule>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryDownloads {
    pub artifact: Option<DownloadArtifact>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OsRule {
    pub action: String,
    pub os: Option<OsConstraint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OsConstraint {
    pub name: Option<String>,
    pub arch: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetIndexFile {
    pub objects: HashMap<String, AssetObject>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetObject {
    pub hash: String,
    pub size: u64,
}

#[derive(Debug, Clone)]
pub struct DownloadTask {
    pub url: String,
    pub destination: PathBuf,
    pub expected_sha1: Option<String>,
    pub label: String,
}

/// Fetches Mojang's live version manifest so newly released versions & snapshots
/// appear automatically without updating TwilightLauncher.
pub async fn fetch_live_version_manifest(client: &reqwest::Client) -> Result<VersionManifest> {
    let resp = client
        .get(MOJANG_MANIFEST_V2_URL)
        .send()
        .await
        .context("Failed to contact Mojang version manifest CDN")?
        .error_for_status()
        .context("Mojang version manifest returned HTTP error")?;

    resp.json::<VersionManifest>()
        .await
        .context("Invalid Mojang version_manifest_v2 JSON")
}

pub fn current_mojang_os_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    }
}

pub fn library_allowed_on_host(rules: &Option<Vec<OsRule>>) -> bool {
    let Some(rule_list) = rules else {
        return true;
    };
    let host_os = current_mojang_os_name();
    let mut allowed = false;
    for rule in rule_list {
        let os_matches = match &rule.os {
            None => true,
            Some(os) => os.name.as_deref().map_or(true, |n| n == host_os),
        };
        if os_matches {
            allowed = rule.action == "allow";
        }
    }
    allowed
}

pub fn compute_file_sha1(path: &Path) -> Result<String> {
    let bytes = std::fs::read(path)?;
    let mut hasher = Sha1::new();
    hasher.update(&bytes);
    Ok(hex::encode(hasher.finalize()))
}

pub async fn download_verified_batch<F>(
    client: &reqwest::Client,
    tasks: Vec<DownloadTask>,
    concurrency: usize,
    mut on_progress: F,
) -> Result<()>
where
    F: FnMut(usize, usize, String) + Send,
{
    let total = tasks.len();
    if total == 0 {
        return Ok(());
    }

    let sem = Arc::new(Semaphore::new(concurrency.max(1)));
    let mut handles = futures_util::stream::FuturesUnordered::new();

    for task in tasks {
        let sem_clone = Arc::clone(&sem);
        let client_clone = client.clone();
        handles.push(tokio::spawn(async move {
            let _permit = sem_clone.acquire_owned().await?;
            download_single_verified(&client_clone, &task).await?;
            Ok::<String, anyhow::Error>(task.label)
        }));
    }

    let mut completed = 0usize;
    while let Some(joined) = handles.next().await {
        let label = joined.context("Download worker panicked")??;
        completed += 1;
        on_progress(completed, total, label);
    }

    Ok(())
}

async fn download_single_verified(client: &reqwest::Client, task: &DownloadTask) -> Result<()> {
    if task.destination.exists() {
        if let Some(expected) = &task.expected_sha1 {
            if let Ok(actual) = compute_file_sha1(&task.destination) {
                if actual.eq_ignore_ascii_case(expected) {
                    return Ok(());
                }
            }
        } else {
            return Ok(());
        }
    }

    if let Some(parent) = task.destination.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let tmp_path = task.destination.with_extension("part");
    let resp = client
        .get(&task.url)
        .send()
        .await
        .with_context(|| format!("Failed GET {}", task.url))?
        .error_for_status()?;

    let mut stream = resp.bytes_stream();
    let mut file = tokio::fs::File::create(&tmp_path).await?;
    let mut hasher = Sha1::new();

    while let Some(chunk) = stream.next().await {
        let data = chunk?;
        hasher.update(&data);
        file.write_all(&data).await?;
    }
    file.flush().await?;
    drop(file);

    if let Some(expected) = &task.expected_sha1 {
        let digest = hex::encode(hasher.finalize());
        anyhow::ensure!(
            digest.eq_ignore_ascii_case(expected),
            "SHA-1 mismatch for {}: expected {}, got {}",
            task.label,
            expected,
            digest
        );
    }

    tokio::fs::rename(&tmp_path, &task.destination).await?;
    Ok(())
}

/// Ensures pure Vanilla base files (`shared/vanilla/` & `shared/assets/`) are downloaded
/// and verified. Shared safely across Vanilla, Fabric, Quilt, NeoForge, and Forge.
pub async fn prepare_shared_vanilla_engine<F>(
    client: &reqwest::Client,
    paths: &LauncherPaths,
    mc_version: &str,
    concurrency: usize,
    mut on_progress: F,
) -> Result<(VersionDetail, Vec<PathBuf>)>
where
    F: FnMut(usize, usize, String) + Send,
{
    let manifest = fetch_live_version_manifest(client).await?;
    let entry = manifest
        .versions
        .iter()
        .find(|v| v.id == mc_version)
        .with_context(|| format!("Minecraft version '{mc_version}' not found in Mojang manifest"))?;

    let version_json_path = paths.vanilla_version_json(mc_version);
    download_single_verified(
        client,
        &DownloadTask {
            url: entry.url.clone(),
            destination: version_json_path.clone(),
            expected_sha1: entry.sha1.clone(),
            label: format!("{mc_version}.json"),
        },
    )
    .await?;

    let raw_json = tokio::fs::read_to_string(&version_json_path).await?;
    let detail: VersionDetail = serde_json::from_str(&raw_json)?;

    let mut tasks = Vec::new();
    let mut classpath_jars = Vec::new();

    // 1. Base unmodified client.jar
    let client_jar = paths.vanilla_client_jar(mc_version);
    tasks.push(DownloadTask {
        url: detail.downloads.client.url.clone(),
        destination: client_jar.clone(),
        expected_sha1: Some(detail.downloads.client.sha1.clone()),
        label: format!("client-{mc_version}.jar"),
    });

    // 2. Pure Vanilla Maven libraries
    for lib in &detail.libraries {
        if !library_allowed_on_host(&lib.rules) {
            continue;
        }
        if let Some(downloads) = &lib.downloads {
            if let Some(artifact) = &downloads.artifact {
                let rel_path = artifact
                    .path
                    .clone()
                    .unwrap_or_else(|| maven_coord_to_path(&lib.name));
                let dest = paths.shared_vanilla_libraries_dir().join(&rel_path);
                classpath_jars.push(dest.clone());
                tasks.push(DownloadTask {
                    url: artifact.url.clone(),
                    destination: dest,
                    expected_sha1: Some(artifact.sha1.clone()),
                    label: lib.name.clone(),
                });
            }
        }
    }

    classpath_jars.push(client_jar);

    // 3. Shared Asset Index + Objects
    let index_dest = paths
        .shared_assets_dir()
        .join("indexes")
        .join(format!("{}.json", detail.asset_index.id));
    download_single_verified(
        client,
        &DownloadTask {
            url: detail.asset_index.url.clone(),
            destination: index_dest.clone(),
            expected_sha1: Some(detail.asset_index.sha1.clone()),
            label: format!("assets-index-{}", detail.asset_index.id),
        },
    )
    .await?;

    let asset_index_raw = tokio::fs::read_to_string(&index_dest).await?;
    let asset_index: AssetIndexFile = serde_json::from_str(&asset_index_raw)?;
    for (name, obj) in asset_index.objects {
        let prefix = &obj.hash[0..2];
        let dest = paths
            .shared_assets_dir()
            .join("objects")
            .join(prefix)
            .join(&obj.hash);
        tasks.push(DownloadTask {
            url: format!("{MOJANG_RESOURCES_BASE}/{prefix}/{}", obj.hash),
            destination: dest,
            expected_sha1: Some(obj.hash.clone()),
            label: name,
        });
    }

    download_verified_batch(client, tasks, concurrency, &mut on_progress).await?;
    Ok((detail, classpath_jars))
}

pub fn maven_coord_to_path(coord: &str) -> String {
    let parts: Vec<&str> = coord.split(':').collect();
    if parts.len() < 3 {
        return coord.replace(':', "/");
    }
    let group = parts[0].replace('.', "/");
    let artifact = parts[1];
    let version = parts[2];
    format!("{group}/{artifact}/{version}/{artifact}-{version}.jar")
}
