import { writable, type Readable, get } from "svelte/store";
import type { Friend, FriendStatus } from "$lib/features/friends/models/Friend";
import type { User } from "$lib/features/auth/models/User";
import { getInvoke } from "$services/tauri";
import type { InvokeFn } from "$services/tauri";
import { userStore } from "$lib/stores/userStore";
import { userCache } from "$lib/utils/cache";
import { spamClassifier } from "$lib/features/security/spamClassifier";
import { mutedFriendsStore } from "./mutedFriendsStore";
import { toasts } from "$lib/stores/ToastStore";
import type {
  FriendshipBackend,
  FriendshipCounterpart,
} from "../models/friendship";

interface FriendStoreState {
  friends: Friend[];
  loading: boolean;
}

interface FriendStore extends Readable<FriendStoreState> {
  handleFriendsUpdate: (friends: Friend[]) => void;
  updateFriendPresence: (
    userId: string,
    presence: {
      isOnline: boolean;
      statusMessage?: string | null;
      location?: string | null;
    },
  ) => void;
  addFriend: (friend: Friend | (Partial<Friend> & { id: string })) => void;
  removeFriend: (friendId: string) => void;
  initialize: () => Promise<void>;
  markFriendAsTrusted: (friendId: string) => void;
  markFriendAsSpam: (
    friendId: string,
    options?: { score?: number; reasons?: string[] },
  ) => void;
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
  const statusMessageRaw =
    typeof friend.statusMessage === "string"
      ? friend.statusMessage
      : typeof (friend as Record<string, unknown>).status_message === "string"
        ? ((friend as Record<string, unknown>).status_message as string)
        : undefined;
  const trimmedStatusMessage = statusMessageRaw?.trim?.() ?? "";
  const normalizedStatusMessage =
    trimmedStatusMessage.length > 0 ? trimmedStatusMessage : null;
  const locationRaw =
    typeof friend.location === "string"
      ? friend.location
      : typeof (friend as Record<string, unknown>).location === "string"
        ? ((friend as Record<string, unknown>).location as string)
        : undefined;
  const trimmedLocation = locationRaw?.trim?.() ?? "";
  const normalizedLocation =
    trimmedLocation.length > 0 ? trimmedLocation : null;

