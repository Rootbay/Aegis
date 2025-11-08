import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { tick } from "svelte";

import Passthrough from "../mocks/Passthrough.svelte";
import MessageAuthorNameStub from "../mocks/MessageAuthorNameStub.svelte";
import VirtualListStub from "../mocks/VirtualListStub.svelte";
import ContextMenuActionDispatcher from "../mocks/ContextMenuActionDispatcher.svelte";

import { invoke } from "@tauri-apps/api/core";
import {
  messagesByChatId as messagesByChatIdReadable,
  hasMoreByChatId as hasMoreByChatIdReadable,
  loadingStateByChat as loadingStateByChatReadable,
} from "$lib/features/chat/stores/chatStore";
import { chatSearchStore } from "$lib/features/chat/stores/chatSearchStore";
import {
  loadChatDraft,
  resetChatDrafts,
  saveChatDraft,
} from "$lib/features/chat/utils/chatDraftStore";
import ChatView from "$lib/features/chat/components/ChatView.svelte";
import type { Chat } from "$lib/features/chat/models/Chat";
import type { Friend } from "$lib/features/friends/models/Friend";
import type { Message } from "$lib/features/chat/models/Message";
import type { User } from "$lib/features/auth/models/User";
import type { Channel } from "$lib/features/channels/models/Channel";
import type { Role } from "$lib/features/servers/models/Role";

vi.mock("$app/environment", () => ({
  browser: false,
}));

if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  Object.defineProperty(globalThis, "ResizeObserver", {
    value: ResizeObserverMock,
    configurable: true,
    writable: true,
  });
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

type WritableStore<T> = {
  subscribe: (run: (value: T) => void) => () => void;
  set: (value: T) => void;
  update: (updater: (value: T) => T) => void;
};

type ToastModuleMock = {
  toasts: {
    addToast: ReturnType<typeof vi.fn>;
    showErrorToast: ReturnType<typeof vi.fn>;
  };
  __resetToasts: () => void;
};

type ContextMenuModuleMock = {
  buildGroupModalOptions: () => Record<string, unknown>;
  buildReportUserPayload: () => Record<string, unknown>;
};

type CollabModuleMock = {
  generateCollaborationDocumentId: (prefix?: string) => string;
};

type ChatStoreModule = {
  chatStore: {
    markActiveChatViewed: () => void;
    sendTypingIndicator: () => Promise<void>;
    loadMoreMessages: (chatId: string) => Promise<void>;
    sendMessageWithAttachments: () => Promise<void>;
    sendMessage: () => Promise<void>;
    overrideSpamDecision: () => void;
    deleteMessage: () => void;
    editMessage: () => Promise<void>;
    addReaction: () => void;
    removeReaction: () => void;
    pinMessage: () => Promise<void>;
    unpinMessage: () => Promise<void>;
    searchMessages: () => Promise<{
      received: number;
      hasMore: boolean;
      nextCursor: string | null;
    }>;
  };
  messagesByChatId: WritableStore<Map<string, Message[]>>;
  hasMoreByChatId: WritableStore<Map<string, boolean>>;
  loadingStateByChat: WritableStore<Map<string, boolean>>;
};

type ChatSearchState = {
  query: string;
  matches: number[];
  activeMatchIndex: number;
  searching: boolean;
  loading: boolean;
  hasMore: boolean;
  nextCursor: string | null;
  searchRequestId: number;
  pagesLoaded: number;
  resultsReceived: number;
  loadMoreRequests: number;
};

type ChatSearchModule = {
  chatSearchStore: {
    subscribe: WritableStore<ChatSearchState>["subscribe"];
    setQuery: (query: string) => void;
    setMatches: (matches: number[]) => void;
    setActiveMatchIndex: (index: number) => void;
    registerHandlers: () => () => void;
    reset: () => void;
    setSearchLoading: (requestId: number, loading: boolean) => void;
    recordSearchPage: (
      requestId: number,
      page: { cursor: string | null; hasMore: boolean; results: number },
    ) => void;
  };
};

type UserStoreModule = {
  userStore: {
    subscribe: WritableStore<{ me: User; loading: boolean }>["subscribe"];
  };
  __setUser: (user: User) => void;
};

type MutedFriendsModule = {
  mutedFriendsStore: {
    isMuted: Mock<(id: string) => boolean>;
    mute: Mock<(id: string) => void>;
    unmute: Mock<(id: string) => void>;
  };
  __resetMutedFriends: () => void;
};

