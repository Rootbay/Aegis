import { getInvoke } from "$services/tauri";
import type { Server } from "../models/Server";
import type { User } from "$lib/features/auth/models/User";

export type ServerMembershipState = "joined" | "invited" | "recent" | "none";

export interface ServerSummary {
  id: string;
  name: string;
  icon: string;
  description?: string;
  memberCount: number;
  tags?: string[];
  mutualFriends?: number;
  lastActiveAt?: string;
  owner: User;
}

export interface ServerInviteSummary {
  id: string;
  server: ServerSummary;
  invitedBy: User;
  invitedAt: string;
  note?: string;
}

export interface ServerSearchResult {
  server: ServerSummary;
  membership: ServerMembershipState;
  note?: string;
}

type BackendServerInvite = {
  id: string;
  server?: {
    id: string;
    name: string;
    icon?: string | null;
    description?: string | null;
    owner_id?: string;
    members?: number | null;
    tags?: string[] | null;
    mutual_friends?: number | null;
    last_active_at?: string | null;
  } | null;
  invited_by?: {
    id: string;
    username?: string | null;
    avatar?: string | null;
    is_online?: boolean | null;
  } | null;
  invited_at?: string | null;
  note?: string | null;
};

type BackendServerSearchResult = {
  id: string;
  name: string;
  icon?: string | null;
  description?: string | null;
  owner_id?: string;
  member_count?: number | null;
  tags?: string[] | null;
  mutual_friends?: number | null;
  last_active_at?: string | null;
  membership?: string | null;
  note?: string | null;
};

const fallbackUsers: Record<string, User> = {
  "mesh-ops": {
    id: "mesh-ops",
    name: "Amelia Park",
    avatar: "https://api.dicebear.com/8.x/bottts/svg?seed=Amelia",
    online: true,
    statusMessage: "Triaging cluster failovers",
    location: "Seoul",
    tag: "amelia",
  },
  "mesh-observer": {
    id: "mesh-observer",
    name: "Jonah Wilder",
    avatar: "https://api.dicebear.com/8.x/bottts/svg?seed=Jonah",
    online: false,
    statusMessage: "Auditing telemetry pipelines",
    location: "Reykjavík",
    tag: "jonah",
  },
  "mesh-guild": {
    id: "mesh-guild",
    name: "Priya Raman",
    avatar: "https://api.dicebear.com/8.x/bottts/svg?seed=Priya",
    online: true,
    statusMessage: "Coordinating guild retros",
    location: "Bengaluru",
    tag: "priya",
  },
};

const fallbackServers: Record<string, Server> = {
  "server-relay-ops": {
    id: "server-relay-ops",
    name: "Relay Operations Guild",
    owner_id: fallbackUsers["mesh-ops"].id,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
    channels: [],
    categories: [],
    members: [
      { ...fallbackUsers["mesh-ops"] },
      { ...fallbackUsers["mesh-guild"] },
    ],
    roles: [],
    iconUrl: "https://api.dicebear.com/8.x/shapes/svg?seed=Relay",
    description: "Hands-on operators keeping the mesh flowing.",
    invites: [],
  },
  "server-observatory": {
    id: "server-observatory",
    name: "Mesh Observatory",
    owner_id: fallbackUsers["mesh-observer"].id,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 9).toISOString(),
    channels: [],
    categories: [],
    members: [
      { ...fallbackUsers["mesh-observer"] },
      { ...fallbackUsers["mesh-ops"] },
    ],
    roles: [],
    iconUrl: "https://api.dicebear.com/8.x/shapes/svg?seed=Observatory",
    description: "Analytics, dashboards, and health checks for every relay.",
    invites: [],
  },
  "server-trust-lab": {
    id: "server-trust-lab",
    name: "Trust Lab",
    owner_id: fallbackUsers["mesh-guild"].id,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    channels: [],
    categories: [],
    members: [
      { ...fallbackUsers["mesh-guild"] },
      { ...fallbackUsers["mesh-ops"] },
    ],
    roles: [],
    iconUrl: "https://api.dicebear.com/8.x/shapes/svg?seed=Trust",
    description: "Experimentation hub for scoring and identity systems.",
    invites: [],
  },
};

const fallbackInvites: ServerInviteSummary[] = [
  {
    id: "invite-relay-ops",
    server: {
      id: fallbackServers["server-relay-ops"].id,
      name: fallbackServers["server-relay-ops"].name,
      icon: fallbackServers["server-relay-ops"].iconUrl ?? "",
      description: fallbackServers["server-relay-ops"].description,
      memberCount: fallbackServers["server-relay-ops"].members.length,
      tags: ["operations", "recovery"],
      mutualFriends: 5,
      lastActiveAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      owner: { ...fallbackUsers["mesh-ops"] },
    },
    invitedBy: { ...fallbackUsers["mesh-ops"] },
    invitedAt: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
    note: "Need your insight on the adaptive routing rollout.",
  },
  {
    id: "invite-trust-lab",
    server: {
      id: fallbackServers["server-trust-lab"].id,
      name: fallbackServers["server-trust-lab"].name,
      icon: fallbackServers["server-trust-lab"].iconUrl ?? "",
      description: fallbackServers["server-trust-lab"].description,
      memberCount: fallbackServers["server-trust-lab"].members.length,
      tags: ["security", "research"],
      mutualFriends: 3,
      lastActiveAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      owner: { ...fallbackUsers["mesh-guild"] },
    },
    invitedBy: { ...fallbackUsers["mesh-guild"] },
    invitedAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    note: "We're vetting a new trust score heuristic.",
  },
];

