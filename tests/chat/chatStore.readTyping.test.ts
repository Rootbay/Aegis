import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { get, writable } from "svelte/store";

type AppSettings = {
  enableReadReceipts: boolean;
  enableTypingIndicators: boolean;
  ephemeralMessageDuration: number | null;
};

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
  key(index: number): string | null;
  readonly length: number;
};

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
  } satisfies StorageLike;
};

vi.mock("$lib/stores/persistentStore", () => ({
  persistentStore: <T>(_key: string, initialValue: T) => writable(initialValue),
}));

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

const settingsStoreRef = vi.hoisted(() => {
  const initial = {
    enableReadReceipts: true,
    enableTypingIndicators: true,
    ephemeralMessageDuration: 60,
  } as unknown as AppSettings;
  let value = { ...initial } as AppSettings;
  const subscribers = new Set<(settings: AppSettings) => void>();
  const emit = () => {
    for (const subscriber of subscribers) {
      subscriber(value);
    }
  };
  return {
    initial,
    store: {
      subscribe(callback: (settings: AppSettings) => void) {
        subscribers.add(callback);
        callback(value);
        return () => subscribers.delete(callback);
      },
      set(next: AppSettings) {
        value = next;
        emit();
      },
      update(updater: (settings: AppSettings) => AppSettings) {
        value = updater(value);
        emit();
      },
    },
    reset() {
      value = { ...initial } as AppSettings;
      emit();
    },
  };
});

vi.mock("$lib/features/settings/stores/settings", () => ({
  settings: settingsStoreRef.store,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

type ChatStoreModule = typeof import("../../src/lib/features/chat/stores/chatStore");
let createChatStore: ChatStoreModule["createChatStore"];

beforeAll(async () => {
  vi.stubGlobal("localStorage", createLocalStorageMock());
  vi.stubGlobal(
    "URL",
    {
      createObjectURL: vi.fn(() => "blob:mock"),
      revokeObjectURL: vi.fn(),
    } as unknown as typeof URL,
  );
  ({ createChatStore } = await import("../../src/lib/features/chat/stores/chatStore"));
});
import { invoke } from "@tauri-apps/api/core";

const invokeMock = vi.mocked(invoke);

describe("chatStore read receipts and typing indicators", () => {
  beforeEach(() => {
    localStorage.clear();
    settingsStoreRef.reset();
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (command, payload: any) => {
      if (command === "decrypt_chat_payload") {
        return {
          content: payload?.content ?? "",
          attachments: payload?.attachments ?? [],
          wasEncrypted: false,
        };
      }
      if (command === "get_messages") {
        return [];
      }
      return undefined;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  const seedChat = async () => {
    const store = createChatStore();
    await store.setActiveChat("chat-1", "dm");
    store.handleMessagesUpdate("chat-1", [
      {
        id: "msg-1",
        chatId: "chat-1",
        senderId: "friend-1",
        content: "Hello",
        timestamp: new Date().toISOString(),
        read: false,
      },
    ]);
    return store;
  };

  it("marks messages as read and sends receipts when enabled", async () => {
    const store = await seedChat();
    invokeMock.mockClear();

    await store.markActiveChatViewed();

    expect(invokeMock).toHaveBeenCalledWith("send_read_receipt", {
      chatId: "chat-1",
      chat_id: "chat-1",
      messageId: "msg-1",
      message_id: "msg-1",
      timestamp: expect.any(String),
    });

    const messages = get(store.messagesByChatId).get("chat-1") ?? [];
    expect(messages[0]?.read).toBe(true);
  });

  it("does not send read receipts when disabled", async () => {
    settingsStoreRef.store.update((current) => ({
      ...current,
      enableReadReceipts: false,
    }));
    const store = await seedChat();
    invokeMock.mockClear();

    await store.markActiveChatViewed();

    expect(invokeMock).not.toHaveBeenCalledWith("send_read_receipt", expect.anything());
  });

  it("applies read receipt updates to messages", async () => {
    const store = await seedChat();
    store.handleMessagesUpdate("chat-1", [
      {
        id: "msg-2",
        chatId: "chat-1",
        senderId: "user-123",
        content: "Sent message",
        timestamp: new Date().toISOString(),
        read: false,
      },
    ]);

    store.handleReadReceipt({
      chatId: "chat-1",
      messageId: "msg-2",
      readerId: "friend-1",
    });

    const messages = get(store.messagesByChatId).get("chat-1") ?? [];
    const ownMessage = messages.find((msg) => msg.id === "msg-2");
    expect(ownMessage?.read).toBe(true);
  });

  it("sends typing indicators when enabled", async () => {
    const store = await seedChat();
    invokeMock.mockClear();

    await store.sendTypingIndicator(true);
    await store.sendTypingIndicator(false);

    expect(invokeMock).toHaveBeenNthCalledWith(1, "send_typing_indicator", {
      chatId: "chat-1",
      chat_id: "chat-1",
      isTyping: true,
      is_typing: true,
      timestamp: expect.any(String),
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "send_typing_indicator", {
      chatId: "chat-1",
      chat_id: "chat-1",
      isTyping: false,
      is_typing: false,
      timestamp: expect.any(String),
    });
  });

  it("does not send typing indicators when disabled", async () => {
    settingsStoreRef.store.update((current) => ({
      ...current,
      enableTypingIndicators: false,
    }));
    const store = await seedChat();
    invokeMock.mockClear();

    await store.sendTypingIndicator(true);

    expect(invokeMock).not.toHaveBeenCalledWith("send_typing_indicator", expect.anything());
  });

  it("tracks typing indicator events for the active chat", async () => {
    const store = await seedChat();
    invokeMock.mockClear();

    store.handleTypingIndicator({
      chatId: "chat-1",
      userId: "friend-1",
      isTyping: true,
    });

    expect(get(store.activeChatTypingUsers)).toEqual(["friend-1"]);

    store.handleTypingIndicator({
      chatId: "chat-1",
      userId: "friend-1",
      isTyping: false,
    });

    expect(get(store.activeChatTypingUsers)).toEqual([]);
  });
});
