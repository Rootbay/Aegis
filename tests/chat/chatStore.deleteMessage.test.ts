import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { get, writable } from "svelte/store";

vi.mock("$lib/stores/userStore", () => {
  const state = writable({ me: { id: "user-123" } });
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
  };
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { createChatStore } from "../../src/lib/features/chat/stores/chatStore";
import type { DeleteMessage } from "../../src/lib/features/chat/models/AepMessage";

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

let createObjectURLSpy: ReturnType<typeof vi.fn>;
let revokeObjectURLSpy: ReturnType<typeof vi.fn>;
const invokeMock = vi.mocked(invoke);

describe("chatStore.handleMessageDeleted", () => {
  beforeEach(() => {
    createObjectURLSpy = vi.fn(
      () => `blob:mock-${Math.random().toString(16).slice(2)}`,
    );
    revokeObjectURLSpy = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: createObjectURLSpy,
      revokeObjectURL: revokeObjectURLSpy,
    } as unknown as typeof URL);
    vi.stubGlobal("localStorage", createLocalStorageMock());
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (command, payload) => {
      if (command === "decrypt_chat_payload") {
        return {
          content: payload?.content ?? "",
          attachments: payload?.attachments ?? [],
          wasEncrypted: true,
        };
      }
      return undefined;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  const seedMessage = async (
    store = createChatStore(),
    messageId = "msg-1",
  ) => {
    await store.handleNewMessageEvent({
      id: messageId,
      sender: "user-123",
      content: "Hello world",
      timestamp: new Date().toISOString(),
      conversation_id: "chat-1",
      attachments: [
        {
          id: `${messageId}-att`,
          name: "note.txt",
          content_type: "text/plain",
          size: 4,
          data: new Uint8Array([1, 2, 3, 4]),
        },
      ],
    });
    return store;
  };

  it("removes the targeted message for everyone", async () => {
    const store = await seedMessage();
    const before = get(store.messagesByChatId).get("chat-1") ?? [];
    expect(before).toHaveLength(1);

    const payload: DeleteMessage = {
      message_id: "msg-1",
      chat_id: "chat-1",
      scope: { type: "everyone" },
    };

    store.handleMessageDeleted(payload);

    const after = get(store.messagesByChatId).get("chat-1") ?? [];
    expect(after).toHaveLength(0);
    expect(revokeObjectURLSpy).toHaveBeenCalled();
  });

  it("ignores deletions that target other users", async () => {
    const store = await seedMessage(undefined, "msg-2");
    const before = get(store.messagesByChatId).get("chat-1") ?? [];
    expect(before).toHaveLength(1);

    const payload: DeleteMessage = {
      message_id: "msg-2",
      chat_id: "chat-1",
      scope: { type: "specific-users", user_ids: ["someone-else"] },
    };

    store.handleMessageDeleted(payload);

    const after = get(store.messagesByChatId).get("chat-1") ?? [];
    expect(after).toHaveLength(1);
    expect(revokeObjectURLSpy).not.toHaveBeenCalled();
  });

  it("respects specific user scopes that include the current user", async () => {
    const store = await seedMessage(undefined, "msg-3");
    const before = get(store.messagesByChatId).get("chat-1") ?? [];
    expect(before).toHaveLength(1);

    const payload: DeleteMessage = {
      message_id: "msg-3",
      chat_id: "chat-1",
      scope: { type: "specific-users", userIds: ["user-123", "other"] },
    };

    store.handleMessageDeleted(payload);

    const after = get(store.messagesByChatId).get("chat-1") ?? [];
    expect(after).toHaveLength(0);
    expect(revokeObjectURLSpy).toHaveBeenCalled();
  });
});
