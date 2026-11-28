use std::path::PathBuf;
use anyhow::{Context, Result};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use crate::java_manager::{ensure_portable_java, required_java_major_for_mc};
use crate::loaders::{prepare_isolated_loader, resolve_and_auto_update_loader_version};
use crate::models::{Account, AccountType, LauncherSettings, Profile};
use crate::modrinth::sync_global_datapacks_to_worlds;
use crate::mojang::prepare_shared_vanilla_engine;
use crate::paths::LauncherPaths;
use crate::security::{
    detect_os_sandbox_support, scan_profile_mods, spawn_token_vault_broker,
    wrap_linux_bwrap_command,
};
use crate::yggdrasil_local::{ensure_authlib_injector_jar, spawn_local_yggdrasil_skin_server};

#[derive(Debug, Clone, serde::Serialize)]
pub struct BuiltLaunchPlan {
    pub executable: String,
    pub args: Vec<String>,
    pub working_dir: String,
    pub sandbox_active: bool,
    pub token_vault_active: bool,
    pub resolved_loader_version: Option<String>,
}

/// Prepares and spawns Minecraft with:
/// - Auto-updated Mod Loader (if `profile.auto_update_loader` is enabled)
/// - Automatic Portable Java Runtime (`shared/java/temurin-*`)
/// - Strictly separated `[Isolated Loader JARs] + [Shared Pure Vanilla JARs]`
/// - Twilight Shield: Pre-launch Rust `.jar` threat scan, Token Vault (`127.0.0.1` broker),
///   and OS Filesystem Sandbox (`bubblewrap` on Linux / ACL confinement on Windows)
/// - Offline custom skin & cape rendering via `authlib-injector` + localhost Yggdrasil server
/// - `--fullscreen` flag controlled by `profile.fullscreen_override` or `settings.auto_fullscreen` (default OFF)
pub async fn prepare_and_spawn_minecraft<F, L>(
    client: &reqwest::Client,
    paths: &LauncherPaths,
    settings: &LauncherSettings,
    profile: &mut Profile,
    account: &Account,
    mut on_progress: F,
    on_log_line: L,
) -> Result<i32>
where
    F: FnMut(String, f32) + Send,
    L: Fn(String) + Send + Sync + 'static,
{
    let profile_dir = paths.ensure_profile_layout(&profile.id)?;

    // 1. Pre-launch Rust .jar malware constant-pool scan
    if settings.shield.jar_scanner {
        on_progress("Scanning mod JARs with Twilight Shield...".to_string(), 0.05);
        let reports = scan_profile_mods(paths, &profile.id)?;
        let flagged: Vec<_> = reports.iter().filter(|r| !r.safe).collect();
        if !flagged.is_empty() && settings.shield.block_high_risk_jars {
            let names: Vec<_> = flagged.iter().map(|r| r.file_name.as_str()).collect();
            anyhow::bail!(
                "Twilight Shield blocked launch: high-risk code detected in [{}]. Inspect findings in Profile > Shield.",
                names.join(", ")
            );
        }
    }

    // 2. Sync global "All Worlds" datapacks into any newly created world folders
    let _ = sync_global_datapacks_to_worlds(&profile_dir);

    // 3. Auto-update / resolve Mod Loader version if configured
    on_progress("Checking Mod Loader metadata...".to_string(), 0.12);
    let resolved_loader_ver = resolve_and_auto_update_loader_version(client, profile).await?;

    // 4. Verify Shared Pure Vanilla Engine (`shared/vanilla/` + `shared/assets/`) first
    // so we read Mojang's exact `javaVersion.majorVersion` (e.g. Java 25 for MC 26.x+)
    let (vanilla_detail, vanilla_cp) = prepare_shared_vanilla_engine(
        client,
        paths,
        &profile.mc_version,
        settings.concurrent_downloads,
        |done, total, label| {
            let pct = 0.15 + 0.55 * (done as f32 / total.max(1) as f32);
            on_progress(format!("Verifying {label} ({done}/{total})"), pct);
        },
    )
    .await?;

    // 5. Ensure Automatic Portable Java Runtime matching Mojang's `javaVersion.majorVersion` (8 / 17 / 21 / 25+),
    // falling back to `required_java_major_for_mc` if an older metadata runtime (e.g. Java 16 on macOS/aarch64 for 1.17.1) is unavailable
    let fallback_java = required_java_major_for_mc(&profile.mc_version);
    let primary_java = vanilla_detail
        .java_version
        .as_ref()
        .map(|jv| jv.major_version)
        .unwrap_or(fallback_java);
    on_progress(
        format!("Verifying Portable OpenJDK {primary_java}..."),
        0.74,
    );
    let java_rt = match ensure_portable_java(client, paths, primary_java).await {
        Ok(rt) => rt,
        Err(_) if fallback_java != primary_java => {
            on_progress(
                format!("Falling back to Portable OpenJDK {fallback_java}..."),
                0.76,
            );
            ensure_portable_java(client, paths, fallback_java).await?
        }
        Err(err) => return Err(err),
    };

    // 6. Prepare Isolated Mod Loader JARs (`loaders/<loader>/...`)
    let mut main_class = vanilla_detail.main_class.clone();
    let mut full_classpath: Vec<PathBuf> = Vec::new();

    if let Some(ref lver) = resolved_loader_ver {
        on_progress(
            format!("Preparing {} {lver}...", profile.loader.as_str()),
            0.82,
        );
        if let Some((loader_main, loader_jars)) = prepare_isolated_loader(
            client,
            paths,
            profile.loader,
            &profile.mc_version,
            lver,
            settings.concurrent_downloads,
        )
        .await?
        {
            main_class = loader_main;
            full_classpath.extend(loader_jars);
        }
    }
    full_classpath.extend(vanilla_cp);

    let cp_sep = if cfg!(target_os = "windows") { ";" } else { ":" };
    let classpath_str = full_classpath
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join(cp_sep);

    // 7. Build JVM Arguments + Authlib-Injector / Token Vault
    let mut jvm_args: Vec<String> = Vec::new();
    jvm_args.push(format!("-Xmx{}M", profile.allocated_ram_mb));
    jvm_args.push("-Xms512M".to_string());
    jvm_args.extend(settings.global_jvm_args.clone());
    jvm_args.extend(profile.custom_jvm_args.clone());

    let mut effective_access_token = account
        .access_token
        .clone()
        .unwrap_or_else(|| "0".to_string());

    if account.account_type == AccountType::Offline {
        if account.skin_sha256.is_some()
            || account.custom_cape_sha256.is_some()
            || account.external_yggdrasil_url.is_some()
        {
            on_progress("Starting local Yggdrasil skin/cape server...".to_string(), 0.90);
            let injector_jar = ensure_authlib_injector_jar(client, paths).await?;
            let ygg_url = match &account.external_yggdrasil_url {
                Some(ext) if !ext.trim().is_empty() => ext.trim().to_string(),
                _ => spawn_local_yggdrasil_skin_server(paths.clone(), account.clone()).await?,
            };
            jvm_args.push(format!(
                "-javaagent:{}={}",
                injector_jar.display(),
                ygg_url
            ));
        }
        effective_access_token = "0".to_string();
    } else if settings.shield.token_vault {
        if let Some(real_token) = &account.access_token {
            let vaulted = spawn_token_vault_broker(client.clone(), real_token.clone()).await?;
            jvm_args.push(vaulted.jvm_session_host_arg);
            effective_access_token = vaulted.placeholder_token;
        }
    }

    if cfg!(target_os = "linux") && settings.linux_gaming.wayland_native_glfw {
        jvm_args.push("-Dorg.lwjgl.glfw.libname=libglfw.so".to_string());
    }

    jvm_args.push("-cp".to_string());
    jvm_args.push(classpath_str);
    jvm_args.push(main_class);

    // 8. Game Arguments
    let mut game_args = vec![
        "--username".to_string(),
        account.username.clone(),
        "--version".to_string(),
        profile.mc_version.clone(),
        "--gameDir".to_string(),
        profile_dir.to_string_lossy().to_string(),
        "--assetsDir".to_string(),
        paths.shared_assets_dir().to_string_lossy().to_string(),
        "--assetIndex".to_string(),
        vanilla_detail.asset_index.id,
        "--uuid".to_string(),
        account.uuid.clone(),
        "--accessToken".to_string(),
        effective_access_token,
        "--userType".to_string(),
        if account.account_type == AccountType::Microsoft {
            "msa".to_string()
        } else {
            "legacy".to_string()
        },
    ];

    let enable_fullscreen = profile
        .fullscreen_override
        .unwrap_or(settings.auto_fullscreen);
    if enable_fullscreen {
        game_args.push("--fullscreen".to_string());
    }

    let mut combined_args = jvm_args;
    combined_args.extend(game_args);

    // 9. Apply Linux Gaming Wrappers & OS Sandbox
    let mut program = java_rt.executable_path.clone();
    let mut final_args = combined_args;

    let use_sandbox = profile
        .sandbox_override
        .unwrap_or(settings.shield.os_sandbox);
    let sandbox_cap = detect_os_sandbox_support();

    if cfg!(target_os = "linux") && use_sandbox && sandbox_cap.available {
        let (bwrap_prog, bwrap_args) =
            wrap_linux_bwrap_command(paths, &profile_dir, &program, &final_args);
        program = bwrap_prog;
        final_args = bwrap_args;
    }

    #[cfg(target_os = "windows")]
    if use_sandbox {
        crate::security::prepare_windows_sandbox_acls(paths, &profile_dir);
    }

    if cfg!(target_os = "linux") {
        if settings.linux_gaming.mangohud {
            final_args.insert(0, program);
            program = "mangohud".to_string();
        }
        if settings.linux_gaming.feral_gamemode {
            final_args.insert(0, program);
            program = "gamemoderun".to_string();
        }
    }

    on_progress("Launching Minecraft...".to_string(), 1.0);

    let mut cmd = Command::new(&program);
    cmd.args(&final_args)
        .current_dir(&profile_dir)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    if cfg!(target_os = "linux") {
        if settings.linux_gaming.discrete_gpu_dri_prime {
            cmd.env("DRI_PRIME", "1");
        }
        if settings.linux_gaming.nvidia_prime_offload {
            cmd.env("__NV_PRIME_RENDER_OFFLOAD", "1");
            cmd.env("__GLX_VENDOR_LIBRARY_NAME", "nvidia");
        }
    }

    let mut child = cmd
        .spawn()
        .with_context(|| format!("Failed spawning game command `{program}`"))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let (_, _, status) = tokio::join!(
        stream_game_output(stdout, &on_log_line),
        stream_game_output(stderr, &on_log_line),
        child.wait()
    );
    Ok(status?.code().unwrap_or(-1))
}

