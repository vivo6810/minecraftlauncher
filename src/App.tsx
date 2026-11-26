import React, { Suspense, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Command,
  Compass,
  Home,
  Settings as SettingsIcon,
  User,
} from "lucide-react";
import { LauncherBridge } from "./lib/bridge";
import {
  BOUNCE_SPRING,
  ELASTIC_SPRING,
  type LauncherSettings,
  type LauncherStateSnapshot,
  type MinecraftVersionEntry,
  type Profile,
} from "./types/launcher";
import { TitleBar } from "./components/TitleBar";
import { CommandPalette } from "./components/CommandPalette";
import { StartScreen } from "./components/StartScreen";
import { ProfileWorkspace } from "./components/ProfileWorkspace";
import { ModrinthBrowser } from "./components/ModrinthBrowser";
import { SettingsView } from "./components/SettingsView";

const WardrobeView = React.lazy(() => import("./components/WardrobeView"));

export const App: React.FC = () => {
  const [state, setState] = useState<LauncherStateSnapshot | null>(null);
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
    LauncherBridge.getState()
      .then((s) => {
        setState(s);
        document.documentElement.setAttribute("data-theme", s.settings.theme);
      })
      .catch((err) => showToast(String(err)));
    void loadMcVersions();
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
    window.setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr));
    }, 3000);
  };

  const handleSaveSettings = async (nextSettings: LauncherSettings) => {
    const saved = await LauncherBridge.updateSettings(nextSettings);
    document.documentElement.setAttribute("data-theme", saved.theme);
    setState((prev) => (prev ? { ...prev, settings: saved } : prev));
  };

  const handleLaunch = async (profile: Profile) => {
    if (!state) return;

    if (
      state.settings.shield.jar_scanner &&
      state.settings.shield.block_high_risk_jars
    ) {
      const reports = await LauncherBridge.scanProfileMods(profile.id);
      const bad = reports.filter((r) => !r.safe);
      if (bad.length > 0) {
        showToast(`Blocked flagged mod: ${bad[0].file_name}`);
        setSelectedProfileId(profile.id);
        setProfileInitialTab("shield");
        setScreen("profile");
        return;
      }
    }

    try {
      await LauncherBridge.launchProfile(profile.id);
      showToast(`Launching ${profile.name}`);
    } catch (err) {
      showToast(String(err));
    }
  };

  if (!state) {
    return (
      <div className="h-screen w-screen flex flex-col bg-bg text-fg overflow-hidden">
        <TitleBar />
        <div className="flex-1 flex items-center justify-center font-mono text-xs text-muted">
          Loading...
        </div>
      </div>
    );
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
    <div className="h-screen w-screen flex flex-col bg-bg text-fg overflow-hidden">
      {/* Custom Frameless TitleBar (Replaces Native OS Titlebar) */}
      <TitleBar />

      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left Navigation Dock */}
        <aside className="w-16 md:w-48 shrink-0 border-r border-border bg-surface/70 flex flex-col justify-between p-2.5 md:p-3">
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
                  className={`relative w-full flex items-center justify-center md:justify-start gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${
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

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="w-full flex items-center justify-center md:justify-between px-3 py-2 rounded-xl bg-elevated border border-border text-xs text-muted hover:text-fg"
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
          className={
            isWardrobeScreen
              ? "flex-1 min-w-0 h-full overflow-hidden"
              : "flex-1 min-w-0 h-full overflow-y-auto px-5 md:px-7 py-6"
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
          const next = await LauncherBridge.setActiveAccount(id);
          setState(next);
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

