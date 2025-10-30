import { browser } from "$app/environment";
import { derived, writable, type Readable } from "svelte/store";
import { getInvoke, getListen } from "$services/tauri";

export type ConnectivityStatus =
  | "initializing"
  | "offline"
  | "mesh-only"
  | "online";

export type ConnectionMedium =
  | "self"
  | "mesh"
  | "internet"
  | "bridge"
  | "bluetooth"
  | "wifi-direct";

export interface MeshPeer {
  id: string;
  label: string;
  connection: ConnectionMedium;
  hopCount: number | null;
  via: string | null;
  latencyMs: number | null;
  lastSeen: string | null;
  isGateway: boolean;
  routeQuality: number | null;
  successRate: number | null;
}

export interface MeshLink {
  source: string;
  target: string;
  quality: number | null;
  medium: Exclude<ConnectionMedium, "self">;
  latencyMs: number | null;
}

export interface ConnectivityEventPayload {
  internetReachable?: boolean;
  meshReachable?: boolean;
  totalPeers?: number;
  meshPeers?: number;
  peers?: Array<PartialMeshPeer>;
  links?: Array<PartialMeshLink>;
  bridgeSuggested?: boolean;
  reason?: string | null;
  gatewayStatus?: PartialGatewayStatus | null;
  transports?: PartialTransportStatus | null;
}

export interface ConnectivityState {
  status: ConnectivityStatus;
  internetReachable: boolean;
  meshReachable: boolean;
  totalPeers: number;
  meshPeers: number;
  peers: MeshPeer[];
  links: MeshLink[];
  bridgeSuggested: boolean;
  gatewayStatus: GatewayStatus;
  transportStatus: TransportStatus;
  fallbackActive: boolean;
  fallbackReason: string | null;
  lastUpdated: number | null;
  bestRouteQuality: number | null;
  averageRouteQuality: number | null;
  averageSuccessRate: number | null;
}

type PartialMeshPeer = {
  id?: string | null;
  label?: string | null;
  connection?: ConnectionMedium | null;
  hopCount?: number | null;
  via?: string | null;
  latencyMs?: number | null;
  latency_ms?: number | null;
  lastSeen?: string | null;
  last_seen?: string | null;
  isGateway?: boolean | null;
  is_gateway?: boolean | null;
  routeQuality?: number | null;
  route_quality?: number | null;
  successRate?: number | null;
  success_rate?: number | null;
};

type PartialMeshLink = {
  source?: string | null;
  target?: string | null;
  quality?: number | null;
  medium?: ConnectionMedium | null;
  type?: ConnectionMedium | null;
  latencyMs?: number | null;
  latency_ms?: number | null;
};

export interface GatewayStatus {
  bridgeModeEnabled: boolean;
  forwarding: boolean;
  upstreamPeers: number;
  lastDialAttempt: string | null;
  lastError: string | null;
}

type PartialGatewayStatus = {
  bridgeModeEnabled?: boolean | null;
  forwarding?: boolean | null;
  upstreamPeerCount?: number | null;
  upstreamPeers?: number | null;
  lastDialAttempt?: string | null;
  lastDialAttemptAt?: string | null;
  last_error?: string | null;
  lastError?: string | null;
};

export interface TransportStatus {
  bluetoothEnabled: boolean;
  wifiDirectEnabled: boolean;
  bluetoothPeers: string[];
  wifiDirectPeers: string[];
  localPeerId: string | null;
}

type PartialTransportStatus = {
  bluetoothEnabled?: boolean | null;
  wifiDirectEnabled?: boolean | null;
  bluetoothPeers?: string[] | null;
  wifiDirectPeers?: string[] | null;
  localPeerId?: string | null;
};

const defaultGatewayStatus: GatewayStatus = {
  bridgeModeEnabled: false,
  forwarding: false,
  upstreamPeers: 0,
  lastDialAttempt: null,
  lastError: null,
};

