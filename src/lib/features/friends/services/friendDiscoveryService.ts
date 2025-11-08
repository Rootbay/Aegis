import { getInvoke } from "$services/tauri";
import type { Friend } from "../models/Friend";
import type { User } from "$lib/features/auth/models/User";

export type FriendInviteRelationship =
  | "incoming"
  | "outgoing"
  | "friend"
  | "recent"
  | "none";

export interface FriendInvite {
  id: string;
  from: User;
  message?: string;
  mutualFriends?: number;
  receivedAt: string;
}

export interface FriendPeer {
  id: string;
  user: User;
  lastInteractionAt: string;
  context?: string;
  interactionCount?: number;
}

export interface FriendSearchResult {
  user: User;
  relationship: FriendInviteRelationship;
  note?: string;
  mutualFriends?: number;
  lastInteractionAt?: string;
}

type BackendFriendInvite = {
  id: string;
  from_user?: {
    id: string;
    username?: string | null;
    avatar?: string | null;
    is_online?: boolean | null;
    status_message?: string | null;
    location?: string | null;
    bio?: string | null;
    tag?: string | null;
  } | null;
  message?: string | null;
  mutual_friends?: number | null;
  received_at?: string | null;
};

type BackendFriendSearchResult = {
  id: string;
  username?: string | null;
  avatar?: string | null;
  is_online?: boolean | null;
  status?: string | null;
  status_message?: string | null;
  location?: string | null;
  bio?: string | null;
  tag?: string | null;
  relationship?: string | null;
  mutual_friends?: number | null;
  last_interaction_at?: string | null;
  note?: string | null;
};

const fallbackUsers: User[] = [
  {
    id: "mesh-1001",
    name: "Kai Nakamura",
    avatar: "https://api.dicebear.com/8.x/bottts/svg?seed=Kai",
    online: true,
    statusMessage: "Deploying new mesh relays",
    location: "Tokyo",
    tag: "kai.n",
  },
  {
    id: "mesh-1002",
    name: "Lena Ortiz",
    avatar: "https://api.dicebear.com/8.x/bottts/svg?seed=Lena",
    online: false,
    statusMessage: "On-call for the latency guild",
    location: "Chicago",
    tag: "lena.o",
  },
  {
    id: "mesh-1003",
    name: "Malik Okoye",
    avatar: "https://api.dicebear.com/8.x/bottts/svg?seed=Malik",
    online: true,
    statusMessage: "Optimising path scoring",
    location: "Lagos",
    tag: "malik.o",
  },
  {
    id: "mesh-1004",
    name: "Nova Chen",
    avatar: "https://api.dicebear.com/8.x/bottts/svg?seed=Nova",
    online: false,
    statusMessage: "Mesh observability updates",
    location: "Vancouver",
    tag: "nova.c",
  },
  {
    id: "mesh-1005",
    name: "Artemis Reed",
    avatar: "https://api.dicebear.com/8.x/bottts/svg?seed=Artemis",
    online: true,
    statusMessage: "Documenting trust scores",
    location: "Lisbon",
    tag: "artemis",
  },
];

const fallbackInvites: FriendInvite[] = [
  {
    id: "invite-malik",
    from: { ...fallbackUsers[2] },
    message: "Saw your post about adaptive routing—let's connect!",
    mutualFriends: 6,
    receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
  },
  {
    id: "invite-lena",
    from: { ...fallbackUsers[1] },
    message: "Coordinating the latency guild sync this week.",
    mutualFriends: 2,
    receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
  },
];

const fallbackPeers: FriendPeer[] = [
  {
    id: "peer-kai",
    user: { ...fallbackUsers[0] },
    lastInteractionAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    context: "Shared diagnostics in #mesh-health",
    interactionCount: 12,
  },
  {
    id: "peer-nova",
    user: { ...fallbackUsers[3] },
    lastInteractionAt: new Date(Date.now() - 1000 * 60 * 60 * 13).toISOString(),
    context: "Reviewed incident postmortem together",
    interactionCount: 5,
  },
];

