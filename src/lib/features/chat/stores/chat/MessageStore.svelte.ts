import { SvelteMap } from "svelte/reactivity";
import { invoke } from "@tauri-apps/api/core";
import type { Message } from "../../models/Message";
import type { ChatMessage, DeleteMessage, EditMessage } from "../../models/AepMessage";
import { decodeIncomingMessagePayload } from "../../services/chatEncryptionService";
import { resolveMessageEmbeds } from "../../services/messageUnfurlService";
import { mapAttachmentPayloads, mapBackendEmbeds, normalizeReactions, normalizeOptionalDate, normalizeTimestamp } from "./mapping";

export class MessageStore {
  #messagesByChatId = new SvelteMap<string, Message[]>();
  #hasMoreByChatId = new SvelteMap<string, boolean>();
  #loadingStateByChat = new SvelteMap<string, boolean>();
  #maxMessagesPerChat: number;

  constructor(options?: { maxMessagesPerChat?: number }) {
    this.#maxMessagesPerChat = options?.maxMessagesPerChat ?? 500;
  }

  get messagesByChatId() { return this.#messagesByChatId; }
  get hasMoreByChatId() { return this.#hasMoreByChatId; }
  get loadingStateByChat() { return this.#loadingStateByChat; }

  async mapBackendMessage(message: any, fallbackChatId: string): Promise<Message> {
    const decoded = await decodeIncomingMessagePayload({
      content: message.content,
      attachments: message.attachments,
    });
    const attachments = mapAttachmentPayloads(decoded.attachments);
    const backendEmbeds = mapBackendEmbeds(message.embeds ?? null);
    const resolvedEmbeds = await resolveMessageEmbeds({
      content: decoded.content,
      existingEmbeds: backendEmbeds,
    });
    const reactions = normalizeReactions(message.reactions ?? null);
    const editedAt = normalizeOptionalDate(message.edited_at ?? message.editedAt);
    const editedBy = message.edited_by ?? message.editedBy ?? undefined;
    const timestamp = normalizeTimestamp(message.timestamp);
    const backendExpires = normalizeOptionalDate(message.expires_at ?? message.expiresAt);
    const pinned = Boolean(message.pinned);

    return {
      id: message.id,
      chatId: message.chat_id ?? message.chatId ?? fallbackChatId,
      senderId: message.sender_id ?? message.senderId ?? "",
      content: decoded.content,
      timestamp,
      read: message.read ?? true,
      pinned,
      attachments,
      reactions,
      editedAt,
      editedBy,
      expiresAt: backendExpires,
      replyToMessageId: message.reply_to_message_id ?? message.replyToMessageId ?? null,
      replySnapshot: {
        author: message.reply_snapshot_author ?? message.replySnapshotAuthor ?? undefined,
        snippet: message.reply_snapshot_snippet ?? message.replySnapshotSnippet ?? undefined,
      },
      embeds: resolvedEmbeds,
    };
  }

  #enforceRetention(chatId: string, messages: Message[]) {
    if (this.#maxMessagesPerChat <= 0 || messages.length <= this.#maxMessagesPerChat) return messages;
    
    const sorted = [...messages].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const toRemove = sorted.slice(0, sorted.length - this.#maxMessagesPerChat);
    const toRemoveIds = new Set(toRemove.map(m => m.id));
    
    toRemove.forEach(msg => {
      msg.attachments?.forEach(att => {
        if (att.objectUrl) URL.revokeObjectURL(att.objectUrl);
      });
    });

    return messages.filter(m => !toRemoveIds.has(m.id));
  }

  addMessage(chatId: string, message: Message) {
    const existing = this.#messagesByChatId.get(chatId) ?? [];
    if (existing.some(m => m.id === message.id)) return;
    const next = this.#enforceRetention(chatId, [...existing, message]);
    this.#messagesByChatId.set(chatId, next);
  }

  updateMessage(chatId: string, messageId: string, updater: (m: Message) => Message) {
    const existing = this.#messagesByChatId.get(chatId);
    if (!existing) return;
    const next = existing.map(m => m.id === messageId ? updater(m) : m);
    this.#messagesByChatId.set(chatId, next);
  }

  removeMessage(chatId: string, messageId: string) {
    const existing = this.#messagesByChatId.get(chatId);
    if (!existing) return;
    const msg = existing.find(m => m.id === messageId);
    if (msg?.attachments) {
      msg.attachments.forEach(att => {
        if (att.objectUrl) URL.revokeObjectURL(att.objectUrl);
      });
    }
    this.#messagesByChatId.set(chatId, existing.filter(m => m.id !== messageId));
  }

  setMessages(chatId: string, messages: Message[]) {
    this.#messagesByChatId.set(chatId, this.#enforceRetention(chatId, messages));
  }

  setHasMore(chatId: string, hasMore: boolean) {
    this.#hasMoreByChatId.set(chatId, hasMore);
  }

  setLoading(chatId: string, isLoading: boolean) {
    this.#loadingStateByChat.set(chatId, isLoading);
  }
}
