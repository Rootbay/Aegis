import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("$lib/stores/userStore", () => ({
  userStore: {
    subscribe: (run: (value: unknown) => void) => {
      run({ me: { id: "owner-1" } });
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

import type { Server } from "../../src/lib/features/servers/models/Server";
import type { User } from "../../src/lib/features/auth/models/User";
import { serverStore } from "../../src/lib/features/servers/stores/serverStore";
import { serverCache } from "../../src/lib/utils/cache";

describe("serverStore.removeMemberFromServer", () => {
  const memberA: User = {
    id: "member-a",
    name: "Member A",
    avatar: "",
    online: true,
  };

  const memberB: User = {
    id: "member-b",
    name: "Member B",
    avatar: "",
    online: false,
  };

  const baseServer: Server = {
    id: "server-1",
    name: "Test Server",
    owner_id: "owner-1",
    channels: [],
    categories: [],
    members: [memberA, memberB],
    roles: [],
    invites: [],
  };

  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorageMock());
    serverCache.clear();
    serverStore.handleServersUpdate([baseServer]);
  });

  afterEach(() => {
    serverStore.handleServersUpdate([]);
    serverCache.clear();
    vi.unstubAllGlobals();
  });

  it("removes the member from the active server and cache", () => {
    serverStore.removeMemberFromServer("server-1", "member-a");

    const state = get(serverStore);
    expect(state.servers[0].members).toEqual([memberB]);

    const cached = serverCache.get("server-1");
    expect(cached?.members).toEqual([memberB]);
  });

  it("leaves other servers untouched", () => {
    const otherServer: Server = {
      id: "server-2",
      name: "Another",
      owner_id: "owner-1",
      channels: [],
      categories: [],
      members: [],
      roles: [],
      invites: [],
    };

    serverStore.handleServersUpdate([baseServer, otherServer]);
    serverStore.removeMemberFromServer("server-1", "member-b");

    const state = get(serverStore);
    expect(state.servers[1]).toEqual(otherServer);
    expect(state.servers[0].members).toEqual([memberA]);
  });
});
