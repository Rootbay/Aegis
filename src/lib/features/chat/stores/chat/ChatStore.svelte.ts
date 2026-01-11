import { SvelteMap } from "svelte/reactivity";
import { invoke } from "@tauri-apps/api/core";
import { MessageStore } from "./MessageStore";
import { TypingStore } from "./TypingStore";
import { GroupChatStore } from "./GroupChatStore";
import { PreferenceStore } from "./PreferenceStore";
import { SlowmodeStore } from "./SlowmodeStore";
import type { Message, SendMessageOptions } from "../../models/Message";
import type { ChatMessage, MessageReaction, DeleteMessage, EditMessage } from "../../models/AepMessage";
import { userStore } from "$lib/stores/userStore.svelte";
import { get } from "svelte/store";
import { encryptOutgoingMessagePayload } from "../../services/chatEncryptionService";
import { toArrayBuffer, ensureUint8Array } from "./mapping";

export class ChatStore {
  readonly #messages: MessageStore;
  readonly #typing = new TypingStore();
  readonly #groupChats = new GroupChatStore();
  readonly #preferences = new PreferenceStore();
  readonly #slowmode = new SlowmodeStore();

  get messages() { return this.#messages; }
  get typing() { return this.#typing; }
  get groupChatStore() { return this.#groupChats; }
  get preferences() { return this.#preferences; }
  get slowmode() { return this.#slowmode; }

  constructor(options?: { maxMessagesPerChat?: number }) {
    this.#messages = new MessageStore(options);
  }

  #activeChatId = $state<string | null>(null);
  #activeChatType = $state<"dm" | "server" | "group" | null>(null);
  #activeChannelId = $state<string | null>(null);

  get activeChatId() { return this.#activeChatId; }
  get activeChatType() { return this.#activeChatType; }
  get activeChannelId() { return this.#activeChannelId; }
  get activeServerChannelId() { return this.#toStore(() => this.#activeChannelId); }

  // Compatibility getters for Svelte 4 stores
  get messagesByChatId() { return this.#toStore(() => this.#messages.messagesByChatId); }
  get hasMoreByChatId() { return this.#toStore(() => this.#messages.hasMoreByChatId); }
  get loadingStateByChat() { return this.#toStore(() => this.#messages.loadingStateByChat); }
  get slowmodeByChannelId() { return this.#toStore(() => this.#slowmode.slowmodeByChannelId); }
  get groupChats() { return this.#toStore(() => this.#groupChats.groupChats); }
  get metadataByChatId() {
    return this.#toStore(() => {
      const metadata = new Map<any, any>();
      for (const [chatId, messages] of this.#messages.messagesByChatId) {
        const unreadCount = messages.filter(m => !m.read).length;
        const lastMsg = messages[messages.length - 1];
        metadata.set(chatId, {
          id: chatId,
          chatId: chatId, // Compatibility
          unreadCount,
          lastMessage: lastMsg,
          lastActivityAt: lastMsg?.timestamp ?? null
        });
      }
      return metadata;
    });
  }

  get activeChatTypingUsers() {
    return this.#toStore(() => {
      if (!this.#activeChatId) return [];
      return this.#typing.typingByChatId.get(this.#activeChatId) ?? [];
    });
  }

  get serverUnreadCountByServerId() {
    return this.#toStore(() => new Map<string, number>());
  }

  get chatPreferenceOverrides() {
    return this.#preferences.overrides;
  }

  #toStore<T>(getter: () => T) {
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

  async setActiveChat(
    chatId: string,
    chatType: "dm" | "server" | "group",
    channelId?: string,
    options?: { forceRefresh?: boolean }
  ) {
    this.#activeChatId = chatId;
    this.#activeChatType = chatType;
    this.#activeChannelId = channelId ?? null;

    if (typeof localStorage !== "undefined") {
      localStorage.setItem("activeChatId", chatId);
      localStorage.setItem("activeChatType", chatType);
    }
    
    // Auto-load messages if not present or forceRefresh is true
    if (options?.forceRefresh || !this.#messages.messagesByChatId.has(chatId)) {
      await this.loadMoreMessages(chatId);
    }
  }

  clearActiveChat() {
    this.#activeChatId = null;
    this.#activeChatType = null;
    this.#activeChannelId = null;

    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("activeChatId");
      localStorage.removeItem("activeChatType");
    }
  }

  async loadMoreMessages(chatId: string) {
    if (this.#messages.loadingStateByChat.get(chatId)) return;
    
    this.#messages.setLoading(chatId, true);
    try {
      const limit = 50;
      const existingCount = this.#messages.messagesByChatId.get(chatId)?.length ?? 0;
      const backendMessages = await invoke<any[]>("get_messages", {
        chatId,
        limit,
        offset: existingCount
      });

      const mapped = await Promise.all(
        backendMessages.map(m => this.#messages.mapBackendMessage(m, chatId))
      );

      const current = this.#messages.messagesByChatId.get(chatId) ?? [];
      this.#messages.setMessages(chatId, [...mapped.reverse(), ...current]);
      this.#messages.setHasMore(chatId, backendMessages.length === limit);
    } catch (error) {
      console.error("Failed to load messages:", error);
    } finally {
      this.#messages.setLoading(chatId, false);
    }
  }

  async markChatRead(chatId: string, options?: { serverId?: string }) {
    // Optimistically update local state to prevent loop if backend is slow/failing
    const msgs = this.#messages.messagesByChatId.get(chatId);
    if (msgs) {
      this.#messages.setMessages(chatId, msgs.map(m => ({ ...m, read: true })));
    }

    try {
      await invoke("mark_chat_read", { chatId, ...options });
    } catch (error) {
      console.error("Failed to mark chat as read:", error);
    }
  }

  async markActiveChatViewed() {
    if (this.#activeChatId) {
      await this.markChatRead(this.#activeChatId, {
        serverId: this.#activeChatType === "server" ? this.#activeChatId : undefined
      });
    }
  }

  async handleMessagesUpdate(chatId: string, backendMessages: any[]) {
    const mapped = await Promise.all(
      backendMessages.map(m => this.#messages.mapBackendMessage(m, chatId))
    );
    this.#messages.setMessages(chatId, mapped);
  }

  async handleNewMessageEvent(payload: ChatMessage) {
    const chatId = payload.conversation_id || payload.channel_id || payload.sender || "";
    const message = await this.#messages.mapBackendMessage(payload, chatId);
    this.#messages.addMessage(chatId, message);
  }

  handleReactionUpdate(payload: MessageReaction) {
    const chatId = payload.chat_id || payload.chatId;
    const messageId = payload.message_id || payload.messageId;
    if (!chatId || !messageId) return;

    this.#messages.updateMessage(chatId, messageId, (msg) => {
      const reactions = { ...(msg.reactions || {}) };
      const users = [...(reactions[payload.emoji] || [])];
      
      if (payload.action === "add") {
        if (!users.includes(payload.user_id || payload.userId || "")) {
          users.push(payload.user_id || payload.userId || "");
        }
      } else {
        const idx = users.indexOf(payload.user_id || payload.userId || "");
        if (idx !== -1) users.splice(idx, 1);
      }

      if (users.length === 0) {
        delete reactions[payload.emoji];
      } else {
        reactions[payload.emoji] = users;
      }

      return { ...msg, reactions };
    });
  }

  handleMessageDeleted(payload: DeleteMessage) {
    const chatId = payload.chat_id || payload.chatId;
    const messageId = payload.message_id || payload.messageId;
    if (chatId && messageId) {
      this.#messages.removeMessage(chatId, messageId);
    }
  }

  handleMessageEdited(payload: EditMessage) {
    const chatId = payload.chat_id || payload.chatId;
    const messageId = payload.message_id || payload.messageId;
    if (chatId && messageId) {
      this.#messages.updateMessage(chatId, messageId, (msg) => ({
        ...msg,
        content: payload.new_content || payload.newContent || msg.content,
        editedAt: payload.edited_at ? new Date(payload.edited_at).toISOString() : (payload.editedAt ? new Date(payload.editedAt).toISOString() : msg.editedAt),
        editedBy: payload.editor_id || payload.editorId || msg.editedBy,
      }));
    }
  }

  handleReadReceipt(payload: any) {
    const chatId = payload.chat_id || payload.chatId;
    if (chatId) {
      const msgs = this.#messages.messagesByChatId.get(chatId);
      if (msgs) {
        this.#messages.setMessages(chatId, msgs.map(m => ({ ...m, read: true })));
      }
    }
  }

  handleTypingIndicator(payload: any) {
    const chatId = payload.chat_id || payload.chatId;
    const userId = payload.user_id || payload.userId;
    const isTyping = payload.is_typing ?? payload.isTyping ?? false;
    if (chatId && userId) {
      this.#typing.handleTypingIndicator(chatId, userId, isTyping);
    }
  }

  async loadGroupChats() {
    try {
      const chats = await invoke<any[]>("get_group_chats");
      chats.forEach(c => this.#groupChats.upsertGroupChat(c));
    } catch (error) {
      console.error("Failed to load group chats:", error);
    }
  }

  async sendMessage(content: string, options?: SendMessageOptions) {
    if (!this.#activeChatId) return;
    
    const me = userStore.me;
    if (!me) return;

    try {
      if (this.#activeChatType === "dm") {
        await invoke("send_encrypted_dm", {
          recipientId: this.#activeChatId,
          message: content,
          ...options
        });
      } else if (this.#activeChatType === "group" || this.#activeChatType === "server") {
        await invoke("send_encrypted_group_message", {
          serverId: this.#activeChatId,
          channelId: this.#activeChannelId,
          message: content,
          ...options
        });
      } else {
        await invoke("send_message", {
          channelId: this.#activeChannelId || this.#activeChatId,
          message: content,
          ...options
        });
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      throw error;
    }
  }

  async addReaction(chatId: string, messageId: string, emoji: string) {
    try {
      await invoke("add_reaction", { chatId, messageId, emoji });
    } catch (error) {
      console.error("Failed to add reaction:", error);
    }
  }

  async removeReaction(chatId: string, messageId: string, emoji: string) {
    try {
      await invoke("remove_reaction", { chatId, messageId, emoji });
    } catch (error) {
      console.error("Failed to remove reaction:", error);
    }
  }

  async deleteMessage(chatId: string, messageId: string) {
    try {
      await invoke("delete_message", { chatId, messageId });
      this.#messages.removeMessage(chatId, messageId);
    } catch (error) {
      console.error("Failed to delete message:", error);
    }
  }

  async editMessage(chatId: string, messageId: string, newContent: string) {
    try {
      await invoke("edit_message", { chatId, messageId, newContent });
    } catch (error) {
      console.error("Failed to edit message:", error);
    }
  }

  async pinMessage(chatId: string, messageId: string) {
    try {
      await invoke("pin_message", { chatId, messageId });
      this.#messages.updateMessage(chatId, messageId, m => ({ ...m, pinned: true }));
    } catch (error) {
      console.error("Failed to pin message:", error);
    }
  }

  async unpinMessage(chatId: string, messageId: string) {
    try {
      await invoke("unpin_message", { chatId, messageId });
      this.#messages.updateMessage(chatId, messageId, m => ({ ...m, pinned: false }));
    } catch (error) {
      console.error("Failed to unpin message:", error);
    }
  }

  async sendTypingIndicator(isTyping: boolean) {
    if (!this.#activeChatId) return;
    try {
      await invoke("send_typing_indicator", {
        chatId: this.#activeChatId,
        isTyping
      });
    } catch (error) {
      console.error("Failed to send typing indicator:", error);
    }
  }

  async leaveGroupChat(groupId: string) {
    try {
      await invoke("leave_group_dm", { groupId });
      this.#groupChats.removeGroupChat(groupId);
    } catch (error) {
      console.error("Failed to leave group chat:", error);
    }
  }

  async renameGroupChat(groupId: string, name: string) {
    try {
      const chat = await invoke<any>("rename_group_dm", { groupId, name });
      return this.#groupChats.upsertGroupChat(chat);
    } catch (error) {
      console.error("Failed to rename group chat:", error);
      throw error;
    }
  }

  async addMembersToGroupChat(groupId: string, memberIds: string[]) {
    try {
      const chat = await invoke<any>("add_group_dm_member", { groupId, memberIds });
      return this.#groupChats.upsertGroupChat(chat);
    } catch (error) {
      console.error("Failed to add members to group chat:", error);
    }
  }

  async removeGroupChatMember(groupId: string, memberId: string) {
    try {
      const chat = await invoke<any>("remove_group_dm_member", { groupId, memberId });
      return this.#groupChats.upsertGroupChat(chat);
    } catch (error) {
      console.error("Failed to remove group chat member:", error);
    }
  }

  getResolvedChatPreferences(chatId: string) {
    return this.#preferences.getResolvedPreferences(chatId);
  }

  setChatPreferenceOverride(chatId: string, overrides: any) {
    this.#preferences.setOverride(chatId, overrides);
  }

  clearChatPreferenceOverride(chatId: string) {
    this.#preferences.clearOverride(chatId);
  }

  async loadAttachmentForMessage(chatId: string, messageId: string, attachmentId: string) {
    const msgs = this.#messages.messagesByChatId.get(chatId);
    const msg = msgs?.find(m => m.id === messageId);
    const attachment = msg?.attachments?.find(a => a.id === attachmentId);
    if (attachment?.objectUrl) return attachment.objectUrl;
    
    try {
      const rawBytes = await invoke<number[] | Uint8Array>("get_attachment_bytes", { attachmentId });
      const bytes = ensureUint8Array(rawBytes);
      if (!bytes || bytes.length === 0) return null;
      const mime = attachment?.type || "application/octet-stream";
      const blobSource = toArrayBuffer(bytes);
      const objectUrl = URL.createObjectURL(new Blob([blobSource], { type: mime }));
      
      this.#messages.updateMessage(chatId, messageId, m => {
        const nextAtts = m.attachments?.map(a => a.id === attachmentId ? { ...a, objectUrl, isLoaded: true } : a);
        return { ...m, attachments: nextAtts };
      });

      return objectUrl;
    } catch (error) {
      console.error("Failed to load attachment:", error);
      return null;
    }
  }

  async searchMessages(options: any) {
    try {
      const results = await invoke<any[]>("search_messages", options);
      const messages = await Promise.all(results.map(m => this.#messages.mapBackendMessage(m, options.chatId)));
      return {
        messages,
        hasMore: results.length >= (options.limit || 20),
        received: results.length,
        nextCursor: results.length > 0 ? results[results.length - 1].id : null
      };
    } catch (error) {
      console.error("Failed to search messages:", error);
      return { messages: [], hasMore: false, received: 0 };
    }
  }

  async copyMessageLink(messageId: string, chatId?: string) {
    const type = this.#activeChatType;
    const activeChatId = this.#activeChatId;
    const channelId = this.#activeChannelId;

    if (!type || !activeChatId) throw new Error("No active chat");

    let path = "";
    if (type === "dm") path = `/dm/${activeChatId}`;
    else if (type === "group") path = `/groups/${activeChatId}`;
    else if (type === "server") {
      const resChannelId = chatId || channelId;
      if (!resChannelId) throw new Error("No active channel");
      path = `/channels/${activeChatId}/${resChannelId}`;
    }

    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}${path}#message-${messageId}`;
    if (typeof navigator !== "undefined") {
      await navigator.clipboard.writeText(url);
    }
    return url;
  }
  
  handleGroupMemberLeft(groupId: string, memberId: string) {
    const chat = this.#groupChats.groupChats.get(groupId);
    if (chat) {
      this.#groupChats.upsertGroupChat({
        ...chat,
        member_ids: chat.memberIds.filter(id => id !== memberId)
      } as any);
    }
  }

  handleGroupMembersAdded(groupId: string, memberIds: string[]) {
    const chat = this.#groupChats.groupChats.get(groupId);
    if (chat) {
      this.#groupChats.upsertGroupChat({
        ...chat,
        member_ids: Array.from(new Set([...chat.memberIds, ...memberIds]))
      } as any);
    }
  }

  handleGroupChatCreated(chat: any) {
    return this.#groupChats.upsertGroupChat(chat);
  }

  async refreshChatFromStorage(chatId: string, chatType: string, channelId?: string) {
    const targetChatId = chatType === "server" ? channelId : chatId;
    if (targetChatId) {
       await this.loadMoreMessages(targetChatId);
    }
  }

  async sendMessageWithAttachments(content: string, files: File[], options?: SendMessageOptions) {
    const type = this.#activeChatType;
    const chatId = this.#activeChatId;
    const channelId = this.#activeChannelId;
    const me = userStore.me;

    if (!type || !chatId || !me) return;

    const attachmentsCombined = await Promise.all(
      files.map(async (file) => {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        return {
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
          data: bytes,
        };
      })
    );

    const encrypted = await encryptOutgoingMessagePayload({
      content,
      attachments: attachmentsCombined,
      chatType: type,
      chatId,
      channelId,
      senderId: me.id,
      recipientId: type === "dm" ? chatId : null,
    });

    try {
      if (type === "dm") {
        await invoke("send_encrypted_dm_with_attachments", {
          message: encrypted.content,
          recipientId: chatId,
          incomingAttachments: encrypted.attachments,
          ...options
        });
      } else {
        await invoke("send_message_with_attachments", {
          message: encrypted.content,
          attachments: encrypted.attachments,
          channelId,
          serverId: chatId,
          ...options
        });
      }
    } catch (error) {
      console.error("Failed to send message with attachments:", error);
      throw error;
    }
  }

  async retryMessageSend(chatId: string, messageId: string) {
    const msgs = this.#messages.messagesByChatId.get(chatId);
    const msg = msgs?.find(m => m.id === messageId);
    if (msg) {
      return this.sendMessage(msg.content);
    }
  }

  async overrideSpamDecision(chatId: string, messageId: string, decision: string) {
    try {
      await invoke("override_spam_decision", { chatId, messageId, decision });
      this.#messages.updateMessage(chatId, messageId, m => ({ ...m, spamDecision: decision as any }));
    } catch (error) {
      console.error("Failed to override spam decision:", error);
    }
  }
}

export const chatStore = new ChatStore();
