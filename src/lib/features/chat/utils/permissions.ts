import type { User } from "$lib/features/auth/models/User";
import type { Chat } from "$lib/features/chat/models/Chat";
import type { Server } from "$lib/features/servers/models/Server";
import type { Role } from "$lib/features/servers/models/Role";
import { sortRolesByPosition } from "$lib/features/servers/models/Role";

export const CHANNEL_PERMISSION_KEYS = [
  "manage_channels",
  "manage_roles",
  "kick_members",
  "ban_members",
  "view_audit_log",
  "change_nickname",
  "manage_nicknames",
  "moderate_members",
  "read_messages",
  "send_messages",
  "attach_files",
  "embed_links",
  "mention_everyone",
  "use_external_emojis",
  "add_reactions",
  "manage_messages",
  "send_voice_messages",
] as const;

export type KnownChannelPermissionKey =
  (typeof CHANNEL_PERMISSION_KEYS)[number];

export type ChannelPermissionSet = Record<KnownChannelPermissionKey, boolean> & {
  [permission: string]: boolean;
};

type RolePermissionMap = Map<string, Partial<Record<string, unknown>>>;

function createChannelPermissionState(
  initialValue = false,
): ChannelPermissionSet {
  const state = {} as ChannelPermissionSet;
  for (const key of CHANNEL_PERMISSION_KEYS) {
    state[key] = initialValue;
  }
  return state;
}

export function allowAllChannelPermissions(): ChannelPermissionSet {
  return createChannelPermissionState(true);
}

export function emptyChannelPermissionState(): ChannelPermissionSet {
  return createChannelPermissionState(false);
}

function coercePermissionValue(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    if (["false", "0", "no", "off", "disabled"].includes(normalized)) {
      return false;
    }
    return true;
  }
  return Boolean(value);
}

export function cloneChannelPermissionState(
  source?: ChannelPermissionSet | null,
  fallbackValue = false,
): ChannelPermissionSet {
  const clone = createChannelPermissionState(fallbackValue);
  if (!source) {
    return clone;
  }
  for (const [permission, value] of Object.entries(source)) {
    clone[permission] = coercePermissionValue(value);
  }
  return clone;
}

export function buildRolePermissionMap(roles?: Role[] | null): RolePermissionMap {
  const map: RolePermissionMap = new Map();
  if (!Array.isArray(roles)) {
    return map;
  }

  for (const role of roles) {
    if (!role || typeof role.id !== "string" || role.id.trim().length === 0) {
      continue;
    }
    const permissions =
      role.permissions && typeof role.permissions === "object"
        ? role.permissions
        : {};
    map.set(role.id, permissions);
  }

  return map;
}

export function aggregateChannelPermissions({
  memberRoleIds,
  rolePermissionMap,
  basePermissions,
}: {
  memberRoleIds: Iterable<string>;
  rolePermissionMap: RolePermissionMap;
  basePermissions?: ChannelPermissionSet | null;
}): ChannelPermissionSet {
  const aggregate = cloneChannelPermissionState(basePermissions, false);

  for (const roleId of memberRoleIds) {
    if (!roleId) {
      continue;
    }
    const permissions = rolePermissionMap.get(roleId);
    if (!permissions) {
      continue;
    }

    for (const [permission, rawValue] of Object.entries(permissions)) {
      aggregate[permission] = coercePermissionValue(rawValue);
    }
  }

  return aggregate;
}

function collectRoleIdsFromUser(user: User | null | undefined): string[] {
  if (!user) {
    return [];
  }

  const collected = new Set<string>();
  const append = (value?: string[] | null) => {
    if (!Array.isArray(value)) {
      return;
    }
    for (const entry of value) {
      if (typeof entry === "string" && entry.trim().length > 0) {
        collected.add(entry);
      }
    }
  };

  append(user.roles ?? null);
  append((user as Record<string, unknown>).roleIds as string[] | undefined);
  append((user as Record<string, unknown>).role_ids as string[] | undefined);

  return Array.from(collected);
}

export function collectMemberRoleIds({
  me,
  server,
  chat,
}: {
  me: User | null | undefined;
  server?: Server | null;
  chat?: Chat | null;
}): string[] {
  if (!me) {
    return [];
  }

  const roleIds = new Set<string>();
  const addRoleIds = (values?: string[] | null) => {
    if (!Array.isArray(values)) {
      return;
    }
    for (const value of values) {
      if (typeof value === "string" && value.trim().length > 0) {
        roleIds.add(value);
      }
    }
  };

  for (const id of collectRoleIdsFromUser(me)) {
    roleIds.add(id);
  }

  const chatMembers = (chat && "members" in chat ? chat.members : []) ?? [];
  const chatMember = chatMembers.find((member) => member?.id === me.id);
  if (chatMember) {
    for (const id of collectRoleIdsFromUser(chatMember)) {
      roleIds.add(id);
    }
  }

  const serverMembers = server?.members ?? [];
  const serverMember = serverMembers.find((member) => member?.id === me.id);
  if (serverMember) {
    for (const id of collectRoleIdsFromUser(serverMember)) {
      roleIds.add(id);
    }
  }

  for (const role of server?.roles ?? []) {
    if (!role || !Array.isArray(role.member_ids)) {
      continue;
    }
    if (role.member_ids.includes(me.id)) {
      roleIds.add(role.id);
    }
  }

  const orderedRoleIds = Array.from(roleIds);
  if (!server) {
    return orderedRoleIds;
  }

  const rolePositions = new Map<string, number>();
  for (const role of sortRolesByPosition(server.roles ?? [])) {
    if (!role || typeof role.id !== "string") {
      continue;
    }
    rolePositions.set(role.id, role.position);
  }

  orderedRoleIds.sort((a, b) => {
    const positionA = rolePositions.has(a)
      ? rolePositions.get(a) ?? Number.POSITIVE_INFINITY
      : Number.POSITIVE_INFINITY;
    const positionB = rolePositions.has(b)
      ? rolePositions.get(b) ?? Number.POSITIVE_INFINITY
      : Number.POSITIVE_INFINITY;

    if (positionA !== positionB) {
      return positionB - positionA;
    }

    return a.localeCompare(b);
  });

  return orderedRoleIds;
}
