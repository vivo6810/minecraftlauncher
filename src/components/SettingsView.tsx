import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Cpu,
  Download,
  HardDrive,
  Monitor,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { LauncherBridge } from "../lib/bridge";
import {
  ELASTIC_SPRING,
  type JavaRuntimeInfo,
  type LauncherSettings,
  type SandboxCapabilityStatus,
  type WindowLaunchAction,
} from "../types/launcher";

interface Props {
  settings: LauncherSettings;
  onSaveSettings: (next: LauncherSettings) => Promise<void>;
  onToast: (msg: string) => void;
}

const LAUNCH_ACTIONS: { id: WindowLaunchAction; label: string; desc: string }[] = [
  { id: "minimize", label: "Minimize Window (Default)", desc: "Minimizes TwilightLauncher cleanly on launch" },
  { id: "keep_open", label: "Keep Open", desc: "Leaves launcher window visible" },
  { id: "minimize_to_tray", label: "Minimize to System Tray", desc: "Hides window to OS tray" },
  { id: "close", label: "Close Launcher", desc: "Exits launcher once JVM spawns" },
];

export const SettingsView: React.FC<Props> = ({
  settings,
  onSaveSettings,
  onToast,
}) => {
  const [javas, setJavas] = useState<JavaRuntimeInfo[]>([]);
  const [sandboxStatus, setSandboxStatus] = useState<SandboxCapabilityStatus | null>(null);

  useEffect(() => {
    LauncherBridge.listPortableJavas().then(setJavas);
    LauncherBridge.getSandboxStatus().then(setSandboxStatus);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Launcher Settings</h2>
        <p className="text-xs text-muted mt-0.5">
          Configure window launch behavior, Twilight Shield confinement, portable Java runtimes, and
          Linux gaming optimizations.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 1. Window & Launch Behavior */}
        <div className="p-5 rounded-2xl bg-surface border border-border space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Monitor className="w-4 h-4" /> Window & Launch Controls
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted">On-Launch Window Behavior</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {LAUNCH_ACTIONS.map((act) => {
                const active = settings.window_launch_action === act.id;
                return (
                  <motion.button
                    key={act.id}
                    type="button"
                    whileTap={{ scale: 0.96 }}
                    onClick={() =>
                      onSaveSettings({ ...settings, window_launch_action: act.id })
                    }
                    className={`p-3 rounded-xl border text-left ${
                      active
                        ? "bg-fg text-bg border-fg"
                        : "bg-elevated border-border"
                    }`}
                  >
                    <div className="text-xs font-semibold">{act.label}</div>
                    <div className="text-[10px] opacity-75 mt-0.5">{act.desc}</div>
                  </motion.button>
                );
              })}
            </div>
          </div>

          <label className="flex items-center justify-between p-3.5 rounded-xl bg-elevated border border-border cursor-pointer">
            <div>
              <div className="text-xs font-semibold">
                Auto-Enable Fullscreen on Launch (Default: OFF)
              </div>
              <div className="text-[11px] text-muted">
                Passes `--fullscreen` automatically when Minecraft boots
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.auto_fullscreen}
              onChange={(e) =>
                onSaveSettings({ ...settings, auto_fullscreen: e.target.checked })
              }
              className="w-4 h-4 accent-current"
            />
          </label>

          <label className="flex items-center justify-between p-3.5 rounded-xl bg-elevated border border-border cursor-pointer">
            <div>
              <div className="text-xs font-semibold">Restore Launcher When Game Closes</div>
              <div className="text-[11px] text-muted">
                Automatically brings TwilightLauncher back when Minecraft exits
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.restore_on_game_close}
              onChange={(e) =>
                onSaveSettings({ ...settings, restore_on_game_close: e.target.checked })
              }
              className="w-4 h-4 accent-current"
            />
          </label>

          <div className="flex items-center justify-between p-3.5 rounded-xl bg-elevated border border-border">
            <div>
              <div className="text-xs font-semibold">Monotone Palette</div>
              <div className="text-[11px] text-muted">
                Zero chromatic noise — pure obsidian dark or crisp paper light
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                onSaveSettings({
                  ...settings,
                  theme: settings.theme === "dark" ? "light" : "dark",
                })
              }
              className="px-3.5 py-1.5 rounded-xl bg-fg text-bg text-xs font-semibold capitalize"
            >
              {settings.theme} Mode
            </button>
          </div>
        </div>

        {/* 2. Twilight Shield 3-Layer Security */}
        <div className="p-5 rounded-2xl bg-surface border border-border space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="w-4 h-4" /> Twilight Shield (Anti-Malware Isolation)
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-elevated border border-border text-muted">
              ~0% FPS Impact
            </span>
          </div>

          {sandboxStatus && (
            <div className="p-3 rounded-xl bg-elevated border border-border text-[11px] space-y-1">
              <div className="font-mono font-semibold">{sandboxStatus.backend_name}</div>
              <div className="text-muted">{sandboxStatus.details}</div>
            </div>
          )}

          {[
            {
              key: "token_vault" as const,
              title: "1. Native Session Token Vault",
              desc: "Never passes real Microsoft session tokens to the JVM; brokers `/session/minecraft/join` via 127.0.0.1.",
            },
            {
              key: "os_sandbox" as const,
              title: "2. OS Filesystem Sandbox (`bubblewrap` / `AppContainer`)",
              desc: "Locks JVM read-write strictly to `instances/<profile>/`; hides `$HOME`, Chrome, Discord & SSH keys.",
            },
            {
              key: "jar_scanner" as const,
              title: "3. Fast Rust `.jar` Constant-Pool Threat Scanner",
              desc: "Scans mod `.class` bytecode in <15ms for Discord webhooks, credential SQLite theft & shell calls.",
            },
          ].map((item) => (
            <label
              key={item.key}
              className="flex items-center justify-between gap-3 p-3 rounded-xl bg-elevated border border-border cursor-pointer"
            >
              <div>
                <div className="text-xs font-semibold">{item.title}</div>
                <div className="text-[11px] text-muted">{item.desc}</div>
              </div>
              <input
                type="checkbox"
                checked={settings.shield[item.key]}
                onChange={(e) =>
                  onSaveSettings({
                    ...settings,
                    shield: { ...settings.shield, [item.key]: e.target.checked },
                  })
                }
                className="w-4 h-4 accent-current shrink-0"
              />
            </label>
          ))}
        </div>

        {/* 3. Automatic Portable Java Manager + Storage Architecture */}
        <div className="p-5 rounded-2xl bg-surface border border-border space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Cpu className="w-4 h-4" /> Automatic Portable Java Manager
          </div>
          <p className="text-xs text-muted">
            Automatically downloads isolated Eclipse Temurin JREs into `shared/java/` (100% common
            across all mod loaders): Java 8 (&le;1.16.5), Java 17 (1.18–1.20.4), Java 21 (1.20.5+).
          </p>

          <div className="grid grid-cols-3 gap-2">
            {[8, 17, 21].map((major) => {
              const installed = javas.find((j) => j.major_version === major);
              return (
                <motion.div
                  key={major}
                  transition={ELASTIC_SPRING}
                  className="p-3 rounded-xl bg-elevated border border-border flex flex-col justify-between gap-2"
                >
                  <div>
                    <div className="text-xs font-semibold font-mono">OpenJDK {major}</div>
                    <div className="text-[10px] text-muted truncate">
                      {installed ? installed.version_string : "Auto-downloads on demand"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const info = await LauncherBridge.installPortableJava(major);
                      setJavas((prev) => [
                        ...prev.filter((x) => x.major_version !== major),
                        info,
                      ]);
                      onToast(`Portable OpenJDK ${major} verified in shared/java/`);
                    }}
                    className="inline-flex items-center justify-center gap-1 py-1.5 rounded-lg bg-fg text-bg text-[11px] font-medium"
                  >
                    <Download className="w-3 h-3" /> {installed ? "Verify" : "Fetch"}
                  </button>
                </motion.div>
              );
            })}
          </div>

          <div className="p-3.5 rounded-xl bg-elevated border border-border space-y-1.5 text-[11px]">
            <div className="font-semibold flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5" /> Strict Storage Isolation (No Hardlink Collisions)
            </div>
            <div className="font-mono text-muted">
              • `shared/{`{assets, java, vanilla}`}` — 100% identical across all loaders
            </div>
            <div className="font-mono text-muted">
              • `loaders/{`{fabric, quilt, neoforge, forge}`}` — isolated loader binaries
            </div>
            <div className="font-mono text-muted">
              • `instances/&lt;profile&gt;/` — standalone `mods/`, `config/`, `saves/`, `screenshots/`
            </div>
          </div>
        </div>

        {/* 4. Linux Gaming Performance Tools */}
        <div className="p-5 rounded-2xl bg-surface border border-border space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Terminal className="w-4 h-4" /> Linux Gaming Tools
          </div>
          <p className="text-xs text-muted">
            First-class GPU & compositor flags applied automatically on Linux `.AppImage` / `.deb` /
            `.rpm` builds.
          </p>

          {[
            {
              key: "discrete_gpu_dri_prime" as const,
              label: "Discrete GPU (`DRI_PRIME=1`)",
              desc: "Offloads OpenGL rendering to dedicated AMD/Intel Arc dGPU",
            },
            {
              key: "nvidia_prime_offload" as const,
              label: "NVIDIA Prime Render Offload",
              desc: "Sets `__NV_PRIME_RENDER_OFFLOAD=1` & `__GLX_VENDOR_LIBRARY_NAME=nvidia`",
            },
            {
              key: "wayland_native_glfw" as const,
              label: "Native Wayland GLFW",
              desc: "Uses system Wayland-enabled `libglfw.so` to bypass XWayland latency",
            },
            {
              key: "feral_gamemode" as const,
              label: "Feral GameMode (`gamemoderun`)",
              desc: "Switches CPU governor to `performance` while Minecraft is running",
            },
            {
              key: "mangohud" as const,
              label: "MangoHud Overlay (`mangohud`)",
              desc: "Displays frametime graph, FPS, CPU/GPU load in-game",
            },
          ].map((opt) => (
            <label
              key={opt.key}
              className="flex items-center justify-between p-2.5 rounded-xl bg-elevated border border-border cursor-pointer"
            >
              <div>
                <div className="text-xs font-medium">{opt.label}</div>
                <div className="text-[10px] text-muted">{opt.desc}</div>
              </div>
              <input
                type="checkbox"
                checked={settings.linux_gaming[opt.key]}
                onChange={(e) =>
                  onSaveSettings({
                    ...settings,
                    linux_gaming: {
                      ...settings.linux_gaming,
                      [opt.key]: e.target.checked,
                    },
                  })
                }
                className="w-4 h-4 accent-current"
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
};
