import { writable, get } from "svelte/store";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/svelte";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import Passthrough from "../mocks/Passthrough.svelte";
import VirtualListStub from "../mocks/VirtualListStub.svelte";
import MessageAuthorNameStub from "../mocks/MessageAuthorNameStub.svelte";
import type { Message } from "../../src/lib/features/chat/models/Message";
import type { Chat } from "../../src/lib/features/chat/models/Chat";
import type { Friend } from "../../src/lib/features/friends/models/Friend";
import type { User } from "../../src/lib/features/auth/models/User";

const messagesStore = writable(new Map<string, Message[]>());
const hasMoreStore = writable(new Map<string, boolean>());
const loadingStateStore = writable(new Map<string, boolean>());

vi.mock("@lucide/svelte", () => {
  const component = Passthrough;
  return {
    CircleAlert: component,
    Link: component,
    LoaderCircle: component,
    Mic: component,
    RadioTower: component,
    SendHorizontal: component,
    Smile: component,
    Square: component,
    Timer: component,
    Users: component,
    Wifi: component,
    ArrowDown: component,
    ArrowUp: component,
    Search: component,
    X: component,
  };
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => undefined),
}));

vi.mock("@humanspeak/svelte-virtual-list", () => ({
  default: VirtualListStub,
}));

vi.mock("$lib/components/media/ImageLightbox.svelte", () => ({
  default: Passthrough,
}));

vi.mock("$lib/components/media/FilePreview.svelte", () => ({
  default: Passthrough,
}));

vi.mock("$lib/features/chat/components/FileTransferApprovals.svelte", () => ({
  default: Passthrough,
}));

vi.mock("$lib/features/chat/components/FileTransferHistory.svelte", () => ({
  default: Passthrough,
}));

vi.mock("$lib/features/calls/components/CallStatusBanner.svelte", () => ({
  default: Passthrough,
}));

vi.mock("$lib/components/emoji/EmojiPicker.svelte", () => ({
  default: Passthrough,
}));

vi.mock("$lib/components/context-menus/BaseContextMenu.svelte", () => ({
  default: Passthrough,
}));

vi.mock("$lib/features/chat/components/MessageAuthorName.svelte", () => ({
  default: MessageAuthorNameStub,
}));

vi.mock("$lib/features/chat/components/LinkPreview.svelte", () => ({
  default: Passthrough,
}));

vi.mock("$lib/features/chat/utils/attachments", () => ({
  mergeAttachments: <T>(incoming: T) => incoming,
}));

vi.mock("$lib/stores/ToastStore", () => ({
  toasts: {
    addToast: vi.fn(),
    showErrorToast: vi.fn(),
  },
}));

vi.mock("$lib/features/collaboration/collabDocumentStore", () => ({
  generateCollaborationDocumentId: (prefix?: string) =>
    `${prefix ?? "doc"}-${Math.random().toString(36).slice(2, 8)}`,
}));

vi.mock("$lib/features/calls/stores/callStore", () => {
  const state = writable({ activeCall: null as unknown });
  return {
    callStore: {
      subscribe: state.subscribe,
      dismissCall: vi.fn(),
      endCall: vi.fn(),
      setCallModalOpen: vi.fn(),
      startCall: vi.fn(),
      initialize: vi.fn(),
    },
  };
});

vi.mock("$lib/features/friends/stores/friendStore", () => ({
  friendStore: {
    subscribe: writable({}).subscribe,
    removeFriend: vi.fn(),
    initialize: vi.fn(async () => {}),
  },
}));

vi.mock("$lib/features/friends/stores/mutedFriendsStore", () => ({
  mutedFriendsStore: {
    isMuted: vi.fn(() => false),
    mute: vi.fn(),
    unmute: vi.fn(),
  },
}));

vi.mock("$lib/features/servers/stores/serverStore", () => ({
  serverStore: {
    subscribe: writable({ activeServerId: null, servers: [] }).subscribe,
  },
  activeServerEmojiCategories: {
    subscribe: (run: (value: unknown) => void) => {
      run([]);
      return () => {};
    },
  },
}));

vi.mock("$lib/features/settings/stores/settings", () => ({
  settings: writable({
    showMessageAvatars: true,
    showMessageTimestamps: true,
    enableWalkieTalkieVoiceMemos: true,
    messageDensity: "comfortable",
    enableLinkPreviews: true,
  }),
}));

vi.mock("$lib/stores/userStore", () => {
  const store = writable<{ me: User | null }>({
    me: {
      id: "user-1",
      name: "Tester",
      tag: "0001",
      avatar: "",
      online: true,
    },
  });
  return {
    userStore: {
      subscribe: store.subscribe,
    },
  };
});

vi.mock("$lib/stores/connectivityStore", () => {
  const store = writable({ status: "online" });
  return {
    connectivityStore: {
      subscribe: store.subscribe,
    },
  };
});

vi.mock("$lib/features/chat/utils/linkPreviews", () => ({
  extractFirstLink: () => null,
}));

vi.mock("$lib/features/chat/utils/contextMenu", () => ({
  buildGroupModalOptions: () => ({}),
  buildReportUserPayload: () => ({}),
}));

vi.mock("$lib/features/chat/utils/chatDraftStore", () => ({
  clearChatDraft: vi.fn(async () => {}),
  loadChatDraft: vi.fn(async () => null),
  saveChatDraft: vi.fn(async () => {}),
}));

