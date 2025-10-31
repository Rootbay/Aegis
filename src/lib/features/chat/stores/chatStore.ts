import { writable, get, derived, type Readable } from "svelte/store";
import { invoke } from "@tauri-apps/api/core";
import type {
  AttachmentMeta,
  Message,
  ReplySnapshot,
} from "$lib/features/chat/models/Message";
import type {
  ChatMessage,
  DeleteMessage,
  MessageDeletionScope,
  EditMessage,
  MessageReaction,
  ReactionAction,
} from "$lib/features/chat/models/AepMessage";
import { userStore } from "$lib/stores/userStore";
import { serverStore } from "$lib/features/servers/stores/serverStore";
import { friendStore } from "$lib/features/friends/stores/friendStore";
import { settings } from "$lib/features/settings/stores/settings";
import { mutedFriendsStore } from "$lib/features/friends/stores/mutedFriendsStore";
import {
  decodeIncomingMessagePayload,
  encryptOutgoingMessagePayload,
  type MessageAttachmentPayload,
} from "$lib/features/chat/services/chatEncryptionService";
import { showNativeNotification } from "$lib/utils/nativeNotification";
import { spamClassifier } from "$lib/features/security/spamClassifier";
import type { Server } from "$lib/features/servers/models/Server";

type BackendMessage = {
  id: string;
  chat_id?: string;
  chatId?: string;
  sender_id?: string;
  senderId?: string;
  content: string;
  timestamp: string | number | Date;
  read?: boolean;
  pinned?: boolean;
  attachments?: BackendAttachment[];
  reactions?: Record<string, string[]> | null;
  edited_at?: string | number | Date | null;
  editedAt?: string | number | Date | null;
  edited_by?: string | null;
  editedBy?: string | null;
  expires_at?: string | number | Date | null;
  expiresAt?: string | number | Date | null;
  reply_to_message_id?: string | null;
  replyToMessageId?: string | null;
  reply_snapshot_author?: string | null;
  replySnapshotAuthor?: string | null;
  reply_snapshot_snippet?: string | null;
  replySnapshotSnippet?: string | null;
};

export type MessageReadReceiptEvent = {
  chat_id?: string;
  chatId?: string;
  message_id?: string;
  messageId?: string;
  reader_id?: string;
  readerId?: string;
  timestamp?: string | number | Date;
};

export type TypingIndicatorEvent = {
  chat_id?: string;
  chatId?: string;
  user_id?: string;
  userId?: string;
  is_typing?: boolean;
  isTyping?: boolean;
  timestamp?: string | number | Date;
};

type BackendAttachment = {
  id: string;
  message_id?: string;
  messageId?: string;
  name: string;
  content_type?: string;
  contentType?: string;
  size?: number;
  data?: number[] | Uint8Array | ArrayBuffer;
};

export type BackendGroupChat = {
  id: string;
  name?: string | null;
  owner_id?: string;
  ownerId?: string;
  created_at?: string | number | Date;
  createdAt?: string | number | Date;
  member_ids?: string[];
  memberIds?: string[];
};

export interface GroupChatSummary {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  memberIds: string[];
}

export interface ChatMetadata {
  chatId: string;
  lastMessage: Message | null;
  lastActivityAt: string | null;
  unreadCount: number;
}

export interface SendMessageOptions {
  replyToMessageId?: string;
  replySnapshot?: ReplySnapshot;
}

interface ChatStore {
  messagesByChatId: Readable<Map<string, Message[]>>;
  hasMoreByChatId: Readable<Map<string, boolean>>;
  metadataByChatId: Readable<Map<string, ChatMetadata>>;
  activeChatId: Readable<string | null>;
  activeChatType: Readable<"dm" | "server" | "group" | null>;
  activeChannelId: Readable<string | null>;
  serverChannelSelections: Readable<Map<string, string>>;
  activeServerChannelId: Readable<string | null>;
  loadingStateByChat: Readable<Map<string, boolean>>;
  typingByChatId: Readable<Map<string, string[]>>;
  activeChatTypingUsers: Readable<string[]>;
  setActiveChat: (
    chatId: string,
    chatType: "dm" | "server" | "group",
    channelId?: string,
    options?: {
      forceRefresh?: boolean;
    },
  ) => Promise<void>;
  handleMessagesUpdate: (chatId: string, messages: Message[]) => void;
  refreshChatFromStorage: (
    chatId: string,
    chatType: "dm" | "server" | "group",
    channelId?: string | null,
  ) => Promise<void>;
  sendMessage: (content: string, options?: SendMessageOptions) => Promise<void>;
  sendMessageWithAttachments: (
    content: string,
    files: File[],
    options?: SendMessageOptions,
  ) => Promise<void>;
  deleteMessage: (chatId: string, messageId: string) => Promise<void>;
  pinMessage: (chatId: string, messageId: string) => Promise<void>;
  unpinMessage: (chatId: string, messageId: string) => Promise<void>;
  editMessage: (
    chatId: string,
    messageId: string,
    content: string,
  ) => Promise<void>;
  handleNewMessageEvent: (message: ChatMessage) => Promise<void>;
  handleMessageDeleted: (payload: DeleteMessage) => void;
  handleMessageEdited: (payload: EditMessage) => void;
  handleReactionUpdate: (payload: MessageReaction) => void;
  handleReadReceipt: (payload: MessageReadReceiptEvent) => void;
  handleTypingIndicator: (payload: TypingIndicatorEvent) => void;
  markActiveChatViewed: () => Promise<void>;
  sendTypingIndicator: (isTyping: boolean) => Promise<void>;
  clearActiveChat: () => void;
  dropChatHistory: (chatId: string) => void;
  loadMoreMessages: (targetChatId: string) => Promise<void>;
  loadAttachmentForMessage: (
    chatId: string,
    messageId: string,
    attachmentId: string,
  ) => Promise<string>;
  addReaction: (
    targetChatId: string,
    messageId: string,
    emoji: string,
  ) => Promise<void>;
  removeReaction: (
    targetChatId: string,
    messageId: string,
    emoji: string,
  ) => Promise<void>;
  overrideSpamDecision: (
    chatId: string,
    messageId: string,
    decision: "allow" | "mute",
  ) => void;
  handleGroupChatCreated: (chat: BackendGroupChat) => GroupChatSummary;
  loadGroupChats: () => Promise<void>;
  leaveGroupChat: (groupId: string) => Promise<void>;
  renameGroupChat: (groupId: string, newName: string) => Promise<GroupChatSummary>;
  addMembersToGroupChat: (
    groupId: string,
    memberIds: string[],
  ) => Promise<GroupChatSummary>;
  removeGroupChatMember: (groupId: string, memberId: string) => Promise<void>;
  handleGroupMemberLeft: (groupId: string, memberId: string) => void;
  handleGroupMembersAdded: (groupId: string, memberIds: string[]) => void;
  groupChats: Readable<Map<string, GroupChatSummary>>;
}

type ChatStoreOptions = {
  maxMessagesPerChat?: number;
};

const DEFAULT_MAX_MESSAGES_PER_CHAT = 500;
const TYPING_INDICATOR_TIMEOUT_MS = 4_000;

const isVoiceMemoFile = (file: File) =>
  (file.type?.startsWith("audio/") ?? false) &&
  file.name.startsWith("voice-message-");

const normalizeEventId = (value?: string | null) => {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return null;
};

