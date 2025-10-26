import { writable, get, type Readable } from "svelte/store";
import { invoke } from "@tauri-apps/api/core";
import type { Server } from "$lib/features/servers/models/Server";
import type { User } from "$lib/features/auth/models/User";
import type { Channel } from "$lib/features/channels/models/Channel";
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
  [key: string]: unknown;
};

interface ServerStoreState {
  servers: Server[];
  loading: boolean;
  activeServerId: string | null;
}

export type ServerUpdateResult = {
  success: boolean;
  error?: string;
};

interface ServerStore extends Readable<ServerStoreState> {
  handleServersUpdate: (servers: Server[]) => void;
  setActiveServer: (serverId: string | null) => void;
  updateServerMemberPresence: (userId: string, isOnline: boolean) => void;
  addServer: (server: Server) => void;
  removeServer: (serverId: string) => void;
  fetchServerDetails: (serverId: string) => Promise<void>;
  addChannelToServer: (serverId: string, channel: Channel) => void;
  addInviteToServer: (serverId: string, invite: ServerInvite) => void;
  removeMemberFromServer: (serverId: string, memberId: string) => void;
  updateServer: (
    serverId: string,
    patch: Partial<Server>,
  ) => Promise<ServerUpdateResult>;
  removeChannelFromServer: (serverId: string, channelId: string) => void;
  initialize: () => Promise<void>;
  getServer: (serverId: string) => Promise<Server | null>;
}

export function createServerStore(): ServerStore {
  const { subscribe, set, update } = writable<ServerStoreState>({
    servers: [],
    loading: true,
    activeServerId:
      typeof localStorage !== "undefined"
        ? localStorage.getItem("activeServerId")
        : null,
  });

  const fromBackendUser = (u: BackendUser): User => {
    const fallbackName = u.username ?? u.name;
    const name =
      fallbackName && fallbackName.trim().length > 0
        ? fallbackName
        : `User-${u.id.slice(0, 4)}`;
    return {
      id: u.id,
      name,
      avatar: u.avatar,
      online: u.is_online ?? u.online ?? false,
      publicKey: u.public_key ?? undefined,
      bio: u.bio ?? undefined,
      tag: u.tag ?? undefined,
    };
  };

  const mapServer = (s: BackendServer): Server => {
    const {
      members = [],
      channels = [],
      roles = [],
      invites = [],
      ...rest
    } = s;
    const normalizedMembers: BackendUser[] = Array.isArray(members)
      ? members
      : [];
    const normalizedChannels: Channel[] = Array.isArray(channels)
      ? (channels as Channel[])
      : [];
    const normalizedRoles: Role[] = Array.isArray(roles)
      ? (roles as Role[])
      : [];
    const normalizedInvites: BackendServerInvite[] = Array.isArray(invites)
      ? invites
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
    return {
      ...rest,
      id: s.id,
      name: s.name,
      owner_id: s.owner_id ?? "",
      iconUrl: s.iconUrl,
      channels: normalizedChannels,
      members: normalizedMembers.map(fromBackendUser),
      roles: normalizedRoles,
      invites: normalizedInvites.map(mapInvite),
    } as Server;
  };

  const normalizeServer = (server: Server): Server => ({
    ...server,
    invites: server.invites ?? [],
    channels: server.channels ?? [],
    members: server.members ?? [],
    roles: server.roles ?? [],
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
    const normalized = updatedServers.map((server) => ({
      ...server,
      invites: server.invites ?? [],
    }));
    normalized.forEach((server) => serverCache.set(server.id, server));
    set({
      servers: normalized,
      loading: false,
      activeServerId: get({ subscribe }).activeServerId,
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

  const updateServerMemberPresence = (userId: string, isOnline: boolean) => {
    update((s) => ({
      ...s,
      servers: s.servers.map((server) => ({
        ...server,
        members: server.members.map((member) =>
          member.id === userId ? { ...member, online: isOnline } : member,
        ),
      })),
    }));
  };

  const addServer = (server: Server) => {
    const withInvites: Server = {
      ...server,
      invites: server.invites ?? [],
    };
    update((s) => ({ ...s, servers: [...s.servers, withInvites] }));
    serverCache.set(withInvites.id, withInvites);
  };

  const removeServer = (serverId: string) => {
    update((s) => ({
      ...s,
      servers: s.servers.filter((s) => s.id !== serverId),
    }));
    serverCache.delete(serverId);
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
      const [channelsResult, membersResult] = await Promise.all([
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
      ]);

      update((s) => {
        const newServers = s.servers.map((server) => {
          if (server.id !== serverId) return server;

          const updatedServer = { ...server };

          if (channelsResult !== null) {
            updatedServer.channels = channelsResult;
          }

          if (membersResult !== null) {
            updatedServer.members = membersResult.map(fromBackendUser);
          }

          return updatedServer;
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

  const addInviteToServer = (serverId: string, invite: ServerInvite) => {
    update((s) => {
      const servers = s.servers.map((server) => {
        if (server.id !== serverId) return server;
        const existingInvites = Array.isArray(server.invites)
          ? server.invites
          : [];
        const filtered = existingInvites.filter(
          (existing) =>
            existing.id !== invite.id && existing.code !== invite.code,
        );
        return {
          ...server,
          invites: [...filtered, invite],
        };
      });
      const updated = servers.find((sv) => sv.id === serverId);
      if (updated) serverCache.set(serverId, updated);
      return { ...s, servers };
    });
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
        const nextServer = {
          ...server,
          members: filteredMembers,
        };
        serverCache.set(serverId, nextServer);
        return nextServer;
      });

      if (!servers.some((srv) => srv.id === serverId)) {
        serverCache.delete(serverId);
      }

      return { ...s, servers };
    });
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
    const moderationTouched = Object.keys(moderationPayload).length > 0;

    const rolesTouched = hasOwn(patch, "roles") && Array.isArray(patch.roles);
    const channelsTouched =
      hasOwn(patch, "channels") && Array.isArray(patch.channels);

    const optimisticServer = applyPatchToServer(previousServer, patch);

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
          roles: patch.roles ?? [],
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

      if (hasOwn(patch, "settings")) {
        finalServer = {
          ...finalServer,
          settings: patch.settings,
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

  return {
    subscribe,
    handleServersUpdate,
    setActiveServer,
    updateServerMemberPresence,
    addServer,
    removeServer,
    fetchServerDetails,
    addChannelToServer,
    addInviteToServer,
    removeMemberFromServer,
    updateServer,
    removeChannelFromServer,
    initialize,
    getServer,
  };
}

export const serverStore = createServerStore();
