import { onDestroy } from "svelte";
import type { Readable } from "svelte/store";

import { applyDocumentTheme } from "./applyDocumentTheme";

type Theme = "light" | "dark";

export function bindDocumentTheme(themeStore: Readable<Theme>) {
  const unsubscribe = themeStore.subscribe((value) => {
    applyDocumentTheme(value);
  });

  onDestroy(() => {
    unsubscribe();
  });
}
