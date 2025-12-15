import { beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import {
  DEFAULT_PRESENCE_STATUS_KEY,
  PRESENCE_STATUS_OPTIONS,
} from "../../src/lib/features/presence/statusPresets";

const invokeMock = vi.fn(async (...args: unknown[]) => {
  console.log(args);
  return null;
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { presenceStore } from "../../src/lib/features/presence/presenceStore";

describe("presenceStore", () => {
  beforeEach(() => {
    invokeMock.mockClear();
    presenceStore.syncFromUser(null);
  });

  it("exposes exactly three preset statuses", () => {
    expect(PRESENCE_STATUS_OPTIONS).toHaveLength(3);
    expect(PRESENCE_STATUS_OPTIONS.map((option) => option.key)).toEqual([
      "available",
      "safe",
      "rendezvous",
    ]);
  });

  it("broadcasts a valid preset status", async () => {
    const result = await presenceStore.broadcastPresence({ statusKey: "safe" });

    expect(result).toEqual({
      statusKey: "safe",
      isOnline: false,
    });
    expect(invokeMock).toHaveBeenCalledWith("send_presence_update", {
      is_online: false,
      status_message: "safe",
      location: null,
    });
    expect(get(presenceStore).statusKey).toBe("safe");
  });

  it("rejects an invalid preset status", async () => {
    await expect(
      presenceStore.broadcastPresence({ statusKey: "invalid" as any }),
    ).rejects.toThrow("Invalid presence status");
    expect(invokeMock).not.toHaveBeenCalled();
    expect(get(presenceStore).statusKey).toBe(DEFAULT_PRESENCE_STATUS_KEY);
  });
});
