import { beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import {
  createServerWebhooksStore,
  type ServerWebhooksStore,
} from "../serverWebhooksStore";

const {
  fetchMock,
  createMock,
  updateMock,
  deleteMock,
  subscribeToServerStore,
  setActiveServer,
} = vi.hoisted(() => {
  const handlers = new Set<(value: { activeServerId: string | null }) => void>();
  const state = { activeServerId: null as string | null };
  return {
    fetchMock: vi.fn(),
    createMock: vi.fn(),
    updateMock: vi.fn(),
    deleteMock: vi.fn(),
    subscribeToServerStore: (
      listener: (value: { activeServerId: string | null }) => void,
    ) => {
      listener({ activeServerId: state.activeServerId });
      handlers.add(listener);
      return () => handlers.delete(listener);
    },
    setActiveServer: (id: string | null) => {
      state.activeServerId = id;
      handlers.forEach((listener) => listener({ activeServerId: id }));
    },
  };
});

vi.mock("$lib/features/servers/services/webhookService", () => ({
  webhookService: {
    fetchWebhooks: fetchMock,
    createWebhook: createMock,
    updateWebhook: updateMock,
    deleteWebhook: deleteMock,
  },
}));

vi.mock("$lib/features/servers/stores/serverStore", () => ({
  serverStore: {
    subscribe: subscribeToServerStore,
    __setActiveServer: setActiveServer,
  },
}));

describe("serverWebhooksStore", () => {
  let store: ServerWebhooksStore;
  const success = <T,>(data: T) => ({ success: true as const, data });
  const failure = (error: string) => ({ success: false as const, error });

  beforeEach(() => {
    fetchMock.mockReset();
    createMock.mockReset();
    updateMock.mockReset();
    deleteMock.mockReset();
    store = createServerWebhooksStore();
    store.teardown();
    store = createServerWebhooksStore();
  });

  it("loads webhooks when a server becomes active", async () => {
    const webhook = {
      id: "hook-1",
      serverId: "server-1",
      name: "Alerts",
      url: "https://example.com",
      channelId: undefined,
      createdBy: "owner",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    };
    fetchMock.mockResolvedValueOnce(success([webhook]));

    await store.initialize();
    setActiveServer("server-1");

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const state = get(store);
    expect(state.webhooks).toHaveLength(1);
    expect(state.webhooks[0].id).toBe("hook-1");
  });

  it("creates a webhook with optimistic insert", async () => {
    fetchMock.mockResolvedValueOnce(success([]));
    createMock.mockImplementation(async (_input, options) => {
      options?.optimisticUpdate?.();
      return success({
        id: "hook-2",
        serverId: "server-1",
        name: "Deploy",
        url: "https://hooks.example.com",
        channelId: undefined,
        createdBy: "owner",
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
      });
    });

    await store.initialize();
    setActiveServer("server-1");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const created = await store.createWebhook({
      name: "Deploy",
      url: "https://hooks.example.com",
      serverId: "server-1",
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(created).not.toBeNull();
    const state = get(store);
    expect(state.webhooks.map((w) => w.id)).toContain("hook-2");
  });

  it("restores previous values when update fails", async () => {
    const existing = {
      id: "hook-3",
      serverId: "server-1",
      name: "Builds",
      url: "https://hooks.example.com/build",
      channelId: undefined,
      createdBy: "owner",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    };
    fetchMock.mockResolvedValueOnce(success([existing]));
    updateMock.mockImplementation(async (_input, options) => {
      const rollback = options?.optimisticUpdate?.();
      rollback && rollback();
      return failure("Unable to update");
    });

    await store.initialize();
    setActiveServer("server-1");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const result = await store.updateWebhook(
      "hook-3",
      { name: "Updated" },
      "server-1",
    );

    expect(result).toBeNull();
    const state = get(store);
    expect(state.webhooks[0].name).toBe("Builds");
    expect(state.error).toBe("Unable to update");
  });

  it("reverts deletion when the backend rejects", async () => {
    const existing = {
      id: "hook-4",
      serverId: "server-1",
      name: "Alerts",
      url: "https://hooks.example.com/alerts",
      channelId: undefined,
      createdBy: "owner",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    };
    fetchMock.mockResolvedValueOnce(success([existing]));
    deleteMock.mockImplementation(async (_input, options) => {
      const rollback = options?.optimisticUpdate?.();
      rollback && rollback();
      return failure("Delete failed");
    });

    await store.initialize();
    setActiveServer("server-1");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const deleted = await store.deleteWebhook("hook-4", "server-1");

    expect(deleted).toBe(false);
    const state = get(store);
    expect(state.webhooks).toHaveLength(1);
    expect(state.webhooks[0].id).toBe("hook-4");
    expect(state.error).toBe("Delete failed");
  });
});
