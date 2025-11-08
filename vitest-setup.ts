import "@testing-library/svelte/vitest";
import { vi } from "vitest";

vi.mock("@tauri-apps/api/notification", () => ({
  isPermissionGranted: async () => true,
  requestPermission: async () => "granted" as const,
  sendNotification: vi.fn(),
}));

import "@testing-library/jest-dom/vitest";

class ResizeObserverMock {
  private readonly callback: (...args: unknown[]) => void;

  constructor(callback: (...args: unknown[]) => void) {
    this.callback = callback;
  }

  observe() {
    // Immediately invoke the callback once to simulate an initial measurement.
    this.callback([], this);
  }

  unobserve() {}

  disconnect() {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  // @ts-expect-error - jsdom does not provide ResizeObserver by default.
  globalThis.ResizeObserver = ResizeObserverMock;
}
