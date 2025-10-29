import { render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";

import Passthrough from "../mocks/Passthrough.svelte";
import MessageAuthorNameStub from "../mocks/MessageAuthorNameStub.svelte";
import VirtualListStub from "../mocks/VirtualListStub.svelte";

vi.mock("$app/environment", () => ({
  browser: false,
}));

if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  // @ts-expect-error polyfill for test environment
  globalThis.ResizeObserver = ResizeObserverMock;
}

function createWritable<T>(initialValue: T) {
  let value = initialValue;
  const subscribers = new Set<(next: T) => void>();

  return {
    subscribe(run: (next: T) => void) {
      run(value);
      subscribers.add(run);
      return () => subscribers.delete(run);
    },
    set(next: T) {
      value = next;
      subscribers.forEach((run) => run(value));
    },
    update(updater: (current: T) => T) {
      value = updater(value);
      subscribers.forEach((run) => run(value));
    },
  };
}

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-store", () => {
  class Store {
    static async load() {
      return new Store();
    }

    async get() {
      return null;
    }

    async set() {}

    async save() {}
  }

  return { Store };
});


vi.mock("@lucide/svelte", () => ({
  Link: Passthrough,
  Mic: Passthrough,
  SendHorizontal: Passthrough,
  Square: Passthrough,
  Users: Passthrough,
}));

vi.mock("@humanspeak/svelte-virtual-list", () => ({
  default: VirtualListStub,
}));

vi.mock("$lib/services/tauri", () => ({
  getInvoke: async () => null,
  getListen: async () => null,
}));

vi.mock("$lib/components/media/ImageLightbox.svelte", () => ({
  default: Passthrough,
}));

vi.mock("$lib/components/media/FilePreview.svelte", () => ({
  default: Passthrough,
}));

vi.mock(
  "$lib/features/chat/components/FileTransferApprovals.svelte",
  () => ({
    default: Passthrough,
  }),
);

vi.mock(
  "$lib/features/chat/components/FileTransferHistory.svelte",
  () => ({
    default: Passthrough,
  }),
);

vi.mock(
  "$lib/features/calls/components/CallStatusBanner.svelte",
  () => ({
    default: Passthrough,
  }),
);

vi.mock("$lib/components/context-menus/BaseContextMenu.svelte", () => ({
  default: Passthrough,
}));

vi.mock("$lib/features/chat/components/MessageAuthorName.svelte", () => ({
  default: MessageAuthorNameStub,
}));

function getChatStoreModule() {
  if (!globalThis.__chatStoreModule) {
    const messagesByChatId = createWritable(new Map());
    const hasMoreByChatId = createWritable(new Map());
    const loadingStateByChat = createWritable(new Map());

    globalThis.__chatStoreModule = {
      chatStore: {
        markActiveChatViewed: () => {},
        sendTypingIndicator: () => Promise.resolve(),
        loadMoreMessages: () => Promise.resolve(),
        sendMessageWithAttachments: () => Promise.resolve(),
        sendMessage: () => Promise.resolve(),
        overrideSpamDecision: () => {},
        deleteMessage: () => {},
        editMessage: () => Promise.resolve(),
        addReaction: () => {},
        removeReaction: () => {},
        pinMessage: () => Promise.resolve(),
        unpinMessage: () => Promise.resolve(),
      },
      messagesByChatId,
      hasMoreByChatId,
      loadingStateByChat,
    };
  }
  return globalThis.__chatStoreModule;
}

vi.mock("$lib/features/chat/stores/chatStore", () => getChatStoreModule());
vi.mock("../../src/lib/features/chat/stores/chatStore", () => getChatStoreModule());

function getChatSearchModule() {
  if (!globalThis.__chatSearchModule) {
    const state = createWritable({
      query: "",
      matches: [] as number[],
      activeMatchIndex: 0,
    });

    globalThis.__chatSearchModule = {
      chatSearchStore: {
        subscribe: state.subscribe,
        setQuery: (query: string) => {
          state.update((current) => ({ ...current, query }));
        },
        setMatches: (matches: number[]) => {
          state.update((current) => ({ ...current, matches }));
        },
        setActiveMatchIndex: (index: number) => {
          state.update((current) => ({ ...current, activeMatchIndex: index }));
        },
        registerHandlers: () => () => {},
        reset: () => {
          state.set({ query: "", matches: [], activeMatchIndex: 0 });
        },
      },
    };
  }
  return globalThis.__chatSearchModule;
}

vi.mock("$lib/features/chat/stores/chatSearchStore", () => getChatSearchModule());
vi.mock("../../src/lib/features/chat/stores/chatSearchStore", () => getChatSearchModule());

