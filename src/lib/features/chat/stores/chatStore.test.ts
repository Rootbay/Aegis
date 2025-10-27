import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";
import { get } from "svelte/store";
import { createChatStore } from "./chatStore";
import { serverStore } from "$lib/features/servers/stores/serverStore";
import { friendStore } from "$lib/features/friends/stores/friendStore";
import { settings } from "$lib/features/settings/stores/settings";
import type { Friend } from "$lib/features/friends/models/Friend";
import type { Server } from "$lib/features/servers/models/Server";

const invokeMock = vi.fn();
const showNativeNotificationMock = vi.fn(() => Promise.resolve());

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
  let focusSpy: ReturnType<typeof vi.spyOn> | undefined;

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
    focusSpy = vi.spyOn(document, "hasFocus").mockReturnValue(true);
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
        },
      ],
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
        },
      ],
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
