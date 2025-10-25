import { writable, type Readable, get } from "svelte/store";
import type { Friend, FriendStatus } from "$lib/features/friends/models/Friend";
import type { User } from "$lib/features/auth/models/User";
import { getInvoke } from "$services/tauri";
import type { InvokeFn } from "$services/tauri";
import { userStore } from "$lib/stores/userStore";
import { userCache } from "$lib/utils/cache";

type FriendshipBackend = {
  friendship: {
    id: string;
    user_a_id: string;
    user_b_id: string;
    status: string;
  };
  counterpart?: {
    id: string;
    username?: string | null;
    avatar?: string | null;
    is_online?: boolean | null;
    public_key?: string | null;
    bio?: string | null;
    tag?: string | null;
  } | null;
};

interface FriendStoreState {
  friends: Friend[];
  loading: boolean;
}

interface FriendStore extends Readable<FriendStoreState> {
  handleFriendsUpdate: (friends: Friend[]) => void;
  updateFriendPresence: (userId: string, isOnline: boolean) => void;
  addFriend: (friend: Friend | (Partial<Friend> & { id: string })) => void;
  removeFriend: (friendId: string) => void;
  initialize: () => Promise<void>;
}

const FALLBACK_AVATAR = (id: string) =>
  "https://api.dicebear.com/8.x/bottts-neutral/svg?seed=" + id;

function deriveFriendStatus(
  relationshipStatus: string | undefined,
  currentStatus: string | undefined,
  isOnline: boolean | undefined,
): FriendStatus {
  const relationship = relationshipStatus?.toLowerCase?.() ?? "";
  const status = currentStatus?.toLowerCase?.() ?? "";

  if (relationship === "pending" || status === "pending") {
    return "Pending";
  }

  if (relationship.startsWith("blocked") || status === "blocked") {
    return "Blocked";
  }

  if (status === "online" || relationship === "online") {
    return "Online";
  }

  if (status === "offline" || relationship === "offline") {
    return "Offline";
  }

  if (
    relationship === "accepted" ||
    relationship === "friends" ||
    relationship === ""
  ) {
    return isOnline ? "Online" : "Offline";
  }

  return isOnline ? "Online" : "Offline";
}

function normalizeFriend(friend: Partial<Friend> & { id: string }): Friend {
  const providedStatus =
    typeof friend.status === "string" ? friend.status : undefined;
  const relationshipStatus = friend.relationshipStatus ?? providedStatus;
  const status = deriveFriendStatus(
    relationshipStatus,
    providedStatus,
    friend.online,
  );
  const fallbackName = "User-" + friend.id.slice(0, 4);
  const name =
    friend.name && friend.name.trim().length > 0 ? friend.name : fallbackName;

  return {
    id: friend.id,
    name,
    avatar: friend.avatar ?? FALLBACK_AVATAR(friend.id),
    online: friend.online ?? false,
    publicKey: friend.publicKey,
    bio: friend.bio,
    tag: friend.tag,
    status,
    timestamp: friend.timestamp ?? new Date().toISOString(),
    messages: friend.messages ?? [],
    lastMessage: friend.lastMessage,
    isFriend: friend.isFriend,
    isPinned: friend.isPinned,
    friendshipId: friend.friendshipId,
    relationshipStatus: relationshipStatus ?? status,
  };
}

function mapFriendshipToFriend(
  record: FriendshipBackend,
  currentUserId: string,
): Friend | null {
  const { friendship, counterpart } = record;

  const counterpartId =
    counterpart?.id ??
    (friendship.user_a_id === currentUserId
      ? friendship.user_b_id
      : friendship.user_a_id);

  if (!counterpartId) {
    return null;
  }

  const nameFromBackend = counterpart?.username ?? "";
  const trimmedName = nameFromBackend.trim();
  const name =
    trimmedName.length > 0
      ? trimmedName
      : `User-${counterpartId.slice(0, 4)}`;

  const avatarFromBackend = counterpart?.avatar ?? "";
  const trimmedAvatar = avatarFromBackend.trim();
  const avatar =
    trimmedAvatar.length > 0
      ? trimmedAvatar
      : FALLBACK_AVATAR(counterpartId);

  const baseUser: User = {
    id: counterpartId,
    name,
    avatar,
    online: counterpart?.is_online ?? false,
    publicKey: counterpart?.public_key ?? undefined,
    bio: counterpart?.bio ?? undefined,
    tag: counterpart?.tag ?? undefined,
  };

  userCache.set(baseUser.id, baseUser);

  return normalizeFriend({
    ...baseUser,
    friendshipId: friendship.id,
    relationshipStatus: friendship.status,
    messages: [],
    timestamp: new Date().toISOString(),
  });
}

export function createFriendStore(): FriendStore {
  const { subscribe, set, update } = writable<FriendStoreState>({
    friends: [],
    loading: true,
  });

  const handleFriendsUpdate = (updatedFriends: Friend[]) => {
    const normalized = updatedFriends
      .filter((friend): friend is Friend & { id: string } =>
        Boolean(friend?.id),
      )
      .map((friend) => normalizeFriend(friend));
    set({ friends: normalized, loading: false });
  };

  const updateFriendPresence = (userId: string, isOnline: boolean) => {
    update((s) => ({
      ...s,
      friends: s.friends.map((friend) =>
        friend.id === userId
          ? normalizeFriend({
              ...friend,
              online: isOnline,
              timestamp: friend.timestamp,
              relationshipStatus: friend.relationshipStatus,
              friendshipId: friend.friendshipId,
            })
          : friend,
      ),
    }));
  };

  const addFriend = (friend: Friend | (Partial<Friend> & { id: string })) => {
    const normalized = normalizeFriend(friend);
    update((s) => {
      const next = [...s.friends];
      const index = next.findIndex((existing) => existing.id === normalized.id);
      if (index >= 0) {
        next[index] = normalized;
      } else {
        next.push(normalized);
      }
      return { ...s, friends: next };
    });
  };

  const removeFriend = (friendId: string) => {
    update((s) => ({
      ...s,
      friends: s.friends.filter((f) => f.id !== friendId),
    }));
  };

  const initialize = async () => {
    update((s) => ({ ...s, loading: true }));

    try {
      const invokeFn: InvokeFn | null = await getInvoke();
      if (!invokeFn) {
        console.warn("Tauri invoke not available, cannot fetch friendships.");
        set({ friends: [], loading: false });
        return;
      }

      const currentUser = get(userStore).me;
      if (!currentUser) {
        console.warn("User not loaded, cannot fetch friendships.");
        set({ friends: [], loading: false });
        return;
      }

      const friendships = await invokeFn<FriendshipBackend[]>(
        "get_friendships",
        { current_user_id: currentUser.id },
      );
      const friends = friendships
        .map((fs) => mapFriendshipToFriend(fs, currentUser.id))
        .filter((friend): friend is Friend => friend !== null);

      set({ friends, loading: false });
    } catch (error) {
      console.error("Failed to fetch friendships:", error);
      set({ friends: [], loading: false });
    }
  };

  return {
    subscribe,
    handleFriendsUpdate,
    updateFriendPresence,
    addFriend,
    removeFriend,
    initialize,
  };
}

export const friendStore = createFriendStore();
