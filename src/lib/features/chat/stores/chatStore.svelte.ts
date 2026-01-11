import { chatStore as newChatStore } from "./chat/ChatStore.svelte";
import type { Message } from "../models/Message";
import { get } from "svelte/store";

export const chatStore = newChatStore;

export interface ChatMetadata {
  id: string;
  chatId: string;
  unreadCount: number;
  lastMessage?: Message;
  lastActivityAt: string | null;
  fallbackUserId?: string;
  fallbackName?: string;
  fallbackAvatar?: string;
}

export interface GroupChatSummary {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  memberIds: string[];
}

export class SlowmodeError extends Error {
  constructor(public readonly remainingSeconds: number) {
    super(`Slowmode is active. Please wait ${remainingSeconds} seconds.`);
    this.name = "SlowmodeError";
  }
}

export interface MessageReadReceiptEvent {
  chat_id?: string;
  chatId?: string;
  user_id?: string;
  userId?: string;
  message_id?: string;
  messageId?: string;
  timestamp?: string | number | Date;
}

export interface TypingIndicatorEvent {
  chat_id?: string;
  chatId?: string;
  user_id?: string;
  userId?: string;
  is_typing?: boolean;
  isTyping?: boolean;
}

function createLegacyStore<T>(getter: () => T) {
  return {
    subscribe: (run: (val: T) => void) => {
      run(getter());
      return $effect.root(() => {
        $effect(() => {
          run(getter());
        });
        return () => {};
      });
    }
  };
}

export const messagesByChatId = newChatStore.messagesByChatId;
export const hasMoreByChatId = newChatStore.hasMoreByChatId;
export const loadingStateByChat = newChatStore.loadingStateByChat;
export const groupChats = newChatStore.groupChats;
export const slowmodeByChannelId = newChatStore.slowmodeByChannelId;

export const activeChatId = createLegacyStore(() => newChatStore.activeChatId);
export const activeChatType = createLegacyStore(() => newChatStore.activeChatType);
export const activeChannelId = createLegacyStore(() => newChatStore.activeChannelId);
export const activeServerChannelId = activeChannelId;

export const chatMetadataByChatId = newChatStore.metadataByChatId;
export const serverUnreadCountByServerId = newChatStore.serverUnreadCountByServerId;
export const activeChatTypingUsers = newChatStore.activeChatTypingUsers;

export { createChatStore } from "./chat/legacy_factory";
export type { BackendGroupChat } from "./chat/types";
