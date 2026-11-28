import { useEffect, useState } from "react";
import type { LauncherSettings } from "../types/launcher";

async function readBackground(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 1920 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is unavailable.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL("image/webp", 0.82);
    if (!/^data:image\/(webp|png);base64,/.test(result) || result.length > 2_000_000) {
      throw new Error("Choose a smaller background image.");
    }
    return result;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function BackgroundSettings({ settings, onSave }: {
  settings: LauncherSettings;
  onSave: (image: string | null, blur: number) => Promise<void>;
}) {
  const savedBlur = settings.background_blur ?? 0;
  const image = settings.background_image;
  const [blur, setBlur] = useState(savedBlur);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setBlur(savedBlur), [savedBlur]);

  const update = async (getImage: () => Promise<string | null>, nextBlur: number) => {
    setBusy(true);
    setError("");
    try {
      await onSave(await getImage(), nextBlur);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-2">
      <h3 className="px-1 text-xs font-mono uppercase tracking-wider text-muted">Background</h3>
      <div className="space-y-4 rounded-2xl bg-surface p-5">
        <div className="flex flex-wrap items-center gap-3">
          <input aria-label="Background image" className="min-w-0 max-w-full text-xs file:mr-3 file:rounded-lg file:bg-elevated file:px-3 file:py-2 file:text-fg"
            type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" disabled={busy}
            onChange={event => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void update(() => readBackground(file), blur);
            }}
          />
          {image && <button type="button" className="rounded-lg bg-elevated px-3 py-2 text-xs" disabled={busy}
            onClick={() => void update(async () => null, 0)}>Remove background</button>}
        </div>
        {image && <>
          <div className="h-24 overflow-hidden rounded-xl bg-bg">
            <img src={image} alt="Background preview" className="h-full w-full object-cover" style={{ filter: `blur(${blur}px)`, transform: "scale(1.15)" }} />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label htmlFor="background-blur">Blur · {blur} px</label>
            <input id="background-blur" type="range" min="0" max="32" value={blur} disabled={busy}
              className="accent-accent" onChange={event => setBlur(event.currentTarget.valueAsNumber)} />
            <button type="button" className="rounded-lg bg-elevated px-3 py-2 disabled:opacity-50" disabled={busy || blur === savedBlur}
              onClick={() => void update(async () => image, blur)}>Apply blur</button>
          </div>
        </>}
        {error && <p role="alert" className="text-xs text-muted">{error}</p>}
      </div>
    </section>
  );
}
