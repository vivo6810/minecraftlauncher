import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Command,
  Compass,
  Home,
  Settings as SettingsIcon,
  SunMoon,
  User,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { LauncherBridge, isTauriDesktop } from "./lib/bridge";
import {
  BOUNCE_SPRING,
  ELASTIC_SPRING,
  type IslandActivity,
  type LauncherSettings,
  type LauncherStateSnapshot,
  type MinecraftVersionEntry,
  type Profile,
} from "./types/launcher";
import { DynamicIsland } from "./components/DynamicIsland";
import { CommandPalette } from "./components/CommandPalette";
import { StartScreen } from "./components/StartScreen";
import { ProfileWorkspace } from "./components/ProfileWorkspace";
import { ModrinthBrowser } from "./components/ModrinthBrowser";
import { AccountsWardrobe } from "./components/AccountsWardrobe";
import { SettingsView } from "./components/SettingsView";

export const App: React.FC = () => {
  const [state, setState] = useState<LauncherStateSnapshot | null>(null);
  const [mcVersions, setMcVersions] = useState<MinecraftVersionEntry[]>([]);
  const [screen, setScreen] = useState<"home" | "profile" | "modrinth" | "accounts" | "settings">(
    "home"
  );
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [profileInitialTab, setProfileInitialTab] = useState("overview");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [island, setIsland] = useState<IslandActivity>({
    status: "Idle",
    progress: 0,
    active: false,
    runningProfileName: null,
    startedAtMs: null,
  });

  useEffect(() => {
    LauncherBridge.getState().then((s) => {
      setState(s);
      document.documentElement.setAttribute("data-theme", s.settings.theme);
    });
    LauncherBridge.fetchMcVersions().then((m) => setMcVersions(m.versions));

    if (isTauriDesktop()) {
      const unlistenPromise = listen<{ status: string; progress: number; active: boolean }>(
        "twilight://island",
        (ev) => {
          setIsland((prev) => ({
            ...prev,
            status: ev.payload.status,
            progress: ev.payload.progress,
            active: ev.payload.active,
          }));
        }
      );
      return () => {
        unlistenPromise.then((fn) => fn());
      };
    }
  }, []);

  // Global Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr));
    }, 3400);
  };

  const handleSaveSettings = async (nextSettings: LauncherSettings) => {
    const saved = await LauncherBridge.updateSettings(nextSettings);
    document.documentElement.setAttribute("data-theme", saved.theme);
    setState((prev) => (prev ? { ...prev, settings: saved } : prev));
  };

  const handleLaunch = async (profile: Profile) => {
    if (!state) return;

    // Pre-flight check in web preview if block_high_risk_jars is enabled
    if (state.settings.shield.jar_scanner && state.settings.shield.block_high_risk_jars) {
      const reports = await LauncherBridge.scanProfileMods(profile.id);
      const bad = reports.filter((r) => !r.safe);
      if (bad.length > 0) {
        showToast(
          `Twilight Shield blocked launch: malicious bytecode flagged in ${bad[0].file_name}!`
        );
        setSelectedProfileId(profile.id);
        setProfileInitialTab("shield");
        setScreen("profile");
        return;
      }
    }

    const steps = [
      { msg: `Twilight Shield scanning ${profile.name}/mods...`, p: 0.18 },
      { msg: `Verifying Portable OpenJDK & ${profile.loader === "none" ? "Vanilla" : profile.loader}...`, p: 0.52 },
      { msg: `Spawning sandboxed JVM (${state.settings.window_launch_action})...`, p: 0.88 },
    ];

    for (const st of steps) {
      setIsland((prev) => ({ ...prev, status: st.msg, progress: st.p, active: true }));
      await new Promise((r) => setTimeout(r, 320));
    }

    await LauncherBridge.launchProfile(profile.id);

    setIsland({
      status: `${profile.name} Running`,
      progress: 1,
      active: false,
      runningProfileName: `${profile.name} (${profile.mc_version})`,
      startedAtMs: Date.now(),
    });

    showToast(
      `Launched ${profile.name} • Window action: ${state.settings.window_launch_action} • Fullscreen: ${
        (profile.fullscreen_override ?? state.settings.auto_fullscreen) ? "ON" : "OFF"
      }`
    );
  };

  if (!state) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-bg text-fg font-mono text-xs">
        Booting TwilightLauncher...
      </div>
    );
  }

  const activeAccount = state.accounts.find((a) => a.active) ?? state.accounts[0];
  const selectedProfile =
    state.profiles.find((p) => p.id === selectedProfileId) ?? state.profiles[0];

  const shieldActiveCount = [
    state.settings.shield.token_vault,
    state.settings.shield.os_sandbox,
    state.settings.shield.jar_scanner,
  ].filter(Boolean).length;

  const navItems = [
    { id: "home" as const, label: "Start", icon: Home },
    { id: "modrinth" as const, label: "Modrinth", icon: Compass },
    { id: "accounts" as const, label: "Wardrobe", icon: User },
    { id: "settings" as const, label: "Settings", icon: SettingsIcon },
  ];

  return (
    <div className="h-screen w-screen flex bg-bg text-fg overflow-hidden">
      {/* Elastic Dynamic Island */}
      <DynamicIsland
        island={island}
        shieldActiveCount={shieldActiveCount}
        onStopSimulatedRun={() =>
          setIsland((prev) => ({
            ...prev,
            runningProfileName: null,
            startedAtMs: null,
          }))
        }
      />

      {/* Left Minimal Monotone Dock */}
      <aside className="w-20 md:w-56 shrink-0 border-r border-border bg-surface/70 flex flex-col justify-between p-3 md:p-4">
        <div className="space-y-6">
          {/* Brand Mark */}
          <div
            onClick={() => setScreen("home")}
            className="cursor-pointer flex items-center gap-3 px-2 pt-1"
          >
            <div className="w-9 h-9 rounded-xl bg-fg text-bg flex items-center justify-center font-mono font-black text-sm shadow">
              TL
            </div>
            <div className="hidden md:block">
              <div className="text-sm font-bold tracking-tight leading-none">
                TwilightLauncher
              </div>
              <div className="text-[10px] font-mono text-muted mt-1">v0.1.0 • MONOTONE</div>
            </div>
          </div>

          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active =
                screen === item.id || (item.id === "home" && screen === "profile");
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setScreen(item.id)}
                  className={`relative w-full flex items-center justify-center md:justify-start gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                    active ? "text-bg" : "text-muted hover:text-fg"
                  }`}
                >
                  {active && (
                    <motion.div
                      layoutId="sidebarActivePill"
                      transition={BOUNCE_SPRING}
                      className="absolute inset-0 bg-fg rounded-xl"
                    />
                  )}
                  <Icon className="w-4 h-4 relative z-10 shrink-0" />
                  <span className="hidden md:inline relative z-10">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="w-full flex items-center justify-center md:justify-between px-3 py-2 rounded-xl bg-elevated border border-border text-xs text-muted hover:text-fg"
          >
            <span className="flex items-center gap-2">
              <Command className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Commands</span>
            </span>
            <kbd className="hidden md:inline font-mono text-[10px]">Ctrl+K</kbd>
          </button>

          <button
            type="button"
            onClick={() =>
              handleSaveSettings({
                ...state.settings,
                theme: state.settings.theme === "dark" ? "light" : "dark",
              })
            }
            className="w-full flex items-center justify-center md:justify-start gap-2.5 px-3 py-2 rounded-xl bg-elevated border border-border text-xs text-muted hover:text-fg"
          >
            <SunMoon className="w-3.5 h-3.5" />
            <span className="hidden md:inline capitalize">
              {state.settings.theme} Monotone
            </span>
          </button>
        </div>
      </aside>

      {/* Main Scrollable Content Stage */}
      <main className="flex-1 overflow-y-auto pt-14 pb-10 px-5 md:px-9">
        <div className="max-w-6xl mx-auto">
          <AnimatePresence mode="wait">
            {screen === "home" && (
              <motion.div
                key="home"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={ELASTIC_SPRING}
              >
                <StartScreen
                  profiles={state.profiles}
                  activeAccount={activeAccount}
                  mcVersions={mcVersions}
                  onLaunchProfile={handleLaunch}
                  onSelectProfile={(prof, tab = "overview") => {
                    setSelectedProfileId(prof.id);
                    setProfileInitialTab(tab);
                    setScreen("profile");
                  }}
                  onOpenUniversalModrinth={() => setScreen("modrinth")}
                  onOpenWardrobe={() => setScreen("accounts")}
                  onCreateProfile={async (created) => {
                    const nextProfiles = await LauncherBridge.upsertProfile(created);
                    setState((prev) =>
                      prev ? { ...prev, profiles: nextProfiles } : prev
                    );
                    showToast(`Created profile "${created.name}"`);
                  }}
                />
              </motion.div>
            )}

            {screen === "profile" && selectedProfile && (
              <motion.div
                key={`prof-${selectedProfile.id}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={ELASTIC_SPRING}
              >
                <ProfileWorkspace
                  profile={selectedProfile}
                  allProfiles={state.profiles}
                  initialTab={profileInitialTab}
                  mcVersions={mcVersions}
                  onBack={() => setScreen("home")}
                  onLaunch={handleLaunch}
                  onSaveProfile={async (updated) => {
                    const nextProfiles = await LauncherBridge.upsertProfile(updated);
                    setState((prev) =>
                      prev ? { ...prev, profiles: nextProfiles } : prev
                    );
                  }}
                  onDeleteProfile={async (id) => {
                    const nextProfiles = await LauncherBridge.deleteProfile(id);
                    setState((prev) =>
                      prev ? { ...prev, profiles: nextProfiles } : prev
                    );
                    setScreen("home");
                    showToast("Deleted profile");
                  }}
                  onProfilesChanged={(profiles, created) => {
                    setState((prev) => (prev ? { ...prev, profiles } : prev));
                    if (created) {
                      setSelectedProfileId(created.id);
                      setProfileInitialTab("overview");
                    }
                  }}
                  onToast={showToast}
                  onSetIsland={(status, progress, active) =>
                    setIsland((prev) => ({ ...prev, status, progress, active }))
                  }
                />
              </motion.div>
            )}

            {screen === "modrinth" && (
              <motion.div
                key="modrinth-universal"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={ELASTIC_SPRING}
              >
                <ModrinthBrowser
                  scopedProfile={null}
                  profiles={state.profiles}
                  onBack={() => setScreen("home")}
                  onProfilesChanged={(profiles, newlyCreated) => {
                    setState((prev) => (prev ? { ...prev, profiles } : prev));
                    if (newlyCreated) {
                      setSelectedProfileId(newlyCreated.id);
                      setProfileInitialTab("overview");
                      setScreen("profile");
                    }
                  }}
                  onToast={showToast}
                  onSetIsland={(status, progress, active) =>
                    setIsland((prev) => ({ ...prev, status, progress, active }))
                  }
                />
              </motion.div>
            )}

            {screen === "accounts" && (
              <motion.div
                key="accounts"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={ELASTIC_SPRING}
              >
                <AccountsWardrobe
                  accounts={state.accounts}
                  wardrobe={state.wardrobe}
                  onStateUpdated={setState}
                  onToast={showToast}
                />
              </motion.div>
            )}

            {screen === "settings" && (
              <motion.div
                key="settings"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={ELASTIC_SPRING}
              >
                <SettingsView
                  settings={state.settings}
                  onSaveSettings={handleSaveSettings}
                  onToast={showToast}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Ctrl+K Elastic Command Palette */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        profiles={state.profiles}
        accounts={state.accounts}
        onLaunchProfile={handleLaunch}
        onOpenProfileTab={(prof, t) => {
          setSelectedProfileId(prof.id);
          setProfileInitialTab(t);
          setScreen("profile");
        }}
        onNavigate={(target) =>
          setScreen(target as "home" | "modrinth" | "accounts" | "settings")
        }
        onSwitchAccount={async (accountId) => {
          const next = await LauncherBridge.setActiveAccount(accountId);
          setState(next);
          showToast("Switched active account");
        }}
        onToggleTheme={() =>
          handleSaveSettings({
            ...state.settings,
            theme: state.settings.theme === "dark" ? "light" : "dark",
          })
        }
      />

      {/* Minimal Bottom Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.94 }}
            transition={ELASTIC_SPRING}
            className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-2xl bg-fg text-bg text-xs font-medium shadow-2xl"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
