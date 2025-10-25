import { writable, get, derived, type Readable } from "svelte/store";
import { invoke } from "@tauri-apps/api/core";
import type { AttachmentMeta, Message } from "$lib/features/chat/models/Message";
import type { ChatMessage } from "$lib/features/chat/models/AepMessage";
import { userStore } from "$lib/stores/userStore";

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
};

type BackendAttachment = {
  id: string;
  message_id?: string;
  messageId?: string;
  name: string;
  content_type?: string;
  contentType?: string;
  size?: number;
  data?: number[] | Uint8Array;
};

interface ChatStore {
  messagesByChatId: Readable<Map<string, Message[]>>;
  hasMoreByChatId: Readable<Map<string, boolean>>;
  activeChatId: Readable<string | null>;
  activeChatType: Readable<"dm" | "server" | null>;
  activeChannelId: Readable<string | null>;
  loadingMessages: Readable<boolean>;
  setActiveChat: (
    chatId: string,
    chatType: "dm" | "server",
    channelId?: string,
  ) => Promise<void>;
  handleMessagesUpdate: (chatId: string, messages: Message[]) => void;
  sendMessage: (content: string) => Promise<void>;
  sendMessageWithAttachments: (content: string, files: File[]) => Promise<void>;
  deleteMessage: (chatId: string, messageId: string) => Promise<void>;
  handleNewMessageEvent: (message: ChatMessage) => void;
  clearActiveChat: () => void;
  loadMoreMessages: (targetChatId: string) => Promise<void>;
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
}

