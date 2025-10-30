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

const encryptionMocks = vi.hoisted(() => {
  const defaultEncrypt = vi.fn(
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
  );
  const defaultDecode = vi.fn(
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
  );
  return {
    encryptMock: defaultEncrypt,
    decodeMock: defaultDecode,
  };
});

vi.mock("$lib/features/chat/services/chatEncryptionService", () => ({
  encryptOutgoingMessagePayload: encryptionMocks.encryptMock,
  decodeIncomingMessagePayload: encryptionMocks.decodeMock,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { createChatStore } from "../../src/lib/features/chat/stores/chatStore";
import type { EditMessage } from "../../src/lib/features/chat/models/AepMessage";
import type { MessageAttachmentPayload } from "../../src/lib/features/chat/services/chatEncryptionService";
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

const createMockFile = (
  bytes: number[] | Uint8Array,
  name: string,
  type: string,
): File => {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return {
    name,
    size: data.byteLength,
    type,
    arrayBuffer: async () => data.slice().buffer,
  } as unknown as File;
};

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
    const now = Date.now();
    const timestamp1 = new Date(now - 60_000).toISOString();
    const timestamp2 = new Date(now).toISOString();
    store.handleMessagesUpdate("chat-1", [
      {
        id: "msg-1",
        chatId: "chat-1",
        senderId: "user-999",
        content: "Hello there",
        timestamp: timestamp1,
        read: true,
        pending: false,
      },
      {
        id: "msg-2",
        chatId: "chat-1",
        senderId: "user-123",
        content: "Reply",
        timestamp: timestamp2,
        read: false,
        pending: false,
      },
    ]);

    const metadata = get(store.metadataByChatId).get("chat-1");
    expect(metadata).toBeDefined();
    expect(metadata?.lastMessage?.id).toBe("msg-2");
    expect(metadata?.lastActivityAt).toBe(new Date(timestamp2).toISOString());
    expect(metadata?.unreadCount).toBe(1);
  });
});

describe("chatStore encrypted message refresh", () => {
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
      if (command === "get_messages") {
        const now = new Date().toISOString();
        return [
          {
            id: "encrypted-1",
            chat_id: payload?.chatId ?? payload?.chat_id ?? "friend-456",
            sender_id: "friend-456",
            content: "Encrypted hello",
            timestamp: now,
            read: false,
          },
        ];
      }
      return undefined;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("hydrates chat history for encrypted direct message events", async () => {
    const store = createChatStore();

    expect(get(store.activeChatId)).toBeNull();

    await store.refreshChatFromStorage("friend-456", "dm");

    const messages = get(store.messagesByChatId).get("friend-456") ?? [];
    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe("Encrypted hello");
    expect(get(store.activeChatId)).toBeNull();
    expect(invokeMock).toHaveBeenCalledWith("get_messages", {
      chatId: "friend-456",
      chat_id: "friend-456",
      limit: expect.any(Number),
      offset: 0,
    });
  });
});

describe("chatStore plaintext encryption fallbacks", () => {
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
    encryptionMocks.encryptMock.mockReset();
    encryptionMocks.decodeMock.mockReset();

    encryptionMocks.encryptMock.mockImplementation(
      async ({ content, attachments }) => ({
        content: `cipher:${content}`,
        attachments,
        wasEncrypted: true,
      }),
    );
    encryptionMocks.decodeMock.mockImplementation(async ({ content, attachments }) => ({
      content,
      attachments: attachments ?? undefined,
      wasEncrypted: false,
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  const setupActiveDm = async () => {
    const store = createChatStore();
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_messages") {
        return [];
      }
      return undefined;
    });
    await store.setActiveChat("friend-plain", "dm");
    return store;
  };

  it("sends plaintext content to fallback command when encrypted send fails", async () => {
    const store = await setupActiveDm();
    invokeMock.mockImplementation(async (command, payload) => {
      if (command === "get_messages") {
        return [];
      }
      if (command === "send_encrypted_dm") {
        throw new Error("no session");
      }
      if (command === "send_direct_message") {
        return undefined;
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    await store.sendMessage("Plaintext fallback");

    const encryptedCall = invokeMock.mock.calls.find(
      ([command]) => command === "send_encrypted_dm",
    );
    expect(encryptedCall?.[1]).toEqual(
      expect.objectContaining({ message: "cipher:Plaintext fallback" }),
    );

    const fallbackCall = invokeMock.mock.calls.find(
      ([command]) => command === "send_direct_message",
    );
    expect(fallbackCall?.[1]).toEqual(
      expect.objectContaining({ message: "Plaintext fallback" }),
    );
  });

  it("sends plaintext attachments to fallback command when encrypted send fails", async () => {
    const store = await setupActiveDm();

    const originalBytes = new Uint8Array([5, 6, 7, 8]);
    const attachment = createMockFile(
      originalBytes,
      "fallback.bin",
      "application/octet-stream",
    );

    encryptionMocks.encryptMock.mockImplementationOnce(
      async ({
        content,
        attachments,
      }: {
        content: string;
        attachments: MessageAttachmentPayload[];
      }) => ({
        content: `cipher:${content}`,
        attachments: attachments.map((item) => ({
          ...item,
          data: new Uint8Array((item.data as Uint8Array).map((value) => value ^ 0xff)),
        })),
        wasEncrypted: true,
      }),
    );

    invokeMock.mockImplementation(async (command, payload) => {
      if (command === "get_messages") {
        return [];
      }
      if (command === "send_encrypted_dm_with_attachments") {
        throw new Error("no session");
      }
      if (command === "send_direct_message_with_attachments") {
        expect(payload?.message).toBe("Attachment fallback");
        const sent = payload?.attachments?.[0]?.data as Uint8Array;
        expect(Array.from(sent)).toEqual(Array.from(originalBytes));
        return undefined;
      }
      if (command === "send_encrypted_dm") {
        return undefined;
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    await store.sendMessageWithAttachments("Attachment fallback", [attachment]);

    const encryptedAttachmentCall = invokeMock.mock.calls.find(
      ([command]) => command === "send_encrypted_dm_with_attachments",
    );
    expect(encryptedAttachmentCall?.[1]).toEqual(
      expect.objectContaining({ message: "cipher:Attachment fallback" }),
    );

    const fallbackAttachmentCall = invokeMock.mock.calls.find(
      ([command]) => command === "send_direct_message_with_attachments",
    );
    expect(fallbackAttachmentCall?.[1]).toEqual(
      expect.objectContaining({ message: "Attachment fallback" }),
    );
  });
});
