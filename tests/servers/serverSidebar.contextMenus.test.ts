import { render, fireEvent, waitFor } from "@testing-library/svelte";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tick } from "svelte";
import type {
  ActiveCall,
  CallState,
} from "$lib/features/calls/stores/callStore";
import type { Channel } from "$lib/features/channels/models/Channel";
import type { ChannelCategory } from "$lib/features/channels/models/ChannelCategory";
import { voicePresenceStore } from "$lib/features/calls/stores/voicePresenceStore";

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
  joinVoiceChannelMock,
  resetCallStoreState,
  setCallStoreState,
  createInitialCallState,
  getCallStoreState,
} = vi.hoisted(() => {
  const subscribers: Array<(value: CallState) => void> = [];

  const startCallMock = vi.fn();
  const joinVoiceChannelMock = vi.fn(async () => undefined);
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
    pushToTalk: {
      enabled: false,
      isPressing: false,
    },
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
      startCall: startCallMock,
      joinVoiceChannel: joinVoiceChannelMock,
      setCallModalOpen: setCallModalOpenMock,
      initialize: initializeMock,
    },
    startCallMock,
    joinVoiceChannelMock,
    resetCallStoreState: () => {
      state = createInitialCallState();
      notify();
      startCallMock.mockReset();
      joinVoiceChannelMock.mockReset();
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

const mutedChannelsModule = vi.hoisted(() => {
  type Subscriber = (value: Set<string>) => void;
  let state = new Set<string>();
  const subscribers: Subscriber[] = [];

  const emit = () => {
    const snapshot = new Set(state);
    for (const subscriber of subscribers) {
      subscriber(snapshot);
    }
  };

  const subscribe = (run: Subscriber) => {
    run(new Set(state));
    subscribers.push(run);
    return () => {
      const index = subscribers.indexOf(run);
      if (index !== -1) {
        subscribers.splice(index, 1);
      }
    };
  };

  const mutate = (updater: (next: Set<string>) => void) => {
    const next = new Set(state);
    updater(next);
    if (next.size === state.size && [...next].every((id) => state.has(id))) {
      return;
    }
    state = next;
    emit();
  };

  const store = {
    subscribe,
    mute(channelId: string) {
      if (!channelId) return;
      mutate((next) => next.add(channelId));
    },
    unmute(channelId: string) {
      if (!channelId) return;
      mutate((next) => next.delete(channelId));
    },
    toggle(channelId: string) {
      if (!channelId) return;
      mutate((next) => {
        if (next.has(channelId)) {
          next.delete(channelId);
        } else {
          next.add(channelId);
        }
      });
    },
    isMuted(channelId: string) {
      if (!channelId) return false;
      return state.has(channelId);
    },
    setMuted(channelIds: Iterable<string>) {
      state = new Set(channelIds);
      emit();
    },
    clear() {
      if (state.size === 0) return;
      state = new Set();
      emit();
    },
  };

  return {
    store,
    reset() {
      state = new Set();
      emit();
    },
    getState: () => new Set(state),
  };
});

const mutedCategoriesModule = vi.hoisted(() => {
  type Subscriber = (value: Set<string>) => void;
  let state = new Set<string>();
  const subscribers: Subscriber[] = [];

  const emit = () => {
    const snapshot = new Set(state);
    for (const subscriber of subscribers) {
      subscriber(snapshot);
    }
  };

  const subscribe = (run: Subscriber) => {
    run(new Set(state));
    subscribers.push(run);
    return () => {
      const index = subscribers.indexOf(run);
      if (index !== -1) {
        subscribers.splice(index, 1);
      }
    };
  };

  const mutate = (updater: (next: Set<string>) => void) => {
    const next = new Set(state);
    updater(next);
    if (next.size === state.size && [...next].every((id) => state.has(id))) {
      return;
    }
    state = next;
    emit();
  };

  const store = {
    subscribe,
    mute(categoryId: string) {
      if (!categoryId) return;
      mutate((next) => next.add(categoryId));
    },
    unmute(categoryId: string) {
      if (!categoryId) return;
      mutate((next) => next.delete(categoryId));
    },
    toggle(categoryId: string) {
      if (!categoryId) return;
      mutate((next) => {
        if (next.has(categoryId)) {
          next.delete(categoryId);
        } else {
          next.add(categoryId);
        }
      });
    },
    isMuted(categoryId: string) {
      if (!categoryId) return false;
      return state.has(categoryId);
    },
    setMuted(ids: Iterable<string>) {
      state = new Set(ids);
      emit();
    },
    clear() {
      if (state.size === 0) return;
      state = new Set();
      emit();
    },
  };

  return {
    store,
    reset() {
      state = new Set();
      emit();
    },
    getState: () => new Set(state),
  };
});

const categoryNotificationPreferencesModule = vi.hoisted(() => {
  type Subscriber = (value: Map<string, string>) => void;
  const DEFAULT_LEVEL = "all_messages";
  let state = new Map<string, string>();
  const subscribers: Subscriber[] = [];

  const emit = () => {
    const snapshot = new Map(state);
    for (const subscriber of subscribers) {
      subscriber(snapshot);
    }
  };

  const subscribe = (run: Subscriber) => {
    run(new Map(state));
    subscribers.push(run);
    return () => {
      const index = subscribers.indexOf(run);
      if (index !== -1) {
        subscribers.splice(index, 1);
      }
    };
  };

  const setPreference = (categoryId: string, level: string) => {
    if (!categoryId) return;
    state.set(categoryId, level);
    emit();
  };

  const store = {
    subscribe,
    setPreference,
    getPreference(categoryId: string) {
      if (!categoryId) {
        return DEFAULT_LEVEL;
      }
      return state.get(categoryId) ?? DEFAULT_LEVEL;
    },
    clear() {
      if (state.size === 0) return;
      state = new Map();
      emit();
    },
  };

  return {
    store,
    reset() {
      state = new Map();
      emit();
    },
    getState: () => new Map(state),
    setPreference,
    DEFAULT_LEVEL,
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
  activeServerEmojiCategories: {
    subscribe: (run: (value: unknown) => void) => {
      run([]);
      return () => {};
    },
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

vi.mock("$lib/features/channels/stores/mutedChannelsStore", () => ({
  mutedChannelsStore: mutedChannelsModule.store,
}));

vi.mock("$lib/features/channels/stores/mutedCategoriesStore", () => ({
  mutedCategoriesStore: mutedCategoriesModule.store,
}));

vi.mock(
  "$lib/features/channels/stores/categoryNotificationPreferencesStore",
  () => ({
    categoryNotificationPreferencesStore:
      categoryNotificationPreferencesModule.store,
    DEFAULT_CATEGORY_NOTIFICATION_LEVEL:
      categoryNotificationPreferencesModule.DEFAULT_LEVEL,
  }),
);

import ServerSidebar from "$lib/components/sidebars/ServerSidebar.svelte";

describe("ServerSidebar context menus", () => {
  const createDataTransfer = () => {
    const store: Record<string, string> = {};
    return {
      data: store,
      dropEffect: "move",
      effectAllowed: "move",
      files: [],
      items: [],
      types: [],
      setData(type: string, value: string) {
        store[type] = value;
      },
      getData(type: string) {
        return store[type] ?? "";
      },
      clearData(type?: string) {
        if (!type) {
          Object.keys(store).forEach((key) => delete store[key]);
          return;
        }
        delete store[type];
      },
    } as unknown as DataTransfer;
  };

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
    voicePresenceStore.reset();
    mutedChannelsModule.reset();
    mutedCategoriesModule.reset();
    categoryNotificationPreferencesModule.reset();
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
          position: 0,
          category_id: "category-1",
        },
        {
          id: "channel-2",
          server_id: "server-1",
          name: "briefing",
          channel_type: "voice" as const,
          private: false,
          position: 1,
          category_id: "category-1",
        },
        {
          id: "channel-3",
          server_id: "server-1",
          name: "general",
          channel_type: "text" as const,
          private: false,
          position: 2,
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

  it("creates a channel inside the active category when using the category add button", async () => {
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
          position: 0,
          category_id: "category-1",
        },
        {
          id: "channel-2",
          server_id: "server-1",
          name: "support",
          channel_type: "text" as const,
          private: false,
          position: 1,
          category_id: "category-1",
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

    mockInvoke.mockResolvedValueOnce(undefined);

    const { getByText, getByLabelText, getByRole } = render(ServerSidebar, {
      props: {
        server,
        onSelectChannel: vi.fn(),
      },
    });

    const categoryHeading = getByText("Operations");
    const categoryContainer = categoryHeading.closest("div");
    const createButton = categoryContainer?.parentElement?.querySelector(
      'button[aria-label="Create Channel"]',
    ) as HTMLButtonElement | null;
    expect(createButton).toBeTruthy();

    await fireEvent.click(createButton!);

    const nameInput = getByLabelText("Channel Name") as HTMLInputElement;
    await fireEvent.input(nameInput, { target: { value: "logistics" } });

    mockInvoke.mockResolvedValueOnce(undefined);

    const submitButton = getByRole("button", { name: /create channel/i });
    await fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "create_channel",
        expect.objectContaining({
          channel: expect.objectContaining({
            category_id: "category-1",
            channel_type: "text",
            position: 2,
          }),
        }),
      );
    });
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
          position: 0,
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
        expires_after_seconds: null,
        max_uses: null,
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
          position: 0,
        },
        {
          id: "channel-2",
          server_id: "server-1",
          name: "briefing",
          channel_type: "voice" as const,
          private: false,
          position: 1,
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
          position: 0,
        },
        {
          id: "channel-2",
          server_id: "server-1",
          name: "briefing",
          channel_type: "voice" as const,
          private: false,
          position: 1,
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
      expect(joinVoiceChannelMock).toHaveBeenCalledWith({
        chatId: "channel-2",
        chatName: "briefing",
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
          position: 0,
        },
        {
          id: "channel-2",
          server_id: "server-1",
          name: "briefing",
          channel_type: "voice" as const,
          private: false,
          position: 1,
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
        serverId: "server-1",
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

  it("shows voice channel presence below the channel row", async () => {
    const server = {
      id: "server-1",
      name: "Test Server",
      owner_id: "user-1",
      channels: [
        {
          id: "channel-voice",
          server_id: "server-1",
          name: "ops-brief",
          channel_type: "voice" as const,
          private: false,
          position: 0,
        },
      ],
      categories: [],
      members: [
        { id: "user-2", name: "Echo Leader", avatar: "", online: true },
        { id: "user-3", name: "Sierra", avatar: "", online: true },
      ],
      roles: [],
      invites: [],
    };

    voicePresenceStore.syncChannelPresence({
      channelId: "channel-voice",
      serverId: "server-1",
      participants: [
        { userId: "user-2", joinedAt: Date.now() - 2000 },
        { userId: "user-3", joinedAt: Date.now() - 500 },
      ],
    });

    const { getByText } = render(ServerSidebar, {
      props: {
        server,
        onSelectChannel: vi.fn(),
      },
    });

    await tick();

    expect(getByText("2 connected")).toBeTruthy();
    expect(getByText("Echo Leader")).toBeTruthy();
    expect(getByText("Sierra")).toBeTruthy();
  });

  it("reassigns category and position when dragging a channel to another category", async () => {
    const server = {
      id: "server-1",
      name: "Test Server",
      owner_id: "user-1",
      channels: [
        {
          id: "channel-1",
          server_id: "server-1",
          name: "alpha",
          channel_type: "text" as const,
          private: false,
          position: 0,
          category_id: "category-1",
        },
        {
          id: "channel-2",
          server_id: "server-1",
          name: "beta",
          channel_type: "text" as const,
          private: false,
          position: 1,
          category_id: "category-1",
        },
        {
          id: "channel-3",
          server_id: "server-1",
          name: "raid-planning",
          channel_type: "text" as const,
          private: false,
          position: 0,
          category_id: "category-2",
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
        {
          id: "category-2",
          server_id: "server-1",
          name: "Logistics",
          position: 2,
          created_at: new Date().toISOString(),
        },
      ],
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

    const source = getByText("beta").closest('[role="button"]');
    const target = getByText("raid-planning").closest('[role="button"]');
    expect(source).toBeTruthy();
    expect(target).toBeTruthy();

    const dataTransfer = createDataTransfer();

    await fireEvent.dragStart(source!, { dataTransfer });
    await fireEvent.dragOver(target!, { dataTransfer });
    await fireEvent.drop(target!, { dataTransfer });

    await waitFor(() => {
      expect(updateServerMock).toHaveBeenCalled();
    });

    const updateCall = (updateServerMock.mock.calls[0] as any)?.[1] as {
      channels: Channel[];
    };
    expect(updateCall).toBeDefined();
    const updatedChannels = updateCall.channels;

    const movedChannel = updatedChannels.find((ch) => ch.id === "channel-2");
    expect(movedChannel?.category_id).toBe("category-2");
    expect(movedChannel?.position).toBe(0);

    const remainingChannel = updatedChannels.find((ch) => ch.id === "channel-1");
    expect(remainingChannel?.category_id).toBe("category-1");
    expect(remainingChannel?.position).toBe(0);

    const targetChannel = updatedChannels.find((ch) => ch.id === "channel-3");
    expect(targetChannel?.position).toBe(1);
  });

  it("retains muted channels across rerenders", async () => {
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
          position: 0,
        },
      ],
      categories: [],
      members: [],
      roles: [],
      invites: [],
    };

    const renderResult = render(ServerSidebar, {
      props: {
        server,
        onSelectChannel: vi.fn(),
      },
    });

    const channelLabel = renderResult.getByText("general");
    const channelItem = channelLabel.closest('[role="button"]');
    expect(channelItem).toBeTruthy();

    await fireEvent.contextMenu(channelItem!);
    const muteButton = await renderResult.findByTestId("channel-context-mute");
    await fireEvent.click(muteButton);

    await waitFor(() => {
      expect(mutedChannelsModule.getState().has("channel-1")).toBe(true);
    });
    expect(addToastMock).toHaveBeenCalledWith("Channel muted.", "info");

    await renderResult.rerender({
      server,
      onSelectChannel: vi.fn(),
    });

    await waitFor(() => {
      expect(mutedChannelsModule.getState().has("channel-1")).toBe(true);
    });

    const channelLabelAfter = renderResult.getByText("general");
    const channelItemAfter = channelLabelAfter.closest('[role="button"]');
    expect(channelItemAfter).toBeTruthy();

    await fireEvent.contextMenu(channelItemAfter!);
    const unmuteButton = await renderResult.findByTestId(
      "channel-context-mute",
    );
    await fireEvent.click(unmuteButton);

    await waitFor(() => {
      expect(mutedChannelsModule.getState().has("channel-1")).toBe(false);
    });
    expect(addToastMock).toHaveBeenCalledWith("Channel unmuted.", "info");
  });

  it("toggles category mute state from the context menu", async () => {
    const server = {
      id: "server-1",
      name: "Test Server",
      owner_id: "user-1",
      channels: [],
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

    const renderResult = render(ServerSidebar, {
      props: {
        server,
        onSelectChannel: vi.fn(),
      },
    });

    const heading = renderResult.getByText("Operations");
    await fireEvent.contextMenu(heading);
    const muteButton = await renderResult.findByTestId("category-context-mute");
    await fireEvent.click(muteButton);

    await waitFor(() => {
      expect(mutedCategoriesModule.getState().has("category-1")).toBe(true);
    });
    expect(addToastMock).toHaveBeenCalledWith("Category muted.", "info");

    await fireEvent.contextMenu(heading);
    const unmuteButton = await renderResult.findByTestId(
      "category-context-mute",
    );
    await fireEvent.click(unmuteButton);

    await waitFor(() => {
      expect(mutedCategoriesModule.getState().has("category-1")).toBe(false);
    });
    expect(addToastMock).toHaveBeenCalledWith("Category unmuted.", "info");
  });

  it("renames a category via the edit action", async () => {
    updateServerMock.mockClear();
    const server = {
      id: "server-1",
      name: "Test Server",
      owner_id: "user-1",
      channels: [],
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

    const renderResult = render(ServerSidebar, {
      props: {
        server,
        onSelectChannel: vi.fn(),
      },
    });

    const heading = renderResult.getByText("Operations");
    await fireEvent.contextMenu(heading);
    const editButton = await renderResult.findByTestId("category-context-edit");
    await fireEvent.click(editButton);

    const modal = await renderResult.findByTestId("rename-category-modal");
    expect(modal).toBeTruthy();

    const input = renderResult.getByLabelText("Category Name") as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "Logistics" } });

    const saveButton = renderResult.getByRole("button", {
      name: /save changes/i,
    });
    await fireEvent.click(saveButton);

    await waitFor(() => {
      expect(updateServerMock).toHaveBeenCalled();
    });

    const call = updateServerMock.mock.calls[0] as any;
    expect(call?.[0]).toBe("server-1");
    const patch = call?.[1] as { categories?: ChannelCategory[] };
    expect(patch?.categories).toBeDefined();
    expect(patch?.categories?.find((cat) => cat.id === "category-1")?.name).toBe(
      "Logistics",
    );
    expect(addToastMock).toHaveBeenCalledWith("Category renamed.", "success");

    await waitFor(() => {
      expect(renderResult.queryByTestId("rename-category-modal")).toBeNull();
    });
  });

  it("updates notification preferences for a category", async () => {
    const server = {
      id: "server-1",
      name: "Test Server",
      owner_id: "user-1",
      channels: [],
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

    const renderResult = render(ServerSidebar, {
      props: {
        server,
        onSelectChannel: vi.fn(),
      },
    });

    const heading = renderResult.getByText("Operations");
    await fireEvent.contextMenu(heading);
    const notificationButton = await renderResult.findByTestId(
      "category-context-notifications",
    );
    await fireEvent.click(notificationButton);

    const modal = await renderResult.findByTestId(
      "category-notifications-modal",
    );
    expect(modal).toBeTruthy();

    const mentionsOption = await renderResult.findByTestId(
      "category-notification-option-mentions_only",
    );
    await fireEvent.click(mentionsOption);

    const saveButton = renderResult.getByRole("button", {
      name: /save preference/i,
    });
    await fireEvent.click(saveButton);

    await waitFor(() => {
      expect(
        categoryNotificationPreferencesModule
          .getState()
          .get("category-1"),
      ).toBe("mentions_only");
    });
    expect(addToastMock).toHaveBeenCalledWith(
      "Notification preferences updated.",
      "success",
    );

    await waitFor(() => {
      expect(
        renderResult.queryByTestId("category-notifications-modal"),
      ).toBeNull();
    });
  });
});
