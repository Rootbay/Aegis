// ESLint flat config for SvelteKit + TypeScript
// Uses ESLint v9 flat config format.
import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import prettier from "eslint-config-prettier";
import globals from "globals";

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  // Ignore build artifacts and externals
  {
    ignores: [
      ".svelte-kit/**",
      "build/**",
      "dist/**",
      "node_modules/**",
      "src-tauri/target/**",
      "static/**",
      "docs/**",
    ],
  },

  // Base recommended JS rules
  js.configs.recommended,

  // Default language options for app code
  {
    files: ["**/*.{js,ts,svelte}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
  },

  // TypeScript in .ts files
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
    },
  },

  // Svelte files with TypeScript support
  // Pulls in svelte recommended rules, then layers TS parsing for <script lang="ts">
  ...svelte.configs["flat/recommended"],
  {
    files: ["**/*.svelte"],
    languageOptions: {
      parserOptions: {
        parser: tsParser,
      },
    },
    rules: {
      // Add any Svelte-specific rule customizations here if needed
    },
  },

  // Node context for config and build files
  {
    files: [
      "**/vite.config.*",
      "**/svelte.config.*",
      "**/postcss.config.*",
      "**/tailwind.config.*",
      "**/vitest.config.*",
      "**/*.cjs",
      "**/*.mjs",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
  },

  // Disable formatting-related ESLint rules to avoid conflicts with Prettier
  prettier,
];
