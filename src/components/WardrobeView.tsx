import React, { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { LauncherBridge } from "../lib/bridge";
import { getDefaultSteveSkinDataUrl } from "../lib/defaultSteve";
import {
  ELASTIC_SPRING,
  type LauncherStateSnapshot,
  type SkinVariant,
  type WardrobeAssetKind,
} from "../types/launcher";
import { SkinViewer3D } from "./SkinViewer3D";

interface Props {
  state: LauncherStateSnapshot;
  onStateChange: (next: LauncherStateSnapshot) => void;
  onToast: (msg: string) => void;
}

export const WardrobeView: React.FC<Props> = ({ state, onStateChange, onToast }) => {
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const skinInputRef = useRef<HTMLInputElement | null>(null);
  const capeInputRef = useRef<HTMLInputElement | null>(null);

  const activeAccount =
    state.accounts.find((a) => a.active) ?? state.accounts[0];

  const [skinVariant, setSkinVariant] = useState<SkinVariant>(
    activeAccount?.skin_variant ?? "classic"
  );

  const steveDataUrl = useMemo(() => getDefaultSteveSkinDataUrl(), []);

  const savedSkins = useMemo(
    () => state.wardrobe.filter((w) => w.kind === "skin"),
    [state.wardrobe]
  );
  const savedCapes = useMemo(
    () => state.wardrobe.filter((w) => w.kind === "cape"),
    [state.wardrobe]
  );

  const activeSkinUrl = useMemo(() => {
    if (!activeAccount?.skin_sha256) return null;
    return (
      savedSkins.find((s) => s.sha256 === activeAccount.skin_sha256)
        ?.preview_data_url ?? null
    );
  }, [activeAccount?.skin_sha256, savedSkins]);

  const activeCapeUrl = useMemo(() => {
    if (!activeAccount) return null;
    if (activeAccount.custom_cape_sha256) {
      return (
        savedCapes.find((c) => c.sha256 === activeAccount.custom_cape_sha256)
          ?.preview_data_url ?? null
      );
    }
    if (activeAccount.official_cape_id) {
      return (
        activeAccount.official_capes.find(
          (c) => c.id === activeAccount.official_cape_id
        )?.url ?? null
      );
    }
    return null;
  }, [activeAccount, savedCapes]);

  const handleUploadPng = (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: WardrobeAssetKind
  ) => {
    const file = e.target.files?.[0];
    if (!file || !activeAccount) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const b64 = String(reader.result || "");
        const cleanName = file.name.replace(/\.png$/i, "");
        const next = await LauncherBridge.importAndEquipWardrobePng(
          activeAccount.id,
          cleanName,
          b64,
          kind,
          skinVariant
        );
        onStateChange(next);
        onToast(`Added ${cleanName}`);
      } catch (err) {
        onToast(String(err));
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleEquipSkin = async (sha256: string, variant: SkinVariant) => {
    if (!activeAccount) return;
    setSkinVariant(variant);
    const next = await LauncherBridge.equipExistingWardrobeItem(
      activeAccount.id,
      sha256,
      "skin",
      variant
    );
    onStateChange(next);
  };

  const handleSwitchVariant = async (nextVariant: SkinVariant) => {
    setSkinVariant(nextVariant);
    if (!activeAccount) return;
    const next = await LauncherBridge.equipExistingWardrobeItem(
      activeAccount.id,
      activeAccount.skin_sha256 ?? "",
      "skin",
      nextVariant
    );
    onStateChange(next);
  };

  const handleEquipCape = async (sha256: string) => {
    if (!activeAccount) return;
    const next = await LauncherBridge.equipExistingWardrobeItem(
      activeAccount.id,
      sha256,
      "cape",
      skinVariant
    );
    onStateChange(next);
  };

  const handleRemoveAsset = async (
    e: React.MouseEvent,
    sha256: string,
    kind: WardrobeAssetKind
  ) => {
    e.stopPropagation();
    const next = await LauncherBridge.removeWardrobeItem(sha256, kind);
    onStateChange(next);
  };

  return (
    <div className="relative h-full w-full flex overflow-hidden">
      <input
        ref={skinInputRef}
        type="file"
        accept="image/png"
        className="hidden"
        onChange={(e) => handleUploadPng(e, "skin")}
      />
      <input
        ref={capeInputRef}
        type="file"
        accept="image/png"
        className="hidden"
        onChange={(e) => handleUploadPng(e, "cape")}
      />

      {/* LEFT 50% (Collapsible): Vertical 50/50 Split -> Top Skins / Bottom Capes */}
      <motion.div
        initial={false}
        animate={{
          width: leftCollapsed ? "0%" : "50%",
          opacity: leftCollapsed ? 0 : 1,
        }}
        transition={ELASTIC_SPRING}
        className={`h-full flex flex-col overflow-hidden bg-surface/50 ${
          leftCollapsed ? "border-r-0 pointer-events-none" : "border-r border-border"
        }`}
      >
        {/* TOP 50%: SKINS */}
        <section className="h-1/2 min-h-0 flex flex-col border-b border-border">
          <div className="h-11 shrink-0 px-4 border-b border-border flex items-center justify-between gap-2">
            <span className="text-xs font-semibold tracking-tight">Skins</span>

            <div className="flex items-center gap-1.5">
              <div className="inline-flex p-0.5 rounded-lg bg-elevated border border-border">
                {(["classic", "slim"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => void handleSwitchVariant(v)}
                    className={`px-2 py-1 rounded-md text-[11px] font-medium capitalize transition-colors ${
                      skinVariant === v ? "bg-fg text-bg" : "text-muted hover:text-fg"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => skinInputRef.current?.click()}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-fg text-bg text-[11px] font-semibold"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-3">
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
              {/* Default Steve Card */}
              <button
                type="button"
                onClick={() => void handleEquipSkin("", "classic")}
                className={`p-2.5 rounded-xl border text-left transition-colors flex flex-col items-center gap-2 ${
                  !activeAccount?.skin_sha256
                    ? "border-fg bg-elevated"
                    : "border-border bg-surface hover:border-fg/40"
                }`}
              >
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-elevated border border-border flex items-center justify-center">
                  <img
                    src={steveDataUrl}
                    alt="Steve"
                    className="w-12 h-12 object-none"
                    style={{
                      imageRendering: "pixelated",
                      objectPosition: "-8px -8px",
                      transform: "scale(6)",
                      transformOrigin: "8px 8px",
                    }}
                  />
                </div>
                <span className="text-[11px] font-medium truncate w-full text-center">
                  Steve
                </span>
              </button>

              {/* Saved Skins */}
              {savedSkins.map((skin) => {
                const selected = activeAccount?.skin_sha256 === skin.sha256;
                return (
                  <div
                    key={skin.sha256}
                    role="button"
                    tabIndex={0}
                    onClick={() => void handleEquipSkin(skin.sha256, skin.variant)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        void handleEquipSkin(skin.sha256, skin.variant);
                      }
                    }}
                    className={`group relative cursor-pointer p-2.5 rounded-xl border transition-colors flex flex-col items-center gap-2 ${
                      selected
                        ? "border-fg bg-elevated"
                        : "border-border bg-surface hover:border-fg/40"
                    }`}
                  >
                    <button
                      type="button"
                      aria-label={`Remove ${skin.name}`}
                      onClick={(e) => void handleRemoveAsset(e, skin.sha256, "skin")}
                      className="opacity-0 group-hover:opacity-100 absolute top-1.5 right-1.5 p-1 rounded-md bg-bg/85 border border-border text-muted hover:text-fg transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>

                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-elevated border border-border flex items-center justify-center">
                      <img
                        src={skin.preview_data_url}
                        alt={skin.name}
                        className="w-12 h-12 object-contain"
                        style={{ imageRendering: "pixelated" }}
                      />
                    </div>
                    <span className="text-[11px] font-medium truncate w-full text-center">
                      {skin.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* BOTTOM 50%: CAPES */}
        <section className="h-1/2 min-h-0 flex flex-col">
          <div className="h-11 shrink-0 px-4 border-b border-border flex items-center justify-between gap-2">
            <span className="text-xs font-semibold tracking-tight">Capes</span>

            <button
              type="button"
              onClick={() => capeInputRef.current?.click()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-fg text-bg text-[11px] font-semibold"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-3">
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
              {/* No Cape Option */}
              <button
                type="button"
                onClick={async () => {
                  if (!activeAccount) return;
                  let next = await LauncherBridge.equipExistingWardrobeItem(
                    activeAccount.id,
                    "",
                    "cape",
                    skinVariant
                  );
                  if (activeAccount.account_type === "microsoft" && activeAccount.official_cape_id) {
                    next = await LauncherBridge.selectOfficialCape(activeAccount.id, null);
                  }
                  onStateChange(next);
                }}
                className={`p-2.5 rounded-xl border transition-colors flex flex-col items-center justify-center gap-2 min-h-[84px] ${
                  !activeAccount?.custom_cape_sha256 && !activeAccount?.official_cape_id
                    ? "border-fg bg-elevated"
                    : "border-border bg-surface hover:border-fg/40"
                }`}
              >
                <span className="text-[11px] font-medium">None</span>
              </button>

              {/* Official Mojang Capes (when Microsoft account is active) */}
              {activeAccount?.account_type === "microsoft" &&
                activeAccount.official_capes.map((cape) => {
                  const selected =
                    !activeAccount.custom_cape_sha256 &&
                    activeAccount.official_cape_id === cape.id;
                  return (
                    <button
                      key={cape.id}
                      type="button"
                      onClick={async () => {
                        await LauncherBridge.equipExistingWardrobeItem(
                          activeAccount.id,
                          "",
                          "cape",
                          skinVariant
                        );
                        const next = await LauncherBridge.selectOfficialCape(
                          activeAccount.id,
                          cape.id
                        );
                        onStateChange(next);
                      }}
                      className={`p-2.5 rounded-xl border transition-colors flex flex-col items-center gap-2 ${
                        selected
                          ? "border-fg bg-elevated"
                          : "border-border bg-surface hover:border-fg/40"
                      }`}
                    >
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-elevated border border-border flex items-center justify-center">
                        {cape.url ? (
                          <img
                            src={cape.url}
                            alt={cape.alias}
                            className="w-12 h-12 object-contain"
                            style={{ imageRendering: "pixelated" }}
                          />
                        ) : (
                          <span className="text-[10px] font-mono text-muted">CAPE</span>
                        )}
                      </div>
                      <span className="text-[11px] font-medium truncate w-full text-center">
                        {cape.alias}
                      </span>
                    </button>
                  );
                })}

              {/* Saved Custom Capes */}
              {savedCapes.map((cape) => {
                const selected = activeAccount?.custom_cape_sha256 === cape.sha256;
                return (
                  <div
                    key={cape.sha256}
                    role="button"
                    tabIndex={0}
                    onClick={() => void handleEquipCape(cape.sha256)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        void handleEquipCape(cape.sha256);
                      }
                    }}
                    className={`group relative cursor-pointer p-2.5 rounded-xl border transition-colors flex flex-col items-center gap-2 ${
                      selected
                        ? "border-fg bg-elevated"
                        : "border-border bg-surface hover:border-fg/40"
                    }`}
                  >
                    <button
                      type="button"
                      aria-label={`Remove ${cape.name}`}
                      onClick={(e) => void handleRemoveAsset(e, cape.sha256, "cape")}
                      className="opacity-0 group-hover:opacity-100 absolute top-1.5 right-1.5 p-1 rounded-md bg-bg/85 border border-border text-muted hover:text-fg transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>

                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-elevated border border-border flex items-center justify-center">
                      <img
                        src={cape.preview_data_url}
                        alt={cape.name}
                        className="w-12 h-12 object-contain"
                        style={{ imageRendering: "pixelated" }}
                      />
                    </div>
                    <span className="text-[11px] font-medium truncate w-full text-center">
                      {cape.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </motion.div>

      {/* SIDE COLLAPSE / EXPAND BUTTON + RIGHT 50% (Expands to 100% when Left is collapsed): 3D ROTATABLE CHARACTER */}
      <div className="relative flex-1 h-full min-w-0 bg-bg">
        <button
          type="button"
          aria-label={leftCollapsed ? "Expand skins and capes" : "Collapse skins and capes"}
          onClick={() => setLeftCollapsed((v) => !v)}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-7 h-14 rounded-xl bg-surface border border-border flex items-center justify-center text-muted hover:text-fg shadow-md transition-colors"
        >
          {leftCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>

        <SkinViewer3D
          skinUrl={activeSkinUrl}
          capeUrl={activeCapeUrl}
          variant={skinVariant}
        />
      </div>
    </div>
  );
};

export default WardrobeView;

