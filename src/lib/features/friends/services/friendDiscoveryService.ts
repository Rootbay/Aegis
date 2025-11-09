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
    public_key?: string | null;
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
  public_key?: string | null;
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

type BackendUserProfile = {
  id: string;
  username?: string | null;
  avatar: string;
  is_online?: boolean | null;
  public_key?: string | null;
  bio?: string | null;
  tag?: string | null;
  status_message?: string | null;
  location?: string | null;
};

type BackendFriendPeer = {
  id: string;
  user: BackendUserProfile;
  last_interaction_at: string;
  context?: string | null;
  interaction_count?: number | null;
};

type BackendFriendshipWithProfile = {
  friendship: {
    id: string;
    user_a_id: string;
    user_b_id: string;
    status: string;
    created_at: string;
    updated_at: string;
  };
  counterpart?: BackendUserProfile | null;
};

function normalizeUser(partial: Partial<User> & { id: string }): User {
  const record = partial as Record<string, unknown>;
  const usernameRaw =
    typeof record.username === "string" ? (record.username as string) : undefined;
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
    name:
      partial.name ??
      usernameRaw ??
      `User-${partial.id.slice(0, 4)}`,
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
    publicKey: invite.from_user.public_key ?? undefined,
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
      publicKey: result.public_key ?? undefined,
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
    return [];
  }

  return response
    .map(mapBackendInvite)
    .filter((invite): invite is FriendInvite => invite !== null);
}

export async function listRecentFriendPeers(): Promise<FriendPeer[]> {
  const response = await invokeOptional<BackendFriendPeer[]>(
    "list_recent_friend_peers",
  );
  if (!response) {
    return [];
  }

  return response.map((peer) => ({
    id: peer.id,
    user: normalizeUser({
      id: peer.user.id,
      name: peer.user.username ?? undefined,
      avatar: peer.user.avatar,
      online: peer.user.is_online ?? undefined,
      statusMessage: peer.user.status_message ?? undefined,
      location: peer.user.location ?? undefined,
      bio: peer.user.bio ?? undefined,
      tag: peer.user.tag ?? undefined,
      publicKey: peer.user.public_key ?? undefined,
    }),
    lastInteractionAt: peer.last_interaction_at,
    context: peer.context ?? undefined,
    interactionCount: peer.interaction_count ?? undefined,
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
    return [];
  }

  return response.map(mapBackendSearch);
}

export async function acceptFriendInvite(invite: FriendInvite): Promise<Friend | null> {
  const response = await invokeOptional<BackendFriendshipWithProfile>(
    "accept_friend_invite",
    { inviteId: invite.id },
  );

  if (!response?.friendship || !response.counterpart) {
    return null;
  }

  const normalizedUser = normalizeUser({
    id: response.counterpart.id,
    name: response.counterpart.username ?? undefined,
    avatar: response.counterpart.avatar ?? undefined,
    online: response.counterpart.is_online ?? undefined,
    statusMessage: response.counterpart.status_message ?? undefined,
    location: response.counterpart.location ?? undefined,
    bio: response.counterpart.bio ?? undefined,
    tag: response.counterpart.tag ?? undefined,
    publicKey: response.counterpart.public_key ?? undefined,
  });

  return {
    ...createFriendFromUser(normalizedUser),
    friendshipId: response.friendship.id,
    relationshipStatus: response.friendship.status,
  };
}

export async function declineFriendInvite(inviteId: string): Promise<boolean> {
  await invokeOptional<void>("decline_friend_invite", { inviteId });
  return true;
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
    return true;
  }

  return response.success !== false;
}
