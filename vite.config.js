// @ts-nocheck
/// <reference types="vitest" />
import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { resolve, join } from "node:path";
import { existsSync } from "node:fs";

const html5QrcodeSourceMapFix = () => {
  const buildMiddleware = (root) => (req, _res, next) => {
    if (req.url?.startsWith("/node_modules/src/")) {
      const redirected = req.url.replace(
        "/node_modules/src/",
        "/node_modules/html5-qrcode/src/",
      );
      const filePath = join(root, redirected.replace(/^\//, ""));
      if (existsSync(filePath)) {
        req.url = redirected;
      }
    }
    next();
  };

  return {
    name: "html5-qrcode-sourcemap-fix",
    configureServer(server) {
      server.middlewares.use(buildMiddleware(server.config.root));
    },
    configurePreviewServer(server) {
      server.middlewares.use(buildMiddleware(server.config.root));
    },
  };
};

const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [sveltekit(), html5QrcodeSourceMapFix()],

  resolve: {
    alias: {
      sveltejs: resolve("node_modules/@sveltejs"),
    },
  },

  optimizeDeps: {
    exclude: ["@mdi/js", "@lucide/svelte"],
  },

  ssr: {
    noExternal: ["@mdi/js", "@lucide/svelte"],
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
  },
}));
