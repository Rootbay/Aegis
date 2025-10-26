import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { get } from "svelte/store";

import { connectivityStore } from "../../src/lib/stores/connectivityStore";

describe("connectivityStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    connectivityStore.teardown();
  });

  afterEach(() => {
    connectivityStore.teardown();
    vi.useRealTimers();
  });

  it("transitions between mesh-only and online states", () => {
    const initial = get(connectivityStore);
    expect(initial.status).toBe("initializing");

    connectivityStore.handleBackendEvent({
      meshReachable: true,
      meshPeers: 2,
      totalPeers: 2,
      bridgeSuggested: true,
    });

    const meshState = get(connectivityStore);
    expect(meshState.status).toBe("mesh-only");
    expect(meshState.meshPeers).toBe(2);
    expect(meshState.bridgeSuggested).toBe(true);

    connectivityStore.handleBackendEvent({
      meshReachable: true,
      internetReachable: true,
      meshPeers: 4,
      totalPeers: 5,
    });

    const onlineState = get(connectivityStore);
    expect(onlineState.status).toBe("online");
    expect(onlineState.internetReachable).toBe(true);
    expect(onlineState.meshPeers).toBe(4);
    expect(onlineState.bridgeSuggested).toBe(false);
  });

  it("activates fallback messaging when backend data is unavailable", () => {
    connectivityStore.markFallback("Demo fallback");

    const fallbackState = get(connectivityStore);
    expect(fallbackState.fallbackActive).toBe(true);
    expect(fallbackState.status === "offline" || fallbackState.status === "mesh-only").toBe(true);

    const fallbackMessage = get(connectivityStore.fallbackMessage);
    expect(fallbackMessage).toContain("Demo fallback");

    const firstTimestamp = fallbackState.lastUpdated;

    vi.advanceTimersByTime(20000);

    const updatedState = get(connectivityStore);
    expect(updatedState.lastUpdated).not.toBe(firstTimestamp);
  });
});
