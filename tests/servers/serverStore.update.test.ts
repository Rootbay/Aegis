import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import type { Server } from "../../src/lib/features/servers/models/Server";
import type { Channel } from "../../src/lib/features/channels/models/Channel";

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  key: (index: number) => string | null;
  readonly length: number;
};

const createLocalStorageMock = () => {
  const storage = new Map<string, string>();
  return {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => storage.clear(),
    key: (index: number) => Array.from(storage.keys())[index] ?? null,
    get length() {
      return storage.size;
    },
  } satisfies StorageLike;
};

type InvokeFn = (
  command: string,
  payload?: Record<string, unknown>,
) => Promise<unknown>;

const invokeMockRef = vi.hoisted(() =>
  vi.fn<InvokeFn>(() =>
    Promise.reject(new Error("invoke mock not implemented")),
  ),
);

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMockRef,
}));

vi.mock("$lib/stores/userStore", () => ({
  userStore: {
    subscribe: (run: (value: unknown) => void) => {
      run({ me: { id: "user-1" } });
      return () => {};
    },
  },
}));

import { serverStore } from "../../src/lib/features/servers/stores/serverStore";
import { serverCache } from "../../src/lib/utils/cache";

const baseServer: Server = {
  id: "server-1",
  name: "Test Server",
  owner_id: "owner-1",
  channels: [],
  categories: [],
  members: [],
  roles: [],
  invites: [],
  settings: {
    transparentEdits: false,
    deletedMessageDisplay: "ghost",
  },
};

describe("serverStore.updateServer", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorageMock());
    serverStore.handleServersUpdate([baseServer]);
    serverCache.clear();
    invokeMockRef.mockReset();
  });

  afterEach(() => {
    invokeMockRef.mockReset();
    vi.unstubAllGlobals();
  });

  it("persists metadata before updating local state", async () => {
    invokeMockRef.mockImplementation((command, payload) => {
      if (command === "update_server_metadata") {
        expect(payload).toMatchObject({
          serverId: "server-1",
          metadata: expect.objectContaining({ name: "Updated Server" }),
        });
        return Promise.resolve({
          id: "server-1",
          name: "Updated Server",
          owner_id: "owner-1",
          created_at: new Date().toISOString(),
          channels: [],
          categories: [],
          members: [],
          roles: [],
          invites: [],
          icon_url: "icon.png",
          iconUrl: "icon.png",
        });
      }
      return Promise.resolve({});
    });

    const result = await serverStore.updateServer("server-1", {
      name: "Updated Server",
      iconUrl: "icon.png",
    });

    expect(result.success).toBe(true);
    expect(invokeMockRef.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(invokeMockRef.mock.calls[0]?.[0]).toBe("update_server_metadata");

    const state = get(serverStore);
    expect(state.servers[0].name).toBe("Updated Server");
    expect(state.servers[0].iconUrl).toBe("icon.png");
    expect(serverCache.get("server-1")?.name).toBe("Updated Server");
  });

  it("uses backend channel updates to keep cache in sync", async () => {
    const returnedChannels: Channel[] = [
      {
        id: "channel-1",
        server_id: "server-1",
        name: "general",
        channel_type: "text",
        private: false,
        category_id: null,
      },
      {
        id: "channel-2",
        server_id: "server-1",
        name: "voice",
        channel_type: "voice",
        private: false,
        category_id: null,
      },
    ];

    invokeMockRef.mockImplementation((command) => {
      if (command === "update_server_channels") {
        return Promise.resolve(returnedChannels);
      }
      return Promise.resolve({});
    });

    const result = await serverStore.updateServer("server-1", {
      channels: returnedChannels,
    });

    expect(result.success).toBe(true);
    const channelCalls = invokeMockRef.mock.calls.filter(
      ([cmd]) => cmd === "update_server_channels",
    );
    expect(channelCalls.length).toBe(1);

    const state = get(serverStore);
    expect(state.servers[0].channels).toEqual(returnedChannels);
    expect(serverCache.get("server-1")?.channels).toEqual(returnedChannels);
  });

  it("reverts optimistic state when the backend update fails", async () => {
    invokeMockRef.mockImplementation((command) => {
      if (command === "update_server_metadata") {
        return Promise.reject(new Error("database write failed"));
      }
      return Promise.resolve({});
    });

    const result = await serverStore.updateServer("server-1", {
      name: "Should Fail",
    });

    expect(result.success).toBe(false);
    const state = get(serverStore);
    expect(state.servers[0].name).toBe("Test Server");
    expect(serverCache.get("server-1")?.name).toBe("Test Server");
  });

  it("persists moderation settings when provided", async () => {
    invokeMockRef.mockImplementation((command, payload) => {
      if (command === "update_server_moderation_flags") {
        expect(payload?.moderation).toMatchObject({
          transparentEdits: true,
          deletedMessageDisplay: "tombstone",
        });
        return Promise.resolve({
          id: "server-1",
          name: "Test Server",
          owner_id: "owner-1",
          created_at: new Date().toISOString(),
          channels: [],
          categories: [],
          members: [],
          roles: [],
          invites: [],
          transparent_edits: true,
          deleted_message_display: "tombstone",
        });
      }
      return Promise.resolve({});
    });

    const result = await serverStore.updateServer("server-1", {
      settings: {
        transparentEdits: true,
        deletedMessageDisplay: "tombstone",
      },
    });

    expect(result.success).toBe(true);
    const moderationCalls = invokeMockRef.mock.calls.filter(
      ([cmd]) => cmd === "update_server_moderation_flags",
    );
    expect(moderationCalls.length).toBe(1);

    const state = get(serverStore);
    expect(state.servers[0].settings?.transparentEdits).toBe(true);
    expect(state.servers[0].settings?.deletedMessageDisplay).toBe("tombstone");
  });
});
