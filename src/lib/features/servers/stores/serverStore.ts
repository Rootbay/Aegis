import { writable, get, type Readable } from "svelte/store";
import { invoke } from "@tauri-apps/api/core";
import type { Server } from "$lib/features/servers/models/Server";
import type { User } from "$lib/features/auth/models/User";
import type { Channel } from "$lib/features/channels/models/Channel";
import type { Role } from "$lib/features/servers/models/Role";
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
  [key: string]: unknown;
};

interface ServerStoreState {
  servers: Server[];
  loading: boolean;
  activeServerId: string | null;
}

interface ServerStore extends Readable<ServerStoreState> {
  handleServersUpdate: (servers: Server[]) => void;
  setActiveServer: (serverId: string | null) => void;
  updateServerMemberPresence: (userId: string, isOnline: boolean) => void;
  addServer: (server: Server) => void;
  removeServer: (serverId: string) => void;
  fetchServerDetails: (serverId: string) => Promise<void>;
  addChannelToServer: (serverId: string, channel: Channel) => void;
  updateServer: (serverId: string, patch: Partial<Server>) => void;
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
    const { members = [], channels = [], roles = [], ...rest } = s;
    const normalizedMembers: BackendUser[] = Array.isArray(members)
      ? members
      : [];
    const normalizedChannels: Channel[] = Array.isArray(channels)
      ? (channels as Channel[])
      : [];
    const normalizedRoles: Role[] = Array.isArray(roles)
      ? (roles as Role[])
      : [];
    return {
      ...rest,
      id: s.id,
      name: s.name,
      owner_id: s.owner_id ?? "",
      iconUrl: s.iconUrl,
      channels: normalizedChannels,
      members: normalizedMembers.map(fromBackendUser),
      roles: normalizedRoles,
    } as Server;
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
    updatedServers.forEach((server) => serverCache.set(server.id, server));
    set({
      servers: updatedServers,
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
    update((s) => ({ ...s, servers: [...s.servers, server] }));
    serverCache.set(server.id, server);
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
          ? { ...server, channels: [...(server.channels || []), channel] }
          : server,
      ),
    }));
    const server = get({ subscribe }).servers.find((s) => s.id === serverId);
    if (server) serverCache.set(serverId, server);
  };

  const updateServer = (serverId: string, patch: Partial<Server>) => {
    update((s) => {
      const servers = s.servers.map((server) =>
        server.id === serverId ? { ...server, ...patch } : server,
      );
      const updated = servers.find((sv) => sv.id === serverId);
      if (updated) serverCache.set(serverId, updated);
      return { ...s, servers };
    });
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
    updateServer,
    removeChannelFromServer,
    initialize,
    getServer,
  };
}

export const serverStore = createServerStore();
