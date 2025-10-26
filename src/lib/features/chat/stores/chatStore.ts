import { writable, get, derived, type Readable } from "svelte/store";
import { invoke } from "@tauri-apps/api/core";
import type {
  AttachmentMeta,
  Message,
} from "$lib/features/chat/models/Message";
import type {
  ChatMessage,
  MessageReaction,
  ReactionAction,
} from "$lib/features/chat/models/AepMessage";
import { userStore } from "$lib/stores/userStore";
import { serverStore } from "$lib/features/servers/stores/serverStore";

type BackendMessage = {
  id: string;
  chat_id?: string;
  chatId?: string;
  sender_id?: string;
  senderId?: string;
  content: string;
  timestamp: string | number | Date;
  read?: boolean;
  attachments?: BackendAttachment[];
  reactions?: Record<string, string[]> | null;
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

type AttachmentPayload = {
  name: string;
  type?: string;
  size: number;
  data: Uint8Array | ArrayBuffer;
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

interface ChatStore {
  messagesByChatId: Readable<Map<string, Message[]>>;
  hasMoreByChatId: Readable<Map<string, boolean>>;
  activeChatId: Readable<string | null>;
  activeChatType: Readable<"dm" | "server" | "group" | null>;
  activeChannelId: Readable<string | null>;
  serverChannelSelections: Readable<Map<string, string>>;
  activeServerChannelId: Readable<string | null>;
  loadingStateByChat: Readable<Map<string, boolean>>;
  setActiveChat: (
    chatId: string,
    chatType: "dm" | "server" | "group",
    channelId?: string,
    options?: {
      forceRefresh?: boolean;
    },
  ) => Promise<void>;
  handleMessagesUpdate: (chatId: string, messages: Message[]) => void;
  sendMessage: (content: string) => Promise<void>;
  sendMessageWithAttachments: (content: string, files: File[]) => Promise<void>;
  deleteMessage: (chatId: string, messageId: string) => Promise<void>;
  handleNewMessageEvent: (message: ChatMessage) => void;
  handleReactionUpdate: (payload: MessageReaction) => void;
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
  handleGroupChatCreated: (chat: BackendGroupChat) => GroupChatSummary;
  loadGroupChats: () => Promise<void>;
  groupChats: Readable<Map<string, GroupChatSummary>>;
}

type ChatStoreOptions = {
  maxMessagesPerChat?: number;
};

const DEFAULT_MAX_MESSAGES_PER_CHAT = 500;

function createChatStore(options: ChatStoreOptions = {}): ChatStore {
  const messagesByChatIdStore = writable<Map<string, Message[]>>(new Map());
  const hasMoreByChatIdStore = writable<Map<string, boolean>>(new Map());
  const groupChatsStore = writable<Map<string, GroupChatSummary>>(new Map());

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
    const memberIds = Array.from(new Set(memberIdsRaw.filter((id): id is string => typeof id === "string" && id.length > 0)));
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
    messagesByChatIdStore.update((map) => {
      const existing = map.get(chatId) || [];
      const next = enforceRetention(updater(existing));

      const existingUrls = collectAttachmentUrlsFromMessages(existing);
      const nextUrls = collectAttachmentUrlsFromMessages(next);
      for (const url of existingUrls) {
        if (!nextUrls.has(url)) {
          revokeAttachmentUrl(url);
        }
      }

      map.set(chatId, next);
      return new Map(map);
    });
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

  const mapBackendMessage = (
    message: BackendMessage,
    fallbackChatId: string,
  ): Message => {
    const attachments = mapAttachmentPayloads(message.attachments);
    const reactions = normalizeReactions(message.reactions ?? null);
    return {
      id: message.id,
      chatId: message.chat_id ?? message.chatId ?? fallbackChatId,
      senderId: message.sender_id ?? message.senderId ?? "",
      content: message.content,
      timestamp: normalizeTimestamp(message.timestamp),
      read: message.read ?? true,
      pending: false,
      attachments: attachments.length > 0 ? attachments : undefined,
      reactions,
    };
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
    const normalized = { ...incoming, pending: false };
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
        const mapped = fetched
          .map((m: BackendMessage) => mapBackendMessage(m, messageChatId))
          .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
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
      const mapped = fetched
        .map((m: BackendMessage) => mapBackendMessage(m, targetChatId))
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
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

  const sendMessage = async (content: string) => {
    const type = get(activeChatType);
    const chatId = get(activeChatId);
    const channelId = get(activeChannelId);
    const me = get(userStore).me;

    if (!type || !chatId || !me) return;

    const messageChatId = type === "server" ? channelId : chatId;
    if (!messageChatId) return;

    const tempId = Date.now().toString();
    const newMessage: Message = {
      id: tempId,
      chatId: messageChatId,
      senderId: me.id,
      content: content,
      timestamp: new Date().toISOString(),
      read: true,
      pending: true,
    };

    updateMessagesForChat(messageChatId, (existing) => [
      ...existing,
      newMessage,
    ]);

    try {
      if (type === "dm") {
        await invoke("send_direct_message", {
          message: content,
          recipientId: chatId,
          recipient_id: chatId,
        });
      } else {
        await invoke("send_message", {
          message: content,
          channelId: channelId,
          channel_id: channelId,
          serverId: chatId,
          server_id: chatId,
        });
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      updateMessagesForChat(messageChatId, (existing) =>
        existing.filter((msg) => msg.id !== tempId),
      );
    }
  };

  const createOptimisticAttachmentId = () => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `att-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  };

  const sendMessageWithAttachments = async (content: string, files: File[]) => {
    const type = get(activeChatType);
    const chatId = get(activeChatId);
    const channelId = get(activeChannelId);
    const me = get(userStore).me;

    if (!type || !chatId || !me) return;
    const messageChatId = type === "server" ? channelId : chatId;
    if (!messageChatId) return;

    const tempId = Date.now().toString() + "-a";

    const attachmentsCombined = await Promise.all(
      files.map(
        async (
          file,
        ): Promise<{
          backend: AttachmentPayload;
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
    const optimisticAttachments = attachmentsCombined.map((entry) => entry.ui);

    const newMessage: Message = {
      id: tempId,
      chatId: messageChatId,
      senderId: me.id,
      content: content,
      timestamp: new Date().toISOString(),
      read: true,
      attachments:
        optimisticAttachments.length > 0 ? optimisticAttachments : undefined,
      pending: true,
    };
    updateMessagesForChat(messageChatId, (existing) => [
      ...existing,
      newMessage,
    ]);

    try {
      if (type === "dm") {
        await invoke("send_direct_message_with_attachments", {
          message: content,
          recipientId: chatId,
          recipient_id: chatId,
          attachments: backendAttachments,
        });
      } else {
        await invoke("send_message_with_attachments", {
          message: content,
          attachments: backendAttachments,
          channelId: channelId,
          channel_id: channelId,
          serverId: chatId,
          server_id: chatId,
        });
      }
    } catch (error) {
      console.error("Failed to send message with attachments:", error);
      updateMessagesForChat(messageChatId, (existing) =>
        existing.filter((msg) => msg.id !== tempId),
      );
    }
  };

  const deleteMessage = async (targetChatId: string, messageId: string) => {
    updateMessagesForChat(targetChatId, (existing) =>
      existing.filter((m) => m.id !== messageId),
    );
    try {
      await invoke("delete_message", {
        chatId: targetChatId,
        chat_id: targetChatId,
        messageId,
        message_id: messageId,
      });
    } catch (e) {
      console.error("Failed to delete message:", e);
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
      const mapped = fetched
        .map((m: BackendMessage) => mapBackendMessage(m, chatId))
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
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

  const handleNewMessageEvent = (message: ChatMessage) => {
    const { sender, content } = message;
    const channelIdFromPayload = message.channel_id ?? message.channelId;
    const conversationId = message.conversation_id ?? message.conversationId;
    const me = get(userStore).me;

    let targetChatId: string | null = null;
    if (conversationId) {
      targetChatId = conversationId;
    } else if (channelIdFromPayload) {
      targetChatId = channelIdFromPayload;
    } else {
      targetChatId = sender;
    }

    if (targetChatId) {
      const messageIdFromPayload =
        message.id ?? message.message_id ?? message.messageId;
      const timestampFromPayload = message.timestamp;
      const isMissingMetadata = !messageIdFromPayload || !timestampFromPayload;

      const newMessage: Message = {
        id: messageIdFromPayload ?? `temp-${Date.now().toString()}`,
        chatId: targetChatId,
        senderId: sender,
        content: content,
        timestamp: normalizeTimestamp(timestampFromPayload),
        read: sender === me?.id,
        attachments:
          message.attachments && message.attachments.length > 0
            ? mapAttachmentPayloads(message.attachments)
            : undefined,
        reactions: normalizeReactions(message.reactions ?? null),
      };
      updateMessagesForChat(targetChatId, (existing) =>
        insertRealtimeMessage(existing, newMessage, me?.id),
      );
      if (isMissingMetadata) {
        void refreshChatMessages(targetChatId);
      }
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
    groupChats: derived(groupChatsStore, ($map) => new Map($map)),
    setActiveChat,
    handleMessagesUpdate,
    sendMessage,
    sendMessageWithAttachments,
    deleteMessage,
    handleNewMessageEvent,
    handleReactionUpdate,
    clearActiveChat,
    dropChatHistory,
    loadMoreMessages,
    loadAttachmentForMessage,
    addReaction,
    removeReaction,
    handleGroupChatCreated,
    loadGroupChats,
  };
}

export const chatStore = createChatStore();
export const messagesByChatId = chatStore.messagesByChatId;
export const hasMoreByChatId = chatStore.hasMoreByChatId;
export const activeChannelId = chatStore.activeChannelId;
export const serverChannelSelections = chatStore.serverChannelSelections;
export const activeServerChannelId = chatStore.activeServerChannelId;
export const activeChatId = chatStore.activeChatId;
export const activeChatType = chatStore.activeChatType;
export const loadingStateByChat = chatStore.loadingStateByChat;
export const groupChats = chatStore.groupChats;
export { createChatStore };
