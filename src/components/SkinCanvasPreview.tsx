import React, { useEffect, useRef, useState } from "react";
import type { SkinVariant } from "../types/launcher";

interface Props {
  skinDataUrl: string | null;
  capeDataUrl: string | null;
  variant: SkinVariant;
  username: string;
}

/**
 * Ultra-lightweight HTML5 Canvas 2.5D Isometric Character & Waving Cape Renderer.
 * Zero WebGL/Three.js bundle overhead — renders both Front & Back (Cape) views smoothly.
 */
export const SkinCanvasPreview: React.FC<Props> = ({
  skinDataUrl,
  capeDataUrl,
  variant,
  username,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showBack, setShowBack] = useState(false);

  useEffect(() => {
    let animId = 0;
    const skinImg = new Image();
    const capeImg = new Image();
    if (skinDataUrl) skinImg.src = skinDataUrl;
    if (capeDataUrl) capeImg.src = capeDataUrl;

    const render = (t: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const bob = Math.sin(t * 0.0028) * 4;
      const armSwing = Math.sin(t * 0.0032) * 3;
      const scale = 6;
      const cx = canvas.width / 2;
      const topY = 34 + bob;
      const armWidth = variant === "slim" ? 3 * scale : 4 * scale;
      const bodyW = 8 * scale;
      const bodyH = 12 * scale;
      const headSize = 8 * scale;

      // Ground shadow
      ctx.fillStyle = "rgba(128,128,138,0.22)";
      ctx.beginPath();
      ctx.ellipse(cx, 238, 42, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      const hasSkin = Boolean(skinDataUrl && skinImg.complete && skinImg.naturalWidth >= 32);
      const hasCape = Boolean(capeDataUrl && capeImg.complete && capeImg.naturalWidth >= 16);

      // Draw cape behind character if viewing front, or in front if viewing back
      const drawCape = () => {
        if (!capeDataUrl) return;
        const capeW = 10 * scale;
        const capeH = 16 * scale;
        const wave = Math.sin(t * 0.004) * 3;
        ctx.save();
        ctx.translate(cx - capeW / 2 + wave * 0.5, topY + headSize + 2);
        if (hasCape) {
          ctx.drawImage(capeImg, 1, 1, 10, 16, 0, 0, capeW, capeH);
        } else {
          ctx.fillStyle = "#e4e4e7";
          ctx.fillRect(0, 0, capeW, capeH);
          ctx.fillStyle = "#18181b";
          ctx.fillRect(4, 4, capeW - 8, capeH - 8);
        }
        ctx.restore();
      };

      if (!showBack) drawCape();

      // Head
      const headX = cx - headSize / 2;
      if (hasSkin) {
        const sx = showBack ? 24 : 8;
        ctx.drawImage(skinImg, sx, 8, 8, 8, headX, topY, headSize, headSize);
      } else {
        ctx.fillStyle = "#e4e4e7";
        ctx.fillRect(headX, topY, headSize, headSize);
        if (!showBack) {
          ctx.fillStyle = "#09090b";
          ctx.fillRect(headX + scale, topY + 4 * scale, 2 * scale, scale * 1.5);
          ctx.fillRect(headX + 5 * scale, topY + 4 * scale, 2 * scale, scale * 1.5);
        }
      }

      // Torso
      const bodyX = cx - bodyW / 2;
      const bodyY = topY + headSize;
      if (hasSkin) {
        const sx = showBack ? 32 : 20;
        ctx.drawImage(skinImg, sx, 20, 8, 12, bodyX, bodyY, bodyW, bodyH);
      } else {
        ctx.fillStyle = "#27272e";
        ctx.fillRect(bodyX, bodyY, bodyW, bodyH);
      }

      // Left & Right Arms
      const leftArmX = bodyX - armWidth - 2;
      const rightArmX = bodyX + bodyW + 2;
      if (hasSkin) {
        const wSrc = variant === "slim" ? 3 : 4;
        ctx.drawImage(skinImg, 44, 20, wSrc, 12, leftArmX, bodyY + armSwing, armWidth, bodyH);
        ctx.drawImage(skinImg, 44, 20, wSrc, 12, rightArmX, bodyY - armSwing, armWidth, bodyH);
      } else {
        ctx.fillStyle = "#52525b";
        ctx.fillRect(leftArmX, bodyY + armSwing, armWidth, bodyH);
        ctx.fillRect(rightArmX, bodyY - armSwing, armWidth, bodyH);
      }

      // Legs
      const legW = 4 * scale;
      const legH = 12 * scale;
      const legY = bodyY + bodyH;
      if (hasSkin) {
        ctx.drawImage(skinImg, 4, 20, 4, 12, cx - legW, legY - armSwing * 0.5, legW - 1, legH);
        ctx.drawImage(skinImg, 4, 20, 4, 12, cx + 1, legY + armSwing * 0.5, legW - 1, legH);
      } else {
        ctx.fillStyle = "#18181b";
        ctx.fillRect(cx - legW, legY - armSwing * 0.5, legW - 1, legH);
        ctx.fillRect(cx + 1, legY + armSwing * 0.5, legW - 1, legH);
      }

      if (showBack) drawCape();

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [skinDataUrl, capeDataUrl, variant, showBack]);

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-full flex flex-col items-center justify-center bg-elevated/50 border border-border rounded-2xl p-4">
        <div className="absolute top-3 left-3 text-[11px] font-mono text-muted px-2 py-0.5 rounded bg-surface border border-border">
          {username} • {variant.toUpperCase()}
        </div>
        <button
          type="button"
          onClick={() => setShowBack((v) => !v)}
          className="absolute top-3 right-3 text-[11px] font-medium px-2.5 py-1 rounded-lg bg-surface border border-border hover:bg-fg hover:text-bg transition-colors"
        >
          {showBack ? "Show Front" : "Inspect Cape (Back)"}
        </button>
        <canvas ref={canvasRef} width={220} height={260} className="mt-3" />
      </div>
    </div>
  );
};
