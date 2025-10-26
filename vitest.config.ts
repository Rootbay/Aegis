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
      "$app/navigation": resolve(
        projectRootDir,
        "tests/shims/app-navigation",
      ),
      "$app/stores": resolve(projectRootDir, "tests/shims/app-stores"),
      "$app/paths": resolve(projectRootDir, "tests/shims/app-paths"),
    },
    conditions: ["browser"],
  },
});
