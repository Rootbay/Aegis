import { beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";

const {
  invokeMock,
  getInvokeMock,
  getListenMock,
  listenHandlers,
  subscribeToServerStore,
  setActiveServer,
} = vi.hoisted(() => {
  const handlers = new Map<string, (event: { payload: unknown }) => void>();
  const invokeMock = vi.fn();
  const getInvokeMock = vi.fn(async () => invokeMock);
  const getListenMock = vi.fn(
    async () =>
      async (event: string, handler: (event: { payload: unknown }) => void) => {
        handlers.set(event, handler);
        return () => handlers.delete(event);
      },
  );
  const state = { activeServerId: null as string | null };
  const subscribers = new Set<
    (value: { activeServerId: string | null }) => void
  >();
  const subscribe = (
    fn: (value: { activeServerId: string | null }) => void,
  ) => {
    fn({ ...state });
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  };
  const setActiveServer = (id: string | null) => {
    state.activeServerId = id;
    subscribers.forEach((fn) => fn({ ...state }));
  };
  return {
    invokeMock,
    getInvokeMock,
    getListenMock,
    listenHandlers: handlers,
    subscribeToServerStore: subscribe,
    setActiveServer,
  };
});

vi.mock("$lib/services/tauri", () => ({
  getInvoke: getInvokeMock,
  getListen: getListenMock,
}));

vi.mock("$lib/features/servers/stores/serverStore", () => ({
  serverStore: {
    subscribe: subscribeToServerStore,
    __setActiveServer: setActiveServer,
  },
}));

// Import after mocks
import { serverEventsStore } from "../serverEventsStore";
import { serverStore } from "$lib/features/servers/stores/serverStore";
import type { ServerEvent } from "$lib/features/servers/models/ServerEvent";

const mockedServerStore = serverStore as unknown as {
  __setActiveServer: (id: string | null) => void;
};

describe("serverEventsStore", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    getInvokeMock.mockReset();
    getListenMock.mockReset();
    listenHandlers.clear();
    getInvokeMock.mockResolvedValue(invokeMock);
    getListenMock.mockResolvedValue(
      async (event: string, handler: (event: { payload: unknown }) => void) => {
        listenHandlers.set(event, handler);
        return () => listenHandlers.delete(event);
      },
    );
    serverEventsStore.teardown();
    setActiveServer(null);
  });

  it("hydrates events when a server becomes active", async () => {
    const backendEvent: ServerEvent = {
      id: "event-1",
      serverId: "server-1",
      title: "Town Hall",
      description: "Monthly update",
      channelId: undefined,
      scheduledFor: new Date().toISOString(),
      createdBy: "owner",
      createdAt: new Date().toISOString(),
      status: "scheduled",
      cancelledAt: undefined,
    };

    invokeMock.mockResolvedValueOnce([
      {
        id: backendEvent.id,
        server_id: backendEvent.serverId,
        title: backendEvent.title,
        description: backendEvent.description,
        channel_id: backendEvent.channelId ?? null,
        scheduled_for: backendEvent.scheduledFor,
        created_by: backendEvent.createdBy,
        created_at: backendEvent.createdAt,
        status: backendEvent.status,
        cancelled_at: backendEvent.cancelledAt ?? null,
      },
    ]);

    await serverEventsStore.initialize();
    mockedServerStore.__setActiveServer("server-1");

    await vi.waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("list_server_events", {
        server_id: "server-1",
      }),
    );
    const state = get(serverEventsStore);
    expect(state.events).toHaveLength(1);
    expect(state.events[0].id).toBe("event-1");
  });

  it("adds newly created events", async () => {
    invokeMock.mockResolvedValueOnce([]);
    await serverEventsStore.initialize();
    mockedServerStore.__setActiveServer("server-1");

    invokeMock.mockResolvedValueOnce({
      id: "event-2",
      server_id: "server-1",
      title: "Launch Stream",
      description: null,
      channel_id: null,
      scheduled_for: new Date().toISOString(),
      created_by: "owner",
      created_at: new Date().toISOString(),
      status: "scheduled",
      cancelled_at: null,
    });

    const created = await serverEventsStore.createEvent({
      serverId: "server-1",
      title: "Launch Stream",
      scheduledFor: new Date().toISOString(),
    });

    expect(created).not.toBeNull();
    expect(invokeMock).toHaveBeenLastCalledWith(
      "create_server_event",
      expect.any(Object),
    );
    const state = get(serverEventsStore);
    expect(state.events.map((event) => event.id)).toContain("event-2");
  });

  it("responds to backend broadcast updates", async () => {
    invokeMock.mockResolvedValueOnce([]);
    await serverEventsStore.initialize();
    mockedServerStore.__setActiveServer("server-1");

    const handler = listenHandlers.get("server-event-created");
    expect(handler).toBeTypeOf("function");

    handler?.({
      payload: {
        id: "event-3",
        server_id: "server-1",
        title: "Q&A",
        description: null,
        channel_id: null,
        scheduled_for: new Date().toISOString(),
        created_by: "owner",
        created_at: new Date().toISOString(),
        status: "scheduled",
        cancelled_at: null,
      },
    });

    const state = get(serverEventsStore);
    expect(state.events.some((event) => event.id === "event-3")).toBe(true);
  });
});
