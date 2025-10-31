import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { get } from "svelte/store";

import { connectivityStore } from "../../src/lib/stores/connectivityStore";

describe("bridge relay integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    connectivityStore.teardown();
  });

  afterEach(() => {
    connectivityStore.teardown();
    vi.useRealTimers();
  });

  it("promotes mesh-only state to online when forwarding activates", () => {
    connectivityStore.handleBackendEvent({
      meshReachable: true,
      meshPeers: 2,
      totalPeers: 2,
      gatewayStatus: {
        bridgeModeEnabled: false,
        forwarding: false,
        upstreamPeerCount: 0,
      },
    });

    expect(get(connectivityStore).status).toBe("mesh-only");

    connectivityStore.handleBackendEvent({
      meshReachable: true,
      gatewayStatus: {
        bridgeModeEnabled: true,
        forwarding: false,
        upstreamPeerCount: 1,
      },
    });

    const awaitingForwarding = get(connectivityStore);
    expect(awaitingForwarding.status).toBe("mesh-only");
    expect(awaitingForwarding.gatewayStatus.bridgeModeEnabled).toBe(true);
    expect(awaitingForwarding.internetReachable).toBe(false);

    connectivityStore.handleBackendEvent({
      gatewayStatus: {
        bridgeModeEnabled: true,
        forwarding: true,
        upstreamPeerCount: 1,
      },
    });

    const onlineState = get(connectivityStore);
    expect(onlineState.status).toBe("online");
    expect(onlineState.gatewayStatus.forwarding).toBe(true);
    expect(onlineState.internetReachable).toBe(true);
  });

  it("retains gateway error details when forwarding fails", () => {
    connectivityStore.handleBackendEvent({
      gatewayStatus: {
        bridgeModeEnabled: true,
        forwarding: false,
        upstreamPeerCount: 1,
        lastError: "Forwarding to 12D3K failed: upstream timeout",
      },
    });

    const state = get(connectivityStore);
    expect(state.gatewayStatus.lastError).toContain("Forwarding to");
    expect(state.gatewayStatus.bridgeModeEnabled).toBe(true);
    expect(state.gatewayStatus.forwarding).toBe(false);
  });
});
