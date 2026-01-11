import { SvelteMap } from "svelte/reactivity";

const TYPING_INDICATOR_TIMEOUT_MS = 4_000;

export class TypingStore {
  #typingByChatId = new SvelteMap<string, string[]>();
  #typingTimeouts = new Map<string, Map<string, ReturnType<typeof setTimeout>>>();

  get typingByChatId() { return this.#typingByChatId; }

  handleTypingIndicator(chatId: string, userId: string, isTyping: boolean) {
    const timers = this.#typingTimeouts.get(chatId) ?? new Map();
    
    if (isTyping) {
      this.#addTypingUser(chatId, userId);
      const existingTimeout = timers.get(userId);
      if (existingTimeout) clearTimeout(existingTimeout);
      
      const timeout = setTimeout(() => {
        this.#removeTypingUser(chatId, userId);
        timers.delete(userId);
      }, TYPING_INDICATOR_TIMEOUT_MS);
      
      timers.set(userId, timeout);
    } else {
      this.#removeTypingUser(chatId, userId);
      const timeout = timers.get(userId);
      if (timeout) clearTimeout(timeout);
      timers.delete(userId);
    }
    
    this.#typingTimeouts.set(chatId, timers);
  }

  #addTypingUser(chatId: string, userId: string) {
    const current = this.#typingByChatId.get(chatId) ?? [];
    if (!current.includes(userId)) {
      this.#typingByChatId.set(chatId, [...current, userId]);
    }
  }

  #removeTypingUser(chatId: string, userId: string) {
    const current = this.#typingByChatId.get(chatId) ?? [];
    const next = current.filter(id => id !== userId);
    if (next.length === 0) {
      this.#typingByChatId.delete(chatId);
    } else {
      this.#typingByChatId.set(chatId, next);
    }
  }

  clearTypingState(chatId: string) {
    const timers = this.#typingTimeouts.get(chatId);
    if (timers) {
      timers.forEach(t => clearTimeout(t));
      this.#typingTimeouts.delete(chatId);
    }
    this.#typingByChatId.delete(chatId);
  }
}
