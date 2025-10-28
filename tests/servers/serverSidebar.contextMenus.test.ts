import { render, fireEvent, waitFor } from "@testing-library/svelte";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import ChannelContextMenuMock from "../mocks/ChannelContextMenu.svelte";
import ServerBackgroundContextMenuMock from "../mocks/ServerBackgroundContextMenu.svelte";
import CategoryContextMenuMock from "../mocks/CategoryContextMenu.svelte";

const { mockGoto } = vi.hoisted(() => ({ mockGoto: vi.fn() }));
const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));
const { addToastMock } = vi.hoisted(() => ({ addToastMock: vi.fn() }));
const {
  addInviteToServerMock,
  updateServerMock,
  addChannelToServerMock,
  removeServerMock,
  setActiveServerMock,
  removeChannelFromServerMock,
  handleServersUpdateMock,
} = vi.hoisted(() => ({
  addInviteToServerMock: vi.fn(),
  updateServerMock: vi.fn(async () => ({ success: true })),
  addChannelToServerMock: vi.fn(),
  removeServerMock: vi.fn(),
  setActiveServerMock: vi.fn(),
  removeChannelFromServerMock: vi.fn(),
  handleServersUpdateMock: vi.fn(),
}));
const {
  loadPreferencesMock,
  toggleHideNamesMock,
  setActiveChannelForServerMock,
} = vi.hoisted(() => ({
  loadPreferencesMock: vi.fn(async () => {}),
  toggleHideNamesMock: vi.fn(async () => true),
  setActiveChannelForServerMock: vi.fn(),
}));

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.mock("$app/navigation", () => ({
  goto: mockGoto,
}));

vi.mock("$app/environment", () => ({
  browser: true,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

vi.mock("$lib/stores/ToastStore", () => ({
  toasts: {
    addToast: addToastMock,
  },
}));

vi.mock("$lib/components/context-menus/ChannelContextMenu.svelte", () => ({
  default: ChannelContextMenuMock,
}));

vi.mock(
  "$lib/components/context-menus/ServerBackgroundContextMenu.svelte",
  () => ({
    default: ServerBackgroundContextMenuMock,
  }),
);

vi.mock("$lib/components/context-menus/CategoryContextMenu.svelte", () => ({
  default: CategoryContextMenuMock,
}));

vi.mock("$lib/features/servers/stores/serverStore", () => ({
  serverStore: {
    subscribe: () => () => {},
    addInviteToServer: addInviteToServerMock,
    updateServer: updateServerMock,
    addChannelToServer: addChannelToServerMock,
    removeServer: removeServerMock,
    setActiveServer: setActiveServerMock,
    removeChannelFromServer: removeChannelFromServerMock,
    handleServersUpdate: handleServersUpdateMock,
    fetchBans: vi.fn(async () => []),
    unbanMember: vi.fn(async () => ({ success: true })),
  },
}));

vi.mock("$lib/features/chat/stores/chatStore", () => ({
  chatStore: {
    activeServerChannelId: {
      subscribe: (run: (value: string | null) => void) => {
        run(null);
        return () => {};
      },
    },
    setActiveChannelForServer: setActiveChannelForServerMock,
  },
}));

vi.mock("$lib/features/channels/stores/channelDisplayPreferencesStore", () => ({
  channelDisplayPreferencesStore: {
    loadForServer: loadPreferencesMock,
    toggleHideMemberNames: toggleHideNamesMock,
  },
}));

import ServerSidebar from "$lib/components/sidebars/ServerSidebar.svelte";

describe("ServerSidebar context menus", () => {
  const createLocalStorageMock = () => {
    const storage = new Map<string, string>();
    return {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => storage.clear(),
      key: (index: number) => Array.from(storage.keys())[index] ?? null,
      get length() {
        return storage.size;
      },
    } satisfies Storage;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("localStorage", createLocalStorageMock());
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("generates and copies a server invite from the channel context menu", async () => {
    const invite = {
      id: "invite-1",
      server_id: "server-1",
      code: "abc123",
      created_by: "user-1",
      created_at: new Date().toISOString(),
      expires_at: null,
      max_uses: null,
      uses: 0,
    };
    mockInvoke.mockResolvedValueOnce(invite);

    const server = {
      id: "server-1",
      name: "Test Server",
      owner_id: "user-1",
      channels: [
        {
          id: "channel-1",
          server_id: "server-1",
          name: "general",
          channel_type: "text",
          private: false,
        },
      ],
      members: [],
      roles: [],
      invites: [],
    };

    const { getByText, findByTestId, queryByTestId } = render(ServerSidebar, {
      props: {
        server,
        onSelectChannel: vi.fn(),
      },
    });

    const channelLabel = getByText("general");
    const channelItem = channelLabel.closest('[role="button"]');
    expect(channelItem).toBeTruthy();

    await fireEvent.contextMenu(channelItem!);

    const inviteButton = await findByTestId("channel-context-invite");
    await fireEvent.click(inviteButton);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("generate_server_invite", {
        server_id: "server-1",
      });
      expect(addInviteToServerMock).toHaveBeenCalledWith(
        "server-1",
        expect.objectContaining({ code: invite.code }),
      );
      expect(addToastMock).toHaveBeenCalledWith(
        "Invite link copied.",
        "success",
      );
      expect((navigator as any).clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("/inv/"),
      );
    });

    await waitFor(() => {
      expect(queryByTestId("channel-context-menu")).toBeNull();
    });
  });

  it("redirects category creation to the server channel settings", async () => {
    const server = {
      id: "server-1",
      name: "Test Server",
      owner_id: "user-1",
      channels: [],
      members: [],
      roles: [],
      invites: [],
    };

    render(ServerSidebar, {
      props: {
        server,
        onSelectChannel: vi.fn(),
      },
    });

    const createCategoryButton = document.querySelector(
      '[data-testid="server-background-create-category"]',
    ) as HTMLButtonElement | null;
    expect(createCategoryButton).toBeTruthy();

    await fireEvent.click(createCategoryButton!);

    expect(mockGoto).toHaveBeenCalledWith(
      "/channels/server-1/settings?tab=channels",
    );
    expect(addToastMock).toHaveBeenCalledWith(
      "Manage categories from the Channels tab.",
      "info",
    );
  });
});
