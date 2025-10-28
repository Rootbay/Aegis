import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { get, writable } from "svelte/store";

vi.mock("$lib/stores/userStore", () => {
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
  };
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { createChatStore } from "../../src/lib/features/chat/stores/chatStore";
import type { EditMessage } from "../../src/lib/features/chat/models/AepMessage";
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

let createObjectURLSpy: ReturnType<typeof vi.fn>;
let revokeObjectURLSpy: ReturnType<typeof vi.fn>;

describe("chatStore message editing", () => {
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

  const seedMessage = async (content = "Original message") => {
    const store = createChatStore();
    await store.handleNewMessageEvent({
      id: "msg-1",
      sender: "user-123",
      content,
      timestamp: new Date().toISOString(),
      conversation_id: "chat-1",
    });
    return store;
  };

  it("optimistically updates content and metadata when editing", async () => {
    const store = await seedMessage();
    invokeMock.mockResolvedValue(undefined);

    await store.editMessage("chat-1", "msg-1", "Updated content");

    const messages = get(store.messagesByChatId).get("chat-1") ?? [];
    expect(messages).toHaveLength(1);
    const updated = messages[0];
    expect(updated.content).toBe("Updated content");
    expect(updated.editedBy).toBe("user-123");
    expect(updated.editedAt).toBeDefined();
    expect(Number.isNaN(Date.parse(updated.editedAt!))).toBe(false);
    expect(invokeMock).toHaveBeenCalledWith("edit_message", {
      chatId: "chat-1",
      chat_id: "chat-1",
      messageId: "msg-1",
      message_id: "msg-1",
      content: "Updated content",
    });
  });

  it("reverts the optimistic edit when the backend call fails", async () => {
    const store = await seedMessage();
    invokeMock.mockRejectedValue(new Error("boom"));

    await expect(
      store.editMessage("chat-1", "msg-1", "Will not persist"),
    ).rejects.toThrowError("boom");

    const messages = get(store.messagesByChatId).get("chat-1") ?? [];
    expect(messages).toHaveLength(1);
    const message = messages[0];
    expect(message.content).toBe("Original message");
    expect(message.editedAt).toBeUndefined();
    expect(message.editedBy).toBeUndefined();
  });

  it("applies remote edit events", async () => {
    const store = await seedMessage();
    const editedAt = new Date().toISOString();
    const payload: EditMessage = {
      message_id: "msg-1",
      chat_id: "chat-1",
      new_content: "Remote edit",
      editor_id: "user-999",
      edited_at: editedAt,
    };

    store.handleMessageEdited(payload);

    const messages = get(store.messagesByChatId).get("chat-1") ?? [];
    expect(messages).toHaveLength(1);
    const message = messages[0];
    expect(message.content).toBe("Remote edit");
    expect(message.editedBy).toBe("user-999");
    expect(message.editedAt).toBeDefined();
    expect(message.editedAt).toBe(new Date(editedAt).toISOString());
  });
});

describe("chatStore metadata derivations", () => {
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
    invokeMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("tracks last activity and unread counts for chats", () => {
    const store = createChatStore();
    const timestamp1 = "2024-01-01T10:00:00.000Z";
    const timestamp2 = "2024-01-01T12:00:00.000Z";
    store.handleMessagesUpdate("chat-1", [
      {
        id: "msg-1",
        chatId: "chat-1",
        senderId: "user-999",
        content: "Hello there",
        timestamp: timestamp1,
        read: true,
      },
      {
        id: "msg-2",
        chatId: "chat-1",
        senderId: "user-123",
        content: "Reply",
        timestamp: timestamp2,
        read: false,
      },
    ]);

    const metadata = get(store.metadataByChatId).get("chat-1");
    expect(metadata).toBeDefined();
    expect(metadata?.lastMessage?.id).toBe("msg-2");
    expect(metadata?.lastActivityAt).toBe(new Date(timestamp2).toISOString());
    expect(metadata?.unreadCount).toBe(1);
  });
});
