use std::path::Path;
use anyhow::{Context, Result};
use base64::Engine;
use sha2::{Digest, Sha256};

use crate::models::{
    Account, AccountType, OfficialMojangCape, SkinVariant, WardrobeAssetKind, WardrobeItem,
};
use crate::paths::LauncherPaths;

/// Generates the standard Minecraft Offline UUIDv3 (`OfflinePlayer:<username>`)
/// so local worlds, LAN games, and `online-mode=false` servers match player data identically.
pub fn compute_offline_uuid(username: &str) -> String {
    let input = format!("OfflinePlayer:{username}");
    // MD5-based UUIDv3 construction per java.util.UUID.nameUUIDFromBytes
    let digest = md5_bytes(input.as_bytes());
    let mut bytes = digest;
    bytes[6] = (bytes[6] & 0x0f) | 0x30; // version 3
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // IETF variant
    uuid::Uuid::from_bytes(bytes).to_string()
}

/// Pure RFC 1321 MD5 implementation used solely for `UUID.nameUUIDFromBytes("OfflinePlayer:...")`
/// compatibility with Java's standard library (zero extra crate bloat).
fn md5_bytes(msg: &[u8]) -> [u8; 16] {
    const S: [u32; 64] = [
        7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20,
        5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
        6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
    ];
    let mut k = [0u32; 64];
    for i in 0..64 {
        k[i] = ((4294967296.0 * ((i + 1) as f64).sin().abs()) as u64) as u32;
    }

    let mut a0: u32 = 0x67452301;
    let mut b0: u32 = 0xefcdab89;
    let mut c0: u32 = 0x98badcfe;
    let mut d0: u32 = 0x10325476;

    let bit_len = (msg.len() as u64) * 8;
    let mut padded = msg.to_vec();
    padded.push(0x80);
    while (padded.len() % 64) != 56 {
        padded.push(0);
    }
    padded.extend_from_slice(&bit_len.to_le_bytes());

    for chunk in padded.chunks_exact(64) {
        let mut m = [0u32; 16];
        for (i, word) in chunk.chunks_exact(4).enumerate() {
            m[i] = u32::from_le_bytes([word[0], word[1], word[2], word[3]]);
        }
        let (mut a, mut b, mut c, mut d) = (a0, b0, c0, d0);
        for i in 0..64 {
            let (f, g) = match i {
                0..=15 => ((b & c) | ((!b) & d), i),
                16..=31 => ((d & b) | ((!d) & c), (5 * i + 1) % 16),
                32..=47 => (b ^ c ^ d, (3 * i + 5) % 16),
                _ => (c ^ (b | (!d)), (7 * i) % 16),
            };
            let temp = d;
            d = c;
            c = b;
            b = b.wrapping_add(
                a.wrapping_add(f)
                    .wrapping_add(k[i])
                    .wrapping_add(m[g])
                    .rotate_left(S[i]),
            );
            a = temp;
        }
        a0 = a0.wrapping_add(a);
        b0 = b0.wrapping_add(b);
        c0 = c0.wrapping_add(c);
        d0 = d0.wrapping_add(d);
    }

    let mut out = [0u8; 16];
    out[0..4].copy_from_slice(&a0.to_le_bytes());
    out[4..8].copy_from_slice(&b0.to_le_bytes());
    out[8..12].copy_from_slice(&c0.to_le_bytes());
    out[12..16].copy_from_slice(&d0.to_le_bytes());
    out
}

pub fn create_offline_account(username: &str) -> Account {
    let trimmed = username.trim();
    Account {
        id: uuid::Uuid::new_v4().to_string(),
        username: trimmed.to_string(),
        uuid: compute_offline_uuid(trimmed),
        account_type: AccountType::Offline,
        active: true,
        access_token: Some("0".to_string()),
        refresh_token: None,
        skin_sha256: None,
        skin_variant: SkinVariant::Classic,
        custom_cape_sha256: None,
        official_cape_id: None,
        official_capes: Vec::new(),
        external_yggdrasil_url: None,
    }
}

