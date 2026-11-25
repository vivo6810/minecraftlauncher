use std::path::{Path, PathBuf};
use anyhow::{Context, Result};
use serde::Deserialize;

use crate::models::JavaRuntimeInfo;
use crate::paths::LauncherPaths;

/// Determines the required Java major version for any Minecraft release.
/// - <= 1.16.5 : Java 8
/// - 1.17.x    : Java 17 (compatible with 16+)
/// - 1.18 - 1.20.4 : Java 17
/// - >= 1.20.5 / 1.21.x / 26.x : Java 21
pub fn required_java_major_for_mc(mc_version: &str) -> u32 {
    let parts: Vec<&str> = mc_version.split('.').collect();
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
    21
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
                    .unwrap_or(21);
                list.push(JavaRuntimeInfo {
                    major_version: major,
                    vendor: "Eclipse Temurin (Portable)".to_string(),
                    version_string: dir_name,
                    executable_path: exe.to_string_lossy().to_string(),
                    managed_portable: true,
                });
            }
        }
    }
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
/// for the requested Java major version (8, 17, or 21), downloading from Adoptium if needed.
pub async fn ensure_portable_java(
    client: &reqwest::Client,
    paths: &LauncherPaths,
    major_version: u32,
) -> Result<JavaRuntimeInfo> {
    let target_dir = paths
        .shared_java_dir()
        .join(format!("temurin-{major_version}"));
    if let Some(existing_exe) = find_java_executable_in_dir(&target_dir) {
        return Ok(JavaRuntimeInfo {
            major_version,
            vendor: "Eclipse Temurin (Portable)".to_string(),
            version_string: format!("temurin-{major_version}"),
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

    let api_url = format!(
        "https://api.adoptium.net/v3/assets/latest/{major_version}/hotspot?architecture={adoptium_arch}&image_type=jre&os={adoptium_os}&vendor=eclipse"
    );

    let assets: Vec<AdoptiumAsset> = client
        .get(&api_url)
        .send()
        .await
        .context("Failed querying Adoptium portable JRE API")?
        .error_for_status()?
        .json()
        .await?;

    let first = assets
        .first()
        .with_context(|| format!("No portable OpenJDK {major_version} found for {adoptium_os}/{adoptium_arch}"))?;

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
        .context("Extracted portable JRE archive did not contain bin/java")?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&exe)?.permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&exe, perms)?;
    }

    Ok(JavaRuntimeInfo {
        major_version,
        vendor: "Eclipse Temurin (Portable)".to_string(),
        version_string: first.version.semver.clone(),
        executable_path: exe.to_string_lossy().to_string(),
        managed_portable: true,
    })
}
