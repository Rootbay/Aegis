import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import type { Server } from "../../src/lib/features/servers/models/Server";
import type { Role } from "../../src/lib/features/servers/models/Role";
import type { User } from "../../src/lib/features/auth/models/User";
import { serverStore } from "../../src/lib/features/servers/stores/serverStore";
import { serverCache } from "../../src/lib/utils/cache";

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

type InvokeFn = (
  command: string,
  payload?: Record<string, unknown>,
) => Promise<unknown>;

const invokeMockRef = vi.hoisted(() =>
  vi.fn<InvokeFn>((command) => {
    if (command === "update_server_roles") {
      return Promise.resolve([]);
    }
    return Promise.resolve(null);
  }),
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

const baseServer: Server = {
  id: "server-roles",
  name: "Role Test Server",
  owner_id: "owner-1",
  channels: [],
  categories: [],
  members: [],
  roles: [],
  invites: [],
  settings: { transparentEdits: false, deletedMessageDisplay: "ghost" },
};

const createRole = (overrides: Partial<Role> = {}): Role => ({
  id: overrides.id ?? `role-${Math.random().toString(36).slice(2, 8)}`,
  name: overrides.name ?? "Role",
  color: overrides.color ?? "#ffffff",
  hoist: overrides.hoist ?? false,
  mentionable: overrides.mentionable ?? false,
  position: overrides.position ?? 0,
  permissions: overrides.permissions ?? {},
  member_ids: overrides.member_ids ?? [],
});

const createMember = (overrides: Partial<User> = {}): User => ({
  id: overrides.id ?? "member-1",
  name: overrides.name ?? "Member One",
  avatar: overrides.avatar ?? "",
  online: overrides.online ?? true,
  ...overrides,
});

describe("serverStore role hierarchy", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorageMock());
    serverCache.clear();
    serverStore.handleServersUpdate([]);
    invokeMockRef.mockReset();
  });

  afterEach(() => {
    invokeMockRef.mockReset();
    serverStore.handleServersUpdate([]);
    serverCache.clear();
    vi.unstubAllGlobals();
  });

  it("normalizes role positions and member assignments", () => {
    const member = createMember({ id: "member-1" });
    const server: Server = {
      ...baseServer,
      members: [member],
      roles: [
        createRole({
          id: "role-low",
          name: "Low",
          position: 9,
          member_ids: ["member-1"],
        }),
        createRole({
          id: "role-high",
          name: "High",
          position: 0,
          permissions: { manage_roles: true },
          member_ids: ["member-1"],
        }),
        createRole({
          id: "role-mid",
          name: "Mid",
          position: 4,
        }),
      ],
    };

    serverStore.handleServersUpdate([server]);

    const stored = get(serverStore).servers[0];
    expect(stored.roles.map((role) => role.id)).toEqual([
      "role-high",
      "role-mid",
      "role-low",
    ]);
    expect(stored.roles.map((role) => role.position)).toEqual([0, 1, 2]);

    const storedMember = stored.members.find((entry) => entry.id === "member-1");
    expect(storedMember?.roles).toEqual(["role-high", "role-low"]);
  });

  it("reindexes reordered roles before persisting updates", async () => {
    const server: Server = {
      ...baseServer,
      roles: [
        createRole({ id: "role-a", name: "Alpha", position: 0 }),
        createRole({ id: "role-b", name: "Beta", position: 1 }),
        createRole({ id: "role-c", name: "Gamma", position: 2 }),
      ],
    };

    serverStore.handleServersUpdate([server]);

    invokeMockRef.mockImplementation((command, payload) => {
      if (command === "update_server_roles") {
        const rolesPayload = payload?.roles as Role[];
        expect(rolesPayload.map((role) => ({ id: role.id, position: role.position }))).toEqual([
          { id: "role-c", position: 0 },
          { id: "role-a", position: 1 },
          { id: "role-b", position: 2 },
        ]);
        return Promise.resolve(rolesPayload);
      }
      return Promise.resolve(null);
    });

    const reorderedRoles: Role[] = [
      { ...server.roles[2], position: 0 },
      { ...server.roles[0], position: 1 },
      { ...server.roles[1], position: 2 },
    ];

    const result = await serverStore.replaceServerRoles(
      "server-roles",
      reorderedRoles,
    );

    expect(result.success).toBe(true);

    const stored = get(serverStore).servers[0];
    expect(stored.roles.map((role) => role.id)).toEqual([
      "role-c",
      "role-a",
      "role-b",
    ]);
    expect(stored.roles.map((role) => role.position)).toEqual([0, 1, 2]);
  });
});
