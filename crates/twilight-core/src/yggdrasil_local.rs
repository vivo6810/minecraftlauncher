use std::path::PathBuf;
use std::sync::Arc;
use anyhow::{Context, Result};
use base64::Engine;
use serde::Deserialize;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

use crate::models::{Account, SkinVariant};
use crate::paths::LauncherPaths;

const AUTHLIB_INJECTOR_LATEST_API: &str =
    "https://authlib-injector.yushi.moe/artifact/latest.json";

#[derive(Debug, Deserialize)]
struct AuthlibArtifactMeta {
    download_url: String,
    checksums: AuthlibChecksums,
}

#[derive(Debug, Deserialize)]
struct AuthlibChecksums {
    sha256: String,
}

/// Automatically downloads and verifies `authlib-injector.jar` so offline accounts
/// can render user-provided `.png` skins and capes in-game.
pub async fn ensure_authlib_injector_jar(
    client: &reqwest::Client,
    paths: &LauncherPaths,
) -> Result<PathBuf> {
    let jar_path = paths.authlib_injector_jar();
    if jar_path.exists() {
        return Ok(jar_path);
    }

    let meta: AuthlibArtifactMeta = client
        .get(AUTHLIB_INJECTOR_LATEST_API)
        .send()
        .await
        .context("Failed fetching authlib-injector metadata")?
        .error_for_status()?
        .json()
        .await?;

    let bytes = client
        .get(&meta.download_url)
        .send()
        .await?
        .error_for_status()?
        .bytes()
        .await?;

    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let actual = hex::encode(hasher.finalize());
    anyhow::ensure!(
        actual.eq_ignore_ascii_case(&meta.checksums.sha256),
        "authlib-injector SHA-256 verification failed"
    );

    if let Some(parent) = jar_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    tokio::fs::write(&jar_path, &bytes).await?;
    Ok(jar_path)
}

/// Spawns a tiny zero-overhead localhost Yggdrasil HTTP responder (`127.0.0.1:<port>`)
/// that serves the offline player's chosen `.png` skin and `.png` cape from TwilightLauncher's
/// Wardrobe directly to `-javaagent:authlib-injector.jar=http://127.0.0.1:<port>`.
pub async fn spawn_local_yggdrasil_skin_server(
    paths: LauncherPaths,
    account: Account,
) -> Result<String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .context("Failed binding localhost Yggdrasil skin server")?;
    let addr = listener.local_addr()?;
    let base_url = format!("http://127.0.0.1:{}", addr.port());

    let shared_paths = Arc::new(paths);
    let shared_account = Arc::new(account);
    let base_clone = base_url.clone();

    tokio::spawn(async move {
        while let Ok((mut stream, _)) = listener.accept().await {
            let paths_ref = Arc::clone(&shared_paths);
            let acct_ref = Arc::clone(&shared_account);
            let url_ref = base_clone.clone();

            tokio::spawn(async move {
                let mut buf = [0u8; 4096];
                let Ok(n) = stream.read(&mut buf).await else {
                    return;
                };
                if n == 0 {
                    return;
                }
                let req = String::from_utf8_lossy(&buf[..n]);
                let path = req
                    .lines()
                    .next()
                    .and_then(|line| line.split_whitespace().nth(1))
                    .unwrap_or("/");

                let clean_uuid = acct_ref.uuid.replace('-', "");

                if path == "/" || path == "/api" {
                    let meta = serde_json::json!({
                        "meta": {
                            "serverName": "TwilightLauncher Local Wardrobe",
                            "implementationName": "twilight-yggdrasil-local",
                            "implementationVersion": "1.0.1"
                        },
                        "skinDomains": ["127.0.0.1", "localhost"]
                    });
                    let _ = write_json_response(&mut stream, &meta.to_string()).await;
                } else if path.contains("/sessionserver/session/minecraft/profile/") {
                    let mut textures_obj = serde_json::Map::new();
                    if let Some(skin_hash) = &acct_ref.skin_sha256 {
                        let mut skin_entry = serde_json::json!({
                            "url": format!("{url_ref}/textures/skin/{skin_hash}.png")
                        });
                        if acct_ref.skin_variant == SkinVariant::Slim {
                            skin_entry["metadata"] = serde_json::json!({ "model": "slim" });
                        }
                        textures_obj.insert("SKIN".to_string(), skin_entry);
                    }
                    if let Some(cape_hash) = &acct_ref.custom_cape_sha256 {
                        textures_obj.insert(
                            "CAPE".to_string(),
                            serde_json::json!({
                                "url": format!("{url_ref}/textures/cape/{cape_hash}.png")
                            }),
                        );
                    }

                    let textures_payload = serde_json::json!({
                        "timestamp": chrono::Utc::now().timestamp_millis(),
                        "profileId": clean_uuid,
                        "profileName": acct_ref.username,
                        "textures": textures_obj
                    });
                    let encoded_textures = base64::engine::general_purpose::STANDARD
                        .encode(textures_payload.to_string().as_bytes());

                    let profile_resp = serde_json::json!({
                        "id": clean_uuid,
                        "name": acct_ref.username,
                        "properties": [
                            {
                                "name": "textures",
                                "value": encoded_textures
                            }
                        ]
                    });
                    let _ = write_json_response(&mut stream, &profile_resp.to_string()).await;
                } else if let Some(rest) = path.strip_prefix("/textures/skin/") {
                    let hash = rest.trim_end_matches(".png");
                    if !hash.is_empty() && hash.chars().all(|c| c.is_ascii_hexdigit()) {
                        let file_path = paths_ref.wardrobe_skins_dir().join(format!("{hash}.png"));
                        if let Ok(bytes) = tokio::fs::read(file_path).await {
                            let _ = write_png_response(&mut stream, &bytes).await;
                        } else {
                            let _ = write_not_found(&mut stream).await;
                        }
                    } else {
                        let _ = write_not_found(&mut stream).await;
                    }
                } else if let Some(rest) = path.strip_prefix("/textures/cape/") {
                    let hash = rest.trim_end_matches(".png");
                    if !hash.is_empty() && hash.chars().all(|c| c.is_ascii_hexdigit()) {
                        let file_path = paths_ref.wardrobe_capes_dir().join(format!("{hash}.png"));
                        if let Ok(bytes) = tokio::fs::read(file_path).await {
                            let _ = write_png_response(&mut stream, &bytes).await;
                        } else {
                            let _ = write_not_found(&mut stream).await;
                        }
                    } else {
                        let _ = write_not_found(&mut stream).await;
                    }
                } else {
                    let _ = write_not_found(&mut stream).await;
                }
            });
        }
    });

    Ok(base_url)
}

async fn write_json_response(stream: &mut tokio::net::TcpStream, body: &str) -> Result<()> {
    let header = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(header.as_bytes()).await?;
    stream.write_all(body.as_bytes()).await?;
    Ok(())
}

async fn write_png_response(stream: &mut tokio::net::TcpStream, bytes: &[u8]) -> Result<()> {
    let header = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        bytes.len()
    );
    stream.write_all(header.as_bytes()).await?;
    stream.write_all(bytes).await?;
    Ok(())
}

async fn write_not_found(stream: &mut tokio::net::TcpStream) -> Result<()> {
    let resp = b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
    stream.write_all(resp).await?;
    Ok(())
}
