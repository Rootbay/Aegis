import { writable, get, derived, type Readable } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import type { Message } from '$lib/models/Message';
import type { ChatMessage } from '$lib/models/AepMessage';
import { userStore } from './userStore';

type BackendMessage = {
  id: string;
  chat_id?: string;
  chatId?: string;
  sender_id?: string;
  senderId?: string;
  content: string;
  timestamp: string | number | Date;
  read?: boolean;
};

interface ChatStore {
  messagesByChatId: Readable<Map<string, Message[]>>;
  hasMoreByChatId: Readable<Map<string, boolean>>;
  activeChatId: Readable<string | null>;
  activeChatType: Readable<'dm' | 'server' | null>;
  activeChannelId: Readable<string | null>;
  loadingMessages: Readable<boolean>;
  setActiveChat: (chatId: string, chatType: 'dm' | 'server', channelId?: string) => Promise<void>;
  handleMessagesUpdate: (chatId: string, messages: Message[]) => void;
  sendMessage: (content: string) => Promise<void>;
  sendMessageWithAttachments: (content: string, files: File[]) => Promise<void>;
  deleteMessage: (chatId: string, messageId: string) => Promise<void>;
  handleNewMessageEvent: (message: ChatMessage) => void;
  clearActiveChat: () => void;
  loadMoreMessages: (targetChatId: string) => Promise<void>;
  addReaction: (targetChatId: string, messageId: string, emoji: string) => Promise<void>;
  removeReaction: (targetChatId: string, messageId: string, emoji: string) => Promise<void>;
}

