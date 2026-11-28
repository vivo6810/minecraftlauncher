import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  CheckCircle2,
  ClipboardCopy,
  Compass,
  FileCode,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  Image as ImageIcon,
  Play,
  RefreshCw,
  Save,
  Shield,
  ShieldAlert,
  Sliders,
  Stethoscope,
  Trash2,
  X,
} from "lucide-react";
import { LauncherBridge } from "../lib/bridge";
import {
  BOUNCE_SPRING,
  ELASTIC_SPRING,
  type CrashDiagnosis,
  type FileNode,
  type JarScanReport,
  type LoaderVersionOption,
  type MinecraftVersionEntry,
  type ModLoaderKind,
  type Profile,
  type ScreenshotItem,
} from "../types/launcher";
import { LiveLogs } from "./LiveLogs";
import { ModrinthBrowser } from "./ModrinthBrowser";

interface Props {
  profile: Profile;
  allProfiles: Profile[];
  logLines: readonly string[];
  initialTab?: string;
  mcVersions: MinecraftVersionEntry[];
  onBack: () => void;
  onLaunch: (profile: Profile) => void;
  onSaveProfile: (updated: Profile) => Promise<void>;
  onDeleteProfile: (profileId: string) => Promise<void>;
  onProfilesChanged: (profiles: Profile[], created?: Profile) => void;
  onToast: (msg: string) => void;
}

const TABS = [
  { id: "overview", label: "General", icon: Sliders },
  { id: "modrinth", label: "Modrinth", icon: Compass },
  { id: "logs", label: "Live Logs", icon: FileCode },
  { id: "files", label: "Files", icon: FolderOpen },
  { id: "screenshots", label: "Screenshots", icon: ImageIcon },
  { id: "shield", label: "Security", icon: Shield },
];