  return {
    id: friend.id,
    name,
    avatar: friend.avatar ?? FALLBACK_AVATAR(friend.id),
    online: friend.online ?? false,
    publicKey: friend.publicKey,
    bio: friend.bio,
    tag: friend.tag,
    statusMessage: normalizedStatusMessage,
    location: normalizedLocation,
    status,
    timestamp: friend.timestamp ?? new Date().toISOString(),
    messages: friend.messages ?? [],
    lastMessage: friend.lastMessage,
    isFriend: friend.isFriend,
    isPinned: friend.isPinned,
    friendshipId: friend.friendshipId,
    relationshipStatus: relationshipStatus ?? status,
    spamScore: friend.spamScore,
    isSpamFlagged: friend.isSpamFlagged ?? false,
    spamReasons: friend.spamReasons,
    spamMuted: friend.spamMuted ?? false,
    spamDecision: friend.spamDecision,
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

  const baseUser = buildCounterpartUser(counterpart, counterpartId);

  userCache.set(baseUser.id, baseUser);

  return normalizeFriend({
    ...baseUser,
    friendshipId: friendship.id,
    relationshipStatus: friendship.status,
    messages: [],
    timestamp: new Date().toISOString(),
  });
}

function buildCounterpartUser(
  counterpart: FriendshipCounterpart | null | undefined,
  counterpartId: string,
): User {
  const nameSource = counterpart?.name ?? counterpart?.username ?? "";
  const trimmedName = nameSource?.trim?.() ?? "";
  const name =
    trimmedName.length > 0 ? trimmedName : `User-${counterpartId.slice(0, 4)}`;

  const avatarSource = counterpart?.avatar ?? "";
  const trimmedAvatar = avatarSource?.trim?.() ?? "";
  const avatar =
    trimmedAvatar.length > 0 ? trimmedAvatar : FALLBACK_AVATAR(counterpartId);

  const statusMessageSource =
    counterpart?.statusMessage ?? counterpart?.status_message ?? null;
  const trimmedStatusMessage = statusMessageSource?.trim?.() ?? "";
  const statusMessage =
    trimmedStatusMessage.length > 0 ? trimmedStatusMessage : null;

  const locationSource = counterpart?.location ?? null;
  const trimmedLocation = locationSource?.trim?.() ?? "";
  const location =
    trimmedLocation.length > 0 ? trimmedLocation : null;

  const online =
    counterpart?.online ??
    counterpart?.is_online ??
    false;

  const publicKey =
    counterpart?.publicKey ??
    counterpart?.public_key ??
    undefined;

  return {
    id: counterpartId,
    name,
    avatar,
    online,
    publicKey,
    bio: counterpart?.bio ?? undefined,
    tag: counterpart?.tag ?? undefined,
    statusMessage,
    location,
  };
}

function buildSpamTextForFriend(friend: Friend): string {
  const parts: string[] = [];
  if (friend.name) parts.push(friend.name);
  if (friend.bio) parts.push(friend.bio);
  if (friend.tag) parts.push(friend.tag);
  if (friend.lastMessage) parts.push(friend.lastMessage);
  if (friend.relationshipStatus) parts.push(friend.relationshipStatus);

  const seen = new Set<string>();
  const normalized = parts
    .map((value) => value?.toString?.().trim() ?? "")
    .filter((value) => value.length > 0);
  const deduped: string[] = [];
  for (const value of normalized) {
    const lower = value.toLowerCase();
    if (!seen.has(lower)) {
      deduped.push(value);
      seen.add(lower);
    }
  }

  return deduped.join(" ");
}

export function createFriendStore(): FriendStore {
  const { subscribe, set, update } = writable<FriendStoreState>({
    friends: [],
    loading: true,
  });

  type SpamAnnotationOptions = {
    invokeFn?: InvokeFn | null;
    currentUserId?: string | null;
  };

  const evaluateFriendSpam = async (
    friend: Friend,
    options: SpamAnnotationOptions,
  ): Promise<Friend> => {
    const manualDecision = friend.spamDecision;
    const currentlyMuted = mutedFriendsStore.isMuted(friend.id);

    if (manualDecision === "allowed") {
      return normalizeFriend({
        ...friend,
        isSpamFlagged: false,
        spamMuted: currentlyMuted,
        spamDecision: "allowed",
      });
    }

    const textForModel = buildSpamTextForFriend(friend);
    if (textForModel.length === 0) {
      const fallbackDecision =
        manualDecision ?? (currentlyMuted ? "muted" : undefined);
      return normalizeFriend({
        ...friend,
        isSpamFlagged: false,
        spamMuted: currentlyMuted,
        spamDecision: fallbackDecision,
      });
    }

    try {
      const result = await spamClassifier.scoreText(textForModel, {
        context: "friend-request",
        subjectId: friend.id,
      });

      let spamDecision = manualDecision;
      let spamMuted = currentlyMuted;

      if (result.autoMuted && !currentlyMuted) {
        mutedFriendsStore.mute(friend.id);
        spamMuted = true;
        spamDecision = "auto-muted";
        if (
          options.invokeFn &&
          options.currentUserId &&
          options.currentUserId !== friend.id
        ) {
          try {
            await options.invokeFn("mute_user", {
              current_user_id: options.currentUserId,
              target_user_id: friend.id,
              muted: true,
              spam_score: result.score,
            });
          } catch (error) {
            console.warn("Failed to log auto mute event", error);
          }
        }
      } else if (currentlyMuted && !spamDecision) {
        spamDecision = "muted";
      } else if (result.flagged && !spamDecision) {
        spamDecision = "flagged";
      }

      return normalizeFriend({
        ...friend,
        spamScore: result.score,
        isSpamFlagged: result.flagged,
        spamReasons: result.reasons,
        spamMuted,
        spamDecision,
      });
    } catch (error) {
      console.warn("Failed to evaluate friend for spam", error);
      return normalizeFriend({
        ...friend,
        spamMuted: currentlyMuted,
      });
    }
  };

  const applySpamAnnotations = async (
    friendsToAnnotate: Friend[],
    options: SpamAnnotationOptions = {},
  ) => {
    if (!friendsToAnnotate.length) {
      return;
    }

    const currentUserId =
      options.currentUserId ?? get(userStore).me?.id ?? null;

    let invokeFn = options.invokeFn;
    if (invokeFn === undefined) {
      try {
        invokeFn = await getInvoke();
      } catch (error) {
        console.warn("Failed to obtain Tauri invoke handle", error);
        invokeFn = null;
      }
    }

    const annotated = await Promise.all(
      friendsToAnnotate.map((friend) =>
        evaluateFriendSpam(friend, { invokeFn, currentUserId }),
      ),
    );

    const annotatedById = new Map(
      annotated.map((friend) => [friend.id, friend]),
    );

    update((state) => ({
      ...state,
      friends: state.friends.map(
        (existing) => annotatedById.get(existing.id) ?? existing,
      ),
    }));
  };

  const handleFriendsUpdate = (updatedFriends: Friend[]) => {
    const normalized = updatedFriends
      .filter((friend): friend is Friend & { id: string } =>
        Boolean(friend?.id),
      )
      .map((friend) => normalizeFriend(friend));
    set({ friends: normalized, loading: false });
    void applySpamAnnotations(normalized);
  };

  const updateFriendPresence = (
    userId: string,
    presence: {
      isOnline: boolean;
      statusMessage?: string | null;
      location?: string | null;
    },
  ) => {
    update((s) => ({
      ...s,
      friends: s.friends.map((friend) =>
        friend.id === userId
          ? normalizeFriend({
              ...friend,
              online: presence.isOnline,
              statusMessage:
                presence.statusMessage !== undefined
                  ? presence.statusMessage
                  : (friend.statusMessage ?? null),
              location:
                presence.location !== undefined
                  ? presence.location
                  : (friend.location ?? null),
              timestamp: friend.timestamp,
              relationshipStatus: friend.relationshipStatus,
              friendshipId: friend.friendshipId,
              spamScore: friend.spamScore,
              isSpamFlagged: friend.isSpamFlagged,
              spamReasons: friend.spamReasons,
              spamMuted: friend.spamMuted,
              spamDecision: friend.spamDecision,
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
    void applySpamAnnotations([normalized]);
  };

  const removeFriend = (friendId: string) => {
    update((s) => ({
      ...s,
      friends: s.friends.filter((f) => f.id !== friendId),
    }));
  };

  const markFriendAsTrusted = (friendId: string) => {
    if (!friendId) return;
    update((s) => ({
      ...s,
      friends: s.friends.map((friend) =>
        friend.id === friendId
          ? normalizeFriend({
              ...friend,
              isSpamFlagged: false,
              spamMuted: false,
              spamDecision: "allowed",
            })
          : friend,
      ),
    }));
  };

  const markFriendAsSpam = (
    friendId: string,
    options: { score?: number; reasons?: string[] } = {},
  ) => {
    if (!friendId) return;
    update((s) => ({
      ...s,
      friends: s.friends.map((friend) =>
        friend.id === friendId
          ? normalizeFriend({
              ...friend,
              isSpamFlagged: true,
              spamMuted: true,
              spamDecision:
                friend.spamDecision === "allowed"
                  ? "muted"
                  : (friend.spamDecision ?? "muted"),
              spamScore: options.score ?? friend.spamScore,
              spamReasons: options.reasons ?? friend.spamReasons,
            })
          : friend,
      ),
    }));
  };

  const initialize = async () => {
    update((s) => ({ ...s, loading: true }));

    try {
      const invokeFn: InvokeFn | null = await getInvoke();
      if (!invokeFn) {
        console.warn("Tauri invoke not available, cannot fetch friendships.");
        toasts.showErrorToast(
          "Unable to fetch friendships because the backend is unavailable.",
        );
        update((s) => ({ ...s, loading: false }));
        return;
      }

      const currentUser = get(userStore).me;
      if (!currentUser) {
        console.warn("User not loaded, cannot fetch friendships.");
        toasts.showErrorToast(
          "Unable to fetch friendships because the user is not loaded.",
        );
        update((s) => ({ ...s, loading: false }));
        return;
      }

      const friendships = await invokeFn<FriendshipBackend[]>(
        "get_friendships",
        {
          current_user_id: currentUser.id,
          currentUserId: currentUser.id,
        },
      );
      const friends = friendships
        .map((fs) => mapFriendshipToFriend(fs, currentUser.id))
        .filter((friend): friend is Friend => friend !== null);

      set({ friends, loading: false });
      await applySpamAnnotations(friends, {
        invokeFn,
        currentUserId: currentUser.id,
      });
    } catch (error) {
      console.error("Failed to fetch friendships:", error);
      toasts.showErrorToast("Failed to fetch friendships. Please try again.");
      update((s) => ({ ...s, loading: false }));
    }
  };

  return {
    subscribe,
    handleFriendsUpdate,
    updateFriendPresence,
    addFriend,
    removeFriend,
    markFriendAsTrusted,
    markFriendAsSpam,
    initialize,
  };
}

export const friendStore = createFriendStore();
