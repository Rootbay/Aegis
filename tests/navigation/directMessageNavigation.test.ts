import { render } from "@testing-library/svelte";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { tick } from "svelte";

import { createAppHandlers } from "$lib/layout/app/handlers";
import type { ModalManager } from "$lib/layout/app/modalManager";

import DirectMessagePage from "../../src/routes/dm/[chatId]/+page.svelte";
import GroupChatPage from "../../src/routes/groups/[chatId]/+page.svelte";

const { gotoMock } = vi.hoisted(() => ({ gotoMock: vi.fn() }));
const { setActiveChatMock } = vi.hoisted(() => ({
  setActiveChatMock: vi.fn(async () => {}),
}));
const { setActiveServerMock } = vi.hoisted(() => ({
  setActiveServerMock: vi.fn(),
}));
const { commandPaletteStoreMock } = vi.hoisted(() => ({
  commandPaletteStoreMock: {
    open: vi.fn(),
    close: vi.fn(),
    isOpen: {
      subscribe(run: (value: boolean) => void) {
        run(false);
        return () => {};
      },
    },
  },
}));

const { pageStore, setPage } = vi.hoisted(() => {
  type PageValue = {
    params: { chatId?: string };
    url: URL;
  };

  let value: PageValue = {
    params: { chatId: "user-1" },
    url: new URL("http://localhost/dm/user-1"),
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

function noopStore<T>(value: T) {
  return {
    subscribe(run: (v: T) => void) {
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
  openReportMessageModal: vi.fn(),
  openCollaborativeDocument: vi.fn(),
  openCollaborativeWhiteboard: vi.fn(),
};

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
}));

vi.mock("$lib/features/servers/stores/serverStore", () => ({
  serverStore: {
    setActiveServer: setActiveServerMock,
  },
  activeServerEmojiCategories: {
    subscribe: (run: (value: unknown) => void) => {
      run([]);
      return () => {};
    },
  },
}));

describe("direct message navigation", () => {
  beforeEach(() => {
    gotoMock.mockClear();
    setActiveChatMock.mockClear();
    setActiveServerMock.mockClear();
  });

  it("navigates to the dm route when selecting a direct message", () => {
    const handlers = createAppHandlers(modalManagerStub);

    handlers.handleSelectDirectMessage({ chatId: "user-1", type: "dm" });

    expect(setActiveServerMock).toHaveBeenCalledWith(null);
    expect(setActiveChatMock).toHaveBeenCalledWith("user-1", "dm");
    expect(gotoMock).toHaveBeenCalledWith("/dm/user-1");
  });

  it("navigates to the group route when selecting a group chat", () => {
    const handlers = createAppHandlers(modalManagerStub);

    handlers.handleSelectDirectMessage({ chatId: "group-1", type: "group" });

    expect(setActiveServerMock).toHaveBeenCalledWith(null);
    expect(setActiveChatMock).toHaveBeenCalledWith("group-1", "group");
    expect(gotoMock).toHaveBeenCalledWith("/groups/group-1");
  });

  it("allows navigation to be skipped when requested", () => {
    const handlers = createAppHandlers(modalManagerStub);

    handlers.handleSelectDirectMessage({
      chatId: "user-2",
      type: "dm",
      skipNavigation: true,
    });

    expect(setActiveChatMock).toHaveBeenCalledWith("user-2", "dm");
    expect(gotoMock).not.toHaveBeenCalled();
  });
});

describe("direct message routes", () => {
  beforeEach(() => {
    setActiveChatMock.mockClear();
    setActiveServerMock.mockClear();
  });

  it("restores the active direct message on initial load", () => {
    setPage({
      params: { chatId: "user-42" },
      url: new URL("http://localhost/dm/user-42"),
    });

    render(DirectMessagePage);

    expect(setActiveServerMock).toHaveBeenCalledWith(null);
    expect(setActiveChatMock).toHaveBeenCalledWith("user-42", "dm");
  });

  it("updates when the direct message route changes", async () => {
    render(DirectMessagePage);
    setActiveChatMock.mockClear();

    setPage({
      params: { chatId: "user-77" },
      url: new URL("http://localhost/dm/user-77"),
    });
    await tick();

    expect(setActiveChatMock).toHaveBeenCalledWith("user-77", "dm");
  });

  it("restores the active group chat on initial load", () => {
    setPage({
      params: { chatId: "group-99" },
      url: new URL("http://localhost/groups/group-99"),
    });

    render(GroupChatPage);

    expect(setActiveServerMock).toHaveBeenCalledWith(null);
    expect(setActiveChatMock).toHaveBeenCalledWith("group-99", "group");
  });
});
