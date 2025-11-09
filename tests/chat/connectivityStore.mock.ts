import { writable } from "svelte/store";
import { vi } from "vitest";
import type {
  ConnectivityState,
  ConnectivityStatus,
} from "../../src/lib/stores/connectivityStore";

const createInitialState = (): ConnectivityState => ({
  status: "online",
  internetReachable: true,
  meshReachable: true,
  totalPeers: 0,
  meshPeers: 0,
  peers: [],
  links: [],
  bridgeSuggested: false,
  gatewayStatus: {
    bridgeModeEnabled: false,
    forwarding: true,
    upstreamPeers: 0,
    lastDialAttempt: null,
    lastError: null,
  },
  transportStatus: {
    bluetoothEnabled: false,
    wifiDirectEnabled: false,
    bluetoothPeers: [],
    wifiDirectPeers: [],
    localPeerId: null,
  },
  fallbackActive: false,
  fallbackReason: null,
  lastUpdated: null,
  bestRouteQuality: null,
  averageRouteQuality: null,
  averageSuccessRate: null,
  relays: [],
  activeRelayCount: 0,
  trustedDeviceSync: {
    inProgress: false,
    lastSync: null,
    lastBundleId: null,
    lastError: null,
  },
});

export const createMockConnectivityStore = () => {
  const state = writable<ConnectivityState>(createInitialState());

  const setStatus = (status: ConnectivityStatus) => {
    state.update((current) => ({ ...current, status }));
  };

  const reset = () => {
    state.set(createInitialState());
  };

  const setState = (partial: Partial<ConnectivityState>) => {
    state.update((current) => ({ ...current, ...partial }));
  };

  const subscribe = state.subscribe;

  return {
    store: {
      subscribe,
      initialize: vi.fn(),
      teardown: vi.fn(),
      handleBackendEvent: vi.fn(),
      markFallback: vi.fn(),
      statusMessage: {
        subscribe(run: (value: string | null) => void) {
          run(null);
          return () => {};
        },
      },
      fallbackMessage: {
        subscribe(run: (value: string | null) => void) {
          run(null);
          return () => {};
        },
      },
      bootstrapFromTrustedDevice: vi.fn(),
    },
    setStatus,
    reset,
    setState,
  };
};
