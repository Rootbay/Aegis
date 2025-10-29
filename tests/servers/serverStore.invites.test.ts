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
import type { ServerInvite } from "../../src/lib/features/servers/models/ServerInvite";

const invokeMock = invoke as unknown as vi.Mock;

const toBackendInvite = (invite: ServerInvite) => ({
  id: invite.id,
  server_id: invite.serverId,
  code: invite.code,
  created_by: invite.createdBy,
  created_at: invite.createdAt,
  expires_at: invite.expiresAt ?? null,
  max_uses: invite.maxUses ?? null,
  uses: invite.uses,
});

describe("serverStore invites", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorageMock());
    serverStore.handleServersUpdate([]);
    invokeMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    invokeMock.mockReset();
  });

  const baseServer: Server = {
    id: "server-1",
    name: "Test Server",
    owner_id: "user-1",
    channels: [],
    categories: [],
    members: [],
    roles: [],
    invites: [],
  };

  const createInvite = (
    overrides: Partial<ServerInvite> = {},
  ): ServerInvite => ({
    id: "invite-1",
    serverId: baseServer.id,
    code: "code-123",
    createdBy: "user-1",
    createdAt: new Date().toISOString(),
    expiresAt: undefined,
    maxUses: undefined,
    uses: 0,
    ...overrides,
  });

  it("appends generated invites to the target server", () => {
    serverStore.addServer(baseServer);

    const invite = createInvite();
    serverStore.addInviteToServer(baseServer.id, invite);

    const state = get(serverStore);
    expect(state.servers).toHaveLength(1);
    expect(state.servers[0].invites).toEqual([invite]);
  });

  it("replaces existing invite entries when ids match", () => {
    serverStore.addServer(baseServer);

    const original = createInvite({ uses: 0 });
    serverStore.addInviteToServer(baseServer.id, original);

    const updated = createInvite({ uses: 2 });
    serverStore.addInviteToServer(baseServer.id, updated);

    const state = get(serverStore);
    expect(state.servers[0].invites).toHaveLength(1);
    expect(state.servers[0].invites?.[0].uses).toBe(2);
  });

  it("refreshes invites from the backend", async () => {
    serverStore.addServer(baseServer);

    const backendInvite = toBackendInvite(
      createInvite({ id: "invite-2", code: "code-456" }),
    );

    invokeMock.mockResolvedValueOnce([backendInvite]);

    const invites = await serverStore.refreshServerInvites(baseServer.id);

    expect(invokeMock).toHaveBeenCalledWith("list_server_invites", {
      serverId: baseServer.id,
      server_id: baseServer.id,
    });
    expect(invites).toHaveLength(1);
    expect(invites[0].id).toBe("invite-2");

    const state = get(serverStore);
    expect(state.servers[0].invites).toHaveLength(1);
    expect(state.servers[0].invites?.[0].code).toBe("code-456");
  });

  it("replaces invite listings when entries are removed", async () => {
    serverStore.addServer(baseServer);

    const first = createInvite({ id: "invite-1" });
    const second = createInvite({ id: "invite-2", code: "code-456" });
    serverStore.addInviteToServer(baseServer.id, first);
    serverStore.addInviteToServer(baseServer.id, second);

    invokeMock.mockResolvedValueOnce([toBackendInvite(first)]);

    await serverStore.refreshServerInvites(baseServer.id);

    const state = get(serverStore);
    expect(state.servers[0].invites).toHaveLength(1);
    expect(state.servers[0].invites?.[0].id).toBe("invite-1");
  });
});
