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
    alias: [
      {
        find: "$lib/components/NavigationHeader.svelte",
        replacement: resolve(
          projectRootDir,
          "tests/mocks/NavigationHeaderStub.svelte",
        ),
      },
      {
        find: "$lib/components/sidebars/MemberSidebar.svelte",
        replacement: resolve(
          projectRootDir,
          "tests/mocks/MemberSidebarStub.svelte",
        ),
      },
      {
        find: "$lib/components/ui/dialog/index.js",
        replacement: resolve(projectRootDir, "tests/mocks/ui-dialog.ts"),
      },
      {
        find: "$lib/components/ui/dialog",
        replacement: resolve(projectRootDir, "tests/mocks/ui-dialog.ts"),
      },
      {
        find: "$lib/components/ui/scroll-area/index.js",
        replacement: resolve(projectRootDir, "tests/mocks/scroll-area.ts"),
      },
      {
        find: "$lib/components/ui/scroll-area",
        replacement: resolve(projectRootDir, "tests/mocks/scroll-area.ts"),
      },
      {
        find: "$lib/components/ui/sidebar",
        replacement: resolve(projectRootDir, "tests/mocks/sidebar.ts"),
      },
      {
        find: "$features/chat",
        replacement: resolve(projectRootDir, "tests/mocks/features-chat.ts"),
      },
      {
        find: "$app/environment",
        replacement: resolve(
          projectRootDir,
          "tests/mocks/app-environment",
        ),
      },
      {
        find: "$app/navigation",
        replacement: resolve(
          projectRootDir,
          "tests/shims/app-navigation",
        ),
      },
      {
        find: "$app/stores",
        replacement: resolve(projectRootDir, "tests/shims/app-stores"),
      },
      {
        find: "$app/paths",
        replacement: resolve(projectRootDir, "tests/shims/app-paths"),
      },
      {
        find: "@tauri-apps/api/notification",
        replacement: resolve(
          projectRootDir,
          "tests/shims/tauri-notification.ts",
        ),
      },
      {
        find: "@tauri-apps/api/core",
        replacement: resolve(projectRootDir, "tests/shims/tauri-core.ts"),
      },
      {
        find: "@tauri-apps/plugin-store",
        replacement: resolve(projectRootDir, "tests/shims/tauri-store.ts"),
      },
      {
        find: "onnxruntime-web/wasm",
        replacement: resolve(
          projectRootDir,
          "tests/shims/onnxruntime-web-wasm.ts",
        ),
      },
      {
        find: "onnxruntime-web",
        replacement: resolve(projectRootDir, "tests/shims/onnxruntime-web.ts"),
      },
      {
        find: "$lib",
        replacement: resolve(projectRootDir, "src/lib"),
      },
      {
        find: "$features",
        replacement: resolve(projectRootDir, "src/lib/features"),
      },
      {
        find: "$services",
        replacement: resolve(projectRootDir, "src/lib/services"),
      },
    ],
    conditions: ["browser", "default"],
  },
});
