import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Compass,
  FolderOpen,
  Image as ImageIcon,
  Layers,
  Play,
  Plus,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";
import {
  ELASTIC_SPRING,
  type Account,
  type MinecraftVersionEntry,
  type ModLoaderKind,
  type Profile,
} from "../types/launcher";

interface Props {
  profiles: Profile[];
  activeAccount: Account | undefined;
  mcVersions: MinecraftVersionEntry[];
  onLaunchProfile: (profile: Profile) => void;
  onSelectProfile: (profile: Profile, initialTab?: string) => void;
  onOpenUniversalModrinth: () => void;
  onOpenWardrobe: () => void;
  onCreateProfile: (p: Profile) => Promise<void>;
}

export const StartScreen: React.FC<Props> = ({
  profiles,
  activeAccount,
  mcVersions,
  onLaunchProfile,
  onSelectProfile,
  onOpenUniversalModrinth,
  onOpenWardrobe,
  onCreateProfile,
}) => {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newVersion, setNewVersion] = useState(mcVersions[0]?.id || "1.21.4");
  const [newLoader, setNewLoader] = useState<ModLoaderKind>("none"); // Spec default: None

  const primaryProfile = profiles[0];

  const submitNewProfile = async () => {
    const created: Profile = {
      id: `prof-${Date.now()}`,
      name: newName.trim() || `Minecraft ${newVersion}`,
      icon: "cube",
      banner_screenshot: null,
      mc_version: newVersion,
      loader: newLoader,
      loader_version: "latest", // Spec default: Latest
      auto_update_loader: true,
      allocated_ram_mb: 4096,
      fullscreen_override: null,
      sandbox_override: null,
      custom_jvm_args: [],
      created_at: new Date().toISOString(),
      last_played: null,
      total_playtime_secs: 0,
      linked_modpack_id: null,
    };
    await onCreateProfile(created);
    setCreating(false);
    setNewName("");
    setNewLoader("none");
  };

  return (
    <div className="space-y-6">
      {/* Start Screen Hero Card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={ELASTIC_SPRING}
        className="relative rounded-3xl bg-surface border border-border p-6 md:p-8 overflow-hidden"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-elevated border border-border text-[11px] font-mono text-muted">
              <ShieldCheck className="w-3.5 h-3.5 text-fg" />
              <span>TWILIGHT LAUNCHER v0.1.0 • RUST + TAURI v2</span>
            </div>

            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              Minimal. Isolated. Instant.
            </h1>

            <p className="text-xs md:text-sm text-muted leading-relaxed">
              Launch pure Vanilla or modded instances with OS-level filesystem confinement,
              native session token vaulting, built-in directory & config editing, and dual-mode
              Modrinth integration.
            </p>

            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              {primaryProfile && (
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.93 }}
                  transition={ELASTIC_SPRING}
                  onClick={() => onLaunchProfile(primaryProfile)}
                  className="inline-flex items-center gap-2.5 px-6 py-3 rounded-2xl bg-fg text-bg text-xs font-bold tracking-wide shadow-xl"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>
                    LAUNCH {primaryProfile.name.toUpperCase()} ({primaryProfile.mc_version})
                  </span>
                </motion.button>
              )}

              {/* Universal Modrinth Home Screen Button */}
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.94 }}
                transition={ELASTIC_SPRING}
                onClick={onOpenUniversalModrinth}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-elevated border border-border text-xs font-semibold hover:border-fg/50"
              >
                <Compass className="w-4 h-4" />
                <span>Open Modrinth</span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.94 }}
                transition={ELASTIC_SPRING}
                onClick={onOpenWardrobe}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-elevated border border-border text-xs font-medium text-muted hover:text-fg"
              >
                <User className="w-4 h-4" />
                <span>
                  {activeAccount
                    ? `${activeAccount.username} (${
                        activeAccount.account_type === "microsoft" ? "Premium" : "Offline"
                      })`
                    : "Accounts"}
                </span>
              </motion.button>
            </div>
          </div>

          {/* Quick Architecture Telemetry Card */}
          <div className="p-4 rounded-2xl bg-elevated/70 border border-border min-w-[240px] space-y-2.5 text-xs">
            <div className="font-mono text-[11px] text-muted uppercase">Active Defaults</div>
            <div className="flex items-center justify-between">
              <span className="text-muted">On Launch</span>
              <span className="font-mono font-semibold">Minimize</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Auto-Fullscreen</span>
              <span className="font-mono font-semibold">OFF</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Default Loader</span>
              <span className="font-mono font-semibold">None (Latest)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Command Palette</span>
              <kbd className="font-mono px-2 py-0.5 rounded bg-surface border border-border text-[10px]">
                Ctrl + K
              </kbd>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Profiles Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">
              Profiles ({profiles.length})
            </h2>
            <p className="text-xs text-muted">
              Each profile owns a completely standalone folder with its own File Explorer,
              Screenshots, Mods, and Configs.
            </p>
          </div>

          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.93 }}
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-fg text-bg text-xs font-semibold"
          >
            <Plus className="w-3.5 h-3.5" /> New Profile
          </motion.button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {profiles.map((prof) => (
            <motion.div
              key={prof.id}
              layout
              whileHover={{ y: -3 }}
              transition={ELASTIC_SPRING}
              onClick={() => onSelectProfile(prof, "overview")}
              className="cursor-pointer group rounded-2xl bg-surface border border-border p-4 flex flex-col justify-between gap-4 hover:border-fg/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-elevated border border-border flex items-center justify-center shrink-0">
                    {prof.loader === "none" ? (
                      <Layers className="w-4 h-4 text-fg" />
                    ) : (
                      <Sparkles className="w-4 h-4 text-fg" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold truncate">{prof.name}</h3>
                    <div className="text-[11px] font-mono text-muted">
                      MC {prof.mc_version} •{" "}
                      {prof.loader === "none"
                        ? "Vanilla"
                        : `${prof.loader} (${prof.loader_version})`}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/60">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectProfile(prof, "files");
                    }}
                    className="p-2 rounded-xl bg-elevated border border-border text-muted hover:text-fg"
                    title="Open In-Profile File Explorer"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectProfile(prof, "screenshots");
                    }}
                    className="p-2 rounded-xl bg-elevated border border-border text-muted hover:text-fg"
                    title="Profile Screenshots"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectProfile(prof, "modrinth");
                    }}
                    className="p-2 rounded-xl bg-elevated border border-border text-muted hover:text-fg"
                    title="Profile Modrinth"
                  >
                    <Compass className="w-3.5 h-3.5" />
                  </button>
                </div>

                <motion.button
                  type="button"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onLaunchProfile(prof);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-fg text-bg text-xs font-semibold"
                >
                  <Play className="w-3 h-3 fill-current" /> Play
                </motion.button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Create New Profile Elastic Modal */}
      <AnimatePresence>
        {creating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setCreating(false)}
            className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.93, opacity: 0, y: 8 }}
              transition={ELASTIC_SPRING}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl bg-surface border border-border p-5 space-y-4 shadow-2xl"
            >
              <div>
                <h3 className="text-sm font-semibold">Create New Isolated Profile</h3>
                <p className="text-xs text-muted">
                  Defaults to Mod Loader: None (Vanilla) & Latest loader build when enabled.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-muted">Profile Name</label>
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Survival 1.21.4"
                  className="w-full px-3.5 py-2 rounded-xl bg-elevated border border-border text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-muted">Minecraft Version</label>
                <select
                  value={newVersion}
                  onChange={(e) => setNewVersion(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-elevated border border-border text-xs font-mono"
                >
                  {mcVersions
                    .filter((v) => v.type === "release")
                    .slice(0, 40)
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.id}
                      </option>
                    ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-muted">Mod Loader (Default: None)</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {(["none", "fabric", "quilt", "neoforge", "forge"] as ModLoaderKind[]).map(
                    (l) => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => setNewLoader(l)}
                        className={`py-2 rounded-xl text-xs font-medium border capitalize ${
                          newLoader === l
                            ? "bg-fg text-bg border-fg"
                            : "bg-elevated border-border text-muted"
                        }`}
                      >
                        {l}
                      </button>
                    )
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="px-3.5 py-2 rounded-xl bg-elevated text-xs"
                >
                  Cancel
                </button>
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={submitNewProfile}
                  className="px-4 py-2 rounded-xl bg-fg text-bg text-xs font-semibold"
                >
                  Create Profile
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
