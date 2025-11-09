import { describe, it, expect } from "vitest";

import {
  aggregateChannelPermissions,
  buildRolePermissionMap,
} from "./permissions";
import type { Role } from "$lib/features/servers/models/Role";

describe("aggregateChannelPermissions overrides", () => {
  const baseRole = ({
    id,
    permissions,
  }: {
    id: string;
    permissions: Record<string, boolean>;
  }): Role => ({
    id,
    name: id,
    color: "#ffffff",
    hoist: false,
    mentionable: false,
    position: 1,
    permissions,
    member_ids: [],
  });

  it("produces read-only permissions when role overrides deny sending", () => {
    const roles: Role[] = [
      baseRole({
        id: "role-reader",
        permissions: { read_messages: true, send_messages: true },
      }),
    ];

    const permissions = aggregateChannelPermissions({
      memberRoleIds: ["role-reader"],
      rolePermissionMap: buildRolePermissionMap(roles),
      overrides: {
        roles: {
          "role-reader": {
            deny: { send_messages: true },
          },
        },
      },
    });

    expect(permissions.read_messages).toBe(true);
    expect(permissions.send_messages).toBe(false);
  });

  it("restores send permissions when a user override allows them", () => {
    const roles: Role[] = [
      baseRole({
        id: "role-muted",
        permissions: { read_messages: true, send_messages: false },
      }),
    ];

    const permissions = aggregateChannelPermissions({
      memberRoleIds: ["role-muted"],
      rolePermissionMap: buildRolePermissionMap(roles),
      overrides: {
        users: {
          "user-1": {
            allow: { send_messages: true },
          },
        },
      },
      userId: "user-1",
    });

    expect(permissions.send_messages).toBe(true);
  });
});
