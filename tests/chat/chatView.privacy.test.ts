import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";

import Passthrough from "../mocks/Passthrough.svelte";
import MessageAuthorNameStub from "../mocks/MessageAuthorNameStub.svelte";
import VirtualListStub from "../mocks/VirtualListStub.svelte";
import ContextMenuActionDispatcher from "../mocks/ContextMenuActionDispatcher.svelte";

import { invoke } from "@tauri-apps/api/core";

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

function createFileList(...files: File[]): FileList {
  const fileList: Partial<FileList> = {
    length: files.length,
    item: (index: number) => files[index] ?? null,
  };

  files.forEach((file, index) => {
    (fileList as any)[index] = file;
  });

  return fileList as FileList;
}

function triggerLatestContextAction(action: string) {
  const registry =
    ((globalThis as any).__contextMenuRegistry as Array<{
      trigger: (action: string) => void;
      hasAction: (action: string) => boolean;
    }>) ?? [];
  for (let i = registry.length - 1; i >= 0; i -= 1) {
    const entry = registry[i];
    if (entry?.hasAction(action)) {
      entry.trigger(action);
      break;
    }
  }
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

describe("ChatView drafts", () => {
  beforeEach(() => {
    resetChatViewState();
    mockExtractFirstLink.mockReset();
    mockExtractFirstLink.mockImplementation(() => null);
    mockGetLinkPreviewMetadata.mockReset();
    mockGetLinkPreviewMetadata.mockResolvedValue(null);
  });

  it("persists composer text, attachments, and reply target per chat", async () => {
    const friendA: Friend = {
      id: "friend-drafts-a",
      name: "Drafting Alice",
      avatar: "https://example.com/alice.png",
      online: true,
      status: "Online",
      timestamp: new Date().toISOString(),
      messages: [],
    };

    const friendB: Friend = {
      id: "friend-drafts-b",
      name: "Drafting Bob",
      avatar: "https://example.com/bob.png",
      online: true,
      status: "Online",
      timestamp: new Date().toISOString(),
      messages: [],
    };

    const chatAId = "chat-drafts-a";
    const chatBId = "chat-drafts-b";

    const messageA: Message = {
      id: "msg-drafts-a",
      chatId: chatAId,
      senderId: friendA.id,
      content: "Hello from drafts",
      timestamp: new Date().toISOString(),
      read: true,
    };

    messagesByChatId.set(new Map([[chatAId, [messageA]]]));

    const chatA: Chat = {
      type: "dm",
      id: chatAId,
      friend: friendA,
      messages: [messageA],
    };

    const chatB: Chat = {
      type: "dm",
      id: chatBId,
      friend: friendB,
      messages: [],
    };

    const { rerender, container } = render(ChatView, {
      props: { chat: chatA },
    });

    const composerA = (await screen.findByPlaceholderText(
      `Message @${friendA.name}`,
    )) as HTMLTextAreaElement;

    await fireEvent.input(composerA, {
      target: { value: "Saved draft for Alice" },
    });

    await tick();
    const initialHeight = composerA.style.height;

    const fileInput = container.querySelector(
      "input[type='file']",
    ) as HTMLInputElement;

    const attachment = new File(["content"], "draft.txt", {
      type: "text/plain",
    });

    Object.defineProperty(fileInput, "files", {
      value: createFileList(attachment),
      configurable: true,
    });
    await fireEvent.change(fileInput);

    expect(screen.queryByText("Attachments")).not.toBeNull();

    const messageButton = (await screen.findByRole("button", {
      name: "Message options",
    })) as HTMLButtonElement;

    await fireEvent.contextMenu(messageButton);
    await tick();
    triggerLatestContextAction("reply_message");

    await screen.findByText(`Replying to ${friendA.name}`);

    await rerender({ chat: chatB });
    await tick();

    const composerB = (await screen.findByPlaceholderText(
      `Message @${friendB.name}`,
    )) as HTMLTextAreaElement;

    expect(composerB.value).toBe("");
    expect(screen.queryByText("Attachments")).toBeNull();
    expect(screen.queryByText(`Replying to ${friendA.name}`)).toBeNull();

    await rerender({ chat: chatA });
    await tick();

    const restoredComposer = (await screen.findByPlaceholderText(
      `Message @${friendA.name}`,
    )) as HTMLTextAreaElement;

    expect(restoredComposer.value).toBe("Saved draft for Alice");
    expect(restoredComposer.style.height).toBe(initialHeight);
    expect(screen.queryByText("Attachments")).not.toBeNull();
    expect(screen.queryByText(`Replying to ${friendA.name}`)).not.toBeNull();
  });
});

describe("ChatView mentions", () => {
  beforeEach(() => {
    resetChatViewState();
    mockExtractFirstLink.mockReset();
    mockExtractFirstLink.mockImplementation(() => null);
    mockGetLinkPreviewMetadata.mockReset();
    mockGetLinkPreviewMetadata.mockResolvedValue(null);
  });

  it("replaces the active mention query with the selected member", async () => {
    const members: User[] = [
      {
        id: "user-naomi",
        name: "Naomi Naylor",
        avatar: "https://example.com/naomi.png",
        online: true,
      },
      {
        id: "user-nate",
        name: "Nate North",
        avatar: "https://example.com/nate.png",
        online: true,
      },
    ];

    const chat: Chat = {
      type: "group",
      id: "chat-mentions",
      name: "Dev Team",
      ownerId: "owner-1",
      memberIds: members.map((member) => member.id),
      members,
      messages: [],
    };

    messagesByChatId.set(new Map([[chat.id, []]]));

    render(ChatView, { props: { chat } });

    const composer = (await screen.findByPlaceholderText(
      `Message ${chat.name}`,
    )) as HTMLTextAreaElement;

    const draft = "Ping @na to review";
    const cursorPosition = "Ping @na".length;

    composer.value = draft;
    composer.setSelectionRange(cursorPosition, cursorPosition);

    await fireEvent.input(composer, {
      target: {
        value: draft,
        selectionStart: cursorPosition,
        selectionEnd: cursorPosition,
      },
    });

    const suggestionButton = await screen.findByRole("button", {
      name: /Naomi Naylor/i,
    });

    await fireEvent.click(suggestionButton);

    expect(composer.value).toBe(`Ping <@${members[0].id}> to review`);
    expect(composer.selectionStart).toBe(`Ping <@${members[0].id}>`.length);
    expect(screen.queryByRole("button", { name: /Naomi Naylor/i })).toBeNull();
  });
});

const linkPreviewMocks = vi.hoisted(() => ({
  extractFirstLink: vi.fn<
    (content: string | null | undefined) => string | null
  >(() => null),
  getLinkPreviewMetadata: vi
    .fn<(url: string) => Promise<unknown>>()
    .mockResolvedValue(null),
}));

vi.mock("$lib/features/chat/utils/linkPreviews", () => linkPreviewMocks);

const mockExtractFirstLink = linkPreviewMocks.extractFirstLink;
const mockGetLinkPreviewMetadata = linkPreviewMocks.getLinkPreviewMetadata;

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

vi.mock("$lib/features/chat/components/FileTransferApprovals.svelte", () => ({
  default: Passthrough,
}));

vi.mock("$lib/features/chat/components/FileTransferHistory.svelte", () => ({
  default: Passthrough,
}));

vi.mock("$lib/features/calls/components/CallStatusBanner.svelte", () => ({
  default: Passthrough,
}));

vi.mock("$lib/components/context-menus/BaseContextMenu.svelte", () => ({
  default: ContextMenuActionDispatcher,
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
vi.mock("../../src/lib/features/chat/stores/chatStore", () =>
  getChatStoreModule(),
);

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

vi.mock("$lib/features/chat/stores/chatSearchStore", () =>
  getChatSearchModule(),
);
vi.mock("../../src/lib/features/chat/stores/chatSearchStore", () =>
  getChatSearchModule(),
);

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
        isMuted: vi.fn((id: string) => muted.has(id)),
        mute: vi.fn((id: string) => {
          muted.add(id);
        }),
        unmute: vi.fn((id: string) => {
          muted.delete(id);
        }),
      },
      __resetMutedFriends: () => {
        muted.clear();
        globalThis.__mutedFriendsModule.mutedFriendsStore.isMuted.mockClear();
        globalThis.__mutedFriendsModule.mutedFriendsStore.mute.mockClear();
        globalThis.__mutedFriendsModule.mutedFriendsStore.unmute.mockClear();
      },
    };
  }
  return globalThis.__mutedFriendsModule;
}