const defaultTransportStatus: TransportStatus = {
  bluetoothEnabled: false,
  wifiDirectEnabled: false,
  bluetoothPeers: [],
  wifiDirectPeers: [],
  localPeerId: null,
};

type ConnectivityStore = Readable<ConnectivityState> & {
  initialize: () => Promise<void>;
  teardown: () => void;
  handleBackendEvent: (payload: ConnectivityEventPayload) => void;
  markFallback: (reason: string) => void;
  statusMessage: Readable<string>;
  fallbackMessage: Readable<string | null>;
};

const initialState: ConnectivityState = {
  status: "initializing",
  internetReachable: false,
  meshReachable: false,
  totalPeers: 0,
  meshPeers: 0,
  peers: [],
  links: [],
  bridgeSuggested: false,
  gatewayStatus: { ...defaultGatewayStatus },
  transportStatus: { ...defaultTransportStatus },
  fallbackActive: false,
  fallbackReason: null,
  lastUpdated: null,
  bestRouteQuality: null,
  averageRouteQuality: null,
  averageSuccessRate: null,
};

const fallbackSnapshots: ConnectivityEventPayload[] = [
  {
    internetReachable: false,
    meshReachable: false,
    totalPeers: 0,
    meshPeers: 0,
    peers: [],
    links: [],
    bridgeSuggested: false,
    gatewayStatus: { ...defaultGatewayStatus },
    reason: "No connectivity data available.",
    transports: {
      bluetoothEnabled: false,
      wifiDirectEnabled: false,
      bluetoothPeers: [],
      wifiDirectPeers: [],
      localPeerId: null,
    },
  },
  {
    internetReachable: false,
    meshReachable: true,
    totalPeers: 3,
    meshPeers: 2,
    peers: [
      {
        id: "self",
        label: "This Device",
        connection: "self",
        hopCount: 0,
        via: null,
        latencyMs: 0,
        lastSeen: new Date().toISOString(),
        isGateway: false,
      },
      {
        id: "mesh-alpha",
        label: "Mesh Node Alpha",
        connection: "mesh",
        hopCount: 1,
        via: "self",
        latencyMs: 38,
        lastSeen: new Date().toISOString(),
        isGateway: false,
      },
      {
        id: "mesh-relay",
        label: "Relay Beacon",
        connection: "bridge",
        hopCount: 2,
        via: "mesh-alpha",
        latencyMs: 74,
        lastSeen: new Date().toISOString(),
        isGateway: true,
      },
    ],
    links: [
      {
        source: "self",
        target: "mesh-alpha",
        quality: 0.87,
        medium: "mesh",
      },
      {
        source: "mesh-alpha",
        target: "mesh-relay",
        quality: 0.64,
        medium: "bridge",
      },
    ],
    bridgeSuggested: true,
    gatewayStatus: { ...defaultGatewayStatus },
    reason: "Demo mesh snapshot (no backend events).",
    transports: {
      bluetoothEnabled: true,
      wifiDirectEnabled: false,
      bluetoothPeers: ["mesh-alpha"],
      wifiDirectPeers: [],
      localPeerId: "self",
    },
  },
  {
    internetReachable: true,
    meshReachable: true,
    totalPeers: 5,
    meshPeers: 3,
    peers: [
      {
        id: "self",
        label: "This Device",
        connection: "self",
        hopCount: 0,
        via: null,
        latencyMs: 0,
        lastSeen: new Date().toISOString(),
        isGateway: true,
      },
      {
        id: "mesh-alpha",
        label: "Mesh Node Alpha",
        connection: "mesh",
        hopCount: 1,
        via: "self",
        latencyMs: 32,
        lastSeen: new Date().toISOString(),
        isGateway: false,
      },
      {
        id: "mesh-relay",
        label: "Relay Beacon",
        connection: "bridge",
        hopCount: 1,
        via: "self",
        latencyMs: 58,
        lastSeen: new Date().toISOString(),
        isGateway: true,
      },
      {
        id: "internet-gateway",
        label: "Gateway",
        connection: "internet",
        hopCount: 0,
        via: "self",
        latencyMs: 95,
        lastSeen: new Date().toISOString(),
        isGateway: true,
      },
      {
        id: "mesh-beta",
        label: "Mesh Node Beta",
        connection: "mesh",
        hopCount: 2,
        via: "mesh-relay",
        latencyMs: 110,
        lastSeen: new Date().toISOString(),
        isGateway: false,
      },
    ],
    links: [
      {
        source: "self",
        target: "mesh-alpha",
        quality: 0.82,
        medium: "mesh",
      },
      {
        source: "self",
        target: "mesh-relay",
        quality: 0.71,
        medium: "bridge",
      },
      {
        source: "self",
        target: "internet-gateway",
        quality: 0.9,
        medium: "internet",
      },
      {
        source: "mesh-relay",
        target: "mesh-beta",
        quality: 0.6,
        medium: "mesh",
      },
    ],
    bridgeSuggested: false,
    gatewayStatus: {
      ...defaultGatewayStatus,
      bridgeModeEnabled: true,
      forwarding: true,
      upstreamPeers: 1,
    },
    reason: "Demo online snapshot (no backend events).",
    transports: {
      bluetoothEnabled: true,
      wifiDirectEnabled: true,
      bluetoothPeers: ["mesh-alpha"],
      wifiDirectPeers: ["mesh-relay"],
      localPeerId: "self",
    },
  },
];

