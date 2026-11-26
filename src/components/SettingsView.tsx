import React, { useEffect, useState } from "react";
import { Check, Download, Plus, Trash2 } from "lucide-react";
import { LauncherBridge } from "../lib/bridge";
import type {
  Account,
  JavaRuntimeInfo,
  LauncherSettings,
  LauncherStateSnapshot,
  WindowLaunchAction,
} from "../types/launcher";

interface Props {
  settings: LauncherSettings;
  accounts: Account[];
  onSaveSettings: (next: LauncherSettings) => Promise<void>;
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
  onStateChange,
  onToast,
}) => {
  const [javas, setJavas] = useState<JavaRuntimeInfo[]>([]);
  const [offlineName, setOfflineName] = useState("");
  const [javaToken, setJavaToken] = useState("");
  const [addingOffline, setAddingOffline] = useState(false);
  const [connectingJava, setConnectingJava] = useState(false);
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);

  useEffect(() => {
    LauncherBridge.listPortableJavas().then(setJavas);
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
      <section className="space-y-2">
        <h3 className="text-xs font-mono uppercase tracking-wider text-muted px-1">
          Accounts
        </h3>
        <div className="rounded-2xl bg-surface border border-border divide-y divide-border">
          {accounts.map((acct) => (
            <div
              key={acct.id}
              className="px-4 py-3 flex items-center justify-between gap-3"
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
          <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
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
          <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
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
        <div className="rounded-2xl bg-surface border border-border divide-y divide-border">
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-xs font-medium">Theme</span>
            <div className="inline-flex p-0.5 rounded-lg bg-elevated border border-border">
              {(["dark", "light"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => void onSaveSettings({ ...settings, theme: t })}
                  className={`px-3 py-1 rounded-md text-xs font-medium capitalize ${
                    settings.theme === t ? "bg-fg text-bg" : "text-muted hover:text-fg"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-medium">On Launch</span>
            <div className="inline-flex p-0.5 rounded-lg bg-elevated border border-border">
              {LAUNCH_ACTIONS.map((act) => (
                <button
                  key={act.id}
                  type="button"
                  onClick={() =>
                    void onSaveSettings({ ...settings, window_launch_action: act.id })
                  }
                  className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                    settings.window_launch_action === act.id
                      ? "bg-fg text-bg"
                      : "text-muted hover:text-fg"
                  }`}
                >
                  {act.label}
                </button>
              ))}
            </div>
          </div>

          <label className="px-4 py-3 flex items-center justify-between gap-3 cursor-pointer">
            <span className="text-xs font-medium">Fullscreen on Launch</span>
            <input
              type="checkbox"
              checked={settings.auto_fullscreen}
              onChange={(e) =>
                void onSaveSettings({ ...settings, auto_fullscreen: e.target.checked })
              }
              className="w-4 h-4 accent-current"
            />
          </label>

          <label className="px-4 py-3 flex items-center justify-between gap-3 cursor-pointer">
            <span className="text-xs font-medium">Restore Window on Exit</span>
            <input
              type="checkbox"
              checked={settings.restore_on_game_close}
              onChange={(e) =>
                void onSaveSettings({
                  ...settings,
                  restore_on_game_close: e.target.checked,
                })
              }
              className="w-4 h-4 accent-current"
            />
          </label>
        </div>
      </section>

      {/* SECURITY (Vertical Line Format) */}
      <section className="space-y-2">
        <h3 className="text-xs font-mono uppercase tracking-wider text-muted px-1">
          Security
        </h3>
        <div className="rounded-2xl bg-surface border border-border divide-y divide-border">
          {(
            [
              { key: "token_vault", label: "Session Token Vault" },
              { key: "os_sandbox", label: "Filesystem Sandbox" },
              { key: "jar_scanner", label: "Mod Bytecode Scanner" },
              { key: "block_high_risk_jars", label: "Block Flagged Mods" },
            ] as const
          ).map((item) => (
            <label
              key={item.key}
              className="px-4 py-3 flex items-center justify-between gap-3 cursor-pointer"
            >
              <span className="text-xs font-medium">{item.label}</span>
              <input
                type="checkbox"
                checked={settings.shield[item.key]}
                onChange={(e) =>
                  void onSaveSettings({
                    ...settings,
                    shield: { ...settings.shield, [item.key]: e.target.checked },
                  })
                }
                className="w-4 h-4 accent-current"
              />
            </label>
          ))}
        </div>
      </section>

      {/* JAVA RUNTIMES (Vertical Line Format) */}
      <section className="space-y-2">
        <h3 className="text-xs font-mono uppercase tracking-wider text-muted px-1">
          Java
        </h3>
        <div className="rounded-2xl bg-surface border border-border divide-y divide-border">
          {[8, 17, 21].map((major) => {
            const installed = javas.find((j) => j.major_version === major);
            return (
              <div
                key={major}
                className="px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-medium font-mono">OpenJDK {major}</span>
                  {installed && (
                    <span className="text-[11px] font-mono text-muted">
                      {installed.version_string}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const info = await LauncherBridge.installPortableJava(major);
                      setJavas((prev) => [
                        ...prev.filter((x) => x.major_version !== major),
                        info,
                      ]);
                      onToast(`OpenJDK ${major} ready`);
                    } catch (err) {
                      onToast(String(err));
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fg text-bg text-xs font-medium"
                >
                  <Download className="w-3 h-3" /> {installed ? "Verify" : "Install"}
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
        <div className="rounded-2xl bg-surface border border-border divide-y divide-border">
          {(
            [
              { key: "discrete_gpu_dri_prime", label: "Discrete GPU (DRI_PRIME=1)" },
              { key: "nvidia_prime_offload", label: "NVIDIA Prime Offload" },
              { key: "wayland_native_glfw", label: "Native Wayland GLFW" },
              { key: "feral_gamemode", label: "GameMode" },
              { key: "mangohud", label: "MangoHud" },
            ] as const
          ).map((item) => (
            <label
              key={item.key}
              className="px-4 py-3 flex items-center justify-between gap-3 cursor-pointer"
            >
              <span className="text-xs font-medium">{item.label}</span>
              <input
                type="checkbox"
                checked={settings.linux_gaming[item.key]}
                onChange={(e) =>
                  void onSaveSettings({
                    ...settings,
                    linux_gaming: {
                      ...settings.linux_gaming,
                      [item.key]: e.target.checked,
                    },
                  })
                }
                className="w-4 h-4 accent-current"
              />
            </label>
          ))}
        </div>
      </section>
    </div>
  );
};
