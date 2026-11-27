use std::path::{Path, PathBuf};
use anyhow::{Context, Result};
use serde::Deserialize;

use crate::models::JavaRuntimeInfo;
use crate::paths::LauncherPaths;

/// Fallback Java major version heuristic when Mojang's `javaVersion.majorVersion` is absent.
/// - `1.0` ..= `1.16.5`  -> Java 8
/// - `1.17` ..= `1.20.4` -> Java 17
/// - `1.20.5` ..= `1.21.x` (and `24w*` / `25w*` snapshots) -> Java 21
/// - `26.x+` (and `26w*`+ unobfuscated drops) -> Java 25
pub fn required_java_major_for_mc(mc_version: &str) -> u32 {
    let trimmed = mc_version.trim();

    // Classic weekly snapshot format: e.g. "24w14a", "25w09b", "26w04a"
    if let Some((yr_str, rest)) = trimmed.split_once('w') {
        if yr_str.len() == 2 && yr_str.chars().all(|c| c.is_ascii_digit()) && !rest.is_empty() {
            if let Ok(yr) = yr_str.parse::<u32>() {
                return if yr >= 26 {
                    25
                } else if yr >= 24 {
                    21
                } else if yr >= 21 {
                    17
                } else {
                    8
                };
            }
        }
    }

    let parts: Vec<&str> = trimmed.split('.').collect();
    if parts.len() >= 2 && parts[0] == "1" {
        let minor: u32 = parts[1]
            .chars()
            .take_while(|c| c.is_ascii_digit())
            .collect::<String>()
            .parse()
            .unwrap_or(21);
        let patch: u32 = parts
            .get(2)
            .map(|p| {
                p.chars()
                    .take_while(|c| c.is_ascii_digit())
                    .collect::<String>()
                    .parse()
                    .unwrap_or(0)
            })
            .unwrap_or(0);

        if minor <= 16 {
            return 8;
        } else if minor <= 19 || (minor == 20 && patch <= 4) {
            return 17;
        } else {
            return 21;
        }
    }

    // Year-based Minecraft releases (e.g. "26.1", "26.3", "26.4-pre-1")
    if let Some(first_seg) = parts.first() {
        let major_year: u32 = first_seg
            .chars()
            .take_while(|c| c.is_ascii_digit())
            .collect::<String>()
            .parse()
            .unwrap_or(26);
        if major_year >= 26 {
            return 25;
        }
    }

    25
}

#[derive(Debug, Deserialize)]
struct AdoptiumAvailableReleases {
    available_lts_releases: Vec<u32>,
    most_recent_feature_release: Option<u32>,
}

/// Queries Adoptium for supported Java major versions (always including 8, 17, 21, 25 plus any newer LTS/feature releases).
pub async fn fetch_available_java_majors(client: &reqwest::Client) -> Vec<u32> {
    let mut majors = vec![8_u32, 17, 21, 25];
    if let Ok(resp) = client
        .get("https://api.adoptium.net/v3/info/available_releases")
        .send()
        .await
    {
        if let Ok(info) = resp.json::<AdoptiumAvailableReleases>().await {
            for lts in info.available_lts_releases {
                if lts >= 8 && lts != 11 && !majors.contains(&lts) {
                    majors.push(lts);
                }
            }
            if let Some(feat) = info.most_recent_feature_release {
                if feat > 25 && !majors.contains(&feat) {
                    majors.push(feat);
                }
            }
        }
    }
    majors.sort_unstable();
    majors
}

#[derive(Debug, Deserialize)]
struct AdoptiumAsset {
    binary: AdoptiumBinary,
    version: AdoptiumVersionData,
}

#[derive(Debug, Deserialize)]
struct AdoptiumBinary {
    package: AdoptiumPackage,
}

#[derive(Debug, Deserialize)]
struct AdoptiumPackage {
    link: String,
    name: String,
}

#[derive(Debug, Deserialize)]
struct AdoptiumVersionData {
    semver: String,
}

pub fn java_binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "javaw.exe"
    } else {
        "java"
    }
}

pub fn list_installed_portable_javas(paths: &LauncherPaths) -> Vec<JavaRuntimeInfo> {
    let mut list = Vec::new();
    let root = paths.shared_java_dir();
    if let Ok(entries) = std::fs::read_dir(&root) {
        for entry in entries.flatten() {
            let folder = entry.path();
            if !folder.is_dir() {
                continue;
            }
            let dir_name = entry.file_name().to_string_lossy().to_string();
            if let Some(exe) = find_java_executable_in_dir(&folder) {
                let major = dir_name
                    .split('-')
                    .nth(1)
                    .and_then(|n| n.parse::<u32>().ok())
                    .unwrap_or(25);
                let version_label = std::fs::read_to_string(folder.join(".semver"))
                    .ok()
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .unwrap_or(dir_name);
                list.push(JavaRuntimeInfo {
                    major_version: major,
                    vendor: "Eclipse Temurin (Portable)".to_string(),
                    version_string: version_label,
                    executable_path: exe.to_string_lossy().to_string(),
                    managed_portable: true,
                });
            }
        }
    }
    list.sort_by_key(|j| j.major_version);
    list
}

