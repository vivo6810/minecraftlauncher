import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  Download,
  Globe,
  Layers,
  Loader2,
  Package,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { LauncherBridge } from "../lib/bridge";
import {
  BOUNCE_SPRING,
  ELASTIC_SPRING,
  type DatapackInstallTarget,
  type ModLoaderKind,
  type ModrinthContentKind,
  type ModrinthSearchHit,
  type Profile,
} from "../types/launcher";

interface Props {
  /** If provided, Modrinth is locked to this specific profile (Entry Point A).
   *  If null, Modrinth runs in Universal Home Screen mode (Entry Point B). */
  scopedProfile: Profile | null;
  profiles: Profile[];
  onBack?: () => void;
  onProfilesChanged: (profiles: Profile[], newlyCreated?: Profile) => void;
  onToast: (msg: string) => void;
  onSetIsland: (status: string, progress: number, active: boolean) => void;
}

const CONTENT_TABS: { id: ModrinthContentKind; label: string }[] = [
  { id: "mod", label: "Mods" },
  { id: "modpack", label: "Modpacks" },
  { id: "resourcepack", label: "Resource Packs" },
  { id: "shader", label: "Shader Packs" },
  { id: "datapack", label: "Data Packs" },
];

export const ModrinthBrowser: React.FC<Props> = ({
  scopedProfile,
  profiles,
  onBack,
  onProfilesChanged,
  onToast,
  onSetIsland,
}) => {
  const [kind, setKind] = useState<ModrinthContentKind>("mod");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ModrinthSearchHit[]>([]);
  const [loading, setLoading] = useState(false);

  // Universal / Datapack target prompt state
  const [pendingItem, setPendingItem] = useState<ModrinthSearchHit | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [availableWorlds, setAvailableWorlds] = useState<string[]>([]);
  const [datapackMode, setDatapackMode] = useState<"all_worlds" | "specific">("all_worlds");
  const [chosenWorlds, setChosenWorlds] = useState<string[]>([]);
  const [newModpackName, setNewModpackName] = useState("");
  const [installingId, setInstallingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const mcVer = scopedProfile && kind !== "modpack" ? scopedProfile.mc_version : null;
        const ldr: ModLoaderKind | null =
          scopedProfile && kind === "mod" ? scopedProfile.loader : null;
        const results = await LauncherBridge.searchModrinth(query, kind, mcVer, ldr);
        if (!cancelled) setHits(results);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const timer = window.setTimeout(run, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, kind, scopedProfile]);

  const loadWorldsForProfile = async (profId: string) => {
    const worlds = await LauncherBridge.listProfileWorlds(profId);
    setAvailableWorlds(worlds);
    setChosenWorlds(worlds.slice(0, 1));
    setDatapackMode("all_worlds");
  };

  const handleClickInstall = async (hit: ModrinthSearchHit) => {
    // Case 1: Modpack ALWAYS creates a brand-new Profile
    if (kind === "modpack") {
      setPendingItem(hit);
      setNewModpackName(hit.title);
      return;
    }

    // Case 2: Opened inside a specific Profile (Entry Point A)
    if (scopedProfile) {
      if (kind === "datapack") {
        setPendingItem(hit);
        setSelectedProfileId(scopedProfile.id);
        await loadWorldsForProfile(scopedProfile.id);
        return;
      }
      await executeInstallToProfile(scopedProfile, hit);
      return;
    }

    // Case 3: Opened Universally from Home Screen (Entry Point B)
    setPendingItem(hit);
    const firstCompatible =
      profiles.find((p) => isProfileCompatible(p, hit, kind)) ?? profiles[0];
    if (firstCompatible) {
      setSelectedProfileId(firstCompatible.id);
      if (kind === "datapack") {
        await loadWorldsForProfile(firstCompatible.id);
      }
    } else {
      setSelectedProfileId("");
    }
  };

  const isProfileCompatible = (
    p: Profile,
    hit: ModrinthSearchHit,
    itemKind: ModrinthContentKind
  ): boolean => {
    const verOk = hit.versions.length === 0 || hit.versions.includes(p.mc_version);
    if (itemKind === "mod") {
      if (p.loader === "none") return false;
      const ldrOk =
        hit.categories.length === 0 || hit.categories.includes(p.loader);
      return verOk && ldrOk;
    }
    return verOk;
  };

  const executeInstallToProfile = async (
    targetProf: Profile,
    hit: ModrinthSearchHit,
    dpTarget?: DatapackInstallTarget
  ) => {
    setInstallingId(hit.project_id);
    onSetIsland(`Installing ${hit.title} → ${targetProf.name}...`, 0.45, true);
    try {
      const files = await LauncherBridge.installModrinthToProfile(
        targetProf.id,
        hit.project_id,
        hit.slug || hit.title,
        kind,
        dpTarget
      );
      onSetIsland(`Installed ${files[0] ?? hit.title}`, 1, false);
      onToast(
        kind === "datapack" && dpTarget?.mode === "all_worlds"
          ? `Staged & synced "${hit.title}" across all worlds in ${targetProf.name}`
          : `Installed "${hit.title}" into ${targetProf.name}`
      );
      setPendingItem(null);
    } catch (err) {
      onSetIsland("Install error", 1, false);
      onToast(String(err));
    } finally {
      setInstallingId(null);
    }
  };

  const handleConfirmModal = async () => {
    if (!pendingItem) return;

    if (kind === "modpack") {
      setInstallingId(pendingItem.project_id);
      onSetIsland(`Creating profile "${newModpackName}" from Modpack...`, 0.5, true);
      try {
        const created = await LauncherBridge.installModpackNewProfile(
          pendingItem.project_id,
          newModpackName.trim() || pendingItem.title
        );
        const state = await LauncherBridge.getState();
        onProfilesChanged(state.profiles, created);
        onSetIsland(`Modpack profile "${created.name}" ready`, 1, false);
        onToast(`Created new profile "${created.name}"`);
        setPendingItem(null);
      } finally {
        setInstallingId(null);
      }
      return;
    }

    const target = profiles.find((p) => p.id === selectedProfileId);
    if (!target) return;

    const dpTarget: DatapackInstallTarget | undefined =
      kind === "datapack"
        ? datapackMode === "all_worlds"
          ? { mode: "all_worlds" }
          : { mode: "specific_worlds", worlds: chosenWorlds }
        : undefined;

    await executeInstallToProfile(target, pendingItem, dpTarget);
  };

  const handleCreateQuickCompatibleProfile = async () => {
    if (!pendingItem) return;
    const mcVer = pendingItem.versions.find((v) => v.startsWith("1.")) || "1.21.4";
    const inferredLoader: ModLoaderKind =
      kind === "mod"
        ? (["fabric", "neoforge", "quilt", "forge"].find((l) =>
            pendingItem.categories.includes(l)
          ) as ModLoaderKind) || "fabric"
        : "none";

    const created: Profile = {
      id: `prof-${Date.now()}`,
      name: `${pendingItem.title} (${mcVer})`,
      icon: "sparkles",
      banner_screenshot: null,
      mc_version: mcVer,
      loader: inferredLoader,
      loader_version: "latest",
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
    const updated = await LauncherBridge.upsertProfile(created);
    onProfilesChanged(updated);
    setSelectedProfileId(created.id);
    if (kind === "datapack") {
      await loadWorldsForProfile(created.id);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {onBack && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92 }}
              onClick={onBack}
              className="p-2 rounded-xl bg-surface border border-border hover:bg-elevated"
            >
              <ArrowLeft className="w-4 h-4" />
            </motion.button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight">
                {scopedProfile ? `Modrinth • ${scopedProfile.name}` : "Universal Modrinth"}
              </h2>
              <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-elevated border border-border text-muted">
                {scopedProfile
                  ? `Locked: MC ${scopedProfile.mc_version} • ${
                      scopedProfile.loader === "none" ? "Vanilla" : scopedProfile.loader
                    }`
                  : "Global Mode • Prompts for Target Profile"}
              </span>
            </div>
            <p className="text-xs text-muted mt-0.5">
              {scopedProfile
                ? "Installs directly into this profile (Data Packs ask which world or All Worlds)."
                : "Browse all content freely — mods/packs/shaders/datapacks ask where to install; modpacks create a new profile."}
            </p>
          </div>
        </div>
      </div>

      {/* Category Tabs + Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex p-1 rounded-2xl bg-surface border border-border gap-1">
          {CONTENT_TABS.map((tab) => {
            const active = kind === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setKind(tab.id)}
                className={`relative px-3.5 py-1.5 text-xs font-medium rounded-xl transition-colors ${
                  active ? "text-bg" : "text-muted hover:text-fg"
                }`}
              >
                {active && (
                  <motion.div
                    layoutId={scopedProfile ? "modrinthTabScoped" : "modrinthTabGlobal"}
                    transition={BOUNCE_SPRING}
                    className="absolute inset-0 bg-fg rounded-xl"
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="relative flex-1 min-w-[240px] max-w-sm">
          <Search className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${kind}s on Modrinth...`}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-surface border border-border text-fg placeholder:text-muted focus:outline-none focus:border-fg"
          />
        </div>
      </div>

      {scopedProfile && scopedProfile.loader === "none" && kind === "mod" && (
        <div className="p-3.5 rounded-2xl bg-elevated border border-border text-xs flex items-center justify-between">
          <span>
            This profile currently has Mod Loader set to <strong>None (Vanilla)</strong>. Switch
            this profile to Fabric, Quilt, NeoForge, or Forge to load `.jar` mods.
          </span>
        </div>
      )}

      {/* Results Grid */}
      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center gap-2 text-muted">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-xs">Querying Modrinth v2 catalog...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {hits.map((hit) => (
            <motion.div
              key={hit.project_id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ y: -2 }}
              transition={ELASTIC_SPRING}
              className="p-4 rounded-2xl bg-surface border border-border flex items-start justify-between gap-4"
            >
              <div className="flex items-start gap-3.5 min-w-0">
                {hit.icon_url ? (
                  <img
                    src={hit.icon_url}
                    alt={hit.title}
                    className="w-11 h-11 rounded-xl object-cover bg-elevated border border-border shrink-0 grayscale contrast-125"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-xl bg-elevated border border-border flex items-center justify-center shrink-0">
                    <Package className="w-5 h-5 text-muted" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold truncate">{hit.title}</h3>
                    <span className="text-[10px] font-mono text-muted shrink-0">
                      by {hit.author}
                    </span>
                  </div>
                  <p className="text-xs text-muted line-clamp-2 mt-1">{hit.description}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-elevated text-muted">
                      {(hit.downloads / 1_000_000).toFixed(1)}M dl
                    </span>
                    {hit.categories.slice(0, 3).map((cat) => (
                      <span
                        key={cat}
                        className="text-[10px] px-2 py-0.5 rounded bg-elevated border border-border/60 text-muted"
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <motion.button
                type="button"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.92 }}
                disabled={installingId === hit.project_id}
                onClick={() => handleClickInstall(hit)}
                className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-fg text-bg text-xs font-medium disabled:opacity-50"
              >
                {installingId === hit.project_id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span>{kind === "modpack" ? "Create Profile" : "Install"}</span>
              </motion.button>
            </motion.div>
          ))}
        </div>
      )}

      {/* Elastic Target Profile / Modpack / 2-Step Datapack Modal */}
      <AnimatePresence>
        {pendingItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPendingItem(null)}
            className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.9, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 10 }}
              transition={ELASTIC_SPRING}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-surface border border-border rounded-2xl p-5 shadow-2xl space-y-4"
            >
              {kind === "modpack" ? (
                <>
                  <div className="flex items-center gap-2.5">
                    <Layers className="w-5 h-5" />
                    <div>
                      <h3 className="text-sm font-semibold">Create New Modpack Profile</h3>
                      <p className="text-xs text-muted">
                        Unpacks `{pendingItem.title}` into an isolated standalone profile.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted">New Profile Name</label>
                    <input
                      value={newModpackName}
                      onChange={(e) => setNewModpackName(e.target.value)}
                      className="w-full px-3.5 py-2 text-xs rounded-xl bg-elevated border border-border text-fg focus:outline-none focus:border-fg"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <h3 className="text-sm font-semibold">
                      Install "{pendingItem.title}"
                    </h3>
                    <p className="text-xs text-muted mt-0.5">
                      {scopedProfile
                        ? `Choose how this Data Pack applies inside ${scopedProfile.name}.`
                        : "Select which profile should receive this content."}
                    </p>
                  </div>

                  {/* Step 1: Target Profile Picker (shown in Universal Mode) */}
                  {!scopedProfile && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-muted">
                          1. Target Profile
                        </label>
                        <button
                          type="button"
                          onClick={handleCreateQuickCompatibleProfile}
                          className="inline-flex items-center gap-1 text-[11px] font-medium hover:underline"
                        >
                          <Plus className="w-3 h-3" /> New Compatible Profile
                        </button>
                      </div>
                      <div className="max-h-44 overflow-y-auto space-y-1.5">
                        {profiles.map((p) => {
                          const compat = isProfileCompatible(p, pendingItem, kind);
                          const selected = p.id === selectedProfileId;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={async () => {
                                setSelectedProfileId(p.id);
                                if (kind === "datapack") {
                                  await loadWorldsForProfile(p.id);
                                }
                              }}
                              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-left text-xs transition-all ${
                                selected
                                  ? "bg-fg text-bg border-fg"
                                  : "bg-elevated/60 border-border hover:border-fg/40"
                              }`}
                            >
                              <div>
                                <div className="font-medium">{p.name}</div>
                                <div
                                  className={`text-[11px] font-mono ${
                                    selected ? "text-bg/75" : "text-muted"
                                  }`}
                                >
                                  MC {p.mc_version} •{" "}
                                  {p.loader === "none" ? "Vanilla" : p.loader}
                                </div>
                              </div>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                                  compat
                                    ? selected
                                      ? "bg-bg/20 text-bg"
                                      : "bg-surface text-fg border border-border"
                                    : "opacity-55"
                                }`}
                              >
                                {compat ? "Compatible" : "Mismatch"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Step 2: Data Pack World / All-Worlds Selector */}
                  {kind === "datapack" && selectedProfileId && (
                    <motion.div
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-2.5 pt-2 border-t border-border"
                    >
                      <label className="text-xs font-medium text-muted flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5" />
                        {scopedProfile ? "Target Worlds" : "2. Target Worlds in Profile"}
                      </label>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setDatapackMode("all_worlds")}
                          className={`p-2.5 rounded-xl border text-left text-xs ${
                            datapackMode === "all_worlds"
                              ? "bg-fg text-bg border-fg"
                              : "bg-elevated border-border"
                          }`}
                        >
                          <div className="font-semibold flex items-center gap-1">
                            <Sparkles className="w-3.5 h-3.5" /> All Worlds
                          </div>
                          <div className="text-[10px] opacity-80 mt-0.5">
                            Syncs to existing + future worlds
                          </div>
                        </button>

                        <button
                          type="button"
                          disabled={availableWorlds.length === 0}
                          onClick={() => setDatapackMode("specific")}
                          className={`p-2.5 rounded-xl border text-left text-xs disabled:opacity-40 ${
                            datapackMode === "specific"
                              ? "bg-fg text-bg border-fg"
                              : "bg-elevated border-border"
                          }`}
                        >
                          <div className="font-semibold">Specific World(s)</div>
                          <div className="text-[10px] opacity-80 mt-0.5">
                            {availableWorlds.length} world(s) found
                          </div>
                        </button>
                      </div>

                      {datapackMode === "specific" && availableWorlds.length > 0 && (
                        <div className="space-y-1 max-h-28 overflow-y-auto pt-1">
                          {availableWorlds.map((w) => {
                            const checked = chosenWorlds.includes(w);
                            return (
                              <button
                                key={w}
                                type="button"
                                onClick={() =>
                                  setChosenWorlds((prev) =>
                                    prev.includes(w)
                                      ? prev.filter((x) => x !== w)
                                      : [...prev, w]
                                  )
                                }
                                className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg bg-elevated text-xs"
                              >
                                <span>{w}</span>
                                {checked && <Check className="w-3.5 h-3.5" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </motion.div>
                  )}
                </>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPendingItem(null)}
                  className="px-3.5 py-2 rounded-xl text-xs bg-elevated hover:opacity-85"
                >
                  Cancel
                </button>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.94 }}
                  onClick={handleConfirmModal}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-fg text-bg"
                >
                  {kind === "modpack" ? "Create & Install" : "Confirm Install"}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
