import { writable, get, type Readable } from "svelte/store";
import { invoke } from "@tauri-apps/api/core";
import type {
  Server,
  ServerModerationSettings,
} from "$lib/features/servers/models/Server";
import type { User } from "$lib/features/auth/models/User";
import type { Channel } from "$lib/features/channels/models/Channel";
import type { ChannelCategory } from "$lib/features/channels/models/ChannelCategory";
import type { Role } from "$lib/features/servers/models/Role";
import type { ServerInvite } from "$lib/features/servers/models/ServerInvite";
import { userStore } from "$lib/stores/userStore";
import { serverCache } from "$lib/utils/cache";

type BackendUser = {
  id: string;
  username?: string;
  name?: string;
  avatar: string;
  is_online?: boolean;
  online?: boolean;
  public_key?: string;
  bio?: string;
  tag?: string;
  roles?: string[];
  role_ids?: string[];
  status_message?: string | null;
  location?: string | null;
};

type BackendServerInvite = {
  id: string;
  server_id: string;
  code: string;
  created_by: string;
  created_at: string;
  expires_at?: string | null;
  max_uses?: number | null;
  uses: number;
};

type BackendChannelCategory = {
  id: string;
  server_id: string;
  name: string;
  position: number;
  created_at: string;
};

type BackendServer = {
  id: string;
  name: string;
  iconUrl?: string;
  owner_id?: string;
  members?: BackendUser[];
  channels?: Channel[];
  roles?: Role[];
  created_at?: string;
  default_channel_id?: string;
  allow_invites?: boolean;
  moderation_level?: "None" | "Low" | "Medium" | "High";
  explicit_content_filter?: boolean;
  invites?: BackendServerInvite[];
  categories?: BackendChannelCategory[];
  settings?: Record<string, unknown> | null;
  transparent_edits?: boolean | number | null;
  transparentEdits?: boolean | number | null;
  deleted_message_display?: string | null;
  deletedMessageDisplay?: string | null;
  [key: string]: unknown;
};

interface ServerStoreState {
  servers: Server[];
  loading: boolean;
  activeServerId: string | null;
  bansByServer: Record<string, User[]>;
}

export type ServerUpdateResult = {
  success: boolean;
  error?: string;
};

interface ServerStore extends Readable<ServerStoreState> {
  handleServersUpdate: (servers: Server[]) => void;
  setActiveServer: (serverId: string | null) => void;
  updateServerMemberPresence: (
    userId: string,
    presence: {
      isOnline: boolean;
      statusMessage?: string | null;
      location?: string | null;
    },
  ) => void;
  addServer: (server: Server) => void;
  removeServer: (serverId: string) => void;
  fetchServerDetails: (serverId: string) => Promise<void>;
  addChannelToServer: (serverId: string, channel: Channel) => void;
  addCategoryToServer: (serverId: string, category: ChannelCategory) => void;
  addInviteToServer: (serverId: string, invite: ServerInvite) => void;
  refreshServerInvites: (serverId: string) => Promise<ServerInvite[]>;
  removeMemberFromServer: (serverId: string, memberId: string) => void;
  removeMember: (
    serverId: string,
    memberId: string,
  ) => Promise<ServerUpdateResult>;
  updateServer: (
    serverId: string,
    patch: Partial<Server>,
  ) => Promise<ServerUpdateResult>;
  replaceServerRoles: (
    serverId: string,
    roles: Role[],
  ) => Promise<ServerUpdateResult>;
  removeChannelFromServer: (serverId: string, channelId: string) => void;
  removeCategoryFromServer: (serverId: string, categoryId: string) => void;
  initialize: () => Promise<void>;
  getServer: (serverId: string) => Promise<Server | null>;
  fetchBans: (
    serverId: string,
    options?: { force?: boolean },
  ) => Promise<User[]>;
  unbanMember: (
    serverId: string,
    userId: string,
  ) => Promise<ServerUpdateResult>;
}

