import {
  CHANNEL_PERMISSION_KEYS,
  type ChannelPermissionOverrideEntry,
  type ChannelPermissionOverrides,
  type KnownChannelPermissionKey,
} from "$lib/features/chat/utils/permissions";

const channelPermissionKeys = CHANNEL_PERMISSION_KEYS;

export type PermissionOverrideChoice = "inherit" | "allow" | "deny";
export type PermissionMatrixRow = Record<
  KnownChannelPermissionKey,
  PermissionOverrideChoice
>;

export type PermissionMatrixState = {
  roles: Record<string, PermissionMatrixRow>;
  users: Record<string, PermissionMatrixRow>;
};

export function createEmptyPermissionMatrixRow(): PermissionMatrixRow {
  const row = {} as PermissionMatrixRow;
  for (const key of channelPermissionKeys) {
    row[key] = "inherit";
  }
  return row;
}

export function createEmptyPermissionOverridesState(): PermissionMatrixState {
  return {
    roles: {},
    users: {},
  };
}

export function rowHasOverrides(row: PermissionMatrixRow): boolean {
  for (const key of channelPermissionKeys) {
    if (row[key] !== "inherit") {
      return true;
    }
  }
  return false;
}

export function createPermissionMatrixRowFromEntry(
  entry?: ChannelPermissionOverrideEntry | null,
): PermissionMatrixRow {
  const row = createEmptyPermissionMatrixRow();
  if (!entry) {
    return row;
  }

  const apply = (
    matrix: ChannelPermissionOverrideEntry["allow"],
    choice: PermissionOverrideChoice,
  ) => {
    if (!matrix) {
      return;
    }
    for (const key of channelPermissionKeys) {
      if (matrix[key]) {
        row[key] = choice;
      }
    }
  };

  apply(entry.deny ?? null, "deny");
  apply(entry.allow ?? null, "allow");

  return row;
}

export function serializePermissionOverridesState(
  state: PermissionMatrixState,
): ChannelPermissionOverrides | undefined {
  const serialize = (
    entries: Record<string, PermissionMatrixRow>,
  ): Record<string, ChannelPermissionOverrideEntry> => {
    const result: Record<string, ChannelPermissionOverrideEntry> = {};
    for (const [id, row] of Object.entries(entries)) {
      if (!rowHasOverrides(row)) {
        continue;
      }
      const allow: Partial<Record<KnownChannelPermissionKey, boolean>> = {};
      const deny: Partial<Record<KnownChannelPermissionKey, boolean>> = {};
      for (const key of channelPermissionKeys) {
        if (row[key] === "allow") {
          allow[key] = true;
        } else if (row[key] === "deny") {
          deny[key] = true;
        }
      }
      const entry: ChannelPermissionOverrideEntry = {};
      if (Object.keys(allow).length > 0) {
        entry.allow = allow;
      }
      if (Object.keys(deny).length > 0) {
        entry.deny = deny;
      }
      if (entry.allow || entry.deny) {
        result[id] = entry;
      }
    }
    return result;
  };

  const roles = serialize(state.roles);
  const users = serialize(state.users);

  const hasRoles = Object.keys(roles).length > 0;
  const hasUsers = Object.keys(users).length > 0;
  if (!hasRoles && !hasUsers) {
    return undefined;
  }

  const overrides: ChannelPermissionOverrides = {};
  if (hasRoles) {
    overrides.roles = roles;
  }
  if (hasUsers) {
    overrides.users = users;
  }
  return overrides;
}

export function clonePermissionOverrides(
  overrides: ChannelPermissionOverrides | null | undefined,
): ChannelPermissionOverrides | undefined {
  if (!overrides) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(overrides)) as ChannelPermissionOverrides;
}
