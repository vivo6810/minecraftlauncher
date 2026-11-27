import React from "react";
import { Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauriDesktop } from "../lib/bridge";

export const TitleBar: React.FC = () => {
  const handleDragMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !isTauriDesktop()) return;
    const target = e.target as HTMLElement;
    if (target.closest("button")) return;
    if (e.detail === 2) {
      void getCurrentWindow().toggleMaximize();
    } else {
      void getCurrentWindow().startDragging();
    }
  };

  const handleMinimize = () => {
    if (isTauriDesktop()) {
      void getCurrentWindow().minimize();
    }
  };

  const handleToggleMaximize = () => {
    if (isTauriDesktop()) {
      void getCurrentWindow().toggleMaximize();
    }
  };

  const handleClose = () => {
    if (isTauriDesktop()) {
      void getCurrentWindow().close();
    }
  };

  return (
    <header
      onMouseDown={handleDragMouseDown}
      className="h-9 shrink-0 w-full bg-surface border-b border-border flex items-center justify-between pl-3.5 pr-1 select-none z-40"
    >
      <div className="flex items-center gap-2 pointer-events-none">
        <div className="w-4 h-4 rounded bg-fg text-bg flex items-center justify-center font-mono font-black text-[9px]">
          TL
        </div>
        <span className="text-xs font-semibold tracking-tight text-fg">
          TwilightLauncher
        </span>
      </div>

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label="Minimize window"
          onClick={handleMinimize}
          className="w-8 h-7 rounded-md flex items-center justify-center text-muted hover:text-fg hover:bg-elevated transition-colors"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          aria-label="Maximize window"
          onClick={handleToggleMaximize}
          className="w-8 h-7 rounded-md flex items-center justify-center text-muted hover:text-fg hover:bg-elevated transition-colors"
        >
          <Square className="w-3 h-3" />
        </button>
        <button
          type="button"
          aria-label="Close window"
          onClick={handleClose}
          className="w-8 h-7 rounded-md flex items-center justify-center text-muted hover:text-fg hover:bg-elevated transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
