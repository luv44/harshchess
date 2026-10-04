import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative URLs, so the same dist/ works whether it is served from a
  // domain root or from a sub-folder like /chessworkermind/.
  base: "./",
  plugins: [
    react(),
    {
      // Manifest of hashed build assets, consumed by sw.js so the FIRST visit
      // is fully precached and the app works offline immediately.
      name: "offline-asset-manifest",
      generateBundle(_options, bundle) {
        this.emitFile({
          type: "asset",
          fileName: "offline-assets.json",
          source: JSON.stringify(
            Object.keys(bundle).filter((name) => name.startsWith("assets/") && !name.endsWith(".map")),
          ),
        });
      },
    },
  ],
  server: {
    // The preview runs behind a proxied hostname, so bind to all interfaces
    // and accept the forwarded Host header.
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    strictPort: true,
    allowedHosts: true,
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    globals: false,
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 20000,
  },
  worker: { format: "es" },
});
