/// <reference types="vitest" />
import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { resolve } from "node:path";

const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [sveltekit()],

  resolve: {
    alias: {
      sveltejs: resolve("node_modules/@sveltejs")
    }
  },

  optimizeDeps: {
    exclude: ['@mdi/js'],
  },

  ssr: {
    noExternal: ['@mdi/js'],
  },

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: false,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1423,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  }
}));
