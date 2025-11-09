import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";
import type { MockInstance } from "vitest";
import { get } from "svelte/store";
import { createChatStore, SlowmodeError } from "./chatStore";
import { serverStore } from "$lib/features/servers/stores/serverStore";
import { friendStore } from "$lib/features/friends/stores/friendStore";
import { settings } from "$lib/features/settings/stores/settings";
import type { Friend } from "$lib/features/friends/models/Friend";
import type { Server } from "$lib/features/servers/models/Server";

const invokeMock = vi.fn();
const showNativeNotificationMock = vi.fn((_payload: unknown) =>
  Promise.resolve(),
);

const createDeferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("$lib/utils/nativeNotification", () => ({
  showNativeNotification: (payload: unknown) =>
    showNativeNotificationMock(payload),
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
  type DocumentHasFocusSpy = MockInstance<() => boolean>;
  let focusSpy: DocumentHasFocusSpy | undefined;

  beforeEach(() => {
    createdUrls = [];
    invokeMock.mockReset();
    invokeMock.mockImplementation(() => Promise.resolve(undefined));
    showNativeNotificationMock.mockReset();
    localStorage.clear();
    serverStore.handleServersUpdate([]);
    serverStore.setActiveServer(null);
    friendStore.handleFriendsUpdate([]);
    settings.update((current) => ({
      ...current,
      user: { ...current.user },
      ephemeralMessageDuration: 60,
      enableNewMessageNotifications: true,
      enableGroupMessageNotifications: true,
      notificationSound: "Default Silent Chime",
    }));
    focusSpy?.mockRestore();
    const hasFocusSpy = vi.spyOn(document, "hasFocus");
    hasFocusSpy.mockReturnValue(true);
    focusSpy = hasFocusSpy;
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    const createSpy = vi.fn(() => {
      const url = `blob:${createdUrls.length}`;
      createdUrls.push(url);
      return url;
    });
    revokeSpy = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: createSpy,
      revokeObjectURL: revokeSpy,
    } as unknown as typeof URL);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
    serverStore.handleServersUpdate([]);
    serverStore.setActiveServer(null);
    friendStore.handleFriendsUpdate([]);
    focusSpy?.mockRestore();
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
    await store.setActiveChat("chat-1", "dm", undefined, {
      forceRefresh: true,
    });

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

  it("reconciles optimistic reactions with authoritative updates", async () => {
    const timestamp = new Date().toISOString();
    const store = createChatStore();

    store.handleMessagesUpdate("chat-1", [
      {
        id: "msg-1",
        chatId: "chat-1",
        senderId: "user-2",
        content: "hello",
        timestamp,
        read: true,
      },
    ]);

    invokeMock.mockResolvedValueOnce(undefined);
    await store.addReaction("chat-1", "msg-1", "🔥");

    let messages = get(store.messagesByChatId).get("chat-1") ?? [];
    expect(messages[0]?.reactions?.["🔥"]).toEqual(["user-1"]);

    store.handleReactionUpdate({
      chat_id: "chat-1",
      message_id: "msg-1",
      emoji: "🔥",
      user_id: "user-1",
      action: "add",
    });

    messages = get(store.messagesByChatId).get("chat-1") ?? [];
    expect(messages[0]?.reactions?.["🔥"]).toEqual(["user-1"]);
  });

  it("retains the selected server channel when no new channel id is provided", async () => {
    invokeMock.mockResolvedValue([]);

    const store = createChatStore();

    await store.setActiveChat("server-1", "server", "channel-2");

    serverStore.setActiveServer("server-1");

    expect(
      JSON.parse(localStorage.getItem("serverChannelSelections") ?? "[]"),
    ).toEqual([["server-1", "channel-2"]]);
    expect(get(store.activeChannelId)).toBe("channel-2");
    expect(get(store.activeServerChannelId)).toBe("channel-2");

    await store.setActiveChat("server-1", "server");

    expect(
      JSON.parse(localStorage.getItem("serverChannelSelections") ?? "[]"),
    ).toEqual([["server-1", "channel-2"]]);
    expect(get(store.activeChannelId)).toBe("channel-2");
    expect(get(store.activeServerChannelId)).toBe("channel-2");
  });

  it("clears unread metadata counts when a direct chat is marked read", async () => {
    const store = createChatStore();
    const timestamp = new Date().toISOString();

    store.handleMessagesUpdate("chat-1", [
      {
        id: "msg-1",
        chatId: "chat-1",
        senderId: "user-2",
        content: "hello",
        timestamp,
        read: false,
      },
      {
        id: "msg-2",
        chatId: "chat-1",
        senderId: "user-3",
        content: "world",
        timestamp,
        read: false,
      },
    ]);

    expect(get(store.metadataByChatId).get("chat-1")?.unreadCount).toBe(2);

    await store.markChatRead("chat-1");

    const metadata = get(store.metadataByChatId).get("chat-1");
    expect(metadata?.unreadCount).toBe(0);
    const messages = get(store.messagesByChatId).get("chat-1") ?? [];
    expect(messages.every((message) => message.read)).toBe(true);
  });

  it("clears unread metadata counts when a server channel is marked read", async () => {
    const store = createChatStore();
    const timestamp = new Date().toISOString();
    const server: Server = {
      id: "server-1",
      name: "Test Server",
      owner_id: "owner-1",
      channels: [
        {
          id: "channel-1",
          name: "general",
          server_id: "server-1",
          channel_type: "text",
          private: false,
          category_id: null,
        },
      ],
      categories: [],
      members: [],
      roles: [],
    };

    serverStore.handleServersUpdate([server]);

    store.handleMessagesUpdate("channel-1", [
      {
        id: "msg-1",
        chatId: "channel-1",
        senderId: "user-2",
        content: "hello",
        timestamp,
        read: false,
      },
      {
        id: "msg-2",
        chatId: "channel-1",
        senderId: "user-3",
        content: "world",
        timestamp,
        read: false,
      },
    ]);

    expect(get(store.metadataByChatId).get("channel-1")?.unreadCount).toBe(2);

    await store.markChatRead("channel-1", { serverId: server.id });

    const metadata = get(store.metadataByChatId).get("channel-1");
    expect(metadata?.unreadCount).toBe(0);
    const messages = get(store.messagesByChatId).get("channel-1") ?? [];
    expect(messages.every((message) => message.read)).toBe(true);
  });

  it("aggregates unread counts across server text channels", () => {
    const store = createChatStore();
    const timestamp = new Date().toISOString();
    const serverA: Server = {
      id: "server-1",
      name: "Alpha",
      owner_id: "owner-1",
      channels: [
        {
          id: "channel-1",
          name: "general",
          server_id: "server-1",
          channel_type: "text",
          private: false,
          category_id: null,
        },
        {
          id: "channel-2",
          name: "updates",
          server_id: "server-1",
          channel_type: "text",
          private: false,
          category_id: null,
        },
        {
          id: "channel-voice",
          name: "Lounge",
          server_id: "server-1",
          channel_type: "voice",
          private: false,
          category_id: null,
        },
      ],
      categories: [],
      members: [],
      roles: [],
    };
    const serverB: Server = {
      id: "server-2",
      name: "Bravo",
      owner_id: "owner-2",
      channels: [],
      categories: [],
      members: [],
      roles: [],
    };

    serverStore.handleServersUpdate([serverA, serverB]);

    store.handleMessagesUpdate("channel-1", [
      {
        id: "msg-1",
        chatId: "channel-1",
        senderId: "user-2",
        content: "hello",
        timestamp,
        read: false,
      },
      {
        id: "msg-2",
        chatId: "channel-1",
        senderId: "user-3",
        content: "world",
        timestamp,
        read: true,
      },
    ]);

    store.handleMessagesUpdate("channel-2", [
      {
        id: "msg-3",
        chatId: "channel-2",
        senderId: "user-4",
        content: "updates",
        timestamp,
        read: false,
      },
      {
        id: "msg-4",
        chatId: "channel-2",
        senderId: "user-5",
        content: "more",
        timestamp,
        read: false,
      },
    ]);

    store.handleMessagesUpdate("channel-voice", [
      {
        id: "msg-voice",
        chatId: "channel-voice",
        senderId: "user-6",
        content: "voice message",
        timestamp,
        read: false,
      },
    ]);

    const totals = get(store.serverUnreadCountByServerId);
    expect(totals.get("server-1")).toBe(3);
    expect(totals.get("server-2")).toBe(0);
  });

  it("tracks loading state per chat during concurrent loads", async () => {
    const deferredByChat = new Map<string, ReturnType<typeof createDeferred>>();
    invokeMock.mockImplementation((command: string, payload: unknown) => {
      if (command === "get_messages") {
        const params = payload as { chatId?: string; chat_id?: string };
        const chatId = params.chatId ?? params.chat_id ?? "";
        const deferred = createDeferred<any>();
        deferredByChat.set(chatId, deferred);
        return deferred.promise;
      }
      return Promise.resolve(undefined);
    });

    const store = createChatStore();

    const loadA = store.setActiveChat("chat-1", "dm");
    const loadB = store.setActiveChat("chat-2", "dm");

    expect(get(store.loadingStateByChat).get("chat-1")).toBe(true);
    expect(get(store.loadingStateByChat).get("chat-2")).toBe(true);

    const firstDeferred = deferredByChat.get("chat-1");
    expect(firstDeferred).toBeDefined();
    firstDeferred?.resolve([
      { id: "msg-1", content: "hello", timestamp: new Date().toISOString() },
    ]);
    await loadA;

    expect(get(store.loadingStateByChat).get("chat-1")).toBe(false);
    expect(get(store.loadingStateByChat).get("chat-2")).toBe(true);

    const secondDeferred = deferredByChat.get("chat-2");
    expect(secondDeferred).toBeDefined();
    secondDeferred?.resolve([
      { id: "msg-2", content: "world", timestamp: new Date().toISOString() },
    ]);
    await loadB;

    expect(get(store.loadingStateByChat).get("chat-2")).toBe(false);
  });

  it("ignores stale responses when a newer load begins", async () => {
    const deferreds: Array<{
      chatId: string;
      deferred: ReturnType<typeof createDeferred>;
    }> = [];
    invokeMock.mockImplementation((command: string, payload: unknown) => {
      if (command === "get_messages") {
        const params = payload as { chatId?: string; chat_id?: string };
        const chatId = params.chatId ?? params.chat_id ?? "";
        const deferred = createDeferred<any>();
        deferreds.push({ chatId, deferred });
        return deferred.promise;
      }
      return Promise.resolve(undefined);
    });

    const store = createChatStore();

    const initialLoad = store.setActiveChat("chat-1", "dm");
    const refreshLoad = store.setActiveChat("chat-1", "dm", undefined, {
      forceRefresh: true,
    });

    expect(deferreds.length).toBe(2);
    expect(get(store.loadingStateByChat).get("chat-1")).toBe(true);

    deferreds[0]?.deferred.resolve([
      { id: "msg-old", content: "old", timestamp: new Date().toISOString() },
    ]);
    await initialLoad;

    expect(get(store.loadingStateByChat).get("chat-1")).toBe(true);
    expect(get(store.messagesByChatId).get("chat-1") ?? []).toEqual([]);

    const newerTimestamp = new Date(Date.now() + 1000).toISOString();
    deferreds[1]?.deferred.resolve([
      { id: "msg-new", content: "new", timestamp: newerTimestamp },
    ]);
    await refreshLoad;

    const finalMessages = get(store.messagesByChatId).get("chat-1") ?? [];
    expect(finalMessages.map((msg) => msg.id)).toEqual(["msg-new"]);
    expect(get(store.loadingStateByChat).get("chat-1")).toBe(false);
  });

  it("removes expired messages and requests backend deletion", async () => {
    vi.useFakeTimers();
    const base = new Date("2025-01-01T00:00:00.000Z");
    vi.setSystemTime(base);
    settings.update((current) => ({
      ...current,
      user: { ...current.user },
      ephemeralMessageDuration: 1,
    }));

    const timestamp = base.toISOString();
    invokeMock.mockResolvedValueOnce([
      {
        id: "msg-expire",
        content: "soon gone",
        timestamp,
      },
    ]);

    const store = createChatStore();
    await store.setActiveChat("chat-expire", "dm");

    const stored = get(store.messagesByChatId).get("chat-expire") ?? [];
    expect(stored).toHaveLength(1);
    const expectedExpiry = new Date(base.getTime() + 60_000).toISOString();
    expect(stored[0]?.expiresAt).toBe(expectedExpiry);

    vi.advanceTimersByTime(60_000);
    await Promise.resolve();
    vi.advanceTimersByTime(5_000);
    await Promise.resolve();

    const remaining = get(store.messagesByChatId).get("chat-expire") ?? [];
    expect(remaining).toHaveLength(0);

    const deleteCall = invokeMock.mock.calls.find(
      ([command]) => command === "delete_message",
    );
    expect(deleteCall?.[1]).toMatchObject({
      chatId: "chat-expire",
      messageId: "msg-expire",
    });
  });

  it("recomputes expiry timestamps when ephemeral duration changes", async () => {
    const baseTimestamp = "2025-01-02T12:00:00.000Z";
    settings.update((current) => ({
      ...current,
      user: { ...current.user },
      ephemeralMessageDuration: 5,
    }));

    invokeMock.mockResolvedValueOnce([
      {
        id: "msg-rolling",
        content: "hello",
        timestamp: baseTimestamp,
      },
    ]);

    const store = createChatStore();
    await store.setActiveChat("chat-rolling", "dm");

    const initial = get(store.messagesByChatId).get("chat-rolling") ?? [];
    expect(initial[0]?.expiresAt).toBe(
      new Date(new Date(baseTimestamp).getTime() + 5 * 60_000).toISOString(),
    );

    settings.update((current) => ({
      ...current,
      user: { ...current.user },
      ephemeralMessageDuration: 10,
    }));
    await Promise.resolve();

    const updated = get(store.messagesByChatId).get("chat-rolling") ?? [];
    expect(updated[0]?.expiresAt).toBe(
      new Date(new Date(baseTimestamp).getTime() + 10 * 60_000).toISOString(),
    );
  });

  it("sends a direct message notification when enabled and chat inactive", async () => {
    const timestamp = new Date().toISOString();
    const friend: Friend = {
      id: "friend-2",
      name: "Charlie",
      avatar: "https://example.com/charlie.png",
      online: true,
      status: "Online",
      timestamp,
      messages: [],
    };
    friendStore.handleFriendsUpdate([friend]);

    const store = createChatStore();
    await store.setActiveChat("friend-1", "dm");

    await store.handleNewMessageEvent({
      sender: "friend-2",
      content: "Hey there!",
      conversation_id: "friend-2",
      timestamp,
    });

    expect(showNativeNotificationMock).toHaveBeenCalledTimes(1);
    expect(showNativeNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Direct message from Charlie",
        body: "Hey there!",
      }),
    );
  });

  it("suppresses direct message notifications when disabled", async () => {
    const timestamp = new Date().toISOString();
    const friend: Friend = {
      id: "friend-2",
      name: "Charlie",
      avatar: "https://example.com/charlie.png",
      online: true,
      status: "Online",
      timestamp,
      messages: [],
    };
    friendStore.handleFriendsUpdate([friend]);
    settings.update((current) => ({
      ...current,
      enableNewMessageNotifications: false,
    }));

    const store = createChatStore();

    await store.handleNewMessageEvent({
      sender: "friend-2",
      content: "Hey there!",
      conversation_id: "friend-2",
      timestamp,
    });

    expect(showNativeNotificationMock).not.toHaveBeenCalled();
  });

  it("respects group notification settings for server messages", async () => {
    const timestamp = new Date().toISOString();
    const server: Server = {
      id: "server-1",
      name: "Beacon",
      owner_id: "owner-1",
      channels: [
        {
          id: "channel-1",
          name: "general",
          server_id: "server-1",
          channel_type: "text",
          private: false,
          category_id: null,
        },
      ],
      categories: [],
      members: [
        {
          id: "friend-3",
          name: "Dana",
          avatar: "https://example.com/dana.png",
          online: true,
        },
      ],
      roles: [],
    };
    serverStore.handleServersUpdate([server]);

    const store = createChatStore();

    await store.handleNewMessageEvent({
      sender: "friend-3",
      content: "Server ping",
      channel_id: "channel-1",
      server_id: "server-1",
      timestamp,
    });

    expect(showNativeNotificationMock).toHaveBeenCalledTimes(1);
    expect(showNativeNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "#general — Beacon",
        body: "Dana: Server ping",
      }),
    );
  });

  it("suppresses group notifications when disabled", async () => {
    const timestamp = new Date().toISOString();
    const server: Server = {
      id: "server-1",
      name: "Beacon",
      owner_id: "owner-1",
      channels: [
        {
          id: "channel-1",
          name: "general",
          server_id: "server-1",
          channel_type: "text",
          private: false,
          category_id: null,
        },
      ],
      categories: [],
      members: [
        {
          id: "friend-3",
          name: "Dana",
          avatar: "https://example.com/dana.png",
          online: true,
        },
      ],
      roles: [],
    };
    serverStore.handleServersUpdate([server]);
    settings.update((current) => ({
      ...current,
      enableGroupMessageNotifications: false,
    }));

    const store = createChatStore();

    await store.handleNewMessageEvent({
      sender: "friend-3",
      content: "Server ping",
      channel_id: "channel-1",
      server_id: "server-1",
      timestamp,
    });

    expect(showNativeNotificationMock).not.toHaveBeenCalled();
  });
});

