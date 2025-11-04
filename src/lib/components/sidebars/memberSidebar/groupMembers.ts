import type { User } from "$lib/features/auth/models/User";
import type { Role } from "$lib/features/servers/models/Role";

export type MemberWithRoles = User & Record<string, unknown>;

export interface MemberGroup {
  id: string;
  label: string;
  color?: string;
  hoist?: boolean;
  members: MemberWithRoles[];
}

export const FALLBACK_GROUP_ID = "uncategorized";
export const FALLBACK_GROUP_LABEL = "Members";

export function extractMemberRoleValues(member: MemberWithRoles): string[] {
  const values = new Set<string>();
  const source = member as Record<string, unknown>;

  const pushValue = (value: unknown) => {
    if (typeof value === "string" && value.trim().length > 0) {
      values.add(value);
    }
  };

  const pushMany = (raw: unknown) => {
    if (Array.isArray(raw)) {
      for (const entry of raw) {
        pushValue(entry);
      }
      return;
    }
    pushValue(raw);
  };

  pushMany(source.roles);
  pushMany(source.roleIds);
  pushMany(source.role_ids);
  pushMany(source.roleNames);
  pushMany(source.role_names);
  pushMany(source.roleId);
  pushMany(source.role_id);
  pushValue(source.role);
  pushValue(source.roleName);
  pushValue(source.role_name);
  pushValue(source.primaryRole);
  pushValue(source.primary_role);
  pushValue(source.primaryRoleId);
  pushValue(source.primary_role_id);

  return Array.from(values.values());
}

export function groupMembersByRole(
  memberList: MemberWithRoles[],
  roleList: Role[],
): MemberGroup[] {
  if (memberList.length === 0) {
    return [];
  }

  const groups = new Map<string, MemberGroup>();
  const roleById = new Map<string, Role>();
  for (const role of roleList) {
    roleById.set(role.id, role);
  }

  const roleByName = new Map<string, Role>();
  for (const role of roleList) {
    roleByName.set(role.name.toLowerCase(), role);
  }

  const orderByGroupId = new Map<string, number>();
  roleList.forEach((role, index) => {
    orderByGroupId.set(`role:${role.id}`, index);
  });

  const ensureGroup = (
    key: string,
    label: string,
    color?: string,
    hoist = false,
  ) => {
    if (!groups.has(key)) {
      groups.set(key, { id: key, label, color, hoist, members: [] });
    }
    return groups.get(key)!;
  };

  const fallbackGroup = ensureGroup(FALLBACK_GROUP_ID, FALLBACK_GROUP_LABEL);

  for (const member of memberList) {
    const roleIdentifiers = extractMemberRoleValues(member);
    let targetGroup: MemberGroup | null = null;

    for (const identifier of roleIdentifiers) {
      const role = roleById.get(identifier);
      if (role) {
        targetGroup = ensureGroup(
          `role:${role.id}`,
          role.name,
          role.color,
          role.hoist,
        );
        break;
      }
    }

    if (!targetGroup) {
      for (const identifier of roleIdentifiers) {
        const role = roleByName.get(identifier.toLowerCase());
        if (role) {
          targetGroup = ensureGroup(
            `role:${role.id}`,
            role.name,
            role.color,
            role.hoist,
          );
          break;
        }
      }
    }

    if (!targetGroup && roleIdentifiers.length > 0) {
      const label = roleIdentifiers[0];
      targetGroup = ensureGroup(`custom:${label}`, label);
    }

    (targetGroup ?? fallbackGroup).members.push(member);
  }

  const result = Array.from(groups.values()).filter(
    (group) => group.members.length > 0,
  );

  result.sort((a, b) => {
    const hoistA = a.hoist ? 1 : 0;
    const hoistB = b.hoist ? 1 : 0;
    if (hoistA !== hoistB) {
      return hoistB - hoistA;
    }

    const orderA = orderByGroupId.has(a.id)
      ? orderByGroupId.get(a.id)!
      : Number.MAX_SAFE_INTEGER;
    const orderB = orderByGroupId.has(b.id)
      ? orderByGroupId.get(b.id)!
      : Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) {
      return orderA - orderB;
    }

    if (a.id === FALLBACK_GROUP_ID || b.id === FALLBACK_GROUP_ID) {
      if (a.id === FALLBACK_GROUP_ID && b.id !== FALLBACK_GROUP_ID) {
        return 1;
      }
      if (b.id === FALLBACK_GROUP_ID && a.id !== FALLBACK_GROUP_ID) {
        return -1;
      }
    }

    return a.label.localeCompare(b.label);
  });

  for (const group of result) {
    group.members.sort((left, right) => {
      const leftOnline = Boolean((left as Record<string, unknown>).online);
      const rightOnline = Boolean((right as Record<string, unknown>).online);
      if (leftOnline !== rightOnline) {
        return (rightOnline ? 1 : 0) - (leftOnline ? 1 : 0);
      }
      return (left.name ?? "").localeCompare(right.name ?? "");
    });
  }

  return result;
}
