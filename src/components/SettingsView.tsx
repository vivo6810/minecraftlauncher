import React, { useEffect, useState } from "react";
import { AccentSettings } from "./AccentSettings";
import { BackgroundSettings } from "./BackgroundSettings";
import { RubberSegment } from "./RubberSegment";
import { SquishSwitch } from "./SquishSwitch";
import { Check, Download, Plus, Trash2 } from "lucide-react";
import { LauncherBridge } from "../lib/bridge";
import {
  type Account,
  type JavaRuntimeInfo,
  type LauncherSettings,
  type LauncherStateSnapshot,
  type WindowLaunchAction,
} from "../types/launcher";

interface Props {
  settings: LauncherSettings;
  accounts: Account[];
  onSaveSettings: (next: LauncherSettings) => Promise<void>;
  onSaveAccent: (color: string | null) => Promise<void>;
  onSaveBackground: (image: string | null, blur: number) => Promise<void>;
  onStateChange: (next: LauncherStateSnapshot) => void;
  onToast: (msg: string) => void;
}

const LAUNCH_ACTIONS: { id: WindowLaunchAction; label: string }[] = [
  { id: "minimize", label: "Minimize" },
  { id: "keep_open", label: "Keep Open" },
  { id: "minimize_to_tray", label: "Tray" },
  { id: "close", label: "Close" },
];