export const ProfileWorkspace: React.FC<Props> = ({
  profile,
  allProfiles,
  logLines,
  initialTab = "overview",
  mcVersions,
  onBack,
  onLaunch,
  onSaveProfile,
  onDeleteProfile,
  onProfilesChanged,
  onToast,
}) => {
  const [tab, setTab] = useState(initialTab);
  const [nameDraft, setNameDraft] = useState(profile.name);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [loaderOptions, setLoaderOptions] = useState<LoaderVersionOption[]>([]);

  const [currentDir, setCurrentDir] = useState("");
  const [entries, setEntries] = useState<FileNode[]>([]);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editingReadOnly, setEditingReadOnly] = useState(false);
  const [editingContent, setEditingContent] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([]);
  const [lightboxShot, setLightboxShot] = useState<ScreenshotItem | null>(null);

  const [jarReports, setJarReports] = useState<JarScanReport[]>([]);
  const [crashInput, setCrashInput] = useState("");
  const [diagnosis, setDiagnosis] = useState<CrashDiagnosis | null>(null);
  const prevProfileIdRef = useRef(profile.id);
  const submittedNameRef = useRef<string | null>(null);
  const diagSeqRef = useRef(0);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab, profile.id]);

  useEffect(() => {
    if (prevProfileIdRef.current !== profile.id) {
      prevProfileIdRef.current = profile.id;
      submittedNameRef.current = null;
      setNameDraft(profile.name);
      return;
    }
    setNameDraft((curr) => {
      if (submittedNameRef.current === null || curr === submittedNameRef.current) {
        return profile.name;
      }
      return curr;
    });
    if (submittedNameRef.current === profile.name) {
      submittedNameRef.current = null;
    }
  }, [profile.id, profile.name]);

  useEffect(() => {
    let active = true;
    LauncherBridge.fetchLoaderVersions(profile.loader, profile.mc_version)
      .then((opts) => {
        if (active) setLoaderOptions(opts);
      })
      .catch(() => {
        if (active) setLoaderOptions([]);
      });
    return () => {
      active = false;
    };
  }, [profile.loader, profile.mc_version]);

  const refreshDir = async (dir = currentDir) => {
    const list = await LauncherBridge.listDir(profile.id, dir);
    setEntries(list);
  };

  useEffect(() => {
    let current = true;
    const loadTab = async () => {
      try {
        if (tab === "files") {
          setEntries([]);
          const list = await LauncherBridge.listDir(profile.id, currentDir);
          if (current) setEntries(list);
        } else if (tab === "screenshots") {
          const list = await LauncherBridge.listProfileScreenshots(profile.id);
          if (current) setScreenshots(list);
        } else if (tab === "shield") {
          const reports = await LauncherBridge.scanProfileMods(profile.id);
          if (current) setJarReports(reports);
        }
      } catch (err) {
        if (current) onToast(String(err));
      }
    };
    void loadTab();
    return () => { current = false; };
  }, [tab, currentDir, profile.id]);

  const visibleVersions = mcVersions.filter(
    (v) => showSnapshots || v.type === "release"
  );

  const handleUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const b64 = String(reader.result || "");
        const scan = await LauncherBridge.uploadFile(
          profile.id,
          currentDir,
          file.name,
          b64
        );
        await refreshDir(currentDir);
        if (scan && !scan.safe) {
          onToast(`Flagged: ${file.name}`);
        } else {
          onToast(`Added ${file.name}`);
        }
      } catch (err) {
        onToast(String(err));
      }
    };
    reader.onerror = () => onToast(`Couldn't read ${file.name}`);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const openConfigEditor = async (node: FileNode, readOnly = false) => {
    try {
      const txt = await LauncherBridge.readConfigText(profile.id, node.relative_path);
      setEditingReadOnly(readOnly);
      setEditingPath(node.relative_path);
      setEditingContent(txt);
    } catch (err) {
      onToast(String(err));
    }
  };

  const saveConfigEditor = async () => {
    if (!editingPath || editingReadOnly) return;
    try {
      await LauncherBridge.writeConfigText(profile.id, editingPath, editingContent);
      onToast(`Saved ${editingPath}`);
      await refreshDir(currentDir);
    } catch (err) {
      onToast(String(err));
    }
  };

  const copyScreenshotToClipboard = async (shot: ScreenshotItem) => {
    try {
      const res = await fetch(shot.data_url);
      const blob = await res.blob();
      if (navigator.clipboard && "ClipboardItem" in window && blob.type === "image/png") {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      } else {
        await navigator.clipboard.writeText(shot.data_url);
      }
      onToast(`Copied ${shot.file_name}`);
    } catch {
      onToast(`Failed to copy ${shot.file_name}`);
    }
  };

  const commitNameDraft = () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setNameDraft(profile.name);
      return;
    }
    if (trimmed !== profile.name) {
      submittedNameRef.current = trimmed;
      setNameDraft(trimmed);
      void onSaveProfile({ ...profile, name: trimmed }).catch((err) => {
        submittedNameRef.current = null;
        onToast(String(err));
      });
    }
  };

  const applyCrashFix = async (code: string | null) => {
    if (!code) return;
    if (code === "bump_ram_2048") {
      await onSaveProfile({
        ...profile,
        allocated_ram_mb: Math.min(16384, profile.allocated_ram_mb + 2048),
      });
      onToast(`RAM set to ${Math.min(16384, profile.allocated_ram_mb + 2048)} MB`);
    } else if (code === "install_fabric_api") {
      await LauncherBridge.installModrinthToProfile(
        profile.id,
        "P7dR8mSH",
        "fabric-api",
        "mod"
      );
      onToast("Installed Fabric API");
    } else if (code === "open_mods_folder") {
      setCurrentDir("mods");
      setTab("files");
    }
  };

  return (
    <div className="space-y-5">
      {/* Profile Header */}
      <div
        className="relative rounded-2xl border border-border bg-surface p-5 overflow-hidden"
        style={
          profile.banner_screenshot
            ? {
                backgroundImage: `linear-gradient(to right, rgba(9,9,11,0.9), rgba(9,9,11,0.72)), url(${profile.banner_screenshot})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <motion.button
              type="button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92 }}
              onClick={onBack}
              className="p-2 rounded-xl bg-elevated border border-border"
            >
              <ArrowLeft className="w-4 h-4" />
            </motion.button>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-lg font-bold tracking-tight">{profile.name}</h1>
              <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-elevated border border-border text-muted">
                {profile.mc_version}
              </span>
              <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-elevated border border-border text-muted capitalize">
                {profile.loader === "none" ? "Vanilla" : profile.loader}
              </span>
            </div>
          </div>

          <motion.button
            type="button"
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.93 }}
            onClick={() => onLaunch(profile)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-accent-fg text-xs font-semibold"
          >
            <Play className="w-3.5 h-3.5 fill-current" /> Play
          </motion.button>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-4 pt-2">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-pressed={active}
                className={`relative px-3.5 py-2 rounded-xl text-xs font-medium flex items-center gap-2 transition-colors ${
                  active ? "text-fg" : "text-muted hover:text-fg"
                }`}
              >
                {active && (
                  <motion.div
                    layoutId="profileDetailSubtab"
                    transition={BOUNCE_SPRING}
                    className="absolute inset-0 bg-elevated rounded-xl"
                  />
                )}
                <Icon className="w-3.5 h-3.5 relative z-10" />
                <span className="relative z-10">{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div key={tab} className="launcher-tab-content">
      {tab === "logs" && <LiveLogs lines={logLines} onOpenFolder={() => {
        setCurrentDir("logs");
        setTab("files");
      }} />}
      {/* GENERAL */}
      {tab === "overview" && (
        <div className="max-w-3xl rounded-2xl bg-surface border border-border divide-y divide-border">
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-xs font-medium">Name</span>
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitNameDraft}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                }
              }}
              className="w-56 px-3 py-1.5 rounded-lg bg-elevated border border-border text-xs text-fg focus:outline-none focus:border-fg"
            />
          </div>

          <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium">Version</span>
              <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={showSnapshots}
                  onChange={(e) => setShowSnapshots(e.target.checked)}
                  className="accent-current"
                />
                Snapshots
              </label>
            </div>
            <select
              value={profile.mc_version}
              onChange={(e) =>
                void onSaveProfile({ ...profile, mc_version: e.target.value })
              }
              className="w-56 px-3 py-1.5 rounded-lg bg-elevated border border-border text-xs font-mono text-fg focus:outline-none"
            >
              {visibleVersions.slice(0, 80).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.id}
                </option>
              ))}
            </select>
          </div>

          <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-medium">Loader</span>
            <div className="inline-flex p-0.5 rounded-lg bg-elevated border border-border">
              {(["none", "fabric", "quilt", "neoforge", "forge"] as ModLoaderKind[]).map(
                (ldr) => (
                  <button
                    key={ldr}
                    type="button"
                    onClick={() =>
                      void onSaveProfile({
                        ...profile,
                        loader: ldr,
                        loader_version: "latest",
                      })
                    }
                    className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize ${
                      profile.loader === ldr
                        ? "bg-fg text-bg"
                        : "text-muted hover:text-fg"
                    }`}
                  >
                    {ldr === "none" ? "None" : ldr}
                  </button>
                )
              )}
            </div>
          </div>

          {profile.loader !== "none" && (
            <>
              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-xs font-medium">Loader Version</span>
                <select
                  value={profile.loader_version}
                  onChange={(e) =>
                    void onSaveProfile({
                      ...profile,
                      loader_version: e.target.value,
                      auto_update_loader:
                        e.target.value === "latest" ? true : profile.auto_update_loader,
                    })
                  }
                  className="w-56 px-3 py-1.5 rounded-lg bg-elevated border border-border text-xs font-mono"
                >
                  <option value="latest">latest</option>
                  {loaderOptions.map((opt) => (
                    <option key={opt.version} value={opt.version}>
                      {opt.version}
                    </option>
                  ))}
                </select>
              </div>

              <label className="px-4 py-3 flex items-center justify-between gap-3 cursor-pointer">
                <span className="text-xs font-medium">Auto-Update Loader</span>
                <input
                  type="checkbox"
                  checked={profile.auto_update_loader}
                  onChange={(e) =>
                    void onSaveProfile({
                      ...profile,
                      auto_update_loader: e.target.checked,
                    })
                  }
                  className="w-4 h-4 accent-current"
                />
              </label>
            </>
          )}

          <div className="px-4 py-3 flex items-center justify-between gap-4">
            <span className="text-xs font-medium">
              Memory ({profile.allocated_ram_mb} MB)
            </span>
            <input
              type="range"
              min={1024}
              max={16384}
              step={512}
              value={profile.allocated_ram_mb}
              onChange={(e) =>
                void onSaveProfile({
                  ...profile,
                  allocated_ram_mb: Number(e.target.value),
                })
              }
              className="w-56 accent-current"
            />
          </div>

          <div className="px-4 py-3 flex items-center justify-end">
            <button
              type="button"
              onClick={() => void onDeleteProfile(profile.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted hover:text-fg hover:bg-elevated"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Profile
            </button>
          </div>
        </div>
      )}

      {/* MODRINTH */}
      {tab === "modrinth" && (
        <ModrinthBrowser
          scopedProfile={profile}
          profiles={allProfiles}
          onProfilesChanged={onProfilesChanged}
          onToast={onToast}
        />
      )}

      {/* FILES */}
      {tab === "files" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div
            className={`${
              editingPath ? "lg:col-span-6" : "lg:col-span-12"
            } p-4 rounded-2xl bg-surface border border-border space-y-3`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setCurrentDir("")}
                  className="px-2.5 py-1 rounded-lg bg-elevated border border-border"
                >
                  /
                </button>
                {currentDir &&
                  currentDir.split("/").map((seg, idx, arr) => {
                    const sub = arr.slice(0, idx + 1).join("/");
                    return (
                      <React.Fragment key={sub}>
                        <span className="text-muted">/</span>
                        <button
                          type="button"
                          onClick={() => setCurrentDir(sub)}
                          className="px-2 py-1 rounded-lg bg-elevated border border-border"
                        >
                          {seg}
                        </button>
                      </React.Fragment>
                    );
                  })}
              </div>

              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleUploadFile}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-fg text-bg text-xs font-medium"
                >
                  <FilePlus className="w-3.5 h-3.5" /> Add File
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const folderName = window.prompt("Folder name:");
                    if (!folderName) return;
                    const target = currentDir ? `${currentDir}/${folderName}` : folderName;
                    await LauncherBridge.createDir(profile.id, target);
                    await refreshDir(currentDir);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-elevated border border-border text-xs"
                >
                  <FolderPlus className="w-3.5 h-3.5" /> New Folder
                </button>
              </div>
            </div>

            <div className="divide-y divide-border/60 border border-border rounded-xl overflow-hidden">
              {currentDir !== "" && (
                <button
                  type="button"
                  onClick={() => {
                    const parts = currentDir.split("/");
                    parts.pop();
                    setCurrentDir(parts.join("/"));
                  }}
                  className="w-full px-3.5 py-2.5 text-left text-xs text-muted hover:bg-elevated flex items-center gap-2"
                >
                  <Folder className="w-4 h-4" /> ..
                </button>
              )}

              {entries.length === 0 ? (
                <div className="py-10 text-center text-xs text-muted">Empty</div>
              ) : (
                entries.map((node) => (
                  <div
                    key={node.relative_path}
                    className="px-3.5 py-2.5 flex items-center justify-between gap-3 hover:bg-elevated/60 text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (node.is_dir) setCurrentDir(node.relative_path);
                        else if (node.editable_config) void openConfigEditor(node, false);
                        else if (node.readable_log) void openConfigEditor(node, true);
                      }}
                      className="flex items-center gap-2.5 min-w-0 text-left flex-1"
                    >
                      {node.is_dir ? (
                        <Folder className="w-4 h-4 text-fg shrink-0" />
                      ) : (
                        <FileCode className="w-4 h-4 text-muted shrink-0" />
                      )}
                      <span className="font-medium truncate">{node.name}</span>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {node.editable_config && (
                        <button
                          type="button"
                          onClick={() => void openConfigEditor(node, false)}
                          className="px-2.5 py-1 rounded-lg bg-elevated border border-border text-[11px]"
                        >
                          Edit
                        </button>
                      )}
                      {node.readable_log && (
                        <button
                          type="button"
                          onClick={() => void openConfigEditor(node, true)}
                          className="px-2.5 py-1 rounded-lg bg-elevated border border-border text-[11px]"
                        >
                          View
                        </button>
                      )}
                      {node.is_archive && (
                        <button
                          type="button"
                          onClick={async () => {
                            const count = await LauncherBridge.extractArchive(
                              profile.id,
                              node.relative_path
                            );
                            await refreshDir(currentDir);
                            onToast(`Extracted ${count} file(s)`);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-elevated border border-border text-[11px]"
                        >
                          <Archive className="w-3 h-3" /> Extract
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={`Delete ${node.name}`}
                        onClick={async () => {
                          await LauncherBridge.deleteEntry(profile.id, node.relative_path);
                          await refreshDir(currentDir);
                        }}
                        className="p-1 rounded-lg text-muted hover:text-fg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {editingPath && (
            <div className="lg:col-span-6 p-4 rounded-2xl bg-surface border border-border flex flex-col space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-mono font-semibold truncate">
                    {editingPath}
                  </span>
                  {editingReadOnly && (
                    <span className="shrink-0 rounded bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-muted">
                      Read-only
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!editingReadOnly && (
                    <button
                      type="button"
                      onClick={() => void saveConfigEditor()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-fg text-bg text-xs font-medium"
                    >
                      <Save className="w-3.5 h-3.5" /> Save
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="Close editor"
                    onClick={() => {
                      setEditingPath(null);
                      setEditingReadOnly(false);
                    }}
                    className="p-1.5 rounded-lg bg-elevated"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <textarea
                value={editingContent}
                readOnly={editingReadOnly}
                onChange={(e) => {
                  if (!editingReadOnly) setEditingContent(e.target.value);
                }}
                rows={14}
                className="w-full flex-1 font-mono text-xs p-3 rounded-xl bg-elevated border border-border text-fg focus:outline-none focus:border-fg"
              />
            </div>
          )}
        </div>
      )}

      {/* SCREENSHOTS (Full Original Color + Portaled Fullscreen Blur Lightbox) */}
      {tab === "screenshots" && (
        <div className="space-y-4">
          {screenshots.length === 0 ? (
            <div className="py-16 text-center text-xs text-muted rounded-2xl border border-dashed border-border">
              No screenshots
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {screenshots.map((shot) => (
                <div
                  key={shot.relative_path}
                  onClick={() => setLightboxShot(shot)}
                  className="cursor-pointer group rounded-2xl overflow-hidden bg-surface border border-border"
                >
                  <div className="aspect-video bg-elevated overflow-hidden">
                    <img
                      src={shot.data_url}
                      alt={shot.file_name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                  <div className="p-3 flex items-center justify-between text-xs">
                    <span className="font-mono truncate">{shot.file_name}</span>
                    <button
                      type="button"
                      aria-label="Copy screenshot"
                      onClick={(e) => {
                        e.stopPropagation();
                        void copyScreenshotToClipboard(shot);
                      }}
                      className="p-1.5 rounded-lg bg-elevated border border-border hover:bg-fg hover:text-bg"
                    >
                      <ClipboardCopy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {typeof document !== "undefined" &&
            createPortal(
              <AnimatePresence>
                {lightboxShot && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setLightboxShot(null)}
                    className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-md flex items-center justify-center p-6"
                  >
                    <motion.div
                      initial={{ scale: 0.92, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.94, opacity: 0 }}
                      transition={ELASTIC_SPRING}
                      onClick={(e) => e.stopPropagation()}
                      className="max-w-4xl w-full bg-surface border border-border rounded-2xl overflow-hidden shadow-2xl"
                    >
                      <img
                        src={lightboxShot.data_url}
                        alt={lightboxShot.file_name}
                        className="w-full max-h-[70vh] object-contain bg-black"
                      />
                      <div className="p-4 flex flex-wrap items-center justify-between gap-3">
                        <span className="font-mono text-xs">{lightboxShot.file_name}</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void copyScreenshotToClipboard(lightboxShot)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-fg text-bg text-xs font-medium"
                          >
                            <ClipboardCopy className="w-3.5 h-3.5" /> Copy
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await onSaveProfile({
                                ...profile,
                                banner_screenshot: lightboxShot.data_url,
                              });
                              onToast("Banner updated");
                              setLightboxShot(null);
                            }}
                            className="px-3.5 py-2 rounded-xl bg-elevated border border-border text-xs font-medium"
                          >
                            Set Banner
                          </button>
                          <button
                            type="button"
                            aria-label="Close"
                            onClick={() => setLightboxShot(null)}
                            className="p-2 rounded-xl bg-elevated"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>,
              document.body
            )}
        </div>
      )}

      {/* SECURITY & CRASH LOGS */}
      {tab === "shield" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-surface border border-border space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold flex items-center gap-2">
                <Shield className="w-4 h-4" /> Mod Scan
              </span>
              <button
                type="button"
                aria-label="Rescan mods"
                onClick={async () => {
                  setJarReports(await LauncherBridge.scanProfileMods(profile.id));
                }}
                className="p-1.5 rounded-lg bg-elevated border border-border"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {jarReports.length === 0 ? (
              <div className="p-4 rounded-xl bg-elevated text-xs text-muted">
                No mods found
              </div>
            ) : (
              <div className="space-y-2">
                {jarReports.map((rep) => (
                  <div
                    key={rep.file_name}
                    className="p-3 rounded-xl bg-elevated border border-border space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-medium flex items-center gap-2">
                        {rep.safe ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : (
                          <ShieldAlert className="w-4 h-4" />
                        )}
                        {rep.file_name}
                      </span>
                      <span className="font-mono text-[10px] text-muted">
                        {rep.scan_duration_ms}ms
                      </span>
                    </div>

                    {!rep.safe && (
                      <div className="space-y-1.5 pt-1 border-t border-border">
                        {rep.findings.map((f, idx) => (
                          <div
                            key={idx}
                            className="text-[11px] bg-surface p-2 rounded-lg border border-border"
                          >
                            <div className="font-semibold">
                              [{f.severity}] {f.category}
                            </div>
                            <div className="text-muted">{f.matched_indicator}</div>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={async () => {
                            await LauncherBridge.deleteEntry(
                              profile.id,
                              `mods/${rep.file_name}`
                            );
                            setJarReports(
                              await LauncherBridge.scanProfileMods(profile.id)
                            );
                            onToast(`Deleted ${rep.file_name}`);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-fg text-bg text-[11px] font-medium"
                        >
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 rounded-2xl bg-surface border border-border space-y-3">
            <span className="text-xs font-semibold flex items-center gap-2">
              <Stethoscope className="w-4 h-4" /> Crash Analyzer
            </span>
            <textarea
              value={crashInput}
              onChange={(e) => {
                const next = e.target.value;
                setCrashInput(next);
                const seq = ++diagSeqRef.current;
                if (!next.trim()) {
                  setDiagnosis(null);
                  return;
                }
                void LauncherBridge.diagnoseCrash(next)
                  .then((res) => {
                    if (diagSeqRef.current === seq) {
                      setDiagnosis(res);
                    }
                  })
                  .catch(() => {
                    if (diagSeqRef.current === seq) {
                      setDiagnosis(null);
                    }
                  });
              }}
              rows={5}
              placeholder="Paste crash log..."
              className="w-full font-mono text-[11px] p-3 rounded-xl bg-elevated border border-border text-fg focus:outline-none"
            />

            {diagnosis && (
              <div className="p-3.5 rounded-xl bg-elevated border border-border space-y-2 text-xs">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{diagnosis.title}</span>
                </div>
                <p className="text-muted">{diagnosis.suggested_fix}</p>
                {diagnosis.fix_action_code && (
                  <button
                    type="button"
                    onClick={() => void applyCrashFix(diagnosis.fix_action_code)}
                    className="px-3 py-1.5 rounded-lg bg-fg text-bg font-semibold text-xs"
                  >
                    Apply Fix
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
