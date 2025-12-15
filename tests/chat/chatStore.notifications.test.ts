import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get, writable, type Writable } from "svelte/store";
import type { ChatMessage } from "../../src/lib/features/chat/models/AepMessage";
import { createMockConnectivityStore } from "./connectivityStore.mock";

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

vi.mock("$lib/stores/persistentStore", () => ({
  persistentStore: <T>(_key: string, initialValue: T) => writable(initialValue),
}));

vi.mock("$lib/features/friends/stores/mutedFriendsStore", () => ({
  mutedFriendsStore: {
    isMuted: vi.fn().mockReturnValue(false),
    mute: vi.fn(),
    unmute: vi.fn(),
  },
}));

const spamClassifierMock = vi.hoisted(() => ({
  scoreText: vi.fn(async () => ({
    score: 0.1,
    label: "ham",
    flagged: false,
    autoMuted: false,
    reasons: [],
    context: "message",
  })),
  clearCache: vi.fn(),
  loadModel: vi.fn(),
  isFlagged: vi.fn(),
  shouldAutoMute: vi.fn(),
}));

vi.mock("$lib/features/security/spamClassifier", () => ({
  spamClassifier: spamClassifierMock,
}));

function ensureFriendStoreState() {
  const key = Symbol.for("chatStoreTestFriendState");
  const globalAny = globalThis as Record<symbol, ReturnType<typeof writable<{ friends: unknown[] }>> | undefined>;
  if (!globalAny[key]) {
    globalAny[key] = writable({ friends: [] });
  }
  return globalAny[key]!;
}

vi.mock("$lib/features/friends/stores/friendStore", () => ({
  friendStore: {
    subscribe: ensureFriendStoreState().subscribe,
  },
}));

vi.mock("$lib/stores/userStore", () => {
  const state = writable({ me: { id: "user-123", name: "Test User" } });
  return {
    userStore: {
      subscribe: state.subscribe,
    },
  };
});

type ServerState = {
  activeServerId: string | null;
  servers: unknown[];
};

function ensureServerStoreStateRef() {
  const key = Symbol.for("chatStoreTestServerState");
  const globalAny = globalThis as Record<
    symbol,
    | {
        state: ReturnType<typeof writable<ServerState>>;
        set: (next: ServerState) => void;
        reset: () => void;
      }
    | undefined
  >;
  if (!globalAny[key]) {
    const state = writable<ServerState>({
      activeServerId: null,
      servers: [],
    });
    globalAny[key] = {
      state,
      set(next: ServerState) {
        state.set(next);
      },
      reset() {
        state.set({ activeServerId: null, servers: [] });
      },
    };
  }
  return globalAny[key]!;
}

vi.mock("$lib/features/servers/stores/serverStore", () => ({
  serverStore: {
    subscribe: ensureServerStoreStateRef().state.subscribe,
    __setState: (next: unknown) => ensureServerStoreStateRef().set(next as ServerState),
  },
  activeServerEmojiCategories: {
    subscribe: (run: (value: unknown) => void) => {
      run([]);
      return () => {};
    },
  },
}));

function ensureConnectivityMocks() {
  const key = Symbol.for("chatStoreTestConnectivityMocks");
  const globalAny = globalThis as Record<symbol, ReturnType<typeof createMockConnectivityStore> | undefined>;
  if (!globalAny[key]) {
    globalAny[key] = createMockConnectivityStore();
  }
  return globalAny[key]!;
}

vi.mock("$lib/stores/connectivityStore", () => ({
  connectivityStore: ensureConnectivityMocks().store,
}));
vi.mock("../../src/lib/stores/connectivityStore", () => ({
  connectivityStore: ensureConnectivityMocks().store,
}));

type TestSettings = {
  enableReadReceipts: boolean;
  enableTypingIndicators: boolean;
  enableNewMessageNotifications: boolean;
  enableGroupMessageNotifications: boolean;
  notificationSound: string;
  ephemeralMessageDuration: number;
  enableWalkieTalkieVoiceMemos: boolean;
};

function getDefaultSettings(): TestSettings {
  const key = Symbol.for("chatStoreTestDefaultSettings");
  const globalAny = globalThis as Record<symbol, TestSettings | undefined>;
  if (!globalAny[key]) {
    globalAny[key] = {
      enableReadReceipts: false,
      enableTypingIndicators: false,
      enableNewMessageNotifications: true,
      enableGroupMessageNotifications: true,
      notificationSound: "Default",
      ephemeralMessageDuration: 60,
      enableWalkieTalkieVoiceMemos: true,
    };
  }
  return { ...globalAny[key]! };
}

function ensureSettingsStore() {
  const key = Symbol.for("chatStoreTestSettingsStore");
  const globalAny = globalThis as Record<symbol, Writable<TestSettings> | undefined>;
  if (!globalAny[key]) {
    globalAny[key] = writable(getDefaultSettings());
  }
  return globalAny[key]!;
}

const resetSettingsStore = () => {
  ensureSettingsStore().set(getDefaultSettings());
};