const fallbackFriendIds = new Set(["mesh-1005"]);

function normalizeUser(partial: Partial<User> & { id: string }): User {
  const record = partial as Record<string, unknown>;
  const statusMessageRaw =
    partial.statusMessage ??
    (typeof record.status_message === "string" || record.status_message === null
      ? (record.status_message as string | null)
      : null);
  const locationRaw =
    partial.location ??
    (typeof record.location === "string" || record.location === null
      ? (record.location as string | null)
      : null);

  return {
    id: partial.id,
    name: partial.name ?? `User-${partial.id.slice(0, 4)}`,
    avatar:
      partial.avatar && partial.avatar.trim().length > 0
        ? partial.avatar
        : `https://api.dicebear.com/8.x/bottts/svg?seed=${partial.id}`,
    online: partial.online ?? false,
    publicKey: partial.publicKey,
    bannerUrl: partial.bannerUrl,
    bio: partial.bio,
    tag: partial.tag ?? (typeof record.tag === "string" ? (record.tag as string) : undefined),
    roles: partial.roles,
    role_ids: partial.role_ids,
    roleIds: partial.roleIds,
    statusMessage: statusMessageRaw ?? null,
    location: locationRaw ?? null,
    isIgnored: partial.isIgnored ?? false,
  };
}

function mapBackendInvite(invite: BackendFriendInvite): FriendInvite | null {
  if (!invite.from_user?.id) {
    return null;
  }

  const user = normalizeUser({
    id: invite.from_user.id,
    name: invite.from_user.username ?? undefined,
    avatar: invite.from_user.avatar ?? undefined,
    online: invite.from_user.is_online ?? undefined,
    statusMessage: invite.from_user.status_message ?? undefined,
    location: invite.from_user.location ?? undefined,
    bio: invite.from_user.bio ?? undefined,
    tag: invite.from_user.tag ?? undefined,
  });

  return {
    id: invite.id,
    from: user,
    message: invite.message ?? undefined,
    mutualFriends: invite.mutual_friends ?? undefined,
    receivedAt:
      invite.received_at ?? new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  };
}

function mapBackendSearch(result: BackendFriendSearchResult): FriendSearchResult {
  const relationship = (result.relationship ?? "none").toLowerCase();
  let mappedRelationship: FriendInviteRelationship = "none";

  if (relationship.includes("incoming")) {
    mappedRelationship = "incoming";
  } else if (relationship.includes("outgoing") || relationship.includes("pending")) {
    mappedRelationship = "outgoing";
  } else if (relationship.includes("friend")) {
    mappedRelationship = "friend";
  } else if (relationship.includes("recent")) {
    mappedRelationship = "recent";
  }

  return {
    user: normalizeUser({
      id: result.id,
      name: result.username ?? undefined,
      avatar: result.avatar ?? undefined,
      online: result.is_online ?? undefined,
      statusMessage: result.status_message ?? undefined,
      location: result.location ?? undefined,
      bio: result.bio ?? undefined,
      tag: result.tag ?? undefined,
    }),
    relationship: mappedRelationship,
    note: result.note ?? undefined,
    mutualFriends: result.mutual_friends ?? undefined,
    lastInteractionAt: result.last_interaction_at ?? undefined,
  };
}

function createFriendFromUser(user: User): Friend {
  return {
    ...user,
    status: user.online ? "Online" : "Offline",
    timestamp: new Date().toISOString(),
    messages: [],
    lastMessage: undefined,
    isFriend: true,
    isPinned: false,
    friendshipId: undefined,
    relationshipStatus: "accepted",
  };
}