type FriendStoreModule = {
  friendStore: {
    removeFriend: Mock<
      (friendshipId: string, friendId: string) => Promise<void>
    >;
    initialize: Mock<() => Promise<void>>;
    subscribe: WritableStore<{ friends: Friend[] }>['subscribe'];
  };
  __resetFriendStore?: () => void;
};

type CallStoreModule = {
  callStore: {
    subscribe: WritableStore<{ activeCall: unknown }>["subscribe"];
    initialize: (...args: unknown[]) => unknown;
    startCall: (...args: unknown[]) => unknown;
    setCallModalOpen: (...args: unknown[]) => unknown;
  };
};

type ServerStoreModule = {
  serverStore: {
    subscribe: WritableStore<{ servers: unknown[] }>["subscribe"];
  };
  __setServerState?: (state: { servers: unknown[]; [key: string]: unknown }) => void;
};

const messagesByChatId = messagesByChatIdReadable as unknown as WritableStore<
  Map<string, Message[]>
>;
const hasMoreByChatId = hasMoreByChatIdReadable as unknown as WritableStore<
  Map<string, boolean>
>;
const loadingStateByChat =
  loadingStateByChatReadable as unknown as WritableStore<Map<string, boolean>>;
const { __setUser } = getUserStoreModule();
const { __resetMutedFriends } = getMutedFriendsModule();

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

