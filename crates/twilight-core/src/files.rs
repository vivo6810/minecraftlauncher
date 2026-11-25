use std::path::Path;
use anyhow::{Context, Result};
use base64::Engine;

use crate::models::{FileNode, ScreenshotItem};
use crate::paths::LauncherPaths;

const EDITABLE_EXTENSIONS: &[&str] = &[
    "toml", "json", "json5", "properties", "txt", "cfg", "conf", "yml", "yaml", "ini", "mcmeta",
    "log",
];

pub fn list_profile_directory(
    paths: &LauncherPaths,
    profile_id: &str,
    relative_dir: &str,
) -> Result<Vec<FileNode>> {
    let profile_root = paths.ensure_profile_layout(profile_id)?.canonicalize()?;
    let target_dir = paths.resolve_inside_profile(profile_id, relative_dir)?;
    if !target_dir.exists() {
        return Ok(Vec::new());
    }

    let mut nodes = Vec::new();
    for entry in std::fs::read_dir(&target_dir)?.flatten() {
        let meta = entry.metadata()?;
        let full = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let rel = full
            .strip_prefix(&profile_root)
            .unwrap_or(&full)
            .to_string_lossy()
            .replace('\\', "/");

        let ext = full
            .extension()
            .map(|e| e.to_string_lossy().to_ascii_lowercase())
            .unwrap_or_default();

        let modified_at = meta
            .modified()
            .ok()
            .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339())
            .unwrap_or_default();

        nodes.push(FileNode {
            name,
            relative_path: rel,
            is_dir: meta.is_dir(),
            size_bytes: if meta.is_dir() { 0 } else { meta.len() },
            modified_at,
            editable_config: !meta.is_dir() && EDITABLE_EXTENSIONS.contains(&ext.as_str()),
            is_archive: !meta.is_dir() && ext == "zip",
        });
    }

    nodes.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(nodes)
}

pub fn create_profile_subfolder(
    paths: &LauncherPaths,
    profile_id: &str,
    relative_dir: &str,
) -> Result<()> {
    let target = paths.resolve_inside_profile(profile_id, relative_dir)?;
    std::fs::create_dir_all(target)?;
    Ok(())
}

/// Copies an external file (such as a `.jar` mod, `.zip` resourcepack, or any file)
/// into the chosen directory inside the profile.
pub fn import_external_file_into_profile(
    paths: &LauncherPaths,
    profile_id: &str,
    source_file: &Path,
    target_relative_dir: &str,
) -> Result<String> {
    let file_name = source_file
        .file_name()
        .context("Source path has no file name")?
        .to_string_lossy()
        .to_string();
    let dest_dir = paths.resolve_inside_profile(profile_id, target_relative_dir)?;
    std::fs::create_dir_all(&dest_dir)?;
    let dest = dest_dir.join(&file_name);
    std::fs::copy(source_file, &dest)?;
    Ok(file_name)
}

pub fn write_uploaded_bytes_into_profile(
    paths: &LauncherPaths,
    profile_id: &str,
    target_relative_dir: &str,
    file_name: &str,
    bytes: &[u8],
) -> Result<()> {
    let safe_name = Path::new(file_name)
        .file_name()
        .context("Invalid file name")?;
    let dest_dir = paths.resolve_inside_profile(profile_id, target_relative_dir)?;
    std::fs::create_dir_all(&dest_dir)?;
    std::fs::write(dest_dir.join(safe_name), bytes)?;
    Ok(())
}

/// Extracts a `.zip` archive directly inside the profile's File Explorer,
/// guarding against Zip-Slip path traversal.
pub fn extract_archive_inside_profile(
    paths: &LauncherPaths,
    profile_id: &str,
    archive_relative_path: &str,
    destination_relative_dir: Option<&str>,
) -> Result<usize> {
    let archive_path = paths.resolve_inside_profile(profile_id, archive_relative_path)?;
    let default_dest = archive_path
        .file_stem()
        .map(|s| {
            let parent = Path::new(archive_relative_path)
                .parent()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            if parent.is_empty() {
                s.to_string_lossy().to_string()
            } else {
                format!("{parent}/{}", s.to_string_lossy())
            }
        })
        .unwrap_or_else(|| "extracted".to_string());

    let dest_rel = destination_relative_dir.unwrap_or(&default_dest);
    let dest_root = paths.resolve_inside_profile(profile_id, dest_rel)?;
    std::fs::create_dir_all(&dest_root)?;

    let file = std::fs::File::open(&archive_path)?;
    let mut zip = zip::ZipArchive::new(file)?;
    let mut extracted_count = 0usize;

    for i in 0..zip.len() {
        let mut entry = zip.by_index(i)?;
        let Some(enclosed) = entry.enclosed_name().map(|p| p.to_path_buf()) else {
            continue;
        };
        let out_path = dest_root.join(enclosed);
        if entry.is_dir() {
            std::fs::create_dir_all(&out_path)?;
        } else {
            if let Some(p) = out_path.parent() {
                std::fs::create_dir_all(p)?;
            }
            let mut out = std::fs::File::create(&out_path)?;
            std::io::copy(&mut entry, &mut out)?;
            extracted_count += 1;
        }
    }
    Ok(extracted_count)
}

