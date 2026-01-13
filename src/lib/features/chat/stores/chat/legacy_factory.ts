import { ChatStore } from "./ChatStore.svelte";

/**
 * Legacy factory function for tests that expect a fresh store instance.
 */
export function createChatStore(options?: { maxMessagesPerChat?: number }) {
  return new ChatStore(options);
}