const meshConnectionMediums: ConnectionMedium[] = [
  "mesh",
  "bluetooth",
  "wifi-direct",
  "bridge",
];

function normalizePeer(peer: PartialMeshPeer, index: number): MeshPeer {
  const id = peer.id ?? `peer-${index}`;
  const lastSeen = peer.lastSeen ?? peer.last_seen ?? null;
  const latencyMs = peer.latencyMs ?? peer.latency_ms ?? null;
  const connection = peer.connection ?? "mesh";
  const routeQuality =
    typeof peer.routeQuality === "number"
      ? peer.routeQuality
      : typeof peer.route_quality === "number"
        ? peer.route_quality
        : null;
  const successRate =
    typeof peer.successRate === "number"
      ? peer.successRate
      : typeof peer.success_rate === "number"
        ? peer.success_rate
        : null;

  return {
    id,
    label: peer.label ?? id,
    connection,
    hopCount: typeof peer.hopCount === "number" ? peer.hopCount : null,
    via: peer.via ?? null,
    latencyMs: typeof latencyMs === "number" ? latencyMs : null,
    lastSeen,
    isGateway: Boolean(peer.isGateway ?? peer.is_gateway ?? false),
    routeQuality,
    successRate,
  };
}

function normalizeLink(link: PartialMeshLink): MeshLink | null {
  if (!link.source || !link.target) {
    return null;
  }

  const medium = link.medium ?? link.type ?? "mesh";
  return {
    source: link.source,
    target: link.target,
    quality: typeof link.quality === "number" ? link.quality : null,
    medium: medium === "self" ? "mesh" : medium,
    latencyMs:
      typeof link.latencyMs === "number"
        ? link.latencyMs
        : typeof link.latency_ms === "number"
          ? link.latency_ms
          : null,
  };
}

function normalizeGatewayStatus(
  status?: PartialGatewayStatus | null,
): GatewayStatus {
  if (!status) {
    return { ...defaultGatewayStatus };
  }

  const upstreamPeers =
    typeof status.upstreamPeerCount === "number"
      ? status.upstreamPeerCount
      : typeof status.upstreamPeers === "number"
        ? status.upstreamPeers
        : defaultGatewayStatus.upstreamPeers;

  const lastDialAttempt =
    typeof status.lastDialAttempt === "string"
      ? status.lastDialAttempt
      : typeof status.lastDialAttemptAt === "string"
        ? status.lastDialAttemptAt
        : null;

  const lastError =
    typeof status.lastError === "string"
      ? status.lastError
      : typeof status.last_error === "string"
        ? status.last_error
        : null;

  return {
    bridgeModeEnabled: Boolean(status.bridgeModeEnabled),
    forwarding: Boolean(status.forwarding),
    upstreamPeers,
    lastDialAttempt,
    lastError,
  };
}