pub fn rename_or_move_profile_entry(
    paths: &LauncherPaths,
    profile_id: &str,
    from_rel: &str,
    to_rel: &str,
) -> Result<()> {
    let src = paths.resolve_inside_profile(profile_id, from_rel)?;
    let dst = paths.resolve_inside_profile(profile_id, to_rel)?;
    if let Some(p) = dst.parent() {
        std::fs::create_dir_all(p)?;
    }
    std::fs::rename(src, dst)?;
    Ok(())
}

pub fn copy_profile_entry(
    paths: &LauncherPaths,
    profile_id: &str,
    from_rel: &str,
    to_rel: &str,
) -> Result<()> {
    let src = paths.resolve_inside_profile(profile_id, from_rel)?;
    let dst = paths.resolve_inside_profile(profile_id, to_rel)?;
    if src.is_dir() {
        for entry in walkdir::WalkDir::new(&src).into_iter().flatten() {
            let rel = entry.path().strip_prefix(&src)?;
            let out = dst.join(rel);
            if entry.file_type().is_dir() {
                std::fs::create_dir_all(&out)?;
            } else {
                if let Some(p) = out.parent() {
                    std::fs::create_dir_all(p)?;
                }
                std::fs::copy(entry.path(), &out)?;
            }
        }
    } else {
        if let Some(p) = dst.parent() {
            std::fs::create_dir_all(p)?;
        }
        std::fs::copy(src, dst)?;
    }
    Ok(())
}

pub fn delete_profile_entry(
    paths: &LauncherPaths,
    profile_id: &str,
    relative_path: &str,
) -> Result<()> {
    let target = paths.resolve_inside_profile(profile_id, relative_path)?;
    let profile_root = paths.ensure_profile_layout(profile_id)?.canonicalize()?;
    anyhow::ensure!(target != profile_root, "Cannot delete profile root via file explorer");

    if target.is_dir() {
        std::fs::remove_dir_all(target)?;
    } else if target.exists() {
        std::fs::remove_file(target)?;
    }
    Ok(())
}

/// Built-in Lightweight Config Editor: reads text config files inside a profile.
pub fn read_profile_text_file(
    paths: &LauncherPaths,
    profile_id: &str,
    relative_path: &str,
) -> Result<String> {
    let target = paths.resolve_inside_profile(profile_id, relative_path)?;
    let meta = std::fs::metadata(&target)?;
    anyhow::ensure!(
        meta.len() <= 4 * 1024 * 1024,
        "File is larger than 4 MB config editor limit"
    );
    Ok(std::fs::read_to_string(target)?)
}

pub fn write_profile_text_file(
    paths: &LauncherPaths,
    profile_id: &str,
    relative_path: &str,
    content: &str,
) -> Result<()> {
    let target = paths.resolve_inside_profile(profile_id, relative_path)?;
    if let Some(p) = target.parent() {
        std::fs::create_dir_all(p)?;
    }
    std::fs::write(target, content)?;
    Ok(())
}

pub fn list_profile_worlds(paths: &LauncherPaths, profile_id: &str) -> Result<Vec<String>> {
    let saves = paths.resolve_inside_profile(profile_id, "saves")?;
    if !saves.exists() {
        return Ok(Vec::new());
    }
    let mut worlds = Vec::new();
    for entry in std::fs::read_dir(saves)?.flatten() {
        if entry.path().is_dir() {
            worlds.push(entry.file_name().to_string_lossy().to_string());
        }
    }
    worlds.sort();
    Ok(worlds)
}

/// Reads `<profile>/screenshots/` and returns gallery items for the Screenshot Lightbox.
pub fn list_profile_screenshots(
    paths: &LauncherPaths,
    profile_id: &str,
) -> Result<Vec<ScreenshotItem>> {
    let shots_dir = paths.resolve_inside_profile(profile_id, "screenshots")?;
    if !shots_dir.exists() {
        return Ok(Vec::new());
    }

    let mut items = Vec::new();
    for entry in std::fs::read_dir(&shots_dir)?.flatten() {
        let p = entry.path();
        let ext = p
            .extension()
            .map(|e| e.to_string_lossy().to_ascii_lowercase())
            .unwrap_or_default();
        if !matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp") {
            continue;
        }
        let meta = entry.metadata()?;
        let bytes = std::fs::read(&p)?;
        let mime = if ext == "png" { "image/png" } else { "image/jpeg" };
        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        let captured_at = meta
            .modified()
            .ok()
            .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339())
            .unwrap_or_default();
        let name = entry.file_name().to_string_lossy().to_string();

        items.push(ScreenshotItem {
            relative_path: format!("screenshots/{name}"),
            file_name: name,
            size_bytes: meta.len(),
            captured_at,
            data_url: format!("data:{mime};base64,{b64}"),
        });
    }

    items.sort_by(|a, b| b.captured_at.cmp(&a.captured_at));
    Ok(items)
}
