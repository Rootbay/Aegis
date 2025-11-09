import { render, fireEvent } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { get, writable } from "svelte/store";
import type { Chat } from "$lib/features/chat/models/Chat";
import type { Message } from "$lib/features/chat/models/Message";
import type { Friend } from "$lib/features/friends/models/Friend";

const overridesStore = writable(
  new Map<string, { readReceiptsEnabled?: boolean; typingIndicatorsEnabled?: boolean }>(),
);
const messagesStore = writable(new Map<string, unknown[]>());
const hasMoreStore = writable(new Map<string, boolean>());
const basePreferences = writable({
  readReceiptsEnabled: false,
  typingIndicatorsEnabled: false,
});

const setChatPreferenceOverride = vi.fn(
  (
    chatId: string,
    overrides: Partial<{ readReceiptsEnabled: boolean; typingIndicatorsEnabled: boolean }>,
  ) => {
    overridesStore.update((map) => {
      const next = new Map(map);
      const existing = next.get(chatId) ?? {};
      const merged = { ...existing, ...overrides };
      if (
        typeof merged.readReceiptsEnabled !== "boolean" &&
        typeof merged.typingIndicatorsEnabled !== "boolean"
      ) {
        next.delete(chatId);
      } else {
        next.set(chatId, merged);
      }
      return next;
    });
  },
);

const clearChatPreferenceOverride = vi.fn((chatId: string) => {
  overridesStore.update((map) => {
    const next = new Map(map);
    next.delete(chatId);
    return next;
  });
});

const getResolvedChatPreferences = vi.fn((chatId: string) => {
  const overrides = get(overridesStore).get(chatId);
  const fallback = get(basePreferences);
  return {
    readReceiptsEnabled:
      typeof overrides?.readReceiptsEnabled === "boolean"
        ? overrides.readReceiptsEnabled
        : fallback.readReceiptsEnabled,
    typingIndicatorsEnabled:
      typeof overrides?.typingIndicatorsEnabled === "boolean"
        ? overrides.typingIndicatorsEnabled
        : fallback.typingIndicatorsEnabled,
  };
});

vi.mock("$lib/features/chat/stores/chatStore", () => ({
  chatStore: {
    chatPreferenceOverrides: { subscribe: overridesStore.subscribe },
    getResolvedChatPreferences,
    setChatPreferenceOverride,
    clearChatPreferenceOverride,
    loadMoreMessages: vi.fn(),
    leaveGroupChat: vi.fn(),
    renameGroupChat: vi.fn(),
    addMembersToGroupChat: vi.fn(),
    removeGroupChatMember: vi.fn(),
    messagesByChatId: { subscribe: messagesStore.subscribe },
    hasMoreByChatId: { subscribe: hasMoreStore.subscribe },
  },
  hasMoreByChatId: { subscribe: hasMoreStore.subscribe },
  messagesByChatId: { subscribe: messagesStore.subscribe },
}));

vi.mock("$lib/features/channels/stores/channelDisplayPreferencesStore", () => ({
  channelDisplayPreferencesStore: {
    subscribe: writable(new Map()).subscribe,
    toggleHideMemberNames: vi.fn(),
  },
}));

vi.mock("$lib/features/chat/stores/memberSidebarVisibilityStore", () => ({
  memberSidebarVisibilityStore: {
    subscribe: writable(new Map()).subscribe,
    toggleVisibility: vi.fn(),
  },
}));

vi.mock("$lib/stores/ToastStore", () => ({
  toasts: { addToast: vi.fn() },
}));

vi.mock("$lib/features/settings/stores/settings", () => ({
  settings: writable({
    enableReadReceipts: false,
    enableTypingIndicators: false,
    ephemeralMessageDuration: 60,
  }),
}));

import ChatActionMenu from "$lib/components/navigation/ChatActionMenu.svelte";

const friend: Friend = {
  id: "friend-1",
  name: "Test Friend",
  avatar: "https://example.com/avatar.png",
  online: false,
  status: "Offline",
  timestamp: new Date().toISOString(),
  messages: [],
};

const dmChat: Chat = {
  type: "dm",
  id: "chat-1",
  friend,
  messages: [] as Message[],
};

describe("ChatActionMenu chat preferences", () => {
  beforeEach(() => {
    overridesStore.set(new Map());
    basePreferences.set({ readReceiptsEnabled: false, typingIndicatorsEnabled: false });
    setChatPreferenceOverride.mockClear();
    clearChatPreferenceOverride.mockClear();
    getResolvedChatPreferences.mockClear();
  });

  it("opens the preferences dialog and toggles overrides", async () => {
    const { getByLabelText, getAllByRole } = render(ChatActionMenu, {
      props: { chat: dmChat, applyPinnedFilter: vi.fn() },
    });

    await fireEvent.click(getByLabelText("Chat preferences"));

    const switches = getAllByRole("switch");
    await fireEvent.click(switches[0]);
    expect(setChatPreferenceOverride).toHaveBeenNthCalledWith(1, "chat-1", {
      readReceiptsEnabled: true,
    });

    await fireEvent.click(switches[1]);
    expect(setChatPreferenceOverride).toHaveBeenNthCalledWith(2, "chat-1", {
      typingIndicatorsEnabled: true,
    });
  });

  it("resets chat-specific overrides", async () => {
    overridesStore.set(
      new Map([
        [
          "chat-1",
          { readReceiptsEnabled: true, typingIndicatorsEnabled: true },
        ],
      ]),
    );

    const { getByLabelText, getByRole } = render(ChatActionMenu, {
      props: { chat: dmChat, applyPinnedFilter: vi.fn() },
    });

    await fireEvent.click(getByLabelText("Chat preferences"));

    const footer = getByRole("button", { name: "Reset to defaults" }).parentElement;
    expect(footer).toBeTruthy();

    await fireEvent.click(getByRole("button", { name: "Reset to defaults" }));
    expect(clearChatPreferenceOverride).toHaveBeenCalledWith("chat-1");
  });
});