function getUserStoreModule() {
  if (!globalThis.__userStoreModule) {
    const state = createWritable({
      me: {
        id: "user-current",
        name: "Current User",
        avatar: "https://example.com/me.png",
        online: true,
      },
      loading: false,
    });

    globalThis.__userStoreModule = {
      userStore: {
        subscribe: state.subscribe,
      },
      __setUser: (user: {
        id: string;
        name: string;
        avatar: string;
        online: boolean;
      }) => {
        state.set({ me: user, loading: false });
      },
    };
  }
  return globalThis.__userStoreModule;
}

vi.mock("$lib/stores/userStore", () => getUserStoreModule());
vi.mock("../../src/lib/stores/userStore", () => getUserStoreModule());

function getMutedFriendsModule() {
  if (!globalThis.__mutedFriendsModule) {
    const muted = new Set<string>();

    globalThis.__mutedFriendsModule = {
      mutedFriendsStore: {
        isMuted: (id: string) => muted.has(id),
        mute: (id: string) => {
          muted.add(id);
        },
        unmute: (id: string) => {
          muted.delete(id);
        },
      },
      __resetMutedFriends: () => muted.clear(),
    };
  }
  return globalThis.__mutedFriendsModule;
}

vi.mock("$lib/features/friends/stores/mutedFriendsStore", () => getMutedFriendsModule());
vi.mock("../../src/lib/features/friends/stores/mutedFriendsStore", () => getMutedFriendsModule());

function getFriendStoreModule() {
  if (!globalThis.__friendStoreModule) {
    globalThis.__friendStoreModule = {
      friendStore: {
        removeFriend: () => {},
        initialize: () => Promise.resolve(),
      },
    };
  }
  return globalThis.__friendStoreModule;
}

vi.mock("$lib/features/friends/stores/friendStore", () => getFriendStoreModule());
vi.mock("../../src/lib/features/friends/stores/friendStore", () => getFriendStoreModule());

function getCallStoreModule() {
  if (!globalThis.__callStoreModule) {
    const state = createWritable({ activeCall: null as unknown });

    globalThis.__callStoreModule = {
      callStore: {
        subscribe: state.subscribe,
        dismissCall: () => {},
        endCall: () => {},
        setCallModalOpen: () => {},
      },
    };
  }
  return globalThis.__callStoreModule;
}

vi.mock("$lib/features/calls/stores/callStore", () => getCallStoreModule());
vi.mock("../../src/lib/features/calls/stores/callStore", () => getCallStoreModule());

function getServerStoreModule() {
  if (!globalThis.__serverStoreModule) {
    const state = createWritable({ servers: [] as unknown[] });

    globalThis.__serverStoreModule = {
      serverStore: {
        subscribe: state.subscribe,
      },
    };
  }
  return globalThis.__serverStoreModule;
}

vi.mock("$lib/features/servers/stores/serverStore", () => getServerStoreModule());
vi.mock("../../src/lib/features/servers/stores/serverStore", () => getServerStoreModule());

function getToastModule() {
  if (!globalThis.__toastModule) {
    globalThis.__toastModule = {
      toasts: {
        addToast: () => {},
        showErrorToast: () => {},
      },
    };
  }
  return globalThis.__toastModule;
}

vi.mock("$lib/stores/ToastStore", () => getToastModule());
vi.mock("../../src/lib/stores/ToastStore", () => getToastModule());

function getContextMenuModule() {
  if (!globalThis.__contextMenuModule) {
    globalThis.__contextMenuModule = {
      buildGroupModalOptions: () => ({}),
      buildReportUserPayload: () => ({}),
    };
  }
  return globalThis.__contextMenuModule;
}

vi.mock("$lib/features/chat/utils/contextMenu", () => getContextMenuModule());
vi.mock("../../src/lib/features/chat/utils/contextMenu", () => getContextMenuModule());

function getCollabModule() {
  if (!globalThis.__collabModule) {
    globalThis.__collabModule = {
      generateCollaborationDocumentId: (prefix = "collab") => `${prefix}-mock`,
    };
  }
  return globalThis.__collabModule;
}

vi.mock("$lib/features/collaboration/collabDocumentStore", () => getCollabModule());
vi.mock("../../src/lib/features/collaboration/collabDocumentStore", () => getCollabModule());

import type { Chat } from "$lib/features/chat/models/Chat";
import type { Friend } from "$lib/features/friends/models/Friend";
import type { Message } from "$lib/features/chat/models/Message";

import ChatView from "$lib/features/chat/components/ChatView.svelte";
import {
  defaultSettings,
  settings,
  setMessageDensity,
  setShowMessageAvatars,
  setShowMessageTimestamps,
} from "$lib/features/settings/stores/settings";
import {
  messagesByChatId,
  hasMoreByChatId,
  loadingStateByChat,
} from "$lib/features/chat/stores/chatStore";
import { chatSearchStore } from "$lib/features/chat/stores/chatSearchStore";
import { __setUser } from "$lib/stores/userStore";
import { __resetMutedFriends } from "$lib/features/friends/stores/mutedFriendsStore";

