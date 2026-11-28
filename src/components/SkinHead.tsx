import { useEffect, useState } from "react";

const faces = [
  { name: "front", x: 8, y: 8, rotation: "" },
  { name: "back", x: 24, y: 8, rotation: "rotateY(180deg)" },
  { name: "right", x: 16, y: 8, rotation: "rotateY(90deg)" },
  { name: "left", x: 0, y: 8, rotation: "rotateY(-90deg)" },
  { name: "top", x: 8, y: 0, rotation: "rotateX(90deg)" },
  { name: "bottom", x: 16, y: 0, rotation: "rotateX(-90deg)" },
];

const normalizedSkinCache = new Map<string, string>();
const MAX_NORMALIZED_CACHE = 128;

async function normalizeSkinHeadTexture(src: string): Promise<string> {
  const cached = normalizedSkinCache.get(src);
  if (cached) return cached;

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = src;
  await img.decode();

  const scale = Math.max(1, Math.round(img.naturalWidth / 64));
  const canvas = document.createElement("canvas");
  canvas.width = 64 * scale;
  canvas.height = 64 * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return src;

  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);

  const hatX = 32 * scale;
  const hatW = 32 * scale;
  const hatH = 16 * scale;
  const hatPixels = ctx.getImageData(hatX, 0, hatW, hatH).data;
  let hasTransparency = false;
  for (let i = 3; i < hatPixels.length; i += 4) {
    if (hatPixels[i] < 255) {
      hasTransparency = true;
      break;
    }
  }
  if (!hasTransparency) {
    ctx.clearRect(hatX, 0, hatW, hatH);
  }

  const normalized = canvas.toDataURL("image/png");
  if (normalizedSkinCache.size >= MAX_NORMALIZED_CACHE) {
    const oldest = normalizedSkinCache.keys().next().value;
    if (oldest !== undefined) normalizedSkinCache.delete(oldest);
  }
  normalizedSkinCache.set(src, normalized);
  return normalized;
}

export function SkinHead({ skinUrl }: { skinUrl: string }) {
  const [resolvedUrl, setResolvedUrl] = useState<string>(
    () => normalizedSkinCache.get(skinUrl) ?? skinUrl
  );

  useEffect(() => {
    const cached = normalizedSkinCache.get(skinUrl);
    if (cached) {
      setResolvedUrl(cached);
      return;
    }
    setResolvedUrl(skinUrl);
    let active = true;
    void normalizeSkinHeadTexture(skinUrl)
      .then((url) => {
        if (active) setResolvedUrl(url);
      })
      .catch(() => {
        if (active) setResolvedUrl(skinUrl);
      });
    return () => {
      active = false;
    };
  }, [skinUrl]);

  const safeCssUrl = resolvedUrl.replace(/["\\\r\n]/g, "");

  return (
    <div aria-hidden="true" className="grid size-14 shrink-0 place-items-center [perspective:140px]">
      <div
        data-skin-head
        className="relative size-8 [transform-style:preserve-3d] [transform:rotateX(var(--head-pitch,-12deg))_rotateY(var(--head-yaw,-20deg))] transition-transform duration-150 ease-out motion-reduce:transition-none motion-reduce:[transform:rotateX(-12deg)_rotateY(-20deg)]"
      >
        {faces.map(({ name, x, y, rotation }) => (
          <div
            key={name}
            className="absolute inset-0 [backface-visibility:hidden] [image-rendering:pixelated] bg-no-repeat"
            style={{
              transform: `${rotation} translateZ(16px)`,
              backgroundImage: `url("${safeCssUrl}")`,
              backgroundSize: "256px 256px",
              backgroundPosition: `${-x * 4}px ${-y * 4}px`,
            }}
          >
            <div
              className="absolute inset-0 bg-no-repeat"
              style={{
                backgroundImage: `url("${safeCssUrl}")`,
                backgroundSize: "256px 256px",
                backgroundPosition: `${-(x + 32) * 4}px ${-y * 4}px`,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
