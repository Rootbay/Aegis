import { render, fireEvent, waitFor } from "@testing-library/svelte";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { get, writable, type Writable } from "svelte/store";
import CallModalMock from "../mocks/CallModal.svelte";

const { gotoMock } = vi.hoisted(() => ({ gotoMock: vi.fn() }));

const { preferencesState, toggleHideMemberNamesMock, setHideMemberNamesMock } =
  vi.hoisted(() => {
    const state: Writable<Map<string, { hideMemberNames: boolean }>> =
      writable(new Map<string, { hideMemberNames: boolean }>());
    return {
      preferencesState: state,
      toggleHideMemberNamesMock: vi.fn(async (channelId: string) => {
        const current = get(state).get(channelId)?.hideMemberNames ?? false;
        state.update((map) => {
          const next = new Map(map);
          next.set(channelId, { hideMemberNames: !current });
          return next;
        });
        return !current;
      }),
      setHideMemberNamesMock: vi.fn(
        async (channelId: string, hide: boolean) => {
          state.update((map) => {
            const next = new Map(map);
            next.set(channelId, { hideMemberNames: hide });
            return next;
          });
        },
      ),
    };
  });

const { callState, initializeCallMock, startCallMock, setCallModalOpenMock } =
  vi.hoisted(() => ({
    callState: writable({
      activeCall: null,
      deviceAvailability: { audioInput: true, videoInput: true },
      permissions: { audio: "granted", video: "granted", checking: false },
      showCallModal: false,
    }),
    initializeCallMock: vi.fn(),
    startCallMock: vi.fn(),
    setCallModalOpenMock: vi.fn(),
  }));

const {
  memberSidebarState,
  toggleMemberSidebarVisibilityMock,
  setMemberSidebarVisibilityMock,
} = vi.hoisted(() => {
  const state: Writable<Map<string, boolean>> =
    writable(new Map<string, boolean>());
  return {
    memberSidebarState: state,
    toggleMemberSidebarVisibilityMock: vi.fn((chatId: string) => {
      let nextVisible = true;
      state.update((map) => {
        const current = map.get(chatId);
        nextVisible = !(current ?? true);
        const next = new Map(map);
        if (nextVisible) {
          next.delete(chatId);
        } else {
          next.set(chatId, false);
        }
        return next;
      });
      return nextVisible;
    }),
    setMemberSidebarVisibilityMock: vi.fn(
      (chatId: string, visible: boolean) => {
        state.update((map) => {
          const next = new Map(map);
          if (visible) {
            next.delete(chatId);
          } else {
            next.set(chatId, false);
          }
          return next;
        });
      },
    ),
  };
});

vi.mock("$app/navigation", () => ({
  goto: gotoMock,
}));

vi.mock("$lib/features/calls/components/CallModal.svelte", () => ({
  default: CallModalMock,
}));

vi.mock("$lib/features/calls/stores/callStore", () => ({
  callStore: {
    subscribe: callState.subscribe,
    initialize: initializeCallMock,
    startCall: startCallMock,
    setCallModalOpen: setCallModalOpenMock,
  },
}));

vi.mock("$lib/features/channels/stores/channelDisplayPreferencesStore", () => ({
  channelDisplayPreferencesStore: {
    subscribe: preferencesState.subscribe,
    toggleHideMemberNames: toggleHideMemberNamesMock,
    setHideMemberNames: setHideMemberNamesMock,
  },
}));

vi.mock("$lib/features/chat/stores/memberSidebarVisibilityStore", () => ({
  memberSidebarVisibilityStore: {
    subscribe: memberSidebarState.subscribe,
    toggleVisibility: toggleMemberSidebarVisibilityMock,
    setVisibility: setMemberSidebarVisibilityMock,
  },
}));

vi.mock("$lib/features/chat/stores/chatStore", () => ({
  activeChatTypingUsers: {
    subscribe: (run: (value: string[]) => void) => {
      run([]);
      return () => {};
    },
  },
}));

