pub mod auth;
pub mod crash_doctor;
pub mod files;
pub mod java_manager;
pub mod launch;
pub mod loaders;
pub mod models;
pub mod modrinth;
pub mod mojang;
pub mod paths;
pub mod security;
pub mod yggdrasil_local;

use anyhow::Result;
use models::{Account, LauncherSettings, LauncherStateSnapshot};
use paths::LauncherPaths;

pub fn load_or_init_state(paths: &LauncherPaths) -> Result<LauncherStateSnapshot> {
    let state_path = paths.state_file();
    if state_path.exists() {
        let raw = std::fs::read_to_string(&state_path)?;
        if let Ok(parsed) = serde_json::from_str::<LauncherStateSnapshot>(&raw) {
            return Ok(parsed);
        }
    }

    let default_account: Account = auth::create_offline_account("Player");

    let initial = LauncherStateSnapshot {
        settings: LauncherSettings::default(),
        profiles: Vec::new(),
        accounts: vec![default_account],
        wardrobe: Vec::new(),
    };
    save_state(paths, &initial)?;
    Ok(initial)
}

pub fn save_state(paths: &LauncherPaths, snapshot: &LauncherStateSnapshot) -> Result<()> {
    let json = serde_json::to_string_pretty(snapshot)?;
    std::fs::write(paths.state_file(), json)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{ModLoaderKind, SkinVariant, WardrobeAssetKind, WindowLaunchAction};
    use std::io::Write;

    #[test]
    fn default_settings_match_user_spec() {
        let settings = LauncherSettings::default();
        assert_eq!(settings.window_launch_action, WindowLaunchAction::Minimize);
        assert!(!settings.auto_fullscreen);
        assert!(settings.shield.token_vault);
        assert!(settings.shield.os_sandbox);
        assert!(settings.shield.jar_scanner);
    }

    #[test]
    fn default_profile_uses_none_loader_and_latest_loader_version() {
        let profile = models::Profile::default();
        assert_eq!(profile.loader, ModLoaderKind::None);
        assert_eq!(profile.loader_version, "latest");
        assert!(profile.auto_update_loader);
    }

    #[test]
    fn fresh_state_has_no_default_profiles() {
        let temp = tempfile::tempdir().unwrap();
        let paths = LauncherPaths::from_root(temp.path().to_path_buf()).unwrap();
        let state = load_or_init_state(&paths).unwrap();
        assert!(state.profiles.is_empty());
    }

    #[test]
    fn offline_uuid_matches_minecraft_standard() {
        // Known UUID.nameUUIDFromBytes("OfflinePlayer:Notch") == b50ad385-829d-3141-a216-7e7d7539ba7f
        let uuid = auth::compute_offline_uuid("Notch");
        assert_eq!(uuid, "b50ad385-829d-3141-a216-7e7d7539ba7f");
    }

    #[test]
    fn storage_paths_enforce_strict_vanilla_loader_and_profile_isolation() {
        let temp = tempfile::tempdir().unwrap();
        let paths = LauncherPaths::from_root(temp.path().to_path_buf()).unwrap();

        let vanilla = paths.shared_vanilla_libraries_dir();
        let fabric = paths.isolated_loader_dir(ModLoaderKind::Fabric, "1.21.4", "0.16.10");
        let forge = paths.isolated_loader_dir(ModLoaderKind::Forge, "1.20.1", "47.3.0");
        let prof = paths.ensure_profile_layout("prof-1").unwrap();

        assert!(!fabric.starts_with(&vanilla));
        assert!(!forge.starts_with(&vanilla));
        assert!(!prof.starts_with(&vanilla));

        // Verify path traversal outside profile is blocked
        assert!(paths.resolve_inside_profile("prof-1", "../../etc/passwd").is_err());
        assert!(paths.resolve_inside_profile("prof-1", "mods/sodium.jar").is_ok());
    }

    #[test]
    fn wardrobe_deduplicates_skins_by_sha256() {
        let temp = tempfile::tempdir().unwrap();
        let paths = LauncherPaths::from_root(temp.path().to_path_buf()).unwrap();

        let fake_png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDRfake_skin_payload";
        let first = auth::import_png_to_wardrobe(
            &paths,
            fake_png,
            "Knight",
            WardrobeAssetKind::Skin,
            SkinVariant::Slim,
        )
        .unwrap();
        let second = auth::import_png_to_wardrobe(
            &paths,
            fake_png,
            "Knight Copy",
            WardrobeAssetKind::Skin,
            SkinVariant::Slim,
        )
        .unwrap();
        assert_eq!(first.sha256, second.sha256);
    }

    #[test]
    fn rust_jar_scanner_detects_malicious_constant_pool_webhook() {
        let temp = tempfile::tempdir().unwrap();
        let bad_jar = temp.path().join("stealer.jar");

        {
            let f = std::fs::File::create(&bad_jar).unwrap();
            let mut zip = zip::ZipWriter::new(f);
            zip.start_file("com/evil/ModInit.class", zip::write::SimpleFileOptions::default())
                .unwrap();
            let mut fake_class = vec![0xCA, 0xFE, 0xBA, 0xBE, 0x00, 0x00, 0x00, 0x3D, 0x00, 0x10];
            fake_class.extend_from_slice(b"https://discord.com/api/webhooks/12345/secret");
            fake_class.extend_from_slice(b"Google/Chrome/User Data/Default/Login Data");
            zip.write_all(&fake_class).unwrap();
            zip.finish().unwrap();
        }

        let report = security::scan_jar_file(&bad_jar).unwrap();
        assert!(!report.safe);
        assert!(report.findings.len() >= 2);
    }

    #[test]
    fn crash_doctor_identifies_oom_and_missing_fabric_api() {
        let oom = crash_doctor::analyze_crash_log("java.lang.OutOfMemoryError: Java heap space");
        assert_eq!(oom.fix_action_code.as_deref(), Some("bump_ram_2048"));

        let fab = crash_doctor::analyze_crash_log("Mod sodium requires fabric-api 0.100.0 or later (missing)");
        assert_eq!(fab.fix_action_code.as_deref(), Some("install_fabric_api"));
    }

    #[test]
    fn java_and_loader_version_mappings_support_mc_26_and_java_25() {
        assert_eq!(java_manager::required_java_major_for_mc("1.16.5"), 8);
        assert_eq!(java_manager::required_java_major_for_mc("1.20.4"), 17);
        assert_eq!(java_manager::required_java_major_for_mc("1.21.11"), 21);
        assert_eq!(java_manager::required_java_major_for_mc("26.1"), 25);
        assert_eq!(java_manager::required_java_major_for_mc("26.3"), 25);
        assert_eq!(java_manager::required_java_major_for_mc("26.4-pre-1"), 25);

        assert_eq!(loaders::neoforge_version_prefix_for_mc("1.21"), "21.0.");
        assert_eq!(loaders::neoforge_version_prefix_for_mc("1.21.4"), "21.4.");
        assert_eq!(loaders::neoforge_version_prefix_for_mc("26.3"), "26.3.0.");
        assert_eq!(loaders::neoforge_version_prefix_for_mc("26.1.2"), "26.1.2.");
        assert!(loaders::neoforge_matches_mc_version(
            "26.1.0.0-alpha.1+snapshot-1",
            "26.1-snapshot-1"
        ));
        assert!(!loaders::neoforge_matches_mc_version(
            "26.1.0.1-beta",
            "26.1-snapshot-1"
        ));

        let mut quilt = vec![
            "0.20.0-beta.9".to_string(),
            "0.30.2".to_string(),
            "0.31.0-beta.6".to_string(),
            "0.31.0-rc.1".to_string(),
            "0.29.1".to_string(),
        ];
        quilt.sort_by(|a, b| loaders::compare_loader_versions_desc(a, b));
        assert_eq!(quilt[0], "0.31.0-rc.1");
        assert_eq!(quilt[1], "0.31.0-beta.6");
        assert_eq!(quilt[2], "0.30.2");
    }
}
