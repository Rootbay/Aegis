import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/environment", () => ({
  browser: true,
}));

const mocks = vi.hoisted(() => ({
  fetchBansMock: vi.fn(),
  unbanMemberMock: vi.fn(),
  addToastMock: vi.fn(),
  serverStoreState: {
    servers: [],
    loading: false,
    activeServerId: null,
    bansByServer: {},
  },
}));

vi.mock("$lib/features/servers/stores/serverStore", () => ({
  serverStore: {
    subscribe: (run: (value: typeof mocks.serverStoreState) => void) => {
      run(mocks.serverStoreState);
      return () => {};
    },
    fetchBans: mocks.fetchBansMock,
    unbanMember: mocks.unbanMemberMock,
  },
}));

vi.mock("$lib/stores/ToastStore", () => ({
  toasts: {
    addToast: mocks.addToastMock,
  },
}));

import BanList from "../../src/lib/components/lists/BanList.svelte";

const baseUser = {
  id: "user-1",
  name: "Alice",
  avatar: "avatar.png",
  online: false,
};

describe("BanList", () => {
  beforeEach(() => {
    mocks.fetchBansMock.mockReset();
    mocks.unbanMemberMock.mockReset();
    mocks.addToastMock.mockReset();
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads banned members on mount", async () => {
    mocks.fetchBansMock.mockResolvedValueOnce([baseUser]);

    const { findByText } = render(BanList, {
      props: { serverId: "server-123" },
    });

    await findByText("Alice");
    expect(mocks.fetchBansMock).toHaveBeenCalledWith("server-123", { force: false });
  });

  it("confirms and unbans a member, refreshing the list", async () => {
    mocks.fetchBansMock.mockResolvedValueOnce([baseUser]);
    mocks.fetchBansMock.mockResolvedValueOnce([]);
    mocks.unbanMemberMock.mockResolvedValue({ success: true });

    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmSpy);

    const { findByText, queryByText } = render(BanList, {
      props: { serverId: "server-123" },
    });

    const unbanButton = await findByText("Unban");
    await fireEvent.click(unbanButton);

    await waitFor(() => {
      expect(mocks.unbanMemberMock).toHaveBeenCalledWith("server-123", "user-1");
    });

    expect(mocks.fetchBansMock).toHaveBeenNthCalledWith(1, "server-123", { force: false });
    expect(mocks.fetchBansMock).toHaveBeenNthCalledWith(2, "server-123", { force: true });

    await waitFor(() => {
      expect(mocks.addToastMock).toHaveBeenCalledWith("Alice was unbanned.", "success");
    });

    await waitFor(() => {
      expect(queryByText("Alice")).toBeNull();
    });

    expect(confirmSpy).toHaveBeenCalled();
  });
});
