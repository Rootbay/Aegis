import { browser } from "$app/environment";

export function applyDocumentTheme(theme: "light" | "dark") {
  if (!browser) {
    return;
  }

  const root = document.documentElement;
  if (!root) {
    return;
  }

  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme !== "dark");
}
