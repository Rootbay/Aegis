import "@testing-library/svelte/vitest";
import { vi } from "vitest";

vi.mock("@tauri-apps/api/notification", () => ({
  isPermissionGranted: async () => true,
  requestPermission: async () => "granted" as const,
  sendNotification: vi.fn(),
}));
