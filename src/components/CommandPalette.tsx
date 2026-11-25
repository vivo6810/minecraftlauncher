import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Box,
  Command,
  Compass,
  FolderOpen,
  Image,
  Play,
  Search,
  Settings,
  Shield,
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
        id: "nav-modrinth",
        label: "Open Universal Modrinth Browser",
        hint: "Mods • Modpacks • Resource Packs • Shaders • Data Packs",
        icon: <Compass className="w-4 h-4" />,
        run: () => onNavigate("modrinth"),
      },
      {
        id: "nav-accounts",
        label: "Open Skin & Cape Wardrobe",
        hint: "Accounts • Custom .png Skins • Capes • History",
        icon: <User className="w-4 h-4" />,
        run: () => onNavigate("accounts"),
      },
      {
        id: "toggle-theme",
        label: "Switch Monotone Theme (Dark / Light)",
        hint: "Appearance",
        icon: <SunMoon className="w-4 h-4" />,
        run: () => onToggleTheme(),
      },
      {
        id: "nav-settings",
        label: "Configure Window Launch, Shield & Linux Gaming",
        hint: "Settings",
        icon: <Settings className="w-4 h-4" />,
        run: () => onNavigate("settings"),
      },
    ];

    for (const p of profiles) {
      items.push({
        id: `launch-${p.id}`,
        label: `Launch ${p.name}`,
        hint: `MC ${p.mc_version} • ${p.loader === "none" ? "Vanilla" : p.loader.toUpperCase()}`,
        icon: <Play className="w-4 h-4" />,
        run: () => onLaunchProfile(p),
      });
      items.push({
        id: `files-${p.id}`,
        label: `${p.name}: Open Built-in File Explorer & Config Editor`,
        hint: "Profile Directory",
        icon: <FolderOpen className="w-4 h-4" />,
        run: () => onOpenProfileTab(p, "files"),
      });
      items.push({
        id: `shots-${p.id}`,
        label: `${p.name}: View Screenshots Lightbox`,
        hint: "/screenshots",
        icon: <Image className="w-4 h-4" />,
        run: () => onOpenProfileTab(p, "screenshots"),
      });
      items.push({
        id: `shield-${p.id}`,
        label: `${p.name}: Run Twilight Shield .jar Malware Scan`,
        hint: "Security",
        icon: <Shield className="w-4 h-4" />,
        run: () => onOpenProfileTab(p, "shield"),
      });
    }

    for (const a of accounts) {
      items.push({
        id: `acct-${a.id}`,
        label: `Switch Account: ${a.username}`,
        hint: a.account_type === "microsoft" ? "Java Premium" : "Offline (authlib-injector)",
        icon: <Box className="w-4 h-4" />,
        run: () => onSwitchAccount(a.id),
      });
    }

    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) => i.label.toLowerCase().includes(q) || i.hint.toLowerCase().includes(q)
    );
  }, [query, profiles, accounts, onLaunchProfile, onOpenProfileTab, onNavigate, onSwitchAccount, onToggleTheme]);

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

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-start justify-center pt-24 px-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: -16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: -10 }}
            transition={ELASTIC_SPRING}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
              <Search className="w-4 h-4 text-muted shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                placeholder="Type a command, profile, account, or action..."
                className="w-full bg-transparent text-sm text-fg placeholder:text-muted focus:outline-none"
              />
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-elevated text-muted border border-border">
                ESC
              </span>
            </div>

            <div className="max-h-80 overflow-y-auto p-2 space-y-1">
              {commands.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted">
                  No matching commands found.
                </div>
              ) : (
                commands.map((cmd, idx) => {
                  const active = idx === selectedIndex;
                  return (
                    <motion.button
                      key={cmd.id}
                      type="button"
                      whileTap={{ scale: 0.985 }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      onClick={() => {
                        cmd.run();
                        onClose();
                      }}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                        active ? "bg-fg text-bg" : "text-fg hover:bg-elevated"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={active ? "text-bg" : "text-muted"}>{cmd.icon}</span>
                        <span className="text-xs font-medium truncate">{cmd.label}</span>
                      </div>
                      <span
                        className={`text-[11px] shrink-0 ${
                          active ? "text-bg/75" : "text-muted"
                        }`}
                      >
                        {cmd.hint}
                      </span>
                    </motion.button>
                  );
                })
              )}
            </div>

            <div className="px-4 py-2 border-t border-border bg-elevated/40 flex items-center justify-between text-[11px] text-muted">
              <span className="flex items-center gap-1.5">
                <Command className="w-3 h-3" /> Navigate with ↑↓ • Execute with Enter
              </span>
              <span className="font-mono">Twilight Command Palette</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
