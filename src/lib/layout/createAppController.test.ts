import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/svelte";
import { get } from "svelte/store";

const {
  commandPaletteOpenMock,
  commandPaletteCloseMock,
  commandPaletteState,
} = vi.hoisted(() => {
  const { writable } = require("svelte/store");
  const state = writable(false);
  return {
    commandPaletteState: state,
    commandPaletteOpenMock: vi.fn(() => state.set(true)),
    commandPaletteCloseMock: vi.fn(() => state.set(false)),
  };
});

vi.mock("$app/navigation", () => ({ goto: vi.fn() }));

vi.mock("$app/stores", async () => {
  const { writable } = await vi.importActual<typeof import("svelte/store")>(
    "svelte/store",
  );
  const pageStore = writable({ url: new URL("https://app.local/") });
  return { page: pageStore };
});

vi.mock("$services/tauri", () => ({
  getListen: vi.fn(async () => null),
}));

vi.mock("$lib/stores/connectivityStore", async () => {
  const { writable } = await vi.importActual<typeof import("svelte/store")>(
    "svelte/store",
  );
  const connectivityState = writable({
    status: "initializing",
    internetReachable: false,
    meshReachable: false,
    totalPeers: 0,
    meshPeers: 0,
    peers: [],
    links: [],
    bridgeSuggested: false,
    gatewayStatus: {
      bridgeModeEnabled: false,
      forwarding: false,
      upstreamPeers: 0,
      lastDialAttempt: null,
      lastError: null,
    },
    fallbackActive: false,
    fallbackReason: null,
    lastUpdated: null,
  });
  const statusMessage = writable("Waiting for connectivity updates…");
  const fallbackMessage = writable<string | null>(null);

  return {
    connectivityStore: {
      subscribe: connectivityState.subscribe,
      initialize: vi.fn(async () => {}),
      teardown: vi.fn(() => {}),
      handleBackendEvent: vi.fn(),
      markFallback: vi.fn(),
      statusMessage: { subscribe: statusMessage.subscribe },
      fallbackMessage: { subscribe: fallbackMessage.subscribe },
    },
  };
});

vi.mock("$lib/features/settings/stores/settings", async () => {
  const { writable } = await vi.importActual<typeof import("svelte/store")>(
    "svelte/store",
  );
  const state = writable({ enableBridgeMode: false });
  return {
    settings: { subscribe: state.subscribe },
  };
});

vi.mock("$lib/features/navigation/commandPaletteStore", () => ({
  commandPaletteStore: {
    isOpen: { subscribe: commandPaletteState.subscribe },
    open: commandPaletteOpenMock,
    close: commandPaletteCloseMock,
  },
}));

vi.mock("$lib/features/auth/stores/authStore", async () => {
  const { writable } = await vi.importActual<typeof import("svelte/store")>(
    "svelte/store",
  );
  const state = writable({ status: "authenticated", loading: false, error: null });
  return {
    authStore: {
      subscribe: state.subscribe,
      bootstrap: vi.fn(),
    },
  };
});

vi.mock("$lib/features/friends/stores/friendStore", async () => {
  const { writable } = await vi.importActual<typeof import("svelte/store")>(
    "svelte/store",
  );
  const state = writable({ friends: [], loading: false });
  return {
    friendStore: {
      subscribe: state.subscribe,
      initialize: vi.fn(async () => {}),
      handleFriendsUpdate: vi.fn(),
      updateFriendPresence: vi.fn(),
    },
  };
});

vi.mock("$lib/stores/userStore", async () => {
  const { writable } = await vi.importActual<typeof import("svelte/store")>(
    "svelte/store",
  );
  const state = writable({
    me: {
      id: "user-1",
      name: "Test User",
      avatar: "https://example.com/avatar.png",
      online: true,
    },
  });
  return {
    userStore: {
      subscribe: state.subscribe,
    },
  };
});

vi.mock("$lib/features/servers/stores/serverStore", async () => {
  const { writable } = await vi.importActual<typeof import("svelte/store")>(
    "svelte/store",
  );
  const initialState = { servers: [], loading: false, activeServerId: null as string | null };
  const state = writable(initialState);
  const initialize = vi.fn(async () => {});
  const handleServersUpdate = (servers: unknown[]) => {
    state.update((current) => ({ ...current, servers, loading: false }));
  };
  const setActiveServer = (serverId: string | null) => {
    state.update((current) => ({ ...current, activeServerId: serverId }));
    if (typeof localStorage !== "undefined") {
      if (serverId) {
        localStorage.setItem("activeServerId", serverId);
      } else {
        localStorage.removeItem("activeServerId");
      }
    }
  };
  return {
    serverStore: {
      subscribe: state.subscribe,
      initialize,
      handleServersUpdate,
      setActiveServer,
      updateServerMemberPresence: vi.fn(),
      addServer: vi.fn(),
      removeServer: vi.fn(),
      fetchServerDetails: vi.fn(),
      addChannelToServer: vi.fn(),
      updateServer: vi.fn(),
      removeChannelFromServer: vi.fn(),
      getServer: vi.fn(),
    },
  };
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => []),
}));

