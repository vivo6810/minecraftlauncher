import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, CheckCircle2, Loader2, ShieldCheck, Square } from "lucide-react";
import { ISLAND_SPRING, type IslandActivity } from "../types/launcher";

interface Props {
  island: IslandActivity;
  shieldActiveCount: number;
  onStopSimulatedRun?: () => void;
}

export const DynamicIsland: React.FC<Props> = ({
  island,
  shieldActiveCount,
  onStopSimulatedRun,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (!island.runningProfileName || !island.startedAtMs) {
      setElapsedSec(0);
      return;
    }
    const tick = () => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - island.startedAtMs!) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [island.runningProfileName, island.startedAtMs]);

  const formatTimer = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
  };

  const isBusy = island.active || Boolean(island.runningProfileName);

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-auto select-none">
      <motion.div
        layout
        transition={ISLAND_SPRING}
        onClick={() => setExpanded((v) => !v)}
        whileHover={{ scale: 1.025 }}
        whileTap={{ scale: 0.96 }}
        className="cursor-pointer bg-fg text-bg rounded-full shadow-2xl border border-border/30 overflow-hidden"
        style={{
          borderRadius: expanded ? 22 : 9999,
        }}
      >
        <motion.div
          layout
          transition={ISLAND_SPRING}
          className={`flex items-center gap-3 ${
            expanded ? "px-5 py-3.5 min-w-[360px]" : isBusy ? "px-4 py-2 min-w-[270px]" : "px-3.5 py-1.5"
          }`}
        >
          {island.active ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          ) : island.runningProfileName ? (
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-bg opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-bg" />
            </span>
          ) : (
            <ShieldCheck className="w-3.5 h-3.5 shrink-0 opacity-85" />
          )}

          <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
            <span className="text-xs font-medium tracking-tight truncate">
              {island.active
                ? island.status
                : island.runningProfileName
                ? `${island.runningProfileName} • Running`
                : `TwilightLauncher • Shield ${shieldActiveCount}/3`}
            </span>

            {island.runningProfileName && !island.active && (
              <span className="font-mono text-[11px] opacity-80 shrink-0">
                {formatTimer(elapsedSec)}
              </span>
            )}

            {island.active && (
              <span className="font-mono text-[11px] opacity-80 shrink-0">
                {Math.round(island.progress * 100)}%
              </span>
            )}
          </div>
        </motion.div>

        {island.active && (
          <div className="w-full h-1 bg-bg/20">
            <motion.div
              className="h-full bg-bg"
              initial={{ width: "4%" }}
              animate={{ width: `${Math.max(5, Math.round(island.progress * 100))}%` }}
              transition={{ type: "spring", stiffness: 260, damping: 28 }}
            />
          </div>
        )}

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={ISLAND_SPRING}
              className="px-5 pb-4 pt-1 border-t border-bg/15 text-[11px] space-y-2"
            >
              <div className="flex items-center justify-between opacity-80">
                <span className="flex items-center gap-1.5">
                  <Activity className="w-3 h-3" />
                  Engine Footprint: ~92 MB RAM (Tauri v2 + Rust)
                </span>
                <span className="font-mono">Ctrl+K</span>
              </div>

              {island.runningProfileName ? (
                <div className="flex items-center justify-between pt-1">
                  <span className="opacity-90">
                    Token Vault & Sandbox isolating JVM
                  </span>
                  {onStopSimulatedRun && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onStopSimulatedRun();
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-bg text-fg font-medium hover:opacity-90"
                    >
                      <Square className="w-3 h-3" /> Stop Instance
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 opacity-85">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Idle • Ready for instant concurrent launch</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