/// Imports a user-provided `.png` Skin or Cape into TwilightLauncher's persistent Wardrobe,
/// deduplicating by SHA-256 so previously used skins & capes are always saved for 1-click reuse.
pub fn import_png_to_wardrobe(
    paths: &LauncherPaths,
    png_bytes: &[u8],
    display_name: &str,
    kind: WardrobeAssetKind,
    variant: SkinVariant,
) -> Result<WardrobeItem> {
    anyhow::ensure!(
        png_bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        "Provided file is not a valid PNG image"
    );

    let mut hasher = Sha256::new();
    hasher.update(png_bytes);
    let sha256 = hex::encode(hasher.finalize());

    let dir = match kind {
        WardrobeAssetKind::Skin => paths.wardrobe_skins_dir(),
        WardrobeAssetKind::Cape => paths.wardrobe_capes_dir(),
    };
    std::fs::create_dir_all(&dir)?;

    let file_name = format!("{sha256}.png");
    let dest = dir.join(&file_name);
    if !dest.exists() {
        std::fs::write(&dest, png_bytes)?;
    }

    let b64 = base64::engine::general_purpose::STANDARD.encode(png_bytes);
    Ok(WardrobeItem {
        sha256,
        name: display_name.to_string(),
        kind,
        variant,
        file_name,
        added_at: chrono::Utc::now().to_rfc3339(),
        preview_data_url: format!("data:image/png;base64,{b64}"),
    })
}

pub fn import_png_path_to_wardrobe(
    paths: &LauncherPaths,
    source_path: &Path,
    kind: WardrobeAssetKind,
    variant: SkinVariant,
) -> Result<WardrobeItem> {
    let bytes = std::fs::read(source_path)
        .with_context(|| format!("Could not read PNG file {}", source_path.display()))?;
    let stem = source_path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "Custom Asset".to_string());
    import_png_to_wardrobe(paths, &bytes, &stem, kind, variant)
}

/// Uploads a user-provided `.png` skin to an authenticated Java Premium (Microsoft) account
/// via Minecraft Services API.
pub async fn upload_skin_to_mojang_premium(
    client: &reqwest::Client,
    mc_access_token: &str,
    png_bytes: Vec<u8>,
    variant: SkinVariant,
) -> Result<()> {
    let variant_str = match variant {
        SkinVariant::Classic => "classic",
        SkinVariant::Slim => "slim",
    };

    let form = reqwest::multipart::Form::new()
        .text("variant", variant_str)
        .part(
            "file",
            reqwest::multipart::Part::bytes(png_bytes)
                .file_name("skin.png")
                .mime_str("image/png")?,
        );

    client
        .post("https://api.minecraftservices.com/minecraft/profile/skins")
        .bearer_auth(mc_access_token)
        .multipart(form)
        .send()
        .await?
        .error_for_status()
        .context("Mojang skin upload failed")?;

    Ok(())
}

/// Selects (or hides when `cape_id` is None) an official Mojang Cape on a Java Premium account.
pub async fn select_official_mojang_cape(
    client: &reqwest::Client,
    mc_access_token: &str,
    cape_id: Option<&str>,
) -> Result<()> {
    match cape_id {
        Some(id) => {
            client
                .put("https://api.minecraftservices.com/minecraft/profile/capes/active")
                .bearer_auth(mc_access_token)
                .json(&serde_json::json!({ "capeId": id }))
                .send()
                .await?
                .error_for_status()
                .context("Failed activating Mojang cape")?;
        }
        None => {
            client
                .delete("https://api.minecraftservices.com/minecraft/profile/capes/active")
                .bearer_auth(mc_access_token)
                .send()
                .await?
                .error_for_status()
                .context("Failed hiding Mojang cape")?;
        }
    }
    Ok(())
}

/// Fetches the authenticated Java Premium profile (UUID, username, and available official capes).
pub async fn fetch_mojang_premium_profile(
    client: &reqwest::Client,
    mc_access_token: &str,
) -> Result<(String, String, Vec<OfficialMojangCape>)> {
    let val: serde_json::Value = client
        .get("https://api.minecraftservices.com/minecraft/profile")
        .bearer_auth(mc_access_token)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    let uuid = val["id"].as_str().unwrap_or_default().to_string();
    let name = val["name"].as_str().unwrap_or("Player").to_string();
    let mut capes = Vec::new();
    if let Some(arr) = val["capes"].as_array() {
        for c in arr {
            capes.push(OfficialMojangCape {
                id: c["id"].as_str().unwrap_or_default().to_string(),
                alias: c["alias"].as_str().unwrap_or("Cape").to_string(),
                url: c["url"].as_str().unwrap_or_default().to_string(),
                state: c["state"].as_str().unwrap_or("INACTIVE").to_string(),
            });
        }
    }
    Ok((uuid, name, capes))
}
