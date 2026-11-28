import { useLayoutEffect, useRef, useState } from "react";

export function LiveLogs({ lines, onOpenFolder }: {
  lines: readonly string[];
  onOpenFolder: () => void;
}) {
  const [follow, setFollow] = useState(true);
  const scroll = useRef<HTMLPreElement>(null);
  useLayoutEffect(() => {
    if (follow && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [follow, lines]);

  return (
    <section aria-label="Live logs" className="space-y-3 rounded-2xl bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Live logs</h2>
        <div className="flex items-center gap-2 text-xs">
          <button type="button" aria-pressed={follow} onClick={() => setFollow(!follow)}
            className={`rounded-lg bg-elevated px-3 py-2 ${follow ? "text-accent" : "text-muted"}`}>Auto-scroll</button>
          <button type="button" onClick={onOpenFolder} className="rounded-lg bg-elevated px-3 py-2">Open logs folder</button>
        </div>
      </div>
      <pre ref={scroll} aria-label="Game output" tabIndex={0}
        className="h-[min(55vh,30rem)] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-bg p-4 text-xs leading-relaxed">
        {lines.length ? lines.join("\n") : "Launch this profile to see its live output."}
      </pre>
    </section>
  );
}