import AppControllerTestHost from "./__tests__/AppControllerTestHost.svelte";
import {
  chatStore,
  activeChannelId,
  activeChatId,
  activeChatType,
  activeServerChannelId,
} from "$lib/features/chat/stores/chatStore";
import { serverStore } from "$lib/features/servers/stores/serverStore";
import type { Server } from "$lib/features/servers/models/Server";

describe("createAppController server channel behavior", () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    chatStore.clearActiveChat();
    serverStore.handleServersUpdate([]);
    serverStore.setActiveServer(null);
    localStorage.clear();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    chatStore.clearActiveChat();
    serverStore.handleServersUpdate([]);
    serverStore.setActiveServer(null);
    localStorage.clear();
  });

  it("keeps the active channel selection after server updates", async () => {
    let resolveReady: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });

    const rendered = render(AppControllerTestHost, {
      props: {
        onReady: () => resolveReady?.(),
      },
    });
    cleanup = rendered.unmount;

    await ready;

    const server: Server = {
      id: "server-1",
      name: "Test Server",
      owner_id: "owner-1",
      channels: [
        {
          id: "channel-general",
          name: "general",
          server_id: "server-1",
          channel_type: "text",
          private: false,
        },
        {
          id: "channel-random",
          name: "random",
          server_id: "server-1",
          channel_type: "text",
          private: false,
        },
      ],
      members: [],
      roles: [],
    };

    serverStore.handleServersUpdate([server]);
    serverStore.setActiveServer(server.id);

    await waitFor(() => {
      expect(get(activeChatType)).toBe("server");
      expect(get(activeChatId)).toBe(server.id);
      expect(get(activeChannelId)).toBe("channel-general");
    });

    await chatStore.setActiveChat(server.id, "server", "channel-random");

    expect(get(activeChannelId)).toBe("channel-random");
    expect(get(activeServerChannelId)).toBe("channel-random");
    expect(
      JSON.parse(localStorage.getItem("serverChannelSelections") ?? "[]"),
    ).toEqual([["server-1", "channel-random"]]);

    const updatedServer: Server = {
      ...server,
      channels: server.channels.map((channel) => ({ ...channel })),
    };

    serverStore.handleServersUpdate([updatedServer]);

    await waitFor(() => {
      expect(get(activeChannelId)).toBe("channel-random");
      expect(get(activeChatId)).toBe(server.id);
      expect(get(activeChatType)).toBe("server");
    });

    expect(get(activeServerChannelId)).toBe("channel-random");
    expect(
      JSON.parse(localStorage.getItem("serverChannelSelections") ?? "[]"),
    ).toEqual([["server-1", "channel-random"]]);
  });

  it("maintains independent channel selections per server", async () => {
    let resolveReady: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });

    const rendered = render(AppControllerTestHost, {
      props: {
        onReady: () => resolveReady?.(),
      },
    });
    cleanup = rendered.unmount;

    await ready;

    const serverA: Server = {
      id: "server-a",
      name: "Alpha",
      owner_id: "owner-1",
      channels: [
        {
          id: "channel-alpha-general",
          name: "general",
          server_id: "server-a",
          channel_type: "text",
          private: false,
        },
        {
          id: "channel-alpha-random",
          name: "random",
          server_id: "server-a",
          channel_type: "text",
          private: false,
        },
      ],
      members: [],
      roles: [],
    };

    const serverB: Server = {
      id: "server-b",
      name: "Beta",
      owner_id: "owner-2",
      channels: [
        {
          id: "channel-beta-general",
          name: "general",
          server_id: "server-b",
          channel_type: "text",
          private: false,
        },
        {
          id: "channel-beta-chill",
          name: "chill",
          server_id: "server-b",
          channel_type: "text",
          private: false,
        },
      ],
      members: [],
      roles: [],
    };

    serverStore.handleServersUpdate([serverA, serverB]);
    serverStore.setActiveServer(serverA.id);

    await waitFor(() => {
      expect(get(activeChatType)).toBe("server");
      expect(get(activeChatId)).toBe(serverA.id);
      expect(get(activeChannelId)).toBe("channel-alpha-general");
    });

    await chatStore.setActiveChat(serverA.id, "server", "channel-alpha-random");

    expect(get(activeServerChannelId)).toBe("channel-alpha-random");

    serverStore.setActiveServer(serverB.id);

    await waitFor(() => {
      expect(get(activeChatType)).toBe("server");
      expect(get(activeChatId)).toBe(serverB.id);
      expect(get(activeChannelId)).toBe("channel-beta-general");
    });

    await chatStore.setActiveChat(serverB.id, "server", "channel-beta-chill");

    expect(get(activeServerChannelId)).toBe("channel-beta-chill");

    serverStore.setActiveServer(serverA.id);

    await waitFor(() => {
      expect(get(activeChatType)).toBe("server");
      expect(get(activeChatId)).toBe(serverA.id);
      expect(get(activeChannelId)).toBe("channel-alpha-random");
      expect(get(activeServerChannelId)).toBe("channel-alpha-random");
    });

    const storedSelections = JSON.parse(
      localStorage.getItem("serverChannelSelections") ?? "[]",
    );
    expect(storedSelections).toEqual(
      expect.arrayContaining([
        ["server-a", "channel-alpha-random"],
        ["server-b", "channel-beta-chill"],
      ]),
    );
  });
});
