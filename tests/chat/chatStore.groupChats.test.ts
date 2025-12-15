import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createMockConnectivityStore } from "./connectivityStore.mock";
import { get, writable } from "svelte/store";

vi.mock("$lib/stores/userStore", () => {
  const state = writable({ me: { id: "user-123", name: "Test User" } });
  return {
    userStore: {
      subscribe: state.subscribe,
    },
  };
});
vi.mock("../../src/lib/stores/userStore", () => {
  const state = writable({ me: { id: "user-123", name: "Test User" } });
  return {
    userStore: {
      subscribe: state.subscribe,
    },
  };
});

vi.mock("$lib/features/servers/stores/serverStore", () => {
  const state = writable({ activeServerId: null });
  return {
    serverStore: {
      subscribe: state.subscribe,
    },
    activeServerEmojiCategories: {
      subscribe: (run: (value: unknown) => void) => {
        run([]);
        return () => {};
      },
    },
  };
});
vi.mock("../../src/lib/features/servers/stores/serverStore", () => {
  const state = writable({ activeServerId: null });
  return {
    serverStore: {
      subscribe: state.subscribe,
    },
    activeServerEmojiCategories: {
      subscribe: (run: (value: unknown) => void) => {
        run([]);
        return () => {};
      },
    },
  };
});

const connectivityMocks = vi.hoisted(() => createMockConnectivityStore());

vi.mock("$lib/stores/connectivityStore", () => ({
  connectivityStore: connectivityMocks.store,
}));
vi.mock("../../src/lib/stores/connectivityStore", () => ({
  connectivityStore: connectivityMocks.store,
}));

vi.mock("$lib/features/friends/stores/friendStore", () => {
  const state = writable({ friends: [], loading: false });
  return {
    friendStore: {
      subscribe: state.subscribe,
    },
  };
});
vi.mock("../../src/lib/features/friends/stores/friendStore", () => {
  const state = writable({ friends: [], loading: false });
  return {
    friendStore: {
      subscribe: state.subscribe,
    },
  };
});

vi.mock("$lib/features/settings/stores/settings", () => {
  const state = writable({ ephemeralMessageDuration: null });
  return {
    settings: {
      subscribe: state.subscribe,
    },
  };
});
vi.mock("../../src/lib/features/settings/stores/settings", () => {
  const state = writable({ ephemeralMessageDuration: null });
  return {
    settings: {
      subscribe: state.subscribe,
    },
  };
});

vi.mock("$lib/features/friends/stores/mutedFriendsStore", () => ({
  mutedFriendsStore: {
    isMuted: vi.fn().mockReturnValue(false),
    mute: vi.fn(),
    unmute: vi.fn(),
    subscribe: (run: (value: unknown) => void) => {
      run(undefined);
      return () => {};
    },
  },
}));
vi.mock("../../src/lib/features/friends/stores/mutedFriendsStore", () => ({
  mutedFriendsStore: {
    isMuted: vi.fn().mockReturnValue(false),
    mute: vi.fn(),
    unmute: vi.fn(),
    subscribe: (run: (value: unknown) => void) => {
      run(undefined);
      return () => {};
    },
  },
}));

vi.mock("$lib/features/chat/services/chatEncryptionService", () => ({
  encryptOutgoingMessagePayload: vi.fn(
    async ({
      content,
      attachments,
    }: {
      content: string;
      attachments: unknown[];
    }) => ({
      content,
      attachments,
      wasEncrypted: false,
    }),
  ),
  decodeIncomingMessagePayload: vi.fn(
    async ({
      content,
      attachments,
    }: {
      content: string;
      attachments?: unknown[] | null;
    }) => ({
      content,
      attachments: attachments ?? undefined,
      wasEncrypted: false,
    }),
  ),
}));
vi.mock("../../src/lib/features/chat/services/chatEncryptionService", () => ({
  encryptOutgoingMessagePayload: vi.fn(
    async ({
      content,
      attachments,
    }: {
      content: string;
      attachments: unknown[];
    }) => ({
      content,
      attachments,
      wasEncrypted: false,
    }),
  ),
  decodeIncomingMessagePayload: vi.fn(
    async ({
      content,
      attachments,
    }: {
      content: string;
      attachments?: unknown[] | null;
    }) => ({
      content,
      attachments: attachments ?? undefined,
      wasEncrypted: false,
    }),
  ),
}));

vi.mock("$lib/utils/nativeNotification", () => ({
  showNativeNotification: vi.fn(),
}));
vi.mock("../../src/lib/utils/nativeNotification", () => ({
  showNativeNotification: vi.fn(),
}));

