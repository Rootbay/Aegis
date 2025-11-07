import { render } from "@testing-library/svelte";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tick } from "svelte";

import { createAppHandlers } from "$lib/layout/app/handlers";
import ChannelPage from "../../src/routes/channels/[serverId]/[channelId]/+page.svelte";
import type { ModalManager } from "$lib/layout/app/modalManager";

const { gotoMock } = vi.hoisted(() => ({ gotoMock: vi.fn() }));
const { setActiveChatMock } = vi.hoisted(() => ({
  setActiveChatMock: vi.fn(async () => {}),
}));

const { commandPaletteStoreMock } = vi.hoisted(() => ({
  commandPaletteStoreMock: {
    open: vi.fn(),
    close: vi.fn(),
    isOpen: {
      subscribe: (run: (value: boolean) => void) => {
        run(false);
        return () => {};
      },
    },
  },
}));

const { pageStore, setPage } = vi.hoisted(() => {
  type PageValue = {
    params: { serverId?: string; channelId?: string };
    url: URL;
  };

  let value: PageValue = {
    params: { serverId: "server-1", channelId: "channel-1" },
    url: new URL("http://localhost/channels/server-1/channel-1"),
  };
  const subscribers = new Set<(next: PageValue) => void>();

  return {
    pageStore: {
      subscribe(run: (next: PageValue) => void) {
        run(value);
        subscribers.add(run);
        return () => {
          subscribers.delete(run);
        };
      },
    },
    setPage(next: PageValue) {
      value = next;
      subscribers.forEach((run) => run(value));
    },
  };
});

const { serverStoreMock, setServerState } = vi.hoisted(() => {
  type ServerState = {
    servers: Array<{
      id: string;
      name: string;
      channels?: Array<{
        id: string;
        server_id: string;
        name: string;
        channel_type: "text" | "voice";
        private: boolean;
      }>;
      members?: unknown[];
    }>;
  };

  let value: ServerState = { servers: [] };
  const subscribers = new Set<(next: ServerState) => void>();

  return {
    serverStoreMock: {
      subscribe(run: (next: ServerState) => void) {
        run(value);
        subscribers.add(run);
        return () => {
          subscribers.delete(run);
        };
      },
    },
    setServerState(next: ServerState) {
      value = next;
      subscribers.forEach((run) => run(value));
    },
  };
});

const { activeChatIdStore, activeChatTypeStore, activeServerChannelIdStore, messagesByChatIdStore } =
  vi.hoisted(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { writable } = require("svelte/store") as typeof import("svelte/store");

    return {
      activeChatIdStore: writable<string | null>(null),
      activeChatTypeStore: writable<"dm" | "server" | "group" | null>(null),
      activeServerChannelIdStore: writable<string | null>(null),
      messagesByChatIdStore: writable<Map<string, unknown>>(new Map()),
    };
  });

vi.mock("$app/navigation", () => ({
  goto: gotoMock,
}));

vi.mock("$app/stores", () => ({
  page: pageStore,
}));

vi.mock("$lib/features/navigation/commandPaletteStore", () => ({
  commandPaletteStore: commandPaletteStoreMock,
}));

vi.mock("$lib/features/chat/stores/chatStore", () => ({
  chatStore: {
    setActiveChat: setActiveChatMock,
  },
  activeChatId: activeChatIdStore,
  activeChatType: activeChatTypeStore,
  activeServerChannelId: activeServerChannelIdStore,
  messagesByChatId: messagesByChatIdStore,
}));

vi.mock("$lib/features/servers/stores/serverStore", () => ({
  serverStore: serverStoreMock,
}));

vi.mock("$features/chat", async () => ({
  ChatView: (await import("../mocks/Passthrough.svelte")).default,
}));

function noopStore<T>(value: T) {
  return {
    subscribe: (run: (v: T) => void) => {
      run(value);
      return () => {};
    },
  };
}

const modalManagerStub: ModalManager = {
  state: {
    activeModal: noopStore<null>(null),
    modalProps: noopStore<Record<string, unknown>>({}),
  },
  openModal: vi.fn(),
  closeModal: vi.fn(),
  openUserCardModal: vi.fn(),
  openDetailedProfileModal: vi.fn(),
  openProfileReviewsModal: vi.fn(),
  openCreateGroupModal: vi.fn(),
  openReportUserModal: vi.fn(),
  openCollaborativeDocument: vi.fn(),
  openCollaborativeWhiteboard: vi.fn(),
};

function resetPageTo(serverId: string, channelId: string) {
  setPage({
    params: { serverId, channelId },
    url: new URL(`http://localhost/channels/${serverId}/${channelId}`),
  });
}

describe("handleSelectChannel navigation", () => {
  beforeEach(() => {
    gotoMock.mockClear();
    setActiveChatMock.mockClear();
  });

  it("navigates to the requested channel after updating chat state", () => {
    const handlers = createAppHandlers(modalManagerStub);

    handlers.handleSelectChannel("server-123", "channel-456");

    expect(setActiveChatMock).toHaveBeenCalledWith(
      "server-123",
      "server",
      "channel-456",
    );
    expect(gotoMock).toHaveBeenCalledWith("/channels/server-123/channel-456");
    expect(
      setActiveChatMock.mock.invocationCallOrder[0] <
        gotoMock.mock.invocationCallOrder[0],
    ).toBe(true);
  });

  it("does nothing when the channel id is missing", () => {
    const handlers = createAppHandlers(modalManagerStub);

    handlers.handleSelectChannel("server-123", null);

    expect(setActiveChatMock).not.toHaveBeenCalled();
    expect(gotoMock).not.toHaveBeenCalled();
  });
});

describe("channel route synchronization", () => {
  beforeEach(() => {
    gotoMock.mockClear();
    setActiveChatMock.mockClear();
    setServerState({
      servers: [
        {
          id: "server-1",
          name: "Test Server",
          channels: [
            {
              id: "channel-1",
              server_id: "server-1",
              name: "general",
              channel_type: "text",
              private: false,
            },
            {
              id: "channel-2",
              server_id: "server-1",
              name: "random",
              channel_type: "text",
              private: false,
            },
          ],
          members: [],
        },
      ],
    });
    activeChatTypeStore.set("server");
    activeChatIdStore.set("server-1");
    activeServerChannelIdStore.set("channel-1");
    resetPageTo("server-1", "channel-1");
  });

  afterEach(() => {
    setActiveChatMock.mockClear();
  });

  it("restores the active channel from the route on initial load", () => {
    render(ChannelPage);

    expect(setActiveChatMock).toHaveBeenCalledWith(
      "server-1",
      "server",
      "channel-1",
    );
  });

  it("reacts to subsequent route changes", async () => {
    render(ChannelPage);
    setActiveChatMock.mockClear();

    resetPageTo("server-1", "channel-2");
    await tick();

    expect(setActiveChatMock).toHaveBeenCalledWith(
      "server-1",
      "server",
      "channel-2",
    );
  });
});