async fn stream_game_output(
    stream: Option<impl tokio::io::AsyncRead + Unpin>,
    on_line: &impl Fn(String),
) {
    if let Some(stream) = stream {
        let mut reader = BufReader::new(stream);
        let mut bytes = Vec::new();
        while let Ok(count) = reader.read_until(b'\n', &mut bytes).await {
            if count == 0 {
                break;
            }
            on_line(String::from_utf8_lossy(&bytes).trim_end_matches(['\r', '\n']).to_owned());
            bytes.clear();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;
    use tokio::io::AsyncWriteExt;

    #[tokio::test]
    async fn streams_both_game_output_pipes_until_eof() -> Result<()> {
        let (stdout, mut out) = tokio::io::duplex(16);
        let (stderr, mut err) = tokio::io::duplex(16);
        let lines = Mutex::new(Vec::new());
        let collect = |line| lines.lock().unwrap().push(line);
        let ((), (), written) = tokio::join!(
            stream_game_output(Some(stdout), &collect),
            stream_game_output(Some(stderr), &collect),
            async move {
                out.write_all(b"stdout line exceeds pipe capacity\r\n").await?;
                err.write_all(b"stderr line with invalid byte \xff\nlast line").await
            },
        );
        written?;
        let lines = lines.into_inner().unwrap();
        assert!(lines.iter().any(|line| line == "stdout line exceeds pipe capacity"));
        assert!(lines.iter().any(|line| line == "stderr line with invalid byte \u{fffd}"));
        assert!(lines.iter().any(|line| line == "last line"));
        Ok(())
    }
}