vi.mock("$lib/features/friends/stores/mutedFriendsStore", () =>
  getMutedFriendsModule(),
);
vi.mock("../../src/lib/features/friends/stores/mutedFriendsStore", () =>
  getMutedFriendsModule(),
);

function getFriendStoreModule() {
  if (!globalThis.__friendStoreModule) {
    const removeFriend = vi.fn();
    const initialize = vi.fn(async () => {});

    globalThis.__friendStoreModule = {
      friendStore: {
        removeFriend,
        initialize,
      },
      __resetFriendStore: () => {
        removeFriend.mockClear();
        initialize.mockClear();
      },
    };
  }
  return globalThis.__friendStoreModule;
}

vi.mock("$lib/features/friends/stores/friendStore", () =>
  getFriendStoreModule(),
);
vi.mock("../../src/lib/features/friends/stores/friendStore", () =>
  getFriendStoreModule(),
);

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
vi.mock("../../src/lib/features/calls/stores/callStore", () =>
  getCallStoreModule(),
);

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

vi.mock("$lib/features/servers/stores/serverStore", () =>
  getServerStoreModule(),
);
vi.mock("../../src/lib/features/servers/stores/serverStore", () =>
  getServerStoreModule(),
);

function getToastModule() {
  if (!globalThis.__toastModule) {
    const addToast = vi.fn();
    const showErrorToast = vi.fn();

    globalThis.__toastModule = {
      toasts: {
        addToast,
        showErrorToast,
      },
      __resetToasts: () => {
        addToast.mockClear();
        showErrorToast.mockClear();
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
vi.mock("../../src/lib/features/chat/utils/contextMenu", () =>
  getContextMenuModule(),
);

function getCollabModule() {
  if (!globalThis.__collabModule) {
    globalThis.__collabModule = {
      generateCollaborationDocumentId: (prefix = "collab") => `${prefix}-mock`,
    };
  }
  return globalThis.__collabModule;
}

vi.mock("$lib/features/collaboration/collabDocumentStore", () =>
  getCollabModule(),
);
vi.mock("../../src/lib/features/collaboration/collabDocumentStore", () =>
  getCollabModule(),
);

import type { Chat } from "$lib/features/chat/models/Chat";
import type { Friend } from "$lib/features/friends/models/Friend";
import type { Message } from "$lib/features/chat/models/Message";
import type { User } from "$lib/features/auth/models/User";

import ChatView from "$lib/features/chat/components/ChatView.svelte";
import { resetChatDrafts } from "$lib/features/chat/utils/chatDraftStore";
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
  resetChatDrafts();
  __setUser({
    id: "user-current",
    name: "Current User",
    avatar: "https://example.com/me.png",
    online: true,
  });
  __resetMutedFriends();
  const friendModule = getFriendStoreModule();
  friendModule.__resetFriendStore?.();
  const toastModule = getToastModule();
  toastModule.__resetToasts?.();
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockResolvedValue(null as never);
}

describe("ChatView privacy preferences", () => {
  beforeEach(() => {
    resetChatViewState();
    mockExtractFirstLink.mockReset();
    mockExtractFirstLink.mockImplementation(() => null);
    mockGetLinkPreviewMetadata.mockReset();
    mockGetLinkPreviewMetadata.mockResolvedValue(null);
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
        container.querySelector<HTMLImageElement>("img[alt='Alice Example']"),
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
        container.querySelector<HTMLImageElement>("img[alt='Alice Example']"),
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

describe("ChatView link previews", () => {
  const previewMetadata = {
    url: "https://example.com/article",
    title: "Example Article",
    description: "A descriptive summary for testing.",
    siteName: "Example Site",
    imageUrl: "https://example.com/image.png",
  };

  beforeEach(() => {
    resetChatViewState();
    const baseline = structuredClone(defaultSettings);
    baseline.enableLinkPreviews = true;
    settings.set(baseline);

    mockExtractFirstLink.mockReset();
    mockExtractFirstLink.mockImplementation(() => null);
    mockGetLinkPreviewMetadata.mockReset();
    mockGetLinkPreviewMetadata.mockResolvedValue(null);
  });

  it("renders plain message text when no links are detected", async () => {
    const chatId = "chat-plain";
    const friend: Friend = {
      id: "friend-plain",
      name: "Plain Friend",
      avatar: "https://example.com/plain.png",
      online: true,
      status: "Online",
      timestamp: new Date().toISOString(),
      messages: [],
    };

    const message: Message = {
      id: "msg-plain",
      chatId,
      senderId: friend.id,
      content: "Just a regular message without links.",
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

    const content = await screen.findByText(message.content);
    expect(content).toBeTruthy();
    expect(screen.queryByText("Loading preview…")).toBeNull();
    expect(screen.queryByText("Preview unavailable.")).toBeNull();
  });

  it("renders a link preview when metadata is available", async () => {
    const chatId = "chat-preview";
    const friend: Friend = {
      id: "friend-preview",
      name: "Preview Friend",
      avatar: "https://example.com/preview.png",
      online: true,
      status: "Online",
      timestamp: new Date().toISOString(),
      messages: [],
    };

    const message: Message = {
      id: "msg-preview",
      chatId,
      senderId: friend.id,
      content: "Check this out: https://example.com/article",
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

    mockExtractFirstLink.mockImplementation(() => previewMetadata.url);
    mockGetLinkPreviewMetadata.mockResolvedValueOnce(previewMetadata);

    render(ChatView, { props: { chat } });

    await screen.findByText(message.content);

    await waitFor(() => {
      expect(mockExtractFirstLink).toHaveBeenCalled();
    });

    const title = await screen.findByText(previewMetadata.title);
    expect(title).toBeTruthy();
    expect(screen.getByText(previewMetadata.siteName)).toBeTruthy();
    expect(screen.getByText(previewMetadata.description)).toBeTruthy();
  });
});

describe("ChatView friend removal", () => {
  beforeEach(() => {
    resetChatViewState();
  });

  function renderChatWithFriend(friend: Friend) {
    const chatId = `chat-${friend.id}`;
    const message: Message = {
      id: `msg-${friend.id}`,
      chatId,
      senderId: friend.id,
      content: `Hello from ${friend.name}`,
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

    return { chatId, message };
  }

  it("invokes backend removal before updating stores", async () => {
    const friend: Friend = {
      id: "friend-success",
      name: "Successful Friend",
      avatar: "https://example.com/success.png",
      online: true,
      status: "Online",
      timestamp: new Date().toISOString(),
      messages: [],
      friendshipId: "friendship-success",
    };

    renderChatWithFriend(friend);

    const nameButton = (await screen.findByText(
      friend.name,
    )) as HTMLButtonElement;

    await fireEvent.contextMenu(nameButton);
    await tick();
    triggerLatestContextAction("remove_friend");

    await waitFor(() => {
      expect(
        vi
          .mocked(invoke)
          .mock.calls.some(([command]) => command === "remove_friendship"),
      ).toBe(true);
    });

    const removeCall = vi
      .mocked(invoke)
      .mock.calls.find(([command]) => command === "remove_friendship");

    expect(removeCall?.[1]).toEqual({ friendship_id: friend.friendshipId });

    const friendModule = getFriendStoreModule();
    const mutedModule = getMutedFriendsModule();
    const toastModule = getToastModule();

    expect(friendModule.friendStore.removeFriend).toHaveBeenCalledWith(
      friend.id,
    );
    expect(friendModule.friendStore.initialize).toHaveBeenCalledTimes(1);
    expect(mutedModule.mutedFriendsStore.unmute).toHaveBeenCalledWith(
      friend.id,
    );
    expect(toastModule.toasts.addToast).toHaveBeenCalledWith(
      "Friend removed.",
      "success",
    );

    const invokeOrder = vi.mocked(invoke).mock.invocationCallOrder[0];
    const removeOrder =
      friendModule.friendStore.removeFriend.mock.invocationCallOrder[0];
    expect(invokeOrder).toBeLessThan(removeOrder);
  });

  it("falls back to the friend id when no friendship id is provided", async () => {
    const friend: Friend = {
      id: "friend-fallback",
      name: "Fallback Friend",
      avatar: "https://example.com/fallback.png",
      online: true,
      status: "Online",
      timestamp: new Date().toISOString(),
      messages: [],
      friendshipId: undefined,
    };

    renderChatWithFriend(friend);

    const nameButton = (await screen.findByText(
      friend.name,
    )) as HTMLButtonElement;

    await fireEvent.contextMenu(nameButton);
    await tick();
    triggerLatestContextAction("remove_friend");

    await waitFor(() => {
      expect(vi.mocked(invoke)).toHaveBeenCalledWith("remove_friendship", {
        friendship_id: friend.id,
      });
    });
  });

  it("shows an error toast when removal fails", async () => {
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      if (command === "remove_friendship") {
        throw new Error("Removal failed");
      }
      return null as never;
    });

    const friend: Friend = {
      id: "friend-error",
      name: "Error Friend",
      avatar: "https://example.com/error.png",
      online: true,
      status: "Online",
      timestamp: new Date().toISOString(),
      messages: [],
      friendshipId: "friendship-error",
    };

    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    renderChatWithFriend(friend);

    const nameButton = (await screen.findByText(
      friend.name,
    )) as HTMLButtonElement;

    await fireEvent.contextMenu(nameButton);
    await tick();
    triggerLatestContextAction("remove_friend");

    const toastModule = getToastModule();
    const friendModule = getFriendStoreModule();
    const mutedModule = getMutedFriendsModule();

    await waitFor(() => {
      expect(
        vi
          .mocked(invoke)
          .mock.calls.some(([command]) => command === "remove_friendship"),
      ).toBe(true);
    });

    const removeCall = vi
      .mocked(invoke)
      .mock.calls.find(([command]) => command === "remove_friendship");

    expect(removeCall?.[1]).toEqual({ friendship_id: friend.friendshipId });

    await waitFor(() => {
      expect(toastModule.toasts.addToast).toHaveBeenCalled();
    });

    const [[message, level]] = toastModule.toasts.addToast.mock.calls;
    expect(message).toBe("Removal failed");
    expect(level).toBe("error");

    expect(friendModule.friendStore.removeFriend).not.toHaveBeenCalled();
    expect(friendModule.friendStore.initialize).not.toHaveBeenCalled();
    expect(mutedModule.mutedFriendsStore.unmute).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("ChatView reactions", () => {
  beforeEach(() => {
    resetChatViewState();
    mockExtractFirstLink.mockReset();
    mockExtractFirstLink.mockImplementation(() => null);
    mockGetLinkPreviewMetadata.mockReset();
    mockGetLinkPreviewMetadata.mockResolvedValue(null);
  });

  it("opens emoji picker and adds the selected reaction", async () => {
    const chatModule = getChatStoreModule();
    const addReactionSpy = vi.spyOn(chatModule.chatStore, "addReaction");

    const chatId = "chat-emoji-picker";

    const friend: Friend = {
      id: "friend-emoji-picker",
      name: "Emoji Picker Friend",
      avatar: "https://example.com/emoji-friend.png",
      online: true,
      status: "Online",
      timestamp: new Date().toISOString(),
      messages: [],
    };

    const message: Message = {
      id: "msg-emoji-picker",
      chatId,
      senderId: friend.id,
      content: "Emoji picker test message",
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

    try {
      render(ChatView, { props: { chat } });

      await screen.findByText(message.content);

      const container = getMessageContainer(message.content);
      const reactButton = within(container).getByRole("button", {
        name: "Add reaction",
      });

      await fireEvent.click(reactButton);

      const emojiButton = await screen.findByRole("button", {
        name: "React with 😀",
      });

      await fireEvent.click(emojiButton);

      await waitFor(() => {
        expect(addReactionSpy).toHaveBeenCalledWith(chatId, message.id, "😀");
      });
    } finally {
      addReactionSpy.mockRestore();
    }
  });
});