vi.mock("$lib/features/security/spamClassifier", () => ({
  spamClassifier: {
    scoreText: vi.fn(async () => ({
      score: 0,
      label: "ham",
      flagged: false,
      autoMuted: false,
      reasons: [],
      context: "message",
    })),
    clearCache: vi.fn(),
    loadModel: vi.fn(),
    isFlagged: vi.fn(() => false),
    shouldAutoMute: vi.fn(() => false),
  },
}));
vi.mock("../../src/lib/features/security/spamClassifier", () => ({
  spamClassifier: {
    scoreText: vi.fn(async () => ({
      score: 0,
      label: "ham",
      flagged: false,
      autoMuted: false,
      reasons: [],
      context: "message",
    })),
    clearCache: vi.fn(),
    loadModel: vi.fn(),
    isFlagged: vi.fn(() => false),
    shouldAutoMute: vi.fn(() => false),
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { createChatStore } from "../../src/lib/features/chat/stores/chatStore";
import type { BackendGroupChat } from "../../src/lib/features/chat/stores/chatStore";
import { invoke } from "@tauri-apps/api/core";

const invokeMock = vi.mocked(invoke);

const createLocalStorageMock = () => {
  const storage = new Map<string, string>();
  return {
    getItem: (key: string) => (storage.has(key) ? storage.get(key)! : null),
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => {
      storage.clear();
    },
    key: (index: number) => Array.from(storage.keys())[index] ?? null,
    get length() {
      return storage.size;
    },
  } satisfies Storage;
};

describe("chatStore group chat management", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorageMock());
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:mock"),
      revokeObjectURL: vi.fn(),
    } as unknown as typeof URL);
    invokeMock.mockReset();
    connectivityMocks.reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  const seedGroup = (store: ReturnType<typeof createChatStore>) => {
    const createdAt = new Date().toISOString();
    const summary = store.handleGroupChatCreated({
      id: "group-1",
      name: "Initial name",
      owner_id: "user-123",
      created_at: createdAt,
      member_ids: ["user-123", "user-456"],
    } satisfies BackendGroupChat);
    return { createdAt, summary };
  };

  it("updates the group summary when a rename succeeds", async () => {
    const store = createChatStore();
    const { createdAt } = seedGroup(store);

    invokeMock.mockImplementationOnce(async (command, payload: unknown) => {
      expect(command).toBe("rename_group_dm");
      expect(payload).toMatchObject({
        groupId: "group-1",
        group_id: "group-1",
        name: "Renamed group",
      });
      return {
        id: "group-1",
        name: "Renamed group",
        owner_id: "user-123",
        created_at: createdAt,
        member_ids: ["user-123", "user-456"],
      } satisfies BackendGroupChat;
    });

    const summary = await store.renameGroupChat("group-1", "Renamed group");

    expect(summary.name).toBe("Renamed group");
    const entry = get(store.groupChats).get("group-1");
    expect(entry?.name).toBe("Renamed group");
  });

  it("trims whitespace before invoking the rename command", async () => {
    const store = createChatStore();
    const { createdAt, summary } = seedGroup(store);

    invokeMock.mockImplementationOnce(async (command, payload: unknown) => {
      expect(command).toBe("rename_group_dm");
      expect((payload as { name: string })?.name).toBe("Updated title");
      return {
        id: "group-1",
        name: "Updated title",
        owner_id: summary.ownerId,
        created_at: createdAt,
        member_ids: summary.memberIds,
      } satisfies BackendGroupChat;
    });

    await store.renameGroupChat("group-1", "  Updated title   ");

    const entry = get(store.groupChats).get("group-1");
    expect(entry?.name).toBe("Updated title");
  });

  it("adds new members via the add_group_dm_member command", async () => {
    const store = createChatStore();
    const { createdAt } = seedGroup(store);

    invokeMock.mockImplementationOnce(async (command, payload: unknown) => {
      expect(command).toBe("add_group_dm_member");
      expect(payload).toMatchObject({
        groupId: "group-1",
        group_id: "group-1",
        memberIds: ["user-789"],
        member_ids: ["user-789"],
      });
      return {
        id: "group-1",
        name: "Initial name",
        owner_id: "user-123",
        created_at: createdAt,
        member_ids: ["user-123", "user-456", "user-789"],
      } satisfies BackendGroupChat;
    });

    const summary = await store.addMembersToGroupChat("group-1", [
      "user-789",
      "user-789",
    ]);

    expect(summary.memberIds).toContain("user-789");
    const entry = get(store.groupChats).get("group-1");
    expect(entry?.memberIds).toEqual(["user-123", "user-456", "user-789"]);
  });

  it("removes a member via the remove_group_dm_member command", async () => {
    const store = createChatStore();
    const { createdAt } = seedGroup(store);

    invokeMock.mockImplementationOnce(async (command, payload: unknown) => {
      expect(command).toBe("remove_group_dm_member");
      expect(payload).toMatchObject({
        groupId: "group-1",
        group_id: "group-1",
        memberId: "user-456",
        member_id: "user-456",
      });
      return {
        id: "group-1",
        name: "Initial name",
        owner_id: "user-123",
        created_at: createdAt,
        member_ids: ["user-123"],
      } satisfies BackendGroupChat;
    });

    await store.removeGroupChatMember("group-1", "user-456");

    const entry = get(store.groupChats).get("group-1");
    expect(entry?.memberIds).toEqual(["user-123"]);
  });

  it("merges incoming group member additions", () => {
    const store = createChatStore();
    seedGroup(store);

    store.handleGroupMembersAdded("group-1", ["user-456", "user-789"]);

    const entry = get(store.groupChats).get("group-1");
    expect(entry?.memberIds).toEqual(["user-123", "user-456", "user-789"]);
  });
});