function createChatStore(): ChatStore {
  const messagesByChatIdStore = writable<Map<string, Message[]>>(new Map());
  const hasMoreByChatIdStore = writable<Map<string, boolean>>(new Map());
  const activeChatId = writable<string | null>(typeof localStorage !== 'undefined' ? localStorage.getItem('activeChatId') : null);
  const activeChatType = writable<'dm' | 'server' | null>(typeof localStorage !== 'undefined' ? (localStorage.getItem('activeChatType') as 'dm' | 'server') : null);
  const activeChannelId = writable<string | null>(typeof localStorage !== 'undefined' ? localStorage.getItem('activeChannelId') : null);
  const loadingMessages = writable<boolean>(false);
  const PAGE_LIMIT = 50;

  const setActiveChat = async (chatId: string, type: 'dm' | 'server', channelId?: string) => {
    activeChatId.set(chatId);
    activeChatType.set(type);
    activeChannelId.set(channelId || null);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('activeChatId', chatId);
      localStorage.setItem('activeChatType', type);
      if (channelId) {
        localStorage.setItem('activeChannelId', channelId);
      } else {
        localStorage.removeItem('activeChannelId');
      }
    }
    const messageChatId = type === 'server' ? channelId : chatId;
    if (messageChatId) {
      messagesByChatIdStore.update(map => {
        map.set(messageChatId, []);
        return new Map(map);
      });
      hasMoreByChatIdStore.update(map => {
        map.set(messageChatId, true);
        return new Map(map);
      });
      loadingMessages.set(true);
      try {
        const fetched: BackendMessage[] = await invoke('get_messages', { chatId: messageChatId, limit: PAGE_LIMIT, offset: 0 });
        const mapped = fetched.map((m: BackendMessage) => ({
          id: m.id,
          chatId: m.chat_id ?? m.chatId ?? messageChatId,
          senderId: m.sender_id ?? m.senderId,
          content: m.content,
          timestamp: typeof m.timestamp === 'string' ? m.timestamp : new Date(m.timestamp).toISOString(),
          read: m.read ?? true,
        })) as Message[];
        handleMessagesUpdate(messageChatId, mapped);
        hasMoreByChatIdStore.update(map => {
          map.set(messageChatId, fetched.length >= PAGE_LIMIT);
          return new Map(map);
        });
      } catch (e) {
        console.error('Failed to fetch messages:', e);
        loadingMessages.set(false);
      }
    }
  };

  const handleMessagesUpdate = (chatId: string, messages: Message[]) => {
    messagesByChatIdStore.update(map => {
      map.set(chatId, messages);
      return new Map(map);
    });
    loadingMessages.set(false);
  };

  const loadMoreMessages = async (targetChatId: string) => {
    loadingMessages.set(true);
    try {
      const current = get(messagesByChatIdStore).get(targetChatId) || [];
      const fetched: BackendMessage[] = await invoke('get_messages', { chatId: targetChatId, limit: PAGE_LIMIT, offset: current.length });
      const mapped = fetched.map((m: BackendMessage) => ({
        id: m.id,
        chatId: m.chat_id ?? m.chatId ?? targetChatId,
        senderId: m.sender_id ?? m.senderId,
        content: m.content,
        timestamp: typeof m.timestamp === 'string' ? m.timestamp : new Date(m.timestamp).toISOString(),
        read: m.read ?? true,
      })) as Message[];
      let newAdds = 0;
      messagesByChatIdStore.update(map => {
        const existing = map.get(targetChatId) || [];
        const seen = new Set(existing.map(m => m.id));
        const deduped = [] as Message[];
        for (const m of mapped) {
          if (!seen.has(m.id)) {
            deduped.push(m);
            seen.add(m.id);
          }
        }
        newAdds = deduped.length;
        map.set(targetChatId, [...deduped, ...existing]);
        return new Map(map);
      });
      hasMoreByChatIdStore.update(map => {
        const hasMore = fetched.length >= PAGE_LIMIT && newAdds > 0;
        map.set(targetChatId, hasMore);
        return new Map(map);
      });
    } catch (e) {
      console.error('Failed to load more messages:', e);
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

    const messageChatId = type === 'server' ? channelId : chatId;
    if (!messageChatId) return;

    const tempId = Date.now().toString();
    const newMessage: Message = {
      id: tempId,
      chatId: messageChatId,
      senderId: me.id,
      content: content,
      timestamp: new Date().toISOString(),
      read: true,
    };

    messagesByChatIdStore.update(map => {
      const existing = map.get(messageChatId) || [];
      map.set(messageChatId, [...existing, newMessage]);
      return new Map(map);
    });

    try {
      await invoke('send_message', {
        message: content,
        channelId: type === 'server' ? channelId : null,
        serverId: type === 'server' ? chatId : null,
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      messagesByChatIdStore.update((map) => {
        const existing = map.get(messageChatId) || [];
        map.set(messageChatId, existing.filter(msg => msg.id !== tempId));
        return new Map(map);
      });
    }
  };

  const sendMessageWithAttachments = async (content: string, files: File[]) => {
    const type = get(activeChatType);
    const chatId = get(activeChatId);
    const channelId = get(activeChannelId);
    const me = get(userStore).me;

    if (!type || !chatId || !me) return;
    const messageChatId = type === 'server' ? channelId : chatId;
    if (!messageChatId) return;

    const tempId = Date.now().toString() + '-a';
    const attachments = files.map((f) => ({ name: f.name, type: f.type, size: f.size, url: URL.createObjectURL(f) }));
    const newMessage: Message = {
      id: tempId,
      chatId: messageChatId,
      senderId: me.id,
      content: content,
      timestamp: new Date().toISOString(),
      read: true,
      attachments,
    };
    messagesByChatIdStore.update((map) => {
      const existing = map.get(messageChatId) || [];
      map.set(messageChatId, [...existing, newMessage]);
      return new Map(map);
    });

    try {
      await invoke('send_message_with_attachments', {
        message: content,
        attachments: attachments.map(a => ({ name: a.name, type: a.type, size: a.size })),
        channelId: type === 'server' ? channelId : null,
        serverId: type === 'server' ? chatId : null,
      });
    } catch (error) {
      console.error('Failed to send message with attachments:', error);
      messagesByChatIdStore.update((map) => {
        const existing = map.get(messageChatId) || [];
        map.set(messageChatId, existing.filter(msg => msg.id !== tempId));
        return new Map(map);
      });
    }
  };

  const deleteMessage = async (targetChatId: string, messageId: string) => {
    messagesByChatIdStore.update((map) => {
      const existing = map.get(targetChatId) || [];
      map.set(targetChatId, existing.filter((m) => m.id !== messageId));
      return new Map(map);
    });
    try {
      await invoke('delete_message', { chatId: targetChatId, messageId });
    } catch (e) {
      console.error('Failed to delete message:', e);
    }
  };

  const handleNewMessageEvent = (message: ChatMessage) => {
    const { sender, content, channel_id } = message;
    const me = get(userStore).me;

    if (sender === me?.id) return;

    let targetChatId: string | null = null;
    if (channel_id) {
        targetChatId = channel_id;
    } else {
        targetChatId = sender;
    }

    if (targetChatId) {
        const newMessage: Message = {
            id: Date.now().toString(),
            chatId: targetChatId,
            senderId: sender,
            content: content,
            timestamp: new Date().toISOString(),
            read: false,
        };
        messagesByChatIdStore.update((map) => {
            const existing = map.get(targetChatId) || [];
            map.set(targetChatId, [...existing, newMessage]);
            return new Map(map);
        });
    }
  };

  const clearActiveChat = () => {
    activeChatId.set(null);
    activeChatType.set(null);
    activeChannelId.set(null);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('activeChatId');
      localStorage.removeItem('activeChatType');
      localStorage.removeItem('activeChannelId');
    }
  };

  const addReaction = async (targetChatId: string, messageId: string, emoji: string) => {
    const me = get(userStore).me;
    if (!me) return;
    messagesByChatIdStore.update((map) => {
      const existing = map.get(targetChatId) || [];
      const updated = existing.map(m => {
        if (m.id !== messageId) return m;
        const reactions = { ...(m.reactions || {}) } as Record<string, string[]>;
        const users = new Set(reactions[emoji] || []);
        users.add(me.id);
        reactions[emoji] = Array.from(users);
        return { ...m, reactions };
      });
      map.set(targetChatId, updated);
      return new Map(map);
    });
    try {
      await invoke('add_reaction', { chatId: targetChatId, messageId, emoji });
    } catch (e) {
      console.debug('add_reaction not available or failed', e);
    }
  };

  const removeReaction = async (targetChatId: string, messageId: string, emoji: string) => {
    const me = get(userStore).me;
    if (!me) return;
    messagesByChatIdStore.update((map) => {
      const existing = map.get(targetChatId) || [];
      const updated = existing.map(m => {
        if (m.id !== messageId) return m;
        const reactions = { ...(m.reactions || {}) } as Record<string, string[]>;
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
      await invoke('remove_reaction', { chatId: targetChatId, messageId, emoji });
    } catch (e) {
      console.debug('remove_reaction not available or failed', e);
    }
  };

  return {
    messagesByChatId: derived(messagesByChatIdStore, $map => $map),
    hasMoreByChatId: derived(hasMoreByChatIdStore, $map => $map),
    activeChatId: derived(activeChatId, $id => $id),
    activeChatType: derived(activeChatType, $type => $type),
    activeChannelId: derived(activeChannelId, $id => $id),
    loadingMessages: derived(loadingMessages, $loading => $loading),
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


