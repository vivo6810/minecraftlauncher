use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use anyhow::{Context, Result};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

use crate::models::{JarScanReport, JarThreatFinding, ThreatSeverity};
use crate::paths::LauncherPaths;

// ============================================================================
// PART 1: TOKEN VAULT & LOCALHOST SESSION BROKER
// ============================================================================

#[derive(Debug, Clone)]
pub struct VaultedSession {
    /// Random placeholder token given to `--accessToken` so the real token never enters JVM memory
    pub placeholder_token: String,
    /// `-Dminecraft.api.session.host=...` JVM property routing session joins to 127.0.0.1
    pub jvm_session_host_arg: String,
}

/// Spawns a local 127.0.0.1 session-join broker in the launcher process.
/// The JVM only receives `TWILIGHT_VAULTED_<uuid>`. When joining an online server,
/// authlib contacts this broker on `/session/minecraft/join`, which swaps in the real
/// Microsoft `accessToken` and forwards to `https://sessionserver.mojang.com`.
pub async fn spawn_token_vault_broker(
    client: reqwest::Client,
    real_access_token: String,
) -> Result<VaultedSession> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .context("Failed binding Token Vault localhost broker")?;
    let port = listener.local_addr()?.port();
    let placeholder = format!("TWILIGHT_VAULTED_{}", uuid::Uuid::new_v4().simple());
    let expected_placeholder = Arc::new(placeholder.clone());
    let secret_token = Arc::new(real_access_token);
    let http_client = Arc::new(client);

    tokio::spawn(async move {
        while let Ok((mut stream, _)) = listener.accept().await {
            let expected = Arc::clone(&expected_placeholder);
            let real_tok = Arc::clone(&secret_token);
            let req_client = Arc::clone(&http_client);

            tokio::spawn(async move {
                let mut raw_bytes = Vec::with_capacity(4096);
                let mut chunk = [0u8; 4096];
                let mut header_end = None;
                let mut content_len = 0usize;

                loop {
                    let Ok(n) = stream.read(&mut chunk).await else {
                        return;
                    };
                    if n == 0 {
                        break;
                    }
                    raw_bytes.extend_from_slice(&chunk[..n]);
                    if raw_bytes.len() > 65536 {
                        return;
                    }
                    if header_end.is_none() {
                        if let Some(pos) = raw_bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                            let hdr_str = String::from_utf8_lossy(&raw_bytes[..pos]);
                            for line in hdr_str.lines() {
                                if let Some((k, v)) = line.split_once(':') {
                                    if k.trim().eq_ignore_ascii_case("content-length") {
                                        content_len = v.trim().parse::<usize>().unwrap_or(0);
                                    }
                                }
                            }
                            header_end = Some(pos + 4);
                        }
                    }
                    if let Some(end) = header_end {
                        if raw_bytes.len() >= end + content_len {
                            break;
                        }
                    }
                }

                if raw_bytes.is_empty() {
                    return;
                }
                let raw = String::from_utf8_lossy(&raw_bytes);
                let first_line = raw.lines().next().unwrap_or("");
                let mut parts = first_line.split_whitespace();
                let method = parts.next().unwrap_or("GET");
                let path = parts.next().unwrap_or("/");

                let body_str = raw.split("\r\n\r\n").nth(1).unwrap_or("");

                if method == "POST" && path.ends_with("/session/minecraft/join") {
                    if let Ok(mut payload) = serde_json::from_str::<serde_json::Value>(body_str) {
                        let provided = payload["accessToken"].as_str().unwrap_or("");
                        if provided == expected.as_str() {
                            payload["accessToken"] =
                                serde_json::Value::String((*real_tok).clone());
                            let upstream = req_client
                                .post("https://sessionserver.mojang.com/session/minecraft/join")
                                .json(&payload)
                                .send()
                                .await;

                            if let Ok(resp) = upstream {
                                let status = resp.status().as_u16();
                                let header = format!(
                                    "HTTP/1.1 {status} OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                                );
                                let _ = stream.write_all(header.as_bytes()).await;
                                return;
                            }
                        }
                    }
                    let _ = stream
                        .write_all(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n")
                        .await;
                } else if method == "GET" && path.starts_with('/') && !path.starts_with("//") {
                    // Forward read-only profile/hasJoined lookups transparently to Mojang
                    let upstream_url = format!("https://sessionserver.mojang.com{path}");
                    if let Ok(resp) = req_client.get(&upstream_url).send().await {
                        let status = resp.status().as_u16();
                        let bytes = resp.bytes().await.unwrap_or_default();
                        let header = format!(
                            "HTTP/1.1 {status} OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                            bytes.len()
                        );
                        let _ = stream.write_all(header.as_bytes()).await;
                        let _ = stream.write_all(&bytes).await;
                        return;
                    }
                    let _ = stream
                        .write_all(b"HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n")
                        .await;
                } else {
                    let _ = stream
                        .write_all(b"HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n")
                        .await;
                }
            });
        }
    });

    Ok(VaultedSession {
        placeholder_token: placeholder,
        jvm_session_host_arg: format!("-Dminecraft.api.session.host=http://127.0.0.1:{port}"),
    })
}

// ============================================================================
// PART 2: FAST NATIVE RUST .JAR CONSTANT-POOL & BYTECODE THREAT SCANNER
// ============================================================================

struct SignatureRule {
    needle: &'static str,
    severity: ThreatSeverity,
    category: &'static str,
    description: &'static str,
}

