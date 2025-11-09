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
import { chatSearchStore } from "../../../src/lib/features/chat/stores/chatSearchStore";
import ActiveChatContent from "../../../src/lib/layout/app/ActiveChatContent.svelte";
import MemberSidebar from "../../../src/lib/components/sidebars/MemberSidebar.svelte";

type Subscriber<T> = (value: T) => void;

function createMockStore<T>(initial: T) {
  let value = initial;
  const subscribers = new Set<Subscriber<T>>();

  function subscribe(run: Subscriber<T>) {
    run(value);
    subscribers.add(run);
    return () => subscribers.delete(run);
  }

  function set(next: T) {
    value = next;
    subscribers.forEach((run) => run(value));
  }

  function update(updater: (value: T) => T) {
    set(updater(value));
  }

  return { subscribe, set, update, getValue: () => value };
}

const memberSidebarState = vi.hoisted(() =>
  createMockStore<Map<string, boolean>>(new Map()),
);
const setMemberSidebarVisibilityMock = vi.hoisted(() =>
  vi.fn((chatId: string, visible: boolean) => {
    memberSidebarState.update((state) => {
      const next = new Map(state);
      if (visible) {
        next.delete(chatId);
      } else {
        next.set(chatId, false);
      }
      return next;
    });
  }),
);
const toggleMemberSidebarVisibilityMock = vi.hoisted(() =>
  vi.fn((chatId: string) => {
    let nextVisible = true;
    memberSidebarState.update((state) => {
      const current = state.get(chatId);
      nextVisible = !(current ?? true);
      const next = new Map(state);
      if (nextVisible) {
        next.delete(chatId);
      } else {
        next.set(chatId, false);
      }
      return next;
    });
    return nextVisible;
  }),
);

vi.mock("$lib/features/chat/stores/memberSidebarVisibilityStore", () => ({
  memberSidebarVisibilityStore: {
    subscribe: memberSidebarState.subscribe,
    setVisibility: setMemberSidebarVisibilityMock,
    toggleVisibility: toggleMemberSidebarVisibilityMock,
  },
}));

const friendStoreState = vi.hoisted(() =>
  createMockStore({ friends: [] as { id: string; name: string }[] }),
);
vi.mock("$lib/features/friends/stores/friendStore", () => ({
  friendStore: { subscribe: friendStoreState.subscribe },
}));

const userState = vi.hoisted(() =>
  createMockStore({ me: { id: "user-1", name: "Owner" } }),
);

const serverStoreState = vi.hoisted(() =>
  createMockStore({ activeServerId: null, servers: [] as unknown[] }),
);
vi.mock("$lib/stores/userStore", () => ({
  userStore: { subscribe: userState.subscribe },
}));

vi.mock("$lib/features/servers/stores/serverStore", () => ({
  serverStore: { subscribe: serverStoreState.subscribe },
  activeServerEmojiCategories: {
    subscribe: (run: (value: unknown) => void) => {
      run([]);
      return () => {};
    },
  },
}));

const addMembersToGroupChatMock = vi.hoisted(() => vi.fn());
const removeGroupChatMemberMock = vi.hoisted(() => vi.fn());
vi.mock("$lib/features/chat/stores/chatStore", () => ({
  chatStore: {
    addMembersToGroupChat: addMembersToGroupChatMock,
    removeGroupChatMember: removeGroupChatMemberMock,
  },
}));

vi.mock("$lib/components/navigation/CallControls.svelte", async () => ({
  default: (await import("../../mocks/Passthrough.svelte")).default,
}));

vi.mock("$lib/components/navigation/ChatActionMenu.svelte", async () => ({
  default: (await import("../../mocks/Passthrough.svelte")).default,
}));

vi.mock("$lib/components/navigation/ChatSearch.svelte", () => ({
  default: class ChatSearchStub {
    $$prop_def: Record<string, unknown>;
    constructor(options: { target: HTMLElement }) {
      options.target.innerHTML = '<div data-testid="chat-search-stub"></div>';
    }
    applyPinnedFilter() {
      return Promise.resolve();
    }
    $destroy() {}
    $set() {}
  },
}));

vi.mock("$lib/features/calls/components/CallModal.svelte", async () => ({
  default: (await import("../../mocks/Passthrough.svelte")).default,
}));

vi.mock("$lib/components/modals/UserCardModal.svelte", async () => ({
  default: (await import("../../mocks/Passthrough.svelte")).default,
}));

vi.mock("$lib/components/users/GroupMemberPicker.svelte", async () => ({
  default: (await import("../../mocks/Passthrough.svelte")).default,
}));

vi.mock("$lib/components/sidebars/SearchSidebar.svelte", async () => ({
  default: (await import("../../mocks/Passthrough.svelte")).default,
}));

vi.mock("$lib/components/sidebars/SearchResultsPanel.svelte", async () => ({
  default: (await import("../../mocks/Passthrough.svelte")).default,
}));

