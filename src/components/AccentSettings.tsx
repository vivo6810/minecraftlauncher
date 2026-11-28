import { useState } from "react";
import type { PointerEvent } from "react";
import { DEFAULT_ACCENT, hexFromHsl, hslFromHex } from "../lib/accent";

export function AccentSettings({ color, onSave }: {
  color?: string | null;
  onSave: (color: string | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [hsl, setHsl] = useState<[number, number, number]>(() => hslFromHex(color ?? DEFAULT_ACCENT));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hue, saturation, lightness] = hsl;
  const radians = hue * Math.PI / 180;
  const draft = hexFromHsl(...hsl);
  const updateWheel = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * 2 / bounds.width - 1;
    const y = (event.clientY - bounds.top) * 2 / bounds.height - 1;
    setHsl([(Math.atan2(y, x) * 180 / Math.PI + 450) % 360, Math.min(100, Math.hypot(x, y) * 100), lightness]);
  };
  const save = async (next: string | null) => {
    setBusy(true);
    setError("");
    try {
      await onSave(next);
      setOpen(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-2">
      <h3 className="px-1 text-xs font-mono uppercase tracking-wider text-muted">Accent colour</h3>
      <div className="rounded-2xl bg-surface p-5">
        <button type="button" aria-expanded={open} className="inline-flex items-center gap-2 rounded-xl bg-elevated px-3 py-2 text-xs"
          onClick={() => {
            setHsl(hslFromHex(color ?? DEFAULT_ACCENT));
            setError("");
            setOpen(!open);
          }}>
          <span className="size-3.5 rounded-full border border-fg/25 bg-accent" aria-hidden="true" /> Choose accent colour
        </button>
        {open && <div className="mt-5 flex flex-wrap items-center gap-5">
          <div aria-hidden="true" className="accent-wheel relative size-40 shrink-0 cursor-crosshair touch-none rounded-full"
            onPointerDown={event => {
              if (busy || event.button !== 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              updateWheel(event);
            }}
            onPointerMove={event => {
              if (!busy && event.currentTarget.hasPointerCapture(event.pointerId)) updateWheel(event);
            }}>
            <div className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-black shadow"
              style={{ left: `${50 + Math.sin(radians) * saturation / 2}%`, top: `${50 - Math.cos(radians) * saturation / 2}%` }} />
          </div>
          <div className="min-w-36 space-y-2 text-xs">
            {(["Hue", "Saturation", "Lightness"] as const).map((label, index) => (
              <label key={label} className="grid grid-cols-[4.5rem_1fr] items-center gap-2">
                {label}
                <input type="range" className="accent-accent" min="0" max={index === 0 ? 359 : 100}
                  value={Math.round(hsl[index])} disabled={busy}
                  onChange={event => {
                    const next: typeof hsl = [...hsl];
                    next[index] = event.currentTarget.valueAsNumber;
                    setHsl(next);
                  }} />
              </label>
            ))}
            <div className="flex items-center gap-2 font-mono">
              <span className="size-4 rounded-full border border-fg/25" style={{ background: draft }} aria-hidden="true" />
              <output>{draft}</output>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} className="rounded-lg bg-elevated px-3 py-2" onClick={() => void save(draft)}>Apply accent</button>
              <button type="button" disabled={busy} className="rounded-lg px-3 py-2 text-muted" onClick={() => void save(null)}>Reset to forest green</button>
            </div>
            {error && <p role="alert" className="text-muted">{error}</p>}
          </div>
        </div>}
      </div>
    </section>
  );
}