function createChatStore(options: ChatStoreOptions = {}): ChatStore {
  const messagesByChatIdStore = writable<Map<string, Message[]>>(new Map());
  const hasMoreByChatIdStore = writable<Map<string, boolean>>(new Map());
  const groupChatsStore = writable<Map<string, GroupChatSummary>>(new Map());
  const typingByChatIdStore = writable<Map<string, string[]>>(new Map());
  const metadataByChatIdReadable = derived(
    messagesByChatIdStore,
    ($messages): Map<string, ChatMetadata> => {
      const metadata = new Map<string, ChatMetadata>();
      for (const [chatId, messages] of $messages.entries()) {
        if (!messages || messages.length === 0) {
          metadata.set(chatId, {
            chatId,
            lastMessage: null,
            lastActivityAt: null,
            unreadCount: 0,
          });
          continue;
        }

        let latestTimestamp = Number.NEGATIVE_INFINITY;
        let lastMessage: Message | null = null;
        let fallbackTimestamp: string | null = null;
        let unreadCount = 0;

        for (const message of messages) {
          const candidateTimestamp =
            message.editedAt ?? message.timestamp ?? null;
          if (candidateTimestamp) {
            fallbackTimestamp = candidateTimestamp;
            const parsed = Date.parse(candidateTimestamp);
            if (!Number.isNaN(parsed) && parsed >= latestTimestamp) {
              latestTimestamp = parsed;
              lastMessage = message;
            }
          }

          if (!message.read) {
            unreadCount += 1;
          }
        }

        const normalizedActivity = (() => {
          if (Number.isFinite(latestTimestamp) && latestTimestamp > 0) {
            return new Date(latestTimestamp).toISOString();
          }
          if (lastMessage?.editedAt) {
            return lastMessage.editedAt;
          }
          if (lastMessage?.timestamp) {
            return lastMessage.timestamp;
          }
          return fallbackTimestamp;
        })();

        metadata.set(chatId, {
          chatId,
          lastMessage,
          lastActivityAt: normalizedActivity ?? null,
          unreadCount,
        });
      }

      return metadata;
    },
  );

  const typingTimeouts = new Map<
    string,
    Map<string, ReturnType<typeof setTimeout>>
  >();
  const typingDispatchState = new Map<string, boolean>();
  const lastDispatchedReceiptByChatId = new Map<string, string>();

  const computeEphemeralDurationMs = (
    minutes: number | undefined | null,
  ): number => {
    if (minutes === null || minutes === undefined) {
      return 0;
    }
    const numeric = Number(minutes);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return 0;
    }
    return Math.floor(numeric) * 60_000;
  };

  let ephemeralDurationMs = computeEphemeralDurationMs(
    get(settings).ephemeralMessageDuration,
  );

  const fallbackGroupName = (id: string) => `Group ${id.slice(0, 6)}`;

  const normalizeGroupName = (id: string, name: string | null | undefined) => {
    const trimmed = name?.trim?.() ?? "";
    return trimmed.length > 0 ? trimmed : fallbackGroupName(id);
  };

  const normalizeDateInput = (value: string | number | Date | undefined) => {
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === "number") {
      return new Date(value).toISOString();
    }
    if (typeof value === "string") {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
    return new Date().toISOString();
  };

  const mapBackendGroupChat = (chat: BackendGroupChat): GroupChatSummary => {
    const memberIdsRaw = chat.member_ids ?? chat.memberIds ?? [];
    const memberIds = Array.from(
      new Set(
        memberIdsRaw.filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        ),
      ),
    );
    return {
      id: chat.id,
      name: normalizeGroupName(chat.id, chat.name ?? null),
      ownerId: chat.owner_id ?? chat.ownerId ?? "",
      createdAt: normalizeDateInput(chat.created_at ?? chat.createdAt),
      memberIds,
    };
  };

  const upsertGroupChat = (summary: GroupChatSummary) => {
    groupChatsStore.update((map) => {
      const next = new Map(map);
      next.set(summary.id, summary);
      return next;
    });
  };

  const SERVER_CHANNEL_SELECTIONS_KEY = "serverChannelSelections";

  const mutateTypingUsers = (
    chatId: string,
    mutator: (current: Set<string>) => void,
  ) => {
    typingByChatIdStore.update((map) => {
      const next = new Map(map);
      const existing = new Set(next.get(chatId) ?? []);
      mutator(existing);
      if (existing.size === 0) {
        next.delete(chatId);
      } else {
        next.set(chatId, Array.from(existing));
      }
      return next;
    });
  };

  const clearTypingTimeout = (chatId: string, userId: string) => {
    const timers = typingTimeouts.get(chatId);
    const timeout = timers?.get(userId);
    if (timeout) {
      clearTimeout(timeout);
      timers?.delete(userId);
    }
    if (timers && timers.size === 0) {
      typingTimeouts.delete(chatId);
    }
  };

  const scheduleTypingTimeout = (chatId: string, userId: string) => {
    clearTypingTimeout(chatId, userId);
    const timeout = setTimeout(() => {
      clearTypingTimeout(chatId, userId);
      mutateTypingUsers(chatId, (set) => {
        set.delete(userId);
      });
    }, TYPING_INDICATOR_TIMEOUT_MS);
    const timers = typingTimeouts.get(chatId) ?? new Map();
    timers.set(userId, timeout);
    typingTimeouts.set(chatId, timers);
  };

  const loadServerChannelSelections = (): Map<string, string> => {
    if (typeof localStorage === "undefined") {
      return new Map();
    }
    try {
      const raw = localStorage.getItem(SERVER_CHANNEL_SELECTIONS_KEY);
      if (!raw) {
        return new Map();
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Map(
          parsed.filter(
            (entry): entry is [string, string] =>
              Array.isArray(entry) && entry.length === 2,
          ),
        );
      }
      if (parsed && typeof parsed === "object") {
        return new Map(
          Object.entries(parsed).filter(
            (entry): entry is [string, string] =>
              typeof entry[0] === "string" && typeof entry[1] === "string",
          ),
        );
      }
    } catch (error) {
      console.debug("Failed to parse server channel selections", error);
    }
    return new Map();
  };

  const persistServerChannelSelections = (map: Map<string, string>) => {
    if (typeof localStorage === "undefined") {
      return;
    }
    try {
      localStorage.setItem(
        SERVER_CHANNEL_SELECTIONS_KEY,
        JSON.stringify(Array.from(map.entries())),
      );
    } catch (error) {
      console.debug("Failed to persist server channel selections", error);
    }
  };

  const handleGroupChatCreated = (chat: BackendGroupChat): GroupChatSummary => {
    const summary = mapBackendGroupChat(chat);
    upsertGroupChat(summary);
    messagesByChatIdStore.update((map) => {
      if (map.has(summary.id)) {
        return map;
      }
      const next = new Map(map);
      next.set(summary.id, []);
      return next;
    });
    hasMoreByChatIdStore.update((map) => {
      if (map.has(summary.id)) {
        return map;
      }
      const next = new Map(map);
      next.set(summary.id, true);
      return next;
    });
    return summary;
  };

  const loadGroupChats = async () => {
    try {
      const fetched = await invoke<BackendGroupChat[]>("get_group_chats");
      groupChatsStore.set(new Map());
      if (Array.isArray(fetched)) {
        for (const record of fetched) {
          handleGroupChatCreated(record);
        }
      }
    } catch (error) {
      console.error("Failed to load group chats:", error);
    }
  };

  const initialActiveChatId =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("activeChatId")
      : null;
  const initialActiveChatType =
    typeof localStorage !== "undefined"
      ? (localStorage.getItem("activeChatType") as
          | "dm"
          | "server"
          | "group"
          | null)
      : null;

  const initialServerChannelSelections = loadServerChannelSelections();

  let initialActiveChannelId: string | null = null;
  if (initialActiveChatId && initialActiveChatType === "server") {
    initialActiveChannelId =
      initialServerChannelSelections.get(initialActiveChatId) ?? null;
    if (!initialActiveChannelId && typeof localStorage !== "undefined") {
      const legacyChannelId = localStorage.getItem("activeChannelId");
      if (legacyChannelId) {
        initialActiveChannelId = legacyChannelId;
        initialServerChannelSelections.set(
          initialActiveChatId,
          legacyChannelId,
        );
        persistServerChannelSelections(initialServerChannelSelections);
      }
      localStorage.removeItem("activeChannelId");
    }
  } else if (typeof localStorage !== "undefined") {
    localStorage.removeItem("activeChannelId");
  }

  const activeChatId = writable<string | null>(initialActiveChatId);
  const activeChatType = writable<"dm" | "server" | "group" | null>(
    initialActiveChatType,
  );
  const serverChannelSelectionsStore = writable<Map<string, string>>(
    initialServerChannelSelections,
  );
  const activeChannelId = writable<string | null>(initialActiveChannelId);
  const loadingStateByChatStore = writable<Map<string, boolean>>(new Map());
  const typingByChatIdReadable = derived(
    typingByChatIdStore,
    ($map) => new Map($map),
  );
  const activeChatTypingUsersReadable = derived(
    [activeChatType, activeChatId, activeChannelId, typingByChatIdStore],
    ([$type, $chatId, $channelId, $typing]) => {
      const key = $type === "server" ? $channelId : $chatId;
      if (!key) {
        return [] as string[];
      }
      return $typing.get(key) ?? [];
    },
  );
  const loadSequenceNumbers = new Map<string, number>();
  const updateLoadingStateForChat = (chatId: string, isLoading: boolean) => {
    if (!chatId) return;
    loadingStateByChatStore.update((map) => {
      const next = new Map(map);
      next.set(chatId, isLoading);
      return next;
    });
  };
  const beginLoadingForChat = (chatId: string): number => {
    if (!chatId) return 0;
    const nextToken = (loadSequenceNumbers.get(chatId) ?? 0) + 1;
    loadSequenceNumbers.set(chatId, nextToken);
    updateLoadingStateForChat(chatId, true);
    return nextToken;
  };
  const isCurrentLoad = (chatId: string, token: number): boolean => {
    if (!chatId || token === 0) {
      return false;
    }
    return loadSequenceNumbers.get(chatId) === token;
  };
  const completeLoadingForChat = (chatId: string, token: number) => {
    if (!chatId || token === 0) return;
    if (!isCurrentLoad(chatId, token)) {
      return;
    }
    loadSequenceNumbers.delete(chatId);
    updateLoadingStateForChat(chatId, false);
  };
  const PAGE_LIMIT = 50;

  const configuredLimit =
    options.maxMessagesPerChat ?? DEFAULT_MAX_MESSAGES_PER_CHAT;
  const maxMessagesPerChat =
    Number.isFinite(configuredLimit) && configuredLimit > 0
      ? Math.floor(configuredLimit)
      : DEFAULT_MAX_MESSAGES_PER_CHAT;

  const ensureUint8Array = (
    input?: number[] | Uint8Array | ArrayBuffer,
  ): Uint8Array | undefined => {
    if (!input) {
      return undefined;
    }
    if (input instanceof Uint8Array) {
      return input;
    }
    if (input instanceof ArrayBuffer) {
      return new Uint8Array(input);
    }
    return new Uint8Array(input);
  };

  const activeAttachmentUrls = new Set<string>();
  const pendingAttachmentFetches = new Map<string, Promise<string>>();

  type ModerationPreferences = {
    transparentEdits: boolean;
    deletedMessageDisplay: "ghost" | "tombstone";
    readReceiptsEnabled: boolean | null;
  };

  const DEFAULT_MODERATION_PREFERENCES: ModerationPreferences = {
    transparentEdits: false,
    deletedMessageDisplay: "ghost",
    readReceiptsEnabled: null,
  };

  const serverModerationPreferences = new Map<string, ModerationPreferences>();
  const channelServerIndex = new Map<string, string>();

  const normalizeModerationPreferences = (
    server: Server,
  ): ModerationPreferences => {
    const settings = server.settings ?? {};
    const transparentEdits = settings.transparentEdits === true;
    const deletedMessageDisplay =
      settings.deletedMessageDisplay === "tombstone" ? "tombstone" : "ghost";
    const readReceiptsEnabled =
      typeof settings.enableReadReceipts === "boolean"
        ? settings.enableReadReceipts
        : null;
    return { transparentEdits, deletedMessageDisplay, readReceiptsEnabled };
  };

  const rebuildModerationIndexes = (servers: Server[] | undefined) => {
    serverModerationPreferences.clear();
    channelServerIndex.clear();
    if (!Array.isArray(servers)) {
      return;
    }
    for (const server of servers) {
      serverModerationPreferences.set(
        server.id,
        normalizeModerationPreferences(server),
      );
      for (const channel of server.channels ?? []) {
        channelServerIndex.set(channel.id, server.id);
      }
    }
  };

  const resolveServerIdForChat = (chatId: string): string | null => {
    if (serverModerationPreferences.has(chatId)) {
      return chatId;
    }
    return channelServerIndex.get(chatId) ?? null;
  };

  const resolveModerationForChat = (chatId: string): ModerationPreferences => {
    const serverId = resolveServerIdForChat(chatId);
    if (!serverId) {
      return DEFAULT_MODERATION_PREFERENCES;
    }
    return (
      serverModerationPreferences.get(serverId) ??
      DEFAULT_MODERATION_PREFERENCES
    );
  };

  serverStore.subscribe(($serverState) => {
    rebuildModerationIndexes($serverState.servers);
  });

  const trackAttachmentUrl = (url?: string) => {
    if (url) {
      activeAttachmentUrls.add(url);
    }
  };

  const revokeAttachmentUrl = (url?: string) => {
    if (!url) return;
    if (activeAttachmentUrls.delete(url)) {
      URL.revokeObjectURL(url);
    }
  };

  const revokeAttachmentsForMessages = (messages: Message[]) => {
    for (const url of collectAttachmentUrlsFromMessages(messages)) {
      revokeAttachmentUrl(url);
    }
    for (const message of messages) {
      const attachments = message.attachments ?? [];
      for (const attachment of attachments) {
        pendingAttachmentFetches.delete(attachment.id);
      }
    }
  };

  const computeExpiryForTimestamp = (timestamp: string): string | undefined => {
    if (ephemeralDurationMs <= 0) {
      return undefined;
    }
    const timestampMs = Date.parse(timestamp);
    if (Number.isNaN(timestampMs)) {
      return undefined;
    }
    return new Date(timestampMs + ephemeralDurationMs).toISOString();
  };

  const ensureMessageExpiry = (message: Message): Message => {
    const computed = computeExpiryForTimestamp(message.timestamp);
    if (computed === message.expiresAt) {
      return message;
    }
    if (!computed && message.expiresAt === undefined) {
      return message;
    }
    return { ...message, expiresAt: computed };
  };

  const enforceRetention = (messages: Message[]): Message[] => {
    if (maxMessagesPerChat <= 0) {
      return messages;
    }

    const persisted = messages.filter((msg) => !msg.pending);
    if (persisted.length <= maxMessagesPerChat) {
      return messages;
    }

    const sortedPersisted = [...persisted].sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp),
    );
    const removeCount = sortedPersisted.length - maxMessagesPerChat;
    if (removeCount <= 0) {
      return messages;
    }

    const toRemove = sortedPersisted.slice(0, removeCount);
    const toRemoveIds = new Set(toRemove.map((msg) => msg.id));
    if (toRemove.length > 0) {
      revokeAttachmentsForMessages(toRemove);
    }

    return messages.filter((msg) => msg.pending || !toRemoveIds.has(msg.id));
  };

  const pendingExpiryDeletes = new Set<string>();

  const scheduleExpiryDeletion = (chatId: string, messageId: string) => {
    const key = `${chatId}:${messageId}`;
    if (pendingExpiryDeletes.has(key)) {
      return;
    }
    pendingExpiryDeletes.add(key);
    void invoke("delete_message", {
      chatId,
      chat_id: chatId,
      messageId,
      message_id: messageId,
    })
      .catch((error) => {
        console.warn("Failed to delete expired message:", error);
      })
      .finally(() => {
        pendingExpiryDeletes.delete(key);
      });
  };

  const applyPoliciesForChat = (
    candidate: Message[],
  ): { messages: Message[]; expired: Message[] } => {
    if (candidate.length === 0) {
      return { messages: candidate, expired: [] };
    }

    let mutated = false;
    const withExpiry = candidate.map((message) => {
      const next = ensureMessageExpiry(message);
      if (next !== message) {
        mutated = true;
      }
      return next;
    });

    const now = Date.now();
    const expired: Message[] = [];
    const filtered: Message[] = [];

    for (const message of withExpiry) {
      const expiresAt = message.expiresAt;
      if (message.pending || !expiresAt) {
        filtered.push(message);
        continue;
      }

      const expiryMs = Date.parse(expiresAt);
      if (!Number.isNaN(expiryMs) && expiryMs <= now) {
        expired.push(message);
        mutated = true;
        continue;
      }

      filtered.push(message);
    }

    if (expired.length > 0) {
      revokeAttachmentsForMessages(expired);
    }

    const retained = enforceRetention(filtered);
    if (retained !== filtered) {
      mutated = true;
    }

    return {
      messages: mutated ? retained : candidate,
      expired,
    };
  };

  const collectAttachmentUrlsFromMessages = (
    messages: Message[],
  ): Set<string> => {
    const urls = new Set<string>();
    for (const message of messages) {
      const attachments = message.attachments ?? [];
      for (const attachment of attachments) {
        if (attachment.objectUrl) {
          urls.add(attachment.objectUrl);
        }
      }
    }
    return urls;
  };

  const updateMessagesForChat = (
    chatId: string,
    updater: (existing: Message[]) => Message[],
  ) => {
    let expired: Message[] = [];
    messagesByChatIdStore.update((map) => {
      const existing = map.get(chatId) || [];
      const candidate = updater(existing);
      const { messages: next, expired: expiredMessages } =
        applyPoliciesForChat(candidate);
      expired = expiredMessages;

      if (next === existing) {
        return map;
      }

      const existingUrls = collectAttachmentUrlsFromMessages(existing);
      const nextUrls = collectAttachmentUrlsFromMessages(next);
      for (const url of existingUrls) {
        if (!nextUrls.has(url)) {
          revokeAttachmentUrl(url);
        }
      }

      const nextMap = new Map(map);
      nextMap.set(chatId, next);
      return nextMap;
    });

    if (expired.length > 0) {
      for (const message of expired) {
        scheduleExpiryDeletion(message.chatId, message.id);
      }
    }
  };

  const sweepExpiredMessages = () => {
    const snapshot = get(messagesByChatIdStore);
    for (const chatId of snapshot.keys()) {
      updateMessagesForChat(chatId, (existing) => existing);
    }
  };

  if (typeof setInterval === "function") {
    const SWEEP_INTERVAL_MS = 5_000;
    setInterval(sweepExpiredMessages, SWEEP_INTERVAL_MS);
  }

  settings.subscribe((value) => {
    const nextDuration = computeEphemeralDurationMs(
      value.ephemeralMessageDuration,
    );
    if (nextDuration === ephemeralDurationMs) {
      return;
    }
    ephemeralDurationMs = nextDuration;
    sweepExpiredMessages();
  });

  const shouldApplyDeletionForScope = (
    scope?: MessageDeletionScope,
  ): boolean => {
    if (!scope) {
      return true;
    }
    if (scope.type === "everyone") {
      return true;
    }
    if (scope.type === "specific-users") {
      const targetIds = (scope.user_ids ?? scope.userIds ?? []).filter(
        (value): value is string =>
          typeof value === "string" && value.length > 0,
      );
      if (targetIds.length === 0) {
        return false;
      }
      const me = get(userStore).me?.id;
      if (!me) {
        return false;
      }
      return targetIds.includes(me);
    }
    return true;
  };

  const toAttachmentMeta = (attachment: BackendAttachment): AttachmentMeta => {
    const mime =
      attachment.content_type ??
      attachment.contentType ??
      "application/octet-stream";
    const bytes = ensureUint8Array(attachment.data);
    let objectUrl: string | undefined;
    if (bytes && bytes.length > 0) {
      objectUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
      trackAttachmentUrl(objectUrl);
    }

    return {
      id: attachment.id,
      name: attachment.name,
      type: mime,
      size: attachment.size ?? bytes?.length,
      objectUrl,
      isLoaded: Boolean(objectUrl),
      isLoading: false,
      loadError: undefined,
    };
  };

  const mapAttachmentPayloads = (
    attachments?: BackendAttachment[] | null,
  ): AttachmentMeta[] => {
    if (!attachments || attachments.length === 0) {
      return [];
    }
    return attachments.map(toAttachmentMeta);
  };

  const normalizeReactions = (
    reactions?: Record<string, string[] | null | undefined> | null,
  ): Record<string, string[]> | undefined => {
    if (!reactions) {
      return undefined;
    }
    const normalized: Record<string, string[]> = {};
    for (const [emoji, users] of Object.entries(reactions)) {
      if (!users) continue;
      const filtered = users.filter(
        (user): user is string => typeof user === "string",
      );
      if (filtered.length === 0) continue;
      normalized[emoji] = Array.from(new Set(filtered));
    }
    return Object.keys(normalized).length > 0 ? normalized : undefined;
  };

  const applyReactionMutation = (
    chatId: string,
    messageId: string,
    emoji: string,
    userId: string,
    action: ReactionAction,
  ) => {
    updateMessagesForChat(chatId, (existing) =>
      existing.map((message) => {
        if (message.id !== messageId) {
          return message;
        }
        const currentUsers = new Set(message.reactions?.[emoji] ?? []);
        if (action === "add") {
          if (currentUsers.has(userId)) {
            return message;
          }
          currentUsers.add(userId);
        } else {
          if (!currentUsers.delete(userId)) {
            return message;
          }
        }

        const nextReactions = { ...(message.reactions ?? {}) };
        if (currentUsers.size === 0) {
          delete nextReactions[emoji];
        } else {
          nextReactions[emoji] = Array.from(currentUsers);
        }

        const cleaned =
          Object.keys(nextReactions).length > 0 ? nextReactions : undefined;
        return { ...message, reactions: cleaned };
      }),
    );
  };

  const normalizeTimestamp = (
    value: string | number | Date | undefined,
  ): string => {
    if (!value) {
      return new Date().toISOString();
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === "number") {
      return new Date(value).toISOString();
    }
    return new Date(value).toISOString();
  };

  const normalizeOptionalDate = (
    value: string | number | Date | null | undefined,
  ): string | undefined => {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === "number") {
      return new Date(value).toISOString();
    }
    if (typeof value === "string") {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
    return undefined;
  };

  const mapBackendMessage = async (
    message: BackendMessage,
    fallbackChatId: string,
  ): Promise<Message> => {
    const decoded = await decodeIncomingMessagePayload({
      content: message.content,
      attachments: message.attachments,
    });
    const attachments = mapAttachmentPayloads(decoded.attachments);
    const reactions = normalizeReactions(message.reactions ?? null);
    const editedAt = normalizeOptionalDate(
      message.edited_at ?? message.editedAt,
    );
    const editedBy = message.edited_by ?? message.editedBy ?? undefined;
    const timestamp = normalizeTimestamp(message.timestamp);
    const backendExpires = normalizeOptionalDate(
      message.expires_at ?? message.expiresAt,
    );
    const pinned = Boolean(message.pinned);
    const replyToMessageId =
      message.reply_to_message_id ?? message.replyToMessageId ?? undefined;
    const replySnapshotAuthor =
      message.reply_snapshot_author ?? message.replySnapshotAuthor ?? undefined;
    const replySnapshotSnippet =
      message.reply_snapshot_snippet ??
      message.replySnapshotSnippet ??
      undefined;
    const hasReplySnapshot =
      replySnapshotAuthor !== undefined || replySnapshotSnippet !== undefined;
    const replySnapshot: ReplySnapshot | undefined = hasReplySnapshot
      ? {
          author: replySnapshotAuthor ?? undefined,
          snippet: replySnapshotSnippet ?? undefined,
        }
      : undefined;

    const normalized: Message = {
      id: message.id,
      chatId: message.chat_id ?? message.chatId ?? fallbackChatId,
      senderId: message.sender_id ?? message.senderId ?? "",
      content: decoded.content,
      timestamp,
      read: message.read ?? true,
      pinned,
      pending: false,
      attachments: attachments.length > 0 ? attachments : undefined,
      reactions,
      editedAt: editedAt,
      editedBy: editedBy ?? undefined,
      expiresAt: backendExpires ?? computeExpiryForTimestamp(timestamp),
      replyToMessageId: replyToMessageId ?? undefined,
      replySnapshot,
    };
    return ensureMessageExpiry(normalized);
  };

  const isOptimisticMatch = (
    optimistic: Message,
    incoming: Message,
    selfId?: string,
  ) => {
    if (!optimistic.pending) return false;
    if (selfId && optimistic.senderId !== selfId) return false;
    if (optimistic.senderId !== incoming.senderId) return false;
    if (optimistic.content !== incoming.content) return false;
    if (optimistic.replyToMessageId !== incoming.replyToMessageId) return false;
    const optimisticAttachments = optimistic.attachments?.length ?? 0;
    const incomingAttachments = incoming.attachments?.length ?? 0;
    if (optimisticAttachments > 0 && incomingAttachments > 0) {
      return optimisticAttachments === incomingAttachments;
    }
    return true;
  };

  const mergeOptimisticDetails = (incoming: Message, optimistic?: Message) => {
    if (!optimistic) {
      return { ...incoming, pending: false };
    }

    const merged: Message = {
      ...incoming,
      pending: false,
    };

    if (!merged.replyToMessageId && optimistic.replyToMessageId) {
      merged.replyToMessageId = optimistic.replyToMessageId;
    }

    if (!merged.replySnapshot && optimistic.replySnapshot) {
      merged.replySnapshot = optimistic.replySnapshot;
    }

    if (
      (!merged.attachments || merged.attachments.length === 0) &&
      optimistic.attachments &&
      optimistic.attachments.length > 0
    ) {
      merged.attachments = optimistic.attachments;
    }

    if (
      (!merged.reactions || Object.keys(merged.reactions).length === 0) &&
      optimistic.reactions &&
      Object.keys(optimistic.reactions).length > 0
    ) {
      merged.reactions = optimistic.reactions;
    }

    return merged;
  };

  const insertRealtimeMessage = (
    existing: Message[],
    incoming: Message,
    selfId?: string,
  ) => {
    const normalized = ensureMessageExpiry({ ...incoming, pending: false });
    const updated = [...existing];

    const existingIndex = updated.findIndex(
      (msg) => !msg.pending && msg.id === normalized.id,
    );
    if (existingIndex !== -1) {
      updated[existingIndex] = normalized;
      return updated;
    }

    if (selfId && normalized.senderId === selfId) {
      const pendingIndex = updated.findIndex((msg) =>
        isOptimisticMatch(msg, normalized, selfId),
      );
      if (pendingIndex !== -1) {
        const merged = mergeOptimisticDetails(
          normalized,
          updated[pendingIndex],
        );
        updated[pendingIndex] = merged;
        return updated;
      }
    }

    updated.push(normalized);
    return updated;
  };

  const setActiveChat = async (
    chatId: string,
    type: "dm" | "server" | "group",
    channelId?: string,
    options?: {
      forceRefresh?: boolean;
    },
  ) => {
    let resolvedChannelId: string | null = null;
    if (type === "server") {
      resolvedChannelId = channelId ?? null;
      if (!resolvedChannelId) {
        resolvedChannelId =
          get(serverChannelSelectionsStore).get(chatId) ?? null;
      }
      serverChannelSelectionsStore.update((map) => {
        const next = new Map(map);
        if (resolvedChannelId) {
          next.set(chatId, resolvedChannelId);
        } else {
          next.delete(chatId);
        }
        persistServerChannelSelections(next);
        return next;
      });
    }

    activeChatId.set(chatId);
    activeChatType.set(type);
    activeChannelId.set(resolvedChannelId);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("activeChatId", chatId);
      localStorage.setItem("activeChatType", type);
      localStorage.removeItem("activeChannelId");
    }
    const messageChatId = type === "server" ? resolvedChannelId : chatId;
    if (messageChatId) {
      typingDispatchState.delete(messageChatId);
    }
    if (messageChatId) {
      const existingMessages =
        get(messagesByChatIdStore).get(messageChatId) || [];
      const hasCachedPersistedMessages = existingMessages.some(
        (msg) => !msg.pending,
      );
      const forceRefresh = options?.forceRefresh ?? false;
      const shouldFetch = forceRefresh || !hasCachedPersistedMessages;

      if (!shouldFetch) {
        updateLoadingStateForChat(messageChatId, false);
        return;
      }

      if (existingMessages.length === 0) {
        hasMoreByChatIdStore.update((map) => {
          map.set(messageChatId, true);
          return new Map(map);
        });
      }

      const loadToken = beginLoadingForChat(messageChatId);
      try {
        const fetched: BackendMessage[] = await invoke("get_messages", {
          chatId: messageChatId,
          chat_id: messageChatId,
          limit: PAGE_LIMIT,
          offset: 0,
        });
        if (!isCurrentLoad(messageChatId, loadToken)) {
          return;
        }
        const mapped = (
          await Promise.all(
            fetched.map((m: BackendMessage) =>
              mapBackendMessage(m, messageChatId),
            ),
          )
        ).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        handleMessagesUpdate(messageChatId, mapped);
        const updatedMessages =
          get(messagesByChatIdStore).get(messageChatId) || [];
        const persistedCount = updatedMessages.filter(
          (msg) => !msg.pending,
        ).length;
        const limitReached =
          maxMessagesPerChat > 0 && persistedCount >= maxMessagesPerChat;
        hasMoreByChatIdStore.update((map) => {
          map.set(messageChatId, !limitReached && fetched.length >= PAGE_LIMIT);
          return new Map(map);
        });
      } catch (e) {
        console.error("Failed to fetch messages:", e);
      } finally {
        completeLoadingForChat(messageChatId, loadToken);
      }
    }
  };

  const handleMessagesUpdate = (chatId: string, messages: Message[]) => {
    const selfId = get(userStore).me?.id;
    updateMessagesForChat(chatId, (existing) => {
      const usedPendingIds = new Set<string>();
      const persistedExisting = existing.filter((msg) => !msg.pending);
      const normalized = messages.map((incoming) => {
        const optimisticMatch = existing.find(
          (msg) =>
            isOptimisticMatch(msg, incoming, selfId) &&
            !usedPendingIds.has(msg.id),
        );
        if (optimisticMatch) {
          usedPendingIds.add(optimisticMatch.id);
        }
        return mergeOptimisticDetails(incoming, optimisticMatch);
      });
      const seenIds = new Set<string>();
      const deduped: Message[] = [];
      for (const msg of normalized) {
        if (seenIds.has(msg.id)) continue;
        seenIds.add(msg.id);
        deduped.push({ ...msg, pending: false });
      }
      const persistedById = new Map(
        persistedExisting.map((msg) => [msg.id, { ...msg, pending: false }]),
      );
      for (const msg of deduped) {
        persistedById.set(msg.id, msg);
      }
      const mergedPersisted = Array.from(persistedById.values()).sort((a, b) =>
        a.timestamp.localeCompare(b.timestamp),
      );
      const remainingPending = existing.filter(
        (msg) => msg.pending && !usedPendingIds.has(msg.id),
      );
      return [...mergedPersisted, ...remainingPending];
    });
  };

  const loadMoreMessages = async (targetChatId: string) => {
    if (loadSequenceNumbers.has(targetChatId)) {
      return;
    }
    const current = get(messagesByChatIdStore).get(targetChatId) || [];
    const persistedCount = current.filter((m) => !m.pending).length;
    if (maxMessagesPerChat > 0 && persistedCount >= maxMessagesPerChat) {
      hasMoreByChatIdStore.update((map) => {
        map.set(targetChatId, false);
        return new Map(map);
      });
      updateLoadingStateForChat(targetChatId, false);
      return;
    }

    const loadToken = beginLoadingForChat(targetChatId);
    try {
      const fetched: BackendMessage[] = await invoke("get_messages", {
        chatId: targetChatId,
        chat_id: targetChatId,
        limit: PAGE_LIMIT,
        offset: persistedCount,
      });
      if (!isCurrentLoad(targetChatId, loadToken)) {
        return;
      }
      const mapped = (
        await Promise.all(
          fetched.map((m: BackendMessage) =>
            mapBackendMessage(m, targetChatId),
          ),
        )
      ).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      let newAdds = 0;
      const selfId = get(userStore).me?.id;
      updateMessagesForChat(targetChatId, (existing) => {
        const seen = new Set(
          existing.filter((msg) => !msg.pending).map((msg) => msg.id),
        );
        const matchedPendingIds = new Set<string>();
        const deduped: Message[] = [];
        for (const incoming of mapped) {
          if (seen.has(incoming.id)) {
            continue;
          }
          const optimisticMatch = existing.find(
            (msg) =>
              msg.pending &&
              !matchedPendingIds.has(msg.id) &&
              isOptimisticMatch(msg, incoming, selfId),
          );
          const normalized = mergeOptimisticDetails(incoming, optimisticMatch);
          if (optimisticMatch) {
            matchedPendingIds.add(optimisticMatch.id);
          }
          seen.add(normalized.id);
          deduped.push(normalized);
        }
        deduped.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        newAdds = deduped.length;
        const persistedExisting = existing.filter((msg) => !msg.pending);
        const remainingPending = existing.filter(
          (msg) => msg.pending && !matchedPendingIds.has(msg.id),
        );
        return [...deduped, ...persistedExisting, ...remainingPending];
      });
      const updatedMessages =
        get(messagesByChatIdStore).get(targetChatId) || [];
      const updatedPersisted = updatedMessages.filter(
        (msg) => !msg.pending,
      ).length;
      const limitReached =
        maxMessagesPerChat > 0 && updatedPersisted >= maxMessagesPerChat;
      hasMoreByChatIdStore.update((map) => {
        const hasMore =
          !limitReached && fetched.length >= PAGE_LIMIT && newAdds > 0;
        map.set(targetChatId, hasMore);
        return new Map(map);
      });
    } catch (e) {
      console.error("Failed to load more messages:", e);
    } finally {
      completeLoadingForChat(targetChatId, loadToken);
    }
  };

  const loadAttachmentForMessage = async (
    chatId: string,
    messageId: string,
    attachmentId: string,
  ): Promise<string> => {
    const currentMessages = get(messagesByChatIdStore).get(chatId) || [];
    const message = currentMessages.find((m) => m.id === messageId);
    if (!message) {
      throw new Error("Message not found for attachment fetch");
    }

    const attachment = message.attachments?.find(
      (item) => item.id === attachmentId,
    );
    if (!attachment) {
      throw new Error("Attachment not found in message");
    }

    if (attachment.isLoaded && attachment.objectUrl) {
      return attachment.objectUrl;
    }

    const inFlight = pendingAttachmentFetches.get(attachmentId);
    if (inFlight) {
      return inFlight;
    }

    updateMessagesForChat(chatId, (existing) =>
      existing.map((msg) => {
        if (msg.id !== messageId || !msg.attachments) {
          return msg;
        }
        const nextAttachments = msg.attachments.map((meta) => {
          if (meta.id !== attachmentId) {
            return meta;
          }
          return {
            ...meta,
            isLoading: true,
            loadError: undefined,
          };
        });
        return { ...msg, attachments: nextAttachments };
      }),
    );

    const fetchPromise = (async () => {
      try {
        const rawBytes = await invoke<number[] | Uint8Array>(
          "get_attachment_bytes",
          {
            attachmentId,
            attachment_id: attachmentId,
          },
        );
        const bytes = ensureUint8Array(rawBytes);
        if (!bytes || bytes.length === 0) {
          throw new Error("Attachment data was empty");
        }
        const mime = attachment.type || "application/octet-stream";
        const objectUrl = URL.createObjectURL(
          new Blob([bytes], { type: mime }),
        );
        trackAttachmentUrl(objectUrl);
        updateMessagesForChat(chatId, (existing) =>
          existing.map((msg) => {
            if (msg.id !== messageId || !msg.attachments) {
              return msg;
            }
            const nextAttachments = msg.attachments.map((meta) => {
              if (meta.id !== attachmentId) {
                return meta;
              }
              return {
                ...meta,
                objectUrl,
                size:
                  typeof meta.size === "number" && meta.size > 0
                    ? meta.size
                    : bytes.length,
                isLoaded: true,
                isLoading: false,
                loadError: undefined,
              };
            });
            return { ...msg, attachments: nextAttachments };
          }),
        );
        return objectUrl;
      } catch (error) {
        const messageText =
          error instanceof Error ? error.message : String(error);
        updateMessagesForChat(chatId, (existing) =>
          existing.map((msg) => {
            if (msg.id !== messageId || !msg.attachments) {
              return msg;
            }
            const nextAttachments = msg.attachments.map((meta) => {
              if (meta.id !== attachmentId) {
                return meta;
              }
              return {
                ...meta,
                isLoaded: false,
                isLoading: false,
                loadError: messageText,
              };
            });
            return { ...msg, attachments: nextAttachments };
          }),
        );
        throw error;
      } finally {
        pendingAttachmentFetches.delete(attachmentId);
      }
    })();

    pendingAttachmentFetches.set(attachmentId, fetchPromise);
    return fetchPromise;
  };

  const buildReplyMetadataPayload = (options?: SendMessageOptions) => {
    if (!options?.replyToMessageId) {
      return {};
    }

    const payload: Record<string, unknown> = {
      replyToMessageId: options.replyToMessageId,
      reply_to_message_id: options.replyToMessageId,
    };

    const snapshot = options.replySnapshot;
    if (snapshot?.author) {
      payload.replySnapshotAuthor = snapshot.author;
      payload.reply_snapshot_author = snapshot.author;
    }
    if (snapshot?.snippet) {
      payload.replySnapshotSnippet = snapshot.snippet;
      payload.reply_snapshot_snippet = snapshot.snippet;
    }

    return payload;
  };

  const sendMessage = async (
    content: string,
    options: SendMessageOptions = {},
  ) => {
    const type = get(activeChatType);
    const chatId = get(activeChatId);
    const channelId = get(activeChannelId);
    const me = get(userStore).me;

    if (!type || !chatId || !me) return;

    const messageChatId = type === "server" ? channelId : chatId;
    if (!messageChatId) return;

    const tempId = Date.now().toString();
    const timestamp = new Date().toISOString();
    const optimisticExpiresAt = computeExpiryForTimestamp(timestamp);
    const newMessage: Message = {
      id: tempId,
      chatId: messageChatId,
      senderId: me.id,
      content: content,
      timestamp,
      read: true,
      pinned: false,
      pending: true,
      expiresAt: optimisticExpiresAt,
      replyToMessageId: options.replyToMessageId,
      replySnapshot: options.replySnapshot,
    };

    updateMessagesForChat(messageChatId, (existing) => [
      ...existing,
      newMessage,
    ]);

    const plaintextContent = content;
    const replyPayload = buildReplyMetadataPayload(options);
    let encryptedFailed = false;
    let backendContent = plaintextContent;
    try {
      const encrypted = await encryptOutgoingMessagePayload({
        content,
        attachments: [],
        chatType: type,
        chatId,
        channelId: channelId,
        senderId: me.id,
        recipientId: type === "dm" ? chatId : null,
      });
      backendContent = encrypted.wasEncrypted ? encrypted.content : content;
    } catch (error) {
      console.warn("Message content encryption failed, using plaintext", error);
      backendContent = plaintextContent;
    }
    try {
      if (type === "dm") {
        await invoke("send_encrypted_dm", {
          message: backendContent,
          recipientId: chatId,
          recipient_id: chatId,
          expiresAt: optimisticExpiresAt,
          expires_at: optimisticExpiresAt,
          ...replyPayload,
        });
      } else {
        await invoke("send_encrypted_group_message", {
          message: backendContent,
          channelId: channelId,
          channel_id: channelId,
          serverId: chatId,
          server_id: chatId,
          expiresAt: optimisticExpiresAt,
          expires_at: optimisticExpiresAt,
          ...replyPayload,
        });
      }
    } catch (error) {
      encryptedFailed = true;
      console.warn(
        "Encrypted send failed, attempting plaintext fallback",
        error,
      );
      try {
        if (type === "dm") {
          await invoke("send_direct_message", {
            message: plaintextContent,
            recipientId: chatId,
            recipient_id: chatId,
            expiresAt: optimisticExpiresAt,
            expires_at: optimisticExpiresAt,
            ...replyPayload,
          });
        } else {
          await invoke("send_message", {
            message: plaintextContent,
            channelId: channelId,
            channel_id: channelId,
            serverId: chatId,
            server_id: chatId,
            expiresAt: optimisticExpiresAt,
            expires_at: optimisticExpiresAt,
            ...replyPayload,
          });
        }
      } catch (fallbackError) {
        console.error("Failed to send message:", fallbackError);
        updateMessagesForChat(messageChatId, (existing) =>
          existing.filter((msg) => msg.id !== tempId),
        );
        throw fallbackError;
      }
    }

    if (encryptedFailed) {
      console.info(
        "Sent plaintext message after encryption fallback for",
        messageChatId,
      );
    }
  };

  const createOptimisticAttachmentId = () => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `att-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  };

  const sendMessageWithAttachments = async (
    content: string,
    files: File[],
    options: SendMessageOptions = {},
  ) => {
    const type = get(activeChatType);
    const chatId = get(activeChatId);
    const channelId = get(activeChannelId);
    const me = get(userStore).me;

    if (!type || !chatId || !me) return;
    const messageChatId = type === "server" ? channelId : chatId;
    if (!messageChatId) return;

    const voiceMemosAllowed = get(settings).enableWalkieTalkieVoiceMemos;
    const filesToProcess = voiceMemosAllowed
      ? files
      : files.filter((file) => !isVoiceMemoFile(file));

    if (!voiceMemosAllowed && filesToProcess.length !== files.length) {
      if (filesToProcess.length === 0) {
        const trimmed = content.trim();
        if (trimmed.length === 0) {
          return;
        }
        await sendMessage(trimmed, options);
        return;
      }
    }

    const tempId = Date.now().toString() + "-a";
    const timestamp = new Date().toISOString();

    const attachmentsCombined = await Promise.all(
      filesToProcess.map(
        async (
          file,
        ): Promise<{
          backend: MessageAttachmentPayload;
          ui: AttachmentMeta;
        }> => {
          const buffer = await file.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          const mime = file.type || "application/octet-stream";
          const url = URL.createObjectURL(file);
          trackAttachmentUrl(url);
          return {
            backend: {
              name: file.name,
              type: mime,
              size: file.size,
              data: bytes,
            },
            ui: {
              id: createOptimisticAttachmentId(),
              name: file.name,
              type: mime,
              size: file.size,
              objectUrl: url,
              isLoaded: true,
              isLoading: false,
              loadError: undefined,
            } satisfies AttachmentMeta,
          };
        },
      ),
    );

    const backendAttachments = attachmentsCombined.map(
      (entry) => entry.backend,
    );
    const plaintextContent = content;
    const plaintextAttachments = backendAttachments.map((attachment) => ({
      ...attachment,
    }));
    let contentForSend = plaintextContent;
    let attachmentsForSend = backendAttachments;
    try {
      const encrypted = await encryptOutgoingMessagePayload({
        content,
        attachments: backendAttachments,
        chatType: type,
        chatId,
        channelId: channelId,
        senderId: me.id,
        recipientId: type === "dm" ? chatId : null,
      });
      if (!encrypted.wasEncrypted) {
        throw new Error("Attachment payload returned without encryption");
      }
      contentForSend = encrypted.content;
      attachmentsForSend = encrypted.attachments;
    } catch (error) {
      console.error("Attachment encryption failed", error);
      updateMessagesForChat(messageChatId, (existing) =>
        existing.filter((msg) => msg.id !== tempId),
      );
      throw error instanceof Error ? error : new Error(String(error));
    }
    const optimisticAttachments = attachmentsCombined.map((entry) => entry.ui);

    const newMessageTimestamp = timestamp;
    const optimisticExpiresAt = computeExpiryForTimestamp(newMessageTimestamp);
    const newMessage: Message = {
      id: tempId,
      chatId: messageChatId,
      senderId: me.id,
      content: content,
      timestamp: newMessageTimestamp,
      read: true,
      pinned: false,
      attachments:
        optimisticAttachments.length > 0 ? optimisticAttachments : undefined,
      pending: true,
      expiresAt: optimisticExpiresAt,
      replyToMessageId: options.replyToMessageId,
      replySnapshot: options.replySnapshot,
    };
    updateMessagesForChat(messageChatId, (existing) => [
      ...existing,
      newMessage,
    ]);

    let encryptedFailed = false;
    const replyPayload = buildReplyMetadataPayload(options);
    try {
      if (type === "dm") {
        try {
          await invoke("send_encrypted_dm_with_attachments", {
            message: contentForSend,
            recipientId: chatId,
            recipient_id: chatId,
            expiresAt: optimisticExpiresAt,
            expires_at: optimisticExpiresAt,
            attachments: attachmentsForSend,
            ...replyPayload,
          });
        } catch (error) {
          encryptedFailed = true;
          console.warn(
            "Encrypted attachment send failed, attempting plaintext fallback",
            error,
          );
          await invoke("send_direct_message_with_attachments", {
            message: plaintextContent,
            recipientId: chatId,
            recipient_id: chatId,
            expiresAt: optimisticExpiresAt,
            expires_at: optimisticExpiresAt,
            attachments: plaintextAttachments,
            ...replyPayload,
          });
        }
      } else {
        await invoke("send_message_with_attachments", {
          message: contentForSend,
          attachments: attachmentsForSend,
          channelId: channelId,
          channel_id: channelId,
          serverId: chatId,
          server_id: chatId,
          expiresAt: optimisticExpiresAt,
          expires_at: optimisticExpiresAt,
          ...replyPayload,
        });
      }
    } catch (error) {
      console.error("Failed to send message with attachments:", error);
      updateMessagesForChat(messageChatId, (existing) =>
        existing.filter((msg) => msg.id !== tempId),
      );
      throw error instanceof Error ? error : new Error(String(error));
    }

    if (encryptedFailed) {
      console.info(
        "Sent plaintext attachments after encryption fallback for",
        messageChatId,
      );
    }
  };

  const deleteMessage = async (targetChatId: string, messageId: string) => {
    const preferences = resolveModerationForChat(targetChatId);
    const showTombstone = preferences.deletedMessageDisplay === "tombstone";
    let previous: Message | undefined;

    if (showTombstone) {
      updateMessagesForChat(targetChatId, (existing) =>
        existing.map((message) => {
          if (message.id !== messageId) {
            return message;
          }
          previous = message;
          return {
            ...message,
            content: "",
            attachments: undefined,
            reactions: undefined,
            deleted: true,
            deletedAt: new Date().toISOString(),
            deletedBy: get(userStore).me?.id,
          };
        }),
      );

      if (!previous) {
        return;
      }
    } else {
      updateMessagesForChat(targetChatId, (existing) =>
        existing.filter((m) => m.id !== messageId),
      );
    }

    try {
      await invoke("delete_message", {
        chatId: targetChatId,
        chat_id: targetChatId,
        messageId,
        message_id: messageId,
      });
      if (showTombstone && previous) {
        revokeAttachmentsForMessages([previous]);
      }
    } catch (e) {
      if (showTombstone && previous) {
        updateMessagesForChat(targetChatId, (existing) =>
          existing.map((message) =>
            message.id === messageId ? previous! : message,
          ),
        );
      }
      console.error("Failed to delete message:", e);
    }
  };

  const pinMessage = async (targetChatId: string, messageId: string) => {
    let previous: Message | undefined;
    let found = false;
    updateMessagesForChat(targetChatId, (existing) =>
      existing.map((message) => {
        if (message.id !== messageId) {
          return message;
        }
        found = true;
        previous = message;
        return { ...message, pinned: true };
      }),
    );

    if (!found) {
      throw new Error("Message not found");
    }

    try {
      await invoke("pin_message", {
        chatId: targetChatId,
        chat_id: targetChatId,
        messageId,
        message_id: messageId,
      });
    } catch (error) {
      if (previous) {
        updateMessagesForChat(targetChatId, (existing) =>
          existing.map((message) =>
            message.id === messageId ? previous! : message,
          ),
        );
      }
      throw error instanceof Error ? error : new Error(String(error));
    }
  };

  const unpinMessage = async (targetChatId: string, messageId: string) => {
    let previous: Message | undefined;
    let found = false;
    updateMessagesForChat(targetChatId, (existing) =>
      existing.map((message) => {
        if (message.id !== messageId) {
          return message;
        }
        found = true;
        previous = message;
        return { ...message, pinned: false };
      }),
    );

    if (!found) {
      throw new Error("Message not found");
    }

    try {
      await invoke("unpin_message", {
        chatId: targetChatId,
        chat_id: targetChatId,
        messageId,
        message_id: messageId,
      });
    } catch (error) {
      if (previous) {
        updateMessagesForChat(targetChatId, (existing) =>
          existing.map((message) =>
            message.id === messageId ? previous! : message,
          ),
        );
      }
      throw error instanceof Error ? error : new Error(String(error));
    }
  };

  const editMessage = async (
    targetChatId: string,
    messageId: string,
    content: string,
  ) => {
    const me = get(userStore).me;
    if (!me) {
      throw new Error("Cannot edit message without a logged in user");
    }

    const trimmed = content.trim();
    if (!trimmed) {
      throw new Error("Message content cannot be empty");
    }

    const optimisticTimestamp = new Date().toISOString();
    const preferences = resolveModerationForChat(targetChatId);
    let previous: Message | undefined;
    let found = false;
    updateMessagesForChat(targetChatId, (existing) =>
      existing.map((message) => {
        if (message.id !== messageId) {
          return message;
        }
        found = true;
        previous = message;
        const shouldTrackHistory =
          preferences.transparentEdits &&
          typeof message.content === "string" &&
          message.content.length > 0 &&
          message.content !== trimmed;
        const nextHistory = shouldTrackHistory
          ? [...(message.editHistory ?? []), message.content]
          : message.editHistory;
        return {
          ...message,
          content: trimmed,
          editedAt: optimisticTimestamp,
          editedBy: me.id,
          editHistory: nextHistory,
        };
      }),
    );

    if (!found) {
      throw new Error("Message not found");
    }

    try {
      await invoke("edit_message", {
        chatId: targetChatId,
        chat_id: targetChatId,
        messageId,
        message_id: messageId,
        content: trimmed,
      });
    } catch (error) {
      if (previous) {
        updateMessagesForChat(targetChatId, (existing) =>
          existing.map((message) =>
            message.id === messageId ? previous! : message,
          ),
        );
      }
      throw error;
    }
  };

  const refreshChatMessages = async (chatId: string) => {
    const loadToken = beginLoadingForChat(chatId);
    try {
      const fetched: BackendMessage[] = await invoke("get_messages", {
        chatId,
        chat_id: chatId,
        limit: PAGE_LIMIT,
        offset: 0,
      });
      if (!isCurrentLoad(chatId, loadToken)) {
        return;
      }
      const mapped = (
        await Promise.all(
          fetched.map((m: BackendMessage) => mapBackendMessage(m, chatId)),
        )
      ).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      handleMessagesUpdate(chatId, mapped);
      hasMoreByChatIdStore.update((map) => {
        map.set(chatId, fetched.length >= PAGE_LIMIT);
        return new Map(map);
      });
    } catch (error) {
      console.error("Failed to refresh chat messages:", error);
    } finally {
      completeLoadingForChat(chatId, loadToken);
    }
  };

  const refreshChatFromStorage = async (
    chatId: string,
    chatType: "dm" | "server" | "group",
    channelId?: string | null,
  ) => {
    if (!chatId) {
      return;
    }

    if (chatType === "server") {
      const resolvedChannelId =
        channelId ?? get(serverChannelSelectionsStore).get(chatId) ?? null;
      if (!resolvedChannelId) {
        return;
      }
      await refreshChatMessages(resolvedChannelId);
      return;
    }

    await refreshChatMessages(chatId);
  };

  const normalizeWindowFocus = () => {
    if (typeof document === "undefined") {
      return true;
    }

    try {
      if (typeof document.hasFocus === "function") {
        return document.hasFocus();
      }
    } catch (error) {
      console.debug("document.hasFocus() threw", error);
    }

    const anyDocument = document as Document & {
      visibilityState?: string;
      hidden?: boolean;
    };

    if (typeof anyDocument.visibilityState === "string") {
      return anyDocument.visibilityState === "visible";
    }

    if (typeof anyDocument.hidden === "boolean") {
      return !anyDocument.hidden;
    }

    return true;
  };

  const buildNotificationPreview = (
    content: string,
    attachments?: BackendAttachment[] | null,
  ): string => {
    const normalized = content.replace(/\s+/g, " ").trim();
    if (normalized.length > 0) {
      return normalized;
    }

    const attachmentCount = attachments?.length ?? 0;
    if (attachmentCount === 0) {
      return "New message";
    }

    if (attachmentCount === 1) {
      const attachmentName = attachments?.[0]?.name?.trim();
      if (attachmentName && attachmentName.length > 0) {
        return `Sent an attachment (${attachmentName})`;
      }
      return "Sent an attachment";
    }

    return `Sent ${attachmentCount} attachments`;
  };

  const resolveSenderLabel = (senderId: string): string => {
    const friendsState = get(friendStore);
    const friendMatch = friendsState.friends?.find(
      (friend) => friend.id === senderId,
    );
    if (friendMatch?.name) {
      return friendMatch.name;
    }

    const servers = get(serverStore).servers ?? [];
    for (const server of servers) {
      const memberMatch = server.members?.find(
        (member) => member.id === senderId,
      );
      if (memberMatch?.name) {
        return memberMatch.name;
      }
    }

    return senderId && senderId.length > 0 ? senderId : "Unknown sender";
  };

  const formatChatLabel = (
    targetChatId: string,
    channelIdFromPayload: string | null,
    serverIdFromPayload: string | null,
  ): { label: string; type: "direct" | "group" | "server" } => {
    const servers = get(serverStore).servers ?? [];
    const groups = get(groupChatsStore);
    const groupSummary = groups.get(targetChatId);
    const server = serverIdFromPayload
      ? servers.find((entry) => entry.id === serverIdFromPayload)
      : undefined;

    if (serverIdFromPayload && (channelIdFromPayload || targetChatId)) {
      const channelIdentifier = channelIdFromPayload ?? targetChatId;
      const channel = server?.channels?.find(
        (entry) => entry.id === channelIdentifier,
      );
      const channelName = channel?.name ?? channelIdentifier ?? "channel";
      const normalizedChannelName = channelName.startsWith("#")
        ? channelName
        : `#${channelName}`;
      if (server?.name) {
        return {
          label: `${normalizedChannelName} — ${server.name}`,
          type: "server",
        };
      }
      return { label: normalizedChannelName, type: "server" };
    }

    if (groupSummary) {
      return { label: groupSummary.name, type: "group" };
    }

    return { label: "Direct message", type: "direct" };
  };

  const handleNewMessageEvent = async (message: ChatMessage) => {
    const { sender } = message;
    const decoded = await decodeIncomingMessagePayload({
      content: message.content,
      attachments: message.attachments,
    });
    const channelIdFromPayload =
      message.channel_id ?? message.channelId ?? null;
    const conversationId = message.conversation_id ?? message.conversationId;
    const serverIdFromPayload = message.server_id ?? message.serverId ?? null;
    const me = get(userStore).me;

    let targetChatId: string | null = null;
    if (conversationId) {
      targetChatId = conversationId;
    } else if (channelIdFromPayload) {
      targetChatId = channelIdFromPayload;
    } else {
      targetChatId = sender;
    }

    if (!targetChatId) {
      return;
    }

    const messageIdFromPayload =
      message.id ?? message.message_id ?? message.messageId;
    const timestampFromPayload = message.timestamp;
    const isMissingMetadata = !messageIdFromPayload || !timestampFromPayload;
    const isSelfAuthored = sender === me?.id;

    const replyToMessageId =
      message.reply_to_message_id ?? message.replyToMessageId ?? undefined;
    const replySnapshotAuthor =
      message.reply_snapshot_author ?? message.replySnapshotAuthor ?? undefined;
    const replySnapshotSnippet =
      message.reply_snapshot_snippet ??
      message.replySnapshotSnippet ??
      undefined;
    const hasReplySnapshot =
      replySnapshotAuthor !== undefined || replySnapshotSnippet !== undefined;
    const replySnapshot: ReplySnapshot | undefined = hasReplySnapshot
      ? {
          author: replySnapshotAuthor ?? undefined,
          snippet: replySnapshotSnippet ?? undefined,
        }
      : undefined;

    const newMessage: Message = {
      id: messageIdFromPayload ?? `temp-${Date.now().toString()}`,
      chatId: targetChatId,
      senderId: sender,
      content: decoded.content,
      timestamp: normalizeTimestamp(timestampFromPayload),
      read: sender === me?.id,
      pinned: Boolean((message as BackendMessage).pinned),
      attachments:
        decoded.attachments && decoded.attachments.length > 0
          ? mapAttachmentPayloads(decoded.attachments)
          : undefined,
      reactions: normalizeReactions(message.reactions ?? null),
      expiresAt: undefined,
      isSpamFlagged: false,
      spamMuted: false,
      replyToMessageId,
      replySnapshot,
    };
    newMessage.expiresAt = computeExpiryForTimestamp(newMessage.timestamp);

    let suppressedBySpam = false;

    if (!isSelfAuthored) {
      const existingMute = mutedFriendsStore.isMuted(sender);
      newMessage.spamMuted = existingMute;
      if (existingMute) {
        newMessage.spamDecision = newMessage.spamDecision ?? "muted";
      }

      if (
        typeof decoded.content === "string" &&
        decoded.content.trim().length > 0
      ) {
        try {
          const classification = await spamClassifier.scoreText(
            decoded.content,
            {
              context: "message",
              subjectId: sender,
            },
          );
          newMessage.spamScore = classification.score;
          newMessage.isSpamFlagged = classification.flagged;
          newMessage.spamReasons = classification.reasons;

          if (classification.autoMuted && !existingMute) {
            mutedFriendsStore.mute(sender);
            newMessage.spamMuted = true;
            newMessage.spamDecision = "auto-muted";
            suppressedBySpam = true;
            if (me?.id && sender !== me.id) {
              try {
                await invoke("mute_user", {
                  current_user_id: me.id,
                  target_user_id: sender,
                  muted: true,
                  spam_score: classification.score,
                });
              } catch (error) {
                console.warn("Failed to log auto mute", error);
              }
            }
          } else {
            if (
              classification.flagged &&
              newMessage.spamDecision !== "allowed"
            ) {
              newMessage.spamDecision =
                newMessage.spamDecision ?? (existingMute ? "muted" : "flagged");
              suppressedBySpam = true;
            } else if (existingMute) {
              suppressedBySpam = true;
            }
          }
        } catch (error) {
          console.warn("Failed to score message for spam", error);
          suppressedBySpam = suppressedBySpam || existingMute;
        }
      } else if (existingMute) {
        suppressedBySpam = true;
      }
    }

    updateMessagesForChat(targetChatId, (existing) =>
      insertRealtimeMessage(existing, newMessage, me?.id),
    );

    if (!isSelfAuthored) {
      const currentSettings = get(settings);
      const { label, type } = formatChatLabel(
        targetChatId,
        channelIdFromPayload,
        serverIdFromPayload,
      );
      const notificationsEnabled =
        type === "direct"
          ? currentSettings.enableNewMessageNotifications
          : currentSettings.enableGroupMessageNotifications;

      if (notificationsEnabled && !suppressedBySpam) {
        const activeType = get(activeChatType);
        const activeId = get(activeChatId);
        const activeChannel = get(activeChannelId);
        const activeMessageChatId =
          activeType === "server" ? activeChannel : activeId;
        const isSameChat = activeMessageChatId === targetChatId;
        const windowFocused = normalizeWindowFocus();

        if (!isSameChat || !windowFocused) {
          const preview = buildNotificationPreview(
            decoded.content,
            decoded.attachments,
          );
          const senderLabel = resolveSenderLabel(sender);
          const soundSetting = currentSettings.notificationSound?.trim();
          const sound =
            soundSetting && soundSetting.toLowerCase() !== "none"
              ? soundSetting
              : undefined;

          if (type === "direct") {
            void showNativeNotification({
              title: `${label} from ${senderLabel}`,
              body: preview,
              sound,
            });
          } else {
            void showNativeNotification({
              title: label,
              body: `${senderLabel}: ${preview}`,
              sound,
            });
          }
        }
      }
    }

    if (isMissingMetadata) {
      void refreshChatMessages(targetChatId);
    }
  };

  const handleReactionUpdate = (payload: MessageReaction) => {
    const chatId = payload.chat_id ?? payload.chatId;
    const messageId = payload.message_id ?? payload.messageId;
    const userId = payload.user_id ?? payload.userId;
    if (!chatId || !messageId || !userId || !payload.emoji) {
      return;
    }

    const action = payload.action;
    if (action !== "add" && action !== "remove") {
      return;
    }

    applyReactionMutation(chatId, messageId, payload.emoji, userId, action);
  };

  const handleReadReceipt = (payload: MessageReadReceiptEvent) => {
    const chatId = normalizeEventId(payload.chat_id ?? payload.chatId);
    const messageId = normalizeEventId(payload.message_id ?? payload.messageId);
    if (!chatId || !messageId) {
      return;
    }

    updateMessagesForChat(chatId, (existing) => {
      let mutated = false;
      const next = existing.map((message) => {
        if (message.id !== messageId) {
          return message;
        }
        if (message.read) {
          return message;
        }
        mutated = true;
        return { ...message, read: true };
      });
      return mutated ? next : existing;
    });
  };

  const handleTypingIndicator = (payload: TypingIndicatorEvent) => {
    const chatId = normalizeEventId(payload.chat_id ?? payload.chatId);
    const userId = normalizeEventId(payload.user_id ?? payload.userId);
    if (!chatId || !userId) {
      return;
    }
    const isTyping = Boolean(payload.is_typing ?? payload.isTyping);
    const meId = get(userStore).me?.id;
    if (meId && userId === meId) {
      return;
    }

    if (isTyping) {
      mutateTypingUsers(chatId, (set) => {
        set.add(userId);
      });
      scheduleTypingTimeout(chatId, userId);
    } else {
      clearTypingTimeout(chatId, userId);
      mutateTypingUsers(chatId, (set) => {
        set.delete(userId);
      });
    }
  };

  const markActiveChatViewed = async () => {
    const type = get(activeChatType);
    const chatIdValue = get(activeChatId);
    const channelIdValue = get(activeChannelId);
    const currentSettings = get(settings);
    const meId = get(userStore).me?.id ?? null;
    if (!type || !chatIdValue) {
      return;
    }

    const messageChatId = type === "server" ? channelIdValue : chatIdValue;
    if (!messageChatId) {
      return;
    }

    const existingMessages =
      get(messagesByChatIdStore).get(messageChatId) ?? [];
    if (existingMessages.length === 0) {
      return;
    }

    updateMessagesForChat(messageChatId, (existing) => {
      let mutated = false;
      const next = existing.map((message) => {
        if (meId && message.senderId === meId) {
          return message;
        }
        if (message.read) {
          return message;
        }
        mutated = true;
        return { ...message, read: true };
      });
      return mutated ? next : existing;
    });

    const preferences = resolveModerationForChat(messageChatId);
    const readReceiptsAllowed =
      preferences.readReceiptsEnabled === null
        ? currentSettings.enableReadReceipts
        : preferences.readReceiptsEnabled;
    if (!readReceiptsAllowed) {
      return;
    }

    const updatedMessages =
      get(messagesByChatIdStore).get(messageChatId) ?? existingMessages;
    const lastReadable = [...updatedMessages]
      .filter((message) => (meId ? message.senderId !== meId : true))
      .pop();
    if (!lastReadable) {
      return;
    }

    if (lastDispatchedReceiptByChatId.get(messageChatId) === lastReadable.id) {
      return;
    }

    lastDispatchedReceiptByChatId.set(messageChatId, lastReadable.id);

    try {
      await invoke("send_read_receipt", {
        chatId: messageChatId,
        chat_id: messageChatId,
        messageId: lastReadable.id,
        message_id: lastReadable.id,
        timestamp: lastReadable.timestamp,
      });
    } catch (error) {
      lastDispatchedReceiptByChatId.delete(messageChatId);
      console.debug("Failed to send read receipt", error);
    }
  };

  const sendTypingIndicator = async (isTyping: boolean) => {
    const currentSettings = get(settings);
    if (!currentSettings.enableTypingIndicators) {
      return;
    }

    const type = get(activeChatType);
    const chatIdValue = get(activeChatId);
    const channelIdValue = get(activeChannelId);
    if (!type || !chatIdValue) {
      return;
    }

    const messageChatId = type === "server" ? channelIdValue : chatIdValue;
    if (!messageChatId) {
      return;
    }

    const previousState = typingDispatchState.get(messageChatId);
    if (previousState === isTyping) {
      return;
    }

    typingDispatchState.set(messageChatId, isTyping);

    try {
      await invoke("send_typing_indicator", {
        chatId: messageChatId,
        chat_id: messageChatId,
        isTyping,
        is_typing: isTyping,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      typingDispatchState.delete(messageChatId);
      console.debug("Failed to send typing indicator", error);
    }
  };

  const handleMessageDeleted = (payload: DeleteMessage) => {
    const chatId = payload.chat_id ?? payload.chatId;
    const messageId = payload.message_id ?? payload.messageId;
    if (!chatId || !messageId) {
      return;
    }

    if (!shouldApplyDeletionForScope(payload.scope)) {
      return;
    }

    const preferences = resolveModerationForChat(chatId);
    if (preferences.deletedMessageDisplay === "tombstone") {
      const removed: Message[] = [];
      const deletedAt = new Date().toISOString();
      const initiator =
        payload.initiator_id ?? payload.initiatorId ?? undefined;
      updateMessagesForChat(chatId, (existing) =>
        existing.map((message) => {
          if (message.id !== messageId) {
            return message;
          }
          removed.push(message);
          return {
            ...message,
            content: "",
            attachments: undefined,
            reactions: undefined,
            deleted: true,
            deletedAt,
            deletedBy: initiator,
          };
        }),
      );
      if (removed.length > 0) {
        revokeAttachmentsForMessages(removed);
      }
      return;
    }

    const removed: Message[] = [];
    updateMessagesForChat(chatId, (existing) =>
      existing.filter((message) => {
        if (message.id === messageId) {
          removed.push(message);
          return false;
        }
        return true;
      }),
    );
    if (removed.length > 0) {
      revokeAttachmentsForMessages(removed);
    }
  };

  const handleMessageEdited = (payload: EditMessage) => {
    const chatId = payload.chat_id ?? payload.chatId;
    const messageId = payload.message_id ?? payload.messageId;
    if (!chatId || !messageId) {
      return;
    }

    const nextContent = payload.new_content ?? payload.newContent;
    if (typeof nextContent !== "string" || nextContent.length === 0) {
      return;
    }

    const normalizedEditedAt = normalizeOptionalDate(
      payload.edited_at ?? payload.editedAt ?? null,
    );
    const editorId = payload.editor_id ?? payload.editorId;

    const preferences = resolveModerationForChat(chatId);

    updateMessagesForChat(chatId, (existing) =>
      existing.map((message) => {
        if (message.id !== messageId) {
          return message;
        }
        const shouldTrackHistory =
          preferences.transparentEdits &&
          typeof message.content === "string" &&
          message.content.length > 0 &&
          message.content !== nextContent;
        const nextHistory = shouldTrackHistory
          ? [...(message.editHistory ?? []), message.content]
          : message.editHistory;
        return {
          ...message,
          content: nextContent,
          editedBy: editorId ?? message.editedBy,
          editedAt:
            normalizedEditedAt ?? message.editedAt ?? new Date().toISOString(),
          editHistory: nextHistory,
        };
      }),
    );
  };

  const overrideSpamDecision = (
    chatId: string,
    messageId: string,
    decision: "allow" | "mute",
  ) => {
    if (!chatId || !messageId) return;
    updateMessagesForChat(chatId, (existing) =>
      existing.map((message) => {
        if (message.id !== messageId) {
          return message;
        }
        if (decision === "allow") {
          return {
            ...message,
            isSpamFlagged: false,
            spamMuted: false,
            spamDecision: "allowed",
          };
        }
        return {
          ...message,
          isSpamFlagged: true,
          spamMuted: true,
          spamDecision: "muted",
        };
      }),
    );
  };

  const dropChatHistory = (chatId: string) => {
    if (!chatId) return;
    const existing = get(messagesByChatIdStore).get(chatId);
    if (!existing) return;
    revokeAttachmentsForMessages(existing);
    loadSequenceNumbers.delete(chatId);
    messagesByChatIdStore.update((map) => {
      const next = new Map(map);
      next.delete(chatId);
      return next;
    });
    hasMoreByChatIdStore.update((map) => {
      const next = new Map(map);
      next.delete(chatId);
      return next;
    });
    loadingStateByChatStore.update((map) => {
      if (!map.has(chatId)) {
        return map;
      }
      const next = new Map(map);
      next.delete(chatId);
      return next;
    });
  };

  const clearActiveChat = () => {
    const previousChatId = get(activeChatId);
    const previousChatType = get(activeChatType);
    const previousChannelId = get(activeChannelId);
    activeChatId.set(null);
    activeChatType.set(null);
    activeChannelId.set(null);
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("activeChatId");
      localStorage.removeItem("activeChatType");
      localStorage.removeItem("activeChannelId");
    }
    const historyId =
      previousChatType === "server" ? previousChannelId : previousChatId;
    if (historyId) {
      dropChatHistory(historyId);
    }
  };

  const removeGroupChat = (groupId: string) => {
    if (!groupId) return;

    const isActiveGroup =
      get(activeChatType) === "group" && get(activeChatId) === groupId;

    if (isActiveGroup) {
      clearActiveChat();
    } else {
      dropChatHistory(groupId);
    }

    typingByChatIdStore.update((map) => {
      if (!map.has(groupId)) {
        return map;
      }
      const next = new Map(map);
      next.delete(groupId);
      return next;
    });

    groupChatsStore.update((map) => {
      if (!map.has(groupId)) {
        return map;
      }
      const next = new Map(map);
      next.delete(groupId);
      return next;
    });
  };

  const handleGroupMembersAdded = (groupId: string, memberIds: string[]) => {
    if (!groupId || !memberIds?.length) {
      return;
    }

    groupChatsStore.update((map) => {
      const summary = map.get(groupId);
      if (!summary) {
        return map;
      }
      const existing = new Set(summary.memberIds);
      let changed = false;
      for (const memberId of memberIds) {
        if (typeof memberId !== "string" || memberId.length === 0) {
          continue;
        }
        if (!existing.has(memberId)) {
          existing.add(memberId);
          changed = true;
        }
      }
      if (!changed) {
        return map;
      }
      const next = new Map(map);
      next.set(groupId, {
        ...summary,
        memberIds: Array.from(existing),
      });
      return next;
    });
  };

  const handleGroupMemberLeft = (groupId: string, memberId: string) => {
    if (!groupId || !memberId) {
      return;
    }

    const selfId = get(userStore).me?.id;
    if (selfId && memberId === selfId) {
      removeGroupChat(groupId);
      return;
    }

    groupChatsStore.update((map) => {
      const summary = map.get(groupId);
      if (!summary) {
        return map;
      }
      if (!summary.memberIds.includes(memberId)) {
        return map;
      }
      const next = new Map(map);
      next.set(groupId, {
        ...summary,
        memberIds: summary.memberIds.filter((id) => id !== memberId),
      });
      return next;
    });
  };

  const leaveGroupChat = async (groupId: string) => {
    if (!groupId) return;

    const me = get(userStore).me;
    if (!me) {
      throw new Error("You must be signed in to leave a group chat.");
    }

    try {
      await invoke("leave_group_dm", { groupId, group_id: groupId });
      handleGroupMemberLeft(groupId, me.id);
    } catch (error) {
      console.error("Failed to leave group chat:", error);
      throw error;
    }
  };

  const renameGroupChat = async (
    groupId: string,
    newName: string,
  ): Promise<GroupChatSummary> => {
    const trimmed = newName.trim();
    if (!groupId) {
      throw new Error("Group ID is required.");
    }
    if (trimmed.length === 0) {
      throw new Error("Group name is required.");
    }

    const existing = get(groupChatsStore).get(groupId);

    try {
      const payload = await invoke<
        BackendGroupChat & {
          ownerId?: string;
          owner_id?: string;
          createdAt?: string;
          created_at?: string;
          memberIds?: string[];
          member_ids?: string[];
        }
      >("rename_group_dm", {
        groupId,
        group_id: groupId,
        name: trimmed,
      });

      const backend: BackendGroupChat = {
        id: payload.id,
        name: payload.name ?? trimmed,
        owner_id: payload.owner_id ?? payload.ownerId ?? existing?.ownerId ?? "",
        created_at: payload.created_at ?? payload.createdAt ?? existing?.createdAt,
        member_ids:
          payload.member_ids ?? payload.memberIds ?? existing?.memberIds ?? [],
      };

      const summary = mapBackendGroupChat(backend);
      upsertGroupChat(summary);
      return summary;
    } catch (error) {
      console.error("Failed to rename group chat:", error);
      throw error;
    }
  };

  const addMembersToGroupChat = async (
    groupId: string,
    memberIds: string[],
  ): Promise<GroupChatSummary> => {
    const trimmedGroupId = groupId.trim();
    if (!trimmedGroupId) {
      throw new Error("Group ID is required.");
    }
    const filtered = Array.from(
      new Set(
        memberIds.filter(
          (id) => typeof id === "string" && id.trim().length > 0,
        ),
      ),
    );
    if (filtered.length === 0) {
      throw new Error("Please select at least one member to add.");
    }

    try {
      const payload = await invoke<BackendGroupChat>("add_group_dm_member", {
        groupId: trimmedGroupId,
        group_id: trimmedGroupId,
        memberIds: filtered,
        member_ids: filtered,
      });
      const summary = handleGroupChatCreated(payload);
      handleGroupMembersAdded(summary.id, payload.member_ids ?? payload.memberIds ?? []);
      return summary;
    } catch (error) {
      console.error("Failed to add members to group chat:", error);
      throw error;
    }
  };

  const removeGroupChatMember = async (
    groupId: string,
    memberId: string,
  ): Promise<void> => {
    const trimmedGroupId = groupId.trim();
    const trimmedMemberId = memberId.trim();
    if (!trimmedGroupId || !trimmedMemberId) {
      throw new Error("Group ID and member ID are required.");
    }

    try {
      const payload = await invoke<BackendGroupChat | null>(
        "remove_group_dm_member",
        {
          groupId: trimmedGroupId,
          group_id: trimmedGroupId,
          memberId: trimmedMemberId,
          member_id: trimmedMemberId,
        },
      );
      if (payload) {
        handleGroupChatCreated(payload);
      }
      handleGroupMemberLeft(trimmedGroupId, trimmedMemberId);
    } catch (error) {
      console.error("Failed to remove member from group chat:", error);
      throw error;
    }
  };

  const addReaction = async (
    targetChatId: string,
    messageId: string,
    emoji: string,
  ) => {
    const me = get(userStore).me;
    if (!me) return;
    applyReactionMutation(targetChatId, messageId, emoji, me.id, "add");
    try {
      await invoke("add_reaction", {
        chatId: targetChatId,
        chat_id: targetChatId,
        messageId,
        message_id: messageId,
        emoji,
      });
    } catch (e) {
      console.debug("add_reaction not available or failed", e);
    }
  };

  const removeReaction = async (
    targetChatId: string,
    messageId: string,
    emoji: string,
  ) => {
    const me = get(userStore).me;
    if (!me) return;
    applyReactionMutation(targetChatId, messageId, emoji, me.id, "remove");
    try {
      await invoke("remove_reaction", {
        chatId: targetChatId,
        chat_id: targetChatId,
        messageId,
        message_id: messageId,
        emoji,
      });
    } catch (e) {
      console.debug("remove_reaction not available or failed", e);
    }
  };

  return {
    messagesByChatId: derived(messagesByChatIdStore, ($map) => $map),
    hasMoreByChatId: derived(hasMoreByChatIdStore, ($map) => $map),
    metadataByChatId: derived(
      metadataByChatIdReadable,
      ($map) => new Map($map),
    ),
    activeChatId: derived(activeChatId, ($id) => $id),
    activeChatType: derived(activeChatType, ($type) => $type),
    activeChannelId: derived(activeChannelId, ($id) => $id),
    serverChannelSelections: derived(
      serverChannelSelectionsStore,
      ($map) => new Map($map),
    ),
    activeServerChannelId: derived(
      [serverStore, serverChannelSelectionsStore],
      ([$serverState, $map]) => {
        const activeServerId = $serverState.activeServerId;
        if (!activeServerId) {
          return null;
        }
        return $map.get(activeServerId) ?? null;
      },
    ),
    loadingStateByChat: derived(
      loadingStateByChatStore,
      ($map) => new Map($map),
    ),
    typingByChatId: typingByChatIdReadable,
    activeChatTypingUsers: derived(activeChatTypingUsersReadable, ($users) => [
      ...$users,
    ]),
    groupChats: derived(groupChatsStore, ($map) => new Map($map)),
    setActiveChat,
    handleMessagesUpdate,
    sendMessage,
    sendMessageWithAttachments,
    deleteMessage,
    pinMessage,
    unpinMessage,
    editMessage,
    handleNewMessageEvent,
    handleMessageDeleted,
    handleMessageEdited,
    handleReactionUpdate,
    handleReadReceipt,
    handleTypingIndicator,
    markActiveChatViewed,
    sendTypingIndicator,
    clearActiveChat,
    dropChatHistory,
    loadMoreMessages,
    loadAttachmentForMessage,
    addReaction,
    removeReaction,
    overrideSpamDecision,
    handleGroupChatCreated,
    loadGroupChats,
    leaveGroupChat,
    renameGroupChat,
    addMembersToGroupChat,
    removeGroupChatMember,
    handleGroupMemberLeft,
    handleGroupMembersAdded,
    refreshChatFromStorage,
  };
}

export const chatStore = createChatStore();
export const messagesByChatId = chatStore.messagesByChatId;
export const hasMoreByChatId = chatStore.hasMoreByChatId;
export const chatMetadataByChatId = chatStore.metadataByChatId;
export const activeChannelId = chatStore.activeChannelId;
export const serverChannelSelections = chatStore.serverChannelSelections;
export const activeServerChannelId = chatStore.activeServerChannelId;
export const activeChatId = chatStore.activeChatId;
export const activeChatType = chatStore.activeChatType;
export const loadingStateByChat = chatStore.loadingStateByChat;
export const typingByChatId = chatStore.typingByChatId;
export const activeChatTypingUsers = chatStore.activeChatTypingUsers;
export const groupChats = chatStore.groupChats;
export { createChatStore };
export type { ChatMetadata };
