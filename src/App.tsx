import React, { Suspense, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Command,
  Compass,
  Home,
  Settings as SettingsIcon,
  User,
} from "lucide-react";
import { accentRgb, readableAccentText } from "./lib/accent";
import { isTauriDesktop, LauncherBridge } from "./lib/bridge";
import {
  BOUNCE_SPRING,
  ELASTIC_SPRING,
  type LauncherSettings,
  type LauncherStateSnapshot,
  type MinecraftVersionEntry,
  type Profile,
} from "./types/launcher";
import { AccountWelcome } from "./components/AccountWelcome";
import { TitleBar } from "./components/TitleBar";
import { CommandPalette } from "./components/CommandPalette";
import { StartScreen } from "./components/StartScreen";
import { ProfileWorkspace } from "./components/ProfileWorkspace";
import { ModrinthBrowser } from "./components/ModrinthBrowser";
import { SettingsView } from "./components/SettingsView";

const WardrobeView = React.lazy(() => import("./components/WardrobeView"));

export const App: React.FC = () => {
  const [skippedAccounts, setSkippedAccounts] = useState(false);
  const [startupElapsed, setStartupElapsed] = useState(false);
  const [state, setState] = useState<LauncherStateSnapshot | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [loadingState, setLoadingState] = useState(false);
  const [mcVersions, setMcVersions] = useState<MinecraftVersionEntry[]>([]);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [screen, setScreen] = useState<
    "home" | "profile" | "modrinth" | "accounts" | "settings"
  >("home");
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [profileInitialTab, setProfileInitialTab] = useState("overview");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [profileLogs, setProfileLogs] = useState<Record<string, string[]>>({});
  const launchingProfiles = useRef(new Set<string>());
  const latestSettings = useRef(state?.settings);
  latestSettings.current = state?.settings;
  const toastTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const accent = state?.settings.accent_color;
  useEffect(() => {
    const rgb = accentRgb(accent);
    document.documentElement.style.setProperty("--tw-accent-rgb", rgb.join(" "));
    document.documentElement.style.setProperty("--tw-accent-fg-rgb", readableAccentText(rgb));
  }, [accent]);

  const loadLauncherState = async () => {
    if (loadingState) return;
    setLoadingState(true);
    setInitError(null);
    try {
      const s = await LauncherBridge.getState();
      setState(s);
      document.documentElement.setAttribute("data-theme", s.settings.theme);
    } catch (err) {
      setInitError(String(err));
    } finally {
      setLoadingState(false);
    }
  };

  const loadMcVersions = async () => {
    setLoadingVersions(true);
    setVersionsError(null);
    try {
      const m = await LauncherBridge.fetchMcVersions();
      setMcVersions(m.versions);
    } catch (err) {
      setVersionsError(String(err));
    } finally {
      setLoadingVersions(false);
    }
  };

  useEffect(() => {
    void loadLauncherState();
    void loadMcVersions();
    const startupTimer = window.setTimeout(() => setStartupElapsed(true), 420);
    return () => window.clearTimeout(startupTimer);
  }, []);

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
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  };

  const handleSaveSettings = async (nextSettings: LauncherSettings, reportInSettings = false) => {
    try {
      const saved = await LauncherBridge.updateSettings(nextSettings);
      document.documentElement.setAttribute("data-theme", saved.theme);
      setState((prev) => (prev ? { ...prev, settings: saved } : prev));
    } catch (err) {
      if (reportInSettings) throw err;
      showToast(String(err));
    }
  };

  const handleLaunch = async (profile: Profile) => {
    if (!state || launchingProfiles.current.has(profile.id)) return;
    if (!state.accounts.length) {
      setSkippedAccounts(false);
      return;
    }
    launchingProfiles.current.add(profile.id);
    setProfileLogs(previous => ({ ...previous, [profile.id]: [] }));
    const appendLog = (line: string) => {
      setProfileLogs(previous => ({
        ...previous,
        [profile.id]: [...(previous[profile.id] ?? []).slice(-1499), line.slice(0, 8192)],
      }));
    };

    try {
      if (state.settings.shield.jar_scanner && state.settings.shield.block_high_risk_jars) {
        const reports = await LauncherBridge.scanProfileMods(profile.id);
        const bad = reports.find((report) => !report.safe);
        if (bad) {
          showToast(`Blocked flagged mod: ${bad.file_name}`);
          setSelectedProfileId(profile.id);
          setProfileInitialTab("shield");
          setScreen("profile");
          return;
        }
      }

      const desktop = isTauriDesktop();
      showToast(desktop ? `Preparing ${profile.name}` : `Previewing launch for ${profile.name}`);
      const exitCode = await LauncherBridge.launchProfile(profile.id, appendLog);
      appendLog(`Exited with code ${exitCode}.`);
      if (desktop) {
        const latest = await LauncherBridge.getState();
        setState((previous) => previous && { ...previous, profiles: latest.profiles });
        showToast(`${profile.name} exited (code ${exitCode})`);
      }
    } catch (err) {
      appendLog(`Launch failed: ${err}`);
      showToast(String(err));
    } finally {
      launchingProfiles.current.delete(profile.id);
    }
  };

  if (!state || !startupElapsed) {
    return (
      <div className="launcher-shell h-screen w-screen flex flex-col text-fg overflow-hidden">
        <TitleBar />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center font-mono text-xs text-muted">
          {initError ? (
            <>
              <span className="text-fg max-w-md break-words">{initError}</span>
              <button
                type="button"
                disabled={loadingState}
                onClick={() => void loadLauncherState()}
                className="px-3.5 py-1.5 rounded-lg bg-fg text-bg font-sans font-semibold text-xs disabled:opacity-50"
              >
                {loadingState ? "Retrying..." : "Retry"}
              </button>
            </>
          ) : (
            <div className="startup-panel" role="status">
              <h1 className="launcher-heading text-3xl text-fg">Twilight Launcher</h1>
              <span>Loading launcher</span>
              <div className="startup-track" aria-hidden="true"><span /></div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!state.accounts.length && !skippedAccounts) {
    return <AccountWelcome onAccount={setState} onSkip={() => setSkippedAccounts(true)} />;
  }

  const selectedProfile =
    state.profiles.find((p) => p.id === selectedProfileId) ?? state.profiles[0];

  const navItems = [
    { id: "home" as const, label: "Profiles", icon: Home },
    { id: "modrinth" as const, label: "Modrinth", icon: Compass },
    { id: "accounts" as const, label: "Wardrobe", icon: User },
    { id: "settings" as const, label: "Settings", icon: SettingsIcon },
  ];

  const isWardrobeScreen = screen === "accounts";

  return (
    <div className="launcher-shell relative isolate h-screen w-screen flex flex-col text-fg overflow-hidden">
      {state.settings.background_image && (
        <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
          <img src={state.settings.background_image} alt="" className="h-full w-full object-cover"
            style={{ filter: `blur(${Math.min(32, Math.max(0, state.settings.background_blur ?? 0))}px)`, transform: "scale(1.12)" }} />
          <div className="absolute inset-0 bg-bg/65" />
        </div>
      )}
      {/* Custom Frameless TitleBar (Replaces Native OS Titlebar) */}
      <TitleBar />

      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left Navigation Dock */}
        <aside className="launcher-dock w-[3.75rem] md:w-44 shrink-0 flex flex-col justify-between p-2 md:p-3">
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active =
                screen === item.id || (item.id === "home" && screen === "profile");
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setScreen(item.id)}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  className={`relative w-full flex items-center justify-center md:justify-start gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                    active ? "text-fg" : "text-muted hover:text-fg"
                  }`}
                >
                  {active && (
                    <motion.div
                      layoutId="sidebarActivePill"
                      transition={BOUNCE_SPRING}
                      className="absolute inset-0 bg-elevated rounded-xl"
                    />
                  )}
                  <Icon className={`w-4 h-4 relative z-10 shrink-0 ${active ? "text-accent" : ""}`} />
                  <span className="hidden md:inline relative z-10">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="w-full flex items-center justify-center md:justify-between px-3 py-2 rounded-xl bg-surface hover:bg-elevated text-xs text-muted hover:text-fg"
          >
            <span className="flex items-center gap-2">
              <Command className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Search</span>
            </span>
            <kbd className="hidden md:inline font-mono text-[10px]">Ctrl+K</kbd>
          </button>
        </aside>

        {/* Main Content Area */}
        <main
          key={screen}
          className={
            isWardrobeScreen
              ? "launcher-view flex-1 min-w-0 h-full overflow-hidden"
              : "launcher-view flex-1 min-w-0 h-full overflow-y-auto px-5 md:px-7 py-6"
          }
        >
          {isWardrobeScreen ? (
            <Suspense
              fallback={
                <div className="w-full h-full flex items-center justify-center font-mono text-xs text-muted">
                  Loading...
                </div>
              }
            >
              <WardrobeView
                state={state}
                onStateChange={setState}
                onToast={showToast}
              />
            </Suspense>
          ) : (
            <div className="max-w-5xl mx-auto">
              {screen === "home" && (
                <StartScreen
                  profiles={state.profiles}
                  mcVersions={mcVersions}
                  versionsError={versionsError}
                  loadingVersions={loadingVersions}
                  onRetryVersions={() => void loadMcVersions()}
                  onLaunchProfile={(p) => void handleLaunch(p)}
                  onSelectProfile={(p, initialTab = "overview") => {
                    setSelectedProfileId(p.id);
                    setProfileInitialTab(initialTab);
                    setScreen("profile");
                  }}
                  onOpenUniversalModrinth={() => setScreen("modrinth")}
                  onCreateProfile={async (created) => {
                    const updated = await LauncherBridge.upsertProfile(created);
                    setState((prev) =>
                      prev ? { ...prev, profiles: updated } : prev
                    );
                    setSelectedProfileId(created.id);
                    setProfileInitialTab("overview");
                    setScreen("profile");
                  }}
                />
              )}

              {screen === "profile" && selectedProfile && (
                <ProfileWorkspace
                  key={selectedProfile.id}
                  profile={selectedProfile}
                  allProfiles={state.profiles}
                  logLines={profileLogs[selectedProfile.id] ?? []}
                  initialTab={profileInitialTab}
                  mcVersions={mcVersions}
                  onBack={() => setScreen("home")}
                  onLaunch={(p) => void handleLaunch(p)}
                  onSaveProfile={async (updated) => {
                    const nextList = await LauncherBridge.upsertProfile(updated);
                    setState((prev) =>
                      prev ? { ...prev, profiles: nextList } : prev
                    );
                  }}
                  onDeleteProfile={async (id) => {
                    const nextList = await LauncherBridge.deleteProfile(id);
                    setState((prev) =>
                      prev ? { ...prev, profiles: nextList } : prev
                    );
                    setSelectedProfileId(nextList[0]?.id ?? null);
                    setScreen("home");
                  }}
                  onProfilesChanged={(profiles, created) => {
                    setState((prev) => (prev ? { ...prev, profiles } : prev));
                    if (created) {
                      setSelectedProfileId(created.id);
                    }
                  }}
                  onToast={showToast}
                />
              )}

              {screen === "modrinth" && (
                <ModrinthBrowser
                  scopedProfile={null}
                  profiles={state.profiles}
                  onProfilesChanged={(profiles, created) => {
                    setState((prev) => (prev ? { ...prev, profiles } : prev));
                    if (created) {
                      setSelectedProfileId(created.id);
                      setProfileInitialTab("overview");
                      setScreen("profile");
                    }
                  }}
                  onToast={showToast}
                />
              )}

              {screen === "settings" && (
                <SettingsView
                  settings={state.settings}
                  accounts={state.accounts}
                  onSaveSettings={handleSaveSettings}
                  onSaveAccent={async (color) => {
                    const settings = latestSettings.current;
                    if (settings) await handleSaveSettings({ ...settings, accent_color: color }, true);
                  }}
                  onSaveBackground={async (image, blur) => {
                    const settings = latestSettings.current;
                    if (settings) await handleSaveSettings({ ...settings, background_image: image, background_blur: blur }, true);
                  }}
                  onStateChange={setState}
                  onToast={showToast}
                />
              )}
            </div>
          )}
        </main>
      </div>

      {/* Command Palette */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        profiles={state.profiles}
        accounts={state.accounts}
        onLaunchProfile={(p) => void handleLaunch(p)}
        onOpenProfileTab={(p, tab) => {
          setSelectedProfileId(p.id);
          setProfileInitialTab(tab);
          setScreen("profile");
        }}
        onNavigate={(target) =>
          setScreen(
            target as "home" | "profile" | "modrinth" | "accounts" | "settings"
          )
        }
        onSwitchAccount={async (id) => {
          try {
            setState(await LauncherBridge.setActiveAccount(id));
          } catch (err) {
            showToast(String(err));
          }
        }}
        onToggleTheme={() =>
          void handleSaveSettings({
            ...state.settings,
            theme: state.settings.theme === "dark" ? "light" : "dark",
          })
        }
      />

      {/* Minimal Bottom Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={ELASTIC_SPRING}
            className="fixed bottom-4 right-4 z-[110] px-3.5 py-2 rounded-xl bg-fg text-bg text-xs font-medium shadow-xl"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;

