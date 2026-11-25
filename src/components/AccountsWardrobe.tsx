import React, { useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Check,
  History,
  KeyRound,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
} from "lucide-react";
import { LauncherBridge } from "../lib/bridge";
import {
  ELASTIC_SPRING,
  type Account,
  type LauncherStateSnapshot,
  type SkinVariant,
  type WardrobeItem,
} from "../types/launcher";
import { SkinCanvasPreview } from "./SkinCanvasPreview";

interface Props {
  accounts: Account[];
  wardrobe: WardrobeItem[];
  onStateUpdated: (next: LauncherStateSnapshot) => void;
  onToast: (msg: string) => void;
}

export const AccountsWardrobe: React.FC<Props> = ({
  accounts,
  wardrobe,
  onStateUpdated,
  onToast,
}) => {
  const activeAccount = accounts.find((a) => a.active) ?? accounts[0];
  const [newOfflineName, setNewOfflineName] = useState("");
  const [customYggdrasil, setCustomYggdrasil] = useState("");
  const [msaTokenInput, setMsaTokenInput] = useState("");

  const skinUploadRef = useRef<HTMLInputElement | null>(null);
  const capeUploadRef = useRef<HTMLInputElement | null>(null);

  const skinsHistory = wardrobe.filter((w) => w.kind === "skin");
  const capesHistory = wardrobe.filter((w) => w.kind === "cape");

  const activeSkinItem = skinsHistory.find(
    (w) => w.sha256 === activeAccount?.skin_sha256
  );
  const activeCapeItem =
    activeAccount?.account_type === "offline"
      ? capesHistory.find((w) => w.sha256 === activeAccount?.custom_cape_sha256)
      : undefined;

  const activeOfficialCape = activeAccount?.official_capes.find(
    (c) => c.id === activeAccount.official_cape_id
  );

  const handleUploadAsset = (kind: "skin" | "cape") => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !activeAccount) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const b64 = String(reader.result || "");
      const label = file.name.replace(/\.png$/i, "");
      const next = await LauncherBridge.importAndEquipWardrobePng(
        activeAccount.id,
        label,
        b64,
        kind,
        activeAccount.skin_variant
      );
      onStateUpdated(next);
      onToast(
        `Saved "${label}" to Wardrobe History & equipped on ${activeAccount.username}`
      );
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          Accounts, Skins & Capes Wardrobe
        </h2>
        <p className="text-xs text-muted mt-0.5">
          Manage multiple Microsoft Premium & Offline (`authlib-injector`) accounts. User-provided
          `.png` skins and capes are saved automatically in your persistent Wardrobe history.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Multi-Account Switcher & Add Account */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-5 rounded-2xl bg-surface border border-border space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
              Saved Accounts ({accounts.length})
            </h3>
            <div className="space-y-2">
              {accounts.map((acct) => (
                <motion.div
                  key={acct.id}
                  layout
                  transition={ELASTIC_SPRING}
                  onClick={async () => {
                    const next = await LauncherBridge.setActiveAccount(acct.id);
                    onStateUpdated(next);
                  }}
                  className={`cursor-pointer p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                    acct.active
                      ? "bg-fg text-bg border-fg"
                      : "bg-elevated border-border hover:border-fg/40"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold truncate">{acct.username}</span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                          acct.active
                            ? "bg-bg/20 text-bg"
                            : "bg-surface text-muted border border-border"
                        }`}
                      >
                        {acct.account_type === "microsoft"
                          ? "JAVA PREMIUM"
                          : "OFFLINE • AUTHLIB"}
                      </span>
                    </div>
                    <div
                      className={`text-[10px] font-mono truncate mt-0.5 ${
                        acct.active ? "text-bg/70" : "text-muted"
                      }`}
                    >
                      UUID: {acct.uuid}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {acct.active && <Check className="w-4 h-4" />}
                    {accounts.length > 1 && (
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const next = await LauncherBridge.removeAccount(acct.id);
                          onStateUpdated(next);
                        }}
                        className="p-1.5 rounded-lg opacity-70 hover:opacity-100"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Add Offline (authlib-injector) Account */}
          <div className="p-5 rounded-2xl bg-surface border border-border space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <UserPlus className="w-4 h-4" /> Add Offline Account (`authlib-injector`)
            </div>
            <input
              value={newOfflineName}
              onChange={(e) => setNewOfflineName(e.target.value)}
              placeholder="Player username..."
              className="w-full px-3.5 py-2 rounded-xl bg-elevated border border-border text-xs"
            />
            <input
              value={customYggdrasil}
              onChange={(e) => setCustomYggdrasil(e.target.value)}
              placeholder="Optional Yggdrasil URL (leave blank for built-in localhost server)"
              className="w-full px-3.5 py-2 rounded-xl bg-elevated border border-border text-[11px] font-mono"
            />
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={async () => {
                if (!newOfflineName.trim()) return;
                const next = await LauncherBridge.createOfflineAccount(
                  newOfflineName,
                  customYggdrasil.trim() || null
                );
                onStateUpdated(next);
                setNewOfflineName("");
                setCustomYggdrasil("");
                onToast(`Added offline account "${newOfflineName}"`);
              }}
              className="w-full py-2 rounded-xl bg-fg text-bg text-xs font-semibold"
            >
              Add Offline Account
            </motion.button>
          </div>

          {/* Add Java Premium Account */}
          <div className="p-5 rounded-2xl bg-surface border border-border space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-semibold">
                <KeyRound className="w-4 h-4" /> Connect Java Premium Account
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-mono text-muted">
                <ShieldCheck className="w-3 h-3" /> Token Vault Protected
              </span>
            </div>
            <input
              value={msaTokenInput}
              onChange={(e) => setMsaTokenInput(e.target.value)}
              placeholder="Microsoft / Minecraft OAuth Session Token (or demo username)..."
              className="w-full px-3.5 py-2 rounded-xl bg-elevated border border-border text-xs"
            />
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={async () => {
                if (!msaTokenInput.trim()) return;
                const next = await LauncherBridge.connectMicrosoftToken(msaTokenInput);
                onStateUpdated(next);
                setMsaTokenInput("");
                onToast("Connected Java Premium Account (Token stored in native Vault)");
              }}
              className="w-full py-2 rounded-xl bg-elevated border border-border hover:bg-fg hover:text-bg text-xs font-semibold transition-colors"
            >
              Connect Premium Account
            </motion.button>
          </div>
        </div>

        {/* Right Column: Live Character Preview + Upload + Persistent Wardrobe History */}
        {activeAccount && (
          <div className="lg:col-span-7 space-y-4">
            <div className="p-5 rounded-2xl bg-surface border border-border grid grid-cols-1 md:grid-cols-2 gap-5 items-center">
              <SkinCanvasPreview
                skinDataUrl={activeSkinItem?.preview_data_url ?? null}
                capeDataUrl={
                  activeCapeItem?.preview_data_url ?? activeOfficialCape?.url ?? null
                }
                variant={activeAccount.skin_variant}
                username={activeAccount.username}
              />

              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold">
                    Customize {activeAccount.username}
                  </h3>
                  <p className="text-xs text-muted mt-0.5">
                    {activeAccount.account_type === "microsoft"
                      ? "Uploads .png skin to Mojang API & selects official Mojang Capes."
                      : "Serves custom .png skin & cape in-game via built-in localhost Yggdrasil + authlib-injector."}
                  </p>
                </div>

                {/* Arm Model Variant */}
                <div className="space-y-1.5">
                  <label className="text-xs text-muted">Arm Model</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(["classic", "slim"] as SkinVariant[]).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={async () => {
                          const next = await LauncherBridge.equipExistingWardrobeItem(
                            activeAccount.id,
                            activeAccount.skin_sha256 ?? "",
                            "skin",
                            v
                          );
                          onStateUpdated(next);
                        }}
                        className={`py-2 rounded-xl text-xs font-medium border capitalize ${
                          activeAccount.skin_variant === v
                            ? "bg-fg text-bg border-fg"
                            : "bg-elevated border-border"
                        }`}
                      >
                        {v} ({v === "classic" ? "4px" : "3px"})
                      </button>
                    ))}
                  </div>
                </div>

                {/* Upload User-Provided Skin / Cape */}
                <div className="space-y-2">
                  <input
                    ref={skinUploadRef}
                    type="file"
                    accept="image/png"
                    onChange={handleUploadAsset("skin")}
                    className="hidden"
                  />
                  <input
                    ref={capeUploadRef}
                    type="file"
                    accept="image/png"
                    onChange={handleUploadAsset("cape")}
                    className="hidden"
                  />

                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => skinUploadRef.current?.click()}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-fg text-bg text-xs font-semibold"
                  >
                    <Upload className="w-3.5 h-3.5" /> Provide Skin `.png`
                  </motion.button>

                  {activeAccount.account_type === "offline" ? (
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => capeUploadRef.current?.click()}
                      className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-elevated border border-border text-xs font-medium"
                    >
                      <Upload className="w-3.5 h-3.5" /> Provide Custom Cape `.png`
                    </motion.button>
                  ) : (
                    <div className="space-y-1.5 pt-1">
                      <label className="text-xs text-muted">Official Mojang Cape Selector</label>
                      <select
                        value={activeAccount.official_cape_id ?? ""}
                        onChange={async (e) => {
                          const next = await LauncherBridge.selectOfficialCape(
                            activeAccount.id,
                            e.target.value || null
                          );
                          onStateUpdated(next);
                        }}
                        className="w-full px-3 py-2 rounded-xl bg-elevated border border-border text-xs"
                      >
                        <option value="">No Cape</option>
                        {activeAccount.official_capes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.alias} Cape
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Persistent Previously Used Skins & Capes Wardrobe */}
            <div className="p-5 rounded-2xl bg-surface border border-border space-y-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
                  <History className="w-3.5 h-3.5" /> Previously Used Skins & Capes
                </span>
                <span className="text-[11px] text-muted font-mono">
                  SHA-256 Deduplicated Wardrobe
                </span>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium">Saved Skins ({skinsHistory.length})</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {skinsHistory.map((item) => {
                    const equipped = activeAccount.skin_sha256 === item.sha256;
                    return (
                      <motion.button
                        key={item.sha256}
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={async () => {
                          const next = await LauncherBridge.equipExistingWardrobeItem(
                            activeAccount.id,
                            item.sha256,
                            "skin",
                            item.variant
                          );
                          onStateUpdated(next);
                          onToast(`Equipped "${item.name}" from Wardrobe`);
                        }}
                        className={`p-3 rounded-xl border text-left flex items-center gap-2.5 ${
                          equipped
                            ? "bg-fg text-bg border-fg"
                            : "bg-elevated border-border"
                        }`}
                      >
                        <img
                          src={item.preview_data_url}
                          alt={item.name}
                          className="w-9 h-9 rounded-lg border border-border/40 bg-surface"
                          style={{ imageRendering: "pixelated" }}
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate">{item.name}</div>
                          <div className="text-[10px] opacity-75 capitalize">{item.variant}</div>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {activeAccount.account_type === "offline" && (
                <div className="space-y-2 pt-2 border-t border-border">
                  <div className="text-xs font-medium">Saved Capes ({capesHistory.length})</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    <button
                      type="button"
                      onClick={async () => {
                        const next = await LauncherBridge.equipExistingWardrobeItem(
                          activeAccount.id,
                          "",
                          "cape",
                          activeAccount.skin_variant
                        );
                        onStateUpdated(next);
                      }}
                      className={`p-3 rounded-xl border text-xs font-medium ${
                        !activeAccount.custom_cape_sha256
                          ? "bg-fg text-bg border-fg"
                          : "bg-elevated border-border"
                      }`}
                    >
                      None (Hide Cape)
                    </button>
                    {capesHistory.map((cape) => {
                      const equipped = activeAccount.custom_cape_sha256 === cape.sha256;
                      return (
                        <motion.button
                          key={cape.sha256}
                          whileTap={{ scale: 0.95 }}
                          onClick={async () => {
                            const next = await LauncherBridge.equipExistingWardrobeItem(
                              activeAccount.id,
                              cape.sha256,
                              "cape",
                              activeAccount.skin_variant
                            );
                            onStateUpdated(next);
                            onToast(`Equipped cape "${cape.name}"`);
                          }}
                          className={`p-3 rounded-xl border text-left flex items-center gap-2.5 ${
                            equipped
                              ? "bg-fg text-bg border-fg"
                              : "bg-elevated border-border"
                          }`}
                        >
                          <img
                            src={cape.preview_data_url}
                            alt={cape.name}
                            className="w-8 h-8 rounded border border-border/40"
                            style={{ imageRendering: "pixelated" }}
                          />
                          <span className="text-xs font-medium truncate">{cape.name}</span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