describe("chatStore message link composition", () => {
  let clipboardWriteMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue([]);
    clipboardWriteMock = vi.fn().mockResolvedValue(undefined);
    localStorage.clear();
    serverStore.handleServersUpdate([]);
    serverStore.setActiveServer(null);
    friendStore.handleFriendsUpdate([]);
    settings.update((current) => ({
      ...current,
    }));
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: clipboardWriteMock,
      },
    } as unknown as Navigator);
    vi.stubGlobal("window", {
      location: {
        origin: "https://app.local",
      },
    } as unknown as Window & typeof globalThis);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    serverStore.handleServersUpdate([]);
    serverStore.setActiveServer(null);
    friendStore.handleFriendsUpdate([]);
  });

  it("copies a direct message link to the clipboard", async () => {
    const store = createChatStore();
    await store.setActiveChat("dm-chat-1", "dm");

    const link = await store.copyMessageLink("msg-123");

    expect(link).toBe("https://app.local/dm/dm-chat-1#message-msg-123");
    expect(clipboardWriteMock).toHaveBeenCalledWith(link);
  });

  it("copies a group chat message link to the clipboard", async () => {
    const store = createChatStore();
    await store.setActiveChat("group-chat-2", "group");

    const link = await store.copyMessageLink("msg-456");

    expect(link).toBe("https://app.local/groups/group-chat-2#message-msg-456");
    expect(clipboardWriteMock).toHaveBeenCalledWith(link);
  });

  it("copies a server channel message link to the clipboard", async () => {
    const store = createChatStore();
    await store.setActiveChat("server-9", "server", "channel-3");

    const link = await store.copyMessageLink("msg-789", "channel-3");

    expect(link).toBe(
      "https://app.local/channels/server-9/channel-3#message-msg-789",
    );
    expect(clipboardWriteMock).toHaveBeenCalledWith(link);
  });
});

