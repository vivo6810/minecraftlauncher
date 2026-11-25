import React, { useEffect, useRef, useState } from "react";
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
import { ModrinthBrowser } from "./ModrinthBrowser";

interface Props {
  profile: Profile;
  allProfiles: Profile[];
  initialTab?: string;
  mcVersions: MinecraftVersionEntry[];
  onBack: () => void;
  onLaunch: (profile: Profile) => void;
  onSaveProfile: (updated: Profile) => Promise<void>;
  onDeleteProfile: (profileId: string) => Promise<void>;
  onProfilesChanged: (profiles: Profile[], created?: Profile) => void;
  onToast: (msg: string) => void;
  onSetIsland: (status: string, progress: number, active: boolean) => void;
}

const TABS = [
  { id: "overview", label: "Version & Loader", icon: Sliders },
  { id: "modrinth", label: "Modrinth", icon: Compass },
  { id: "files", label: "File Explorer", icon: FolderOpen },
  { id: "screenshots", label: "Screenshots", icon: ImageIcon },
  { id: "shield", label: "Shield & Crash Doctor", icon: Shield },
];

export const ProfileWorkspace: React.FC<Props> = ({
  profile,
  allProfiles,
  initialTab = "overview",
  mcVersions,
  onBack,
  onLaunch,
  onSaveProfile,
  onDeleteProfile,
  onProfilesChanged,
  onToast,
  onSetIsland,
}) => {
  const [tab, setTab] = useState(initialTab);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [loaderOptions, setLoaderOptions] = useState<LoaderVersionOption[]>([]);

  // File Explorer & Config Editor state
  const [currentDir, setCurrentDir] = useState("");
  const [entries, setEntries] = useState<FileNode[]>([]);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Screenshots Lightbox state
  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([]);
  const [lightboxShot, setLightboxShot] = useState<ScreenshotItem | null>(null);

  // Shield & Crash Doctor state
  const [jarReports, setJarReports] = useState<JarScanReport[]>([]);
  const [crashInput, setCrashInput] = useState(
    "[21:14:09] [main/ERROR]: Uncaught exception in thread \"main\"\njava.lang.RuntimeException: Mod sodium requires fabric-api 0.110.0 or later (missing)\n  at net.fabricmc.loader.impl.FabricLoaderImpl.load(FabricLoaderImpl.java:192)"
  );
  const [diagnosis, setDiagnosis] = useState<CrashDiagnosis | null>(null);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab, profile.id]);

  useEffect(() => {
    let active = true;
    LauncherBridge.fetchLoaderVersions(profile.loader, profile.mc_version).then((opts) => {
      if (active) setLoaderOptions(opts);
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
    if (tab === "files") {
      refreshDir(currentDir);
    } else if (tab === "screenshots") {
      LauncherBridge.listProfileScreenshots(profile.id).then(setScreenshots);
    } else if (tab === "shield") {
      LauncherBridge.scanProfileMods(profile.id).then(setJarReports);
      LauncherBridge.diagnoseCrash(crashInput).then(setDiagnosis);
    }
  }, [tab, currentDir, profile.id]);

  const visibleVersions = mcVersions.filter(
    (v) => showSnapshots || v.type === "release"
  );

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const b64 = String(reader.result || "");
      const scan = await LauncherBridge.uploadFile(
        profile.id,
        currentDir,
        file.name,
        b64
      );
      await refreshDir(currentDir);
      if (scan && !scan.safe) {
        onToast(`Twilight Shield Alert: "${file.name}" flagged for suspicious bytecode!`);
      } else {
        onToast(`Added "${file.name}" to /${currentDir || "root"}`);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const openConfigEditor = async (node: FileNode) => {
    const txt = await LauncherBridge.readConfigText(profile.id, node.relative_path);
    setEditingPath(node.relative_path);
    setEditingContent(txt);
  };

  const saveConfigEditor = async () => {
    if (!editingPath) return;
    await LauncherBridge.writeConfigText(profile.id, editingPath, editingContent);
    onToast(`Saved ${editingPath}`);
    await refreshDir(currentDir);
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
      onToast(`Copied ${shot.file_name} to clipboard`);
    } catch {
      onToast(`Copied screenshot reference (${shot.file_name})`);
    }
  };

  const applyCrashFix = async (code: string | null) => {
    if (!code) return;
    if (code === "bump_ram_2048") {
      await onSaveProfile({
        ...profile,
        allocated_ram_mb: Math.min(16384, profile.allocated_ram_mb + 2048),
      });
      onToast(`Increased ${profile.name} RAM to ${profile.allocated_ram_mb + 2048} MB`);
    } else if (code === "install_fabric_api") {
      await LauncherBridge.installModrinthToProfile(
        profile.id,
        "P7dR8mSH",
        "fabric-api",
        "mod"
      );
      onToast(`Installed Fabric API into ${profile.name}/mods`);
    } else if (code === "open_mods_folder") {
      setCurrentDir("mods");
      setTab("files");
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Profile Banner */}
      <div
        className="relative rounded-3xl border border-border bg-surface p-5 overflow-hidden"
        style={
          profile.banner_screenshot
            ? {
                backgroundImage: `linear-gradient(to right, rgba(9,9,11,0.92), rgba(9,9,11,0.72)), url(${profile.banner_screenshot})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <motion.button
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.92 }}
              onClick={onBack}
              className="p-2.5 rounded-xl bg-elevated border border-border"
            >
              <ArrowLeft className="w-4 h-4" />
            </motion.button>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold tracking-tight">{profile.name}</h1>
                <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-elevated border border-border text-muted">
                  MC {profile.mc_version}
                </span>
                <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-elevated border border-border text-muted uppercase">
                  {profile.loader === "none"
                    ? "Vanilla"
                    : `${profile.loader} • ${profile.loader_version}`}
                </span>
              </div>
              <p className="text-xs text-muted mt-1">
                Isolated Directory: <code className="font-mono">instances/{profile.id}/</code> •{" "}
                {profile.allocated_ram_mb} MB RAM
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.94 }}
              onClick={() => setTab("screenshots")}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-elevated border border-border text-xs font-medium"
            >
              <ImageIcon className="w-3.5 h-3.5" /> Screenshots
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.93 }}
              onClick={() => onLaunch(profile)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-fg text-bg text-xs font-semibold shadow-lg"
            >
              <Play className="w-3.5 h-3.5 fill-current" /> Launch Profile
            </motion.button>
          </div>
        </div>

        {/* Elastic Sub-navigation */}
        <div className="flex flex-wrap gap-1.5 mt-5 pt-4 border-t border-border/70">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`relative px-3.5 py-2 rounded-xl text-xs font-medium flex items-center gap-2 transition-colors ${
                  active ? "text-bg" : "text-muted hover:text-fg"
                }`}
              >
                {active && (
                  <motion.div
                    layoutId="profileDetailSubtab"
                    transition={BOUNCE_SPRING}
                    className="absolute inset-0 bg-fg rounded-xl"
                  />
                )}
                <Icon className="w-3.5 h-3.5 relative z-10" />
                <span className="relative z-10">{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: VERSION SWITCHER & MODLOADER CONFIGURATION */}
      {tab === "overview" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={ELASTIC_SPRING}
          className="grid grid-cols-1 lg:grid-cols-2 gap-4"
        >
          <div className="p-5 rounded-2xl bg-surface border border-border space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Live Version Switcher</h3>
                <p className="text-xs text-muted">
                  Synced directly with Mojang's live manifest — new releases appear automatically.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={showSnapshots}
                  onChange={(e) => setShowSnapshots(e.target.checked)}
                  className="accent-current"
                />
                Snapshots
              </label>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted">Minecraft Version</label>
              <select
                value={profile.mc_version}
                onChange={(e) => {
                  const nextVer = e.target.value;
                  onSaveProfile({ ...profile, mc_version: nextVer });
                  if (profile.loader !== "none") {
                    onToast(
                      `Switched to MC ${nextVer} — remember to update mods via the Modrinth tab if needed.`
                    );
                  }
                }}
                className="w-full px-3.5 py-2.5 rounded-xl bg-elevated border border-border text-xs font-mono text-fg focus:outline-none"
              >
                {visibleVersions.slice(0, 80).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.id} ({v.type})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 pt-1">
              <label className="text-xs font-medium text-muted">
                Mod Loader (Default: None / Vanilla)
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {(["none", "fabric", "quilt", "neoforge", "forge"] as ModLoaderKind[]).map(
                  (ldr) => (
                    <motion.button
                      key={ldr}
                      type="button"
                      whileTap={{ scale: 0.94 }}
                      onClick={() =>
                        onSaveProfile({
                          ...profile,
                          loader: ldr,
                          loader_version: "latest",
                        })
                      }
                      className={`py-2 px-2 rounded-xl text-xs font-medium border capitalize ${
                        profile.loader === ldr
                          ? "bg-fg text-bg border-fg"
                          : "bg-elevated border-border text-muted hover:text-fg"
                      }`}
                    >
                      {ldr === "none" ? "None" : ldr}
                    </motion.button>
                  )
                )}
              </div>
            </div>

            {profile.loader !== "none" && (
              <div className="space-y-3 pt-2 border-t border-border">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <label className="text-xs font-medium text-muted">
                      Loader Version (Default: Latest)
                    </label>
                    <select
                      value={profile.loader_version}
                      onChange={(e) =>
                        onSaveProfile({
                          ...profile,
                          loader_version: e.target.value,
                          auto_update_loader: e.target.value === "latest" ? true : profile.auto_update_loader,
                        })
                      }
                      className="mt-1 w-full px-3 py-2 rounded-xl bg-elevated border border-border text-xs font-mono"
                    >
                      <option value="latest">latest (Recommended)</option>
                      {loaderOptions.map((opt) => (
                        <option key={opt.version} value={opt.version}>
                          {opt.version} {opt.stable ? "• stable" : "• beta"}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <label className="flex items-center justify-between p-3 rounded-xl bg-elevated border border-border cursor-pointer">
                  <div>
                    <div className="text-xs font-medium">Auto-Update Mod Loader</div>
                    <div className="text-[11px] text-muted">
                      Automatically upgrades {profile.loader} to the newest build on launch
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={profile.auto_update_loader}
                    onChange={(e) =>
                      onSaveProfile({ ...profile, auto_update_loader: e.target.checked })
                    }
                    className="w-4 h-4 accent-current"
                  />
                </label>
              </div>
            )}
          </div>

          {/* Memory & Per-Profile Overrides */}
          <div className="p-5 rounded-2xl bg-surface border border-border flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold">Memory & Isolation Overrides</h3>
                <p className="text-xs text-muted">
                  Fine-tune JVM heap, fullscreen, and OS sandbox specifically for {profile.name}.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted">Allocated JVM Heap (`-Xmx`)</span>
                  <span className="font-mono font-semibold">{profile.allocated_ram_mb} MB</span>
                </div>
                <input
                  type="range"
                  min={1024}
                  max={16384}
                  step={512}
                  value={profile.allocated_ram_mb}
                  onChange={(e) =>
                    onSaveProfile({ ...profile, allocated_ram_mb: Number(e.target.value) })
                  }
                  className="w-full accent-current"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted">Profile Name</label>
                <input
                  value={profile.name}
                  onChange={(e) => onSaveProfile({ ...profile, name: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-elevated border border-border text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    onSaveProfile({
                      ...profile,
                      fullscreen_override:
                        profile.fullscreen_override === null
                          ? true
                          : profile.fullscreen_override
                          ? false
                          : null,
                    })
                  }
                  className="p-3 rounded-xl bg-elevated border border-border text-left text-xs"
                >
                  <div className="text-muted text-[11px]">Fullscreen Override</div>
                  <div className="font-semibold mt-0.5">
                    {profile.fullscreen_override === null
                      ? "Use Global Default (OFF)"
                      : profile.fullscreen_override
                      ? "Force Fullscreen ON"
                      : "Force Windowed"}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onSaveProfile({
                      ...profile,
                      sandbox_override:
                        profile.sandbox_override === null
                          ? false
                          : profile.sandbox_override === false
                          ? true
                          : null,
                    })
                  }
                  className="p-3 rounded-xl bg-elevated border border-border text-left text-xs"
                >
                  <div className="text-muted text-[11px]">OS Sandbox Override</div>
                  <div className="font-semibold mt-0.5">
                    {profile.sandbox_override === null
                      ? "Use Global Shield (ON)"
                      : profile.sandbox_override
                      ? "Force Sandboxed"
                      : "Bypass Sandbox"}
                  </div>
                </button>
              </div>
            </div>

            {allProfiles.length > 1 && (
              <div className="pt-3 border-t border-border flex justify-end">
                <button
                  type="button"
                  onClick={() => onDeleteProfile(profile.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-muted hover:text-fg hover:bg-elevated"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete Profile
                </button>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* TAB 2: PROFILE-SCOPED MODRINTH */}
      {tab === "modrinth" && (
        <ModrinthBrowser
          scopedProfile={profile}
          profiles={allProfiles}
          onProfilesChanged={onProfilesChanged}
          onToast={onToast}
          onSetIsland={onSetIsland}
        />
      )}

      {/* TAB 3: BUILT-IN DIRECTORY EXPLORER + LIGHTWEIGHT CONFIG EDITOR */}
      {tab === "files" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className={`${editingPath ? "lg:col-span-6" : "lg:col-span-12"} p-5 rounded-2xl bg-surface border border-border space-y-4`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setCurrentDir("")}
                  className="px-2.5 py-1 rounded-lg bg-elevated border border-border hover:bg-fg hover:text-bg"
                >
                  /{profile.name}
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
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-fg text-bg text-xs font-medium"
                >
                  <FilePlus className="w-3.5 h-3.5" /> Add `.jar` / File
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={async () => {
                    const folderName = window.prompt("New folder name:");
                    if (!folderName) return;
                    const target = currentDir ? `${currentDir}/${folderName}` : folderName;
                    await LauncherBridge.createDir(profile.id, target);
                    await refreshDir(currentDir);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-elevated border border-border text-xs"
                >
                  <FolderPlus className="w-3.5 h-3.5" /> New Folder
                </motion.button>
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
                  <Folder className="w-4 h-4" /> .. (Parent Directory)
                </button>
              )}

              {entries.length === 0 ? (
                <div className="py-10 text-center text-xs text-muted">
                  Directory is empty. Drop `.jar` mods, `.zip` archives, or configs here.
                </div>
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
                        else if (node.editable_config) openConfigEditor(node);
                      }}
                      className="flex items-center gap-2.5 min-w-0 text-left flex-1"
                    >
                      {node.is_dir ? (
                        <Folder className="w-4 h-4 text-fg shrink-0" />
                      ) : (
                        <FileCode className="w-4 h-4 text-muted shrink-0" />
                      )}
                      <span className="font-medium truncate">{node.name}</span>
                      {!node.is_dir && (
                        <span className="text-[10px] font-mono text-muted shrink-0">
                          {(node.size_bytes / 1024).toFixed(1)} KB
                        </span>
                      )}
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {node.editable_config && (
                        <button
                          type="button"
                          onClick={() => openConfigEditor(node)}
                          className="px-2.5 py-1 rounded-lg bg-elevated border border-border text-[11px] hover:bg-fg hover:text-bg"
                        >
                          Edit Config
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
                            onToast(`Extracted ${count} file(s) from ${node.name}`);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-elevated border border-border text-[11px] hover:bg-fg hover:text-bg"
                        >
                          <Archive className="w-3 h-3" /> Extract
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          const nextName = window.prompt("Rename to:", node.name);
                          if (!nextName || nextName === node.name) return;
                          const toRel = currentDir ? `${currentDir}/${nextName}` : nextName;
                          await LauncherBridge.renameOrMove(
                            profile.id,
                            node.relative_path,
                            toRel
                          );
                          await refreshDir(currentDir);
                        }}
                        className="px-2 py-1 rounded-lg text-[11px] text-muted hover:text-fg"
                      >
                        Rename
                      </button>
                      <button
                        type="button"
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

          {/* Built-in Monotone Config Editor Pane */}
          {editingPath && (
            <motion.div
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={ELASTIC_SPRING}
              className="lg:col-span-6 p-5 rounded-2xl bg-surface border border-border flex flex-col space-y-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-mono font-semibold">{editingPath}</div>
                  <div className="text-[11px] text-muted">Built-in Monotone Config Editor</div>
                </div>
                <div className="flex items-center gap-2">
                  <motion.button
                    whileTap={{ scale: 0.94 }}
                    onClick={saveConfigEditor}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-fg text-bg text-xs font-medium"
                  >
                    <Save className="w-3.5 h-3.5" /> Save
                  </motion.button>
                  <button
                    type="button"
                    onClick={() => setEditingPath(null)}
                    className="p-1.5 rounded-lg bg-elevated"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <textarea
                value={editingContent}
                onChange={(e) => setEditingContent(e.target.value)}
                rows={14}
                className="w-full flex-1 font-mono text-xs p-3.5 rounded-xl bg-elevated border border-border text-fg focus:outline-none focus:border-fg"
              />
            </motion.div>
          )}
        </div>
      )}

      {/* TAB 4: SCREENSHOTS GALLERY + ZOOM LIGHTBOX + CLIPBOARD */}
      {tab === "screenshots" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Profile Screenshots (`/screenshots`)</h3>
              <p className="text-xs text-muted">
                Click any capture to open the Lightbox, copy straight to clipboard, or set as profile banner.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {screenshots.map((shot) => (
              <motion.div
                key={shot.relative_path}
                whileHover={{ y: -3, scale: 1.01 }}
                transition={ELASTIC_SPRING}
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
                    onClick={(e) => {
                      e.stopPropagation();
                      copyScreenshotToClipboard(shot);
                    }}
                    className="p-1.5 rounded-lg bg-elevated border border-border hover:bg-fg hover:text-bg"
                    title="Copy to Clipboard"
                  >
                    <ClipboardCopy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>

          <AnimatePresence>
            {lightboxShot && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setLightboxShot(null)}
                className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6"
              >
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.92, opacity: 0 }}
                  transition={ELASTIC_SPRING}
                  onClick={(e) => e.stopPropagation()}
                  className="max-w-4xl w-full bg-surface border border-border rounded-3xl overflow-hidden shadow-2xl"
                >
                  <img
                    src={lightboxShot.data_url}
                    alt={lightboxShot.file_name}
                    className="w-full max-h-[70vh] object-contain bg-black"
                  />
                  <div className="p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="font-mono text-xs">{lightboxShot.file_name}</div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => copyScreenshotToClipboard(lightboxShot)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-fg text-bg text-xs font-medium"
                      >
                        <ClipboardCopy className="w-3.5 h-3.5" /> Copy Image
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await onSaveProfile({
                            ...profile,
                            banner_screenshot: lightboxShot.data_url,
                          });
                          onToast("Applied screenshot as Profile Banner");
                          setLightboxShot(null);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-elevated border border-border text-xs font-medium"
                      >
                        Set as Profile Banner
                      </button>
                      <button
                        type="button"
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
          </AnimatePresence>
        </div>
      )}

      {/* TAB 5: TWILIGHT SHIELD (.JAR SCANNER) & HUMAN-READABLE CRASH DOCTOR */}
      {tab === "shield" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Rust .jar Constant-Pool Threat Scanner */}
          <div className="p-5 rounded-2xl bg-surface border border-border space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4" />
                <h3 className="text-sm font-semibold">
                  Twilight Shield • Rust `.jar` Threat Scanner
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await LauncherBridge.uploadFile(
                      profile.id,
                      "mods",
                      "suspicious-webhook-stealer-demo.jar",
                      "UEsDBAoAAAAAA"
                    );
                    const reps = await LauncherBridge.scanProfileMods(profile.id);
                    setJarReports(reps);
                    onToast("Simulated malicious .jar placed in /mods and flagged by Shield!");
                  }}
                  className="px-2.5 py-1 rounded-lg bg-elevated border border-border text-[11px]"
                >
                  Test Malware Detection
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const reps = await LauncherBridge.scanProfileMods(profile.id);
                    setJarReports(reps);
                  }}
                  className="p-1.5 rounded-lg bg-elevated border border-border"
                  title="Rescan /mods"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <p className="text-xs text-muted">
              Inspects `.class` Constant Pool UTF-8 entries in milliseconds for Discord/Telegram
              webhooks, Chrome/Login Data theft, SSH key reads, and `ProcessBuilder` shells.
            </p>

            <div className="space-y-2">
              {jarReports.length === 0 ? (
                <div className="p-4 rounded-xl bg-elevated text-xs text-muted">
                  No `.jar` files in `/mods` yet.
                </div>
              ) : (
                jarReports.map((rep) => (
                  <div
                    key={rep.file_name}
                    className="p-3.5 rounded-xl bg-elevated border border-border space-y-2 text-xs"
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
                        {rep.classes_scanned} classes • {rep.scan_duration_ms}ms
                      </span>
                    </div>

                    {!rep.safe && (
                      <div className="space-y-1.5 pt-1 border-t border-border">
                        {rep.findings.map((f, idx) => (
                          <div key={idx} className="text-[11px] bg-surface p-2.5 rounded-lg border border-border">
                            <div className="font-semibold uppercase tracking-wide">
                              [{f.severity}] {f.category} — `{f.matched_indicator}`
                            </div>
                            <div className="text-muted mt-0.5">{f.description}</div>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={async () => {
                            await LauncherBridge.deleteEntry(profile.id, `mods/${rep.file_name}`);
                            setJarReports(await LauncherBridge.scanProfileMods(profile.id));
                            onToast(`Quarantined & deleted ${rep.file_name}`);
                          }}
                          className="mt-1 inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-fg text-bg text-[11px] font-medium"
                        >
                          <Trash2 className="w-3 h-3" /> Delete Flagged `.jar`
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Human-Readable Crash Doctor */}
          <div className="p-5 rounded-2xl bg-surface border border-border space-y-4">
            <div className="flex items-center gap-2">
              <Stethoscope className="w-4 h-4" />
              <h3 className="text-sm font-semibold">Human-Readable Crash Doctor</h3>
            </div>
            <textarea
              value={crashInput}
              onChange={async (e) => {
                const next = e.target.value;
                setCrashInput(next);
                setDiagnosis(await LauncherBridge.diagnoseCrash(next));
              }}
              rows={5}
              placeholder="Paste crash report or game stderr log..."
              className="w-full font-mono text-[11px] p-3 rounded-xl bg-elevated border border-border text-fg focus:outline-none"
            />

            {diagnosis && (
              <div className="p-4 rounded-xl bg-elevated border border-border space-y-2.5 text-xs">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{diagnosis.title}</span>
                </div>
                <p className="text-muted">{diagnosis.summary}</p>
                <div className="font-mono text-[11px] px-2.5 py-1.5 rounded bg-surface border border-border">
                  Cause: {diagnosis.root_cause}
                </div>
                <p className="text-fg font-medium">Fix: {diagnosis.suggested_fix}</p>
                {diagnosis.fix_action_code && (
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => applyCrashFix(diagnosis.fix_action_code)}
                    className="px-3.5 py-2 rounded-xl bg-fg text-bg font-semibold text-xs"
                  >
                    Apply 1-Click Fix
                  </motion.button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