function getMessageContainer(messageText: string) {
  const messageNodes = screen.getAllByText(messageText);
  const visibleNode = messageNodes.find(
    (node) => !node.closest("[style*='visibility: hidden']"),
  );

  expect(visibleNode).toBeDefined();

  const container = visibleNode?.closest<HTMLElement>("[id^='message-']");
  expect(container).not.toBeNull();
  return container as HTMLElement;
}

function resetChatViewState() {
  const baseline = structuredClone(defaultSettings);
  baseline.showMessageAvatars = true;
  baseline.showMessageTimestamps = true;
  settings.set(baseline);

  messagesByChatId.set(new Map());
  hasMoreByChatId.set(new Map());
  loadingStateByChat.set(new Map());
  chatSearchStore.reset();
  __setUser({
    id: "user-current",
    name: "Current User",
    avatar: "https://example.com/me.png",
    online: true,
  });
  __resetMutedFriends();
}

describe("ChatView privacy preferences", () => {
  beforeEach(() => {
    resetChatViewState();
  });

  it("hides avatars and timestamps when settings are disabled", async () => {
    const chatId = "chat-privacy";
    const friend: Friend = {
      id: "friend-1",
      name: "Alice Example",
      avatar: "https://example.com/alice.png",
      online: true,
      status: "Online",
      timestamp: new Date().toISOString(),
      messages: [],
    };

    const message: Message = {
      id: "msg-1",
      chatId,
      senderId: friend.id,
      content: "Hello from Alice",
      timestamp: "2024-01-01T00:00:00.000Z",
      read: true,
    };

    messagesByChatId.set(new Map([[chatId, [message]]]));

    const chat: Chat = {
      type: "dm",
      id: chatId,
      friend,
      messages: [message],
    };

    render(ChatView, { props: { chat } });

    await screen.findByText(message.content);
    await waitFor(() => {
      const container = getMessageContainer(message.content);
      expect(
        container.querySelector<HTMLImageElement>(
          "img[alt='Alice Example']",
        ),
      ).not.toBeNull();
    });

    await waitFor(() => {
      const container = getMessageContainer(message.content);
      const timestamp = container.querySelector(
        "p.text-xs.text-muted-foreground",
      );
      expect(timestamp).not.toBeNull();
    });

    let showAvatarsValue = true;
    const settingsUnsubscribe = settings.subscribe((value) => {
      showAvatarsValue = value.showMessageAvatars;
    });

    setShowMessageAvatars(false);
    await tick();

    await waitFor(() => {
      expect(showAvatarsValue).toBe(false);
    });

    messagesByChatId.set(new Map([[chatId, [{ ...message }]]]));
    await tick();

    await waitFor(() => {
      const container = getMessageContainer(message.content);
      expect(
        container.querySelector<HTMLImageElement>(
          "img[alt='Alice Example']",
        ),
      ).toBeNull();
    });

    setShowMessageTimestamps(false);
    await tick();

    messagesByChatId.set(new Map([[chatId, [{ ...message }]]]));
    await tick();

    await waitFor(() => {
      const refreshedContainer = getMessageContainer(message.content);
      const timestamp = refreshedContainer.querySelector(
        "p.text-xs.text-muted-foreground",
      );
      expect(timestamp).toBeNull();
    });

    expect(screen.queryByText(message.content)).not.toBeNull();

    settingsUnsubscribe();
  });
});

describe("ChatView message density", () => {
  beforeEach(() => {
    resetChatViewState();
  });

  it("applies compact spacing classes when density is compact", async () => {
    const chatId = "chat-density";
    const friend: Friend = {
      id: "friend-density",
      name: "Density Friend",
      avatar: "https://example.com/density.png",
      online: true,
      status: "Online",
      timestamp: new Date().toISOString(),
      messages: [],
    };

    const message: Message = {
      id: "msg-density",
      chatId,
      senderId: friend.id,
      content: "Testing compact spacing",
      timestamp: new Date().toISOString(),
      read: true,
    };

    messagesByChatId.set(new Map([[chatId, [message]]]));

    const chat: Chat = {
      type: "dm",
      id: chatId,
      friend,
      messages: [message],
    };

    render(ChatView, { props: { chat } });

    await screen.findByText(message.content);

    await waitFor(() => {
      const initialContainer = getMessageContainer(message.content);
      expect(initialContainer.classList.contains("space-y-6")).toBe(true);
    });

    setMessageDensity("compact");
    await tick();

    messagesByChatId.set(new Map([[chatId, [{ ...message }]]]));
    await tick();

    await waitFor(() => {
      const compactContainer = getMessageContainer(message.content);
      expect(compactContainer.classList.contains("space-y-3")).toBe(true);
      expect(compactContainer.classList.contains("space-y-6")).toBe(false);
    });
  });
});
