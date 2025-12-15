import { cleanup, render, screen, waitFor, within } from "@testing-library/svelte";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";

import ActiveChatContent from "../../../src/lib/layout/app/ActiveChatContent.svelte";
import { chatSearchStore } from "../../../src/lib/features/chat/stores/chatSearchStore";
import type { Message } from "../../../src/lib/features/chat/models/Message";
import type { Friend } from "../../../src/lib/features/friends/models/Friend";

type WritableStore<T> = {
  subscribe: (run: (value: T) => void) => () => void;
  set: (value: T) => void;
};

const storeMocks = vi.hoisted(() => {
  function createWritableStore<T>(initial: T): WritableStore<T> {
    let value = initial;
    const subscribers = new Set<(current: T) => void>();
    return {
      subscribe(run) {
        run(value);
        subscribers.add(run);
        return () => {
          subscribers.delete(run);
        };
      },
      set(nextValue) {
        value = nextValue;
        subscribers.forEach((run) => run(value));
      },
    };
  }

  return {
    messagesStore: createWritableStore(new Map<string, Message[]>()),
    userState: createWritableStore({
      me: { id: "user-1", name: "Tester", avatar: "", online: true },
    }),
    serverState: createWritableStore({ activeServerId: null, servers: [] as never[] }),
  };
}) as {
  messagesStore: WritableStore<Map<string, Message[]>>;
  userState: WritableStore<{ me: { id: string; name: string; avatar: string; online: boolean } }>;
  serverState: WritableStore<{ activeServerId: string | null; servers: never[] }>;
};

vi.mock("$lib/features/chat/stores/chatStore", () => ({
  messagesByChatId: { subscribe: storeMocks.messagesStore.subscribe },
}));

vi.mock("$lib/stores/userStore", () => ({
  userStore: { subscribe: storeMocks.userState.subscribe },
}));

vi.mock("$lib/features/servers/stores/serverStore", () => ({
  serverStore: { subscribe: storeMocks.serverState.subscribe },
  activeServerEmojiCategories: {
    subscribe: (run: (value: unknown) => void) => {
      run([]);
      return () => {};
    },
  },
}));

vi.mock("onnxruntime-web/wasm", () => ({}));

vi.mock("$lib/features/security/spamModelInference", () => ({
  loadSpamModel: vi.fn(),
  inferSpamProbability: vi.fn().mockResolvedValue(0),
}));

const { messagesStore } = storeMocks;

const friend: Friend = {
  id: "friend-1",
  name: "Friend One",
  avatar: "",
  online: true,
  status: "Online",
  timestamp: new Date().toISOString(),
  messages: [],
};

const chat = {
  type: "dm" as const,
  id: "chat-1",
  friend,
  messages: [] as Message[],
};

const originalInnerWidth = globalThis.innerWidth;

describe("ActiveChatContent mobile search", () => {
  beforeAll(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 640,
    });
  });

  beforeEach(() => {
    cleanup();
    chatSearchStore.reset();
    messagesStore.set(new Map());
  });

  afterEach(() => {
    cleanup();
    chatSearchStore.reset();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: originalInnerWidth,
    });
  });

  it("shows search results in a mobile dialog when a search is active", async () => {
    const message: Message = {
      id: "msg-1",
      chatId: "chat-1",
      senderId: "friend-1",
      content: "This message should appear in the mobile results list",
      timestamp: new Date().toISOString(),
      read: true,
    };

    messagesStore.set(new Map([["chat-1", [message]]]));

    chatSearchStore.setQuery("message");
    chatSearchStore.executeSearch();
    const { searchRequestId } = get(chatSearchStore);
    chatSearchStore.setSearchLoading(searchRequestId, false);
    chatSearchStore.recordSearchPage(searchRequestId, {
      cursor: null,
      hasMore: false,
      results: 1,
    });
    chatSearchStore.setMatches([0]);
    chatSearchStore.setMobileResultsOpen(true);

    render(ActiveChatContent, {
      chat,
      openDetailedProfileModal: vi.fn(),
    });

    const panel = await waitFor(() =>
      screen.getByTestId("mobile-search-results"),
    );

    expect(panel).toBeVisible();

    const withinPanel = within(panel);
    expect(withinPanel.getByText("Friend One")).toBeInTheDocument();
    expect(
      withinPanel.getByText(/should appear in the mobile results list/i),
    ).toBeInTheDocument();

    const nextButton = withinPanel.getByRole("button", { name: /next/i });
    expect(nextButton).toBeEnabled();
  });
});
