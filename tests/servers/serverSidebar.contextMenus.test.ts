import { render, fireEvent, waitFor } from "@testing-library/svelte";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type {
  ActiveCall,
  CallState,
} from "$lib/features/calls/stores/callStore";

import ChannelContextMenuMock from "../mocks/ChannelContextMenu.svelte";
import ServerBackgroundContextMenuMock from "../mocks/ServerBackgroundContextMenu.svelte";
import CategoryContextMenuMock from "../mocks/CategoryContextMenu.svelte";
import Passthrough from "../mocks/Passthrough.svelte";

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

const {
  callStoreMock,
  startCallMock,
  resetCallStoreState,
  setCallStoreState,
  createInitialCallState,
  getCallStoreState,
} = vi.hoisted(() => {
  const subscribers: Array<(value: CallState) => void> = [];

  const startCallMock = vi.fn();
  const setCallModalOpenMock = vi.fn();
  const initializeMock = vi.fn();

  const createInitialCallState = (): CallState => ({
    activeCall: null,
    deviceAvailability: { audioInput: true, videoInput: true },
    permissions: {
      audio: "granted",
      video: "granted",
      checking: false,
    },
    localMedia: {
      audioEnabled: true,
      videoEnabled: true,
      audioAvailable: true,
      videoAvailable: true,
      screenSharing: false,
      screenShareAvailable: true,
    },
    showCallModal: false,
  });

  let state: CallState = createInitialCallState();

  const notify = () => {
    subscribers.forEach((run) => run(state));
  };

  const subscribe = (run: (value: CallState) => void) => {
    run(state);
    subscribers.push(run);
    return () => {
      const index = subscribers.indexOf(run);
      if (index !== -1) {
        subscribers.splice(index, 1);
      }
    };
  };

  return {
    callStoreMock: {
      subscribe,
      startCall: (...args: unknown[]) => startCallMock(...args),
      setCallModalOpen: setCallModalOpenMock,
      initialize: initializeMock,
    },
    startCallMock,
    resetCallStoreState: () => {
      state = createInitialCallState();
      notify();
      startCallMock.mockReset();
      setCallModalOpenMock.mockReset();
      initializeMock.mockReset();
    },
    setCallStoreState: (nextState: CallState) => {
      state = nextState;
      notify();
    },
    createInitialCallState,
    getCallStoreState: () => state,
  };
});

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

vi.mock("$lib/components/modals/CreateCategoryModal.svelte", () => ({
  default: Passthrough,
}));

vi.mock("$lib/components/modals/ServerEventModal.svelte", () => ({
  default: Passthrough,
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
    searchMessages: async () => ({
      received: 0,
      hasMore: false,
      nextCursor: null,
    }),
  },
  chatMetadataByChatId: {
    subscribe: (run: (value: Map<string, unknown>) => void) => {
      run(new Map());
      return () => {};
    },
  },
}));

vi.mock("$lib/features/channels/stores/channelDisplayPreferencesStore", () => ({
  channelDisplayPreferencesStore: {
    loadForServer: loadPreferencesMock,
    toggleHideMemberNames: toggleHideNamesMock,
  },
}));

vi.mock("$lib/features/calls/stores/callStore", () => ({
  callStore: callStoreMock,
}));

