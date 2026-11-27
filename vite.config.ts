import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const loaderProxy = {
  "/api-neoforge": {
    target: "https://maven.neoforged.net",
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/api-neoforge/, ""),
  },
  "/api-forge": {
    target: "https://files.minecraftforge.net",
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/api-forge/, ""),
  },
};

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: "0.0.0.0",
    port: 1420,
    strictPort: true,
    allowedHosts: true,
    proxy: loaderProxy,
  },
  preview: {
    host: "0.0.0.0",
    port: 1420,
    allowedHosts: true,
    proxy: loaderProxy,
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: "es2021",
    minify: "esbuild",
    sourcemap: false,
  },
});