function normalizeTransportStatus(
  status?: PartialTransportStatus | null,
): TransportStatus {
  if (!status) {
    return { ...defaultTransportStatus };
  }

  const bluetoothPeers = Array.isArray(status.bluetoothPeers)
    ? status.bluetoothPeers.filter(
        (peer): peer is string => typeof peer === "string" && peer.length > 0,
      )
    : defaultTransportStatus.bluetoothPeers;

  const wifiDirectPeers = Array.isArray(status.wifiDirectPeers)
    ? status.wifiDirectPeers.filter(
        (peer): peer is string => typeof peer === "string" && peer.length > 0,
      )
    : defaultTransportStatus.wifiDirectPeers;

  return {
    bluetoothEnabled: Boolean(status.bluetoothEnabled),
    wifiDirectEnabled: Boolean(status.wifiDirectEnabled),
    bluetoothPeers,
    wifiDirectPeers,
    localPeerId:
      typeof status.localPeerId === "string" && status.localPeerId.length > 0
        ? status.localPeerId
        : null,
  };
}

function computeStatus(
  state: ConnectivityState,
  payload: ConnectivityEventPayload,
) {
  if (payload.internetReachable || payload.gatewayStatus?.forwarding) {
    return "online" as const;
  }

  if (payload.meshReachable) {
    return "mesh-only" as const;
  }

  if (state.status === "initializing" && payload.totalPeers === undefined) {
    return "initializing" as const;
  }

  return "offline" as const;
}

function describeStatus(state: ConnectivityState): string {
  switch (state.status) {
    case "initializing":
      return "Waiting for connectivity updates…";
    case "offline":
      return "Offline. No peers reachable.";
    case "mesh-only": {
      if (state.meshPeers === 0) {
        return "Mesh link established, awaiting peers.";
      }
      return `Connected to ${state.meshPeers} mesh peer${
        state.meshPeers === 1 ? "" : "s"
      }. Internet unavailable.`;
    }
    case "online": {
      const meshPart =
        state.meshPeers > 0
          ? ` ${state.meshPeers} mesh peer${state.meshPeers === 1 ? "" : "s"}.`
          : "";
      return `Online with global connectivity.${meshPart}`.trim();
    }
    default:
      return "";
  }
}