const fallbackRecent: ServerSearchResult[] = [
  {
    server: {
      id: fallbackServers["server-observatory"].id,
      name: fallbackServers["server-observatory"].name,
      icon: fallbackServers["server-observatory"].iconUrl ?? "",
      description: fallbackServers["server-observatory"].description,
      memberCount: fallbackServers["server-observatory"].members.length,
      tags: ["analytics", "monitoring"],
      mutualFriends: 4,
      lastActiveAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      owner: { ...fallbackUsers["mesh-observer"] },
    },
    membership: "recent",
    note: "Reviewed outage timeline yesterday",
  },
];

function cloneUser(user: User): User {
  return { ...user };
}

function cloneServer(server: Server): Server {
  return {
    ...server,
    channels: server.channels.map((channel) => ({ ...channel })),
    categories: server.categories.map((category) => ({ ...category })),
    members: server.members.map((member) => ({ ...member })),
    roles: server.roles.map((role) => ({ ...role })),
    invites: server.invites?.map((invite) => ({ ...invite })) ?? [],
    emojis: server.emojis?.map((emoji) => ({ ...emoji })),
    stickers: server.stickers?.map((sticker) => ({ ...sticker })),
    widgetSettings: server.widgetSettings ? { ...server.widgetSettings } : null,
    auditLog: server.auditLog?.map((entry) => ({ ...entry })),
    relayParticipation: server.relayParticipation?.map((entry) => ({ ...entry })),
  };
}

function summarizeServer(server: Server): ServerSummary {
  return {
    id: server.id,
    name: server.name,
    icon: server.iconUrl ?? `https://api.dicebear.com/8.x/shapes/svg?seed=${server.id}`,
    description: server.description,
    memberCount: server.members.length,
    tags: server.invites?.length ? ["invites"] : undefined,
    mutualFriends: Math.round(Math.random() * 5),
    lastActiveAt: server.created_at,
    owner: cloneUser(
      fallbackUsers[server.owner_id] ?? {
        id: server.owner_id,
        name: `User-${server.owner_id.slice(0, 4)}`,
        avatar: `https://api.dicebear.com/8.x/bottts/svg?seed=${server.owner_id}`,
        online: false,
      },
    ),
  };
}

async function invokeOptional<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    const invoke = await getInvoke();
    if (!invoke) {
      return null;
    }
    return await invoke<T>(command, args);
  } catch (error) {
    console.warn(`Failed to invoke ${command}`, error);
    return null;
  }
}

function mapBackendInvite(invite: BackendServerInvite): ServerInviteSummary | null {
  if (!invite.server?.id) {
    return null;
  }

  const owner = fallbackUsers[invite.server.owner_id ?? "mesh-ops"] ?? {
    id: invite.server.owner_id ?? "owner-unknown",
    name:
      invite.server.owner_id?.slice(0, 4)
        ? `User-${invite.server.owner_id.slice(0, 4)}`
        : "Server Owner",
    avatar: `https://api.dicebear.com/8.x/bottts/svg?seed=${invite.server.owner_id ?? "owner"}`,
    online: false,
  };

  const serverSummary: ServerSummary = {
    id: invite.server.id,
    name: invite.server.name,
    icon:
      invite.server.icon && invite.server.icon.trim().length > 0
        ? invite.server.icon
        : `https://api.dicebear.com/8.x/shapes/svg?seed=${invite.server.id}`,
    description: invite.server.description ?? undefined,
    memberCount: invite.server.members ?? 0,
    tags: invite.server.tags ?? undefined,
    mutualFriends: invite.server.mutual_friends ?? undefined,
    lastActiveAt: invite.server.last_active_at ?? undefined,
    owner,
  };

  const invitedBy = invite.invited_by
    ? {
        id: invite.invited_by.id,
        name: invite.invited_by.username ?? `User-${invite.invited_by.id.slice(0, 4)}`,
        avatar:
          invite.invited_by.avatar && invite.invited_by.avatar.trim().length > 0
            ? invite.invited_by.avatar
            : `https://api.dicebear.com/8.x/bottts/svg?seed=${invite.invited_by.id}`,
        online: invite.invited_by.is_online ?? false,
      }
    : cloneUser(owner);

  return {
    id: invite.id,
    server: serverSummary,
    invitedBy,
    invitedAt: invite.invited_at ?? new Date().toISOString(),
    note: invite.note ?? undefined,
  };
}

