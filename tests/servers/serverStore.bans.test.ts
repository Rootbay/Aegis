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

const baseServer: Server = {
  id: "server-1",
  name: "Test Server",
  owner_id: "owner-1",
  channels: [],
  members: [],
  roles: [],
  invites: [],
};

describe("serverStore bans helpers", () => {
  const invokeMock = invoke as unknown as vi.Mock;

  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorageMock());
    serverStore.handleServersUpdate([baseServer]);
    serverCache.clear();
    invokeMock.mockReset();
  });

  afterEach(() => {
    serverStore.handleServersUpdate([]);
    serverCache.clear();
    invokeMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("fetches bans from the backend and caches the result", async () => {
    const backendResponse = [
      {
        id: "user-2",
        username: "Alice",
        avatar: "avatar.png",
        is_online: false,
        public_key: null,
        bio: null,
        tag: null,
      },
    ];

    invokeMock.mockResolvedValueOnce(backendResponse);

    const bans = await serverStore.fetchBans(baseServer.id, { force: true });

    expect(bans).toHaveLength(1);
    expect(bans[0].id).toBe("user-2");
    expect(bans[0].name).toBe("Alice");

    const state = get(serverStore);
    expect(state.bansByServer[baseServer.id]).toHaveLength(1);

    invokeMock.mockClear();

    const cached = await serverStore.fetchBans(baseServer.id);
    expect(cached).toHaveLength(1);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("removes a banned member locally after unban", async () => {
    const backendResponse = [
      {
        id: "user-3",
        username: "Casey",
        avatar: "avatar.png",
        is_online: false,
        public_key: null,
        bio: null,
        tag: null,
      },
    ];

    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "list_server_bans") {
        return Promise.resolve(backendResponse);
      }
      if (cmd === "unban_server_member") {
        return Promise.resolve({
          server_id: baseServer.id,
          user_id: backendResponse[0].id,
        });
      }
      return Promise.reject(new Error(`Unhandled command ${cmd}`));
    });

    await serverStore.fetchBans(baseServer.id, { force: true });

    const result = await serverStore.unbanMember(baseServer.id, backendResponse[0].id);
    expect(result.success).toBe(true);

    const state = get(serverStore);
    expect(state.bansByServer[baseServer.id]).toEqual([]);

    invokeMock.mockClear();
    const cached = await serverStore.fetchBans(baseServer.id);
    expect(cached).toEqual([]);
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