describe("ChatView expiring messages", () => {
  beforeEach(async () => {
    await resetChatViewState();
  });

  it("renders a live expiry indicator and removes it when the message disappears", async () => {
    vi.useFakeTimers();

    const baseTime = new Date("2024-01-01T00:00:00.000Z");
    vi.setSystemTime(baseTime);

    const chatId = "chat-expiring";
    const friend: Friend = {
      id: "friend-expiring",
      name: "Expiring Friend",
      avatar: "https://example.com/expiring.png",
      online: true,
      status: "Online",
      timestamp: baseTime.toISOString(),
      messages: [],
    };

    const message: Message = {
      id: "msg-expiring-1",
      chatId,
      senderId: friend.id,
      content: "This message will disappear soon",
      timestamp: baseTime.toISOString(),
      read: true,
      expiresAt: new Date(baseTime.getTime() + 30_000).toISOString(),
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

      const initialIndicator = await screen.findByText("Expires in 30s");
      expect(initialIndicator).toBeTruthy();

      vi.advanceTimersByTime(5_000);
      await tick();

      await waitFor(() => {
        expect(screen.getByText("Expires in 25s")).toBeTruthy();
      });

      messagesByChatId.set(new Map([[chatId, []]]));
      await tick();

      await waitFor(() => {
        expect(screen.queryByText(message.content)).toBeNull();
      });

      await waitFor(() => {
        expect(screen.queryByText(/Expires in/)).toBeNull();
        expect(screen.queryByText("Expired")).toBeNull();
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("ChatView drafts", () => {
  beforeEach(async () => {
    await resetChatViewState();
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

  it("restores a persisted draft when opening a chat", async () => {
    const chatId = "chat-restore-persisted";
    const friend: Friend = {
      id: "friend-restore",
      name: "Persistent Pat",
      avatar: "https://example.com/pat.png",
      online: true,
      status: "Online",
      timestamp: new Date().toISOString(),
      messages: [],
    };

    await saveChatDraft(chatId, {
      messageInput: "Resume our last conversation",
      attachments: [],
      replyTargetMessageId: null,
      replyPreview: null,
      textareaHeight: "88px",
    });

    messagesByChatId.set(new Map([[chatId, []]]));

    const chat: Chat = {
      type: "dm",
      id: chatId,
      friend,
      messages: [],
    };

    render(ChatView, { props: { chat } });

    const composer = (await screen.findByPlaceholderText(
      `Message @${friend.name}`,
    )) as HTMLTextAreaElement;

    await waitFor(() => {
      expect(composer.value).toBe("Resume our last conversation");
    });
  });

  it("removes the persisted draft once the message is sent", async () => {
    const chatId = "chat-clear-after-send";
    const friend: Friend = {
      id: "friend-clear",
      name: "Clearing Casey",
      avatar: "https://example.com/casey.png",
      online: true,
      status: "Online",
      timestamp: new Date().toISOString(),
      messages: [],
    };

    messagesByChatId.set(new Map([[chatId, []]]));

    const chat: Chat = {
      type: "dm",
      id: chatId,
      friend,
      messages: [],
    };

    render(ChatView, { props: { chat } });

    const composer = (await screen.findByPlaceholderText(
      `Message @${friend.name}`,
    )) as HTMLTextAreaElement;

    await fireEvent.input(composer, {
      target: { value: "Message heading out" },
    });

    await waitFor(async () => {
      const draft = await loadChatDraft(chatId);
      expect(draft?.messageInput).toBe("Message heading out");
    });

    const form = composer.closest("form");
    expect(form).not.toBeNull();
    await fireEvent.submit(form as HTMLFormElement);

    await waitFor(async () => {
      const draft = await loadChatDraft(chatId);
      expect(draft).toBeUndefined();
    });
  });

  it("clears persisted drafts when logging out", async () => {
    const chatId = "chat-clear-on-logout";

    await saveChatDraft(chatId, {
      messageInput: "Keep this safe",
      attachments: [],
      replyTargetMessageId: null,
      replyPreview: null,
      textareaHeight: "72px",
    });

    await resetChatDrafts();

    const restored = await loadChatDraft(chatId);
    expect(restored).toBeUndefined();
  });
});

describe("ChatView mentions", () => {
  beforeEach(async () => {
    await resetChatViewState();
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

  it("inserts channel and role mentions from the suggestion list", async () => {
    const serverId = "server-mention-suggestions";
    const channels: Channel[] = [
      {
        id: "channel-general",
        name: "general",
        server_id: serverId,
        channel_type: "text",
        private: false,
      },
      {
        id: "channel-random",
        name: "random",
        server_id: serverId,
        channel_type: "text",
        private: false,
      },
    ];
    const roles: Role[] = [
      {
        id: "role-mods",
        name: "Moderators",
        color: "#7289da",
        hoist: false,
        mentionable: true,
        permissions: {},
        member_ids: [],
      },
    ];

    const serverModule = getServerStoreModule();
    serverModule.__setServerState?.({
      servers: [
        {
          id: serverId,
          name: "Mention Test Server",
          channels,
          roles,
          members: [],
        },
      ],
      activeServerId: serverId,
    });

    const members: User[] = [
      {
        id: "user-alex",
        name: "Alex Example",
        avatar: "https://example.com/alex.png",
        online: true,
      },
    ];

    const chat: Chat = {
      type: "channel",
      id: channels[0].id,
      name: channels[0].name,
      serverId,
      members,
      messages: [],
    };

    messagesByChatId.set(new Map([[chat.id, []]]));

    render(ChatView, { props: { chat } });

    const composer = (await screen.findByPlaceholderText(
      `Message #${chat.name}`,
    )) as HTMLTextAreaElement;

    const draft = "Discuss #gen";
    composer.value = draft;
    composer.setSelectionRange(draft.length, draft.length);

    await fireEvent.input(composer, {
      target: {
        value: draft,
        selectionStart: draft.length,
        selectionEnd: draft.length,
      },
    });

    const channelSuggestion = await screen.findByRole("button", {
      name: /#general/i,
    });

    await fireEvent.click(channelSuggestion);

    expect(composer.value).toBe("Discuss <#channel-general> ");

    const roleDraft = "Alert @&Mod";
    composer.value = roleDraft;
    composer.setSelectionRange(roleDraft.length, roleDraft.length);

    await fireEvent.input(composer, {
      target: {
        value: roleDraft,
        selectionStart: roleDraft.length,
        selectionEnd: roleDraft.length,
      },
    });

    const roleSuggestion = await screen.findByRole("button", {
      name: /@Moderators/i,
    });

    await fireEvent.click(roleSuggestion);

    expect(composer.value).toBe("Alert <@&role-mods> ");
  });
});

describe("ChatView channel permissions", () => {
  beforeEach(async () => {
    await resetChatViewState();
    mockExtractFirstLink.mockReset();
    mockExtractFirstLink.mockImplementation(() => null);
    mockGetLinkPreviewMetadata.mockReset();
    mockGetLinkPreviewMetadata.mockResolvedValue(null);
  });

  it("blocks the composer when the member lacks send_messages", async () => {
    const serverId = "server-permissions";
    const channel: Channel = {
      id: "channel-restricted",
      name: "restricted",
      server_id: serverId,
      channel_type: "text",
      private: false,
    };

    const restrictedRole: Role = {
      id: "role-read-only",
      name: "Read Only",
      color: "#555555",
      hoist: false,
      mentionable: false,
      permissions: {
        send_messages: false,
        attach_files: false,
        use_external_emojis: false,
        add_reactions: false,
        manage_messages: false,
      },
      member_ids: ["user-current"],
    };

    const serverModule = getServerStoreModule();
    serverModule.__setServerState?.({
      servers: [
        {
          id: serverId,
          name: "Permission Test Server",
          owner_id: "server-owner",
          channels: [channel],
          roles: [restrictedRole],
          members: [
            {
              id: "user-current",
              name: "Current User",
              avatar: "https://example.com/me.png",
              online: true,
              roles: [restrictedRole.id],
            },
          ],
        },
      ],
      activeServerId: serverId,
    });

    __setUser({
      id: "user-current",
      name: "Current User",
      avatar: "https://example.com/me.png",
      online: true,
      roles: [restrictedRole.id],
    });

    const chat: Chat = {
      type: "channel",
      id: channel.id,
      name: channel.name,
      serverId,
      members: [
        {
          id: "user-current",
          name: "Current User",
          avatar: "https://example.com/me.png",
          online: true,
          roles: [restrictedRole.id],
        },
      ],
      messages: [],
    };

    messagesByChatId.set(new Map([[chat.id, []]]));

    render(ChatView, { props: { chat } });

    expect(
      await screen.findByText(
        "You do not have permission to send messages in this channel.",
      ),
    ).toBeInTheDocument();

    expect(screen.queryByPlaceholderText(`Message #${channel.name}`)).toBeNull();
    expect(screen.queryByLabelText(/Attach files/i)).toBeNull();
    expect(screen.queryByLabelText(/Insert emoji/i)).toBeNull();
    expect(screen.queryByLabelText(/voice message/i)).toBeNull();
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
  Bot: Passthrough,
  CircleAlert: Passthrough,
  Link: Passthrough,
  LoaderCircle: Passthrough,
  Mic: Passthrough,
  RadioTower: Passthrough,
  SendHorizontal: Passthrough,
  Smile: Passthrough,
  Square: Passthrough,
  Timer: Passthrough,
  Users: Passthrough,
  Webhook: Passthrough,
  Wifi: Passthrough,
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

vi.mock("$lib/components/emoji/emojiData", () => ({
  loadEmojiData: vi.fn(async () => ({
    categories: [
      {
        id: "smileys",
        label: "Smileys & Emotion",
        emojis: ["😀", "😁", "😂", "🤣"],
      },
    ],
    usedFallback: true,
  })),
}));

function getChatStoreModule(): ChatStoreModule {
  const globals = globalThis as typeof globalThis & {
    __chatStoreModule?: ChatStoreModule;
  };
  if (!globals.__chatStoreModule) {
    const messagesByChatId = createWritable<Map<string, Message[]>>(new Map());
    const hasMoreByChatId = createWritable<Map<string, boolean>>(new Map());
    const loadingStateByChat = createWritable<Map<string, boolean>>(new Map());

    globals.__chatStoreModule = {
      chatStore: {
        markActiveChatViewed: () => {},
        sendTypingIndicator: () => Promise.resolve(),
        loadMoreMessages: async () => {},
        sendMessageWithAttachments: () => Promise.resolve(),
        sendMessage: () => Promise.resolve(),
        overrideSpamDecision: () => {},
        deleteMessage: () => {},
        editMessage: () => Promise.resolve(),
        addReaction: () => {},
        removeReaction: () => {},
        pinMessage: () => Promise.resolve(),
        unpinMessage: () => Promise.resolve(),
        searchMessages: async () => ({
          received: 0,
          hasMore: false,
          nextCursor: null,
        }),
      },
      messagesByChatId,
      hasMoreByChatId,
      loadingStateByChat,
    };
  }
  return globals.__chatStoreModule;
}

vi.mock("$lib/features/chat/stores/chatStore", () => getChatStoreModule());
vi.mock("../../src/lib/features/chat/stores/chatStore", () =>
  getChatStoreModule(),
);

function getChatSearchModule(): ChatSearchModule {
  const globals = globalThis as typeof globalThis & {
    __chatSearchModule?: ChatSearchModule;
  };
  if (!globals.__chatSearchModule) {
    const state = createWritable<ChatSearchState>({
      query: "",
      matches: [] as number[],
      activeMatchIndex: 0,
      searching: false,
      loading: false,
      hasMore: false,
      nextCursor: null,
      searchRequestId: 0,
      pagesLoaded: 0,
      resultsReceived: 0,
      loadMoreRequests: 0,
    });

    globals.__chatSearchModule = {
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
          state.set({
            query: "",
            matches: [],
            activeMatchIndex: 0,
            searching: false,
            loading: false,
            hasMore: false,
          nextCursor: null,
          searchRequestId: 0,
          pagesLoaded: 0,
          resultsReceived: 0,
          loadMoreRequests: 0,
        });
        },
        setSearchLoading: () => {},
        recordSearchPage: () => {},
      },
    };
  }
  return globals.__chatSearchModule;
}

vi.mock("$lib/features/chat/stores/chatSearchStore", () =>
  getChatSearchModule(),
);
vi.mock("../../src/lib/features/chat/stores/chatSearchStore", () =>
  getChatSearchModule(),
);

function getUserStoreModule(): UserStoreModule {
  const globals = globalThis as typeof globalThis & {
    __userStoreModule?: UserStoreModule;
  };
  if (!globals.__userStoreModule) {
    const state = createWritable<{ me: User; loading: boolean }>({
      me: {
        id: "user-current",
        name: "Current User",
        avatar: "https://example.com/me.png",
        online: true,
      },
      loading: false,
    });

    globals.__userStoreModule = {
      userStore: {
        subscribe: state.subscribe,
      },
      __setUser: (user: User) => {
        state.set({ me: user, loading: false });
      },
    };
  }
  return globals.__userStoreModule;
}

vi.mock("$lib/stores/userStore", () => getUserStoreModule());
vi.mock("../../src/lib/stores/userStore", () => getUserStoreModule());

function getMutedFriendsModule(): MutedFriendsModule {
  const globals = globalThis as typeof globalThis & {
    __mutedFriendsModule?: MutedFriendsModule;
  };
  if (!globals.__mutedFriendsModule) {
    const muted = new Set<string>();
    const mutedFriendsStore = {
      isMuted: vi.fn((id: string) => muted.has(id)),
      mute: vi.fn((id: string) => {
        muted.add(id);
      }),
      unmute: vi.fn((id: string) => {
        muted.delete(id);
      }),
    };

    globals.__mutedFriendsModule = {
      mutedFriendsStore,
      __resetMutedFriends: () => {
        muted.clear();
        mutedFriendsStore.isMuted.mockClear();
        mutedFriendsStore.mute.mockClear();
        mutedFriendsStore.unmute.mockClear();
      },
    };
  }
  return globals.__mutedFriendsModule;
}

vi.mock("$lib/features/friends/stores/mutedFriendsStore", () =>
  getMutedFriendsModule(),
);
vi.mock("../../src/lib/features/friends/stores/mutedFriendsStore", () =>
  getMutedFriendsModule(),
);

function getFriendStoreModule(): FriendStoreModule {
  const globals = globalThis as typeof globalThis & {
    __friendStoreModule?: FriendStoreModule;
  };
  if (!globals.__friendStoreModule) {
    const removeFriend = vi.fn(
      async (_friendshipId: string, _friendId: string) => {},
    );
    const initialize = vi.fn(async () => Promise.resolve());
    const state = createWritable<{ friends: Friend[] }>({ friends: [] });

    globals.__friendStoreModule = {
      friendStore: {
        removeFriend,
        initialize,
        subscribe: state.subscribe,
      },
      __resetFriendStore: () => {
        removeFriend.mockClear();
        initialize.mockClear();
        state.set({ friends: [] });
      },
    };
  }
  return globals.__friendStoreModule;
}

vi.mock("$lib/features/friends/stores/friendStore", () =>
  getFriendStoreModule(),
);
vi.mock("../../src/lib/features/friends/stores/friendStore", () =>
  getFriendStoreModule(),
);

function getCallStoreModule(): CallStoreModule {
  const globals = globalThis as typeof globalThis & {
    __callStoreModule?: CallStoreModule;
  };
  if (!globals.__callStoreModule) {
    const state = createWritable<{ activeCall: unknown }>({
      activeCall: null,
    });

    globals.__callStoreModule = {
      callStore: {
        subscribe: state.subscribe,
        initialize: vi.fn(),
        startCall: vi.fn(),
        setCallModalOpen: vi.fn(),
      },
    };
  }
  return globals.__callStoreModule;
}

vi.mock("$lib/features/calls/stores/callStore", () => getCallStoreModule());
vi.mock("../../src/lib/features/calls/stores/callStore", () =>
  getCallStoreModule(),
);

function getServerStoreModule(): ServerStoreModule {
  const globals = globalThis as typeof globalThis & {
    __serverStoreModule?: ServerStoreModule;
  };
  if (!globals.__serverStoreModule) {
    const state = createWritable<{ servers: unknown[] }>({ servers: [] });

    globals.__serverStoreModule = {
      serverStore: {
        subscribe: state.subscribe,
      },
      __setServerState: (next) => state.set(next),
    };
  }
  return globals.__serverStoreModule;
}

vi.mock("$lib/features/servers/stores/serverStore", () =>
  getServerStoreModule(),
);
vi.mock("../../src/lib/features/servers/stores/serverStore", () =>
  getServerStoreModule(),
);

function getToastModule(): ToastModuleMock {
  const globals = globalThis as typeof globalThis & {
    __toastModule?: ToastModuleMock;
  };
  if (!globals.__toastModule) {
    const addToast = vi.fn();
    const showErrorToast = vi.fn();

    globals.__toastModule = {
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
  return globals.__toastModule;
}

vi.mock("$lib/stores/ToastStore", () => getToastModule());
vi.mock("../../src/lib/stores/ToastStore", () => getToastModule());

function getContextMenuModule(): ContextMenuModuleMock {
  const globals = globalThis as typeof globalThis & {
    __contextMenuModule?: ContextMenuModuleMock;
  };
  if (!globals.__contextMenuModule) {
    globals.__contextMenuModule = {
      buildGroupModalOptions: () => ({}),
      buildReportUserPayload: () => ({}),
    };
  }
  return globals.__contextMenuModule;
}

vi.mock("$lib/features/chat/utils/contextMenu", () => getContextMenuModule());
vi.mock("../../src/lib/features/chat/utils/contextMenu", () =>
  getContextMenuModule(),
);

function getCollabModule(): CollabModuleMock {
  const globals = globalThis as typeof globalThis & {
    __collabModule?: CollabModuleMock;
  };
  if (!globals.__collabModule) {
    globals.__collabModule = {
      generateCollaborationDocumentId: (prefix = "collab") => `${prefix}-mock`,
    };
  }
  return globals.__collabModule;
}

vi.mock("$lib/features/collaboration/collabDocumentStore", () =>
  getCollabModule(),
);
vi.mock("../../src/lib/features/collaboration/collabDocumentStore", () =>
  getCollabModule(),
);

import {
  defaultSettings,
  settings,
  setMessageDensity,
  setShowMessageAvatars,
  setShowMessageTimestamps,
} from "$lib/features/settings/stores/settings";

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

async function resetChatViewState() {
  const baseline = structuredClone(defaultSettings);
  baseline.showMessageAvatars = true;
  baseline.showMessageTimestamps = true;
  settings.set(baseline);

  messagesByChatId.set(new Map());
  hasMoreByChatId.set(new Map());
  loadingStateByChat.set(new Map());
  chatSearchStore.reset();
  await resetChatDrafts();
  __setUser({
    id: "user-current",
    name: "Current User",
    avatar: "https://example.com/me.png",
    online: true,
  });
  __resetMutedFriends();
  const friendModule = getFriendStoreModule();
  friendModule.__resetFriendStore?.();
  const serverModule = getServerStoreModule();
  serverModule.__setServerState?.({ servers: [] });
  const toastModule = getToastModule();
  toastModule.__resetToasts?.();
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockResolvedValue(null as never);
}

describe("ChatView privacy preferences", () => {
  beforeEach(async () => {
    await resetChatViewState();
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

  beforeEach(async () => {
    await resetChatViewState();
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
  beforeEach(async () => {
    await resetChatViewState();
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
  beforeEach(async () => {
    await resetChatViewState();
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

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("ChatView history loading", () => {
  beforeEach(async () => {
    await resetChatViewState();
  });

  it("loads older messages when the reply target is outside the current window", async () => {
    const chatModule = getChatStoreModule();

    const chatId = "chat-history";
    const friend: Friend = {
      id: "friend-history",
      name: "History Helper",
      avatar: "https://example.com/history.png",
      online: true,
      status: "Online",
      timestamp: new Date().toISOString(),
      messages: [],
    };

    const olderMessage: Message = {
      id: "msg-history-older",
      chatId,
      senderId: friend.id,
      content: "This is the older message",
      timestamp: "2024-01-01T00:00:00.000Z",
      read: true,
    };

    const newerMessage: Message = {
      id: "msg-history-newer",
      chatId,
      senderId: friend.id,
      content: "Replying to an old message",
      timestamp: "2024-01-01T00:10:00.000Z",
      read: true,
      replyToMessageId: olderMessage.id,
      replySnapshot: {
        author: friend.name,
        snippet: olderMessage.content,
      },
    };

    messagesByChatId.set(new Map([[chatId, [newerMessage]]]));
    hasMoreByChatId.set(new Map([[chatId, true]]));

    const loadMoreSpy = vi
      .spyOn(chatModule.chatStore, "loadMoreMessages")
      .mockImplementation(async (targetChatId) => {
        if (targetChatId !== chatId) return;
        await Promise.resolve();
        messagesByChatId.update((current) => {
          const next = new Map(current);
          const existing = next.get(chatId) ?? [];
          if (!existing.some((msg) => msg.id === olderMessage.id)) {
            next.set(chatId, [olderMessage, ...existing]);
          }
          return next;
        });
        hasMoreByChatId.update((current) => {
          const next = new Map(current);
          next.set(chatId, false);
          return next;
        });
      });

    const chat: Chat = {
      type: "dm",
      id: chatId,
      friend,
      messages: [newerMessage],
    };

    const originalScrollIntoView = Element.prototype.scrollIntoView;
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;

    try {
      render(ChatView, { props: { chat } });

      const replyButton = await screen.findByRole("button", {
        name: /Replying to/,
      });

      await fireEvent.click(replyButton);

      await screen.findByText("Loading previous messages…");

      await waitFor(() => {
        expect(loadMoreSpy).toHaveBeenCalledWith(chatId);
      });

      await waitFor(() => {
        expect(scrollSpy).toHaveBeenCalledWith({
          behavior: "smooth",
          block: "center",
        });
      });

      const matches = screen.getAllByText(olderMessage.content);
      expect(matches.length).toBeGreaterThan(0);
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView;
      loadMoreSpy.mockRestore();
    }
  });

  it("avoids duplicate history fetches while a load is already in progress", async () => {
    const chatModule = getChatStoreModule();

    const chatId = "chat-history-duplicate";
    const friend: Friend = {
      id: "friend-history-dup",
      name: "History Duplicate",
      avatar: "https://example.com/history-dup.png",
      online: true,
      status: "Online",
      timestamp: new Date().toISOString(),
      messages: [],
    };

    const olderMessage: Message = {
      id: "msg-history-dup-older",
      chatId,
      senderId: friend.id,
      content: "Old duplicate message",
      timestamp: "2024-01-02T00:00:00.000Z",
      read: true,
    };

    const newerMessage: Message = {
      id: "msg-history-dup-newer",
      chatId,
      senderId: friend.id,
      content: "Another reply to an old message",
      timestamp: "2024-01-02T00:10:00.000Z",
      read: true,
      replyToMessageId: olderMessage.id,
      replySnapshot: {
        author: friend.name,
        snippet: olderMessage.content,
      },
    };

    messagesByChatId.set(new Map([[chatId, [newerMessage]]]));
    hasMoreByChatId.set(new Map([[chatId, true]]));

    const deferred = createDeferred<void>();

    const loadMoreSpy = vi
      .spyOn(chatModule.chatStore, "loadMoreMessages")
      .mockImplementation(async (targetChatId) => {
        if (targetChatId !== chatId) return;
        await deferred.promise;
        messagesByChatId.update((current) => {
          const next = new Map(current);
          const existing = next.get(chatId) ?? [];
          if (!existing.some((msg) => msg.id === olderMessage.id)) {
            next.set(chatId, [olderMessage, ...existing]);
          }
          return next;
        });
        hasMoreByChatId.update((current) => {
          const next = new Map(current);
          next.set(chatId, false);
          return next;
        });
      });

    const chat: Chat = {
      type: "dm",
      id: chatId,
      friend,
      messages: [newerMessage],
    };

    const originalScrollIntoView = Element.prototype.scrollIntoView;
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;

    try {
      render(ChatView, { props: { chat } });

      const replyButton = await screen.findByRole("button", {
        name: /Replying to/,
      });

      await fireEvent.click(replyButton);
      await fireEvent.click(replyButton);

      expect(loadMoreSpy).toHaveBeenCalledTimes(1);

      deferred.resolve();

      await waitFor(() => {
        expect(scrollSpy).toHaveBeenCalled();
      });

      const matches = screen.getAllByText(olderMessage.content);
      expect(matches.length).toBeGreaterThan(0);
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView;
      loadMoreSpy.mockRestore();
    }
  });
});

describe("ChatView author type badges", () => {
  beforeEach(async () => {
    await resetChatViewState();
  });

  it("renders a badge for bot messages", async () => {
    const chatId = "chat-author-bot";
    const friend: Friend = {
      id: "friend-author-bot",
      name: "Automation Agent",
      avatar: "https://example.com/bot.png",
      online: true,
      status: "Online",
      timestamp: new Date().toISOString(),
      messages: [],
    };

    const message: Message = {
      id: "msg-author-bot",
      chatId,
      senderId: friend.id,
      content: "Automated response",
      timestamp: "2024-01-02T00:00:00.000Z",
      read: true,
      authorType: "bot",
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
    const container = getMessageContainer(message.content);
    const badge = within(container).getByLabelText("Automated bot message");
    expect(badge).toBeTruthy();
    expect(badge.textContent?.trim()).toContain("BOT");
  });

  it("renders a badge for webhook messages", async () => {
    const chatId = "chat-author-webhook";
    const friend: Friend = {
      id: "friend-author-webhook",
      name: "Webhook Sender",
      avatar: "https://example.com/webhook.png",
      online: true,
      status: "Online",
      timestamp: new Date().toISOString(),
      messages: [],
    };

    const message: Message = {
      id: "msg-author-webhook",
      chatId,
      senderId: friend.id,
      content: "Notification from webhook",
      timestamp: "2024-01-02T01:00:00.000Z",
      read: true,
      authorType: "webhook",
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
    const container = getMessageContainer(message.content);
    const badge = within(container).getByLabelText("Message sent via webhook");
    expect(badge).toBeTruthy();
    expect(badge.textContent?.trim()).toContain("WEBHOOK");
  });

  it("does not render a badge for user messages", async () => {
    const chatId = "chat-author-user";
    const friend: Friend = {
      id: "friend-author-user",
      name: "Regular User",
      avatar: "https://example.com/user.png",
      online: true,
      status: "Online",
      timestamp: new Date().toISOString(),
      messages: [],
    };

    const message: Message = {
      id: "msg-author-user",
      chatId,
      senderId: friend.id,
      content: "Hello from a human",
      timestamp: "2024-01-02T02:00:00.000Z",
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
    const container = getMessageContainer(message.content);
    expect(
      within(container).queryByLabelText("Automated bot message"),
    ).toBeNull();
    expect(
      within(container).queryByLabelText("Message sent via webhook"),
    ).toBeNull();
  });
});

describe("ChatView composer emoji picker", () => {
  beforeEach(async () => {
    await resetChatViewState();
  });

  it("toggles the emoji picker and inserts the selected emoji into the composer", async () => {
    const chatId = "chat-emoji-picker";
    const friend: Friend = {
      id: "friend-emoji-picker",
      name: "Emoji Friend",
      avatar: "https://example.com/emoji.png",
      online: true,
      status: "Online",
      timestamp: new Date().toISOString(),
      messages: [],
    };

    messagesByChatId.set(new Map([[chatId, []]]));

    const chat: Chat = {
      type: "dm",
      id: chatId,
      friend,
      messages: [],
    };

    render(ChatView, { props: { chat } });

    const composer = (await screen.findByPlaceholderText(
      `Message @${friend.name}`,
    )) as HTMLTextAreaElement;

    const emojiToggle = await screen.findByRole("button", {
      name: "Insert emoji",
    });

    expect(emojiToggle.getAttribute("aria-expanded")).toBe("false");
    await fireEvent.click(emojiToggle);

    expect(emojiToggle.getAttribute("aria-expanded")).toBe("true");

    await screen.findByRole("dialog", { name: "Emoji picker" });
    const [firstEmojiButton] = (await screen.findAllByRole("button", {
      name: /React with/,
    })) as HTMLButtonElement[];
    expect(firstEmojiButton).toBeDefined();
    const selectedEmoji = firstEmojiButton.textContent?.trim() ?? "";
    expect(selectedEmoji).not.toBe("");

    await fireEvent.click(firstEmojiButton);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Emoji picker" })).toBeNull();
    });

    await waitFor(() => {
      expect(composer.value).toBe(selectedEmoji);
    });

    await waitFor(() => {
      expect(document.activeElement).toBe(composer);
    });

    expect(emojiToggle.getAttribute("aria-expanded")).toBe("false");
  });
});
