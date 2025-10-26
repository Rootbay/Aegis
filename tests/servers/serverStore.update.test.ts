import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("$lib/stores/userStore", () => ({
  userStore: {
    subscribe: (run: (value: unknown) => void) => {
      run({ me: { id: "user-1" } });
      return () => {};
    },
  },
}));

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
  } satisfies Storage;
};

import { invoke } from "@tauri-apps/api/core";
import { serverStore } from "../../src/lib/features/servers/stores/serverStore";
import type { Server } from "../../src/lib/features/servers/models/Server";
import { serverCache } from "../../src/lib/utils/cache";

describe("serverStore.updateServer", () => {
  const baseServer: Server = {
    id: "server-1",
    name: "Test Server",
    owner_id: "owner-1",
    channels: [],
    members: [],
    roles: [],
    invites: [],
  };

  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorageMock());
    serverStore.handleServersUpdate([baseServer]);
    serverCache.clear();
    (invoke as unknown as vi.Mock).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists metadata before updating local state", async () => {
    const invokeMock = invoke as unknown as vi.Mock;
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "update_server_metadata") {
        return Promise.resolve({
          id: "server-1",
          name: "Updated Server",
          owner_id: "owner-1",
          created_at: new Date().toISOString(),
          channels: [],
          members: [],
          roles: [],
          invites: [],
          icon_url: "icon.png",
        });
      }
      return Promise.reject(new Error(`Unhandled command ${cmd}`));
    });

    const result = await serverStore.updateServer("server-1", {
      name: "Updated Server",
      iconUrl: "icon.png",
    });

    expect(result.success).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith(
      "update_server_metadata",
      expect.objectContaining({
        metadata: expect.objectContaining({ name: "Updated Server" }),
      }),
    );
    expect(invokeMock).toHaveBeenCalledTimes(1);

    const state = get(serverStore);
    expect(state.servers[0].name).toBe("Updated Server");
    expect(state.servers[0].iconUrl).toBe("icon.png");
    expect(serverCache.get("server-1")?.name).toBe("Updated Server");
  });

  it("uses backend channel updates to keep cache in sync", async () => {
    const invokeMock = invoke as unknown as vi.Mock;
    const returnedChannels = [
      {
        id: "channel-1",
        server_id: "server-1",
        name: "general",
        channel_type: "text",
        private: false,
      },
      {
        id: "channel-2",
        server_id: "server-1",
        name: "voice",
        channel_type: "voice",
        private: false,
      },
    ];

    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "update_server_channels") {
        return Promise.resolve(returnedChannels);
      }
      return Promise.resolve({});
    });

    const result = await serverStore.updateServer("server-1", {
      channels: returnedChannels,
    });

    expect(result.success).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith(
      "update_server_channels",
      expect.objectContaining({
        channels: returnedChannels,
      }),
    );

    const state = get(serverStore);
    expect(state.servers[0].channels).toEqual(returnedChannels);
    expect(serverCache.get("server-1")?.channels).toEqual(returnedChannels);
  });

  it("reverts optimistic state when the backend update fails", async () => {
    const invokeMock = invoke as unknown as vi.Mock;
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "update_server_metadata") {
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
});
