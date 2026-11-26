import React, { useEffect, useRef } from "react";
import { IdleAnimation, SkinViewer } from "skinview3d";
import { getDefaultSteveSkinDataUrl } from "../lib/defaultSteve";
import type { SkinVariant } from "../types/launcher";

interface Props {
  skinUrl: string | null;
  capeUrl: string | null;
  variant: SkinVariant;
}

export const SkinViewer3D: React.FC<Props> = ({ skinUrl, capeUrl, variant }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerRef = useRef<SkinViewer | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const initW = Math.max(240, container.clientWidth || 420);
    const initH = Math.max(300, container.clientHeight || 520);

    const viewer = new SkinViewer({
      canvas,
      width: initW,
      height: initH,
      skin: skinUrl || getDefaultSteveSkinDataUrl(),
      model: variant === "slim" ? "slim" : "default",
    });

    viewer.fov = 50;
    viewer.zoom = 0.86;
    viewer.animation = new IdleAnimation();
    viewer.controls.enableRotate = true;
    viewer.controls.enableZoom = true;
    viewer.controls.enablePan = false;
    viewer.playerObject.rotation.y = 0.45;

    if (capeUrl) {
      void viewer.loadCape(capeUrl);
    }

    viewerRef.current = viewer;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !viewerRef.current) return;
      const w = Math.max(180, Math.floor(entry.contentRect.width));
      const h = Math.max(220, Math.floor(entry.contentRect.height));
      viewerRef.current.setSize(w, h);
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      viewer.dispose();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const resolvedSkin = skinUrl || getDefaultSteveSkinDataUrl();
    const resolvedModel = variant === "slim" ? "slim" : "default";
    void viewer.loadSkin(resolvedSkin, { model: resolvedModel });
  }, [skinUrl, variant]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (capeUrl) {
      void viewer.loadCape(capeUrl);
    } else {
      viewer.loadCape(null);
    }
  }, [capeUrl]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center overflow-hidden select-none cursor-grab active:cursor-grabbing"
    >
      <canvas ref={canvasRef} className="block outline-none" />
    </div>
  );
};
