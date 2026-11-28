import { useState } from "react";
import { isTauriDesktop, LauncherBridge } from "../lib/bridge";
import type { LauncherStateSnapshot } from "../types/launcher";
import { TitleBar } from "./TitleBar";

export function AccountWelcome({ onAccount, onSkip }: {
  onAccount: (state: LauncherStateSnapshot) => void;
  onSkip: () => void;
}) {
  const [method, setMethod] = useState<"offline" | "microsoft" | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const desktop = isTauriDesktop();

  return (
    <div className="launcher-shell flex h-screen w-screen flex-col overflow-hidden text-fg">
      <TitleBar />
      <div className="grid flex-1 min-h-0 place-items-center overflow-auto px-5">
        <section className="flex w-full max-w-lg flex-col items-center gap-7 text-center">
        <h1 className="launcher-heading text-3xl sm:text-4xl">Welcome to Twilight Launcher</h1>
        {method === null ? (
          <div className="flex flex-wrap justify-center gap-3">
            <button type="button" className="rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-accent-fg" onClick={() => setMethod("microsoft")}>Microsoft</button>
            <button type="button" className="rounded-xl bg-elevated px-6 py-3 text-sm font-semibold" onClick={() => setMethod("offline")}>Offline</button>
          </div>
        ) : (
          <form className="flex w-full max-w-sm flex-col items-center gap-3" onSubmit={async event => {
            event.preventDefault();
            const value = input.trim();
            if (busy || !value) return;
            setBusy(true);
            setError("");
            try {
              const state = method === "offline"
                ? await LauncherBridge.createOfflineAccount(value, null)
                : await LauncherBridge.connectMicrosoftToken(value);
              onAccount(state);
            } catch (err) {
              setError(String(err));
            } finally {
              setBusy(false);
            }
          }}>
            <input autoFocus required disabled={busy} type={method === "microsoft" && desktop ? "password" : "text"}
              aria-label={method === "offline" ? "Username" : desktop ? "Minecraft access token" : "Demo account name"}
              placeholder={method === "offline" ? "Username" : desktop ? "Minecraft access token" : "Demo account name"}
              className="w-full rounded-xl bg-elevated px-4 py-3 text-sm"
              value={input} onChange={event => setInput(event.currentTarget.value)} />
            <div className="flex gap-3">
              <button type="button" disabled={busy} className="rounded-xl px-4 py-2 text-xs text-muted" onClick={() => {
                setMethod(null);
                setInput("");
                setError("");
              }}>Back</button>
              <button disabled={busy || !input.trim()} className="rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-fg disabled:opacity-50">
                {busy ? "Saving…" : method === "offline" ? "Continue" : "Connect"}
              </button>
            </div>
            {error && <p role="alert" className="break-all text-xs text-muted">{error}</p>}
          </form>
        )}
        <button type="button" disabled={busy} className="text-[11px] text-muted hover:text-fg" onClick={onSkip}>Skip for now</button>
        </section>
      </div>
    </div>
  );
}