export function createConnectivityStore(): ConnectivityStore {
  const { subscribe, update, set } = writable<ConnectivityState>(initialState);

  let unsubscribe: (() => void) | null = null;
  let initializePromise: Promise<void> | null = null;
  let fallbackTimer: ReturnType<typeof setInterval> | null = null;
  let fallbackIndex = 0;

  const stopFallback = () => {
    if (fallbackTimer) {
      clearInterval(fallbackTimer);
      fallbackTimer = null;
    }
  };

  const applyPayload = (payload: ConnectivityEventPayload) => {
    update((current) => {
      const peers = (payload.peers ?? []).map(normalizePeer);
      const links = (payload.links ?? [])
        .map(normalizeLink)
        .filter((link): link is MeshLink => Boolean(link));

      const gatewayStatus = normalizeGatewayStatus(payload.gatewayStatus);
      const transportStatus = normalizeTransportStatus(payload.transports);

      const meshPeers =
        typeof payload.meshPeers === "number"
          ? payload.meshPeers
          : peers.filter((peer) =>
              meshConnectionMediums.includes(peer.connection),
            ).length;

      const totalPeers =
        typeof payload.totalPeers === "number"
          ? payload.totalPeers
          : peers.length;

      const status = computeStatus(current, payload);
      const internetReachable =
        typeof payload.internetReachable === "boolean"
          ? payload.internetReachable
          : gatewayStatus.forwarding;

      const qualities = peers
        .map((peer) => peer.routeQuality)
        .filter((value): value is number => typeof value === "number");
      const bestRouteQuality =
        qualities.length > 0 ? Math.max(...qualities) : null;
      const averageRouteQuality =
        qualities.length > 0
          ? qualities.reduce((total, value) => total + value, 0) /
            qualities.length
          : null;

      const successRates = peers
        .map((peer) => peer.successRate)
        .filter((value): value is number => typeof value === "number");
      const averageSuccessRate =
        successRates.length > 0
          ? successRates.reduce((total, value) => total + value, 0) /
            successRates.length
          : null;

      return {
        status,
        internetReachable,
        meshReachable: Boolean(payload.meshReachable || meshPeers > 0),
        totalPeers,
        meshPeers,
        peers,
        links,
        bridgeSuggested: Boolean(payload.bridgeSuggested),
        gatewayStatus,
        transportStatus,
        fallbackActive: current.fallbackActive,
        fallbackReason: current.fallbackReason,
        lastUpdated: Date.now(),
        bestRouteQuality,
        averageRouteQuality,
        averageSuccessRate,
      } satisfies ConnectivityState;
    });
  };

  const handleBackendEvent = (payload: ConnectivityEventPayload) => {
    stopFallback();
    update((state) => ({
      ...state,
      fallbackActive: false,
      fallbackReason: null,
    }));
    applyPayload(payload);
  };

  const markFallback = (reason: string) => {
    fallbackIndex = 0;
    stopFallback();
    update((state) => ({
      ...state,
      fallbackActive: true,
      fallbackReason: reason,
    }));

    const emitSnapshot = () => {
      const snapshot =
        fallbackSnapshots[fallbackIndex % fallbackSnapshots.length];
      fallbackIndex += 1;
      applyPayload(snapshot);
    };

    emitSnapshot();

    fallbackTimer = setInterval(() => {
      emitSnapshot();
    }, 20000);
  };

  const initialize = async () => {
    if (!browser) {
      return;
    }

    if (initializePromise) {
      await initializePromise;
      return;
    }

    const pending = (async () => {
      const listen = await getListen();

      if (!listen) {
        markFallback("Connectivity events unavailable; showing demo data.");
        return;
      }

      try {
        unsubscribe = await listen<{ payload: ConnectivityEventPayload }>(
          "connectivity-status",
          ({ payload }) => {
            handleBackendEvent(payload ?? {});
          },
        );
      } catch (error) {
        console.error("Failed to subscribe to connectivity events", error);
        markFallback(
          "Failed to subscribe to connectivity events; using demo data.",
        );
        return;
      }

      const invoke = await getInvoke();
      if (invoke) {
        try {
          const snapshot = await invoke<ConnectivityEventPayload | null>(
            "get_connectivity_snapshot",
          );
          if (snapshot) {
            handleBackendEvent(snapshot);
          }
        } catch (error) {
          console.warn("Failed to fetch initial connectivity snapshot", error);
        }
      }
    })()
      .catch((error) => {
        console.error("Connectivity initialisation failed", error);
        markFallback("Connectivity initialisation failed; using demo data.");
      })
      .finally(() => {
        initializePromise = null;
      });

    initializePromise = pending;

    await pending;
  };

  const teardown = () => {
    stopFallback();
    if (unsubscribe) {
      try {
        unsubscribe();
      } catch (error) {
        console.warn("Failed to tear down connectivity listener", error);
      }
    }
    unsubscribe = null;
    set(initialState);
  };

  const statusMessage = derived({ subscribe }, describeStatus);

  const fallbackMessage = derived({ subscribe }, (state) =>
    state.fallbackActive
      ? (state.fallbackReason ?? "Connectivity telemetry unavailable.")
      : null,
  );

  return {
    subscribe,
    initialize,
    teardown,
    handleBackendEvent,
    markFallback,
    statusMessage,
    fallbackMessage,
  };
}

export const connectivityStore = createConnectivityStore();