const THREAT_SIGNATURES: &[SignatureRule] = &[
    SignatureRule {
        needle: "discord.com/api/webhooks/",
        severity: ThreatSeverity::Critical,
        category: "Data Exfiltration Webhook",
        description: "Hardcoded Discord webhook URL commonly used by session-stealer malware.",
    },
    SignatureRule {
        needle: "discordapp.com/api/webhooks/",
        severity: ThreatSeverity::Critical,
        category: "Data Exfiltration Webhook",
        description: "Hardcoded Discord webhook URL commonly used by session-stealer malware.",
    },
    SignatureRule {
        needle: "Google/Chrome/User Data",
        severity: ThreatSeverity::Critical,
        category: "Browser Credential Theft",
        description: "References Chrome User Data directory (cookies/saved passwords).",
    },
    SignatureRule {
        needle: "Google\\Chrome\\User Data",
        severity: ThreatSeverity::Critical,
        category: "Browser Credential Theft",
        description: "References Windows Chrome User Data directory (cookies/saved passwords).",
    },
    SignatureRule {
        needle: "Local Storage/leveldb",
        severity: ThreatSeverity::Critical,
        category: "Token Theft",
        description: "Targets Chromium/Discord LevelDB token storage.",
    },
    SignatureRule {
        needle: "Login Data",
        severity: ThreatSeverity::High,
        category: "Browser Password DB",
        description: "References Chromium SQLite Login Data credential store.",
    },
    SignatureRule {
        needle: ".ssh/id_rsa",
        severity: ThreatSeverity::Critical,
        category: "SSH Key Theft",
        description: "Attempts to access private SSH keys.",
    },
    SignatureRule {
        needle: "api.telegram.org/bot",
        severity: ThreatSeverity::High,
        category: "Telegram Bot Exfiltration",
        description: "Contains a Telegram Bot API endpoint often used to exfiltrate stolen data.",
    },
    SignatureRule {
        needle: "java/lang/ProcessBuilder",
        severity: ThreatSeverity::Medium,
        category: "External Process Execution",
        description: "Spawns external OS commands outside the JVM via ProcessBuilder.",
    },
    SignatureRule {
        needle: "java/lang/Runtime",
        severity: ThreatSeverity::Low,
        category: "Runtime API Reference",
        description: "References java.lang.Runtime (verify whether exec() is invoked).",
    },
    SignatureRule {
        needle: "powershell.exe",
        severity: ThreatSeverity::Critical,
        category: "Shell Execution",
        description: "Invokes Windows PowerShell directly from inside a Minecraft mod.",
    },
    SignatureRule {
        needle: "cmd.exe /c",
        severity: ThreatSeverity::High,
        category: "Shell Execution",
        description: "Executes Windows command shell commands from a mod.",
    },
];

/// Scans a single `.jar` archive in milliseconds directly in Rust by inspecting
/// `.class` bytecode buffers (including JVM Constant Pool UTF-8 entries) without executing Java.
pub fn scan_jar_file(jar_path: &Path) -> Result<JarScanReport> {
    let start = std::time::Instant::now();
    let file_name = jar_path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown.jar".to_string());

    let file = std::fs::File::open(jar_path)
        .with_context(|| format!("Cannot open JAR for scanning: {}", jar_path.display()))?;
    let mut archive = zip::ZipArchive::new(file)?;

    let mut classes_scanned = 0usize;
    let mut findings = Vec::new();
    let mut seen_keys = std::collections::HashSet::new();

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let entry_name = entry.name().to_string();
        if !entry_name.ends_with(".class") {
            continue;
        }
        classes_scanned += 1;

        let mut buf = Vec::with_capacity(entry.size() as usize);
        entry.read_to_end(&mut buf)?;

        // Verify JVM 0xCAFEBABE magic header
        if buf.len() < 10 || buf[0..4] != [0xCA, 0xFE, 0xBA, 0xBE] {
            continue;
        }

        let lossy = String::from_utf8_lossy(&buf);
        for rule in THREAT_SIGNATURES {
            if lossy.contains(rule.needle) {
                // Skip benign Runtime.getRuntime().availableProcessors / freeMemory unless exec is also present
                if rule.needle == "java/lang/Runtime" && !lossy.contains("exec") {
                    continue;
                }
                let dedup_key = format!("{}:{}", rule.category, rule.needle);
                if seen_keys.insert(dedup_key) {
                    findings.push(JarThreatFinding {
                        class_path: entry_name.clone(),
                        severity: if rule.needle == "java/lang/Runtime" {
                            ThreatSeverity::High
                        } else {
                            rule.severity
                        },
                        category: rule.category.to_string(),
                        matched_indicator: rule.needle.to_string(),
                        description: rule.description.to_string(),
                    });
                }
            }
        }
    }

    let safe = !findings.iter().any(|f| {
        matches!(
            f.severity,
            ThreatSeverity::High | ThreatSeverity::Critical
        )
    });

    Ok(JarScanReport {
        file_name,
        classes_scanned,
        scan_duration_ms: start.elapsed().as_millis() as u64,
        safe,
        findings,
    })
}

/// Scans every `.jar` inside `<profile>/mods/` and returns reports for all mods.
pub fn scan_profile_mods(paths: &LauncherPaths, profile_id: &str) -> Result<Vec<JarScanReport>> {
    let mods_dir = paths.resolve_inside_profile(profile_id, "mods")?;
    if !mods_dir.exists() {
        return Ok(Vec::new());
    }

    let mut reports = Vec::new();
    let mut entries: Vec<PathBuf> = std::fs::read_dir(mods_dir)?
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.extension()
                .map_or(false, |ext| ext.eq_ignore_ascii_case("jar"))
        })
        .collect();
    entries.sort();

    for jar in entries {
        if let Ok(rep) = scan_jar_file(&jar) {
            reports.push(rep);
        }
    }
    Ok(reports)
}
