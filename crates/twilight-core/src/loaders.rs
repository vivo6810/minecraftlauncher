use std::cmp::Ordering;
use std::collections::HashMap;
use std::path::PathBuf;
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use crate::models::{ModLoaderKind, Profile};
use crate::mojang::{download_verified_batch, maven_coord_to_path, DownloadTask};
use crate::paths::LauncherPaths;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoaderVersionOption {
    pub version: String,
    pub stable: bool,
    pub loader: ModLoaderKind,
}

#[derive(Debug, Deserialize)]
struct FabricLoaderResponseItem {
    loader: FabricLoaderMeta,
}

#[derive(Debug, Deserialize)]
struct FabricLoaderMeta {
    version: String,
    stable: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct QuiltLoaderResponseItem {
    loader: QuiltLoaderMeta,
}

#[derive(Debug, Deserialize)]
struct QuiltLoaderMeta {
    version: String,
}

#[derive(Debug, Deserialize)]
struct NeoForgeMavenVersions {
    versions: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct ForgePromotionsSlim {
    promos: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
pub struct LoaderProfileJson {
    #[serde(rename = "mainClass")]
    pub main_class: String,
    pub libraries: Vec<LoaderProfileLib>,
}

#[derive(Debug, Deserialize)]
pub struct LoaderProfileLib {
    pub name: String,
    pub url: Option<String>,
}

/// Computes the exact NeoForge version prefix for both `1.x[.y]` and `26.x[.y]` Minecraft releases.
/// - `"1.21"`    -> `"21.0."`
/// - `"1.21.11"` -> `"21.11."`
/// - `"26.3"`    -> `"26.3.0."`
/// - `"26.1.2"`  -> `"26.1.2."`
pub fn neoforge_version_prefix_for_mc(mc_version: &str) -> String {
    let base = mc_version.split('-').next().unwrap_or(mc_version).trim();
    if let Some(after_one) = base.strip_prefix("1.") {
        if after_one.contains('.') {
            format!("{after_one}.")
        } else {
            format!("{after_one}.0.")
        }
    } else {
        let segs: Vec<&str> = base.split('.').collect();
        if segs.len() == 2 {
            format!("{base}.0.")
        } else {
            format!("{base}.")
        }
    }
}

/// Parses a loader version string for newest-first semantic sorting.
/// Higher `(numeric_parts, is_release, prerelease_num)` sorts earlier.
pub fn compare_loader_versions_desc(a: &str, b: &str) -> Ordering {
    fn parse_key(v: &str) -> (Vec<u32>, bool, Vec<u32>, &str) {
        let (core, pre) = match v.split_once('-') {
            Some((c, p)) => (c, Some(p)),
            None => (v, None),
        };
        let nums: Vec<u32> = core
            .split('.')
            .map(|s| s.parse::<u32>().unwrap_or(0))
            .collect();
        let is_stable = pre.is_none();
        let pre_nums: Vec<u32> = pre
            .map(|p| {
                p.split(|c: char| !c.is_ascii_digit())
                    .filter(|s| !s.is_empty())
                    .filter_map(|s| s.parse::<u32>().ok())
                    .collect()
            })
            .unwrap_or_default();
        (nums, is_stable, pre_nums, v)
    }

    let ka = parse_key(a);
    let kb = parse_key(b);
    kb.cmp(&ka)
}

/// Fetches available mod loader versions for a given Minecraft version, ordered newest-first.
/// If `loader == ModLoaderKind::None`, returns an empty list (Vanilla).
pub async fn list_loader_versions(
    client: &reqwest::Client,
    loader: ModLoaderKind,
    mc_version: &str,
) -> Result<Vec<LoaderVersionOption>> {
    match loader {
        ModLoaderKind::None => Ok(Vec::new()),
        ModLoaderKind::Fabric => {
            let url = format!("https://meta.fabricmc.net/v2/versions/loader/{mc_version}");
            let items: Vec<FabricLoaderResponseItem> = client
                .get(&url)
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?;
            Ok(items
                .into_iter()
                .map(|i| LoaderVersionOption {
                    version: i.loader.version,
                    stable: i.loader.stable.unwrap_or(true),
                    loader: ModLoaderKind::Fabric,
                })
                .collect())
        }
        ModLoaderKind::Quilt => {
            let url = format!("https://meta.quiltmc.org/v3/versions/loader/{mc_version}");
            let items: Vec<QuiltLoaderResponseItem> = client
                .get(&url)
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?;
            let mut opts: Vec<LoaderVersionOption> = items
                .into_iter()
                .map(|i| LoaderVersionOption {
                    stable: !i.loader.version.contains('-')
                        && !i.loader.version.contains("beta")
                        && !i.loader.version.contains("alpha"),
                    version: i.loader.version,
                    loader: ModLoaderKind::Quilt,
                })
                .collect();
            opts.sort_by(|a, b| compare_loader_versions_desc(&a.version, &b.version));
            Ok(opts)
        }
        ModLoaderKind::Neoforge => {
            let resp: NeoForgeMavenVersions = client
                .get("https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge")
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?;
            let prefix = neoforge_version_prefix_for_mc(mc_version);
            let mut matched: Vec<LoaderVersionOption> = resp
                .versions
                .into_iter()
                .filter(|v| v.starts_with(&prefix))
                .map(|v| LoaderVersionOption {
                    stable: !v.contains("beta") && !v.contains("alpha"),
                    version: v,
                    loader: ModLoaderKind::Neoforge,
                })
                .collect();
            matched.sort_by(|a, b| compare_loader_versions_desc(&a.version, &b.version));
            Ok(matched)
        }
        ModLoaderKind::Forge => {
            let promos_opt: Option<ForgePromotionsSlim> = match client
                .get("https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json")
                .send()
                .await
            {
                Ok(r) if r.status().is_success() => r.json().await.ok(),
                _ => None,
            };

            let rec_ver = promos_opt
                .as_ref()
                .and_then(|p| p.promos.get(&format!("{mc_version}-recommended")))
                .cloned();

            // Fetch full per-MC Forge build list from maven-metadata.json
            if let Ok(resp) = client
                .get("https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.json")
                .send()
                .await
            {
                if resp.status().is_success() {
                    if let Ok(all_map) = resp.json::<HashMap<String, Vec<String>>>().await {
                        if let Some(raw_list) = all_map.get(mc_version) {
                            let strip_prefix = format!("{mc_version}-");
                            let mut builds: Vec<LoaderVersionOption> = raw_list
                                .iter()
                                .map(|entry| {
                                    let clean = entry
                                        .strip_prefix(&strip_prefix)
                                        .unwrap_or(entry)
                                        .to_string();
                                    let is_stable = rec_ver
                                        .as_ref()
                                        .map(|rec| rec == &clean)
                                        .unwrap_or_else(|| !clean.contains("beta"));
                                    LoaderVersionOption {
                                        version: clean,
                                        stable: is_stable,
                                        loader: ModLoaderKind::Forge,
                                    }
                                })
                                .collect();
                            builds.sort_by(|a, b| {
                                compare_loader_versions_desc(&a.version, &b.version)
                            });
                            if !builds.is_empty() {
                                return Ok(builds);
                            }
                        }
                    }
                }
            }

            // Fallback to promotions_slim.json if maven-metadata.json didn't list mc_version
            let mut out = Vec::new();
            if let Some(promos) = promos_opt {
                if let Some(v) = promos.promos.get(&format!("{mc_version}-recommended")) {
                    out.push(LoaderVersionOption {
                        version: v.clone(),
                        stable: true,
                        loader: ModLoaderKind::Forge,
                    });
                }
                if let Some(v) = promos.promos.get(&format!("{mc_version}-latest")) {
                    if !out.iter().any(|x| &x.version == v) {
                        out.push(LoaderVersionOption {
                            version: v.clone(),
                            stable: rec_ver.is_none(),
                            loader: ModLoaderKind::Forge,
                        });
                    }
                }
            }
            Ok(out)
        }
    }
}

/// Resolves the concrete loader version for a profile.
/// If `profile.auto_update_loader` is true OR `profile.loader_version == "latest"`,
/// resolves to the newest stable loader version automatically.
pub async fn resolve_and_auto_update_loader_version(
    client: &reqwest::Client,
    profile: &mut Profile,
) -> Result<Option<String>> {
    if profile.loader == ModLoaderKind::None {
        return Ok(None);
    }

    if profile.auto_update_loader
        || profile.loader_version.trim().is_empty()
        || profile.loader_version.eq_ignore_ascii_case("latest")
    {
        let versions = list_loader_versions(client, profile.loader, &profile.mc_version).await?;
        let chosen = versions
            .iter()
            .find(|v| v.stable)
            .or_else(|| versions.first())
            .with_context(|| {
                format!(
                    "No {} loader builds found for Minecraft {}",
                    profile.loader.as_str(),
                    profile.mc_version
                )
            })?;
        profile.loader_version = chosen.version.clone();
    }

    Ok(Some(profile.loader_version.clone()))
}

/// Installs mod-loader JARs into `loaders/<loader>/<mc>-<loader_version>/` —
/// strictly isolated from `shared/vanilla/` so mod loaders never pollute Vanilla or each other.
pub async fn prepare_isolated_loader(
    client: &reqwest::Client,
    paths: &LauncherPaths,
    loader: ModLoaderKind,
    mc_version: &str,
    loader_version: &str,
    concurrency: usize,
) -> Result<Option<(String, Vec<PathBuf>)>> {
    if loader == ModLoaderKind::None {
        return Ok(None);
    }

    let iso_dir = paths.isolated_loader_dir(loader, mc_version, loader_version);
    tokio::fs::create_dir_all(&iso_dir).await?;

    match loader {
        ModLoaderKind::Fabric | ModLoaderKind::Quilt => {
            let profile_url = match loader {
                ModLoaderKind::Fabric => format!(
                    "https://meta.fabricmc.net/v2/versions/loader/{mc_version}/{loader_version}/profile/json"
                ),
                ModLoaderKind::Quilt => format!(
                    "https://meta.quiltmc.org/v3/versions/loader/{mc_version}/{loader_version}/profile/json"
                ),
                _ => unreachable!(),
            };

            let meta: LoaderProfileJson = client
                .get(&profile_url)
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?;

            let mut tasks = Vec::new();
            let mut jars = Vec::new();
            for lib in meta.libraries {
                let rel = maven_coord_to_path(&lib.name);
                let base_repo = lib
                    .url
                    .unwrap_or_else(|| "https://libraries.minecraft.net/".to_string());
                let full_url = format!("{}{}", base_repo.trim_end_matches('/'), format!("/{rel}"));
                let dest = iso_dir.join("libraries").join(&rel);
                jars.push(dest.clone());
                tasks.push(DownloadTask {
                    url: full_url,
                    destination: dest,
                    expected_sha1: None,
                    label: lib.name,
                });
            }

            download_verified_batch(client, tasks, concurrency, |_, _, _| {}).await?;
            Ok(Some((meta.main_class, jars)))
        }
        ModLoaderKind::Neoforge | ModLoaderKind::Forge => {
            // Downloads installer artifact into isolated loader directory (never into shared/vanilla)
            let (installer_url, main_class) = if loader == ModLoaderKind::Neoforge {
                (
                    format!(
                        "https://maven.neoforged.net/releases/net/neoforged/neoforge/{loader_version}/neoforge-{loader_version}-installer.jar"
                    ),
                    "cpw.mods.bootstraplauncher.BootstrapLauncher".to_string(),
                )
            } else {
                let combo = format!("{mc_version}-{loader_version}");
                (
                    format!(
                        "https://maven.minecraftforge.net/net/minecraftforge/forge/{combo}/forge-{combo}-installer.jar"
                    ),
                    "cpw.mods.bootstraplauncher.BootstrapLauncher".to_string(),
                )
            };

            let installer_dest = iso_dir.join("installer.jar");
            download_verified_batch(
                client,
                vec![DownloadTask {
                    url: installer_url,
                    destination: installer_dest.clone(),
                    expected_sha1: None,
                    label: format!("{}-{loader_version}-installer.jar", loader.as_str()),
                }],
                1,
                |_, _, _| {},
            )
            .await?;

            Ok(Some((main_class, vec![installer_dest])))
        }
        ModLoaderKind::None => Ok(None),
    }
}
