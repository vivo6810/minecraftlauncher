import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Compass,
  FolderOpen,
  Image as ImageIcon,
  Layers,
  Play,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import {
  ELASTIC_SPRING,
  type MinecraftVersionEntry,
  type ModLoaderKind,
  type Profile,
} from "../types/launcher";

interface Props {
  profiles: Profile[];
  mcVersions: MinecraftVersionEntry[];
  versionsError?: string | null;
  loadingVersions?: boolean;
  onRetryVersions?: () => void;
  onLaunchProfile: (profile: Profile) => void;
  onSelectProfile: (profile: Profile, initialTab?: string) => void;
  onOpenUniversalModrinth: () => void;
  onCreateProfile: (p: Profile) => Promise<void>;
}

const LOADERS: { id: ModLoaderKind; label: string }[] = [
  { id: "none", label: "None" },
  { id: "fabric", label: "Fabric" },
  { id: "quilt", label: "Quilt" },
  { id: "neoforge", label: "NeoForge" },
  { id: "forge", label: "Forge" },
];

export const StartScreen: React.FC<Props> = ({
  profiles,
  mcVersions,
  versionsError,
  loadingVersions,
  onRetryVersions,
  onLaunchProfile,
  onSelectProfile,
  onOpenUniversalModrinth,
  onCreateProfile,
}) => {
  const releaseVersions = useMemo(
    () => mcVersions.filter((v) => v.type === "release").slice(0, 60),
    [mcVersions]
  );
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newVersion, setNewVersion] = useState(releaseVersions[0]?.id ?? "");
  const [newLoader, setNewLoader] = useState<ModLoaderKind>("none");

  useEffect(() => {
    if (
      releaseVersions.length > 0 &&
      (!newVersion || !releaseVersions.some((v) => v.id === newVersion))
    ) {
      setNewVersion(releaseVersions[0].id);
    }
  }, [releaseVersions, newVersion]);

  const canCreate =
    Boolean(newVersion) && releaseVersions.some((v) => v.id === newVersion);

  const submitNewProfile = async () => {
    if (!canCreate || submitting) return;
    setSubmitting(true);
    setCreateError(null);
    const created: Profile = {
      id: `prof-${Date.now()}`,
      name: newName.trim() || `Minecraft ${newVersion}`,
      icon: "cube",
      banner_screenshot: null,
      mc_version: newVersion,
      loader: newLoader,
      loader_version: "latest",
      auto_update_loader: true,
      allocated_ram_mb: 4096,
      fullscreen_override: null,
      custom_jvm_args: [],
      created_at: new Date().toISOString(),
      last_played: null,
      total_playtime_secs: 0,
      linked_modpack_id: null,
    };
    try {
      await onCreateProfile(created);
      setCreating(false);
      setNewName("");
      setNewLoader("none");
    } catch (err) {
      setCreateError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="launcher-heading text-3xl">Profiles</h1>

        <div className="flex items-center gap-2">
          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.94 }}
            transition={ELASTIC_SPRING}
            onClick={onOpenUniversalModrinth}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface border border-border text-xs font-medium hover:border-fg/40"
          >
            <Compass className="w-3.5 h-3.5" /> Modrinth
          </motion.button>

          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.94 }}
            transition={ELASTIC_SPRING}
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-fg text-bg text-xs font-semibold"
          >
            <Plus className="w-3.5 h-3.5" /> New Profile
          </motion.button>
        </div>
      </div>

      {profiles.length === 0 ? (
        <div className="rounded-2xl bg-surface py-20 px-6 flex flex-col items-center justify-center gap-4 text-center">
          <span className="text-sm font-medium text-muted">No profiles yet</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {profiles.map((prof) => (
            <motion.div
              key={prof.id}
              layout
              whileHover={{ y: -2 }}
              transition={ELASTIC_SPRING}
              onClick={() => onSelectProfile(prof, "overview")}
              className="cursor-pointer rounded-2xl bg-surface hover:bg-elevated p-4 flex flex-col justify-between gap-4 transition-colors"
            >
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
                    {prof.mc_version} •{" "}
                    {prof.loader === "none" ? "Vanilla" : prof.loader}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label="Files"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectProfile(prof, "files");
                    }}
                    className="p-2 rounded-xl bg-elevated border border-border text-muted hover:text-fg"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Screenshots"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectProfile(prof, "screenshots");
                    }}
                    className="p-2 rounded-xl bg-elevated border border-border text-muted hover:text-fg"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Modrinth"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectProfile(prof, "modrinth");
                    }}
                    className="p-2 rounded-xl bg-elevated border border-border text-muted hover:text-fg"
                  >
                    <Compass className="w-3.5 h-3.5" />
                  </button>
                </div>

                <motion.button
                  type="button"
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.93 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onLaunchProfile(prof);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-accent text-accent-fg text-xs font-semibold"
                >
                  <Play className="w-3.5 h-3.5 fill-current" /> Play
                </motion.button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {creating && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setCreating(false)}
                className="fixed inset-0 z-[100] bg-black/65 backdrop-blur-md flex items-center justify-center p-4"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.92, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94, y: 8 }}
                  transition={ELASTIC_SPRING}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full max-w-md bg-surface border border-border rounded-2xl p-5 shadow-2xl space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">New Profile</h3>
                    <button
                      type="button"
                      aria-label="Close"
                      onClick={() => setCreating(false)}
                      className="p-1 rounded-lg text-muted hover:text-fg"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs text-muted">Name</label>
                      <input
                        autoFocus
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder={`Minecraft ${newVersion}`}
                        className="w-full px-3.5 py-2 rounded-xl bg-elevated border border-border text-xs text-fg focus:outline-none focus:border-fg"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-xs text-muted">Version</label>
                        {(versionsError || releaseVersions.length === 0) &&
                          onRetryVersions && (
                            <button
                              type="button"
                              disabled={Boolean(loadingVersions)}
                              onClick={onRetryVersions}
                              className="text-[11px] font-medium text-fg underline disabled:opacity-50"
                            >
                              {loadingVersions ? "Loading..." : "Retry"}
                            </button>
                          )}
                      </div>
                      {versionsError && (
                        <div className="text-[11px] text-muted truncate">
                          Failed to load versions
                        </div>
                      )}
                      <select
                        value={newVersion}
                        disabled={releaseVersions.length === 0}
                        onChange={(e) => setNewVersion(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl bg-elevated border border-border text-xs font-mono text-fg focus:outline-none disabled:opacity-50"
                      >
                        {releaseVersions.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.id}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-muted">Loader</label>
                      <div className="grid grid-cols-5 gap-1.5">
                        {LOADERS.map((ldr) => (
                          <button
                            key={ldr.id}
                            type="button"
                            onClick={() => setNewLoader(ldr.id)}
                            className={`py-2 rounded-xl text-[11px] font-medium border transition-colors ${
                              newLoader === ldr.id
                                ? "bg-fg text-bg border-fg"
                                : "bg-elevated border-border text-muted hover:text-fg"
                            }`}
                          >
                            {ldr.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {createError && <p role="alert" className="text-xs text-fg">{createError}</p>}
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setCreating(false)}
                      className="px-3.5 py-2 rounded-xl text-xs bg-elevated text-muted hover:text-fg"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!canCreate || submitting}
                      onClick={() => void submitNewProfile()}
                      className="px-4 py-2 rounded-xl text-xs font-semibold bg-fg text-bg disabled:opacity-45"
                    >
                      Create
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
};
