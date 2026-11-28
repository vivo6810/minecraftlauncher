import React, { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { IdleAnimation, SkinViewer } from "skinview3d";
import { getDefaultSteveSkinDataUrl } from "../lib/defaultSteve";
import type { SkinVariant } from "../types/launcher";
import { SkinHead } from "./SkinHead";

interface Props {
  skinUrl: string | null;
  capeUrl: string | null;
  variant: SkinVariant;
  onDecodeError?: (msg: string) => void;
}

async function predecodeImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = src;
  await img.decode();
  return img;
}

export const SkinViewer3D: React.FC<Props> = ({
  skinUrl,
  capeUrl,
  variant,
  onDecodeError,
}) => {
  const [unavailable, setUnavailable] = useState(false);
  const reducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerRef = useRef<SkinViewer | null>(null);
  const mountedRef = useRef(false);
  const skinGenRef = useRef(0);
  const capeGenRef = useRef(0);
  const onDecodeErrorRef = useRef(onDecodeError);

  useEffect(() => {
    onDecodeErrorRef.current = onDecodeError;
  }, [onDecodeError]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const initW = Math.max(240, container.clientWidth || 420);
    const initH = Math.max(300, container.clientHeight || 520);

    let viewer: SkinViewer;
    try {
      viewer = new SkinViewer({ canvas, width: initW, height: initH });
    } catch {
      setUnavailable(true);
      return;
    }
    mountedRef.current = true;
    viewer.fov = 50;
    viewer.zoom = 0.86;
    viewer.controls.enableRotate = true;
    viewer.controls.enableZoom = true;
    viewer.controls.enablePan = false;
    viewer.playerObject.rotation.y = 0.45;

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
      mountedRef.current = false;
      skinGenRef.current += 1;
      capeGenRef.current += 1;
      observer.disconnect();
      viewer.dispose();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (viewerRef.current) {
      viewerRef.current.animation = reducedMotion ? null : new IdleAnimation();
    }
  }, [reducedMotion]);

  useEffect(() => {
    if (!viewerRef.current) return;
    const gen = ++skinGenRef.current;
    const fallbackSteve = getDefaultSteveSkinDataUrl();
    const resolvedSkin = skinUrl || fallbackSteve;
    const resolvedModel = variant === "slim" ? "slim" : "default";

    void predecodeImage(resolvedSkin)
      .then((img) => {
        if (!mountedRef.current || skinGenRef.current !== gen || !viewerRef.current) {
          return;
        }
        return viewerRef.current.loadSkin(img, { model: resolvedModel });
      })
      .catch(() => {
        if (!mountedRef.current || skinGenRef.current !== gen || !viewerRef.current) {
          return;
        }
        void viewerRef.current.loadSkin(fallbackSteve, { model: resolvedModel });
        if (skinUrl) {
          onDecodeErrorRef.current?.("Invalid skin PNG; reverted preview to Steve");
        }
      });
  }, [skinUrl, variant]);

  useEffect(() => {
    const gen = ++capeGenRef.current;
    const viewer = viewerRef.current;
    if (!viewer) return;

    if (!capeUrl) {
      viewer.loadCape(null);
      return;
    }

    void predecodeImage(capeUrl)
      .then((img) => {
        if (!mountedRef.current || capeGenRef.current !== gen || !viewerRef.current) {
          return;
        }
        return viewerRef.current.loadCape(img);
      })
      .catch(() => {
        if (mountedRef.current && capeGenRef.current === gen && viewerRef.current) {
          viewerRef.current.loadCape(null);
        }
      });
  }, [capeUrl]);

  if (unavailable) {
    return (
      <div className="grid h-full place-content-center justify-items-center gap-2 text-xs text-muted">
        <SkinHead skinUrl={skinUrl ?? getDefaultSteveSkinDataUrl()} />
        <span>3D preview unavailable</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center overflow-hidden select-none cursor-grab active:cursor-grabbing"
    >
      <canvas ref={canvasRef} className="block outline-none" />
    </div>
  );
};
