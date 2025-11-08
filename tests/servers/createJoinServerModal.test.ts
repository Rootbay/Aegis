import { render, fireEvent, waitFor } from "@testing-library/svelte";
import { describe, it, beforeEach, expect, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("$lib/stores/userStore", () => ({
  userStore: {
    subscribe: (run: (value: unknown) => void) => {
      run({ me: { id: "user-1" } });
      return () => {};
    },
  },
}));

vi.mock("$lib/features/servers/stores/serverStore", () => ({
  serverStore: {
    upsertServerFromBackend: vi.fn(),
    setActiveServer: vi.fn(),
    addServer: vi.fn(),
  },
}));

import { invoke } from "@tauri-apps/api/core";
import { serverStore } from "$lib/features/servers/stores/serverStore";
import CreateJoinServerModal from "../../src/lib/components/modals/CreateJoinServerModal.svelte";

const invokeMock = vi.mocked(invoke);
const upsertServerMock = vi.mocked(serverStore.upsertServerFromBackend);
const setActiveServerMock = vi.mocked(serverStore.setActiveServer);

describe("CreateJoinServerModal - invite redemption", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    upsertServerMock.mockReset();
    setActiveServerMock.mockReset();
  });

  it("parses invite URLs and redeems them via the backend", async () => {
    const backendServer = {
      id: "server-123",
      name: "Test Server",
      owner_id: "owner-1",
      channels: [],
      categories: [],
      members: [],
      roles: [],
      invites: [],
    };
    const mappedServer = { ...backendServer, iconUrl: undefined };

    invokeMock.mockResolvedValue({
      server: backendServer,
      already_member: false,
    });
    upsertServerMock.mockReturnValue(mappedServer);

    const { getByText, getByLabelText } = render(CreateJoinServerModal, {
      props: { onclose: vi.fn() },
    });

    await fireEvent.click(getByText("Join with Link"));

    const input = getByLabelText("Enter Invite Link") as HTMLInputElement;
    await fireEvent.input(input, {
      target: { value: "https://aegis.com/inv/ABC123" },
    });

    const joinButton = getByText("Join");
    await fireEvent.click(joinButton);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("redeem_server_invite", {
        code: "ABC123",
      });
    });

    expect(upsertServerMock).toHaveBeenCalledWith(backendServer);
    expect(setActiveServerMock).toHaveBeenCalledWith("server-123");
  });

  it("surfaces backend errors to the user", async () => {
    invokeMock.mockRejectedValue(new Error("Invite expired"));
    const { getByText, getByLabelText, findByText } = render(
      CreateJoinServerModal,
      {
        props: { onclose: vi.fn() },
      },
    );

    await fireEvent.click(getByText("Join with Link"));

    const input = getByLabelText("Enter Invite Link");
    await fireEvent.input(input, { target: { value: "expired-code" } });

    await fireEvent.click(getByText("Join"));

    await findByText("Invite expired");
  });

  it("prefills the create form when a template is selected", async () => {
    const { getByRole, getByLabelText, getByText } = render(
      CreateJoinServerModal,
      {
        props: { onclose: vi.fn() },
      },
    );

    const templateButton = getByRole("button", {
      name: /Gaming Community/i,
    });

    await fireEvent.click(templateButton);

    const nameInput = getByLabelText("Server Name") as HTMLInputElement;
    await waitFor(() => {
      expect(nameInput.value).toBe("Gaming Community");
    });

    const createButton = getByText("Create") as HTMLButtonElement;
    expect(createButton.dataset.templateId).toBe("template-1");
  });
});
