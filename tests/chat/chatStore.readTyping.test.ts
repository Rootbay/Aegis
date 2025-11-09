import {
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { get, writable } from "svelte/store";
import { createMockConnectivityStore } from "./connectivityStore.mock";

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

type MockServerState = {
  activeServerId: string | null;
  servers: Array<{
    id: string;
    name: string;
    owner_id: string;
    channels: Array<{
      id: string;
      server_id: string;
      name: string;
      channel_type: string;
      private: boolean;
      position: number;
      category_id: string | null;
    }>;
    categories: unknown[];
    members: unknown[];
    roles: unknown[];
    settings?: Record<string, unknown>;
  }>;
};

const createServerStoreState = () => {
  const state = writable<MockServerState>({
    activeServerId: null,
    servers: [],
  });
  return {
    state,
    set(next: MockServerState) {
      state.set(next);
    },
    reset() {
      state.set({ activeServerId: null, servers: [] });
    },
  };
};

const serverStoreStateRef = createServerStoreState();

vi.mock("$lib/features/servers/stores/serverStore", () => ({
  serverStore: {
    subscribe: serverStoreStateRef.state.subscribe,
    __setState: (next: MockServerState) => serverStoreStateRef.set(next),
  },
  activeServerEmojiCategories: {
    subscribe: (run: (value: unknown) => void) => {
      run([]);
      return () => {};
    },
  },
}));

const connectivityMocks = vi.hoisted(() => createMockConnectivityStore());

vi.mock("$lib/stores/connectivityStore", () => ({
  connectivityStore: connectivityMocks.store,
}));
vi.mock("../../src/lib/stores/connectivityStore", () => ({
  connectivityStore: connectivityMocks.store,
}));

const settingsStoreRef = vi.hoisted(() => {
  const initial = {
    enableReadReceipts: false,
    enableTypingIndicators: false,
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

type ChatStoreModule =
  typeof import("../../src/lib/features/chat/stores/chatStore");
let createChatStore: ChatStoreModule["createChatStore"];

beforeAll(async () => {
  vi.stubGlobal("localStorage", createLocalStorageMock());
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:mock"),
    revokeObjectURL: vi.fn(),
  } as unknown as typeof URL);
  ({ createChatStore } = await import(
    "../../src/lib/features/chat/stores/chatStore"
  ));
});
import { invoke } from "@tauri-apps/api/core";

const invokeMock = vi.mocked(invoke);

describe("chatStore read receipts and typing indicators", () => {
  beforeEach(() => {
    localStorage.clear();
    settingsStoreRef.reset();
    serverStoreStateRef.reset();
    invokeMock.mockReset();
    connectivityMocks.reset();
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

  const configureServerState = (settings?: Record<string, unknown>) => {
    serverStoreStateRef.set({
      activeServerId: "server-1",
      servers: [
        {
          id: "server-1",
          name: "Test Server",
          owner_id: "owner-1",
          channels: [
            {
              id: "channel-1",
              server_id: "server-1",
              name: "general",
              channel_type: "text",
              private: false,
              position: 0,
              category_id: null,
            },
          ],
          categories: [],
          members: [],
          roles: [],
          settings,
        },
      ],
    });
  };

  const seedServerChat = async (settings?: Record<string, unknown>) => {
    configureServerState(settings);
    const store = createChatStore();
    await store.setActiveChat("server-1", "server", "channel-1");
    store.handleMessagesUpdate("channel-1", [
      {
        id: "msg-1",
        chatId: "channel-1",
        senderId: "friend-1",
        content: "Hello",
        timestamp: new Date().toISOString(),
        read: false,
      },
    ]);
    return store;
  };

  it("marks messages as read without emitting receipts by default", async () => {
    const store = await seedChat();
    invokeMock.mockClear();

    await store.markActiveChatViewed();

    expect(invokeMock).not.toHaveBeenCalledWith(
      "send_read_receipt",
      expect.anything(),
    );

    const messages = get(store.messagesByChatId).get("chat-1") ?? [];
    expect(messages[0]?.read).toBe(true);
  });

  it("sends read receipts when globally enabled", async () => {
    settingsStoreRef.store.update((current) => ({
      ...current,
      enableReadReceipts: true,
    }));
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
  });

  it("sends read receipts when chat override enables them", async () => {
    const store = await seedChat();
    store.setChatPreferenceOverride("chat-1", { readReceiptsEnabled: true });
    invokeMock.mockClear();

    await store.markActiveChatViewed();

    expect(invokeMock).toHaveBeenCalledWith("send_read_receipt", {
      chatId: "chat-1",
      chat_id: "chat-1",
      messageId: "msg-1",
      message_id: "msg-1",
      timestamp: expect.any(String),
    });
  });

  it("respects server overrides that disable read receipts", async () => {
    const store = await seedServerChat({ enableReadReceipts: false });
    invokeMock.mockClear();

    await store.markActiveChatViewed();

    expect(invokeMock).not.toHaveBeenCalledWith(
      "send_read_receipt",
      expect.anything(),
    );
  });

  it("respects server overrides that enable read receipts", async () => {
    const store = await seedServerChat({ enableReadReceipts: true });
    invokeMock.mockClear();

    await store.markActiveChatViewed();

    expect(invokeMock).toHaveBeenCalledWith("send_read_receipt", {
      chatId: "channel-1",
      chat_id: "channel-1",
      messageId: "msg-1",
      message_id: "msg-1",
      timestamp: expect.any(String),
    });
  });

  it("allows chat overrides to disable server-enforced read receipts", async () => {
    const store = await seedServerChat({ enableReadReceipts: true });
    store.setChatPreferenceOverride("channel-1", { readReceiptsEnabled: false });
    invokeMock.mockClear();

    await store.markActiveChatViewed();

    expect(invokeMock).not.toHaveBeenCalledWith(
      "send_read_receipt",
      expect.anything(),
    );
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

  it("does not send typing indicators by default", async () => {
    const store = await seedChat();
    invokeMock.mockClear();

    await store.sendTypingIndicator(true);

    expect(invokeMock).not.toHaveBeenCalledWith(
      "send_typing_indicator",
      expect.anything(),
    );
  });

  it("sends typing indicators when globally enabled", async () => {
    settingsStoreRef.store.update((current) => ({
      ...current,
      enableTypingIndicators: true,
    }));
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

  it("sends typing indicators when chat override enables them", async () => {
    const store = await seedChat();
    store.setChatPreferenceOverride("chat-1", { typingIndicatorsEnabled: true });
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

  it("allows chat overrides to disable typing indicators even when globally enabled", async () => {
    settingsStoreRef.store.update((current) => ({
      ...current,
      enableTypingIndicators: true,
    }));
    const store = await seedChat();
    store.setChatPreferenceOverride("chat-1", { typingIndicatorsEnabled: false });
    invokeMock.mockClear();

    await store.sendTypingIndicator(true);

    expect(invokeMock).not.toHaveBeenCalledWith(
      "send_typing_indicator",
      expect.anything(),
    );
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
