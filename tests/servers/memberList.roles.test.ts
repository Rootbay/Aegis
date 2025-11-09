import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/stores/ToastStore", () => ({
  toasts: {
    addToast: vi.fn(),
  },
}));

import MemberList from "../../src/lib/components/lists/MemberList.svelte";
import { serverStore } from "../../src/lib/features/servers/stores/serverStore";
import type { User } from "../../src/lib/features/auth/models/User";
import type { Role } from "../../src/lib/features/servers/models/Role";
import { toasts } from "../../src/lib/stores/ToastStore";

describe("MemberList role toggles", () => {
  const baseMember: User = {
    id: "member-1",
    name: "Test Member",
    avatar: "",
    online: true,
    roles: ["role-1"],
  };

  const roles: Role[] = [
    {
      id: "role-1",
      name: "Admin",
      color: "#fff",
      hoist: false,
      mentionable: true,
      permissions: {},
      position: 0,
      member_ids: ["member-1"],
    },
    {
      id: "role-2",
      name: "Moderator",
      color: "#f00",
      hoist: false,
      mentionable: false,
      permissions: {},
      position: 1,
      member_ids: [],
    },
  ];

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("calls the store helper and shows a success toast when assigning a role", async () => {
    const updateSpy = vi
      .spyOn(serverStore, "updateMemberRoles")
      .mockResolvedValue({ success: true });

    render(MemberList, {
      members: [baseMember],
      roles,
      serverId: "server-1",
    });

    const assignButton = screen.getByRole("button", {
      name: /Assign Moderator to Test Member/i,
    });

    await fireEvent.click(assignButton);

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith("server-1", "member-1", [
        "role-1",
        "role-2",
      ]);
    });

    await waitFor(() => {
      expect(toasts.addToast).toHaveBeenCalledWith(
        "Assigned Moderator to Test Member.",
        "success",
      );
    });

    updateSpy.mockRestore();
  });

  it("surfaces backend errors when a toggle fails", async () => {
    const updateSpy = vi
      .spyOn(serverStore, "updateMemberRoles")
      .mockResolvedValue({ success: false, error: "Not allowed" });

    render(MemberList, {
      members: [
        {
          ...baseMember,
          roles: ["role-1", "role-2"],
          roleIds: ["role-1", "role-2"],
          role_ids: ["role-1", "role-2"],
        },
      ],
      roles,
      serverId: "server-1",
    });

    const removeButton = screen.getByRole("button", {
      name: /Remove Moderator from Test Member/i,
    });

    await fireEvent.click(removeButton);

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith("server-1", "member-1", [
        "role-1",
      ]);
    });

    await waitFor(() => {
      expect(toasts.addToast).toHaveBeenCalledWith("Not allowed", "error");
    });

    await waitFor(() => {
      expect(removeButton).not.toBeDisabled();
    });

    updateSpy.mockRestore();
  });
});