describe("chatStore message embeds", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
    localStorage.clear();
    serverStore.handleServersUpdate([]);
    serverStore.setActiveServer(null);
    friendStore.handleFriendsUpdate([]);
    settings.update((current) => ({
      ...current,
      enableLinkPreviews: true,
    }));
  });

  afterEach(() => {
    localStorage.clear();
    serverStore.handleServersUpdate([]);
    serverStore.setActiveServer(null);
    friendStore.handleFriendsUpdate([]);
  });

  it("maps backend embeds onto messages", async () => {
    const timestamp = new Date().toISOString();
    invokeMock.mockImplementation(async (command) => {
      if (command === "get_messages") {
        return [
          {
            id: "msg-embed",
            content: "Check this article",
            timestamp,
            embeds: [
              {
                id: "embed-1",
                url: "https://example.com/article",
                title: "Example Article",
                description: "A sample description",
                site_name: "Example",
                provider_icon_url: "https://example.com/icon.png",
                thumbnail_url: "https://example.com/thumb.jpg",
                color: 0x336699,
              },
            ],
          },
        ];
      }
      return undefined;
    });

    const store = createChatStore();
    await store.setActiveChat("chat-embed", "dm");

    const message = get(store.messagesByChatId).get("chat-embed")?.[0];
    expect(message?.embeds?.length).toBe(1);
    const [embed] = message?.embeds ?? [];
    expect(embed?.url).toBe("https://example.com/article");
    expect(embed?.title).toBe("Example Article");
    expect(embed?.thumbnailUrl).toBe("https://example.com/thumb.jpg");
    expect(embed?.provider?.iconUrl).toBe("https://example.com/icon.png");
    expect(embed?.accentColor).toBe("#336699");
  });

  it("unfurls link embeds when backend payload is missing", async () => {
    const timestamp = new Date().toISOString();
    invokeMock.mockImplementation(async (command, payload) => {
      if (command === "get_messages") {
        return [
          {
            id: "msg-embed",
            content: "https://example.com/resource",
            timestamp,
            embeds: [],
          },
        ];
      }
      if (command === "resolve_link_preview") {
        const targetUrl =
          (payload as { url?: string } | undefined)?.url ??
          "https://example.com/resource";
        return {
          url: targetUrl,
          title: "Example Resource",
          description: "Metadata description",
          imageUrl: "https://example.com/image.png",
          siteName: "Example",
          iconUrl: "https://example.com/icon.png",
        };
      }
      return undefined;
    });

    const store = createChatStore();
    await store.setActiveChat("chat-embed", "dm");

    const message = get(store.messagesByChatId).get("chat-embed")?.[0];
    expect(message?.embeds?.length).toBe(1);
    const [embed] = message?.embeds ?? [];
    expect(embed?.url).toBe("https://example.com/resource");
    expect(embed?.title).toBe("Example Resource");
    expect(embed?.thumbnailUrl).toBe("https://example.com/image.png");
    expect(embed?.provider?.name).toBe("Example");
    expect(embed?.provider?.iconUrl).toBe("https://example.com/icon.png");
  });
});