vi.mock("$lib/features/settings/stores/settings", () => ({
  settings: {
    subscribe: ensureSettingsStore().subscribe,
    set: ensureSettingsStore().set,
    update: ensureSettingsStore().update,
  },
}));

const { showNativeNotificationMock } = vi.hoisted(() => ({
  showNativeNotificationMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("$lib/utils/nativeNotification", () => ({
  showNativeNotification: showNativeNotificationMock,
}));

const encryptionMocks = vi.hoisted(() => ({
  decode: vi.fn(async ({
    content,
    attachments,
  }: {
    content: string;
    attachments?: unknown[] | null;
  }) => ({
    content,
    attachments: attachments ?? undefined,
    wasEncrypted: false,
  })),
  encode: vi.fn(),
}));

vi.mock("$lib/features/chat/services/chatEncryptionService", () => ({
  decodeIncomingMessagePayload: encryptionMocks.decode,
  encryptOutgoingMessagePayload: encryptionMocks.encode,
}));

const mutedChannelsModule = vi.hoisted(() => {
  type Subscriber = (value: Set<string>) => void;
  let state = new Set<string>();
  const subscribers: Subscriber[] = [];

  const emit = () => {
    const snapshot = new Set(state);
    for (const subscriber of subscribers) {
      subscriber(snapshot);
    }
  };

  return {
    store: {
      subscribe(run: Subscriber) {
        run(new Set(state));
        subscribers.push(run);
        return () => {
          const index = subscribers.indexOf(run);
          if (index !== -1) {
            subscribers.splice(index, 1);
          }
        };
      },
      mute(channelId: string) {
        if (!channelId) return;
        state = new Set(state);
        state.add(channelId);
        emit();
      },
      unmute(channelId: string) {
        if (!channelId) return;
        if (!state.has(channelId)) return;
        state = new Set(state);
        state.delete(channelId);
        emit();
      },
      toggle(channelId: string) {
        if (!channelId) return;
        state = new Set(state);
        if (state.has(channelId)) {
          state.delete(channelId);
        } else {
          state.add(channelId);
        }
        emit();
      },
      isMuted(channelId: string) {
        if (!channelId) return false;
        return state.has(channelId);
      },
      setMuted(channelIds: Iterable<string>) {
        state = new Set(channelIds);
        emit();
      },
      clear() {
        if (state.size === 0) return;
        state = new Set();
        emit();
      },
    },
    setMuted(channelIds: Iterable<string>) {
      state = new Set(channelIds);
      emit();
    },
    reset() {
      state = new Set();
      emit();
    },
    getState: () => new Set(state),
  };
});

vi.mock("$lib/features/channels/stores/mutedChannelsStore", () => ({
  mutedChannelsStore: mutedChannelsModule.store,
}));

vi.mock("$lib/features/calls/stores/callStore", () => ({
  callStore: {
    subscribe: () => () => {},
    startCall: vi.fn(),
    setCallModalOpen: vi.fn(),
    initialize: vi.fn(),
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { createChatStore } from "../../src/lib/features/chat/stores/chatStore";

describe("chatStore muted channel behavior", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorageMock());
    showNativeNotificationMock.mockClear();
    showNativeNotificationMock.mockResolvedValue(undefined);
    spamClassifierMock.scoreText.mockClear();
    resetSettingsStore();
    ensureServerStoreStateRef().reset();
    mutedChannelsModule.reset();
    ensureConnectivityMocks().reset();
    ensureFriendStoreState().set({ friends: [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps muted channels read after reload", async () => {
    mutedChannelsModule.setMuted(["channel-1"]);

    const chatStore = createChatStore();

    ensureServerStoreStateRef().set({
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
          invites: [],
        },
      ],
    });

    const message: ChatMessage = {
      id: "msg-1",
      sender: "user-456",
      content: "Hello",
      channel_id: "channel-1",
      server_id: "server-1",
      timestamp: new Date().toISOString(),
    };

    await chatStore.handleNewMessageEvent(message);

    const metadata = get(chatStore.metadataByChatId).get("channel-1");
    expect(metadata?.unreadCount).toBe(0);

    const serverUnread = get(chatStore.serverUnreadCountByServerId).get(
      "server-1",
    );
    expect(serverUnread).toBe(0);
  });

  it("suppresses notifications for muted channels", async () => {
    mutedChannelsModule.setMuted(["channel-1"]);

    const chatStore = createChatStore();

    ensureServerStoreStateRef().set({
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
          invites: [],
        },
      ],
    });

    const message: ChatMessage = {
      id: "msg-2",
      sender: "user-456",
      content: "Ping",
      channel_id: "channel-1",
      server_id: "server-1",
      timestamp: new Date().toISOString(),
    };

    await chatStore.handleNewMessageEvent(message);

    expect(showNativeNotificationMock).not.toHaveBeenCalled();

    const metadata = get(chatStore.metadataByChatId).get("channel-1");
    expect(metadata?.unreadCount).toBe(0);
  });
});
