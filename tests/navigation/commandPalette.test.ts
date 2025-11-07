import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, waitFor, cleanup } from "@testing-library/svelte";
import { get } from "svelte/store";

const { gotoMock } = vi.hoisted(() => ({ gotoMock: vi.fn() }));

const {
  directMessageEntries,
  metadataState,
  serverState,
  settingsState,
  setActiveChatMock,
  setActiveServerMock,
} = vi.hoisted(() => {
  const { writable } = require("svelte/store");
  const dm = writable([] as any[]);
  const metadata = writable(new Map());
  const servers = writable({
    servers: [],
    loading: false,
    activeServerId: null as string | null,
  });
  const settings = writable({ enableCommandPalette: true });
  return {
    directMessageEntries: dm,
    metadataState: metadata,
    serverState: servers,
    settingsState: settings,
    setActiveChatMock: vi.fn(),
    setActiveServerMock: vi.fn((serverId: string | null) => {
      servers.update((state: any) => ({ ...state, activeServerId: serverId }));
    }),
  };
});

vi.mock("$app/navigation", () => ({
  goto: gotoMock,
}));

vi.mock("$lib/features/chat/stores/directMessageRoster", () => ({
  directMessageRoster: { subscribe: directMessageEntries.subscribe },
}));

vi.mock("$lib/features/chat/stores/chatStore", () => ({
  chatStore: {
    setActiveChat: setActiveChatMock,
    searchMessages: async () => ({
      received: 0,
      hasMore: false,
      nextCursor: null,
    }),
  },
  chatMetadataByChatId: { subscribe: metadataState.subscribe },
}));

vi.mock("$lib/features/servers/stores/serverStore", () => ({
  serverStore: {
    subscribe: serverState.subscribe,
    setActiveServer: setActiveServerMock,
  },
}));

vi.mock("$lib/features/settings/stores/settings", () => ({
  settings: { subscribe: settingsState.subscribe },
}));

import CommandPalette from "$lib/features/navigation/CommandPalette.svelte";
import { commandPaletteStore } from "$lib/features/navigation/commandPaletteStore";

describe("CommandPalette", () => {
  beforeEach(() => {
    commandPaletteStore.reset();
    gotoMock.mockReset();
    setActiveChatMock.mockReset();
    setActiveServerMock.mockClear();

    const recentTimestamp = new Date("2024-01-02T10:00:00Z").toISOString();
    directMessageEntries.set([
      {
        id: "user-123",
        type: "dm",
        name: "Alice",
        avatar: "https://example.com/alice.png",
        online: true,
        memberCount: undefined,
        memberIds: [],
        lastActivityAt: new Date("2024-01-03T09:00:00Z").toISOString(),
        unreadCount: 0,
        lastMessageText: "Hey there",
        friend: undefined,
        group: undefined,
      },
    ]);

    metadataState.set(
      new Map([
        [
          "channel-1",
          {
            lastActivityAt: recentTimestamp,
            lastMessage: { content: "Latest update" },
          },
        ],
      ]),
    );

    serverState.set({
      servers: [
        {
          id: "server-1",
          name: "Test Server",
          owner_id: "owner-1",
          channels: [
            {
              id: "channel-1",
              name: "general",
              server_id: "server-1",
              channel_type: "text",
              private: false,
              category_id: null,
            },
          ],
          categories: [],
          members: [],
          roles: [],
          invites: [],
        },
      ],
      loading: false,
      activeServerId: null,
    });

    settingsState.set({ enableCommandPalette: true });
  });

  afterEach(() => {
    cleanup();
    commandPaletteStore.reset();
  });

  it("opens and focuses the search input when activated", async () => {
    commandPaletteStore.open();
    const { getByPlaceholderText } = render(CommandPalette);

    await waitFor(() => {
      const input = getByPlaceholderText("Search commands") as HTMLInputElement;
      expect(document.activeElement).toBe(input);
    });

    expect(get(commandPaletteStore.isOpen)).toBe(true);
  });

  it("filters commands based on the search query", async () => {
    commandPaletteStore.open();
    const { getByPlaceholderText, queryByText, findByText } =
      render(CommandPalette);

    const input = getByPlaceholderText("Search commands");
    await fireEvent.input(input, { target: { value: "mesh" } });

    await findByText("Open Mesh Map");
    expect(queryByText("Alice")).toBeNull();
  });

  it("executes the selected chat command", async () => {
    commandPaletteStore.open();
    const { getByText, queryByText } = render(CommandPalette);

    const item = getByText("Alice");
    await fireEvent.click(item);

    expect(setActiveChatMock).toHaveBeenCalledWith("user-123", "dm");
    expect(setActiveServerMock).toHaveBeenCalledWith(null);
    expect(gotoMock).toHaveBeenCalledWith("/dm/user-123");

    await waitFor(() => {
      expect(queryByText("Alice")).toBeNull();
    });
    expect(get(commandPaletteStore.isOpen)).toBe(false);
  });
});
