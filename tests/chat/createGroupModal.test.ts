import { render, fireEvent, waitFor } from "@testing-library/svelte";
import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

class ResizeObserverMock {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);

vi.mock("$lib/features/chat/stores/chatStore", () => ({
  chatStore: {
    handleGroupChatCreated: vi.fn(() => ({
      id: "group-1",
      name: "Alpha, Beta",
      ownerId: "me",
      memberIds: ["friend-1", "friend-2", "me"],
      createdAt: new Date().toISOString(),
    })),
    setActiveChat: vi.fn(async () => {}),
    searchMessages: async () => ({
      received: 0,
      hasMore: false,
      nextCursor: null,
    }),
  },
}));

vi.mock("$lib/stores/ToastStore", () => ({
  toasts: {
    addToast: vi.fn(),
  },
}));

import CreateGroupModal from "../../src/lib/components/modals/CreateGroupModal.svelte";
import { chatStore } from "$lib/features/chat/stores/chatStore";
import { toasts } from "$lib/stores/ToastStore";
import { invoke } from "@tauri-apps/api/core";

describe("CreateGroupModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a group and activates the chat", async () => {
    const mockedInvoke = invoke as unknown as ReturnType<typeof vi.fn>;
    mockedInvoke.mockResolvedValue({
      id: "group-1",
      name: "Alpha, Beta",
      owner_id: "me",
      created_at: new Date().toISOString(),
      member_ids: ["friend-1", "friend-2", "me"],
    });

    const { getByLabelText, getByText } = render(CreateGroupModal, {
      props: {
        allUsers: [
          {
            id: "friend-1",
            name: "Alpha",
            avatar: "",
            isFriend: true,
            isPinned: false,
          },
          {
            id: "friend-2",
            name: "Beta",
            avatar: "",
            isFriend: true,
            isPinned: false,
          },
        ],
        onclose: vi.fn(),
      },
    });

    await fireEvent.click(getByLabelText("Alpha"));
    await fireEvent.click(getByLabelText("Beta"));

    await fireEvent.click(getByText("Create Group"));

    await waitFor(() => {
      expect(chatStore.handleGroupChatCreated).toHaveBeenCalledWith({
        id: "group-1",
        name: "Alpha, Beta",
        owner_id: "me",
        created_at: expect.any(String),
        member_ids: ["friend-1", "friend-2", "me"],
      });
    });

    expect(chatStore.setActiveChat).toHaveBeenCalledWith(
      "group-1",
      "group",
      undefined,
      {
        forceRefresh: true,
      },
    );
    expect(toasts.addToast).toHaveBeenCalledWith("Group created.", "success");
  });

  it("preselects provided users and surfaces additional users", async () => {
    const { getByLabelText, getByText } = render(CreateGroupModal, {
      props: {
        allUsers: [
          {
            id: "friend-1",
            name: "Alpha",
            avatar: "",
            isFriend: true,
            isPinned: false,
          },
        ],
        preselectedUserIds: ["friend-1"],
        additionalUsers: [
          {
            id: "user-2",
            name: "Gamma",
            avatar: "",
            isFriend: false,
            isPinned: false,
          },
        ],
        onclose: vi.fn(),
      },
    });

    const preselectedCheckbox = getByLabelText("Alpha") as HTMLInputElement;
    expect(preselectedCheckbox.checked).toBe(true);

    expect(() => getByText("Gamma")).not.toThrow();

    await fireEvent.click(preselectedCheckbox);
    expect(preselectedCheckbox.checked).toBe(false);
  });
});