describe("chatStore slowmode enforcement", () => {
  const buildServer = ({
    serverId = "server-slowmode",
    channelId = "channel-general",
    ownerId = "owner-1",
    rateLimit = 5,
  }: {
    serverId?: string;
    channelId?: string;
    ownerId?: string;
    rateLimit?: number;
  } = {}): Server => {
    const members = [
      {
        id: "user-1",
        name: "Test User",
        avatar: "https://example.com/me.png",
        online: true,
      },
    ];

    if (ownerId !== "user-1") {
      members.push({
        id: ownerId,
        name: "Owner",
        avatar: "https://example.com/owner.png",
        online: true,
      });
    }

    return {
      id: serverId,
      name: "Slowmode Test",
      owner_id: ownerId,
      channels: [
        {
          id: channelId,
          name: "general",
          server_id: serverId,
          channel_type: "text",
          private: false,
          position: 0,
          rate_limit_per_user: rateLimit,
        },
      ],
      categories: [],
      members,
      roles: [],
    };
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
    serverStore.handleServersUpdate([]);
    serverStore.setActiveServer(null);
  });

  it("blocks repeated sends until the cooldown expires", async () => {
    const store = createChatStore();
    const server = buildServer({ ownerId: "owner-2", rateLimit: 5 });
    serverStore.handleServersUpdate([server]);

    await store.setActiveChat(server.id, "server", server.channels[0].id);

    await store.sendMessage("hello world");
    const firstTracker = get(store.slowmodeByChannelId).get(
      server.channels[0].id,
    );
    expect(firstTracker?.cooldownSeconds).toBe(5);
    expect(firstTracker?.availableAt).toBeGreaterThan(Date.now());

    await expect(store.sendMessage("too soon")).rejects.toBeInstanceOf(
      SlowmodeError,
    );

    const secondTracker = get(store.slowmodeByChannelId).get(
      server.channels[0].id,
    );
    expect(secondTracker).toEqual(firstTracker);
  });

  it("allows sending again after the cooldown window", async () => {
    const store = createChatStore();
    const server = buildServer({ ownerId: "owner-3", rateLimit: 3 });
    serverStore.handleServersUpdate([server]);

    await store.setActiveChat(server.id, "server", server.channels[0].id);

    await store.sendMessage("initial");
    vi.advanceTimersByTime(3_000);

    await expect(store.sendMessage("after wait")).resolves.toBeUndefined();

    const tracker = get(store.slowmodeByChannelId).get(server.channels[0].id);
    expect(tracker?.cooldownSeconds).toBe(3);
    expect(tracker?.availableAt).toBeGreaterThan(Date.now());
  });

  it("lets privileged members bypass slowmode", async () => {
    const store = createChatStore();
    const server = buildServer({ ownerId: "user-1", rateLimit: 8 });
    serverStore.handleServersUpdate([server]);

    await store.setActiveChat(server.id, "server", server.channels[0].id);

    await expect(store.sendMessage("first")).resolves.toBeUndefined();
    await expect(store.sendMessage("second")).resolves.toBeUndefined();

    const tracker = get(store.slowmodeByChannelId).get(server.channels[0].id);
    expect(tracker).toBeUndefined();
  });
});
