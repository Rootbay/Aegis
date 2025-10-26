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
  const encryptMock = vi.fn(async (params: {
    content: string;
    attachments: unknown[];
  }) => ({
    content: params.content,
    attachments: params.attachments,
    wasEncrypted: false,
  }));
  const decodeMock = vi.fn(
    (params: { content: string; attachments?: unknown[] | null }) => ({
      content: params.content,
      attachments: params.attachments ?? undefined,
      wasEncrypted: false,
    }),
  );
  return { encryptMock, decodeMock };
});

vi.mock("$lib/features/chat/services/chatEncryptionService", () => ({
  encryptOutgoingMessagePayload: encryptionMocks.encryptMock,
  decodeIncomingMessagePayload: encryptionMocks.decodeMock,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { createChatStore } from "../../src/lib/features/chat/stores/chatStore";
import { invoke } from "@tauri-apps/api/core";
import {
  encryptOutgoingMessagePayload,
  decodeIncomingMessagePayload,
} from "../../src/lib/features/chat/services/chatEncryptionService";

const invokeMock = vi.mocked(invoke);
const encryptOutgoingMock = vi.mocked(encryptOutgoingMessagePayload);
const decodeIncomingMock = vi.mocked(decodeIncomingMessagePayload);

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

describe("chatStore encrypted messaging", () => {
  beforeEach(() => {
    createObjectURLSpy = vi.fn(
      () => `blob:mock-${Math.random().toString(16).slice(2)}`,
    );
    revokeObjectURLSpy = vi.fn();
    vi.stubGlobal(
      "URL",
      {
        createObjectURL: createObjectURLSpy,
        revokeObjectURL: revokeObjectURLSpy,
      } as unknown as typeof URL,
    );
    vi.stubGlobal("localStorage", createLocalStorageMock());
    invokeMock.mockReset();
    encryptionMocks.encryptMock.mockReset();
    encryptionMocks.encryptMock.mockImplementation(async (params) => ({
      content: params.content,
      attachments: params.attachments,
      wasEncrypted: false,
    }));
    encryptionMocks.decodeMock.mockReset();
    encryptionMocks.decodeMock.mockImplementation((params) => ({
      content: params.content,
      attachments: params.attachments ?? undefined,
      wasEncrypted: false,
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  const setupDmStore = async () => {
    const store = createChatStore();
    invokeMock.mockImplementation(async (command, payload) => {
      if (command === "get_messages") {
        return [];
      }
      if (command === "send_encrypted_dm") {
        return undefined;
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    await store.setActiveChat("friend-1", "dm");
    return store;
  };

  it("uses encrypted command for direct messages and reconciles pending entries", async () => {
    const store = await setupDmStore();

    await store.sendMessage("Hello secure");

    let messages = get(store.messagesByChatId).get("friend-1") ?? [];
    expect(messages).toHaveLength(1);
    expect(messages[0].pending).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("send_encrypted_dm", {
      message: "Hello secure",
      recipientId: "friend-1",
      recipient_id: "friend-1",
    });

    const timestamp = new Date().toISOString();
    store.handleNewMessageEvent({
      id: "remote-1",
      sender: "user-123",
      content: "Hello secure",
      timestamp,
      conversation_id: "friend-1",
    });

    messages = get(store.messagesByChatId).get("friend-1") ?? [];
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe("remote-1");
    expect(messages[0].pending).toBe(false);
  });

  it("falls back to plaintext command when encrypted send fails", async () => {
    const store = createChatStore();
    invokeMock.mockImplementation(async (command) => {
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
    await store.setActiveChat("friend-2", "dm");

    await store.sendMessage("Fallback message");

    expect(invokeMock).toHaveBeenCalledWith("send_encrypted_dm", expect.anything());
    expect(invokeMock).toHaveBeenCalledWith("send_direct_message", {
      message: "Fallback message",
      recipientId: "friend-2",
      recipient_id: "friend-2",
    });

    const messages = get(store.messagesByChatId).get("friend-2") ?? [];
    expect(messages).toHaveLength(1);
    expect(messages[0].pending).toBe(true);
  });

  it("encrypts attachments before sending payloads", async () => {
    const store = createChatStore();
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_messages") {
        return [];
      }
      if (command === "send_direct_message_with_attachments") {
        return undefined;
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    await store.setActiveChat("friend-attachments", "dm");

    const encryptedData = new Uint8Array([9, 9, 9]);
    encryptOutgoingMock.mockResolvedValueOnce({
      content: "cipher-content",
      attachments: [
        {
          name: "secret.txt",
          type: "text/plain",
          size: 3,
          data: encryptedData,
        },
      ],
      wasEncrypted: true,
    });

    const file = createMockFile([1, 2, 3], "secret.txt", "text/plain");

    await store.sendMessageWithAttachments("payload", [file]);

    expect(encryptOutgoingMock).toHaveBeenCalled();
    expect(invokeMock).toHaveBeenCalledWith(
      "send_direct_message_with_attachments",
      expect.objectContaining({
        message: "cipher-content",
        attachments: [
          expect.objectContaining({
            name: "secret.txt",
            data: encryptedData,
          }),
        ],
      }),
    );
  });

  it("decodes encrypted payloads when mapping backend messages", async () => {
    const store = createChatStore();
    const decodedContent = "decrypted text";
    decodeIncomingMock.mockImplementationOnce((params) => ({
      content: decodedContent,
      attachments: params.attachments ?? undefined,
      wasEncrypted: true,
    }));

    const now = new Date().toISOString();
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_messages") {
        return [
          {
            id: "msg-encoded",
            chat_id: "friend-3",
            sender_id: "friend",
            content: "cipher",
            timestamp: now,
          },
        ];
      }
      if (command === "send_encrypted_dm") {
        return undefined;
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    await store.setActiveChat("friend-3", "dm");

    const messages = get(store.messagesByChatId).get("friend-3") ?? [];
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe(decodedContent);
  });
});
