import { render, waitFor, cleanup } from "@testing-library/svelte";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { writable } from "svelte/store";
import * as appNavigation from "$app/navigation";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("$lib/features/servers/stores/serverStore", () => ({
  serverStore: {
    upsertServerFromBackend: vi.fn(),
    setActiveServer: vi.fn(),
  },
}));

let gotoSpy: ReturnType<typeof vi.spyOn>;
const pageStore = writable({
  params: { code: "" },
  url: new URL("https://app.local/inv"),
});

vi.mock("$app/stores", () => ({
  page: pageStore,
}));

import { invoke } from "@tauri-apps/api/core";
import { serverStore } from "$lib/features/servers/stores/serverStore";
import InvitePage from "../../src/routes/inv/[code]/+page.svelte";

const invokeMock = vi.mocked(invoke);
const upsertServerMock = vi.mocked(serverStore.upsertServerFromBackend);
const setActiveServerMock = vi.mocked(serverStore.setActiveServer);

describe("Invite deep link route", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    if (!gotoSpy) {
      gotoSpy = vi.spyOn(appNavigation, "goto").mockResolvedValue();
    }
    gotoSpy.mockClear();
    upsertServerMock.mockReset();
    setActiveServerMock.mockReset();
    pageStore.set({
      params: { code: "" },
      url: new URL("https://app.local/inv"),
    });
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  it("redeems the invite and redirects to the server", async () => {
    const backendServer = {
      id: "joined-1",
      name: "Joined Server",
      owner_id: "owner",
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

    pageStore.set({
      params: { code: "welcome" },
      url: new URL("https://app.local/inv/welcome"),
    });

    render(InvitePage);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("redeem_server_invite", {
        code: "welcome",
      });
    });

    expect(upsertServerMock).toHaveBeenCalledWith(backendServer);
    expect(setActiveServerMock).toHaveBeenCalledWith("joined-1");
    expect(gotoSpy).toHaveBeenCalledWith("/channels/joined-1");
  });

  it("displays errors when redemption fails", async () => {
    invokeMock.mockRejectedValue(new Error("Invite not found"));

    pageStore.set({
      params: { code: "missing" },
      url: new URL("https://app.local/inv/missing"),
    });

    const { findByText } = render(InvitePage);

    await findByText("Invite not found");
    expect(gotoSpy).not.toHaveBeenCalled();
  });
});
