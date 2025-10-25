import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";
import { get } from "svelte/store";
import { createChatStore } from "./chatStore";
import { serverStore } from "$lib/features/servers/stores/serverStore";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("$lib/stores/userStore", () => ({
  userStore: {
    subscribe: (run: (value: { me: { id: string } | null }) => void) => {
      run({ me: { id: "user-1" } });
      return () => {};
    },
  },
}));

describe("chatStore attachment lifecycle", () => {
  let createdUrls: string[];
  let revokeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createdUrls = [];
    invokeMock.mockReset();
    localStorage.clear();
    serverStore.handleServersUpdate([]);
    serverStore.setActiveServer(null);
    const createSpy = vi.fn(() => {
      const url = `blob:${createdUrls.length}`;
      createdUrls.push(url);
      return url;
    });
    revokeSpy = vi.fn();
    vi.stubGlobal(
      "URL",
      {
        createObjectURL: createSpy,
        revokeObjectURL: revokeSpy,
      } as unknown as typeof URL,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    serverStore.handleServersUpdate([]);
    serverStore.setActiveServer(null);
  });

  it("revokes object URLs when messages are replaced", async () => {
    const firstAttachment = {
      id: "att-1",
      name: "file-a.txt",
      content_type: "text/plain",
      data: [1, 2, 3],
    };
    const secondAttachment = {
      ...firstAttachment,
      data: [4, 5, 6],
    };
    const timestamp = new Date().toISOString();

    invokeMock
      .mockResolvedValueOnce([
        {
          id: "msg-1",
          content: "hello",
          timestamp,
          attachments: [firstAttachment],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "msg-1",
          content: "hello",
          timestamp,
          attachments: [secondAttachment],
        },
      ]);

    const store = createChatStore();

    await store.setActiveChat("chat-1", "dm");
    await store.setActiveChat("chat-1", "dm", undefined, { forceRefresh: true });

    expect(createdUrls.length).toBeGreaterThan(1);
    expect(revokeSpy).toHaveBeenCalledWith(createdUrls[0]);
    expect(revokeSpy).toHaveBeenCalledTimes(1);
  });

  it("revokes object URLs when messages are deleted", async () => {
    const attachment = {
      id: "att-1",
      name: "file-a.txt",
      content_type: "text/plain",
      data: [1, 2, 3],
    };
    const timestamp = new Date().toISOString();

    invokeMock
      .mockResolvedValueOnce([
        {
          id: "msg-1",
          content: "hello",
          timestamp,
          attachments: [attachment],
        },
      ])
      .mockResolvedValueOnce(undefined);

    const store = createChatStore();

    await store.setActiveChat("chat-1", "dm");
    await store.deleteMessage("chat-1", "msg-1");

    expect(createdUrls.length).toBeGreaterThan(0);
    expect(revokeSpy).toHaveBeenCalledWith(createdUrls[0]);
  });

  it("prunes oldest persisted messages when retention limit is exceeded", async () => {
    const base = Date.now();
    const backendMessages = Array.from({ length: 4 }, (_, index) => ({
      id: `msg-${index + 1}`,
      content: `message-${index + 1}`,
      timestamp: new Date(base + index * 1000).toISOString(),
      attachments: [
        {
          id: `att-${index + 1}`,
          name: `file-${index + 1}.txt`,
          content_type: "text/plain",
          data: [index + 1],
        },
      ],
    }));

    invokeMock.mockResolvedValueOnce(backendMessages);

    const store = createChatStore({ maxMessagesPerChat: 2 });

    await store.setActiveChat("chat-1", "dm");

    const storedMessages = get(store.messagesByChatId).get("chat-1") ?? [];
    expect(storedMessages.map((msg) => msg.id)).toEqual(["msg-3", "msg-4"]);
    expect(revokeSpy).toHaveBeenCalledWith(createdUrls[0]);
    expect(revokeSpy).toHaveBeenCalledWith(createdUrls[1]);
    expect(revokeSpy).toHaveBeenCalledTimes(2);
  });

  it("does not request more messages once the retention limit is reached", async () => {
    const timestamp = new Date().toISOString();

    invokeMock.mockResolvedValueOnce([
      {
        id: "msg-1",
        content: "hello",
        timestamp,
      },
      {
        id: "msg-2",
        content: "world",
        timestamp,
      },
    ]);

    const store = createChatStore({ maxMessagesPerChat: 2 });

    await store.setActiveChat("chat-1", "dm");
    const callCountAfterLoad = invokeMock.mock.calls.length;

    await store.loadMoreMessages("chat-1");

    expect(invokeMock.mock.calls.length).toBe(callCountAfterLoad);
    expect(get(store.hasMoreByChatId).get("chat-1")).toBe(false);
  });

  it("clears cached history and revokes URLs when the active chat is cleared", async () => {
    const timestamp = new Date().toISOString();

    invokeMock.mockResolvedValueOnce([
      {
        id: "msg-1",
        content: "hello",
        timestamp,
        attachments: [
          {
            id: "att-1",
            name: "file-a.txt",
            content_type: "text/plain",
            data: [1, 2, 3],
          },
        ],
      },
    ]);

    const store = createChatStore({ maxMessagesPerChat: 2 });

    await store.setActiveChat("chat-1", "dm");
    expect(get(store.messagesByChatId).get("chat-1")).toBeDefined();

    store.clearActiveChat();

    expect(get(store.messagesByChatId).get("chat-1")).toBeUndefined();
    expect(get(store.hasMoreByChatId).get("chat-1")).toBeUndefined();
    expect(revokeSpy).toHaveBeenCalledWith(createdUrls[0]);
  });

  it("does not re-fetch when cached persisted messages exist", async () => {
    const timestamp = new Date().toISOString();

    invokeMock.mockResolvedValueOnce([
      {
        id: "msg-1",
        content: "hello",
        timestamp,
      },
    ]);

    const store = createChatStore();

    await store.setActiveChat("chat-1", "dm");
    expect(invokeMock).toHaveBeenCalledTimes(1);

    await store.setActiveChat("chat-1", "dm");
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("retains the selected server channel when no new channel id is provided", async () => {
    invokeMock.mockResolvedValue([]);

    const store = createChatStore();

    await store.setActiveChat("server-1", "server", "channel-2");

    serverStore.setActiveServer("server-1");

    expect(JSON.parse(localStorage.getItem("serverChannelSelections") ?? "[]")).toEqual([
      ["server-1", "channel-2"],
    ]);
    expect(get(store.activeChannelId)).toBe("channel-2");
    expect(get(store.activeServerChannelId)).toBe("channel-2");

    await store.setActiveChat("server-1", "server");

    expect(JSON.parse(localStorage.getItem("serverChannelSelections") ?? "[]")).toEqual([
      ["server-1", "channel-2"],
    ]);
    expect(get(store.activeChannelId)).toBe("channel-2");
    expect(get(store.activeServerChannelId)).toBe("channel-2");
  });
});
