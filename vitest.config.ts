import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const projectRootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [svelte({ hot: !process.env.VITEST })],
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{js,ts}", "tests/**/*.{test,spec}.{js,ts}"],
    setupFiles: ["./vitest-setup.ts"],
    tsconfig: "tsconfig.vitest.json",
  },
  resolve: {
    alias: {
      $lib: resolve(projectRootDir, "src/lib"),
      $services: resolve(projectRootDir, "src/lib/services"),
      "$app/environment": resolve(
        projectRootDir,
        "tests/mocks/app-environment",
      ),
      "$app/navigation": resolve(projectRootDir, "tests/shims/app-navigation"),
      "$app/stores": resolve(projectRootDir, "tests/shims/app-stores"),
      "$app/paths": resolve(projectRootDir, "tests/shims/app-paths"),
      "@tauri-apps/api/notification": resolve(
        projectRootDir,
        "tests/shims/tauri-notification.ts",
      ),
      "@tauri-apps/api/core": resolve(
        projectRootDir,
        "tests/shims/tauri-core.ts",
      ),
      "@tauri-apps/plugin-store": resolve(
        projectRootDir,
        "tests/shims/tauri-store.ts",
      ),
      "onnxruntime-web": resolve(
        projectRootDir,
        "tests/shims/onnxruntime-web.ts",
      ),
      "onnxruntime-web/wasm": resolve(
        projectRootDir,
        "tests/shims/onnxruntime-web-wasm.ts",
      ),
    },
    conditions: ["browser"],
  },
});
