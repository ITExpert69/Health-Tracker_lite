import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// The Tauri CLI sets TAURI_ENV_* while running the build; the desktop app needs no service worker.
const isTauri = !!process.env.TAURI_ENV_PLATFORM;

export default defineConfig({
  // Relative base so the web build works from any sub-path (e.g. GitHub Pages /repo/).
  base: "./",
  plugins: [
    react(),
    !isTauri &&
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: "auto",
        includeAssets: ["favicon.png", "apple-touch-icon.png"],
        manifest: {
          name: "Health Tracker",
          short_name: "Health",
          description: "Personal nutrition, weight and training tracker",
          start_url: "./",
          scope: "./",
          display: "standalone",
          orientation: "any",
          background_color: "#f9f9f7",
          theme_color: "#f9f9f7",
          icons: [
            { src: "icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          // Cache the whole app shell, including the SQLite wasm, so it works offline.
          globPatterns: ["**/*.{js,css,html,png,svg,wasm,webmanifest}"],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          navigateFallback: "index.html",
        },
      }),
  ],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ["VITE_", "TAURI_"],
  build: { target: "es2021", sourcemap: !isTauri ? false : true, chunkSizeWarningLimit: 1000 },
  test: { environment: "node" },
} as any);
