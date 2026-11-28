import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Globe,
  Layers,
  Loader2,
  Package,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { LauncherBridge, MODRINTH_PAGE_SIZE } from "../lib/bridge";
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
  scopedProfile: Profile | null;
  profiles: Profile[];
  onBack?: () => void;
  onProfilesChanged: (profiles: Profile[], newlyCreated?: Profile) => void;
  onToast: (msg: string) => void;
}

const CONTENT_TABS: { id: ModrinthContentKind; label: string }[] = [
  { id: "mod", label: "Mods" },
  { id: "modpack", label: "Modpacks" },
  { id: "resourcepack", label: "Resource Packs" },
  { id: "shader", label: "Shaders" },
  { id: "datapack", label: "Data Packs" },
];

export const ModrinthBrowser: React.FC<Props> = ({
  scopedProfile,
  profiles,
  onBack,
  onProfilesChanged,
  onToast,
}) => {
  const [kind, setKind] = useState<ModrinthContentKind>("mod");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [totalHits, setTotalHits] = useState(0);
  const resultsTop = useRef<HTMLDivElement>(null);
  const [hits, setHits] = useState<ModrinthSearchHit[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchError, setSearchError] = useState<string | null>(null);
  const worldRequest = useRef(0);

  const [pendingItem, setPendingItem] = useState<ModrinthSearchHit | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [availableWorlds, setAvailableWorlds] = useState<string[]>([]);
  const [datapackMode, setDatapackMode] = useState<"all_worlds" | "specific">("all_worlds");
  const [chosenWorlds, setChosenWorlds] = useState<string[]>([]);
  const [newModpackName, setNewModpackName] = useState("");
  const [installingId, setInstallingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSearchError(null);
    const run = async () => {
      try {
        const mcVer = scopedProfile && kind !== "modpack" ? scopedProfile.mc_version : null;
        const ldr: ModLoaderKind | null =
          scopedProfile && kind === "mod" ? scopedProfile.loader : null;
        const results = await LauncherBridge.searchModrinth(query, kind, mcVer, ldr, page * MODRINTH_PAGE_SIZE);
        if (cancelled) return;
        setHits(results.hits);
        setTotalHits(results.total_hits);
        const lastPage = Math.max(0, Math.ceil(results.total_hits / MODRINTH_PAGE_SIZE) - 1);
        if (page > lastPage) setPage(lastPage);
      } catch (err) {
        if (!cancelled) {
          setHits([]);
          setSearchError(String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const timer = window.setTimeout(run, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, kind, page, scopedProfile]);

  const loadWorldsForProfile = async (profId: string) => {
    const request = ++worldRequest.current;
    setAvailableWorlds([]);
    setChosenWorlds([]);
    setDatapackMode("all_worlds");
    try {
      const worlds = await LauncherBridge.listProfileWorlds(profId);
      if (worldRequest.current !== request) return;
      setAvailableWorlds(worlds);
      setChosenWorlds(worlds.slice(0, 1));
    } catch (err) {
      if (worldRequest.current === request) onToast(String(err));
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

  const handleClickInstall = async (hit: ModrinthSearchHit) => {
    if (kind === "modpack") {
      setPendingItem(hit);
      setNewModpackName(hit.title);
      return;
    }

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

  const executeInstallToProfile = async (
    targetProf: Profile,
    hit: ModrinthSearchHit,
    dpTarget?: DatapackInstallTarget
  ) => {
    setInstallingId(hit.project_id);
    try {
      await LauncherBridge.installModrinthToProfile(
        targetProf.id,
        hit.project_id,
        hit.slug || hit.title,
        kind,
        dpTarget
      );
      onToast(`Installed ${hit.title} → ${targetProf.name}`);
      setPendingItem(null);
    } catch (err) {
      onToast(String(err));
    } finally {
      setInstallingId(null);
    }
  };

  const handleConfirmModal = async () => {
    if (!pendingItem) return;

    if (kind === "modpack") {
      setInstallingId(pendingItem.project_id);
      try {
        const created = await LauncherBridge.installModpackNewProfile(
          pendingItem.project_id,
          newModpackName.trim() || pendingItem.title
        );
        const state = await LauncherBridge.getState();
        onProfilesChanged(state.profiles, created);
        onToast(`Created ${created.name}`);
        setPendingItem(null);
      } catch (err) {
        onToast(String(err));
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
    const mcVer = pendingItem.versions.find((v) => /^\d+\.\d+(?:\.\d+)?$/.test(v)) ??
      pendingItem.versions[0] ?? "26.3";
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
    try {
      const updated = await LauncherBridge.upsertProfile(created);
      onProfilesChanged(updated);
      setSelectedProfileId(created.id);
      if (kind === "datapack") await loadWorldsForProfile(created.id);
    } catch (err) {
      onToast(String(err));
    }
  };

  const pageCount = Math.max(1, Math.ceil(totalHits / MODRINTH_PAGE_SIZE));
  const changePage = (next: number) => {
    setLoading(true);
    setPage(next);
    resultsTop.current?.scrollIntoView({ block: "nearest" });
  };
  const pagination = (label: string) => (
    <nav aria-label={label} className="flex w-full items-center justify-between gap-1.5 text-xs sm:w-fit sm:gap-3">
      <button type="button" aria-label="Previous page" disabled={loading || page === 0}
        onClick={() => changePage(page - 1)} className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-elevated px-2 disabled:opacity-40 sm:px-3">
        <ChevronLeft size={14} aria-hidden="true" /> Prev
      </button>
      <span aria-live="polite" className="text-center tabular-nums text-muted">Page {page + 1} of {pageCount}</span>
      <button type="button" aria-label="Next page" disabled={loading || page + 1 >= pageCount}
        onClick={() => changePage(page + 1)} className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-elevated px-2 disabled:opacity-40 sm:px-3">
        Next <ChevronRight size={14} aria-hidden="true" />
      </button>
    </nav>
  );

  return (
    <div className="space-y-5">
      {/* Header: ONLY "Modrinth" */}
      <div className="flex items-center gap-3">
        {onBack && (
          <motion.button
            type="button"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.92 }}
            onClick={onBack}
            className="p-2 rounded-xl bg-surface border border-border hover:bg-elevated"
          >
            <ArrowLeft className="w-4 h-4" />
          </motion.button>
        )}
        <h2 className="launcher-heading text-3xl">Modrinth</h2>
      </div>

      {/* Category Tabs + Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex max-w-full flex-wrap gap-1 rounded-2xl bg-surface p-1">
          {CONTENT_TABS.map((tab) => {
            const active = kind === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  if (active) return;
                  setLoading(true);
                  setPage(0);
                  setTotalHits(0);
                  setKind(tab.id);
                }}
                aria-pressed={active}
                className={`relative px-3.5 py-1.5 text-xs font-medium rounded-xl transition-colors ${
                  active ? "text-fg" : "text-muted hover:text-fg"
                }`}
              >
                {active && (
                  <motion.div
                    layoutId={scopedProfile ? "modrinthTabScoped" : "modrinthTabGlobal"}
                    transition={BOUNCE_SPRING}
                    className="absolute inset-0 bg-elevated rounded-xl"
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:flex-1 sm:min-w-[220px] sm:max-w-sm">
          <Search className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => {
              setLoading(true);
              setPage(0);
              setTotalHits(0);
              setQuery(e.target.value);
            }}
            placeholder="Search..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-surface border border-border text-fg placeholder:text-muted focus:outline-none focus:border-fg"
          />
        </div>
      </div>

      <div ref={resultsTop}>
        {pageCount > 1 && pagination("Modrinth result pages")}
      </div>

      {/* Results Grid (Original Colorful Icons Preserved) */}
      {loading ? (
        <div className="py-16 flex items-center justify-center text-muted">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : searchError ? (
        <p role="alert" className="rounded-2xl border border-border bg-surface p-4 text-sm">
          Modrinth search failed. {searchError}
        </p>
      ) : hits.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">No results found.</p>
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
              className="p-4 rounded-2xl bg-surface hover:bg-elevated flex items-start justify-between gap-4"
            >
              <div className="flex items-start gap-3.5 min-w-0">
                {hit.icon_url ? (
                  <img
                    src={hit.icon_url}
                    alt={hit.title}
                    className="w-11 h-11 rounded-xl object-cover bg-elevated border border-border shrink-0"
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
                      {hit.author}
                    </span>
                  </div>
                  <p className="text-xs text-muted line-clamp-2 mt-1">{hit.description}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-elevated text-muted">
                      {(hit.downloads / 1_000_000).toFixed(1)}M
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
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.93 }}
                disabled={installingId === hit.project_id}
                onClick={() => void handleClickInstall(hit)}
                className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-fg text-bg text-xs font-medium disabled:opacity-50"
              >
                {installingId === hit.project_id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span>Install</span>
              </motion.button>
            </motion.div>
          ))}
        </div>
      )}

      {!loading && hits.length > 0 && pageCount > 1 && pagination("Modrinth result pages bottom")}

      {/* Full-Viewport Portal Modal with Full-Screen Blur */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {pendingItem && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setPendingItem(null)}
                className="fixed inset-0 z-[100] bg-black/65 backdrop-blur-md flex items-center justify-center p-4"
              >
                <motion.div
                  layout
                  initial={{ opacity: 0, scale: 0.92, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94, y: 8 }}
                  transition={ELASTIC_SPRING}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full max-w-md bg-surface border border-border rounded-2xl p-5 shadow-2xl space-y-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {pendingItem.icon_url ? (
                        <img
                          src={pendingItem.icon_url}
                          alt={pendingItem.title}
                          className="w-8 h-8 rounded-lg object-cover shrink-0"
                        />
                      ) : (
                        <Layers className="w-4 h-4 shrink-0" />
                      )}
                      <h3 className="text-sm font-semibold truncate">
                        {pendingItem.title}
                      </h3>
                    </div>
                    <button
                      type="button"
                      aria-label="Close"
                      onClick={() => setPendingItem(null)}
                      className="p-1 rounded-lg text-muted hover:text-fg"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {kind === "modpack" ? (
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted">Profile Name</label>
                      <input
                        autoFocus
                        value={newModpackName}
                        onChange={(e) => setNewModpackName(e.target.value)}
                        className="w-full px-3.5 py-2 text-xs rounded-xl bg-elevated border border-border text-fg focus:outline-none focus:border-fg"
                      />
                    </div>
                  ) : (
                    <>
                      {!scopedProfile && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-xs text-muted">Profile</label>
                            <button
                              type="button"
                              onClick={() => void handleCreateQuickCompatibleProfile()}
                              className="inline-flex items-center gap-1 text-[11px] font-medium hover:underline"
                            >
                              <Plus className="w-3 h-3" /> New Profile
                            </button>
                          </div>

                          {profiles.length === 0 ? (
                            <div className="p-3 rounded-xl bg-elevated border border-border text-xs text-muted flex items-center justify-between">
                              <span>No profiles</span>
                              <button
                                type="button"
                                onClick={() => void handleCreateQuickCompatibleProfile()}
                                className="px-2.5 py-1 rounded-lg bg-fg text-bg text-[11px] font-semibold"
                              >
                                Create Profile
                              </button>
                            </div>
                          ) : (
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
                                        {p.mc_version} •{" "}
                                        {p.loader === "none" ? "Vanilla" : p.loader}
                                      </div>
                                    </div>
                                    {!compat && (
                                      <span className="text-[10px] font-mono opacity-65">
                                        Mismatch
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {kind === "datapack" && selectedProfileId && (
                        <div className="space-y-2 pt-2 border-t border-border">
                          <label className="text-xs text-muted flex items-center gap-1.5">
                            <Globe className="w-3.5 h-3.5" /> Worlds
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
                              <div className="font-semibold">
                                Specific ({availableWorlds.length})
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
                        </div>
                      )}
                    </>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setPendingItem(null)}
                      className="px-3.5 py-2 rounded-xl text-xs bg-elevated text-muted hover:text-fg"
                    >
                      Cancel
                    </button>
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.94 }}
                      disabled={
                        Boolean(installingId) ||
                        (kind !== "modpack" && !selectedProfileId)
                      }
                      onClick={() => void handleConfirmModal()}
                      className="px-4 py-2 rounded-xl text-xs font-semibold bg-fg text-bg disabled:opacity-45"
                    >
                      Install
                    </motion.button>
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