function mapBackendSearch(result: BackendServerSearchResult): ServerSearchResult {
  const owner = fallbackUsers[result.owner_id ?? "mesh-ops"] ?? {
    id: result.owner_id ?? "owner-unknown",
    name:
      result.owner_id?.slice(0, 4)
        ? `User-${result.owner_id.slice(0, 4)}`
        : "Server Owner",
    avatar: `https://api.dicebear.com/8.x/bottts/svg?seed=${result.owner_id ?? "owner"}`,
    online: false,
  };

  let membership: ServerMembershipState = "none";
  const normalizedMembership = (result.membership ?? "none").toLowerCase();
  if (normalizedMembership.includes("joined")) {
    membership = "joined";
  } else if (normalizedMembership.includes("invite")) {
    membership = "invited";
  } else if (normalizedMembership.includes("recent")) {
    membership = "recent";
  }

  return {
    server: {
      id: result.id,
      name: result.name,
      icon:
        result.icon && result.icon.trim().length > 0
          ? result.icon
          : `https://api.dicebear.com/8.x/shapes/svg?seed=${result.id}`,
      description: result.description ?? undefined,
      memberCount: result.member_count ?? 0,
      tags: result.tags ?? undefined,
      mutualFriends: result.mutual_friends ?? undefined,
      lastActiveAt: result.last_active_at ?? undefined,
      owner,
    },
    membership,
    note: result.note ?? undefined,
  };
}

export async function listPendingServerInvites(): Promise<ServerInviteSummary[]> {
  const response = await invokeOptional<BackendServerInvite[]>(
    "list_pending_server_invites",
  );

  if (!response) {
    return fallbackInvites.map((invite) => ({
      ...invite,
      server: { ...invite.server, owner: cloneUser(invite.server.owner) },
      invitedBy: cloneUser(invite.invitedBy),
    }));
  }

  const mapped = response
    .map(mapBackendInvite)
    .filter((invite): invite is ServerInviteSummary => invite !== null);

  if (mapped.length === 0) {
    return fallbackInvites.map((invite) => ({
      ...invite,
      server: { ...invite.server, owner: cloneUser(invite.server.owner) },
      invitedBy: cloneUser(invite.invitedBy),
    }));
  }

  return mapped;
}

export async function listRecentServers(): Promise<ServerSearchResult[]> {
  const response = await invokeOptional<ServerSearchResult[]>(
    "list_recent_servers",
  );

  if (!response || response.length === 0) {
    return fallbackRecent.map((entry) => ({
      ...entry,
      server: { ...entry.server, owner: cloneUser(entry.server.owner) },
    }));
  }

  return response.map((entry) => ({
    ...entry,
    server: {
      ...entry.server,
      owner: cloneUser(entry.server.owner),
    },
  }));
}

export async function searchForServers(query: string): Promise<ServerSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const response = await invokeOptional<BackendServerSearchResult[]>(
    "search_servers",
    { query: trimmed },
  );

  if (!response) {
    return Object.values(fallbackServers)
      .filter((server) =>
        server.name.toLowerCase().includes(trimmed.toLowerCase()) ||
        server.id.toLowerCase().includes(trimmed.toLowerCase()),
      )
      .map((server) => ({
        server: summarizeServer(server),
        membership: "none",
        note: "Public directory result",
      }));
  }

  const mapped = response.map(mapBackendSearch);
  if (mapped.length === 0) {
    return Object.values(fallbackServers)
      .filter((server) =>
        server.name.toLowerCase().includes(trimmed.toLowerCase()) ||
        server.id.toLowerCase().includes(trimmed.toLowerCase()),
      )
      .map((server) => ({
        server: summarizeServer(server),
        membership: "none",
        note: "Public directory result",
      }));
  }

  return mapped;
}

export async function acceptServerInvite(invite: ServerInviteSummary): Promise<Server | null> {
  const response = await invokeOptional<Server>("accept_server_invite", {
    inviteId: invite.id,
    invite_id: invite.id,
  });

  if (!response) {
    const server = fallbackServers[invite.server.id];
    return server ? cloneServer(server) : null;
  }

  return cloneServer(response);
}

export async function declineServerInvite(inviteId: string): Promise<boolean> {
  const response = await invokeOptional<{ success: boolean }>("decline_server_invite", {
    inviteId,
    invite_id: inviteId,
  });

  if (!response) {
    return true;
  }

  return response.success !== false;
}

export async function joinPublicServer(serverId: string): Promise<Server | null> {
  const response = await invokeOptional<Server>("join_public_server", {
    serverId,
    server_id: serverId,
  });

  if (!response) {
    const fallback = fallbackServers[serverId];
    return fallback ? cloneServer(fallback) : null;
  }

  return cloneServer(response);
}

export function __setServerDiscoveryFallbackStateForTests(options: {
  invites?: ServerInviteSummary[];
} = {}) {
  if (options.invites) {
    fallbackInvites.splice(0, fallbackInvites.length, ...options.invites);
  }
}
