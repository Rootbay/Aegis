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
const addServerMock = vi.mocked(serverStore.addServer);

describe("CreateJoinServerModal - invite redemption", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    upsertServerMock.mockReset();
    setActiveServerMock.mockReset();
    addServerMock.mockReset();
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
});

describe("CreateJoinServerModal - server creation", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    addServerMock.mockReset();
    setActiveServerMock.mockReset();
  });

  it("sends icon payload bytes and uses backend icon URL", async () => {
    const backendServer = {
      id: "server-123",
      name: "Iconic Guild",
      owner_id: "user-1",
      created_at: new Date().toISOString(),
      channels: [],
      categories: [],
      members: [],
      roles: [],
      invites: [],
      iconUrl: "data:image/png;base64,ZmFrZQ==",
    };

    invokeMock.mockResolvedValue(backendServer);

    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(42);
    const createObjectUrlSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:server-icon");
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    try {
      const fileBytes = new Uint8Array([1, 2, 3, 4]);
      const iconFile = new File([fileBytes], "server.png", { type: "image/png" });

      const { getByText, getByLabelText, container } = render(
        CreateJoinServerModal,
        { props: { onclose: vi.fn() } },
      );

      await fireEvent.click(getByText("Create New Server"));

      const fileInput = container.querySelector("input[type='file']") as HTMLInputElement;
      await fireEvent.change(fileInput, { target: { files: [iconFile] } });

      expect(createObjectUrlSpy).toHaveBeenCalled();

      const nameInput = getByLabelText("Server Name");
      await fireEvent.input(nameInput, { target: { value: "Iconic Guild" } });

      await fireEvent.click(getByText("Create"));

      await waitFor(() => {
        expect(invokeMock).toHaveBeenCalledWith(
          "create_server",
          expect.objectContaining({
            server: expect.objectContaining({ id: "server-42" }),
            icon: {
              bytes: Array.from(fileBytes),
              mimeType: "image/png",
              name: "server.png",
            },
          }),
        );
      });

      expect(addServerMock).toHaveBeenCalledWith(backendServer);
      expect(setActiveServerMock).toHaveBeenCalledWith("server-123");
      expect(revokeSpy).toHaveBeenCalledWith("blob:server-icon");
    } finally {
      nowSpy.mockRestore();
      createObjectUrlSpy.mockRestore();
      revokeSpy.mockRestore();
    }
  });
});
