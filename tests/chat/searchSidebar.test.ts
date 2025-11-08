import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { get } from "svelte/store";

import type { Message } from "../../src/lib/features/chat/models/Message";
import type { Friend } from "../../src/lib/features/friends/models/Friend";
import SearchSidebar from "../../src/lib/components/sidebars/SearchSidebar.svelte";
import { chatSearchStore } from "../../src/lib/features/chat/stores/chatSearchStore";

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
}));

const { messagesStore, userState, serverState } = storeMocks;

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

describe("SearchSidebar", () => {
  beforeAll(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);

    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback): number => {
        return setTimeout(() => cb(performance.now()), 0) as unknown as number;
      },
    );

    vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
      clearTimeout(handle);
    });
  });

  beforeEach(() => {
    cleanup();
    chatSearchStore.reset();
    messagesStore.set(new Map());
  });

  afterEach(() => {
    cleanup();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("renders a loading indicator while search results are fetching", () => {
    chatSearchStore.setQuery("hello");
    chatSearchStore.executeSearch();
    const { searchRequestId } = get(chatSearchStore);
    chatSearchStore.setSearchLoading(searchRequestId, true);

    render(SearchSidebar, { chat });

    expect(screen.getByText("Searching conversation…")).toBeInTheDocument();
  });

  it("shows an empty state when a search completes without matches", () => {
    chatSearchStore.setQuery("hello");
    chatSearchStore.executeSearch();
    const { searchRequestId } = get(chatSearchStore);
    chatSearchStore.setSearchLoading(searchRequestId, false);
    chatSearchStore.recordSearchPage(searchRequestId, {
      cursor: null,
      hasMore: false,
      results: 0,
    });

    render(SearchSidebar, { chat });

    expect(screen.getByText("No results found")).toBeInTheDocument();
  });

  it("lists matches when search results are available", () => {
    const message: Message = {
      id: "msg-1",
      chatId: "chat-1",
      senderId: "friend-1",
      content: "This is a highlighted search message",
      timestamp: new Date().toISOString(),
      read: true,
    };
    messagesStore.set(new Map([["chat-1", [message]]]));
    chatSearchStore.setQuery("search");
    chatSearchStore.executeSearch();
    const { searchRequestId } = get(chatSearchStore);
    chatSearchStore.setSearchLoading(searchRequestId, false);
    chatSearchStore.recordSearchPage(searchRequestId, {
      cursor: null,
      hasMore: false,
      results: 1,
    });
    chatSearchStore.setMatches([0]);

    render(SearchSidebar, { chat });

    expect(screen.getByText("Friend One")).toBeInTheDocument();
    const highlightedMatches = screen.getAllByText((_, element) =>
      element?.textContent?.includes("highlighted search message") ?? false,
    );
    expect(highlightedMatches.length).toBeGreaterThan(0);
  });

  it("shows a load more button when additional pages exist", async () => {
    const message: Message = {
      id: "msg-1",
      chatId: "chat-1",
      senderId: "friend-1",
      content: "Search pagination example",
      timestamp: new Date().toISOString(),
      read: true,
    };
    messagesStore.set(new Map([["chat-1", [message]]]));
    chatSearchStore.setQuery("search");
    chatSearchStore.executeSearch();
    const { searchRequestId } = get(chatSearchStore);
    chatSearchStore.recordSearchPage(searchRequestId, {
      cursor: "cursor-1",
      hasMore: true,
      results: 1,
    });
    chatSearchStore.setSearchLoading(searchRequestId, false);
    chatSearchStore.setMatches([0]);

    render(SearchSidebar, { chat });

    const button = await screen.findByRole("button", {
      name: /load more results/i,
    });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();

    await fireEvent.click(button);

    await waitFor(() => {
      expect(get(chatSearchStore).loadMoreRequests).toBe(1);
      expect(button).toBeDisabled();
    });
  });
});
