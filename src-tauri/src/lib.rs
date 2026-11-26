use std::sync::Mutex;
use base64::Engine;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use twilight_core::models::{
    AccountType, CrashDiagnosis, DatapackInstallTarget, FileNode, JarScanReport, JavaRuntimeInfo,
    LauncherSettings, LauncherStateSnapshot, ModLoaderKind, ModrinthContentKind, ModrinthSearchHit,
    Profile, ScreenshotItem, SkinVariant, WardrobeAssetKind, WardrobeItem, WindowLaunchAction,
};
use twilight_core::paths::LauncherPaths;

pub struct AppContext {
    pub paths: LauncherPaths,
    pub http: reqwest::Client,
    pub state: Mutex<LauncherStateSnapshot>,
    pub wardrobe_fs_lock: tokio::sync::Mutex<()>,
    pub skin_sync_lock: tokio::sync::Mutex<()>,
    pub skin_sync_seq: Mutex<std::collections::HashMap<String, u64>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct IslandEventPayload {
    pub status: String,
    pub progress: f32,
    pub active: bool,
}

#[tauri::command]
fn get_launcher_state(ctx: State<'_, AppContext>) -> Result<LauncherStateSnapshot, String> {
    let guard = ctx.state.lock().map_err(|e| e.to_string())?;
    Ok(guard.clone())
}

#[tauri::command]
fn update_launcher_settings(
    ctx: State<'_, AppContext>,
    settings: LauncherSettings,
) -> Result<LauncherSettings, String> {
    let mut guard = ctx.state.lock().map_err(|e| e.to_string())?;
    guard.settings = settings.clone();
    twilight_core::save_state(&ctx.paths, &guard).map_err(|e| e.to_string())?;
    Ok(settings)
}

#[tauri::command]
fn upsert_profile(
    ctx: State<'_, AppContext>,
    profile: Profile,
) -> Result<Vec<Profile>, String> {
    ctx.paths
        .ensure_profile_layout(&profile.id)
        .map_err(|e| e.to_string())?;
    let mut guard = ctx.state.lock().map_err(|e| e.to_string())?;
    if let Some(existing) = guard.profiles.iter_mut().find(|p| p.id == profile.id) {
        *existing = profile;
    } else {
        guard.profiles.push(profile);
    }
    twilight_core::save_state(&ctx.paths, &guard).map_err(|e| e.to_string())?;
    Ok(guard.profiles.clone())
}

#[tauri::command]
fn delete_profile(
    ctx: State<'_, AppContext>,
    profile_id: String,
) -> Result<Vec<Profile>, String> {
    let mut guard = ctx.state.lock().map_err(|e| e.to_string())?;
    guard.profiles.retain(|p| p.id != profile_id);
    let prof_dir = ctx.paths.profile_dir(&profile_id);
    if prof_dir.exists() {
        let _ = std::fs::remove_dir_all(prof_dir);
    }
    twilight_core::save_state(&ctx.paths, &guard).map_err(|e| e.to_string())?;
    Ok(guard.profiles.clone())
}

#[tauri::command]
async fn fetch_mc_versions(
    ctx: State<'_, AppContext>,
) -> Result<twilight_core::mojang::VersionManifest, String> {
    twilight_core::mojang::fetch_live_version_manifest(&ctx.http)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn fetch_loader_versions(
    ctx: State<'_, AppContext>,
    loader: ModLoaderKind,
    mc_version: String,
) -> Result<Vec<twilight_core::loaders::LoaderVersionOption>, String> {
    twilight_core::loaders::list_loader_versions(&ctx.http, loader, &mc_version)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn create_offline_account_cmd(
    ctx: State<'_, AppContext>,
    username: String,
    external_yggdrasil_url: Option<String>,
) -> Result<LauncherStateSnapshot, String> {
    let mut acct = twilight_core::auth::create_offline_account(&username);
    acct.external_yggdrasil_url = external_yggdrasil_url;

    let mut guard = ctx.state.lock().map_err(|e| e.to_string())?;
    for a in &mut guard.accounts {
        a.active = false;
    }
    guard.accounts.push(acct);
    twilight_core::save_state(&ctx.paths, &guard).map_err(|e| e.to_string())?;
    Ok(guard.clone())
}

#[tauri::command]
async fn connect_microsoft_token_cmd(
    ctx: State<'_, AppContext>,
    mc_access_token: String,
) -> Result<LauncherStateSnapshot, String> {
    let (uuid, username, capes) =
        twilight_core::auth::fetch_mojang_premium_profile(&ctx.http, &mc_access_token)
            .await
            .map_err(|e| e.to_string())?;

    let active_cape = capes
        .iter()
        .find(|c| c.state.eq_ignore_ascii_case("ACTIVE"))
        .map(|c| c.id.clone());

    let mut guard = ctx.state.lock().map_err(|e| e.to_string())?;
    for a in &mut guard.accounts {
        a.active = false;
    }
    guard.accounts.push(twilight_core::models::Account {
        id: uuid.clone(),
        username,
        uuid,
        account_type: AccountType::Microsoft,
        active: true,
        access_token: Some(mc_access_token),
        refresh_token: None,
        skin_sha256: None,
        skin_variant: SkinVariant::Classic,
        custom_cape_sha256: None,
        official_cape_id: active_cape,
        official_capes: capes,
        external_yggdrasil_url: None,
    });
    twilight_core::save_state(&ctx.paths, &guard).map_err(|e| e.to_string())?;
    Ok(guard.clone())
}

#[tauri::command]
fn set_active_account(
    ctx: State<'_, AppContext>,
    account_id: String,
) -> Result<LauncherStateSnapshot, String> {
    let mut guard = ctx.state.lock().map_err(|e| e.to_string())?;
    for acct in &mut guard.accounts {
        acct.active = acct.id == account_id;
    }
    twilight_core::save_state(&ctx.paths, &guard).map_err(|e| e.to_string())?;
    Ok(guard.clone())
}

#[tauri::command]
fn remove_account(
    ctx: State<'_, AppContext>,
    account_id: String,
) -> Result<LauncherStateSnapshot, String> {
    let mut guard = ctx.state.lock().map_err(|e| e.to_string())?;
    guard.accounts.retain(|a| a.id != account_id);
    if !guard.accounts.iter().any(|a| a.active) {
        if let Some(first) = guard.accounts.first_mut() {
            first.active = true;
        }
    }
    twilight_core::save_state(&ctx.paths, &guard).map_err(|e| e.to_string())?;
    Ok(guard.clone())
}

#[tauri::command]
async fn import_and_equip_wardrobe_png(
    ctx: State<'_, AppContext>,
    account_id: String,
    name: String,
    base64_png: String,
    kind: WardrobeAssetKind,
    variant: SkinVariant,
) -> Result<LauncherStateSnapshot, String> {
    let clean_b64 = base64_png
        .split(',')
        .last()
        .unwrap_or(&base64_png);
    let png_bytes = base64::engine::general_purpose::STANDARD
        .decode(clean_b64)
        .map_err(|e| format!("Invalid base64 PNG: {e}"))?;

    let sync_seq = {
        let _fs_guard = ctx.wardrobe_fs_lock.lock().await;

        let item: WardrobeItem = twilight_core::auth::import_png_to_wardrobe(
            &ctx.paths,
            &png_bytes,
            &name,
            kind,
            variant,
        )
        .map_err(|e| e.to_string())?;

        let mut guard = ctx.state.lock().map_err(|e| e.to_string())?;
        let mut staged = guard.clone();
        if !staged
            .wardrobe
            .iter()
            .any(|w| w.sha256 == item.sha256 && w.kind == item.kind)
        {
            staged.wardrobe.insert(0, item.clone());
        }
        let mut needs_sync = false;
        if let Some(acct) = staged.accounts.iter_mut().find(|a| a.id == account_id) {
            match kind {
                WardrobeAssetKind::Skin => {
                    acct.skin_sha256 = Some(item.sha256.clone());
                    acct.skin_variant = variant;
                    if acct.account_type == AccountType::Microsoft && acct.access_token.is_some() {
                        needs_sync = true;
                    }
                }
                WardrobeAssetKind::Cape => {
                    acct.custom_cape_sha256 = Some(item.sha256.clone());
                }
            }
        }
        twilight_core::save_state(&ctx.paths, &staged).map_err(|e| e.to_string())?;
        *guard = staged;
        if needs_sync {
            let mut seq_map = ctx.skin_sync_seq.lock().map_err(|e| e.to_string())?;
            let entry = seq_map.entry(account_id.clone()).or_insert(0);
            *entry += 1;
            Some(*entry)
        } else {
            None
        }
    };

    if let Some(my_seq) = sync_seq {
        sync_latest_premium_skin(&ctx, &account_id, my_seq).await?;
    }

    let guard = ctx.state.lock().map_err(|e| e.to_string())?;
    Ok(guard.clone())
}

async fn sync_latest_premium_skin(
    ctx: &AppContext,
    account_id: &str,
    my_seq: u64,
) -> Result<(), String> {
    let _serial = ctx.skin_sync_lock.lock().await;

    let upload_info = {
        let guard = ctx.state.lock().map_err(|e| e.to_string())?;
        let seq_map = ctx.skin_sync_seq.lock().map_err(|e| e.to_string())?;
        let latest_seq = seq_map.get(account_id).copied().unwrap_or(0);
        if latest_seq != my_seq {
            return Ok(());
        }
        guard
            .accounts
            .iter()
            .find(|a| a.id == account_id && a.account_type == AccountType::Microsoft)
            .and_then(|acct| {
                let tok = acct.access_token.clone()?;
                let sha = acct.skin_sha256.clone()?;
                if sha.is_empty() {
                    return None;
                }
                Some((
                    tok,
                    ctx.paths.wardrobe_skins_dir().join(format!("{sha}.png")),
                    acct.skin_variant,
                ))
            })
    };

    if let Some((tok, skin_path, active_variant)) = upload_info {
        let png_bytes = std::fs::read(&skin_path).map_err(|err| {
            format!(
                "Skin selected locally, but reading local PNG for Mojang sync failed (select again to retry): {err}"
            )
        })?;
        twilight_core::auth::upload_skin_to_mojang_premium(
            &ctx.http,
            &tok,
            png_bytes,
            active_variant,
        )
        .await
        .map_err(|err| {
            format!(
                "Skin selected locally, but Mojang sync failed (select again to retry): {err}"
            )
        })?;
    }
    Ok(())
}

#[tauri::command]
async fn equip_existing_wardrobe_item(
    ctx: State<'_, AppContext>,
    account_id: String,
    sha256: String,
    kind: WardrobeAssetKind,
    variant: SkinVariant,
) -> Result<LauncherStateSnapshot, String> {
    if !sha256.is_empty() && !sha256.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("Invalid wardrobe asset hash".to_string());
    }
    let sync_seq = {
        let mut guard = ctx.state.lock().map_err(|e| e.to_string())?;
        let mut staged = guard.clone();
        let mut needs_sync = false;
        if let Some(acct) = staged.accounts.iter_mut().find(|a| a.id == account_id) {
            match kind {
                WardrobeAssetKind::Skin => {
                    acct.skin_sha256 = if sha256.is_empty() {
                        None
                    } else {
                        if acct.account_type == AccountType::Microsoft
                            && acct.access_token.is_some()
                        {
                            needs_sync = true;
                        }
                        Some(sha256)
                    };
                    acct.skin_variant = variant;
                }
                WardrobeAssetKind::Cape => {
                    acct.custom_cape_sha256 = if sha256.is_empty() {
                        None
                    } else {
                        Some(sha256)
                    };
                }
            }
        }
        twilight_core::save_state(&ctx.paths, &staged).map_err(|e| e.to_string())?;
        *guard = staged;
        if needs_sync {
            let mut seq_map = ctx.skin_sync_seq.lock().map_err(|e| e.to_string())?;
            let entry = seq_map.entry(account_id.clone()).or_insert(0);
            *entry += 1;
            Some(*entry)
        } else {
            None
        }
    };

    if let Some(my_seq) = sync_seq {
        sync_latest_premium_skin(&ctx, &account_id, my_seq).await?;
    }

    let guard = ctx.state.lock().map_err(|e| e.to_string())?;
    Ok(guard.clone())
}

#[tauri::command]
async fn remove_wardrobe_item(
    ctx: State<'_, AppContext>,
    sha256: String,
    kind: WardrobeAssetKind,
) -> Result<LauncherStateSnapshot, String> {
    if sha256.is_empty() || !sha256.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("Invalid wardrobe asset hash".to_string());
    }
    let _fs_guard = ctx.wardrobe_fs_lock.lock().await;
    let asset_path = match kind {
        WardrobeAssetKind::Skin => ctx.paths.wardrobe_skins_dir().join(format!("{sha256}.png")),
        WardrobeAssetKind::Cape => ctx.paths.wardrobe_capes_dir().join(format!("{sha256}.png")),
    };

    let committed = {
        let mut guard = ctx.state.lock().map_err(|e| e.to_string())?;
        let mut staged = guard.clone();
        staged
            .wardrobe
            .retain(|w| !(w.sha256 == sha256 && w.kind == kind));
        for acct in &mut staged.accounts {
            match kind {
                WardrobeAssetKind::Skin => {
                    if acct.skin_sha256.as_deref() == Some(sha256.as_str()) {
                        acct.skin_sha256 = None;
                    }
                }
                WardrobeAssetKind::Cape => {
                    if acct.custom_cape_sha256.as_deref() == Some(sha256.as_str()) {
                        acct.custom_cape_sha256 = None;
                    }
                }
            }
        }
        twilight_core::save_state(&ctx.paths, &staged).map_err(|e| e.to_string())?;
        *guard = staged.clone();
        staged
    };

    if asset_path.exists() {
        let _ = std::fs::remove_file(asset_path);
    }
    Ok(committed)
}

#[tauri::command]
async fn select_official_cape_cmd(
    ctx: State<'_, AppContext>,
    account_id: String,
    cape_id: Option<String>,
) -> Result<LauncherStateSnapshot, String> {
    let token = {
        let mut guard = ctx.state.lock().map_err(|e| e.to_string())?;
        let mut tok = None;
        if let Some(acct) = guard.accounts.iter_mut().find(|a| a.id == account_id) {
            acct.official_cape_id = cape_id.clone();
            tok = acct.access_token.clone();
        }
        twilight_core::save_state(&ctx.paths, &guard).map_err(|e| e.to_string())?;
        tok
    };

    if let Some(tok) = token {
        twilight_core::auth::select_official_mojang_cape(&ctx.http, &tok, cape_id.as_deref())
            .await
            .map_err(|e| e.to_string())?;
    }

    let guard = ctx.state.lock().map_err(|e| e.to_string())?;
    Ok(guard.clone())
}

#[tauri::command]
async fn search_modrinth_cmd(
    ctx: State<'_, AppContext>,
    query: String,
    kind: ModrinthContentKind,
    mc_version: Option<String>,
    loader: Option<ModLoaderKind>,
) -> Result<Vec<ModrinthSearchHit>, String> {
    twilight_core::modrinth::search_modrinth(
        &ctx.http,
        &query,
        kind,
        mc_version.as_deref(),
        loader,
        24,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn install_modrinth_to_profile_cmd(
    app: AppHandle,
    ctx: State<'_, AppContext>,
    profile_id: String,
    project_id: String,
    kind: ModrinthContentKind,
    datapack_target: Option<DatapackInstallTarget>,
) -> Result<Vec<String>, String> {
    let profile = {
        let guard = ctx.state.lock().map_err(|e| e.to_string())?;
        guard
            .profiles
            .iter()
            .find(|p| p.id == profile_id)
            .cloned()
            .ok_or_else(|| "Target profile not found".to_string())?
    };

    let _ = app.emit(
        "twilight://island",
        IslandEventPayload {
            status: format!("Installing into {}...", profile.name),
            progress: 0.35,
            active: true,
        },
    );

    let res = twilight_core::modrinth::install_content_into_profile(
        &ctx.http,
        &ctx.paths,
        &profile,
        &project_id,
        kind,
        datapack_target,
    )
    .await
    .map_err(|e| e.to_string())?;

    let _ = app.emit(
        "twilight://island",
        IslandEventPayload {
            status: format!("Installed {} file(s)", res.len()),
            progress: 1.0,
            active: false,
        },
    );
    Ok(res)
}

#[tauri::command]
async fn install_modpack_new_profile_cmd(
    app: AppHandle,
    ctx: State<'_, AppContext>,
    project_id: String,
    custom_name: Option<String>,
) -> Result<Profile, String> {
    let default_ram = {
        let guard = ctx.state.lock().map_err(|e| e.to_string())?;
        guard.settings.default_memory_mb
    };

    let _ = app.emit(
        "twilight://island",
        IslandEventPayload {
            status: "Creating profile & unpacking .mrpack...".to_string(),
            progress: 0.4,
            active: true,
        },
    );

    let new_profile = twilight_core::modrinth::install_modpack_as_new_profile(
        &ctx.http,
        &ctx.paths,
        &project_id,
        custom_name,
        default_ram,
    )
    .await
    .map_err(|e| e.to_string())?;

    {
        let mut guard = ctx.state.lock().map_err(|e| e.to_string())?;
        guard.profiles.push(new_profile.clone());
        twilight_core::save_state(&ctx.paths, &guard).map_err(|e| e.to_string())?;
    }

    let _ = app.emit(
        "twilight://island",
        IslandEventPayload {
            status: format!("Modpack ready: {}", new_profile.name),
            progress: 1.0,
            active: false,
        },
    );

    Ok(new_profile)
}

// --- Built-in Directory Explorer, Config Editor & Screenshots ---

#[tauri::command]
fn explorer_list_dir(
    ctx: State<'_, AppContext>,
    profile_id: String,
    relative_dir: String,
) -> Result<Vec<FileNode>, String> {
    twilight_core::files::list_profile_directory(&ctx.paths, &profile_id, &relative_dir)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn explorer_create_dir(
    ctx: State<'_, AppContext>,
    profile_id: String,
    relative_dir: String,
) -> Result<(), String> {
    twilight_core::files::create_profile_subfolder(&ctx.paths, &profile_id, &relative_dir)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn explorer_upload_file(
    ctx: State<'_, AppContext>,
    profile_id: String,
    relative_dir: String,
    file_name: String,
    base64_bytes: String,
) -> Result< Option<JarScanReport>, String> {
    let raw_b64 = base64_bytes.split(',').last().unwrap_or(&base64_bytes);
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(raw_b64)
        .map_err(|e| e.to_string())?;

    twilight_core::files::write_uploaded_bytes_into_profile(
        &ctx.paths,
        &profile_id,
        &relative_dir,
        &file_name,
        &bytes,
    )
    .map_err(|e| e.to_string())?;

    if file_name.to_ascii_lowercase().ends_with(".jar") {
        let rel = if relative_dir.is_empty() {
            file_name
        } else {
            format!("{}/{}", relative_dir.trim_end_matches('/'), file_name)
        };
        if let Ok(full_jar) = ctx.paths.resolve_inside_profile(&profile_id, &rel) {
            if let Ok(report) = twilight_core::security::scan_jar_file(&full_jar) {
                return Ok(Some(report));
            }
        }
    }
    Ok(None)
}

#[tauri::command]
fn explorer_extract_archive(
    ctx: State<'_, AppContext>,
    profile_id: String,
    archive_relative_path: String,
) -> Result<usize, String> {
    twilight_core::files::extract_archive_inside_profile(
        &ctx.paths,
        &profile_id,
        &archive_relative_path,
        None,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn explorer_rename_or_move(
    ctx: State<'_, AppContext>,
    profile_id: String,
    from_rel: String,
    to_rel: String,
) -> Result<(), String> {
    twilight_core::files::rename_or_move_profile_entry(&ctx.paths, &profile_id, &from_rel, &to_rel)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn explorer_delete_entry(
    ctx: State<'_, AppContext>,
    profile_id: String,
    relative_path: String,
) -> Result<(), String> {
    twilight_core::files::delete_profile_entry(&ctx.paths, &profile_id, &relative_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn config_read_text(
    ctx: State<'_, AppContext>,
    profile_id: String,
    relative_path: String,
) -> Result<String, String> {
    twilight_core::files::read_profile_text_file(&ctx.paths, &profile_id, &relative_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn config_write_text(
    ctx: State<'_, AppContext>,
    profile_id: String,
    relative_path: String,
    content: String,
) -> Result<(), String> {
    twilight_core::files::write_profile_text_file(&ctx.paths, &profile_id, &relative_path, &content)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn list_profile_worlds_cmd(
    ctx: State<'_, AppContext>,
    profile_id: String,
) -> Result<Vec<String>, String> {
    twilight_core::files::list_profile_worlds(&ctx.paths, &profile_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_profile_screenshots_cmd(
    ctx: State<'_, AppContext>,
    profile_id: String,
) -> Result<Vec<ScreenshotItem>, String> {
    twilight_core::files::list_profile_screenshots(&ctx.paths, &profile_id)
        .map_err(|e| e.to_string())
}

// --- Twilight Shield, Java Manager & Crash Doctor ---

#[tauri::command]
fn scan_profile_mods_cmd(
    ctx: State<'_, AppContext>,
    profile_id: String,
) -> Result<Vec<JarScanReport>, String> {
    twilight_core::security::scan_profile_mods(&ctx.paths, &profile_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_sandbox_status_cmd() -> twilight_core::security::SandboxCapabilityStatus {
    twilight_core::security::detect_os_sandbox_support()
}

#[tauri::command]
fn list_portable_javas_cmd(ctx: State<'_, AppContext>) -> Vec<JavaRuntimeInfo> {
    twilight_core::java_manager::list_installed_portable_javas(&ctx.paths)
}

#[tauri::command]
async fn list_available_java_majors_cmd(ctx: State<'_, AppContext>) -> Result<Vec<u32>, String> {
    Ok(twilight_core::java_manager::fetch_available_java_majors(&ctx.http).await)
}

#[tauri::command]
async fn install_portable_java_cmd(
    app: AppHandle,
    ctx: State<'_, AppContext>,
    major_version: u32,
) -> Result<JavaRuntimeInfo, String> {
    let _ = app.emit(
        "twilight://island",
        IslandEventPayload {
            status: format!("Downloading Portable OpenJDK {major_version}..."),
            progress: 0.45,
            active: true,
        },
    );
    let info =
        twilight_core::java_manager::ensure_portable_java(&ctx.http, &ctx.paths, major_version)
            .await
            .map_err(|e| e.to_string())?;
    let _ = app.emit(
        "twilight://island",
        IslandEventPayload {
            status: format!("OpenJDK {major_version} Ready"),
            progress: 1.0,
            active: false,
        },
    );
    Ok(info)
}

#[tauri::command]
fn diagnose_crash_cmd(raw_log: String) -> CrashDiagnosis {
    twilight_core::crash_doctor::analyze_crash_log(&raw_log)
}

#[tauri::command]
async fn share_crash_log_cmd(
    ctx: State<'_, AppContext>,
    raw_log: String,
) -> Result<String, String> {
    twilight_core::crash_doctor::upload_sanitized_log_to_mclogs(&ctx.http, &raw_log)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn launch_profile_cmd(
    app: AppHandle,
    ctx: State<'_, AppContext>,
    profile_id: String,
) -> Result<i32, String> {
    let (settings, mut profile, account) = {
        let guard = ctx.state.lock().map_err(|e| e.to_string())?;
        let prof = guard
            .profiles
            .iter()
            .find(|p| p.id == profile_id)
            .cloned()
            .ok_or_else(|| "Profile not found".to_string())?;
        let acct = guard
            .accounts
            .iter()
            .find(|a| a.active)
            .or_else(|| guard.accounts.first())
            .cloned()
            .ok_or_else(|| "No active account configured".to_string())?;
        (guard.settings.clone(), prof, acct)
    };

    // Execute user's configured WindowLaunchAction when game starts
    let app_for_prog = app.clone();
    let window_action = settings.window_launch_action;

    let app_for_logs = app.clone();
    let exit_code = twilight_core::launch::prepare_and_spawn_minecraft(
        &ctx.http,
        &ctx.paths,
        &settings,
        &mut profile,
        &account,
        move |status, progress| {
            let _ = app_for_prog.emit(
                "twilight://island",
                IslandEventPayload {
                    status: status.clone(),
                    progress,
                    active: true,
                },
            );
            if progress >= 1.0 {
                if let Some(win) = app_for_prog.get_webview_window("main") {
                    match window_action {
                        WindowLaunchAction::Minimize => {
                            let _ = win.minimize();
                        }
                        WindowLaunchAction::MinimizeToTray => {
                            let _ = win.hide();
                        }
                        WindowLaunchAction::Close => {
                            let _ = win.close();
                        }
                        WindowLaunchAction::KeepOpen => {}
                    }
                }
            }
        },
        move |line| {
            let _ = app_for_logs.emit("twilight://game-log", line);
        },
    )
    .await
    .map_err(|e| e.to_string())?;

    // Restore window when Minecraft exits if configured
    if settings.restore_on_game_close {
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.show();
            let _ = win.unminimize();
            let _ = win.set_focus();
        }
    }

    // Persist updated loader_version & last_played timestamp
    {
        let mut guard = ctx.state.lock().map_err(|e| e.to_string())?;
        if let Some(p) = guard.profiles.iter_mut().find(|p| p.id == profile.id) {
            p.loader_version = profile.loader_version;
            p.last_played = Some(chrono::Utc::now().to_rfc3339());
        }
        let _ = twilight_core::save_state(&ctx.paths, &guard);
    }

    let _ = app.emit(
        "twilight://island",
        IslandEventPayload {
            status: format!("Minecraft exited (code {exit_code})"),
            progress: 1.0,
            active: false,
        },
    );

    Ok(exit_code)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let paths = LauncherPaths::resolve_default().expect("Failed initializing TwilightLauncher directories");
    let initial_state = twilight_core::load_or_init_state(&paths).expect("Failed loading TwilightLauncher state");
    let http = reqwest::Client::builder()
        .user_agent("TwilightLauncher/0.2.0 (github.com/vivo6810/minecraftlauncher)")
        .build()
        .expect("Failed building HTTP client");

    tauri::Builder::default()
        .manage(AppContext {
            paths,
            http,
            state: Mutex::new(initial_state),
            wardrobe_fs_lock: tokio::sync::Mutex::new(()),
            skin_sync_lock: tokio::sync::Mutex::new(()),
            skin_sync_seq: Mutex::new(std::collections::HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![
            get_launcher_state,
            update_launcher_settings,
            upsert_profile,
            delete_profile,
            fetch_mc_versions,
            fetch_loader_versions,
            create_offline_account_cmd,
            connect_microsoft_token_cmd,
            set_active_account,
            remove_account,
            import_and_equip_wardrobe_png,
            equip_existing_wardrobe_item,
            remove_wardrobe_item,
            select_official_cape_cmd,
            search_modrinth_cmd,
            install_modrinth_to_profile_cmd,
            install_modpack_new_profile_cmd,
            explorer_list_dir,
            explorer_create_dir,
            explorer_upload_file,
            explorer_extract_archive,
            explorer_rename_or_move,
            explorer_delete_entry,
            config_read_text,
            config_write_text,
            list_profile_worlds_cmd,
            list_profile_screenshots_cmd,
            scan_profile_mods_cmd,
            get_sandbox_status_cmd,
            list_portable_javas_cmd,
            list_available_java_majors_cmd,
            install_portable_java_cmd,
            diagnose_crash_cmd,
            share_crash_log_cmd,
            launch_profile_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running TwilightLauncher");
}