function createChatStore(): ChatStore {
  const messagesByChatIdStore = writable<Map<string, Message[]>>(new Map());
  const hasMoreByChatIdStore = writable<Map<string, boolean>>(new Map());
  const activeChatId = writable<string | null>(
    typeof localStorage !== "undefined"
      ? localStorage.getItem("activeChatId")
      : null,
  );
  const activeChatType = writable<"dm" | "server" | null>(
    typeof localStorage !== "undefined"
      ? (localStorage.getItem("activeChatType") as "dm" | "server")
      : null,
  );
  const activeChannelId = writable<string | null>(
    typeof localStorage !== "undefined"
      ? localStorage.getItem("activeChannelId")
      : null,
  );
  const loadingMessages = writable<boolean>(false);
  const PAGE_LIMIT = 50;

  const ensureUint8Array = (
    input?: number[] | Uint8Array,
  ): Uint8Array | undefined => {
    if (!input) {
      return undefined;
    }
    if (input instanceof Uint8Array) {
      return input;
    }
    return new Uint8Array(input);
  };

  const toAttachmentMeta = (attachment: BackendAttachment): AttachmentMeta => {
    const mime =
      attachment.content_type ??
      attachment.contentType ??
      "application/octet-stream";
    const bytes = ensureUint8Array(attachment.data);
    const url = bytes
      ? URL.createObjectURL(new Blob([bytes], { type: mime }))
      : undefined;

    return {
      id: attachment.id,
      name: attachment.name,
      type: mime,
      size: attachment.size ?? bytes?.length,
      url,
      bytes,
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
    return {
      id: message.id,
      chatId: message.chat_id ?? message.chatId ?? fallbackChatId,
      senderId: message.sender_id ?? message.senderId ?? "",
      content: message.content,
      timestamp: normalizeTimestamp(message.timestamp),
      read: message.read ?? true,
      pending: false,
      attachments: attachments.length > 0 ? attachments : undefined,
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
    type: "dm" | "server",
    channelId?: string,
  ) => {
    activeChatId.set(chatId);
    activeChatType.set(type);
    activeChannelId.set(channelId || null);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("activeChatId", chatId);
      localStorage.setItem("activeChatType", type);
      if (channelId) {
        localStorage.setItem("activeChannelId", channelId);
      } else {
        localStorage.removeItem("activeChannelId");
      }
    }
    const messageChatId = type === "server" ? channelId : chatId;
    if (messageChatId) {
      const existingMessages = get(messagesByChatIdStore).get(messageChatId);
      const hasCachedMessages =
        Array.isArray(existingMessages) && existingMessages.length > 0;

      if (!hasCachedMessages) {
        messagesByChatIdStore.update((map) => {
          const current = map.get(messageChatId);
          if (!current || current.length === 0) {
            map.set(messageChatId, []);
          }
          return new Map(map);
        });
        hasMoreByChatIdStore.update((map) => {
          map.set(messageChatId, true);
          return new Map(map);
        });
      }

      loadingMessages.set(true);
      try {
        const fetched: BackendMessage[] = await invoke("get_messages", {
          chatId: messageChatId,
          chat_id: messageChatId,
          limit: PAGE_LIMIT,
          offset: 0,
        });
        const mapped = fetched
          .map((m: BackendMessage) => mapBackendMessage(m, messageChatId))
          .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        handleMessagesUpdate(messageChatId, mapped);
        hasMoreByChatIdStore.update((map) => {
          map.set(messageChatId, fetched.length >= PAGE_LIMIT);
          return new Map(map);
        });
      } catch (e) {
        console.error("Failed to fetch messages:", e);
        loadingMessages.set(false);
      }
    }
  };

  const handleMessagesUpdate = (chatId: string, messages: Message[]) => {
    const selfId = get(userStore).me?.id;
    messagesByChatIdStore.update((map) => {
      const existing = map.get(chatId) || [];
      const usedPendingIds = new Set<string>();
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
      deduped.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const remainingPending = existing.filter(
        (msg) => msg.pending && !usedPendingIds.has(msg.id),
      );
      map.set(chatId, [...deduped, ...remainingPending]);
      return new Map(map);
    });
    loadingMessages.set(false);
  };

  const loadMoreMessages = async (targetChatId: string) => {
    loadingMessages.set(true);
    try {
      const current = get(messagesByChatIdStore).get(targetChatId) || [];
      const persistedCount = current.filter((m) => !m.pending).length;
      const fetched: BackendMessage[] = await invoke("get_messages", {
        chatId: targetChatId,
        chat_id: targetChatId,
        limit: PAGE_LIMIT,
        offset: persistedCount,
      });
      const mapped = fetched
        .map((m: BackendMessage) => mapBackendMessage(m, targetChatId))
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      let newAdds = 0;
      const selfId = get(userStore).me?.id;
      messagesByChatIdStore.update((map) => {
        const existing = map.get(targetChatId) || [];
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
        map.set(targetChatId, [
          ...deduped,
          ...persistedExisting,
          ...remainingPending,
        ]);
        return new Map(map);
      });
      hasMoreByChatIdStore.update((map) => {
        const hasMore = fetched.length >= PAGE_LIMIT && newAdds > 0;
        map.set(targetChatId, hasMore);
        return new Map(map);
      });
    } catch (e) {
      console.error("Failed to load more messages:", e);
    } finally {
      loadingMessages.set(false);
    }
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

    messagesByChatIdStore.update((map) => {
      const existing = map.get(messageChatId) || [];
      map.set(messageChatId, [...existing, newMessage]);
      return new Map(map);
    });

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
      messagesByChatIdStore.update((map) => {
        const existing = map.get(messageChatId) || [];
        map.set(
          messageChatId,
          existing.filter((msg) => msg.id !== tempId),
        );
        return new Map(map);
      });
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
      files.map(async (file) => {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const mime = file.type || "application/octet-stream";
        return {
          backend: {
            name: file.name,
            type: mime,
            size: file.size,
            data: Array.from(bytes),
          },
          ui: {
            id: createOptimisticAttachmentId(),
            name: file.name,
            type: mime,
            size: file.size,
            url: URL.createObjectURL(file),
            bytes,
          } satisfies AttachmentMeta,
        };
      }),
    );

    const backendAttachments = attachmentsCombined.map((entry) => entry.backend);
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
    messagesByChatIdStore.update((map) => {
      const existing = map.get(messageChatId) || [];
      map.set(messageChatId, [...existing, newMessage]);
      return new Map(map);
    });

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
      messagesByChatIdStore.update((map) => {
        const existing = map.get(messageChatId) || [];
        map.set(
          messageChatId,
          existing.filter((msg) => msg.id !== tempId),
        );
        return new Map(map);
      });
    }
  };

  const deleteMessage = async (targetChatId: string, messageId: string) => {
    messagesByChatIdStore.update((map) => {
      const existing = map.get(targetChatId) || [];
      map.set(
        targetChatId,
        existing.filter((m) => m.id !== messageId),
      );
      return new Map(map);
    });
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
    try {
      const fetched: BackendMessage[] = await invoke("get_messages", {
        chatId,
        chat_id: chatId,
        limit: PAGE_LIMIT,
        offset: 0,
      });
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
    }
  };

  const handleNewMessageEvent = (message: ChatMessage) => {
    const { sender, content } = message;
    const channelIdFromPayload = message.channel_id ?? message.channelId;
    const conversationId =
      message.conversation_id ?? message.conversationId;
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
      const isMissingMetadata =
        !messageIdFromPayload || !timestampFromPayload;

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
      };
      messagesByChatIdStore.update((map) => {
        const existing = map.get(targetChatId) || [];
        const updated = insertRealtimeMessage(existing, newMessage, me?.id);
        map.set(targetChatId, updated);
        return new Map(map);
      });
      if (isMissingMetadata) {
        void refreshChatMessages(targetChatId);
      }
    }
  };

  const clearActiveChat = () => {
    activeChatId.set(null);
    activeChatType.set(null);
    activeChannelId.set(null);
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("activeChatId");
      localStorage.removeItem("activeChatType");
      localStorage.removeItem("activeChannelId");
    }
  };

  const addReaction = async (
    targetChatId: string,
    messageId: string,
    emoji: string,
  ) => {
    const me = get(userStore).me;
    if (!me) return;
    messagesByChatIdStore.update((map) => {
      const existing = map.get(targetChatId) || [];
      const updated = existing.map((m) => {
        if (m.id !== messageId) return m;
        const reactions = { ...(m.reactions || {}) } as Record<
          string,
          string[]
        >;
        const users = new Set(reactions[emoji] || []);
        users.add(me.id);
        reactions[emoji] = Array.from(users);
        return { ...m, reactions };
      });
      map.set(targetChatId, updated);
      return new Map(map);
    });
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
    messagesByChatIdStore.update((map) => {
      const existing = map.get(targetChatId) || [];
      const updated = existing.map((m) => {
        if (m.id !== messageId) return m;
        const reactions = { ...(m.reactions || {}) } as Record<
          string,
          string[]
        >;
        const users = new Set(reactions[emoji] || []);
        users.delete(me.id);
        if (users.size === 0) {
          delete reactions[emoji];
        } else {
          reactions[emoji] = Array.from(users);
        }
        return { ...m, reactions };
      });
      map.set(targetChatId, updated);
      return new Map(map);
    });
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
    loadingMessages: derived(loadingMessages, ($loading) => $loading),
    setActiveChat,
    handleMessagesUpdate,
    sendMessage,
    sendMessageWithAttachments,
    deleteMessage,
    handleNewMessageEvent,
    clearActiveChat,
    loadMoreMessages,
    addReaction,
    removeReaction,
  };
}

export const chatStore = createChatStore();
export const messagesByChatId = chatStore.messagesByChatId;
export const hasMoreByChatId = chatStore.hasMoreByChatId;
export const activeChannelId = chatStore.activeChannelId;
export const activeChatId = chatStore.activeChatId;
export const activeChatType = chatStore.activeChatType;