function buildFallbackSearchResults(query: string): FriendSearchResult[] {
  const normalizedQuery = query.toLowerCase();
  const pendingIds = new Set(fallbackInvites.map((invite) => invite.from.id));
  const results = fallbackUsers
    .filter((user) =>
      user.name.toLowerCase().includes(normalizedQuery) ||
      user.id.toLowerCase().includes(normalizedQuery) ||
      (user.tag ?? "").toLowerCase().includes(normalizedQuery),
    )
    .map((user) => {
      let relationship: FriendInviteRelationship = "none";
      if (pendingIds.has(user.id)) {
        relationship = "incoming";
      } else if (fallbackFriendIds.has(user.id)) {
        relationship = "friend";
      } else if (fallbackPeers.some((peer) => peer.user.id === user.id)) {
        relationship = "recent";
      }

      return {
        user: { ...user },
        relationship,
        note:
          relationship === "recent"
            ? "Recently collaborated"
            : relationship === "incoming"
              ? "Sent you an invite"
              : undefined,
        mutualFriends: Math.max(0, Math.round(Math.random() * 5)),
        lastInteractionAt:
          fallbackPeers.find((peer) => peer.user.id === user.id)?.lastInteractionAt,
      } satisfies FriendSearchResult;
    });

  return results;
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

export async function listPendingFriendInvites(): Promise<FriendInvite[]> {
  const response = await invokeOptional<BackendFriendInvite[]>(
    "list_pending_friend_invites",
  );
  if (!response) {
    return fallbackInvites.map((invite) => ({ ...invite, from: { ...invite.from } }));
  }

  const mapped = response
    .map(mapBackendInvite)
    .filter((invite): invite is FriendInvite => invite !== null);

  if (mapped.length === 0) {
    return fallbackInvites.map((invite) => ({ ...invite, from: { ...invite.from } }));
  }

  return mapped;
}

export async function listRecentFriendPeers(): Promise<FriendPeer[]> {
  const response = await invokeOptional<FriendPeer[]>("list_recent_friend_peers");
  if (!response || response.length === 0) {
    return fallbackPeers.map((peer) => ({ ...peer, user: { ...peer.user } }));
  }

  return response.map((peer) => ({
    ...peer,
    user: normalizeUser(peer.user),
  }));
}

export async function searchForUsers(query: string): Promise<FriendSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const response = await invokeOptional<BackendFriendSearchResult[]>(
    "search_users",
    { query: trimmed },
  );

  if (!response) {
    return buildFallbackSearchResults(trimmed);
  }

  const mapped = response.map(mapBackendSearch);
  if (mapped.length === 0) {
    return buildFallbackSearchResults(trimmed);
  }
  return mapped;
}

export async function acceptFriendInvite(invite: FriendInvite): Promise<Friend | null> {
  const response = await invokeOptional<Friend>("accept_friend_invite", {
    inviteId: invite.id,
    invite_id: invite.id,
  });

  if (!response) {
    return createFriendFromUser(invite.from);
  }

  return {
    ...createFriendFromUser(response),
    ...response,
  };
}

export async function declineFriendInvite(inviteId: string): Promise<boolean> {
  const response = await invokeOptional<{ success: boolean }>("decline_friend_invite", {
    inviteId,
    invite_id: inviteId,
  });

  if (!response) {
    return true;
  }

  return response.success !== false;
}

export async function sendFriendRequest(
  targetUserId: string,
  currentUserId?: string,
): Promise<boolean> {
  const trimmed = targetUserId.trim();
  if (!trimmed) {
    return false;
  }

  const response = await invokeOptional<{ success: boolean }>("send_friend_request", {
    target_user_id: trimmed,
    targetUserId: trimmed,
    current_user_id: currentUserId,
    currentUserId,
  });

  if (!response) {
    const alreadyInvited = fallbackInvites.some((invite) => invite.from.id === trimmed);
    if (alreadyInvited) {
      return false;
    }
    return true;
  }

  return response.success !== false;
}

export function __setFriendDiscoveryFallbackStateForTests(options: {
  invites?: FriendInvite[];
  peers?: FriendPeer[];
} = {}) {
  if (options.invites) {
    fallbackInvites.splice(0, fallbackInvites.length, ...options.invites);
  }
  if (options.peers) {
    fallbackPeers.splice(0, fallbackPeers.length, ...options.peers);
  }
}
