import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, ChevronLeft, ChevronRight, Plus, RefreshCw, Trash2 } from "lucide-react";
import { LauncherBridge } from "../lib/bridge";
import { getDefaultSteveSkinDataUrl } from "../lib/defaultSteve";
import {
  ELASTIC_SPRING,
  type LauncherStateSnapshot,
  type SkinVariant,
  type WardrobeAssetKind,
} from "../types/launcher";
import { RubberSegment } from "./RubberSegment";
import { SkinHead } from "./SkinHead";
import { SkinViewer3D } from "./SkinViewer3D";

interface Props {
  state: LauncherStateSnapshot;
  onStateChange: (next: LauncherStateSnapshot) => void;
  onToast: (msg: string) => void;
}

export const WardrobeView: React.FC<Props> = ({ state, onStateChange, onToast }) => {
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [renderLeftContent, setRenderLeftContent] = useState(true);
  const [pendingSkinSyncRetry, setPendingSkinSyncRetry] = useState(false);
  const [retryingSkinSync, setRetryingSkinSync] = useState(false);
  const leftPanelRef = useRef<HTMLDivElement | null>(null);
  const collapseBtnRef = useRef<HTMLButtonElement | null>(null);
  const skinInputRef = useRef<HTMLInputElement | null>(null);
  const capeInputRef = useRef<HTMLInputElement | null>(null);
  const wardrobeReqSeqRef = useRef(0);

  const activeAccount =
    state.accounts.find((a) => a.active) ?? state.accounts[0];
  const isMicrosoft = activeAccount?.account_type === "microsoft";

  useEffect(() => {
    setPendingSkinSyncRetry(false);
  }, [activeAccount?.id]);

  const skinVariant = activeAccount?.skin_variant ?? "classic";

  const steveDataUrl = useMemo(() => getDefaultSteveSkinDataUrl(), []);

  const allSkins = useMemo(
    () => state.wardrobe.filter((w) => w.kind === "skin"),
    [state.wardrobe]
  );
  const savedSkins = useMemo(
    () => allSkins.filter((w) => w.preview_data_url !== steveDataUrl),
    [allSkins, steveDataUrl]
  );
  const savedCapes = useMemo(
    () => state.wardrobe.filter((w) => w.kind === "cape"),
    [state.wardrobe]
  );

  const activeSkinUrl = useMemo(() => {
    if (!activeAccount?.skin_sha256) return null;
    return (
      allSkins.find((s) => s.sha256 === activeAccount.skin_sha256)
        ?.preview_data_url ?? null
    );
  }, [activeAccount?.skin_sha256, allSkins]);

  const activeCapeUrl = useMemo(() => {
    if (!activeAccount) return null;
    if (!isMicrosoft && activeAccount.custom_cape_sha256) {
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
  }, [activeAccount, isMicrosoft, savedCapes]);

  const applyIfCurrent = (reqId: number, next: LauncherStateSnapshot) => {
    if (wardrobeReqSeqRef.current === reqId) {
      onStateChange(next);
    }
  };

  const refreshLatestStateAfterSyncError = async (
    reqId: number,
    err: unknown,
    markSkinRetry = false
  ) => {
    const message = String(err);
    onToast(message);
    if (markSkinRetry && isMicrosoft) {
      setPendingSkinSyncRetry(true);
    }
    try {
      const latest = await LauncherBridge.getState();
      applyIfCurrent(reqId, latest);
    } catch {
      // ignore fallback read failure
    }
  };

  const handleToggleCollapse = () => {
    if (!leftCollapsed) {
      if (
        typeof document !== "undefined" &&
        leftPanelRef.current?.contains(document.activeElement)
      ) {
        collapseBtnRef.current?.focus();
      }
      setLeftCollapsed(true);
    } else {
      setRenderLeftContent(true);
      setLeftCollapsed(false);
    }
  };

  const handleUploadPng = (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: WardrobeAssetKind
  ) => {
    const file = e.target.files?.[0];
    if (!file || !activeAccount) return;
    if (kind === "cape" && isMicrosoft) {
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const reqId = ++wardrobeReqSeqRef.current;
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
        if (kind === "skin" && wardrobeReqSeqRef.current === reqId) {
          setPendingSkinSyncRetry(false);
        }
        applyIfCurrent(reqId, next);
        onToast(`Added ${cleanName}`);
      } catch (err) {
        await refreshLatestStateAfterSyncError(reqId, err, kind === "skin");
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleEquipDefaultSteve = async () => {
    if (!activeAccount) return;
    const reqId = ++wardrobeReqSeqRef.current;
    try {
      const next = await LauncherBridge.importAndEquipWardrobePng(
        activeAccount.id,
        "Steve",
        steveDataUrl,
        "skin",
        skinVariant
      );
      if (wardrobeReqSeqRef.current === reqId) {
        setPendingSkinSyncRetry(false);
      }
      applyIfCurrent(reqId, next);
    } catch (err) {
      await refreshLatestStateAfterSyncError(reqId, err, true);
    }
  };

  const handleEquipSkin = async (sha256: string, variant: SkinVariant) => {
    if (!activeAccount) return;
    const reqId = ++wardrobeReqSeqRef.current;
    try {
      const next = await LauncherBridge.equipExistingWardrobeItem(
        activeAccount.id,
        sha256,
        "skin",
        variant
      );
      if (wardrobeReqSeqRef.current === reqId) {
        setPendingSkinSyncRetry(false);
      }
      applyIfCurrent(reqId, next);
    } catch (err) {
      await refreshLatestStateAfterSyncError(reqId, err, true);
    }
  };

  const handleSwitchVariant = async (nextVariant: SkinVariant) => {
    if (nextVariant === skinVariant && !pendingSkinSyncRetry) return;
    await handleEquipSkin(activeAccount?.skin_sha256 ?? "", nextVariant);
  };

  const handleRetrySkinSync = async () => {
    if (!activeAccount || retryingSkinSync) return;
    setRetryingSkinSync(true);
    try {
      await handleEquipSkin(activeAccount.skin_sha256 ?? "", skinVariant);
    } finally {
      setRetryingSkinSync(false);
    }
  };

  const handleEquipCape = async (sha256: string) => {
    if (!activeAccount || isMicrosoft) return;
    const reqId = ++wardrobeReqSeqRef.current;
    try {
      const next = await LauncherBridge.equipExistingWardrobeItem(
        activeAccount.id,
        sha256,
        "cape",
        skinVariant
      );
      applyIfCurrent(reqId, next);
    } catch (err) {
      await refreshLatestStateAfterSyncError(reqId, err);
    }
  };

  const handleRemoveAsset = async (
    e: React.MouseEvent,
    sha256: string,
    kind: WardrobeAssetKind
  ) => {
    e.stopPropagation();
    const reqId = ++wardrobeReqSeqRef.current;
    try {
      const next = await LauncherBridge.removeWardrobeItem(sha256, kind);
      applyIfCurrent(reqId, next);
    } catch (err) {
      onToast(String(err));
    }
  };

  useEffect(() => {
    if (leftCollapsed) return;

    let frame: number | null = null;
    let pointerX = 0;
    let pointerY = 0;

    const rotateHeads = () => {
      frame = null;
      const heads = Array.from(
        leftPanelRef.current?.querySelectorAll<HTMLElement>("[data-skin-head]") ?? []
      );
      const angles = heads.map((head) => {
        const { x, y, width, height } = head.parentElement!.getBoundingClientRect();
        return {
          yaw: Math.atan((pointerX - x - width / 2) / 80) * 34,
          pitch: -Math.atan((pointerY - y - height / 2) / 80) * 28,
        };
      });
      heads.forEach((head, index) => {
        head.style.setProperty("--head-yaw", `${angles[index].yaw}deg`);
        head.style.setProperty("--head-pitch", `${angles[index].pitch}deg`);
      });
    };

    const trackPointer = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      pointerX = event.clientX;
      pointerY = event.clientY;
      frame ??= window.requestAnimationFrame(rotateHeads);
    };

    window.addEventListener("pointermove", trackPointer, { passive: true });
    return () => {
      window.removeEventListener("pointermove", trackPointer);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [leftCollapsed]);

  const steveSelected =
    !activeAccount?.skin_sha256 || activeSkinUrl === steveDataUrl;

  return (
    <div className="wardrobe-frame relative flex overflow-hidden">
      <input
        ref={skinInputRef}
        type="file"
        accept="image/png"
        className="hidden"
        onChange={(e) => handleUploadPng(e, "skin")}
      />
      {!isMicrosoft && (
        <input
          ref={capeInputRef}
          type="file"
          accept="image/png"
          className="hidden"
          onChange={(e) => handleUploadPng(e, "cape")}
        />
      )}

      {/* LEFT 50% (Collapsible): Vertical 50/50 Split -> Top Skins / Bottom Capes */}
      <motion.div
        ref={leftPanelRef}
        aria-hidden={leftCollapsed}
        initial={false}
        animate={{
          width: leftCollapsed ? "0%" : "50%",
          opacity: leftCollapsed ? 0 : 1,
        }}
        transition={ELASTIC_SPRING}
        onAnimationComplete={() => {
          if (leftCollapsed) {
            setRenderLeftContent(false);
          }
        }}
        className={`h-full flex flex-col overflow-hidden ${
          leftCollapsed ? "pointer-events-none" : ""
        }`}
      >
        {renderLeftContent && !leftCollapsed && (
          <>
            {/* TOP 50%: SKINS */}
            <section className="h-1/2 min-h-0 flex flex-col">
              <div className="h-11 shrink-0 px-4 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold tracking-tight">Skins</span>

                <div className="flex items-center gap-1.5">
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
                    onClick={() => void handleEquipDefaultSteve()}
                    aria-pressed={steveSelected}
                    className={`p-2.5 relative rounded-2xl text-left transition-colors flex flex-col items-center gap-2 ${
                      steveSelected
                        ? "bg-accent/10"
                        : "hover:bg-elevated"
                    }`}
                  >
                    {steveSelected && <Check aria-hidden="true" className="absolute left-2 top-2 size-3.5 text-accent" />}
                    <SkinHead skinUrl={steveDataUrl} />
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
                        aria-pressed={selected}
                        onClick={() => void handleEquipSkin(skin.sha256, skin.variant)}
                        onKeyDown={(e) => {
                          if (e.target !== e.currentTarget) return;
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            void handleEquipSkin(skin.sha256, skin.variant);
                          }
                        }}
                        className={`group relative cursor-pointer p-2.5 rounded-2xl transition-colors flex flex-col items-center gap-2 ${
                          selected
                            ? "bg-accent/10"
                            : "hover:bg-elevated"
                        }`}
                      >
                        <button
                          type="button"
                          aria-label={`Remove ${skin.name}`}
                          onClick={(e) => void handleRemoveAsset(e, skin.sha256, "skin")}
                          className="opacity-0 group-hover:opacity-100 focus:opacity-100 absolute top-1.5 right-1.5 p-1 rounded-md bg-bg/85 border border-border text-muted hover:text-fg transition-opacity"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>

                        {selected && <Check aria-hidden="true" className="absolute left-2 top-2 size-3.5 text-accent" />}
                        <SkinHead skinUrl={skin.preview_data_url} />
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
            <section className="h-1/2 min-h-0 flex flex-col pt-3">
              <div className="h-11 shrink-0 px-4 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold tracking-tight">Capes</span>

                {!isMicrosoft && (
                  <button
                    type="button"
                    onClick={() => capeInputRef.current?.click()}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-fg text-bg text-[11px] font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                )}
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-3">
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                  {/* No Cape Option */}
                  <button
                    type="button"
                    onClick={async () => {
                      if (!activeAccount) return;
                      const hasCustomCape = Boolean(
                        activeAccount.custom_cape_sha256
                      );
                      const hasOfficialCape =
                        isMicrosoft && Boolean(activeAccount.official_cape_id);
                      if (!hasCustomCape && !hasOfficialCape) return;

                      const reqId = ++wardrobeReqSeqRef.current;
                      try {
                        let next: LauncherStateSnapshot | null = null;
                        if (hasCustomCape) {
                          next = await LauncherBridge.equipExistingWardrobeItem(
                            activeAccount.id,
                            "",
                            "cape",
                            skinVariant
                          );
                        }
                        if (hasOfficialCape) {
                          next = await LauncherBridge.selectOfficialCape(
                            activeAccount.id,
                            null
                          );
                        }
                        if (next) {
                          applyIfCurrent(reqId, next);
                        }
                      } catch (err) {
                        await refreshLatestStateAfterSyncError(reqId, err);
                      }
                    }}
                    className={`p-2.5 rounded-xl border transition-colors flex flex-col items-center justify-center gap-2 min-h-[84px] ${
                      (isMicrosoft || !activeAccount?.custom_cape_sha256) &&
                      !activeAccount?.official_cape_id
                        ? "border-fg bg-elevated"
                        : "border-border bg-surface hover:border-fg/40"
                    }`}
                  >
                    <span className="text-[11px] font-medium">None</span>
                  </button>

                  {/* Official Mojang Capes (when Microsoft account is active) */}
                  {isMicrosoft &&
                    activeAccount.official_capes.map((cape) => {
                      const selected = activeAccount.official_cape_id === cape.id;
                      return (
                        <button
                          key={cape.id}
                          type="button"
                          onClick={async () => {
                            const reqId = ++wardrobeReqSeqRef.current;
                            try {
                              const next = await LauncherBridge.selectOfficialCape(
                                activeAccount.id,
                                cape.id
                              );
                              applyIfCurrent(reqId, next);
                            } catch (err) {
                              await refreshLatestStateAfterSyncError(reqId, err);
                            }
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
                              <span className="text-[10px] font-mono text-muted">
                                CAPE
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] font-medium truncate w-full text-center">
                            {cape.alias}
                          </span>
                        </button>
                      );
                    })}

                  {/* Saved Custom Capes (Offline accounts only) */}
                  {!isMicrosoft &&
                    savedCapes.map((cape) => {
                      const selected =
                        activeAccount?.custom_cape_sha256 === cape.sha256;
                      return (
                        <div
                          key={cape.sha256}
                          role="button"
                          tabIndex={0}
                          onClick={() => void handleEquipCape(cape.sha256)}
                          onKeyDown={(e) => {
                            if (e.target !== e.currentTarget) return;
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
                            onClick={(e) =>
                              void handleRemoveAsset(e, cape.sha256, "cape")
                            }
                            className="opacity-0 group-hover:opacity-100 focus:opacity-100 absolute top-1.5 right-1.5 p-1 rounded-md bg-bg/85 border border-border text-muted hover:text-fg transition-opacity"
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
          </>
        )}
      </motion.div>

      {/* SIDE COLLAPSE / EXPAND BUTTON + RIGHT 50% (Expands to 100% when Left is collapsed): 3D ROTATABLE CHARACTER */}
      <div className="relative flex-1 h-full min-w-0 wardrobe-scene">
        <button
          ref={collapseBtnRef}
          type="button"
          aria-label={leftCollapsed ? "Expand skins and capes" : "Collapse skins and capes"}
          onClick={handleToggleCollapse}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-7 h-14 rounded-xl bg-surface flex items-center justify-center text-muted hover:text-fg shadow-md transition-colors"
        >
          {leftCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>

        <div className="absolute top-4 right-4 z-20 flex items-center gap-2 rounded-xl p-1.5">
          {isMicrosoft && pendingSkinSyncRetry && (
            <button
              type="button"
              disabled={retryingSkinSync || !activeAccount}
              onClick={() => void handleRetrySkinSync()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1.5 text-xs font-medium text-fg shadow-sm hover:bg-elevated disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${retryingSkinSync ? "animate-spin" : ""}`} />
              Retry sync
            </button>
          )}
          <span className="pl-1.5 text-xs font-medium text-muted">Arm model</span>
          <RubberSegment
            label="Skin arm model"
            items={[{ value: "classic", label: "Wide" }, { value: "slim", label: "Slim" }]}
            value={skinVariant}
            disabled={!activeAccount || retryingSkinSync}
            onChange={(variant) => void handleSwitchVariant(variant)}
          />
        </div>

        <SkinViewer3D
          skinUrl={activeSkinUrl}
          capeUrl={activeCapeUrl}
          variant={skinVariant}
          onDecodeError={onToast}
        />
      </div>
    </div>
  );
};

export default WardrobeView;