export const SettingsView: React.FC<Props> = ({
  settings,
  accounts,
  onSaveSettings,
  onSaveAccent,
  onSaveBackground,
  onStateChange,
  onToast,
}) => {
  const [javas, setJavas] = useState<JavaRuntimeInfo[]>([]);
  const [javaMajors, setJavaMajors] = useState<number[]>([8, 17, 21, 25]);
  const [installingJavaMajors, setInstallingJavaMajors] = useState<number[]>([]);
  const [offlineName, setOfflineName] = useState("");
  const [javaToken, setJavaToken] = useState("");
  const [addingOffline, setAddingOffline] = useState(false);
  const [connectingJava, setConnectingJava] = useState(false);
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    LauncherBridge.listPortableJavas()
      .then((list) => {
        if (active) setJavas(list);
      })
      .catch(() => {});
    LauncherBridge.listAvailableJavaMajors()
      .then((majors) => {
        if (active && majors.length > 0) setJavaMajors(majors);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const handleAddOffline = async () => {
    if (addingOffline) return;
    const clean = offlineName.trim();
    if (!clean) return;
    setAddingOffline(true);
    try {
      const next = await LauncherBridge.createOfflineAccount(clean, null);
      onStateChange(next);
      setOfflineName("");
      onToast(`Added ${clean}`);
    } catch (err) {
      onToast(String(err));
    } finally {
      setAddingOffline(false);
    }
  };

  const handleConnectJava = async () => {
    if (connectingJava) return;
    const clean = javaToken.trim();
    if (!clean) return;
    setConnectingJava(true);
    try {
      const next = await LauncherBridge.connectMicrosoftToken(clean);
      onStateChange(next);
      setJavaToken("");
      onToast("Java account connected");
    } catch (err) {
      onToast(String(err));
    } finally {
      setConnectingJava(false);
    }
  };

  const handleActivateAccount = async (accountId: string) => {
    if (busyAccountId) return;
    setBusyAccountId(accountId);
    try {
      const next = await LauncherBridge.setActiveAccount(accountId);
      onStateChange(next);
    } catch (err) {
      onToast(String(err));
    } finally {
      setBusyAccountId(null);
    }
  };

  const handleRemoveAccount = async (accountId: string) => {
    if (busyAccountId) return;
    setBusyAccountId(accountId);
    try {
      const next = await LauncherBridge.removeAccount(accountId);
      onStateChange(next);
    } catch (err) {
      onToast(String(err));
    } finally {
      setBusyAccountId(null);
    }
  };

  return (
    <div className="max-w-3xl space-y-6 pb-8">
      <h2 className="text-lg font-semibold tracking-tight">Settings</h2>

      {/* ACCOUNTS (Vertical Line Format) */}
      <AccentSettings color={settings.accent_color} onSave={onSaveAccent} />
      <BackgroundSettings settings={settings} onSave={onSaveBackground} />

      <section className="space-y-2">
        <h3 className="text-xs font-mono uppercase tracking-wider text-muted px-1">
          Accounts
        </h3>
        <div className="rounded-2xl bg-surface divide-y divide-border/40">
          {accounts.map((acct) => (
            <div
              key={acct.id}
              className="px-5 py-3.5 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-xs font-semibold truncate">{acct.username}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-elevated border border-border text-muted uppercase">
                  {acct.account_type === "microsoft" ? "Java" : "Offline"}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {acct.active ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-fg text-bg text-[11px] font-semibold">
                    <Check className="w-3 h-3" /> Active
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={busyAccountId === acct.id}
                    onClick={() => void handleActivateAccount(acct.id)}
                    className="px-2.5 py-1 rounded-lg bg-elevated border border-border text-[11px] font-medium hover:border-fg/40 disabled:opacity-45"
                  >
                    Use
                  </button>
                )}

                {accounts.length > 1 && (
                  <button
                    type="button"
                    disabled={busyAccountId === acct.id}
                    aria-label={`Remove ${acct.username}`}
                    onClick={() => void handleRemoveAccount(acct.id)}
                    className="p-1.5 rounded-lg text-muted hover:text-fg hover:bg-elevated disabled:opacity-45"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Add Offline Account Row */}
          <div className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-medium">Offline Account</span>
            <div className="flex items-center gap-2">
              <input
                value={offlineName}
                disabled={addingOffline}
                onChange={(e) => setOfflineName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleAddOffline();
                }}
                placeholder="Username"
                className="w-44 px-3 py-1.5 rounded-lg bg-elevated border border-border text-xs text-fg focus:outline-none focus:border-fg disabled:opacity-50"
              />
              <button
                type="button"
                disabled={addingOffline}
                onClick={() => void handleAddOffline()}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-fg text-bg text-xs font-semibold disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
          </div>

          {/* Connect Java Account Row */}
          <div className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-medium">Java Account</span>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={javaToken}
                disabled={connectingJava}
                onChange={(e) => setJavaToken(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleConnectJava();
                }}
                placeholder="Minecraft access token"
                className="w-44 px-3 py-1.5 rounded-lg bg-elevated border border-border text-xs font-mono text-fg focus:outline-none focus:border-fg disabled:opacity-50"
              />
              <button
                type="button"
                disabled={connectingJava}
                onClick={() => void handleConnectJava()}
                className="px-3 py-1.5 rounded-lg bg-fg text-bg text-xs font-semibold disabled:opacity-50"
              >
                Connect
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* GENERAL & WINDOW (Vertical Line Format) */}
      <section className="space-y-2">
        <h3 className="text-xs font-mono uppercase tracking-wider text-muted px-1">
          Window & Launch
        </h3>
        <div className="rounded-2xl bg-surface divide-y divide-border/40">
          <div className="px-5 py-3.5 flex items-center justify-between gap-3">
            <span className="text-xs font-medium">Theme</span>
            <RubberSegment
              label="Theme"
              items={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }]}
              value={settings.theme}
              onChange={(value) => void onSaveSettings({ ...settings, theme: value })}
            />
          </div>

          <div className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-medium">On Launch</span>
            <RubberSegment
              label="On Launch"
              items={LAUNCH_ACTIONS.map(({ id, label }) => ({ value: id, label }))}
              value={settings.window_launch_action}
              onChange={(value) => void onSaveSettings({ ...settings, window_launch_action: value })}
            />
          </div>

          <div className="px-5 py-3.5 flex items-center justify-between gap-3">
              <span className="text-xs font-medium">Fullscreen on Launch</span>
              <SquishSwitch label="Fullscreen on Launch"
              checked={settings.auto_fullscreen}
              onChange={(checked) =>
                void onSaveSettings({ ...settings, auto_fullscreen: checked })
              }
              />
            </div>

          <div className="px-5 py-3.5 flex items-center justify-between gap-3">
              <span className="text-xs font-medium">Restore Window on Exit</span>
              <SquishSwitch label="Restore Window on Exit"
              checked={settings.restore_on_game_close}
              onChange={(checked) =>
                void onSaveSettings({
                  ...settings,
                  restore_on_game_close: checked,
                })
              }
              />
            </div>
        </div>
      </section>

      {/* SECURITY (Vertical Line Format) */}
      <section className="space-y-2">
        <h3 className="text-xs font-mono uppercase tracking-wider text-muted px-1">
          Security
        </h3>
        <div className="rounded-2xl bg-surface divide-y divide-border/40">
          {(
            [
              { key: "token_vault", label: "Session Token Vault" },
              { key: "jar_scanner", label: "Mod Bytecode Scanner" },
              { key: "block_high_risk_jars", label: "Block Flagged Mods" },
            ] as const
          ).map((item) => (
            <div
              key={item.key}
              className="px-5 py-3.5 flex items-center justify-between gap-3"
            >
              <span className="text-xs font-medium">{item.label}</span>
              <SquishSwitch label={item.label}
                checked={settings.shield[item.key]}
                onChange={(checked) =>
                  void onSaveSettings({
                    ...settings,
                    shield: { ...settings.shield, [item.key]: checked },
                  })
                }
              />
            </div>
          ))}
        </div>
      </section>

      {/* JAVA RUNTIMES (Vertical Line Format) */}
      <section className="space-y-2">
        <h3 className="text-xs font-mono uppercase tracking-wider text-muted px-1">
          Java
        </h3>
        <div className="rounded-2xl bg-surface divide-y divide-border/40">
          {Array.from(new Set([...javaMajors, ...javas.map((j) => j.major_version)]))
            .sort((a, b) => a - b)
            .map((major) => {
              const installed = javas.find((j) => j.major_version === major);
              const busy = installingJavaMajors.includes(major);
              return (
                <div
                  key={major}
                  className="px-5 py-3.5 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-medium font-mono">
                      OpenJDK {major}
                    </span>
                    {installed && (
                      <span className="text-[11px] font-mono text-muted">
                        {installed.version_string}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      if (installingJavaMajors.includes(major)) return;
                      setInstallingJavaMajors((prev) => [...prev, major]);
                      try {
                        const info = await LauncherBridge.installPortableJava(major);
                        setJavas((prev) => [
                          ...prev.filter((x) => x.major_version !== major),
                          info,
                        ]);
                        onToast(`OpenJDK ${major} ready`);
                      } catch (err) {
                        onToast(String(err));
                      } finally {
                        setInstallingJavaMajors((prev) =>
                          prev.filter((m) => m !== major)
                        );
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fg text-bg text-xs font-medium disabled:opacity-50"
                  >
                    <Download className="w-3 h-3" />{" "}
                    {busy ? "Working..." : installed ? "Verify" : "Install"}
                  </button>
                </div>
              );
            })}
        </div>
      </section>

      {/* LINUX (Vertical Line Format) */}
      <section className="space-y-2">
        <h3 className="text-xs font-mono uppercase tracking-wider text-muted px-1">
          Linux
        </h3>
        <div className="rounded-2xl bg-surface divide-y divide-border/40">
          {(
            [
              { key: "discrete_gpu_dri_prime", label: "Discrete GPU (DRI_PRIME=1)" },
              { key: "nvidia_prime_offload", label: "NVIDIA Prime Offload" },
              { key: "wayland_native_glfw", label: "Native Wayland GLFW" },
              { key: "feral_gamemode", label: "GameMode" },
              { key: "mangohud", label: "MangoHud" },
            ] as const
          ).map((item) => (
            <div
              key={item.key}
              className="px-5 py-3.5 flex items-center justify-between gap-3"
            >
              <span className="text-xs font-medium">{item.label}</span>
              <SquishSwitch label={item.label}
                checked={settings.linux_gaming[item.key]}
                onChange={(checked) =>
                  void onSaveSettings({
                    ...settings,
                    linux_gaming: {
                      ...settings.linux_gaming,
                      [item.key]: checked,
                    },
                  })
                }
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