export function createServerStore(): ServerStore {
  const { subscribe, set, update } = writable<ServerStoreState>({
    servers: [],
    loading: true,
    activeServerId:
      typeof localStorage !== "undefined"
        ? localStorage.getItem("activeServerId")
        : null,
    bansByServer: {},
  });

  const banCache = new Map<string, User[]>();

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;

  const coerceBoolean = (value: unknown): boolean | undefined => {
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        return undefined;
      }
      return value !== 0;
    }
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes", "on"].includes(normalized)) {
        return true;
      }
      if (["false", "0", "no", "off"].includes(normalized)) {
        return false;
      }
    }
    return undefined;
  };

  const normalizeDeletedMessageDisplay = (
    value: unknown,
  ): "ghost" | "tombstone" | undefined => {
    if (typeof value !== "string") {
      return undefined;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === "ghost" || normalized === "tombstone") {
      return normalized as "ghost" | "tombstone";
    }
    return undefined;
  };

  const extractSettingsChanges = (
    incoming: unknown,
    previous: ServerModerationSettings | undefined,
  ): {
    normalizedSettings?: ServerModerationSettings;
    moderationPayload: Record<string, unknown>;
  } => {
    const moderationPayload: Record<string, unknown> = {};

    if (incoming === null || incoming === undefined) {
      return { normalizedSettings: undefined, moderationPayload };
    }

    if (!isRecord(incoming)) {
      return { normalizedSettings: undefined, moderationPayload };
    }

    const base: ServerModerationSettings = { ...(previous ?? {}) };
    let touched = false;

    for (const [key, value] of Object.entries(incoming)) {
      if (key === "transparentEdits") {
        const coerced = coerceBoolean(value);
        if (coerced === undefined) {
          continue;
        }
        base.transparentEdits = coerced;
        moderationPayload.transparentEdits = coerced;
        touched = true;
        continue;
      }

      if (key === "deletedMessageDisplay") {
        const normalized = normalizeDeletedMessageDisplay(value);
        if (!normalized) {
          continue;
        }
        base.deletedMessageDisplay = normalized;
        moderationPayload.deletedMessageDisplay = normalized;
        touched = true;
        continue;
      }

      base[key] = value;
      touched = true;
    }

    if (!touched) {
      return { normalizedSettings: undefined, moderationPayload };
    }

    return { normalizedSettings: base, moderationPayload };
  };

  const normalizeRoleIds = (value: unknown): string[] => {
    if (!Array.isArray(value)) {
      return [];
    }
    const ids = new Set<string>();
    for (const entry of value) {
      if (typeof entry === "string" && entry.trim().length > 0) {
        ids.add(entry);
      }
    }
    return Array.from(ids.values());
  };

  const normalizeRole = (role: Role): Role => {
    const permissions =
      role.permissions && typeof role.permissions === "object"
        ? role.permissions
        : {};
    const memberIds = normalizeRoleIds(role.member_ids ?? []);
    return {
      ...role,
      permissions: { ...permissions },
      member_ids: memberIds,
    };
  };

  const normalizeRolesArray = (roles: unknown): Role[] =>
    Array.isArray(roles)
      ? (roles as Role[]).map((role) => normalizeRole(role))
      : [];

  const buildMemberRoleMap = (roles: Role[]): Map<string, string[]> => {
    const map = new Map<string, string[]>();
    for (const role of roles) {
      for (const memberId of role.member_ids) {
        if (map.has(memberId)) {
          map.get(memberId)!.push(role.id);
        } else {
          map.set(memberId, [role.id]);
        }
      }
    }
    return map;
  };

  const assignRolesToMembers = (
    members: BackendUser[] | User[] | undefined,
    roleMap: Map<string, string[]>,
  ): User[] => {
    if (!Array.isArray(members)) {
      return [];
    }
    return members.map((member) => {
      const memberId = member.id;
      const assignedRoles = roleMap.get(memberId) ?? [];
      const baseUser =
        "username" in member
          ? fromBackendUser(member as BackendUser, assignedRoles)
          : ({
              ...(member as User),
              roles: assignedRoles,
              role_ids: assignedRoles,
              roleIds: assignedRoles,
            } as User);
      return baseUser;
    });
  };

  const mapBackendInvite = (invite: BackendServerInvite): ServerInvite => ({
    id: invite.id,
    serverId: invite.server_id,
    code: invite.code,
    createdBy: invite.created_by,
    createdAt: invite.created_at,
    expiresAt: invite.expires_at ?? undefined,
    maxUses: invite.max_uses ?? undefined,
    uses: invite.uses ?? 0,
  });

  const applyRoleAssignmentsToServer = (server: Server): Server => {
    const normalizedRoles = normalizeRolesArray(server.roles ?? []);
    const roleAssignments = buildMemberRoleMap(normalizedRoles);
    const enrichedMembers = assignRolesToMembers(
      server.members,
      roleAssignments,
    );
    return {
      ...server,
      roles: normalizedRoles,
      members: enrichedMembers,
    } as Server;
  };

  const fromBackendUser = (
    u: BackendUser,
    assignedRoleIds: string[] = [],
  ): User => {
    const fallbackName = u.username ?? u.name;
    const name =
      fallbackName && fallbackName.trim().length > 0
        ? fallbackName
        : `User-${u.id.slice(0, 4)}`;
    const backendRoles = normalizeRoleIds(u.role_ids ?? u.roles ?? []) ?? [];
    const normalizedRoleIds =
      assignedRoleIds.length > 0 ? assignedRoleIds : backendRoles;
    const statusMessageRaw = u.status_message ?? null;
    const trimmedStatusMessage = statusMessageRaw?.trim?.() ?? "";
    const normalizedStatusMessage =
      trimmedStatusMessage.length > 0 ? trimmedStatusMessage : null;
    const locationRaw = u.location ?? null;
    const trimmedLocation = locationRaw?.trim?.() ?? "";
    const normalizedLocation =
      trimmedLocation.length > 0 ? trimmedLocation : null;
    return {
      id: u.id,
      name,
      avatar: u.avatar,
      online: u.is_online ?? u.online ?? false,
      publicKey: u.public_key ?? undefined,
      bio: u.bio ?? undefined,
      tag: u.tag ?? undefined,
      roles: normalizedRoleIds,
      role_ids: normalizedRoleIds,
      roleIds: normalizedRoleIds,
      statusMessage: normalizedStatusMessage,
      location: normalizedLocation,
    };
  };

  const sortCategories = (categories: ChannelCategory[]): ChannelCategory[] =>
    [...categories].sort((a, b) => {
      if (a.position !== b.position) {
        return a.position - b.position;
      }
      return a.name.localeCompare(b.name);
    });

  const mapServer = (s: BackendServer): Server => {
    const {
      members = [],
      channels = [],
      roles = [],
      invites = [],
      categories = [],
      settings: rawSettings,
      transparent_edits,
      transparentEdits,
      deleted_message_display,
      deletedMessageDisplay,
      ...rest
    } = s;
    const normalizedMembers: BackendUser[] = Array.isArray(members)
      ? members
      : [];
    const normalizedChannels: Channel[] = Array.isArray(channels)
      ? (channels as Channel[])
      : [];
    const normalizedRoles: Role[] = normalizeRolesArray(roles);
    const roleAssignments = buildMemberRoleMap(normalizedRoles);
    const normalizedInvites: BackendServerInvite[] = Array.isArray(invites)
      ? invites
      : [];
    const normalizedCategories: ChannelCategory[] = Array.isArray(categories)
      ? sortCategories(
          (categories as BackendChannelCategory[]).map((category) => ({
            id: category.id,
            server_id: category.server_id,
            name: category.name,
            position: Number.isFinite(category.position)
              ? category.position
              : 0,
            created_at: category.created_at,
          })),
        )
      : [];
    const mapInvite = (invite: BackendServerInvite): ServerInvite => ({
      id: invite.id,
      serverId: invite.server_id,
      code: invite.code,
      createdBy: invite.created_by,
      createdAt: invite.created_at,
      expiresAt: invite.expires_at ?? undefined,
      maxUses: invite.max_uses ?? undefined,
      uses: invite.uses ?? 0,
    });

    const mergedSettings: ServerModerationSettings = isRecord(rawSettings)
      ? ({ ...rawSettings } as ServerModerationSettings)
      : {};
    const transparentSetting =
      coerceBoolean(
        transparentEdits ?? transparent_edits ?? mergedSettings.transparentEdits,
      );
    if (transparentSetting !== undefined) {
      mergedSettings.transparentEdits = transparentSetting;
    }
    const deletedSetting = normalizeDeletedMessageDisplay(
      deletedMessageDisplay ??
        deleted_message_display ??
        mergedSettings.deletedMessageDisplay,
    );
    if (deletedSetting) {
      mergedSettings.deletedMessageDisplay = deletedSetting;
    }
    const hasSettings = Object.keys(mergedSettings).length > 0;

    return {
      ...rest,
      id: s.id,
      name: s.name,
      owner_id: s.owner_id ?? "",
      iconUrl: s.iconUrl,
      channels: normalizedChannels,
      categories: normalizedCategories,
      members: assignRolesToMembers(normalizedMembers, roleAssignments),
      roles: normalizedRoles,
      invites: normalizedInvites.map(mapInvite),
      settings: hasSettings ? mergedSettings : undefined,
    } as Server;
  };

  const normalizeServer = (server: Server): Server => ({
    ...applyRoleAssignmentsToServer({
      ...server,
      invites: server.invites ?? [],
      channels: server.channels ?? [],
      categories: sortCategories(server.categories ?? []),
      members: server.members ?? [],
      roles: server.roles ?? [],
    }),
  });

  const cloneServer = (server: Server): Server =>
    JSON.parse(JSON.stringify(normalizeServer(server))) as Server;

  const hasOwn = (object: Partial<Server>, key: keyof Server | string) =>
    Object.prototype.hasOwnProperty.call(object, key);

  const applyPatchToServer = (
    original: Server,
    patch: Partial<Server>,
  ): Server => {
    const next: Server = {
      ...original,
      ...patch,
      channels: hasOwn(patch, "channels")
        ? (patch.channels ?? [])
        : (original.channels ?? []),
      categories: hasOwn(patch, "categories")
        ? (patch.categories ?? [])
        : (original.categories ?? []),
      members: hasOwn(patch, "members")
        ? (patch.members ?? [])
        : (original.members ?? []),
      roles: hasOwn(patch, "roles")
        ? (patch.roles ?? [])
        : (original.roles ?? []),
      invites: hasOwn(patch, "invites")
        ? (patch.invites ?? [])
        : (original.invites ?? []),
    } as Server;

    if (hasOwn(patch, "iconUrl")) {
      next.iconUrl = patch.iconUrl ?? undefined;
    }
    if (hasOwn(patch, "description")) {
      next.description = patch.description ?? undefined;
    }
    if (hasOwn(patch, "default_channel_id")) {
      next.default_channel_id = patch.default_channel_id ?? undefined;
    }
    if (hasOwn(patch, "allow_invites")) {
      next.allow_invites = patch.allow_invites;
    }
    if (hasOwn(patch, "moderation_level")) {
      next.moderation_level = patch.moderation_level;
    }
    if (hasOwn(patch, "explicit_content_filter")) {
      next.explicit_content_filter = patch.explicit_content_filter;
    }

    return normalizeServer(next);
  };

  const getServer = async (serverId: string): Promise<Server | null> => {
    if (serverCache.has(serverId)) {
      return serverCache.get(serverId) || null;
    }
    try {
      const server = await invoke<BackendServer | null>("get_server_details", {
        serverId,
        server_id: serverId,
      });
      if (server) {
        const mapped = mapServer(server);
        serverCache.set(serverId, mapped);
        return mapped;
      }
      return null;
    } catch (e) {
      console.error(`Failed to get server ${serverId}:`, e);
      return null;
    }
  };

  const initialize = async () => {
    update((s) => ({ ...s, loading: true }));
    try {
      const currentUser = get(userStore).me;
      if (currentUser) {
        const fetchedServers = await invoke<BackendServer[]>("get_servers", {
          currentUserId: currentUser.id,
          current_user_id: currentUser.id,
        });
        const mapped = fetchedServers.map(mapServer);
        mapped.forEach((server) => serverCache.set(server.id, server));
        update((s) => ({ ...s, servers: mapped, loading: false }));
      } else {
        console.warn("User not loaded, cannot fetch servers.");
        update((s) => ({ ...s, loading: false }));
      }
    } catch (e) {
      console.error("Failed to fetch servers:", e);
      update((s) => ({ ...s, loading: false }));
    }
  };

  const handleServersUpdate = (updatedServers: Server[]) => {
    const normalized = updatedServers.map((server) =>
      normalizeServer({
        ...server,
        invites: server.invites ?? [],
      }),
    );
    const snapshot = get({ subscribe });
    const filteredBans = Object.fromEntries(
      Object.entries(snapshot.bansByServer).filter(([serverId]) =>
        normalized.some((server) => server.id === serverId),
      ),
    );
    const validServerIds = new Set(normalized.map((server) => server.id));
    for (const id of banCache.keys()) {
      if (!validServerIds.has(id)) {
        banCache.delete(id);
      }
    }
    normalized.forEach((server) => serverCache.set(server.id, server));
    set({
      servers: normalized,
      loading: false,
      activeServerId: snapshot.activeServerId,
      bansByServer: filteredBans,
    });
  };

  const setActiveServer = (serverId: string | null) => {
    update((s) => ({ ...s, activeServerId: serverId }));
    if (typeof localStorage !== "undefined") {
      if (serverId) {
        localStorage.setItem("activeServerId", serverId);
      } else {
        localStorage.removeItem("activeServerId");
      }
    }
    if (serverId) {
      fetchServerDetails(serverId);
    }
  };

  const updateServerMemberPresence = (
    userId: string,
    presence: {
      isOnline: boolean;
      statusMessage?: string | null;
      location?: string | null;
    },
  ) => {
    update((s) => ({
      ...s,
      servers: s.servers.map((server) => ({
        ...server,
        members: server.members.map((member) =>
          member.id === userId
            ? {
                ...member,
                online: presence.isOnline,
                statusMessage:
                  presence.statusMessage !== undefined
                    ? presence.statusMessage
                    : (member.statusMessage ?? null),
                location:
                  presence.location !== undefined
                    ? presence.location
                    : (member.location ?? null),
              }
            : member,
        ),
      })),
    }));
  };

  const addServer = (server: Server) => {
    const withInvites: Server = {
      ...server,
      invites: server.invites ?? [],
      categories: server.categories ?? [],
    };
    update((s) => ({ ...s, servers: [...s.servers, withInvites] }));
    serverCache.set(withInvites.id, withInvites);
  };

  const removeServer = (serverId: string) => {
    update((s) => {
      const { [serverId]: _removed, ...restBans } = s.bansByServer;
      return {
        ...s,
        servers: s.servers.filter((sv) => sv.id !== serverId),
        bansByServer: restBans,
      };
    });
    serverCache.delete(serverId);
    banCache.delete(serverId);
  };

  const fetchServerDetails = async (serverId: string) => {
    const cachedServer = serverCache.get(serverId);
    if (cachedServer && cachedServer.channels && cachedServer.members) {
      update((s) => ({
        ...s,
        servers: s.servers.map((server) =>
          server.id === serverId ? cachedServer : server,
        ),
      }));
      return;
    }
    update((s) => ({ ...s, loading: true }));
    try {
      const [channelsResult, membersResult, categoriesResult] =
        await Promise.all([
          invoke<Channel[]>("get_channels_for_server", {
            serverId,
            server_id: serverId,
          }).catch((e) => {
            console.error(`Failed to get channels for server ${serverId}:`, e);
            return null;
          }),
          invoke<BackendUser[]>("get_members_for_server", {
            serverId,
            server_id: serverId,
          }).catch((e) => {
            console.error(`Failed to get members for server ${serverId}:`, e);
            return null;
          }),
          invoke<BackendChannelCategory[]>(
            "get_channel_categories_for_server",
            {
              serverId,
              server_id: serverId,
            },
          ).catch((e) => {
            console.error(
              `Failed to get channel categories for server ${serverId}:`,
              e,
            );
            return null;
          }),
        ]);

      update((s) => {
        const newServers = s.servers.map((server) => {
          if (server.id !== serverId) return server;

          const updatedServer = { ...server };

          if (channelsResult !== null) {
            updatedServer.channels = channelsResult;
          }

          if (categoriesResult !== null) {
            updatedServer.categories = (
              categoriesResult as BackendChannelCategory[]
            ).map((category) => ({
              id: category.id,
              server_id: category.server_id,
              name: category.name,
              position: Number.isFinite(category.position)
                ? category.position
                : 0,
              created_at: category.created_at,
            }));
          }

          if (membersResult !== null) {
            const roleAssignments = buildMemberRoleMap(
              normalizeRolesArray(updatedServer.roles ?? []),
            );
            updatedServer.members = assignRolesToMembers(
              membersResult,
              roleAssignments,
            );
          }

          return normalizeServer(updatedServer);
        });
        const serverToCache = newServers.find((s) => s.id === serverId);
        if (serverToCache) serverCache.set(serverId, serverToCache);
        return { ...s, servers: newServers };
      });
    } finally {
      update((s) => ({ ...s, loading: false }));
    }
  };

  const addChannelToServer = (serverId: string, channel: Channel) => {
    update((s) => ({
      ...s,
      servers: s.servers.map((server) =>
        server.id === serverId
          ? {
              ...server,
              channels: [...(server.channels || []), channel],
              invites: server.invites ?? [],
            }
          : server,
      ),
    }));
    const server = get({ subscribe }).servers.find((s) => s.id === serverId);
    if (server) serverCache.set(serverId, server);
  };

  const addCategoryToServer = (serverId: string, category: ChannelCategory) => {
    update((s) => ({
      ...s,
      servers: s.servers.map((server) =>
        server.id === serverId
          ? {
              ...server,
              categories: sortCategories([
                ...(server.categories || []),
                category,
              ]),
              invites: server.invites ?? [],
            }
          : server,
      ),
    }));
    const server = get({ subscribe }).servers.find((s) => s.id === serverId);
    if (server) serverCache.set(serverId, server);
  };

  const setInvitesForServer = (serverId: string, invites: ServerInvite[]) => {
    update((s) => {
      const servers = s.servers.map((server) => {
        if (server.id !== serverId) return server;
        const nextInvites = invites.slice();
        const nextServer = {
          ...server,
          invites: nextInvites,
        };
        serverCache.set(serverId, nextServer);
        return nextServer;
      });
      return { ...s, servers };
    });
  };

  const addInviteToServer = (serverId: string, invite: ServerInvite) => {
    const state = get({ subscribe });
    const server = state.servers.find((sv) => sv.id === serverId);
    const existingInvites = Array.isArray(server?.invites)
      ? server!.invites
      : [];
    const filtered = existingInvites.filter(
      (existing) => existing.id !== invite.id && existing.code !== invite.code,
    );
    setInvitesForServer(serverId, [...filtered, invite]);
  };

  const refreshServerInvites = async (
    serverId: string,
  ): Promise<ServerInvite[]> => {
    if (!serverId) {
      return [];
    }

    try {
      const backendInvites = await invoke<BackendServerInvite[]>(
        "list_server_invites",
        {
          serverId,
          server_id: serverId,
        },
      );
      const invites = Array.isArray(backendInvites)
        ? backendInvites.map(mapBackendInvite)
        : [];
      setInvitesForServer(serverId, invites);
      return invites;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Failed to refresh server invites.";
      throw new Error(message);
    }
  };

  const fetchBans = async (
    serverId: string,
    options: { force?: boolean } = {},
  ): Promise<User[]> => {
    if (!serverId) {
      return [];
    }

    const shouldUseCache = !options.force && banCache.has(serverId);
    if (shouldUseCache) {
      const cached = banCache.get(serverId) ?? [];
      update((state) => ({
        ...state,
        bansByServer: { ...state.bansByServer, [serverId]: cached },
      }));
      return cached;
    }

    try {
      const backendBans = await invoke<BackendUser[] | null>(
        "list_server_bans",
        {
          serverId,
          server_id: serverId,
        },
      );
      const bans = Array.isArray(backendBans)
        ? backendBans.map(fromBackendUser)
        : [];
      banCache.set(serverId, bans);
      update((state) => ({
        ...state,
        bansByServer: { ...state.bansByServer, [serverId]: bans },
      }));
      return bans;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Failed to fetch banned members.";
      throw new Error(message);
    }
  };

  const unbanMember = async (
    serverId: string,
    userId: string,
  ): Promise<ServerUpdateResult> => {
    if (!serverId || !userId) {
      return {
        success: false,
        error: "Missing server or user identifier.",
      };
    }

    try {
      await invoke("unban_server_member", {
        serverId,
        server_id: serverId,
        userId,
        user_id: userId,
      });

      const cached = banCache.get(serverId) ?? [];
      const updated = cached.filter((member) => member.id !== userId);
      banCache.set(serverId, updated);

      update((state) => ({
        ...state,
        bansByServer: { ...state.bansByServer, [serverId]: updated },
      }));

      return { success: true };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Failed to unban member.";
      return {
        success: false,
        error: message,
      };
    }
  };

  const removeMemberFromServer = (serverId: string, memberId: string) => {
    update((s) => {
      const servers = s.servers.map((server) => {
        if (server.id !== serverId) return server;
        const existingMembers = Array.isArray(server.members)
          ? server.members
          : [];
        const filteredMembers = existingMembers.filter(
          (member) => member.id !== memberId,
        );
        const updatedRoles = (server.roles ?? []).map((role) => ({
          ...role,
          member_ids: role.member_ids.filter((id) => id !== memberId),
        }));
        const nextServer = normalizeServer({
          ...server,
          members: filteredMembers,
          roles: updatedRoles,
        });
        serverCache.set(serverId, nextServer);
        return nextServer;
      });

      if (!servers.some((srv) => srv.id === serverId)) {
        serverCache.delete(serverId);
      }

      return { ...s, servers };
    });
  };

  const removeMember = async (
    serverId: string,
    memberId: string,
  ): Promise<ServerUpdateResult> => {
    if (!serverId || !memberId) {
      return {
        success: false,
        error: "Missing server or member identifier.",
      };
    }

    try {
      await invoke("remove_server_member", {
        serverId,
        server_id: serverId,
        memberId,
        member_id: memberId,
      });

      removeMemberFromServer(serverId, memberId);

      return { success: true };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Failed to remove member.";
      return {
        success: false,
        error: message,
      };
    }
  };

  const updateServer = async (
    serverId: string,
    patch: Partial<Server>,
  ): Promise<ServerUpdateResult> => {
    const snapshot = get({ subscribe });
    const serverIndex = snapshot.servers.findIndex(
      (srv) => srv.id === serverId,
    );
    if (serverIndex === -1) {
      return {
        success: false,
        error: `Server ${serverId} not found`,
      };
    }

    const currentServer = snapshot.servers[serverIndex];
    const previousServer = cloneServer(currentServer);

    const metadataPayload: Record<string, unknown> = {};
    if (hasOwn(patch, "name")) {
      metadataPayload.name = patch.name;
    }
    if (hasOwn(patch, "iconUrl")) {
      metadataPayload.iconUrl = patch.iconUrl ?? null;
    }
    if (hasOwn(patch, "description")) {
      metadataPayload.description = patch.description ?? null;
    }
    if (hasOwn(patch, "default_channel_id")) {
      metadataPayload.defaultChannelId = patch.default_channel_id ?? null;
    }
    if (hasOwn(patch, "allow_invites")) {
      metadataPayload.allowInvites = patch.allow_invites;
    }
    const metadataTouched = Object.keys(metadataPayload).length > 0;

    const moderationPayload: Record<string, unknown> = {};
    if (hasOwn(patch, "moderation_level")) {
      moderationPayload.moderationLevel = patch.moderation_level ?? null;
    }
    if (hasOwn(patch, "explicit_content_filter")) {
      moderationPayload.explicitContentFilter =
        patch.explicit_content_filter ?? false;
    }

    const rolesTouched = hasOwn(patch, "roles") && Array.isArray(patch.roles);
    const channelsTouched =
      hasOwn(patch, "channels") && Array.isArray(patch.channels);

    let normalizedPatch: Partial<Server> = rolesTouched
      ? { ...patch, roles: normalizeRolesArray(patch.roles ?? []) }
      : { ...patch };

    if (hasOwn(normalizedPatch, "settings")) {
      delete (normalizedPatch as Record<string, unknown>).settings;
    }

    let settingsWereTouched = false;
    if (hasOwn(patch, "settings")) {
      const { normalizedSettings, moderationPayload: settingsModerationPayload } =
        extractSettingsChanges(patch.settings, previousServer.settings);
      if (normalizedSettings !== undefined) {
        normalizedPatch = {
          ...normalizedPatch,
          settings: normalizedSettings,
        };
        settingsWereTouched = true;
      }
      Object.assign(moderationPayload, settingsModerationPayload);
    }

    const moderationTouched = Object.keys(moderationPayload).length > 0;

    const optimisticServer = applyPatchToServer(
      previousServer,
      normalizedPatch,
    );

    update((state) => {
      const servers = state.servers.map((srv, index) =>
        index === serverIndex ? optimisticServer : srv,
      );
      serverCache.set(serverId, optimisticServer);
      return { ...state, servers };
    });

    let metadataResult: BackendServer | null = null;
    let moderationResult: BackendServer | null = null;
    let rolesResult: Role[] | null = null;
    let channelsResult: Channel[] | null = null;

    try {
      if (metadataTouched) {
        metadataResult = await invoke<BackendServer>("update_server_metadata", {
          serverId,
          server_id: serverId,
          metadata: metadataPayload,
        });
      }

      if (rolesTouched) {
        rolesResult = await invoke<Role[]>("update_server_roles", {
          serverId,
          server_id: serverId,
          roles: normalizedPatch.roles ?? [],
        });
      }

      if (channelsTouched) {
        channelsResult = await invoke<Channel[]>("update_server_channels", {
          serverId,
          server_id: serverId,
          channels: patch.channels ?? [],
        });
      }

      if (moderationTouched) {
        moderationResult = await invoke<BackendServer>(
          "update_server_moderation_flags",
          {
            serverId,
            server_id: serverId,
            moderation: moderationPayload,
          },
        );
      }

      const backendServer = moderationResult ?? metadataResult;
      let finalServer: Server = backendServer
        ? mapServer(backendServer)
        : optimisticServer;

      if (channelsResult) {
        finalServer = {
          ...finalServer,
          channels: channelsResult,
        } as Server;
      }

      if (rolesResult) {
        finalServer = {
          ...finalServer,
          roles: rolesResult,
        } as Server;
      }

      const patchedSettings = normalizedPatch
        .settings as ServerModerationSettings | undefined;
      if (settingsWereTouched) {
        finalServer = {
          ...finalServer,
          settings: patchedSettings,
        } as Server;
      } else if (!finalServer.settings && previousServer.settings) {
        finalServer = {
          ...finalServer,
          settings: previousServer.settings,
        } as Server;
      }

      finalServer = normalizeServer(finalServer);

      update((state) => {
        const servers = state.servers.map((srv, index) =>
          index === serverIndex ? finalServer : srv,
        );
        serverCache.set(serverId, finalServer);
        return { ...state, servers };
      });

      return { success: true };
    } catch (error) {
      update((state) => {
        const servers = state.servers.map((srv, index) =>
          index === serverIndex ? previousServer : srv,
        );
        serverCache.set(serverId, previousServer);
        return { ...state, servers };
      });

      console.error("Failed to persist server changes:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const replaceServerRoles = async (
    serverId: string,
    roles: Role[],
  ): Promise<ServerUpdateResult> => {
    const snapshot = get({ subscribe });
    const serverIndex = snapshot.servers.findIndex(
      (srv) => srv.id === serverId,
    );

    if (serverIndex === -1) {
      return {
        success: false,
        error: `Server ${serverId} not found`,
      };
    }

    const previousServer = cloneServer(snapshot.servers[serverIndex]);
    const normalizedRoles = normalizeRolesArray(roles);
    const optimisticServer = applyRoleAssignmentsToServer({
      ...previousServer,
      roles: normalizedRoles,
    });

    update((state) => {
      const servers = state.servers.map((srv, index) =>
        index === serverIndex ? optimisticServer : srv,
      );
      serverCache.set(serverId, optimisticServer);
      return { ...state, servers };
    });

    try {
      const persistedRoles = await invoke<Role[]>("update_server_roles", {
        serverId,
        server_id: serverId,
        roles: normalizedRoles,
      });

      const finalServer = applyRoleAssignmentsToServer({
        ...optimisticServer,
        roles: normalizeRolesArray(persistedRoles),
      });

      update((state) => {
        const servers = state.servers.map((srv, index) =>
          index === serverIndex ? finalServer : srv,
        );
        serverCache.set(serverId, finalServer);
        return { ...state, servers };
      });

      return { success: true };
    } catch (error) {
      update((state) => {
        const servers = state.servers.map((srv, index) =>
          index === serverIndex ? previousServer : srv,
        );
        serverCache.set(serverId, previousServer);
        return { ...state, servers };
      });

      console.error("Failed to update server roles:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const removeChannelFromServer = (serverId: string, channelId: string) => {
    update((s) => {
      const servers = s.servers.map((server) =>
        server.id === serverId
          ? {
              ...server,
              channels: (server.channels || []).filter(
                (c) => c.id !== channelId,
              ),
            }
          : server,
      );
      const updated = servers.find((sv) => sv.id === serverId);
      if (updated) serverCache.set(serverId, updated);
      return { ...s, servers };
    });
  };

  const removeCategoryFromServer = (serverId: string, categoryId: string) => {
    update((s) => {
      const servers = s.servers.map((server) =>
        server.id === serverId
          ? {
              ...server,
              categories: (server.categories || []).filter(
                (category) => category.id !== categoryId,
              ),
            }
          : server,
      );
      const updated = servers.find((sv) => sv.id === serverId);
      if (updated) serverCache.set(serverId, updated);
      return { ...s, servers };
    });
  };

  return {
    subscribe,
    handleServersUpdate,
    setActiveServer,
    updateServerMemberPresence,
    addServer,
    removeServer,
    fetchServerDetails,
    addChannelToServer,
    addCategoryToServer,
    addInviteToServer,
    refreshServerInvites,
    removeMemberFromServer,
    removeMember,
    updateServer,
    replaceServerRoles,
    removeChannelFromServer,
    removeCategoryFromServer,
    initialize,
    getServer,
    fetchBans,
    unbanMember,
  };
}

export const serverStore = createServerStore();