const mentionSuggestionsState = writable({
  active: false,
  suggestions: [] as Array<{ id: string; label: string }>,
  activeIndex: 0,
});

vi.mock("$lib/features/chat/stores/mentionSuggestions", () => ({
  createMentionSuggestionsStore: () => ({
    subscribe: mentionSuggestionsState.subscribe,
    close: () => mentionSuggestionsState.set({ active: false, suggestions: [], activeIndex: 0 }),
    updateInput: vi.fn(),
    select: vi.fn(() => null),
    moveSelection: vi.fn(),
    open: vi.fn(() => mentionSuggestionsState.set({ active: true, suggestions: [], activeIndex: 0 })),
  }),
}));

const basePages = () => {
  const makeMessage = (index: number): Message => {
    const timestamp = new Date(2024, 0, index).toISOString();
    return {
      id: `msg-${index}`,
      chatId: "chat-1",
      senderId: "friend-1",
      content: `Page ${index} result`,
      timestamp,
      timestampMs: Date.parse(timestamp),
      read: true,
    } as Message;
  };
  return [
    { cursor: null as string | null, messages: [makeMessage(1)], nextCursor: "cursor-1", hasMore: true },
    { cursor: "cursor-1", messages: [makeMessage(2)], nextCursor: "cursor-2", hasMore: true },
    { cursor: "cursor-2", messages: [makeMessage(3)], nextCursor: "cursor-3", hasMore: true },
    { cursor: "cursor-3", messages: [makeMessage(4)], nextCursor: null, hasMore: false },
  ];
};

let pageMap = new Map<string | null, ReturnType<typeof basePages>[number]>();

const resetPages = () => {
  pageMap = new Map(basePages().map((page) => [page.cursor, page]));
};

const searchMessagesMock = vi.fn(async ({
  chatId,
  cursor,
}: {
  chatId: string;
  cursor?: string | null;
}) => {
  const key = cursor ?? null;
  const page = pageMap.get(key);
  if (!page) {
    throw new Error(`Unexpected cursor: ${key}`);
  }

  messagesStore.update((current) => {
    const next = new Map(current);
    const existing = next.get(chatId) ?? [];
    const existingIds = new Set(existing.map((msg) => msg.id));
    const merged = [...existing];
    page.messages.forEach((message) => {
      if (!existingIds.has(message.id)) {
        merged.push(message);
      }
    });
    next.set(chatId, merged);
    return next;
  });

  return {
    received: page.messages.length,
    hasMore: page.hasMore,
    nextCursor: page.nextCursor,
  };
});

vi.mock("$lib/features/chat/stores/chatStore", () => ({
  chatStore: {
    markActiveChatViewed: vi.fn(),
    sendTypingIndicator: vi.fn(async () => {}),
    loadMoreMessages: vi.fn(async () => {}),
    sendMessageWithAttachments: vi.fn(async () => {}),
    sendMessage: vi.fn(async () => {}),
    overrideSpamDecision: vi.fn(),
    deleteMessage: vi.fn(),
    editMessage: vi.fn(async () => {}),
    addReaction: vi.fn(),
    removeReaction: vi.fn(),
    pinMessage: vi.fn(async () => {}),
    unpinMessage: vi.fn(async () => {}),
    searchMessages: searchMessagesMock,
  },
  messagesByChatId: { subscribe: messagesStore.subscribe },
  hasMoreByChatId: { subscribe: hasMoreStore.subscribe },
  loadingStateByChat: { subscribe: loadingStateStore.subscribe },
}));

import ChatView from "../../src/lib/features/chat/components/ChatView.svelte";
import SearchSidebar from "../../src/lib/components/sidebars/SearchSidebar.svelte";
import { chatSearchStore } from "../../src/lib/features/chat/stores/chatSearchStore";

describe("ChatView remote search pagination", () => {
  const friend: Friend = {
    id: "friend-1",
    name: "Friend One",
    avatar: "",
    online: true,
    status: "Online",
    timestamp: new Date().toISOString(),
    messages: [],
  };

  const chat: Chat = {
    id: "chat-1",
    type: "dm",
    friend,
    members: [friend],
  } as Chat;

  beforeAll(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);

    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback): number =>
        setTimeout(() => cb(performance.now()), 0) as unknown as number,
    );

    vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
      clearTimeout(handle);
    });
  });

  beforeEach(() => {
    cleanup();
    chatSearchStore.reset();
    messagesStore.set(new Map());
    hasMoreStore.set(new Map());
    loadingStateStore.set(new Map());
    resetPages();
    searchMessagesMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("loads additional search pages when requested", async () => {
    render(ChatView, { chat });
    render(SearchSidebar, { chat });

    chatSearchStore.setQuery("result");
    chatSearchStore.executeSearch();

    await waitFor(() => {
      expect(searchMessagesMock).toHaveBeenCalledTimes(3);
    });

    await waitFor(() => {
      expect(screen.getByText("Page 1 result")).toBeInTheDocument();
      expect(screen.getByText("Page 2 result")).toBeInTheDocument();
      expect(screen.getByText("Page 3 result")).toBeInTheDocument();
    });

    const loadMoreButton = await screen.findByRole("button", {
      name: /load more results/i,
    });

    await fireEvent.click(loadMoreButton);

    await waitFor(() => {
      expect(searchMessagesMock).toHaveBeenCalledTimes(4);
      expect(screen.getByText("Page 4 result")).toBeInTheDocument();
      expect(get(chatSearchStore).hasMore).toBe(false);
    });
  });
});