fn find_java_executable_in_dir(dir: &Path) -> Option<PathBuf> {
    let target_bin = java_binary_name();
    for entry in walkdir::WalkDir::new(dir).max_depth(4).into_iter().flatten() {
        if entry.file_type().is_file() && entry.file_name() == target_bin {
            if let Some(parent) = entry.path().parent() {
                if parent.file_name().map_or(false, |p| p == "bin") {
                    return Some(entry.path().to_path_buf());
                }
            }
        }
    }
    None
}

/// Ensures an isolated portable OpenJDK runtime (`shared/java/temurin-{major}`) exists
/// for the requested Java major version (8, 17, 21, 25, or newer), downloading from Adoptium if needed.
pub async fn ensure_portable_java(
    client: &reqwest::Client,
    paths: &LauncherPaths,
    major_version: u32,
) -> Result<JavaRuntimeInfo> {
    let target_dir = paths
        .shared_java_dir()
        .join(format!("temurin-{major_version}"));
    if let Some(existing_exe) = find_java_executable_in_dir(&target_dir) {
        let version_label = std::fs::read_to_string(target_dir.join(".semver"))
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| format!("temurin-{major_version}"));
        return Ok(JavaRuntimeInfo {
            major_version,
            vendor: "Eclipse Temurin (Portable)".to_string(),
            version_string: version_label,
            executable_path: existing_exe.to_string_lossy().to_string(),
            managed_portable: true,
        });
    }

    let adoptium_os = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "mac"
    } else {
        "linux"
    };
    let adoptium_arch = if cfg!(target_arch = "aarch64") {
        "aarch64"
    } else {
        "x64"
    };

    // Prefer JRE for lightweight footprint; fall back to JDK if Adoptium only published JDK builds for a brand-new release
    let mut selected_asset: Option<AdoptiumAsset> = None;
    for image_type in ["jre", "jdk"] {
        let api_url = format!(
            "https://api.adoptium.net/v3/assets/latest/{major_version}/hotspot?architecture={adoptium_arch}&image_type={image_type}&os={adoptium_os}&vendor=eclipse"
        );
        if let Ok(resp) = client.get(&api_url).send().await {
            if resp.status().is_success() {
                if let Ok(mut assets) = resp.json::<Vec<AdoptiumAsset>>().await {
                    if !assets.is_empty() {
                        selected_asset = Some(assets.swap_remove(0));
                        break;
                    }
                }
            }
        }
    }

    let first = selected_asset.with_context(|| {
        format!("No portable OpenJDK {major_version} found for {adoptium_os}/{adoptium_arch}")
    })?;

    tokio::fs::create_dir_all(&target_dir).await?;
    let archive_bytes = client
        .get(&first.binary.package.link)
        .send()
        .await?
        .error_for_status()?
        .bytes()
        .await?;

    let pkg_name = first.binary.package.name.clone();
    let dest_clone = target_dir.clone();
    tokio::task::spawn_blocking(move || -> Result<()> {
        if pkg_name.ends_with(".zip") {
            let cursor = std::io::Cursor::new(archive_bytes);
            let mut archive = zip::ZipArchive::new(cursor)?;
            archive.extract(&dest_clone)?;
        } else if pkg_name.ends_with(".tar.gz") || pkg_name.ends_with(".tgz") {
            let cursor = std::io::Cursor::new(archive_bytes);
            let gz = flate2::read::GzDecoder::new(cursor);
            let mut tar = tar::Archive::new(gz);
            tar.unpack(&dest_clone)?;
        }
        Ok(())
    })
    .await??;

    let exe = find_java_executable_in_dir(&target_dir)
        .context("Extracted portable OpenJDK archive did not contain bin/java")?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&exe)?.permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&exe, perms)?;
    }

    let _ = std::fs::write(target_dir.join(".semver"), &first.version.semver);

    Ok(JavaRuntimeInfo {
        major_version,
        vendor: "Eclipse Temurin (Portable)".to_string(),
        version_string: first.version.semver,
        executable_path: exe.to_string_lossy().to_string(),
        managed_portable: true,
    })
}
