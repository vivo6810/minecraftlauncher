import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Box,
  Compass,
  FolderOpen,
  Home,
  Play,
  Search,
  Settings,
  SunMoon,
  User,
} from "lucide-react";
import { ELASTIC_SPRING, type Account, type Profile } from "../types/launcher";

interface CommandItem {
  id: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
  run: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  profiles: Profile[];
  accounts: Account[];
  onLaunchProfile: (profile: Profile) => void;
  onOpenProfileTab: (profile: Profile, tab: string) => void;
  onNavigate: (screen: string) => void;
  onSwitchAccount: (accountId: string) => void;
  onToggleTheme: () => void;
}

export const CommandPalette: React.FC<Props> = ({
  open,
  onClose,
  profiles,
  accounts,
  onLaunchProfile,
  onOpenProfileTab,
  onNavigate,
  onSwitchAccount,
  onToggleTheme,
}) => {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [open]);

  const commands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [
      {
        id: "nav-home",
        label: "Profiles",
        hint: "Start",
        icon: <Home className="w-4 h-4" />,
        run: () => onNavigate("home"),
      },
      {
        id: "nav-modrinth",
        label: "Modrinth",
        hint: "Browse",
        icon: <Compass className="w-4 h-4" />,
        run: () => onNavigate("modrinth"),
      },
      {
        id: "nav-accounts",
        label: "Wardrobe",
        hint: "Skins & Capes",
        icon: <User className="w-4 h-4" />,
        run: () => onNavigate("accounts"),
      },
      {
        id: "nav-settings",
        label: "Settings",
        hint: "Preferences",
        icon: <Settings className="w-4 h-4" />,
        run: () => onNavigate("settings"),
      },
      {
        id: "toggle-theme",
        label: "Toggle Theme",
        hint: "Dark / Light",
        icon: <SunMoon className="w-4 h-4" />,
        run: () => onToggleTheme(),
      },
    ];

    for (const p of profiles) {
      items.push({
        id: `launch-${p.id}`,
        label: `Play ${p.name}`,
        hint: p.mc_version,
        icon: <Play className="w-4 h-4" />,
        run: () => onLaunchProfile(p),
      });
      items.push({
        id: `files-${p.id}`,
        label: `${p.name} Files`,
        hint: "Explorer",
        icon: <FolderOpen className="w-4 h-4" />,
        run: () => onOpenProfileTab(p, "files"),
      });
    }

    for (const a of accounts) {
      items.push({
        id: `acct-${a.id}`,
        label: `Account: ${a.username}`,
        hint: a.account_type === "microsoft" ? "Java" : "Offline",
        icon: <Box className="w-4 h-4" />,
        run: () => onSwitchAccount(a.id),
      });
    }

    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.label.toLowerCase().includes(q) || i.hint.toLowerCase().includes(q)
    );
  }, [
    query,
    profiles,
    accounts,
    onLaunchProfile,
    onOpenProfileTab,
    onNavigate,
    onSwitchAccount,
    onToggleTheme,
  ]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(commands.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter" && commands[selectedIndex]) {
        e.preventDefault();
        commands[selectedIndex].run();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, commands, selectedIndex, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[100] bg-black/65 backdrop-blur-md flex items-start justify-center pt-24 px-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: -8 }}
            transition={ELASTIC_SPRING}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <Search className="w-4 h-4 text-muted shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                placeholder="Search..."
                className="w-full bg-transparent text-xs text-fg placeholder:text-muted focus:outline-none"
              />
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-elevated text-muted border border-border">
                ESC
              </span>
            </div>

            <div className="max-h-72 overflow-y-auto p-2 space-y-1">
              {commands.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted">No results</div>
              ) : (
                commands.map((cmd, idx) => {
                  const active = idx === selectedIndex;
                  return (
                    <button
                      key={cmd.id}
                      type="button"
                      onMouseEnter={() => setSelectedIndex(idx)}
                      onClick={() => {
                        cmd.run();
                        onClose();
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors ${
                        active ? "bg-fg text-bg" : "text-fg hover:bg-elevated"
                      }`}
                    >
                      <span className="flex items-center gap-2.5 font-medium">
                        {cmd.icon}
                        <span>{cmd.label}</span>
                      </span>
                      <span
                        className={`text-[10px] font-mono ${
                          active ? "text-bg/75" : "text-muted"
                        }`}
                      >
                        {cmd.hint}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};