vi.mock("$lib/components/ui/popover/index.js", async () => ({
  ...(await import("../../mocks/ui-popover")),
}));

vi.mock("$features/chat", async () => ({
  ChatView: (await import("../../mocks/features-chat")).ChatView,
}));

const originalInnerWidth = window.innerWidth;
const originalConfirm = window.confirm;

describe("ActiveChatContent member panel integration", () => {
  beforeAll(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  beforeEach(() => {
    cleanup();
    memberSidebarState.set(new Map());
    setMemberSidebarVisibilityMock.mockClear();
    toggleMemberSidebarVisibilityMock.mockClear();
    friendStoreState.set({
      friends: [
        { id: "friend-1", name: "Potential Invite" },
        { id: "user-2", name: "Existing Member" },
      ],
    });
    chatSearchStore.reset();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 640,
    });
    window.confirm = vi.fn().mockReturnValue(true);
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
    window.confirm = originalConfirm;
  });

  const groupChat = {
    type: "group" as const,
    id: "group-1",
    ownerId: "user-1",
    members: [
      {
        id: "user-1",
        name: "Owner",
        avatar: "",
        online: true,
        statusMessage: "Available",
      },
      {
        id: "user-2",
        name: "Member Two",
        avatar: "",
        online: false,
      },
    ],
    messages: [],
  };

  function renderActiveChat(overrides: Partial<typeof groupChat> = {}) {
    return render(ActiveChatContent, {
      chat: { ...groupChat, ...overrides },
      openDetailedProfileModal: vi.fn(),
    });
  }

  it("opens and closes the mobile members panel via the navigation toggle", async () => {
    renderActiveChat();

    const toggleButton = await waitFor(() =>
      screen.getByTestId("mobile-members-toggle"),
    );
    const mobilePanel = await waitFor(() =>
      screen.getByTestId("mobile-member-panel-stub"),
    );
    expect(mobilePanel).toHaveAttribute("data-open", "false");

    await fireEvent.click(toggleButton);

    await waitFor(() =>
      expect(screen.getByTestId("mobile-member-panel-stub")).not.toHaveAttribute(
        "data-open",
        "false",
      ),
    );
    expect(setMemberSidebarVisibilityMock).toHaveBeenLastCalledWith(
      "group-1",
      true,
    );

    const closeButton = screen.getByTestId("close-mobile-members");
    await fireEvent.click(closeButton);

    await waitFor(() =>
      expect(screen.getByTestId("mobile-member-panel-stub")).toHaveAttribute(
        "data-open",
        "false",
      ),
    );
    expect(setMemberSidebarVisibilityMock).toHaveBeenLastCalledWith(
      "group-1",
      false,
    );
  });

  it("omits the mobile toggle and keeps the desktop sidebar on large viewports", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1440,
    });

    renderActiveChat();

    await waitFor(() =>
      expect(screen.queryByTestId("mobile-members-toggle")).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("desktop-member-sidebar-stub")).toBeInTheDocument();
    expect(toggleMemberSidebarVisibilityMock).not.toHaveBeenCalled();
  });
});

describe("MemberSidebar mobile variant", () => {
  beforeEach(() => {
    cleanup();
    friendStoreState.set({
      friends: [{ id: "friend-1", name: "Potential Invite" }],
    });
    window.confirm = vi.fn().mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
  });

  afterAll(() => {
    window.confirm = originalConfirm;
  });

  const members = [
    {
      id: "user-1",
      name: "Owner",
      avatar: "",
      online: true,
      statusMessage: "Available",
    },
    {
      id: "user-2",
      name: "Member Two",
      avatar: "",
      online: false,
    },
  ];

  it("renders members with invite and remove actions in the mobile dialog", async () => {
    const handleMobileOpenChange = vi.fn();

    render(MemberSidebar, {
      members,
      context: "group",
      groupId: "group-1",
      groupOwnerId: "user-1",
      variant: "mobile",
      mobileOpen: true,
      onMobileOpenChange: handleMobileOpenChange,
      openDetailedProfileModal: vi.fn(),
    });

    const panel = await waitFor(() =>
      screen.getByTestId("mobile-member-panel"),
    );
    expect(panel).toBeInTheDocument();
    expect(screen.getByText("Member Two")).toBeInTheDocument();

    const inviteButton = screen.getByRole("button", { name: "Invite members" });
    expect(inviteButton).toBeEnabled();

    const removeButton = screen.getByLabelText("Remove Member Two from group");
    await fireEvent.click(removeButton);

    expect(removeGroupChatMemberMock).toHaveBeenCalledWith("group-1", "user-2");
    expect(window.confirm).toHaveBeenCalled();

    const closeButton = screen.getByLabelText("Close members panel");
    await fireEvent.click(closeButton);
    expect(handleMobileOpenChange).toHaveBeenCalledWith(false);
  });
});
