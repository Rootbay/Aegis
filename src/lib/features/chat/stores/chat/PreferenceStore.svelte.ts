import { SvelteMap } from "svelte/reactivity";
import { persistentStore } from "$lib/stores/persistentStore";
import type { ChatPreferenceOverrides, ChatPreferenceState, ResolvedChatPreferences } from "./types";
import { get } from "svelte/store";
import { settings } from "$lib/features/settings/stores/settings";

const CHAT_PREFERENCE_OVERRIDES_KEY = "chatPreferenceOverrides";

export class PreferenceStore {
  #overrides = persistentStore<ChatPreferenceState>(CHAT_PREFERENCE_OVERRIDES_KEY, {});
  
  get overrides() { return this.#overrides; }

  setOverride(chatId: string, overrides: Partial<ChatPreferenceOverrides>) {
    this.#overrides.update(current => {
      const existing = current[chatId] ?? {};
      return {
        ...current,
        [chatId]: { ...existing, ...overrides }
      };
    });
  }

  clearOverride(chatId: string) {
    this.#overrides.update(current => {
      const next = { ...current };
      delete next[chatId];
      return next;
    });
  }

  getResolvedPreferences(chatId: string, serverModeration?: any): ResolvedChatPreferences {
    const allOverrides = get(this.#overrides);
    const overrides = allOverrides[chatId];
    const currentSettings = get(settings);

    const readReceiptsEnabled =
      typeof overrides?.readReceiptsEnabled === "boolean"
        ? overrides.readReceiptsEnabled
        : serverModeration?.readReceiptsEnabled ?? currentSettings.enableReadReceipts;

    const typingIndicatorsEnabled =
      typeof overrides?.typingIndicatorsEnabled === "boolean"
        ? overrides.typingIndicatorsEnabled
        : currentSettings.enableTypingIndicators;

    return { readReceiptsEnabled, typingIndicatorsEnabled };
  }
}