vi.mock("$lib/stores/userStore", () => ({
  userStore: {
    subscribe: (
      run: (value: { me: { id: string; name: string } | null }) => void,
    ) => {
      run({ me: { id: "user-1", name: "Test User" } });
      return () => {};
    },
  },
}));

import NavigationHeader from "$lib/components/NavigationHeader.svelte";
import { chatSearchStore } from "$lib/features/chat/stores/chatSearchStore";

const baseChat = {
  type: "channel" as const,
  id: "channel-1",
  name: "General",
  serverId: "server-1",
  members: [],
  messages: [],
};

describe("NavigationHeader actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    preferencesState.set(new Map());
    memberSidebarState.set(new Map());
    chatSearchStore.reset();
    chatSearchStore.clearHistory();
    chatSearchStore.setDropdownOpen(false);
  });

  afterEach(() => {
    chatSearchStore.reset();
    chatSearchStore.clearHistory();
    chatSearchStore.setDropdownOpen(false);
  });

  it("navigates to notification settings when the notifications button is clicked", async () => {
    const { getByLabelText } = render(NavigationHeader, {
      props: {
        chat: baseChat,
        onOpenDetailedProfile: vi.fn(),
      },
    });

    const button = getByLabelText("Notification Settings");
    await fireEvent.click(button);

    expect(gotoMock).toHaveBeenCalledWith("/settings/notifications");
  });

  it("opens pinned messages view via the chat search store", async () => {
    const setQuerySpy = vi.spyOn(chatSearchStore, "setQuery");
    const executeSearchSpy = vi.spyOn(chatSearchStore, "executeSearch");
    const openSpy = vi.spyOn(chatSearchStore, "open");
    const setDropdownSpy = vi.spyOn(chatSearchStore, "setDropdownOpen");

    const { getByLabelText } = render(NavigationHeader, {
      props: {
        chat: baseChat,
        onOpenDetailedProfile: vi.fn(),
      },
    });

    setQuerySpy.mockClear();
    executeSearchSpy.mockClear();
    openSpy.mockClear();
    setDropdownSpy.mockClear();

    const button = getByLabelText("Pinned Messages");
    await fireEvent.click(button);

    expect(setQuerySpy).toHaveBeenCalledWith("pinned:true");
    expect(executeSearchSpy).toHaveBeenCalled();
    expect(openSpy).toHaveBeenCalled();
    expect(setDropdownSpy).toHaveBeenCalledWith(false);

    setQuerySpy.mockRestore();
    executeSearchSpy.mockRestore();
    openSpy.mockRestore();
    setDropdownSpy.mockRestore();
  });

  it("toggles the hide member names preference", async () => {
    const { getByLabelText } = render(NavigationHeader, {
      props: {
        chat: baseChat,
        onOpenDetailedProfile: vi.fn(),
      },
    });

    const button = getByLabelText("Hide Member List");

    await fireEvent.click(button);

    expect(toggleHideMemberNamesMock).toHaveBeenCalledWith("channel-1");

    await waitFor(() => {
      expect(
        get(preferencesState).get("channel-1")?.hideMemberNames ?? false,
      ).toBe(true);
    });

    await waitFor(() => {
      expect(button.getAttribute("aria-pressed")).toBe("true");
    });
  });

  it("toggles the member sidebar visibility", async () => {
    const { getByLabelText } = render(NavigationHeader, {
      props: {
        chat: baseChat,
        onOpenDetailedProfile: vi.fn(),
      },
    });

    const button = getByLabelText("Hide Member Sidebar");

    await fireEvent.click(button);

    expect(toggleMemberSidebarVisibilityMock).toHaveBeenCalledWith("channel-1");

    await waitFor(() => {
      expect(button.getAttribute("aria-pressed")).toBe("false");
    });

    await waitFor(() => {
      expect(button.getAttribute("aria-label")).toBe("Show Member Sidebar");
    });
  });
});
