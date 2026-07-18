import { defineConfig } from "vite";

export default defineConfig({
  // Relative base works on GitHub Pages, tunnels, and local preview
  base: "./",

  root: ".",
  publicDir: "public",
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts: true,
  },

  build: {
    outDir: "dist",
    assetsInlineLimit: 0,
  },
});