import ServerSidebar from "$lib/components/sidebars/ServerSidebar.svelte";
import { tick } from "svelte";

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
    resetCallStoreState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders categories with their channels", () => {
    const server = {
      id: "server-1",
      name: "Test Server",
      owner_id: "user-1",
      channels: [
        {
          id: "channel-1",
          server_id: "server-1",
          name: "ops",
          channel_type: "text" as const,
          private: false,
          category_id: "category-1",
        },
        {
          id: "channel-2",
          server_id: "server-1",
          name: "briefing",
          channel_type: "voice" as const,
          private: false,
          category_id: "category-1",
        },
        {
          id: "channel-3",
          server_id: "server-1",
          name: "general",
          channel_type: "text" as const,
          private: false,
          category_id: null,
        },
      ],
      categories: [
        {
          id: "category-1",
          server_id: "server-1",
          name: "Operations",
          position: 1,
          created_at: new Date().toISOString(),
        },
      ],
      members: [],
      roles: [],
      invites: [],
    };

    const { getByText, queryAllByText } = render(ServerSidebar, {
      props: {
        server,
        onSelectChannel: vi.fn(),
      },
    });

    expect(getByText("Operations")).toBeTruthy();
    expect(getByText("ops")).toBeTruthy();
    expect(getByText("briefing")).toBeTruthy();
    expect(queryAllByText("ops")).toHaveLength(1);
    expect(queryAllByText("briefing")).toHaveLength(1);
    expect(getByText("Text Channels")).toBeTruthy();
    expect(getByText("general")).toBeTruthy();
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
          channel_type: "text" as const,
          private: false,
        },
      ],
      categories: [],
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
      categories: [],
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

  it("renders voice channels with their own section", () => {
    const server = {
      id: "server-1",
      name: "Test Server",
      owner_id: "user-1",
      channels: [
        {
          id: "channel-1",
          server_id: "server-1",
          name: "general",
          channel_type: "text" as const,
          private: false,
        },
        {
          id: "channel-2",
          server_id: "server-1",
          name: "briefing",
          channel_type: "voice" as const,
          private: false,
        },
      ],
      categories: [],
      members: [],
      roles: [],
      invites: [],
    };

    const { getByText } = render(ServerSidebar, {
      props: {
        server,
        onSelectChannel: vi.fn(),
      },
    });

    expect(getByText("Voice Channels")).toBeTruthy();
    expect(getByText("briefing")).toBeTruthy();
  });

  it("starts a voice call when selecting a voice channel", async () => {
    const server = {
      id: "server-1",
      name: "Test Server",
      owner_id: "user-1",
      channels: [
        {
          id: "channel-1",
          server_id: "server-1",
          name: "general",
          channel_type: "text" as const,
          private: false,
        },
        {
          id: "channel-2",
          server_id: "server-1",
          name: "briefing",
          channel_type: "voice" as const,
          private: false,
        },
      ],
      categories: [],
      members: [],
      roles: [],
      invites: [],
    };

    const onSelectChannel = vi.fn();

    const { getByText } = render(ServerSidebar, {
      props: {
        server,
        onSelectChannel,
      },
    });

    const voiceLabel = getByText("briefing");
    const voiceButton = voiceLabel.closest('[role="button"]');
    expect(voiceButton).toBeTruthy();

    await fireEvent.click(voiceButton!);

    expect(onSelectChannel).toHaveBeenCalledWith("server-1", "channel-2");
    await waitFor(() => {
      expect(startCallMock).toHaveBeenCalledWith({
        chatId: "channel-2",
        chatName: "briefing",
        chatType: "channel",
        type: "voice",
        serverId: "server-1",
      });
    });
  });

  it("marks the active voice channel when a call is running", async () => {
    const server = {
      id: "server-1",
      name: "Test Server",
      owner_id: "user-1",
      channels: [
        {
          id: "channel-1",
          server_id: "server-1",
          name: "general",
          channel_type: "text" as const,
          private: false,
        },
        {
          id: "channel-2",
          server_id: "server-1",
          name: "briefing",
          channel_type: "voice" as const,
          private: false,
        },
      ],
      categories: [],
      members: [],
      roles: [],
      invites: [],
    };

    const baseState = createInitialCallState();
    setCallStoreState({
      ...baseState,
      activeCall: {
        chatId: "channel-2",
        chatName: "briefing",
        chatType: "channel",
        type: "voice",
        status: "in-call",
        startedAt: Date.now(),
        connectedAt: Date.now(),
        endedAt: null,
        endReason: undefined,
        error: undefined,
        localStream: null,
        callId: "call-123",
        direction: "outgoing",
        participants: new Map() as ActiveCall["participants"],
      } satisfies ActiveCall,
    });

    expect(getCallStoreState().activeCall?.chatId).toBe("channel-2");

    const { getByText } = render(ServerSidebar, {
      props: {
        server,
        onSelectChannel: vi.fn(),
      },
    });

    await tick();

    const voiceLabel = getByText("briefing");
    const voiceButton = voiceLabel.closest('[role="button"]');
    expect(voiceButton).toBeTruthy();
    expect(voiceButton?.getAttribute("data-active")).toBe("true");
  });
});
