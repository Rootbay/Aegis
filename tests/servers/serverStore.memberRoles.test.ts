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

vi.mock("$lib/features/calls/stores/voicePresenceStore", () => ({
  voicePresenceStore: {
    subscribe: (run: (value: Map<string, unknown>) => void) => {
      run(new Map());
      return () => {};
    },
  },
}));

import { serverStore } from "../../src/lib/features/servers/stores/serverStore";
import type { Server } from "../../src/lib/features/servers/models/Server";
import type { Role } from "../../src/lib/features/servers/models/Role";
import type { User } from "../../src/lib/features/auth/models/User";
import { serverCache } from "../../src/lib/utils/cache";
import { invoke } from "@tauri-apps/api/core";

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

describe("serverStore.updateMemberRoles", () => {
  const baseMember: User = {
    id: "member-1",
    name: "Test Member",
    avatar: "",
    online: true,
    roles: [],
  };

  const otherMember: User = {
    id: "member-2",
    name: "Another Member",
    avatar: "",
    online: false,
    roles: ["role-2"],
  };

  const baseRoles: Role[] = [
    {
      id: "role-1",
      name: "Admin",
      color: "#ffffff",
      hoist: false,
      mentionable: true,
      position: 0,
      permissions: {},
      member_ids: [],
    },
    {
      id: "role-2",
      name: "Moderator",
      color: "#ff0000",
      hoist: false,
      mentionable: false,
      position: 1,
      permissions: {},
      member_ids: ["member-2"],
    },
  ];

  const baseServer: Server = {
    id: "server-1",
    name: "Role Test Server",
    owner_id: "owner-1",
    channels: [],
    categories: [],
    members: [baseMember, otherMember],
    roles: baseRoles,
    invites: [],
  };

  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorageMock());
    serverCache.clear();
    serverStore.handleServersUpdate([baseServer]);
    vi.mocked(invoke).mockReset();
  });

  afterEach(() => {
    serverStore.handleServersUpdate([]);
    serverCache.clear();
    vi.unstubAllGlobals();
    vi.mocked(invoke).mockReset();
  });

  it("assigns a role to a member and persists the change", async () => {
    const persistedRoles: Role[] = [
      { ...baseRoles[0], member_ids: ["member-1"] },
      baseRoles[1],
    ];
    vi.mocked(invoke).mockResolvedValueOnce(persistedRoles);

    const result = await serverStore.updateMemberRoles(
      "server-1",
      "member-1",
      ["role-1"],
    );

    expect(result.success).toBe(true);
    expect(vi.mocked(invoke)).toHaveBeenCalledWith("update_server_roles", {
      serverId: "server-1",
      server_id: "server-1",
      roles: expect.arrayContaining([
        expect.objectContaining({ id: "role-1" }),
        expect.objectContaining({ id: "role-2" }),
      ]),
    });

    const state = get(serverStore);
    const updatedServer = state.servers[0];
    expect(updatedServer.members.find((m) => m.id === "member-1")?.roles).toEqual([
      "role-1",
    ]);
    expect(
      updatedServer.roles.find((role) => role.id === "role-1")?.member_ids,
    ).toContain("member-1");

    const cached = serverCache.get("server-1");
    expect(cached?.roles.find((role) => role.id === "role-1")?.member_ids).toContain(
      "member-1",
    );
  });

  it("reverts optimistic changes when the backend update fails", async () => {
    const serverWithRole: Server = {
      ...baseServer,
      members: [
        { ...baseMember, roles: ["role-1"], role_ids: ["role-1"], roleIds: ["role-1"] },
        otherMember,
      ],
      roles: [
        { ...baseRoles[0], member_ids: ["member-1"] },
        baseRoles[1],
      ],
    };

    serverStore.handleServersUpdate([serverWithRole]);

    vi.mocked(invoke).mockRejectedValueOnce(new Error("Network failure"));

    const result = await serverStore.updateMemberRoles(
      "server-1",
      "member-1",
      [],
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Network failure");

    const state = get(serverStore);
    const storedMember = state.servers[0].members.find(
      (member) => member.id === "member-1",
    );
    expect(storedMember?.roles).toEqual(["role-1"]);

    const storedRole = state.servers[0].roles.find((role) => role.id === "role-1");
    expect(storedRole?.member_ids).toEqual(["member-1"]);
  });
});
