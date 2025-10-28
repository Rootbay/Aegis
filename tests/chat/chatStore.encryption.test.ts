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
  const toUint8Array = (input: unknown): Uint8Array => {
    if (input instanceof Uint8Array) return input;
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (Array.isArray(input)) return new Uint8Array(input);
    return new Uint8Array();
  };

  const encryptMock = vi.fn(
    async (params: { content: string; attachments: unknown[] }) => ({
      content: `cipher:${params.content}`,
      attachments: params.attachments.map((attachment: any) => {
        const bytes = toUint8Array(attachment.data);
        const mutated = new Uint8Array(bytes.length);
        mutated.set(bytes.map((value) => value ^ 0xff));
        return {
          ...attachment,
          data: mutated,
        };
      }),
      wasEncrypted: true,
      metadata: { algorithm: "mock", version: 1 },
    }),
  );
  const decodeMock = vi.fn(
    async (params: { content: string; attachments?: unknown[] | null }) => ({
      content: params.content.startsWith("cipher:")
        ? params.content.slice(7)
        : params.content,
      attachments: params.attachments ?? undefined,
      wasEncrypted: params.content.startsWith("cipher:"),
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

describe("chatStore encrypted messaging", () => {
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
    encryptionMocks.encryptMock.mockClear();
    encryptionMocks.decodeMock.mockClear();
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
      if (command === "send_encrypted_dm_with_attachments") {
        return undefined;
      }
      if (command === "send_direct_message_with_attachments") {
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
    expect(invokeMock).toHaveBeenCalledWith(
      "send_encrypted_dm",
      expect.objectContaining({
        message: "cipher:Hello secure",
        recipientId: "friend-1",
        recipient_id: "friend-1",
      }),
    );

    const timestamp = new Date().toISOString();
    await store.handleNewMessageEvent({
      id: "remote-1",
      sender: "user-123",
      content: "cipher:Hello secure",
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

    expect(invokeMock).toHaveBeenCalledWith(
      "send_encrypted_dm",
      expect.anything(),
    );
    expect(invokeMock).toHaveBeenCalledWith(
      "send_direct_message",
      expect.objectContaining({
        message: "cipher:Fallback message",
        recipientId: "friend-2",
        recipient_id: "friend-2",
      }),
    );

    const messages = get(store.messagesByChatId).get("friend-2") ?? [];
    expect(messages).toHaveLength(1);
    expect(messages[0].pending).toBe(true);
  });

  it("encrypts attachments before invoking backend commands", async () => {
    const store = await setupDmStore();
    const originalBytes = new Uint8Array([1, 2, 3, 4]);
    const file = createMockFile(originalBytes, "secret.txt", "text/plain");

    await store.sendMessageWithAttachments("Encrypted file", [file]);

    const attachmentCall = invokeMock.mock.calls.find(
      ([command]) => command === "send_encrypted_dm_with_attachments",
    );
    expect(attachmentCall).toBeTruthy();
    const payload = attachmentCall?.[1] as {
      message: string;
      attachments: Array<{ data: Uint8Array }>;
    };
    expect(payload.message).toBe("cipher:Encrypted file");
    expect(Array.from(payload.attachments[0].data)).not.toEqual(
      Array.from(originalBytes),
    );
  });

  it("falls back to plaintext attachment command when encrypted send fails", async () => {
    const store = createChatStore();
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_messages") {
        return [];
      }
      if (command === "send_encrypted_dm_with_attachments") {
        throw new Error("no session");
      }
      if (command === "send_direct_message_with_attachments") {
        return undefined;
      }
      if (command === "send_encrypted_dm") {
        return undefined;
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    await store.setActiveChat("friend-attachments", "dm");

    const file = createMockFile(
      [5, 6],
      "fallback.bin",
      "application/octet-stream",
    );
    await store.sendMessageWithAttachments("Attachment fallback", [file]);

    expect(invokeMock).toHaveBeenCalledWith(
      "send_encrypted_dm_with_attachments",
      expect.anything(),
    );
    expect(invokeMock).toHaveBeenCalledWith(
      "send_direct_message_with_attachments",
      expect.objectContaining({ message: "cipher:Attachment fallback" }),
    );
  });

  it("removes optimistic entries when attachment encryption fails", async () => {
    const store = await setupDmStore();
    const file = createMockFile(
      [9, 9, 9],
      "boom.bin",
      "application/octet-stream",
    );
    encryptionMocks.encryptMock.mockRejectedValueOnce(new Error("boom"));

    await expect(
      store.sendMessageWithAttachments("Failure", [file]),
    ).rejects.toThrow("boom");

    const messages = get(store.messagesByChatId).get("friend-1") ?? [];
    expect(messages).toHaveLength(0);
  });

  it("decodes encrypted attachments on incoming messages", async () => {
    const store = await setupDmStore();
    const encryptedAttachment = {
      id: "att-remote",
      name: "secret.txt",
      content_type: "text/plain",
      size: 4,
      data: new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
    };

    encryptionMocks.decodeMock.mockResolvedValueOnce({
      content: "Decrypted attachment content",
      attachments: [
        {
          ...encryptedAttachment,
          data: new Uint8Array([1, 2, 3, 4]),
        },
      ],
      wasEncrypted: true,
    });

    await store.handleNewMessageEvent({
      id: "incoming-attachment",
      sender: "friend-1",
      content: "cipher:Decrypted attachment content",
      timestamp: new Date().toISOString(),
      conversation_id: "friend-1",
      attachments: [encryptedAttachment],
    });

    expect(encryptionMocks.decodeMock).toHaveBeenCalledWith({
      content: "cipher:Decrypted attachment content",
      attachments: [encryptedAttachment],
    });

    const messages = get(store.messagesByChatId).get("friend-1") ?? [];
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe("Decrypted attachment content");
    expect(messages[0].attachments).toBeDefined();
    expect(messages[0].attachments?.[0].name).toBe("secret.txt");
    expect(messages[0].attachments?.[0].isLoaded).toBe(true);
  });
});
