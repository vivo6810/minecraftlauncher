use anyhow::{Context, Result};
use serde::Deserialize;

use crate::models::CrashDiagnosis;

/// Strips sensitive local OS paths, usernames, and session tokens before displaying
/// or uploading a crash log to `mclo.gs`.
pub fn sanitize_log_privacy(raw_log: &str) -> String {
    let mut cleaned = raw_log.to_string();

    for env_key in ["USER", "USERNAME", "HOME", "USERPROFILE"] {
        if let Ok(val) = std::env::var(env_key) {
            if val.len() >= 3 {
                cleaned = cleaned.replace(&val, "<REDACTED_USER>");
            }
        }
    }

    // Mask accidental bearer/session tokens on CLI lines
    let mut redacted_lines = Vec::new();
    for line in cleaned.lines() {
        if line.contains("--accessToken") {
            let parts: Vec<&str> = line.split("--accessToken").collect();
            redacted_lines.push(format!("{}--accessToken <REDACTED>", parts[0]));
        } else {
            redacted_lines.push(line.to_string());
        }
    }
    redacted_lines.join("\n")
}

/// Human-Readable Crash Doctor: inspects Minecraft stderr/crash-report output
/// and translates cryptic JVM stack traces into plain English + actionable 1-click fixes.
pub fn analyze_crash_log(raw_log: &str) -> CrashDiagnosis {
    let sanitized = sanitize_log_privacy(raw_log);
    let lower = sanitized.to_ascii_lowercase();

    let excerpt: String = sanitized
        .lines()
        .rev()
        .take(35)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("\n");

    if lower.contains("outofmemoryerror") || lower.contains("java heap space") {
        return CrashDiagnosis {
            title: "Out of Allocated RAM".to_string(),
            summary: "Minecraft ran out of JVM heap memory while loading worlds, mods, or high-res textures.".to_string(),
            root_cause: "java.lang.OutOfMemoryError: Java heap space".to_string(),
            suggested_fix: "Increase this profile's allocated RAM (e.g., from 4096 MB to 6144 MB or 8192 MB).".to_string(),
            fix_action_code: Some("bump_ram_2048".to_string()),
            sanitized_log_excerpt: excerpt,
        };
    }

    if lower.contains("unsupportedclassversionerror") {
        return CrashDiagnosis {
            title: "Incompatible Java Runtime Version".to_string(),
            summary: "A mod or Minecraft itself was compiled for a newer Java version than the one used to launch.".to_string(),
            root_cause: "java.lang.UnsupportedClassVersionError".to_string(),
            suggested_fix: "Switch to TwilightLauncher's Automatic Portable Java Manager so Java 21 / 17 / 8 is matched automatically.".to_string(),
            fix_action_code: Some("auto_repair_java".to_string()),
            sanitized_log_excerpt: excerpt,
        };
    }

    if lower.contains("fabric-api") && (lower.contains("missing") || lower.contains("requires") || lower.contains("unmet dependency")) {
        return CrashDiagnosis {
            title: "Missing Required Dependency: Fabric API".to_string(),
            summary: "One or more installed Fabric mods require Fabric API, which is missing from /mods.".to_string(),
            root_cause: "Unmet mod dependency: fabric-api / fabric".to_string(),
            suggested_fix: "Install the matching Fabric API build from Modrinth into this profile.".to_string(),
            fix_action_code: Some("install_fabric_api".to_string()),
            sanitized_log_excerpt: excerpt,
        };
    }

    if lower.contains("mixinapplyerror") || lower.contains("mixins") && lower.contains("critical injection failure") {
        return CrashDiagnosis {
            title: "Mod Mixin Conflict Detected".to_string(),
            summary: "Two mods tried to patch the same Minecraft class incompatibility, or a mod is built for a different Minecraft version.".to_string(),
            root_cause: "org.spongepowered.asm.mixin.transformer.throwables.MixinTransformerError".to_string(),
            suggested_fix: "Open Profile Mods or File Explorer (/mods) and disable mods built for another Minecraft version.".to_string(),
            fix_action_code: Some("open_mods_folder".to_string()),
            sanitized_log_excerpt: excerpt,
        };
    }

    if lower.contains("glfw error") || lower.contains("failed to create window") {
        return CrashDiagnosis {
            title: "Graphics / Display Driver Initialization Error".to_string(),
            summary: "LWJGL/GLFW could not create an OpenGL window on your GPU or display session.".to_string(),
            root_cause: "GLFW window creation / OpenGL context error".to_string(),
            suggested_fix: "On Linux, try toggling Native Wayland GLFW or Discrete GPU (DRI_PRIME) in Settings.".to_string(),
            fix_action_code: Some("open_linux_gpu_settings".to_string()),
            sanitized_log_excerpt: excerpt,
        };
    }

    CrashDiagnosis {
        title: "Unexpected Game Exit".to_string(),
        summary: "Minecraft exited with a non-zero status code. Check the sanitized tail log below or share via mclo.gs.".to_string(),
        root_cause: "Unhandled exception during client execution".to_string(),
        suggested_fix: "Verify recently added mods/configs in the built-in File Explorer, or upload a privacy-scrubbed log.".to_string(),
        fix_action_code: None,
        sanitized_log_excerpt: excerpt,
    }
}

#[derive(Debug, Deserialize)]
struct MclogsResponse {
    success: bool,
    url: Option<String>,
    error: Option<String>,
}

/// Uploads a privacy-scrubbed crash log to `https://api.mclo.gs/1/log` and returns the share URL.
pub async fn upload_sanitized_log_to_mclogs(
    client: &reqwest::Client,
    raw_log: &str,
) -> Result<String> {
    let clean = sanitize_log_privacy(raw_log);
    let resp: MclogsResponse = client
        .post("https://api.mclo.gs/1/log")
        .form(&[("content", clean)])
        .send()
        .await
        .context("Failed reaching mclo.gs API")?
        .error_for_status()?
        .json()
        .await?;

    if resp.success {
        resp.url.context("mclo.gs succeeded without URL")
    } else {
        anyhow::bail!(
            "mclo.gs rejected log: {}",
            resp.error.unwrap_or_else(|| "Unknown error".to_string())
        )
    }
}
